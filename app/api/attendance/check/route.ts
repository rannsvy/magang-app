// app/api/attendance/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// SERVICE ROLE ONLY (server-side)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// WIB: dapatkan rentang awal–akhir hari ini (UTC ISO) untuk filter timestamp (masih disimpan bila butuh)
function todayWIBWindow() {
  const nowUtcMs = Date.now();
  const wibMs = nowUtcMs + 7 * 60 * 60 * 1000; // UTC+7
  const wib = new Date(wibMs);
  const y = wib.getUTCFullYear();
  const m = wib.getUTCMonth();
  const d = wib.getUTCDate();
  // 00:00 WIB → UTC-7
  const startUtcMs = Date.UTC(y, m, d, -7, 0, 0, 0);
  const endUtcMs = Date.UTC(y, m, d + 1, -7, 0, 0, 0);
  return {
    startISO: new Date(startUtcMs).toISOString(),
    endISO: new Date(endUtcMs).toISOString(),
  };
}

// WIB helpers (untuk field date/time)
function nowJakarta() {
  const tz = "Asia/Jakarta";
  const d = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
  return { date, time }; // { work_date: "YYYY-MM-DD", now_time: "HH:mm:ss" }
}

/**
 * Ambil daftar project aktif yang di-assign ke teknisi KHUSUS assignment “hari ini” (WIB).
 * Revisi: gunakan kolom `work_date = today` (bukan window `created_at`),
 * agar assignment yang dibuat sebelumnya namun bertanggal kerja hari ini ikut terambil.
 */
async function getTodayAssignmentsWithNames(technicianId: string) {
  const todayWIBDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data, error } = await supabaseAdmin
    .from("project_assignments")
    .select(
      `
      projects!inner(
        id,
        name,
        completed_at,
        tanggal_mulai
      ),
      work_date,
      removed_at
    `
    )
    .eq("technician_id", technicianId)
    .eq("work_date", todayWIBDate) // ⬅️ pakai work_date HARI INI (WIB)
    .is("removed_at", null)
    .is("projects.completed_at", null)
    .lte("projects.tanggal_mulai", todayWIBDate);

  if (error) throw new Error(error.message);

  const list =
    (data ?? [])
      .map((r: any) => ({
        project_id: r?.projects?.id ? String(r.projects.id) : "",
        name: r?.projects?.name ? String(r.projects.name) : null,
      }))
      .filter((x) => x.project_id) || [];

  return list;
}

/** Emit “realtime” via insert ke tabel ringan (non-blocking). */
async function emitRealtimeEvent(params: {
  type: "in" | "out";
  project_id: string;
  technician_id: string;
  work_date: string; // YYYY-MM-DD
  event_time: string; // HH:mm:ss
}) {
  try {
    await supabaseAdmin.from("attendance_events").insert({
      type: params.type,
      project_id: params.project_id,
      technician_id: params.technician_id,
      work_date: params.work_date,
      event_time: params.event_time,
    });
  } catch {
    // Jangan gagalkan request utama bila tabel tidak ada / RLS menolak
  }
}

