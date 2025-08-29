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

async function ensureBucket(supabase: ReturnType<typeof supabaseServer>) {
  // best-effort: kalau service role tersedia
  try {
    const { data } = await supabase.storage.listBuckets();
    if (data?.some((b) => b.name === BUCKET)) return;
    await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: "20MB",
    });
  } catch {
    // abaikan kalau tidak punya izin (bucket mungkin sudah ada)
  }
}

export async function POST(req: Request) {
  try {
    const { jobId, categoryId, dataUrl, thumbDataUrl } = await req.json();
    if (!jobId || !categoryId || !dataUrl || !thumbDataUrl)
      return NextResponse.json(
        { error: "jobId, categoryId, dataUrl, thumbDataUrl required" },
        { status: 400 }
      );

    const supabase = supabaseServer();
    await ensureBucket(supabase);

    const ts = Date.now();
    const fullPath = `${encodeURIComponent(jobId)}/${categoryId}/${ts}.jpg`;
    const thumbPath = `${encodeURIComponent(
      jobId
    )}/${categoryId}/${ts}-thumb.jpg`;

    // upload full
    const { buf: fullBuf, mime: fullMime } = dataUrlToBuffer(dataUrl);
    const up1 = await supabase.storage.from(BUCKET).upload(fullPath, fullBuf, {
      contentType: fullMime || "image/jpeg",
      upsert: true,
    });
    if (up1.error) throw up1.error;

    // upload thumb
    const { buf: thumbBuf, mime: thumbMime } = dataUrlToBuffer(thumbDataUrl);
    const up2 = await supabase.storage
      .from(BUCKET)
      .upload(thumbPath, thumbBuf, {
        contentType: thumbMime || "image/jpeg",
        upsert: true,
      });
    if (up2.error) throw up2.error;

    // public URL
    const fullUrl = supabase.storage.from(BUCKET).getPublicUrl(fullPath)
      .data.publicUrl;
    const thumbUrl = supabase.storage.from(BUCKET).getPublicUrl(thumbPath)
      .data.publicUrl;

    // upsert metadata ke table (1 row per job+category)
    const upsert = await supabase
      .from("job_photos")
      .upsert(
        {
          job_id: jobId,
          category_id: String(categoryId),
          url: fullUrl,
          thumb_url: thumbUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_id,category_id" }
      )
      .select("job_id")
      .maybeSingle();

    if (upsert.error) throw upsert.error;

    return NextResponse.json({ ok: true, photoUrl: fullUrl, thumbUrl });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
