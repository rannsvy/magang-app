// lib/jobPhotos.ts
import { supabaseServer, supabaseAdmin } from "@/lib/supabaseServer";

const BUCKET = "job-photos";

/* ===== Types ===== */
export type JobPhotoEntry = {
  id: string;
  job_id: string;
  category_id: string;
  url: string;
  thumb_url?: string | null;
  sharpness?: number | null;
  token?: number | null;
  width?: number | null;
  height?: number | null;
  meta?: any;
  created_at: string;
};

type UploadOpts = {
  thumb?: File | Blob; // opsional: thumbnail yang sudah dibuat di client
  token?: number; // untuk de-dupe/penilaian
  sharpness?: number; // nilai kualitas (opsional)
  contentType?: string; // override
};

/* ===== Utils ===== */
async function ensureBucketExists() {
  const admin = supabaseAdmin();
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  if (!data?.some((b) => b.name === BUCKET)) {
    const { error: cErr } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "20MB",
    });
    if (cErr) throw cErr;
  }
}

function guessExt(file: File | Blob, filename?: string): string {
  const name =
    typeof File !== "undefined" && file instanceof File
      ? file.name
      : filename || "";
  const ext = name.includes(".") ? name.split(".").pop() : undefined;
  return (ext || "jpg").toLowerCase();
}

/* ===== Upload foto + riwayat + sinkron snapshot ===== */
export async function uploadJobPhoto(
  jobId: string,
  categoryId: string,
  file: File | Blob,
  filename?: string,
  opts: UploadOpts = {}
): Promise<JobPhotoEntry> {
  const admin = supabaseAdmin(); // service role → bypass RLS untuk storage & DB
  await ensureBucketExists();

  const ext = guessExt(file, filename);
  const ts = Date.now();
  const basePath = `${encodeURIComponent(jobId)}/${encodeURIComponent(
    categoryId
  )}`;
  const fullPath = `${basePath}/${ts}.` + ext;
  const thumbPath =
    `${basePath}/${ts}-thumb.` +
    (opts.thumb ? guessExt(opts.thumb, filename) : ext);

  const contentType =
    opts.contentType ||
    (typeof File !== "undefined" && file instanceof File && file.type) ||
    "image/jpeg";

  // 1) Pastikan row snapshot ada terlebih dahulu (untuk memenuhi FK job_photo_entries → job_photos)
  {
    const { error: upErr } = await admin
      .from("job_photos")
      .upsert(
        { job_id: jobId, category_id: categoryId },
        { onConflict: "job_id,category_id" }
      );
    if (upErr) throw upErr;
  }

  // 2) Upload FULL
  {
    const { error } = await admin.storage.from(BUCKET).upload(fullPath, file, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw error;
  }

  // 3) Upload THUMB (kalau tidak ada, kita fallback pakai file full agar thumb_url tetap NOT NULL)
  if (opts.thumb) {
    const tType =
      (typeof File !== "undefined" &&
        opts.thumb instanceof File &&
        opts.thumb.type) ||
      "image/jpeg";
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(thumbPath, opts.thumb, {
        contentType: tType,
        upsert: true,
        cacheControl: "31536000",
      });
    if (error) throw error;
  } else {
    // optional: bisa saja kita tidak upload file kedua; thumb_url nanti disamakan dengan fullUrl
  }

  // 4) Ambil public URL
  const { data: fullPub } = admin.storage.from(BUCKET).getPublicUrl(fullPath);
  const { data: thumbPub } = admin.storage
    .from(BUCKET)
    .getPublicUrl(opts.thumb ? thumbPath : fullPath);
  const fullUrl = fullPub.publicUrl;
  const thumbUrl = thumbPub.publicUrl; // kalau tanpa thumb, sama dengan full

  // 5) Insert RIWAYAT (job_photo_entries) — sekarang aman karena snapshot sudah ada
  const insPayload: any = {
    job_id: jobId,
    category_id: categoryId,
    url: fullUrl,
    thumb_url: thumbUrl,
  };
  if (typeof opts.sharpness === "number") insPayload.sharpness = opts.sharpness;
  if (typeof opts.token === "number") insPayload.token = opts.token;

  const { data: entry, error: insErr } = await admin
    .from("job_photo_entries")
    .insert(insPayload)
    .select()
    .single();
  if (insErr) throw insErr;

  // 6) Update SNAPSHOT (job_photos): set url, thumb_url, selected_photo_id = entry.id
  {
    const { error } = await admin
      .from("job_photos")
      .update({
        url: fullUrl,
        thumb_url: thumbUrl,
        selected_photo_id: entry.id,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .eq("category_id", categoryId);
    if (error) throw error;
  }

  return entry as JobPhotoEntry;
}

/**
 * Update meta pada foto TERBARU untuk kombinasi (jobId, categoryId).
 * - Merge field meta lama dengan yang baru (di job_photo_entries.meta)
 * - Opsional: jika `serialNumber` ada, upsert juga ke tabel `job_serial_numbers`
 * - BONUS: selaraskan juga kolom snapshot (job_photos): serial_number, cable_meter, ocr_status
 */
export async function updateJobPhotoMeta(args: {
  jobId: string;
  categoryId: string;
  serialNumber?: string;
  meter?: number;
  ocrStatus?: string; // "barcode" | "ocr" | "done" | "error" | "idle"
  userId?: string | null;
}) {
  const { jobId, categoryId, serialNumber, meter, ocrStatus, userId } = args;

  const supabase = supabaseServer();

  // 1) Foto terbaru
  const { data: latest, error: qErr } = await supabase
    .from("job_photo_entries")
    .select("id, meta")
    .eq("job_id", jobId)
    .eq("category_id", categoryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) throw qErr;
  if (!latest) throw new Error("Belum ada foto untuk jobId/categoryId ini");

  // 2) Merge meta di riwayat
  const nowIso = new Date().toISOString();
  const patch: Record<string, any> = {
    ...(latest.meta ?? {}),
    updatedAt: nowIso,
  };
  if (typeof userId === "string") patch.updatedBy = userId;
  if (typeof serialNumber === "string") patch.serialNumber = serialNumber;
  if (typeof meter === "number") patch.meter = meter;
  if (typeof ocrStatus === "string") patch.ocrStatus = ocrStatus;

  const { data: updated, error: upErr } = await supabase
    .from("job_photo_entries")
    .update({ meta: patch })
    .eq("id", latest.id)
    .select()
    .single();
  if (upErr) throw upErr;

  // 3) (Opsional) simpan SN ke tabel khusus
  if (typeof serialNumber === "string" && serialNumber.trim()) {
    await supabase.from("job_serial_numbers").upsert(
      {
        job_id: jobId,
        label: categoryId,
        value: serialNumber.trim(),
        updated_at: nowIso,
      },
      { onConflict: "job_id,label" }
    );
  }

  // 4) Selaraskan snapshot (job_photos) — memudahkan query cepat & konsisten
  if (
    typeof serialNumber === "string" ||
    typeof meter === "number" ||
    typeof ocrStatus === "string"
  ) {
    const patchSnap: any = { updated_at: nowIso };
    if (typeof serialNumber === "string")
      patchSnap.serial_number = serialNumber;
    if (typeof meter === "number") patchSnap.cable_meter = meter;
    if (typeof ocrStatus === "string") patchSnap.ocr_status = ocrStatus;

    const { error: upSnapErr } = await supabase
      .from("job_photos")
      .update(patchSnap)
      .eq("job_id", jobId)
      .eq("category_id", categoryId);
    if (upSnapErr) throw upSnapErr;
  }

  return updated;
}