/* =========================
   GET: Ambil koordinat hari ini
   Query:
     - technicianId (wajib, HARUS technicians.id)
     - projectId (opsional) ATAU jobId (opsional)
========================= */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const technicianId =
      url.searchParams.get("technicianId") ||
      url.searchParams.get("technician_id");
    const projectIdQ =
      url.searchParams.get("projectId") || url.searchParams.get("project_id");
    const jobIdQ =
      url.searchParams.get("jobId") || url.searchParams.get("job_id");

    if (!technicianId) {
      return NextResponse.json(
        { error: "technicianId wajib." },
        { status: 400 }
      );
    }

    const { date: work_date } = nowJakarta();

    // ==== Tentukan effProjectId persis seperti POST ====
    let effProjectId: string | null = null;
    const todayAssignments = await getTodayAssignmentsWithNames(technicianId);

    // 1) projectId langsung
    if (projectIdQ) {
      const found = todayAssignments.find(
        (a) => a.project_id === String(projectIdQ)
      );
      if (!found) {
        return NextResponse.json(
          {
            error:
              "Project itu tidak ada di assignment HARI INI untuk teknisi ini.",
          },
          { status: 403 }
        );
      }
      effProjectId = String(projectIdQ);
    }

    // 2) jobId → resolve projects.id lalu cek
    if (!effProjectId && jobIdQ) {
      const { data: proj, error: projErr } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("job_id", jobIdQ)
        .maybeSingle();
      if (projErr)
        return NextResponse.json({ error: projErr.message }, { status: 500 });

      const resolved = proj?.id ?? null;
      if (!resolved)
        return NextResponse.json(
          { error: "jobId tidak ditemukan." },
          { status: 404 }
        );

      const found = todayAssignments.find(
        (a) => a.project_id === String(resolved)
      );
      if (!found) {
        return NextResponse.json(
          {
            error:
              "Project dari jobId itu tidak ada di assignment HARI INI untuk teknisi ini.",
          },
          { status: 403 }
        );
      }
      effProjectId = String(resolved);
    }

    // 3) tidak kirim apa-apa → fallback ke daftar “hari ini”
    if (!effProjectId) {
      if (todayAssignments.length === 0) {
        return NextResponse.json(
          { error: "Tidak ada penugasan HARI INI untuk akun teknisi ini." },
          { status: 409 }
        );
      }
      if (todayAssignments.length > 1) {
        return NextResponse.json(
          {
            error:
              "Lebih dari satu penugasan HARI INI. Mohon pilih project terlebih dahulu.",
            activeProjects: todayAssignments.map((a) => ({
              id: a.project_id,
              name: a.name,
            })),
          },
          { status: 409 }
        );
      }
      effProjectId = todayAssignments[0].project_id;
    }

    // ==== Ambil koordinat dari attendance hari ini ====
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("attendance")
      .select(
        "check_in_latitude, check_in_longitude, check_out_latitude, check_out_longitude"
      )
      .eq("project_id", effProjectId)
      .eq("technician_id", technicianId)
      .eq("work_date", work_date)
      .limit(1);

    if (selErr)
      return NextResponse.json({ error: selErr.message }, { status: 500 });

    const r = rows?.[0] || null;

    const payload = {
      data: {
        check_in: r
          ? {
              lat:
                typeof (r as any).check_in_latitude === "number"
                  ? (r as any).check_in_latitude
                  : null,
              lng:
                typeof (r as any).check_in_longitude === "number"
                  ? (r as any).check_in_longitude
                  : null,
            }
          : null,
        check_out: r
          ? {
              lat:
                typeof (r as any).check_out_latitude === "number"
                  ? (r as any).check_out_latitude
                  : null,
              lng:
                typeof (r as any).check_out_longitude === "number"
                  ? (r as any).check_out_longitude
                  : null,
            }
          : null,
        project_id: effProjectId,
        technician_id: technicianId,
        work_date,
      },
    };

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}

