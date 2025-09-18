// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // Wajib: service role (server only)
import crypto from "crypto";

export const runtime = "nodejs";

const BUCKET = "job-photos";

/* ================= Helpers ================= */
function extFromMime(mime?: string | null) {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return "jpg";
}

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string; ext: string } {
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("Invalid dataUrl");
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  const ext = extFromMime(mime);
  return { buf, mime, ext };
}

async function ensureBucketExists() {
  const { data, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw error;
  if (!data?.some((b) => b.name === BUCKET)) {
    const { error: cErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "20MB",
    });
    if (cErr) throw cErr;
  }
}

async function uploadToSupabase(
  jobId: string,
  categoryId: string,
  fileBuf: Buffer,
  mime: string,
  ts: number,
  kind: "full" | "thumb",
  fileExt?: string
) {
  const ext = fileExt || extFromMime(mime);
  const base = `${encodeURIComponent(jobId)}/${encodeURIComponent(String(categoryId))}/${ts}`;
  const path = kind === "thumb" ? `${base}-thumb.${ext}` : `${base}.${ext}`;

  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, fileBuf, {
    contentType: mime || "image/jpeg",
    upsert: true,
  });
  if (up.error) throw up.error;

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* ================= Handler ================= */
export async function POST(req: Request) {
  try {
    await ensureBucketExists();

    const ct = req.headers.get("content-type") || "";

    // nilai umum + opsional
    let jobId = "";
    let categoryId = "";
    let serialNumber: string | null = null;
    let meterStr: string | null = null;
    let tokenRaw: string | null = null;
    let tokenNum: number | null = null;

    let photoUrl = "";
    let thumbUrl = "";
    const ts = Date.now();

    if (ct.includes("multipart/form-data")) {
      // === MODE: FormData (File) ===
      const form = await req.formData();

      jobId = String(form.get("jobId") || "");
      categoryId = String(form.get("categoryId") || "");

      // opsional
      serialNumber = form.get("serialNumber")?.toString() ?? null;
      meterStr = form.get("meter")?.toString() ?? null;
      tokenRaw = form.get("token")?.toString() ?? null;
      tokenNum = tokenRaw ? Number(tokenRaw) : null;

      const photo = form.get("photo") as File | null;
      const thumb = form.get("thumb") as File | null;

      if (!jobId || !categoryId || !photo || !thumb) {
        return NextResponse.json(
          { error: "photo, thumb, jobId, categoryId required" },
          { status: 400 }
        );
      }

      // File → Buffer
      const [photoBuf, thumbBuf] = await Promise.all([
        photo.arrayBuffer().then((ab) => Buffer.from(ab)),
        thumb.arrayBuffer().then((ab) => Buffer.from(ab)),
      ]);

      const photoMime = photo.type || "image/jpeg";
      const thumbMime = thumb.type || "image/jpeg";
      const photoExt = extFromMime(photoMime);
      const thumbExt = extFromMime(thumbMime);

      // Upload
      photoUrl = await uploadToSupabase(
        jobId,
        categoryId,
        photoBuf,
        photoMime,
        ts,
        "full",
        photoExt
      );
      thumbUrl = await uploadToSupabase(
        jobId,
        categoryId,
        thumbBuf,
        thumbMime,
        ts,
        "thumb",
        thumbExt
      );
    } else if (ct.includes("application/json")) {
      // === MODE: JSON dataUrl (backward-compat) ===
      const body = await req.json();
      jobId = String(body.jobId || body.j || "");
      categoryId = String(body.categoryId || body.c || "");
      const dataUrl: string | undefined = body.dataUrl;
      const thumbDataUrl: string | undefined = body.thumbDataUrl;

      // opsional
      serialNumber = body.serialNumber != null ? String(body.serialNumber) : null;
      meterStr = body.meter != null ? String(body.meter) : null;
      tokenRaw = body.token != null ? String(body.token) : null;
      tokenNum = tokenRaw ? Number(tokenRaw) : null;

      if (!jobId || !categoryId || !dataUrl || !thumbDataUrl) {
        return NextResponse.json(
          { error: "jobId, categoryId, dataUrl, thumbDataUrl required" },
          { status: 400 }
        );
      }

      const full = dataUrlToBuffer(dataUrl);
      const th = dataUrlToBuffer(thumbDataUrl);

      photoUrl = await uploadToSupabase(
        jobId,
        categoryId,
        full.buf,
        full.mime,
        ts,
        "full",
        full.ext
      );
      thumbUrl = await uploadToSupabase(
        jobId,
        categoryId,
        th.buf,
        th.mime,
        ts,
        "thumb",
        th.ext
      );
    } else {
      // Content-Type tidak didukung → kasih clue
      const peek = (await req.text()).slice(0, 80);
      return NextResponse.json(
        {
          error:
            "Unsupported Content-Type. Kirim sebagai multipart/form-data (photo, thumb, jobId, categoryId[, meter, serialNumber, token]) atau JSON {jobId, categoryId, dataUrl, thumbDataUrl[, meter, serialNumber, token]}",
          peek,
        },
        { status: 415 }
      );
    }

    // Konversi meter
    const meterNum =
      meterStr != null && meterStr !== "" && !Number.isNaN(Number(meterStr))
        ? Number(meterStr)
        : null;

    // 1) Simpan ke tabel RIWAYAT (job_photo_entries) — non-fatal bila tabel/kolom belum ada
    const entryId = crypto.randomUUID();
    try {
      const { error: histErr } = await supabaseAdmin
        .from("job_photo_entries")
        .insert({
          id: entryId,
          job_id: jobId,
          category_id: categoryId,
          url: photoUrl,
          thumb_url: thumbUrl,
          created_at: new Date().toISOString(),
          sharpness: null, // bisa dihitung di server jika ingin
          token: tokenNum,
        });
      if (histErr) {
        // Tidak fatal—lanjutkan ke snapshot
        // console.warn("[upload] job_photo_entries insert warn:", histErr.message);
      }
    } catch {
      // tabel belum ada / RLS — abaikan demi kompatibilitas
    }

    // 2) Upsert snapshot terbaru ke job_photos
    const payload: any = {
      job_id: jobId,
      category_id: String(categoryId),
      url: photoUrl,
      thumb_url: thumbUrl,
      updated_at: new Date().toISOString(),
    };
    if (serialNumber) payload.serial_number = serialNumber;
    if (Number.isFinite(meterNum as number)) payload.cable_meter = meterNum;

    // Coba sertakan selected_photo_id, fallback jika kolom belum ada
    let upsertOk = false;
    try {
      payload.selected_photo_id = entryId;
      const { error: upErr1 } = await supabaseAdmin
        .from("job_photos")
        .upsert(payload, { onConflict: "job_id,category_id" })
        .select("selected_photo_id")
        .maybeSingle();
      if (upErr1) throw upErr1;
      upsertOk = true;
    } catch {
      const { selected_photo_id, ...fallbackPayload } = payload;
      const { error: upErr2 } = await supabaseAdmin
        .from("job_photos")
        .upsert(fallbackPayload, { onConflict: "job_id,category_id" })
        .select("job_id")
        .maybeSingle();
      if (upErr2) throw upErr2;
      upsertOk = true;
    }

    if (!upsertOk) {
      return NextResponse.json(
        { error: "Failed to save snapshot" },
        { status: 500 }
      );
    }

    // Respons ramah SW (ACK)
    return NextResponse.json({
      ok: true,
      photoUrl,
      thumbUrl,
      entryId,                 // id riwayat yang baru
      categoryId: String(categoryId),
      serialNumber: serialNumber ?? null,
      meter: meterNum,
    });
  } catch (e: any) {
    console.error("[job-photos/upload] ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
