// middleware.ts
import { NextRequest, NextResponse } from "next/server";

/* ================== Helpers ================== */
function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

function safeJsonParse<T = any>(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function decodeBase64Web(b64: string) {
  try {
    return atob(b64);
  } catch {
    try {
      /* @ts-ignore */ return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return "";
    }
  }
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

function isJwtExpired(token: string, skewMs = 10_000): boolean {
  const p = decodeJwtPayload(token);
  if (!p?.exp) return true;
  const expMs = Number(p.exp) * 1000;
  return Date.now() > expMs - skewMs;
}

/* ================== Cookie readers ================== */
function readAccessToken(req: NextRequest): string | null {
  const c = req.cookies;

  // 1) httpOnly cookies yang kita set lewat /api/auth/set
  const raw = c.get("access_token")?.value;
  if (raw) return raw;
  const alt =
    c.get("sb-access-token")?.value || c.get("supabase-access-token")?.value;
  if (alt) return alt;

  // 2) storage cookie auth-helpers: sb-<ref>-auth-token (format BARU: JSON { currentSession, expiresAt })
  const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (ref) {
    const name = `sb-${ref}-auth-token`;
    const v = c.get(name)?.value;
    if (v) {
      let text = v;
      // kompat lama: "base64-<json>"
      if (text.startsWith("base64-")) text = decodeBase64Web(text.slice(7));
      // kalau bukan base64, coba parse langsung (format baru)
      const obj = safeJsonParse<any>(text) || {};
      // format baru:
      if (obj?.currentSession?.access_token)
        return obj.currentSession.access_token as string;
      // kompat lama (beberapa varian simpan langsung access_token di root)
      if (obj?.access_token) return obj.access_token as string;
    }
  }
  return null;
}

function readRefreshToken(req: NextRequest): string | null {
  return req.cookies.get("refresh_token")?.value || null;
}

function setAuthCookies(res: NextResponse, access: string, refresh?: string) {
  let maxAge = 3600;
  try {
    const p = decodeJwtPayload(access);
    if (p?.exp) maxAge = Math.max(5, p.exp - Math.floor(Date.now() / 1000));
  } catch {}
  const url = new URL(res.url);
  const xfProto = (res.headers.get("x-forwarded-proto") || "").toLowerCase();
  const proto = xfProto || url.protocol.replace(":", "");
  const host = (res.headers.get("host") || url.host).toLowerCase();
  const isLocal =
    proto === "http" ||
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".local");

  const base = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: !isLocal,
    path: "/",
  };

  res.cookies.set({ name: "access_token", value: access, maxAge, ...base });
  res.cookies.set({ name: "sb-access-token", value: access, maxAge, ...base });
  if (refresh) {
    res.cookies.set({
      name: "refresh_token",
      value: refresh,
      maxAge: 60 * 60 * 24 * 30,
      ...base,
    });
  }
}

function clearAuthCookiesOn(res: NextResponse) {
  for (const name of [
    "access_token",
    "refresh_token",
    "sb-access-token",
    "supabase-access-token",
  ]) {
    res.cookies.set({ name, value: "", maxAge: 0, path: "/" });
  }
}

function redirectToLogin(req: NextRequest) {
  const to = new URL("/auth/login", req.url);
  const { pathname, search } = req.nextUrl;
  to.searchParams.set("next", pathname + (search || ""));
  const res = NextResponse.redirect(to);
  clearAuthCookiesOn(res);
  return res;
}

/* ================== Supabase REST helpers ================== */
async function isTokenActive(token: string): Promise<boolean> {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // 5xx → anggap OK supaya tidak nge-loop saat dev/ jaringan
    if (res.status >= 500) return true;
    return res.ok;
  } catch {
    // network error → anggap OK (dev fallback)
    return true;
  }
}

async function refreshAccessTokenByRefresh(refreshToken: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = await res.json();
  return {
    access_token: j.access_token as string,
    refresh_token: (j.refresh_token as string) || undefined,
  };
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

/* ================== Guards ================== */
const LB_ALLOWED = new Set(["supervisor", "gm", "manager"]);
const isAdminPanelRole = (role?: string | null) =>
  ["admin", "manager", "gm"].includes(String(role ?? "").toLowerCase());
const isPureAdmin = (role?: string | null) =>
  String(role ?? "").toLowerCase() === "admin";

/* ================== Middleware ================== */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isUser = pathname.startsWith("/user");
  const isAdmin = pathname.startsWith("/admin");
  const isLeaderboard =
    pathname === "/leaderboard" || pathname === "/user/leaderboard";

  if (!isUser && !isAdmin && !isLeaderboard) return NextResponse.next();

  // 1) token dari cookie
  let access = readAccessToken(req);
  const refresh = readRefreshToken(req);

  if (!access && !refresh) {
    return redirectToLogin(req);
  }

  // 2) refresh kalau tidak ada / expired
  let res: NextResponse | null = null;
  if (!access || isJwtExpired(access)) {
    if (!refresh) return redirectToLogin(req);
    const refreshed = await refreshAccessTokenByRefresh(refresh);
    if (!refreshed?.access_token) return redirectToLogin(req);
    access = refreshed.access_token;
    res = NextResponse.next();
    setAuthCookies(res, refreshed.access_token, refreshed.refresh_token);
  }

  // 3) validasi ringan ke Supabase (toleran error jaringan)
  const active = await isTokenActive(access!);
  if (!active) return redirectToLogin(req);

  // 4) role
  const payload = decodeJwtPayload(access!) || {};
  const userId = String(payload.sub || "");
  const email = String(payload?.email || "").toLowerCase();
  const claimRole = String(
    payload?.user_metadata?.role || payload?.app_metadata?.role || ""
  ).toLowerCase();
  const role =
    claimRole || (await fetchProfileRoleWithRLS(access!, userId)) || "";

  // /admin → admin/gm/manager (atau email mengandung "admin")
  if (isAdmin) {
    if (!isAdminPanelRole(role) && !email.includes("admin")) {
      return NextResponse.redirect(new URL("/403", req.url));
    }
  }

  // /user → admin murni dialihkan ke /admin (role lain BOLEH)
  if (isUser) {
    if (isPureAdmin(role) || email.includes("admin")) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
  }

  // /leaderboard → hanya supervisor/gm/manager
  if (isLeaderboard) {
    if (!LB_ALLOWED.has(role)) {
      return NextResponse.redirect(new URL("/403", req.url));
    }
  }

  return res ?? NextResponse.next();
}

export const config = {
  matcher: ["/user/:path*", "/admin/:path*", "/leaderboard"],
};
