// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabaseServer";
import crypto from "crypto";

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

type GuardOK = { ok: true; uid: string; technicianId: string };
type GuardNG = { ok: false; res: NextResponse };

async function assertTechnician(): Promise<GuardOK | GuardNG> {
  const supabase = supabaseServer();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const uid = auth.user.id;
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("technician_id")
    .eq("id", uid)
    .maybeSingle();

  if (profErr) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: profErr.message || "Auth failed" },
        { status: 500 }
      ),
    };
  }

  const technicianId = profile?.technician_id as string | null;
  if (!technicianId) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Forbidden: hanya teknisi yang dapat mengunggah foto." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, uid, technicianId };
}

export async function POST(req: Request) {
  try {
    // === Guard peran (lebih awal) ===
    const guard = await assertTechnician();
    if (!guard.ok) return guard.res;
    const { uid, technicianId } = guard;

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

    // Optional token (untuk de-dupe event)
    const tokenRaw = form.get("token")?.toString();
    const tokenNum = tokenRaw ? Number(tokenRaw) : null;

    if (!photo || !thumb || !jobId || !categoryId) {
      return NextResponse.json(
        { error: "photo, thumb, jobId, categoryId required" },
        { status: 400 }
      );
    }

    await ensureBucketExists();

    // Path file
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

    // Simpan entry riwayat (best-effort)
    const entryId = crypto.randomUUID();
    let entryInserted = false;
    try {
      const { error: histErr } = await supabaseAdmin
        .from("job_photo_entries")
        .insert({
          id: entryId,
          job_id: jobId,
          category_id: categoryId,
          url: fullPub.publicUrl,
          thumb_url: thumbPub.publicUrl,
          created_at: new Date().toISOString(),
          sharpness: null,
          token: tokenNum,
        });
      if (!histErr) entryInserted = true;
    } catch {
      /* ignore */
    }

    // Upsert snapshot terbaru ke job_photos
    const payload: any = {
      job_id: jobId,
      category_id: categoryId,
      url: fullPub.publicUrl,
      thumb_url: thumbPub.publicUrl,
      updated_at: new Date().toISOString(),
    };
    if (serialNumber) payload.serial_number = serialNumber;
    const meterNum =
      meterStr != null && meterStr !== "" ? Number(meterStr) : null;
    if (Number.isFinite(meterNum)) payload.cable_meter = meterNum;

    let upsertOk = false;
    try {
      payload.selected_photo_id = entryId; // jika tabel riwayat ada
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

    // === Tambah 1 poin (WIB-aware, de-dupe by token) ===
    try {
      await supabaseAdmin.rpc("add_point_for_upload", {
        p_technician_id: guard.technicianId,
        p_user_id: guard.uid,
        p_job_id: jobId,
        p_category_id: categoryId,
        p_entry_id: entryInserted ? entryId : null,
        p_token: tokenNum ?? null,
      });
    } catch (e) {
      console.warn("[points] award failed:", e);
      // tidak mematikan flow upload
    }

    return NextResponse.json({
      ok: true,
      photoUrl: fullPub.publicUrl,
      thumbUrl: thumbPub.publicUrl,
      entryId,
    });
  } catch (e: any) {
    console.error("[job-photos/upload] ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
