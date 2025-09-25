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
const MAX_OBJ = 20 * 1024 * 1024; // 20MB

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

/* ===================== MIME/EXT helpers ===================== */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
};
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
  cur: "image/x-icon",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
};
function sanitizeExt(e?: string | null): string | null {
  if (!e) return null;
  const ext = e.toLowerCase().replace(/^\./, "");
  if (ext === "jpeg") return "jpg";
  if (EXT_TO_MIME[ext]) return ext;
  return null;
}
function inferImageMimeAndExt(file: File): { mime: string; ext: string } | null {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) {
    const ext = MIME_TO_EXT[t] || t.split("/")[1]?.replace("+xml", "") || "jpg";
    const normalized = sanitizeExt(ext) || "jpg";
    const mime = EXT_TO_MIME[normalized] || t;
    return { mime, ext: normalized };
  }
  const name = (file.name || "").toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot > -1) {
    const extRaw = name.slice(dot + 1);
    const ext = sanitizeExt(extRaw);
    if (ext) {
      const mime = EXT_TO_MIME[ext];
      if (mime?.startsWith("image/")) return { mime, ext };
    }
  }
  return null;
}

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

/** Izinkan teknisi ATAU supervisor. */
async function assertUploader(req: Request): Promise<GuardOK | GuardNG> {
  let uid: string | null = null;
  let email: string | null = null;

  // 1) Coba via supabaseServer (cookie session)
  try {
    const supa = supabaseServer();
    const { data: auth, error: authErr } = await supa.auth.getUser();
    if (!authErr && auth?.user) {
      uid = auth.user.id;
      email = auth.user.email ?? null;
    }
  } catch {
    /* ignore */
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

  const technicianId = (profile?.technician_id as string) || null;
  if (technicianId) {
    return { ok: true, uid, role: "technician", technicianId };
  }

  // Supervisor berdasarkan email
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
        error:
          "Forbidden: hanya teknisi atau supervisor yang dapat mengunggah foto.",
      },
      { status: 403 }
    ),
  };
}

/* ===================== Upload helper ===================== */
async function uploadToSupabase(
  jobId: string,
  categoryId: string | number,
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

    const ct = (req.headers.get("content-type") || "").toLowerCase();

    // Field umum & opsional
    let jobId = "";
    let categoryId: string | number = "";
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

      // ⇨ Validasi ukuran maksimal
      if (photo.size > MAX_OBJ) {
        return NextResponse.json(
          {
            error: `Ukuran foto (${Math.round(
              photo.size / 1024 / 1024
            )}MB) melebihi batas 20MB. Silakan crop/kompres lebih kecil.`,
          },
          { status: 413 }
        );
      }
      if (thumb.size > MAX_OBJ) {
        return NextResponse.json(
          {
            error: `Ukuran thumbnail (${Math.round(
              thumb.size / 1024 / 1024
            )}MB) melebihi batas 20MB.`,
          },
          { status: 413 }
        );
      }

      // ⇨ Validasi tipe gambar (mendukung banyak mime)
      const photoIE = inferImageMimeAndExt(photo);
      const thumbIE = inferImageMimeAndExt(thumb);
      if (!photoIE || !photoIE.mime.startsWith("image/")) {
        return NextResponse.json(
          { error: "File 'photo' bukan file gambar yang valid (image/*)." },
          { status: 415 }
        );
      }
      if (!thumbIE || !thumbIE.mime.startsWith("image/")) {
        return NextResponse.json(
          { error: "File 'thumb' bukan file gambar yang valid (image/*)." },
          { status: 415 }
        );
      }

      // File → Buffer
      const [photoBuf, thumbBuf] = await Promise.all([
        photo.arrayBuffer().then((ab) => Buffer.from(ab)),
        thumb.arrayBuffer().then((ab) => Buffer.from(ab)),
      ]);

      // Upload
      photoUrl = await uploadToSupabase(
        jobId,
        categoryId,
        photoBuf,
        photoIE.mime,
        ts,
        "full",
        photoIE.ext
      );
      thumbUrl = await uploadToSupabase(
        jobId,
        categoryId,
        thumbBuf,
        thumbIE.mime,
        ts,
        "thumb",
        thumbIE.ext
      );
    } else if (ct.includes("application/json")) {
      // === MODE: JSON dataUrl (kompat PWA) ===
      const body = await req.json();
      jobId = String(body.jobId || body.j || "");
      categoryId = String(body.categoryId || body.c || "");
      const dataUrl: string | undefined = body.dataUrl;
      const thumbDataUrl: string | undefined = body.thumbDataUrl;

      // opsional
      serialNumber =
        body.serialNumber != null ? String(body.serialNumber) : null;
      meterStr = body.meter != null ? String(body.meter) : null;
      tokenRaw = body.token != null ? String(body.token) : null;
      tokenNum = tokenRaw ? Number(tokenRaw) : null;
      sharpnessStr =
        body.sharpness != null ? String(body.sharpness) : null;

      if (!jobId || !categoryId || !dataUrl || !thumbDataUrl) {
        return NextResponse.json(
          { error: "jobId, categoryId, dataUrl, thumbDataUrl required" },
          { status: 400 }
        );
      }

      const full = dataUrlToBuffer(dataUrl);
      const th = dataUrlToBuffer(thumbDataUrl);

      // size guard for dataUrl payloads
      if (full.buf.length > MAX_OBJ) {
        return NextResponse.json(
          {
            error: `Ukuran foto (${Math.round(
              full.buf.length / 1024 / 1024
            )}MB) melebihi batas 20MB.`,
          },
          { status: 413 }
        );
      }
      if (th.buf.length > MAX_OBJ) {
        return NextResponse.json(
          {
            error: `Ukuran thumbnail (${Math.round(
              th.buf.length / 1024 / 1024
            )}MB) melebihi batas 20MB.`,
          },
          { status: 413 }
        );
      }

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
            "Unsupported Content-Type. Kirim multipart/form-data (photo, thumb, jobId, categoryId[, meter, serialNumber, token, sharpness]) atau JSON {jobId, categoryId, dataUrl, thumbDataUrl[, meter, serialNumber, token, sharpness]}",
          peek,
        },
        { status: 415 }
      );
    }

    // Konversi meter & sharpness
    const meterNum = toNumOrNull(meterStr);
    const sharpnessNum = toNumOrNull(sharpnessStr);

    // (Opsional) pastikan parent snapshot ada (untuk FK/relasi tertentu)
    try {
      await supabaseAdmin
        .from("job_photos")
        .upsert(
          { job_id: jobId, category_id: String(categoryId) },
          { onConflict: "job_id,category_id" }
        );
    } catch {
      /* best-effort */
    }

    // 1) Simpan RIWAYAT (job_photo_entries) — non-fatal
    const entryId = crypto.randomUUID();
    let entryInserted = false;
    try {
      const { error: histErr } = await supabaseAdmin
        .from("job_photo_entries")
        .insert({
          id: entryId,
          job_id: jobId,
          category_id: String(categoryId),
          url: photoUrl,
          thumb_url: thumbUrl,
          created_at: new Date().toISOString(),
          sharpness: sharpnessNum, // may be null
          token: tokenNum, // may be null
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
        return NextResponse.json(
          { error: "Failed to save snapshot" },
          { status: 500 }
        );
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
