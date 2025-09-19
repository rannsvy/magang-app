// middleware.ts
import { NextRequest, NextResponse } from "next/server";

/** ---- helpers dari versi kamu ---- */
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

  // variasi lain
  const alt =
    c.get("sb-access-token")?.value || c.get("supabase-access-token")?.value;
  if (alt) return alt;

  // cookie bawaan auth-helpers: sb-<ref>-auth-token
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

/** ---- helper baru: ambil role dari DB dengan REST (pakai token user) ---- */
async function fetchProfileRole(
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
        Authorization: `Bearer ${token}`, // penting agar RLS mengenali auth.uid()
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

function isAdminLike(v?: string | null) {
  const s = String(v ?? "").toLowerCase();
  return s === "admin" || s === "manager" || s === "gm";
}

/** ---- MIDDLEWARE ---- */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isUser = pathname.startsWith("/user");
  const isAdmin = pathname.startsWith("/admin");
  if (!isUser && !isAdmin) return NextResponse.next();

  const token = readAccessToken(req);
  if (!token) {
    const to = new URL("/auth/login", req.url);
    to.searchParams.set("next", pathname + (search || ""));
    return NextResponse.redirect(to);
  }

  if (isAdmin) {
    const payload = decodeJwtPayload(token) || {};
    const email = (payload?.email || "").toString().toLowerCase();
    const claimRole =
      payload?.user_metadata?.role || payload?.app_metadata?.role || null;

    let ok = false;

    // 1) terima role dari JWT jika ada
    if (isAdminLike(claimRole)) ok = true;

    // 2) fallback: email mengandung "admin"
    if (!ok && email.includes("admin")) ok = true;

    // 3) cek DB (profiles.role) dengan token user
    if (!ok && payload?.sub) {
      const dbRole = await fetchProfileRole(token, payload.sub as string);
      if (isAdminLike(dbRole)) ok = true;
    }

    if (!ok) {
      return NextResponse.redirect(new URL("/403", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/user/:path*", "/admin/:path*"],
};
