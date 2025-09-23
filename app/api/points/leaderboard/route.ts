// app/api/points/leaderboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // ⬅ instance, JANGAN dipanggil

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["supervisor", "gm", "manager"]);

function monthStartWIBISO(): string {
  const now = new Date();
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const start = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}
function prevMonthStartISO(cur: string): string {
  const [y, m] = cur.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 2, 1)); // -1 month
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // siapkan response agar Set-Cookie bisa ditulis balik
  const res = new NextResponse();

  // SSR-aware Supabase client (baca & tulis cookie httpOnly)
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    }
  );

  // ==== Auth check ====
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: res.headers }
    );
  }

  // ==== Role check (RLS ON) ====
  const { data: me, error: meErr } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr) {
    return NextResponse.json(
      { error: meErr.message },
      { status: 500, headers: res.headers }
    );
  }

  const role = String(me?.role || "").toLowerCase();
  if (!ALLOWED.has(role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: res.headers }
    );
  }

  // ==== Query pakai service-role (bypass RLS) ====
  const admin = supabaseAdmin; // ⬅ perbaikan inti: JANGAN panggil ()
  const monthStart = monthStartWIBISO();
  const prevStart = prevMonthStartISO(monthStart);

  const { data: rows, error: rErr } = await admin
    .from("tech_month_points")
    .select(
      `
      technician_id,
      month_start,
      points,
      technicians:technician_id ( id, inisial, nama_panggilan, nama_lengkap )
    `
    )
    .eq("month_start", monthStart)
    .order("points", { ascending: false });

  if (rErr) {
    return NextResponse.json(
      { error: rErr.message },
      { status: 500, headers: res.headers }
    );
  }

  const techIds = (rows ?? []).map((r: any) => r.technician_id);
  const { data: prev, error: pErr } = await admin
    .from("tech_month_points")
    .select("technician_id, points")
    .eq("month_start", prevStart)
    .in(
      "technician_id",
      techIds.length ? techIds : ["00000000-0000-0000-0000-000000000000"]
    );

  if (pErr) {
    return NextResponse.json(
      { error: pErr.message },
      { status: 500, headers: res.headers }
    );
  }

  const prevMap = new Map<string, number>();
  for (const r of prev ?? [])
    prevMap.set(r.technician_id as string, r.points as number);

  const list = (rows ?? []).map((r: any, idx: number) => {
    const t = Array.isArray(r.technicians) ? r.technicians[0] : r.technicians;
    const name = t?.nama_panggilan && String(t.nama_panggilan).trim();
    const nama_lengkap =
      (t?.nama_lengkap && String(t.nama_lengkap).trim()) ||
      `Teknisi ${t?.nama_lengkap || ""}`;
    const points = r.points as number;
    const prevPoints = prevMap.get(r.technician_id as string) ?? 0;
    const delta = points - prevPoints;
    const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      rank: idx + 1,
      technicianId: r.technician_id as string,
      name,
      nama_lengkap,
      points,
      prevPoints,
      delta,
      trend,
    };
  });

  return NextResponse.json(
    { monthStart, prevMonthStart: prevStart, data: list },
    { headers: res.headers }
  );
}
