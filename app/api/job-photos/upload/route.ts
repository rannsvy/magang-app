// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseServer } from "@/lib/supabaseServer";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "job-photos";

/* ===================== Bucket helper ===================== */
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

/* ===================== Auth helpers ===================== */
/** Ambil user dari Authorization Bearer atau cookie Supabase */
async function getUserFromRequest(req: Request): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  // 1) Authorization: Bearer <token>
  const authz = req.headers.get("authorization") || "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (bearer) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return data.user;
  }

  // 2) Cookie access token
  const c = await cookies();
  const accessCookie =
    c.get("sb-access-token")?.value ?? c.get("supabase-auth-token")?.value ?? null;

  if (accessCookie) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${accessCookie}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return data.user;
  }

  return null;
}

type GuardOK =
  | { ok: true; uid: string; role: "technician"; technicianId: string }
  | { ok: true; uid: string; role: "supervisor"; technicianId: null };
type GuardNG = { ok: false; res: NextResponse };

/** Izinkan teknisi ATAU supervisor.
 * Coba session server (supabaseServer) lalu fallback ke Authorization/cookie.
 * Pakai supabaseAdmin untuk cek profile/supervisors agar bebas RLS.
 */
async function assertUploader(req: Request): Promise<GuardOK | GuardNG> {
  let uid: string | null = null;
  let email: string | null = null;

  // 1) Coba via supabaseServer (session dari cookies di request)
  try {
    const supa = supabaseServer();
    const { data: auth, error: authErr } = await supa.auth.getUser();
    if (!authErr && auth?.user) {
      uid = auth.user.id;
      email = auth.user.email ?? null;
    }
  } catch {
    // ignore
  }

  // 2) Fallback ke Authorization/cookie
  if (!uid) {
    const user = await getUserFromRequest(req);
    if (!user) {
      return {
        ok: false,
        res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    uid = user.id;
    email = user.email ?? null;
  }

  // Cek profile: teknisi?
  const { data: profile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("technician_id, email")
    .eq("id", uid)
    .maybeSingle();

  if (profErr) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: profErr.message || "Auth profile failed" },
        { status: 500 }
      ),
    };
  }

  const technicianId = profile?.technician_id as string | null;
  if (technicianId) {
    return { ok: true, uid, role: "technician", technicianId };
  }

  // Cek supervisor berdasar email (dari profile atau auth)
  const mail = (profile?.email || email || "").toLowerCase();
  if (mail) {
    const { data: supv, error: sErr } = await supabaseAdmin
      .from("supervisors")
      .select("email")
      .eq("email", mail)
      .maybeSingle();

    if (sErr) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: sErr.message || "Auth supervisor failed" },
          { status: 500 }
        ),
      };
    }
    if (supv?.email) {
      return { ok: true, uid, role: "supervisor", technicianId: null };
    }
  }

  return {
    ok: false,
    res: NextResponse.json(
      {
        error: "Forbidden: hanya teknisi atau supervisor yang dapat mengunggah foto.",
      },
      { status: 403 }
    ),
  };
}

/* ===================== Upload helpers ===================== */
function extFromMime(mime?: string | null) {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("gif")) return "gif";
  if (m.includes("bmp")) return "bmp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  return "jpg";
}

