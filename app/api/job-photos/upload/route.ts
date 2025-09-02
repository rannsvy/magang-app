// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

const BUCKET = "job-photos";

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("Invalid dataUrl");
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  return { buf, mime };
}

async function fileToBuffer(f: File | null): Promise<{ buf: Buffer; mime: string } | null> {
  if (!f) return null;
  const arr = await f.arrayBuffer();
  return { buf: Buffer.from(arr), mime: f.type || "image/jpeg" };
}

async function ensureBucket(supabase: ReturnType<typeof supabaseServer>) {
  try {
    const { data } = await supabase.storage.listBuckets();
    if (data?.some((b) => b.name === BUCKET)) return;
    await supabase.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "20MB" });
  } catch {
    // abaikan kalau tidak punya izin (bucket sudah ada)
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();
    await ensureBucket(supabase);

    const ct = req.headers.get("content-type") || "";

    // ====== 1) Multipart (disarankan untuk PWA offline queue) ======
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const jobId = String(form.get("jobId") || "");
      const categoryId = String(form.get("categoryId") || "");
      if (!jobId || !categoryId) {
        return NextResponse.json({ error: "jobId dan categoryId wajib" }, { status: 400 });
      }

      const meterRaw = form.get("meter");
      const serialNumber = form.get("serialNumber");
      const meter = meterRaw != null && meterRaw !== "" ? Number(meterRaw) : null;

      const photoFile = form.get("photo") as File | null;
      const thumbFile = (form.get("thumb") as File | null) ?? null;
      if (!photoFile) {
        return NextResponse.json({ error: "photo file wajib" }, { status: 400 });
      }

      const ts = Date.now();
      const fullPath = `${encodeURIComponent(jobId)}/${categoryId}/${ts}.jpg`;
      const thumbPath = `${encodeURIComponent(jobId)}/${categoryId}/${ts}-thumb.jpg`;

      const full = await fileToBuffer(photoFile);
      const thumb = await fileToBuffer(thumbFile);
      if (!full) throw new Error("File kosong");

      const up1 = await supabase.storage.from(BUCKET).upload(fullPath, full.buf, {
        contentType: full.mime || "image/jpeg",
        upsert: true,
      });
      if (up1.error) throw up1.error;

      if (thumb) {
        const up2 = await supabase.storage.from(BUCKET).upload(thumbPath, thumb.buf, {
          contentType: thumb.mime || "image/jpeg",
          upsert: true,
        });
        if (up2.error) throw up2.error;
      }

      const fullUrl = supabase.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl;
      const thumbUrl = thumb
        ? supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl
        : undefined;

      const updates: any = {
        job_id: jobId,
        category_id: String(categoryId),
        url: fullUrl,
        thumb_url: thumbUrl ?? null,
        updated_at: new Date().toISOString(),
      };
      if (meter !== null && !Number.isNaN(meter)) updates.meter = meter;

      const upsertPhoto = await supabase
        .from("job_photos")
        .upsert(updates, { onConflict: "job_id,category_id" })
        .select("job_id")
        .maybeSingle();
      if (upsertPhoto.error) throw upsertPhoto.error;

      // simpan SN bila dikirim, tapi jangan gagal kalau tabelnya tidak ada
      if (serialNumber) {
        try {
          await supabase
            .from("job_serial_numbers")
            .upsert(
              {
                job_id: jobId,
                category_id: String(categoryId),
                serial_number: String(serialNumber),
                updated_at: new Date().toISOString(),
              },
              { onConflict: "job_id,category_id" }
            )
            .select("job_id")
            .maybeSingle();
        } catch {
          // ignore
        }
      }

      return NextResponse.json({ ok: true, photoUrl: fullUrl, thumbUrl: thumbUrl ?? null });
    }

    // ====== 2) JSON (kompatibel dengan versi lama) ======
    const { jobId, categoryId, dataUrl, thumbDataUrl, meter, serialNumber } = await req.json();
    if (!jobId || !categoryId || !dataUrl || !thumbDataUrl) {
      return NextResponse.json(
        { error: "jobId, categoryId, dataUrl, thumbDataUrl required" },
        { status: 400 }
      );
    }

    const ts = Date.now();
    const fullPath = `${encodeURIComponent(jobId)}/${categoryId}/${ts}.jpg`;
    const thumbPath = `${encodeURIComponent(jobId)}/${categoryId}/${ts}-thumb.jpg`;

    const { buf: fullBuf, mime: fullMime } = dataUrlToBuffer(dataUrl);
    const up1 = await supabase.storage.from(BUCKET).upload(fullPath, fullBuf, {
      contentType: fullMime || "image/jpeg",
      upsert: true,
    });
    if (up1.error) throw up1.error;

    const { buf: thumbBuf, mime: thumbMime } = dataUrlToBuffer(thumbDataUrl);
    const up2 = await supabase.storage.from(BUCKET).upload(thumbPath, thumbBuf, {
      contentType: thumbMime || "image/jpeg",
      upsert: true,
    });
    if (up2.error) throw up2.error;

    const fullUrl = supabase.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl;
    const thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;

    const updates: any = {
      job_id: jobId,
      category_id: String(categoryId),
      url: fullUrl,
      thumb_url: thumbUrl,
      updated_at: new Date().toISOString(),
    };
    if (typeof meter === "number") updates.meter = meter;

    const upsert = await supabase
      .from("job_photos")
      .upsert(updates, { onConflict: "job_id,category_id" })
      .select("job_id")
      .maybeSingle();
    if (upsert.error) throw upsert.error;

    if (serialNumber) {
      try {
        await supabase
          .from("job_serial_numbers")
          .upsert(
            {
              job_id: jobId,
              category_id: String(categoryId),
              serial_number: String(serialNumber),
              updated_at: new Date().toISOString(),
            },
            { onConflict: "job_id,category_id" }
          )
          .select("job_id")
          .maybeSingle();
      } catch {}
    }

    return NextResponse.json({ ok: true, photoUrl: fullUrl, thumbUrl });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
