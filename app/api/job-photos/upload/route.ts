// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "job-photos";

/* ===================== Helpers ===================== */
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

/** Verifikasi user dari Authorization Bearer ATAU dari cookie "sb-access-token" */
async function getUserFromRequest(req: Request): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  // 1) Cek Authorization: Bearer <token>
  const authz = req.headers.get("authorization") || "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (bearer) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return data.user;
  }

  // 2) Fallback: baca cookie access token (READONLY — tidak ada .set())
  const cookieStore = await cookies();
  const accessCookie =
    cookieStore.get("sb-access-token")?.value ??
    cookieStore.get("supabase-auth-token")?.value ?? // jaga-jaga jika pakai nama custom
    null;

  if (accessCookie) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessCookie}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return data.user;
  }

  return null;
}

type GuardOK = { ok: true; uid: string; technicianId: string };
type GuardNG = { ok: false; res: NextResponse };

async function assertTechnician(req: Request): Promise<GuardOK | GuardNG> {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 }) as any;
  }

  // Pakai admin agar bebas RLS ketika cek profile
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("technician_id")
    .eq("id", user.id)
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

  return { ok: true, uid: user.id, technicianId };
}

/* ===================== Handler ===================== */
export async function POST(req: Request) {
  try {
    // Guard peran
    const guard = await assertTechnician(req);
    if (!("ok" in guard) || !guard.ok) return (guard as GuardNG).res;
    const { uid, technicianId } = guard as GuardOK;

    // Validasi multipart
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      const peek = (await req.text()).slice(0, 60);
      return NextResponse.json(
        {
          error:
            "Unsupported Content-Type. Kirim multipart/form-data (photo, thumb, jobId, categoryId[, meter, serialNumber]).",
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

    try {
      payload.selected_photo_id = entryId; // kalau FK ada
      const { error: upErr1 } = await supabaseAdmin
        .from("job_photos")
        .upsert(payload, { onConflict: "job_id,category_id" })
        .select("selected_photo_id")
        .maybeSingle();
      if (upErr1) throw upErr1;
    } catch {
      const { selected_photo_id, ...fallbackPayload } = payload;
      const { error: upErr2 } = await supabaseAdmin
        .from("job_photos")
        .upsert(fallbackPayload, { onConflict: "job_id,category_id" })
        .select("job_id")
        .maybeSingle();
      if (upErr2) throw upErr2;
    }

    // Tambah poin (best-effort)
    try {
      await supabaseAdmin.rpc("add_point_for_upload", {
        p_technician_id: technicianId,
        p_user_id: uid,
        p_job_id: jobId,
        p_category_id: categoryId,
        p_entry_id: entryInserted ? entryId : null,
        p_token: tokenNum ?? null,
      });
    } catch (e) {
      console.warn("[points] award failed:", e);
    }

    return NextResponse.json({
      ok: true,
      jobId,
      categoryId,
      photoUrl: fullPub.publicUrl,
      thumbUrl: thumbPub.publicUrl,
      entryId,
      serialNumber: serialNumber ?? undefined,
      meter: Number.isFinite(Number(meterStr)) ? Number(meterStr) : undefined,
    });
  } catch (e: any) {
    console.error("[job-photos/upload] ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
