// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // WAJIB: service role key (server)
export const runtime = "nodejs";

const BUCKET = "job-photos";

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

export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      const peek = (await req.text()).slice(0, 60);
      return NextResponse.json(
        {
          error:
            "Unsupported Content-Type. Kirim sebagai multipart/form-data (photo, thumb, jobId, categoryId[, meter, serialNumber]).",
          peek,
        },
        { status: 415 }
      );
    }

    const form = await req.formData();
    const photo = form.get("photo") as File | null;
    const thumb = form.get("thumb") as File | null;
    const jobId = String(form.get("jobId") || "");
    const categoryId = String(form.get("categoryId") || "");

    const meterStr = form.get("meter")?.toString();
    const serialNumber = form.get("serialNumber")?.toString();

    if (!photo || !thumb || !jobId || !categoryId) {
      return NextResponse.json(
        { error: "photo, thumb, jobId, categoryId required" },
        { status: 400 }
      );
    }

    await ensureBucketExists();

    // Path penyimpanan
    const ts = Date.now();
    const basePath = `${encodeURIComponent(jobId)}/${encodeURIComponent(
      categoryId
    )}`;
    const fullPath = `${basePath}/${ts}.jpg`;
    const thumbPath = `${basePath}/${ts}-thumb.jpg`;

    // File -> Buffer
    const [photoBuf, thumbBuf] = await Promise.all([
      photo.arrayBuffer().then((ab) => Buffer.from(ab)),
      thumb.arrayBuffer().then((ab) => Buffer.from(ab)),
    ]);
    const fullMime = photo.type || "image/jpeg";
    const thumbMime = thumb.type || "image/jpeg";

    // Upload ke Storage
    const up1 = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(fullPath, photoBuf, { contentType: fullMime, upsert: true });
    if (up1.error) throw up1.error;

    const up2 = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(thumbPath, thumbBuf, { contentType: thumbMime, upsert: true });
    if (up2.error) throw up2.error;

    const { data: fullPub } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(fullPath);
    const { data: thumbPub } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(thumbPath);

    // Siapkan metadata untuk tabel job_photos
    const meterNum =
      meterStr != null && meterStr !== "" ? Number(meterStr) : null;

    const payload: any = {
      job_id: jobId, // pastikan tipe kolom sesuai (uuid/text)
      category_id: categoryId, // pastikan tipe kolom sesuai
      url: fullPub.publicUrl,
      thumb_url: thumbPub.publicUrl,
      updated_at: new Date().toISOString(),
    };
    if (serialNumber) payload.serial_number = serialNumber;
    if (Number.isFinite(meterNum)) payload.cable_meter = meterNum;

    const { error: upErr } = await supabaseAdmin
      .from("job_photos")
      .upsert(payload, { onConflict: "job_id,category_id" })
      .select("job_id")
      .maybeSingle();
    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      photoUrl: fullPub.publicUrl,
      thumbUrl: thumbPub.publicUrl,
    });
  } catch (e: any) {
    console.error("[job-photos/upload] ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
