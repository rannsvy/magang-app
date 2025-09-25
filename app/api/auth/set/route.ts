// app/api/auth/set/route.ts
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}
function decodeJwtExp(access: string): number | null {
  try {
    const [, payload] = access.split(".");
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { access_token, refresh_token } = await req.json();
  if (!access_token) {
    return NextResponse.json(
      { error: "access_token required" },
      { status: 400 }
    );
  }

  const ref = projectRefFromUrl(SUPABASE_URL);
  const exp = decodeJwtExp(access_token);
  const maxAgeAccess = exp
    ? Math.max(5, exp - Math.floor(Date.now() / 1000))
    : 3600;

  const res = NextResponse.json({ ok: true });

  const xfProto = (req.headers.get("x-forwarded-proto") || "").toLowerCase();
  const proto = xfProto || req.nextUrl.protocol.replace(":", "");
  const host = (req.headers.get("host") || req.nextUrl.host).toLowerCase();
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

  // Dipakai @supabase/ssr (server components)
  res.cookies.set({
    name: "sb-access-token",
    value: access_token,
    maxAge: maxAgeAccess,
    ...base,
  });
  if (refresh_token) {
    res.cookies.set({
      name: "sb-refresh-token",
      value: refresh_token,
      maxAge: 60 * 60 * 24 * 30,
      ...base,
    });
  }

  // Cookie “paket” format baru (JSON), sangat disukai helper SSR
  if (ref) {
    const value = JSON.stringify({
      currentSession: {
        access_token,
        refresh_token: refresh_token ?? null,
        // opsional, membantu beberapa helper
        token_type: "bearer",
        expires_at: exp ?? null,
      },
      expiresAt: exp ?? null,
    });
    res.cookies.set({
      name: `sb-${ref}-auth-token`,
      value,
      maxAge: 60 * 60 * 24 * 30,
      ...base,
    });
  }

  // Kompat untuk middleware custom-mu
  res.cookies.set({
    name: "access_token",
    value: access_token,
    maxAge: maxAgeAccess,
    ...base,
  });
  if (refresh_token) {
    res.cookies.set({
      name: "refresh_token",
      value: refresh_token,
      maxAge: 60 * 60 * 24 * 30,
      ...base,
    });
  }

  return res;
}
