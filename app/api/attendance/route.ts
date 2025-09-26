// /app/api/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Tanggal HARI INI (WIB) → "YYYY-MM-DD" */
function todayJakartaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // ====== JALUR BARU: ambil CI/CO hari ini untuk teknisi + project ======
    const technicianId =
      searchParams.get("technicianId") || searchParams.get("technician_id");
    const projectIdQ =
      searchParams.get("projectId") || searchParams.get("project_id");
    const jobIdQ = searchParams.get("jobId") || searchParams.get("job_id");

    const supabase = await supabaseServer();

    if (technicianId) {
      // Fokus: ambil CI/CO untuk project terpilih (hari ini, WIB)
      let effProjectId: string | null = null;

      if (projectIdQ) {
        effProjectId = String(projectIdQ);
      } else if (jobIdQ) {
        // resolve projects.id dari job_id
        const { data: proj, error: projErr } = await supabase
          .from("projects")
          .select("id")
          .eq("job_id", jobIdQ)
          .maybeSingle();

        if (projErr) {
          return NextResponse.json({ error: projErr.message }, { status: 500 });
        }
        if (!proj?.id) {
          return NextResponse.json(
            { error: "jobId tidak ditemukan." },
            { status: 404 }
          );
        }
        effProjectId = String(proj.id);
      }

      const work_date = todayJakartaDate();

      // Query attendance hari ini untuk teknisi (dan project jika ada)
      let qTimes = supabase
        .from("attendance")
        .select(
          "id, project_id, technician_id, work_date, check_in_time, check_out_time"
        )
        .eq("technician_id", technicianId)
        .eq("work_date", work_date)
        .limit(1);

      if (effProjectId) qTimes = qTimes.eq("project_id", effProjectId);

      const { data: rowsTimes, error: errTimes } = await qTimes;

      if (errTimes) {
        console.error("[GET /api/attendance times] error:", errTimes);
        return NextResponse.json({ error: errTimes.message }, { status: 500 });
      }

      const r = rowsTimes?.[0] || null;

      return NextResponse.json({
        data: {
          check_in_time: r?.check_in_time ?? null,
          check_out_time: r?.check_out_time ?? null,
          project_id: r?.project_id ?? effProjectId ?? null,
          technician_id: technicianId,
          work_date,
        },
      });
    }

    // ====== JALUR LAMA: histori attendance (dengan koordinat) ======
    const date = searchParams.get("date");
    const projectId =
      searchParams.get("projectId") || searchParams.get("project_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let q = supabase.from("attendance").select(
      // gabungkan field penting dari kedua versi
      "project_id, technician_id, work_date, project_leader, check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude"
    );

    // Filter tanggal
    if (date) {
      q = q.eq("work_date", date);
    } else if (from || to) {
      if (from) q = q.gte("work_date", from);
      if (to) q = q.lte("work_date", to);
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
