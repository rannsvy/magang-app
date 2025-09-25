// /app/api/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const projectId = searchParams.get("projectId");
    const dateFrom = searchParams.get("from");
    const dateTo = searchParams.get("to");

    // 🔧 Ambil client SUPABASE dengan memanggil fungsinya
    // (pakai await jika supabaseServer() mengembalikan Promise)
    const supabase = await supabaseServer();

    let q = supabase
      .from("attendance")
      .select(
        "project_id, technician_id, work_date, project_leader, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude"
      );

    // Filter tanggal
    if (date) {
      q = q.eq("work_date", date);
    } else if (dateFrom || dateTo) {
      if (dateFrom) q = q.gte("work_date", dateFrom);
      if (dateTo) q = q.lte("work_date", dateTo);
      // tanpa date & tanpa from/to → ambil seluruh riwayat
    }

    // Filter proyek (opsional)
    if (projectId) q = q.eq("project_id", projectId);

    // Urutkan agar "history" enak dibaca
    q = q.order("work_date", { ascending: true });

    const { data, error } = await q;

    if (error) {
      console.error("[GET /api/attendance] error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
