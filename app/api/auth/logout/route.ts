// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";

function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

export async function POST() {
  const res = NextResponse.json({ ok: true });

  const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const names = [
    "access_token",
    "refresh_token",
    "sb-access-token",
    "supabase-access-token",
    ref ? `sb-${ref}-auth-token` : null,
  ].filter(Boolean) as string[];

  for (const name of names) {
    res.cookies.set({
      name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }

  return res;
}
