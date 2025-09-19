// app/api/auth/set/route.ts
import { NextResponse } from "next/server";

function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  try {
    const { access_token, refresh_token, expires_at } = await req.json();

    const res = NextResponse.json({ ok: true });

    // 1) Raw cookies your middleware & server client will use
    if (access_token) {
      res.cookies.set("access_token", access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7d
      });
    }
    if (refresh_token) {
      res.cookies.set("refresh_token", refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30d
      });
    }

    // 2) Also set the auth-helpers style cookie for compatibility
    const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (ref && access_token && refresh_token) {
      const name = `sb-${ref}-auth-token`;
      const payload = JSON.stringify({
        access_token,
        refresh_token,
        expires_at: expires_at ?? null,
      });
      // Note: some libs expect a base64- JSON string
      const encoded =
        "base64-" + Buffer.from(payload, "utf8").toString("base64");
      res.cookies.set(name, encoded, {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed to set auth cookies" },
      { status: 400 }
    );
  }
}
