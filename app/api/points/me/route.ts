// app/api/points/me/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function monthStartWIBISODate(): string {
  const now = new Date();
  // hitung tanggal 1 WIB
  const utcMs = now.getTime();
  const wibMs = utcMs + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const wibMonthStart = new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1)
  );
  // kembalikan sebagai 'YYYY-MM-DD'
  return wibMonthStart.toISOString().slice(0, 10);
}

export async function GET() {
  const sb = supabaseServer();

  const { data: auth, error: authErr } = await sb.auth.getUser();
  if (authErr || !auth?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: pErr } = await sb
    .from("profiles")
    .select("technician_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profile?.technician_id)
    return NextResponse.json({ error: "Not a technician" }, { status: 403 });

  const monthStart = monthStartWIBISODate();

  const [{ data: current, error: cErr }, { data: history, error: hErr }] =
    await Promise.all([
      sb
        .from("tech_month_points")
        .select("month_start, points")
        .eq("technician_id", profile.technician_id)
        .eq("month_start", monthStart)
        .maybeSingle(),
      sb
        .from("tech_month_points")
        .select("month_start, points")
        .eq("technician_id", profile.technician_id)
        .order("month_start", { ascending: false }),
    ]);

  if (cErr || hErr) {
    const err = (cErr || hErr)!;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({
    current: { monthStart, points: current?.points ?? 0 },
    history: history ?? [], // array [{ month_start, points }]
  });
}
