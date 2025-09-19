// app/api/job-photos/meta/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseMeter(input: unknown): number | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string") {
    const n = Number(input.replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Hanya teknisi yang boleh eksekusi
async function assertTechnician() {
  const supabase = supabaseServer();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return {
      ok: false as const,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const uid = auth.user.id;

  // Cek profiles: ada technician_id => teknisi
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("technician_id, email")
    .eq("id", uid)
    .maybeSingle();

  if (profErr) {
    return {
      ok: false as const,
      res: NextResponse.json(
        { error: profErr.message || "Auth failed" },
        { status: 500 }
      ),
    };
  }

  const isTechnician = !!profile?.technician_id;

  // Jika bukan teknisi, tolak (view-only)
  if (!isTechnician) {
    return {
      ok: false as const,
      res: NextResponse.json(
        { error: "Forbidden: hanya teknisi yang dapat memperbarui meta." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, supabase };
}

export async function POST(req: Request) {
  try {
    // === Guard peran (server-side) ===
    const guard = await assertTechnician();
    if (!guard.ok) return guard.res;
    const supabase = guard.supabase!;

    const body = await req.json();

    const jobId = body?.jobId as string | undefined;
    const categoryId = body?.categoryId as string | number | undefined;

    if (!jobId || categoryId === undefined) {
      return NextResponse.json(
        { error: "jobId & categoryId required" },
        { status: 400 }
      );
    }

    const payload: Record<string, any> = {
      job_id: jobId,
      category_id: String(categoryId),
      updated_at: new Date().toISOString(),
    };

    // serial number
    if (Object.prototype.hasOwnProperty.call(body, "serialNumber")) {
      const v = body.serialNumber;
      payload.serial_number =
        v === null || (typeof v === "string" && v.trim() === "")
          ? null
          : String(v).trim();
    }

    // meter / cable_meter
    if (Object.prototype.hasOwnProperty.call(body, "meter")) {
      const m = parseMeter(body.meter);
      if (m !== undefined) payload.cable_meter = m;
    }

    // ocr_status
    if (Object.prototype.hasOwnProperty.call(body, "ocrStatus")) {
      const s = body.ocrStatus;
      if (typeof s === "string") {
        payload.ocr_status = s;
      } else if (s && typeof s === "object") {
        payload.ocr_status = JSON.stringify(s);
      } else if (s === null) {
        payload.ocr_status = null;
      }
    }

    // selected_photo_id – bisa dari field langsung, atau dari ocrStatus.selectedPhotoId
    let selectedPhotoId: string | null | undefined = undefined;

    if (Object.prototype.hasOwnProperty.call(body, "selectedPhotoId")) {
      selectedPhotoId =
        body.selectedPhotoId === null
          ? null
          : String(body.selectedPhotoId || "").trim() || null;
    }

    if (
      selectedPhotoId === undefined &&
      body?.ocrStatus &&
      typeof body.ocrStatus === "object" &&
      body.ocrStatus.selectedPhotoId
    ) {
      selectedPhotoId = String(body.ocrStatus.selectedPhotoId).trim() || null;
    }

    // validasi selectedPhotoId milik job/category yang sama
    if (selectedPhotoId) {
      const { data: entry, error: e1 } = await supabase
        .from("job_photo_entries")
        .select("id, url, thumb_url")
        .eq("job_id", jobId)
        .eq("category_id", String(categoryId))
        .eq("id", selectedPhotoId)
        .maybeSingle();

      if (e1) {
        return NextResponse.json(
          { error: `Validasi selectedPhotoId gagal: ${e1.message}` },
          { status: 400 }
        );
      }
      if (!entry) {
        return NextResponse.json(
          { error: "selectedPhotoId tidak cocok dengan job/category" },
          { status: 400 }
        );
      }

      payload.selected_photo_id = selectedPhotoId;
      // Sinkronkan snapshot ke URL foto terpilih
      if (entry.url) payload.url = entry.url;
      if (entry.thumb_url) payload.thumb_url = entry.thumb_url;
    } else if (selectedPhotoId === null) {
      // mengosongkan pilihan (jarang dipakai)
      payload.selected_photo_id = null;
    }

    // ===== Upsert dengan fallback bila kolom selected_photo_id belum ada =====
    try {
      const { error } = await supabase
        .from("job_photos")
        .upsert(payload, { onConflict: "job_id,category_id" });
      if (error) throw error;
    } catch (e: any) {
      // Retry tanpa selected_photo_id (untuk skema lama)
      if (Object.prototype.hasOwnProperty.call(payload, "selected_photo_id")) {
        const { selected_photo_id, ...fallback } = payload;
        const { error: e2 } = await supabase
          .from("job_photos")
          .upsert(fallback, { onConflict: "job_id,category_id" });
        if (e2) throw e2;
      } else {
        throw e;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Meta update failed" },
      { status: 500 }
    );
  }
}
