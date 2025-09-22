// middleware.ts
import { NextRequest, NextResponse } from "next/server";

/** ---- helpers lama dari kamu ---- */
function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

function decodeBase64Web(b64: string) {
  try {
    return atob(b64);
  } catch {
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return "";
    }
  }
}

function readAccessToken(req: NextRequest): string | null {
  const c = req.cookies;

  // cookie custom dari /api/auth/set
  const raw = c.get("access_token")?.value;
  if (raw) return raw;

  // variasi supabase browser
  const alt =
    c.get("sb-access-token")?.value || c.get("supabase-access-token")?.value;
  if (alt) return alt;

  // cookie auth-helpers: sb-<ref>-auth-token
  const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (ref) {
    const name = `sb-${ref}-auth-token`;
    const v = c.get(name)?.value;
    if (v) {
      let s = v;
      if (s.startsWith("base64-")) s = decodeBase64Web(s.slice(7));
      try {
        const obj = JSON.parse(s);
        if (obj?.access_token) return obj.access_token as string;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function decodeJwtPayload(token: string): any | null {
  try {
    const [, payload] = token.split(".");
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** ---- helper baru ---- */
function isJwtExpired(token: string, skewMs = 10_000): boolean {
  const p = decodeJwtPayload(token);
  if (!p?.exp) return true;
  const expMs = Number(p.exp) * 1000;
  return Date.now() > expMs - skewMs;
}

async function isTokenActive(token: string): Promise<boolean> {
  // Validasi langsung ke Supabase Auth (kalau 401 berarti token invalid/expired/revoked)
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${base}/auth/v1/user`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchProfileRoleWithRLS(
  token: string,
  userId: string
): Promise<string | null> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const url = new URL(`${base}/rest/v1/profiles`);
    url.searchParams.set("id", `eq.${userId}`);
    url.searchParams.set("select", "role");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0]?.role ? String(rows[0].role) : null;
  } catch {
    return null;
  }
}

function isAdminLike(role?: string | null) {
  const s = String(role ?? "").toLowerCase();
  return s === "admin" || s === "manager" || s === "gm";
}

function clearAuthCookiesOn(res: NextResponse) {
  const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const names = [
    "access_token",
    "refresh_token",
    "sb-access-token",
    "supabase-access-token",
    ref ? `sb-${ref}-auth-token` : null,
  ].filter(Boolean) as string[];

  for (const name of names) {
    // hapus cookie apapun tipenya
    res.cookies.set({
      name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }
}

function redirectToLogin(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const to = new URL("/auth/login", req.url);
  to.searchParams.set("next", pathname + (search || ""));
  const res = NextResponse.redirect(to);
  clearAuthCookiesOn(res);
  return res;
}

/** ---- MIDDLEWARE ---- */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isUser = pathname.startsWith("/user");
  const isAdmin = pathname.startsWith("/admin");
  if (!isUser && !isAdmin) return NextResponse.next();

  const token = readAccessToken(req);
  if (!token) return redirectToLogin(req);

  // 1) cek expiry local
  if (isJwtExpired(token)) return redirectToLogin(req);

  // 2) verifikasi ke Supabase (pastikan tidak pakai token revoked)
  const active = await isTokenActive(token);
  if (!active) return redirectToLogin(req);

  // 3) admin guard
  if (isAdmin) {
    const payload = decodeJwtPayload(token) || {};
    const email = (payload?.email || "").toString().toLowerCase();
    const claimRole =
      payload?.user_metadata?.role || payload?.app_metadata?.role || null;

    let ok = false;
    if (isAdminLike(claimRole)) ok = true;
    if (!ok && email.includes("admin")) ok = true; // fallback lama
    if (!ok && payload?.sub) {
      const dbRole = await fetchProfileRoleWithRLS(
        token,
        payload.sub as string
      );
      if (isAdminLike(dbRole)) ok = true;
    }
    if (!ok) {
      const res = NextResponse.redirect(new URL("/403", req.url));
      // opsional: jangan clear cookie di sini agar user non-admin tetap bisa ke /user
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/user/:path*", "/admin/:path*"],
};
