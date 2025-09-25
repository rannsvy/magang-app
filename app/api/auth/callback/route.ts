// app/auth/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const sb = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });
      },
    },
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });

  const { error } = await sb.auth.exchangeCodeForSession(req.url);
  const next = req.nextUrl.searchParams.get("next") || "/user/dashboard";

  if (error) {
    const u = new globalThis.URL("/auth/login", req.url);
    u.searchParams.set("err", "callback");
    return NextResponse.redirect(u, { headers: res.headers });
  }
  return NextResponse.redirect(new globalThis.URL(next, req.url), {
    headers: res.headers,
  });
}
