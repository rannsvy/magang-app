// app/api/auth/clear/route.ts
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function projectRefFromUrl(url: string | undefined) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const ref = projectRefFromUrl(SUPABASE_URL);
  const names = [
    "sb-access-token",
    "sb-refresh-token",
    "access_token",
    "refresh_token",
    "supabase-access-token",
    ...(ref ? [`sb-${ref}-auth-token`] : []),
  ];
  for (const name of names) {
    res.cookies.set({ name, value: "", path: "/", maxAge: 0 });
  }
  return res;
}
