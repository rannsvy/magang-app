// app/api/attendance/coords/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// SERVICE ROLE ONLY (server-side)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Dapatkan tanggal WIB (YYYY-MM-DD) untuk kolom work_date
function todayJakartaDate(): string {
  const tz = "Asia/Jakarta";
  const d = new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * GET /api/attendance/coords
 * Query:
 *  - technicianId (wajib)  -> HARUS technicians.id
 *  - projectId    (wajib)  -> projects.id
 * (opsional)       jobId   -> kalau kamu mau kirim jobId saja, kita resolve ke projects.id dulu
 *
 * Response:
 * {
 *   data: {
 *     longitude: number | null,
 *     latitude: number | null,
 *     source: "check_out" | "check_in" | null,
 *     project_id: string,
 *     technician_id: string,
 *     work_date: "YYYY-MM-DD"
 *   }
 * }
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const technicianId =
      url.searchParams.get("technicianId") ||
      url.searchParams.get("technician_id");
    let projectId =
      url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const jobId =
      url.searchParams.get("jobId") || url.searchParams.get("job_id");

    if (!technicianId) {
      return NextResponse.json(
        { error: "technicianId wajib." },
        { status: 400 }
      );
    }
    if (!projectId && !jobId) {
      return NextResponse.json(
        { error: "projectId atau jobId wajib salah satu." },
        { status: 400 }
      );
    }

    // Kalau projectId kosong tapi ada jobId → resolve ke projects.id
    if (!projectId && jobId) {
      const { data: proj, error: projErr } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();
      if (projErr)
        return NextResponse.json({ error: projErr.message }, { status: 500 });
      if (!proj?.id) {
        return NextResponse.json(
          { error: "jobId tidak ditemukan." },
          { status: 404 }
        );
      }
      projectId = String(proj.id);
    }

    const work_date = todayJakartaDate();

    // Baca baris attendance untuk hari ini (unik per UQ: project_id + technician_id + work_date)
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("attendance")
      .select(
        "check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude"
      )
      .eq("project_id", projectId!)
      .eq("technician_id", technicianId)
      .eq("work_date", work_date)
      .limit(1);

    if (selErr)
      return NextResponse.json({ error: selErr.message }, { status: 500 });

    const r: any = rows?.[0] || null;

    // Prioritaskan koordinat check_out; fallback check_in
    const longitude =
      typeof r?.check_out_longitude === "number"
        ? r.check_out_longitude
        : typeof r?.check_in_longitude === "number"
        ? r.check_in_longitude
        : null;

    const latitude =
      typeof r?.check_out_latitude === "number"
        ? r.check_out_latitude
        : typeof r?.check_in_latitude === "number"
        ? r.check_in_latitude
        : null;

    const source =
      typeof r?.check_out_longitude === "number" ||
      typeof r?.check_out_latitude === "number"
        ? "check_out"
        : typeof r?.check_in_longitude === "number" ||
          typeof r?.check_in_latitude === "number"
        ? "check_in"
        : null;

    return NextResponse.json({
      data: {
        longitude,
        latitude,
        source,
        project_id: projectId,
        technician_id: technicianId,
        work_date,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
