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
    // abaikan
  }
}

export async function POST(req: Request) {
  try {
    const {
      jobId,
      categoryId,
      dataUrl,
      thumbDataUrl,
      serialNumber,
      cableMeter,
    } = await req.json();

    if (!jobId || !categoryId || !dataUrl || !thumbDataUrl) {
      return NextResponse.json(
        { error: "jobId, categoryId, dataUrl, thumbDataUrl required" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();
    await ensureBucket(supabase);

    const ts = Date.now();
    const basePath = `${encodeURIComponent(jobId)}/${categoryId}`;
    const fullPath = `${basePath}/${ts}.jpg`;
    const thumbPath = `${basePath}/${ts}-thumb.jpg`;

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

    const fullUrl = supabase.storage.from(BUCKET).getPublicUrl(fullPath)
      .data.publicUrl;
    const thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(thumbPath)
      .data.publicUrl;

    // Upsert metadata (+ optional serial/cable meter)
    const payload: any = {
      job_id: jobId,
      category_id: String(categoryId),
      url: fullUrl,
      thumb_url: thumbUrl,
      updated_at: new Date().toISOString(),
    };
    if (serialNumber !== undefined)
      payload.serial_number = String(serialNumber || "");
    if (cableMeter !== undefined) {
      const n = Number(cableMeter);
      if (Number.isFinite(n)) payload.cable_meter = n; // meter
    }

    const upsert = await supabase
      .from("job_photos")
      .upsert(payload, { onConflict: "job_id,category_id" })
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