function dataUrlToBuffer(
  dataUrl: string
): { buf: Buffer; mime: string; ext: string } {
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) throw new Error("Invalid dataUrl");
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  const ext = extFromMime(mime);
  return { buf, mime, ext };
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

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ===================== Handler ===================== */
export async function POST(req: Request) {
  try {
    const guard = await assertUploader(req);
    if (!guard.ok) return (guard as GuardNG).res;

    await ensureBucketExists();

    const ct = req.headers.get("content-type") || "";

    // field umum + opsional
    let jobId = "";
    let categoryId = "";
    let serialNumber: string | null = null;
    let meterStr: string | null = null;
    let tokenRaw: string | null = null;
    let tokenNum: number | null = null;
    let sharpnessStr: string | null = null;

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
      sharpnessStr = form.get("sharpness")?.toString() ?? null;

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
      photoUrl = await uploadToSupabase(jobId, categoryId, photoBuf, photoMime, ts, "full", photoExt);
      thumbUrl = await uploadToSupabase(jobId, categoryId, thumbBuf, thumbMime, ts, "thumb", thumbExt);
    } else if (ct.includes("application/json")) {
      // === MODE: JSON dataUrl (kompat) ===
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
      sharpnessStr = body.sharpness != null ? String(body.sharpness) : null;

      if (!jobId || !categoryId || !dataUrl || !thumbDataUrl) {
        return NextResponse.json(
          { error: "jobId, categoryId, dataUrl, thumbDataUrl required" },
          { status: 400 }
        );
      }

      const full = dataUrlToBuffer(dataUrl);
      const th = dataUrlToBuffer(thumbDataUrl);

      photoUrl = await uploadToSupabase(jobId, categoryId, full.buf, full.mime, ts, "full", full.ext);
      thumbUrl = await uploadToSupabase(jobId, categoryId, th.buf, th.mime, ts, "thumb", th.ext);
    } else {
      // Content-Type tidak didukung → kasih clue
      const peek = (await req.text()).slice(0, 80);
      return NextResponse.json(
        {
          error:
            "Unsupported Content-Type. Kirim multipart/form-data (photo, thumb, jobId, categoryId[, meter, serialNumber, token, sharpness]) atau JSON {jobId, categoryId, dataUrl, thumbDataUrl[, meter, serialNumber, token, sharpness]}",
          peek,
        },
        { status: 415 }
      );
    }

    // Konversi meter & sharpness
    const meterNum =
      meterStr != null && meterStr !== "" && !Number.isNaN(Number(meterStr))
        ? Number(meterStr)
        : null;
    const sharpnessNum =
      sharpnessStr != null && sharpnessStr !== "" && !Number.isNaN(Number(sharpnessStr))
        ? Number(sharpnessStr)
        : null;

    // (Opsional) pastikan parent snapshot ada (untuk FK/relasi tertentu)
    try {
      await supabaseAdmin
        .from("job_photos")
        .upsert({ job_id: jobId, category_id: String(categoryId) }, { onConflict: "job_id,category_id" });
    } catch {
      /* best-effort */
    }

    // 1) Simpan RIWAYAT (job_photo_entries) — non-fatal
    const entryId = crypto.randomUUID();
    let entryInserted = false;
    try {
      const { error: histErr } = await supabaseAdmin.from("job_photo_entries").insert({
        id: entryId,
        job_id: jobId,
        category_id: String(categoryId),
        url: photoUrl,
        thumb_url: thumbUrl,
        created_at: new Date().toISOString(),
        sharpness: sharpnessNum,
        token: tokenNum,
      });
      if (!histErr) entryInserted = true;
    } catch {
      /* ignore agar tetap lanjut */
    }

    // 2) Upsert snapshot ke job_photos (jangan timpa selected_photo_id bila sudah ada)
    const snapshotBase: any = {
      job_id: jobId,
      category_id: String(categoryId),
      url: photoUrl,
      thumb_url: thumbUrl,
      updated_at: new Date().toISOString(),
    };
    if (serialNumber) snapshotBase.serial_number = serialNumber;
    if (Number.isFinite(meterNum as number)) snapshotBase.cable_meter = meterNum;

    let includeSelectedForFirstPhoto = false;
    try {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("job_photos")
        .select("selected_photo_id")
        .eq("job_id", jobId)
        .eq("category_id", String(categoryId))
        .maybeSingle();
      if (exErr) {
        includeSelectedForFirstPhoto = true;
      } else {
        includeSelectedForFirstPhoto = !existing || !existing.selected_photo_id;
      }
    } catch {
      includeSelectedForFirstPhoto = true;
    }

    const payload = includeSelectedForFirstPhoto
      ? { ...snapshotBase, selected_photo_id: entryId }
      : snapshotBase;

    try {
      const { error: upErr1 } = await supabaseAdmin
        .from("job_photos")
        .upsert(payload, { onConflict: "job_id,category_id" });
      if (upErr1) throw upErr1;
    } catch {
      // Kolom selected_photo_id mungkin belum ada → retry tanpa field itu
      const { selected_photo_id, ...fallbackPayload } = payload as any;
      const { error: upErr2 } = await supabaseAdmin
        .from("job_photos")
        .upsert(fallbackPayload, { onConflict: "job_id,category_id" });
      if (upErr2) {
        return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
      }
    }

    // 3) Tambah poin (leaderboard) — de-dupe by token; supervisor boleh upload tanpa poin teknisi
    try {
      await supabaseAdmin.rpc("add_point_for_upload", {
        p_technician_id: guard.role === "technician" ? guard.technicianId : null,
        p_user_id: guard.uid,
        p_job_id: jobId,
        p_category_id: String(categoryId),
        p_entry_id: entryInserted ? entryId : null,
        p_token: tokenNum ?? null,
      });
    } catch (e) {
      console.warn("[points] award failed:", e);
    }

    // Respons untuk SW/klien
    return NextResponse.json({
      ok: true,
      role: guard.role,
      jobId,
      categoryId: String(categoryId),
      photoUrl,
      thumbUrl,
      entryId,
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