/* =========================
   POST: Check In / Check Out
   (FUNGSI LAMA — TIDAK DIUBAH)
========================= */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const DEBUG = url.searchParams.get("debug") === "1";
    const body = await req.json().catch(() => ({}));

    const {
      type, // "in" | "out"
      technicianId, // wajib
      projectId, // opsional (akan diverifikasi assignment-nya)
      jobId, // opsional (akan di-resolve ke projects.id)
      location, // { latitude, longitude, accuracy, ... }
      ua, // optional
      capturedAt, // optional ISO
    } = body || {};

    // Validasi dasar
    if (type !== "in" && type !== "out") {
      return NextResponse.json(
        { error: "Tipe event tidak valid (in/out)." },
        { status: 400 }
      );
    }
    if (!technicianId) {
      return NextResponse.json(
        { error: "technicianId wajib." },
        { status: 400 }
      );
    }
    if (!location?.latitude || !location?.longitude) {
      return NextResponse.json(
        { error: "Lokasi wajib (latitude/longitude)." },
        { status: 400 }
      );
    }

    const { date: work_date, time: now_time } = nowJakarta();

    // ==== Tentukan project_id efektif (HANYA dari assignment “hari ini”) ====
    let effProjectId: string | null = null;
    const todayAssignments = await getTodayAssignmentsWithNames(technicianId);

    // 1) projectId dikirim → cek di daftar “hari ini”
    if (projectId) {
      const found = todayAssignments.find(
        (a) => a.project_id === String(projectId)
      );
      if (!found) {
        return NextResponse.json(
          {
            error:
              "Project itu tidak ada di assignment HARI INI untuk teknisi ini.",
          },
          { status: 403 }
        );
      }
      effProjectId = String(projectId);
    }

    // 2) jobId → resolve projects.id lalu cek
    if (!effProjectId && jobId) {
      const { data: proj, error: projErr } = await supabaseAdmin
        .from("projects")
        .select("id")
        .eq("job_id", jobId)
        .maybeSingle();

      if (projErr)
        return NextResponse.json({ error: projErr.message }, { status: 500 });

      const resolved = proj?.id ?? null;
      if (!resolved)
        return NextResponse.json(
          { error: "jobId tidak ditemukan." },
          { status: 404 }
        );

      const found = todayAssignments.find(
        (a) => a.project_id === String(resolved)
      );
      if (!found) {
        return NextResponse.json(
          {
            error:
              "Project dari jobId itu tidak ada di assignment HARI INI untuk teknisi ini.",
          },
          { status: 403 }
        );
      }
      effProjectId = String(resolved);
    }

    // 3) tak kirim apa pun → pakai daftar “hari ini”
    if (!effProjectId) {
      if (todayAssignments.length === 0) {
        return NextResponse.json(
          { error: "Tidak ada penugasan HARI INI untuk akun teknisi ini." },
          { status: 409 }
        );
      }
      if (todayAssignments.length > 1) {
        return NextResponse.json(
          {
            error:
              "Lebih dari satu penugasan HARI INI. Mohon pilih project terlebih dahulu.",
            activeProjects: todayAssignments.map((a) => ({
              id: a.project_id,
              name: a.name,
            })),
          },
          { status: 409 }
        );
      }
      effProjectId = todayAssignments[0].project_id;
    }

    if (!effProjectId) {
      return NextResponse.json(
        { error: "Gagal menentukan project_id." },
        { status: 400 }
      );
    }

    // ==== Attendance hari ini (unik: project_id + technician_id + work_date) ====
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("attendance")
      .select("id, check_in_time, check_out_time")
      .eq("project_id", effProjectId)
      .eq("technician_id", technicianId)
      .eq("work_date", work_date)
      .limit(1);

    if (selErr)
      return NextResponse.json({ error: selErr.message }, { status: 500 });

    const existing = rows?.[0];

    if (type === "in") {
      if (existing?.check_in_time) {
        return NextResponse.json(
          { error: "Sudah Check In hari ini." },
          { status: 409 }
        );
      }

      // Upsert aman dari double-click
      const { error: upErr } = await supabaseAdmin.from("attendance").upsert(
        {
          project_id: effProjectId,
          technician_id: technicianId,
          work_date,
          check_in_time: now_time,
          check_in_latitude: location.latitude,
          check_in_longitude: location.longitude,
          check_in_accuracy: location.accuracy ?? null,
        },
        { onConflict: "project_id,technician_id,work_date" }
      );

      if (upErr)
        return NextResponse.json({ error: upErr.message }, { status: 500 });

      // 🔔 Realtime event
      emitRealtimeEvent({
        type: "in",
        project_id: effProjectId,
        technician_id: technicianId,
        work_date,
        event_time: now_time,
      }).catch(() => {});

      return NextResponse.json({
        ok: true,
        project_id: effProjectId,
        technician_id: technicianId,
        work_date,
        check_in_time: now_time,
        debug: DEBUG ? { ua, capturedAt } : undefined,
      });
    }

    // type === "out"
    if (!existing || !existing.check_in_time) {
      return NextResponse.json(
        { error: "Belum Check In hari ini." },
        { status: 409 }
      );
    }
    if (existing.check_out_time) {
      return NextResponse.json(
        { error: "Sudah Check Out hari ini." },
        { status: 409 }
      );
    }

    const { error: updErr } = await supabaseAdmin
      .from("attendance")
      .update({
        check_out_time: now_time,
        check_out_latitude: location.latitude,
        check_out_longitude: location.longitude,
        check_out_accuracy: location.accuracy ?? null,
      })
      .eq("id", existing.id);

    if (updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 });

    // 🔔 Realtime event
    emitRealtimeEvent({
      type: "out",
      project_id: effProjectId,
      technician_id: technicianId,
      work_date,
      event_time: now_time,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      project_id: effProjectId,
      technician_id: technicianId,
      work_date,
      check_out_time: now_time,
      debug: DEBUG ? { ua, capturedAt } : undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
