// app/api/job-photos/upload/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "job-photos";
const MAX_OBJ = 20 * 1024 * 1024; // 20MB = limit objek di storage

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

/** Peta bantu mime <-> ext */
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
function inferImageMimeAndExt(
  file: File
): { mime: string; ext: string } | null {
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

async function getUserFromRequest(req: Request): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  const authz = req.headers.get("authorization") || "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (bearer) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return data.user;
  }

  const cookieStore = await cookies();
  const accessCookie =
    cookieStore.get("sb-access-token")?.value ??
    cookieStore.get("supabase-auth-token")?.value ??
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
  const admin = supabaseAdmin();
  const user = await getUserFromRequest(req);
  if (!user)
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };

  const { data: profile, error } = await admin
    .from("profiles")
    .select("technician_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error)
    return {
      ok: false,
      res: NextResponse.json(
        { error: error.message || "Auth failed" },
        { status: 500 }
      ),
    };

  const technicianId = (profile?.technician_id as string) || null;
  if (!technicianId)
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Forbidden: hanya teknisi yang dapat mengunggah foto." },
        { status: 403 }
      ),
    };

  return { ok: true, uid: user.id, technicianId };
}

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  try {
    const guard = await assertTechnician(req);
    if (!guard.ok) return (guard as GuardNG).res;
    const { uid, technicianId } = guard as GuardOK;

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

    await ensureBucketExists();

    // (0) pastikan parent ada
    {
      const { error } = await admin
        .from("job_photos")
        .upsert(
          { job_id: jobId, category_id: categoryId },
          { onConflict: "job_id,category_id" }
        );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // (1) upload ke storage dengan ekstensi & mime asli
    const ts = Date.now();
    const basePath = `${encodeURIComponent(jobId)}/${encodeURIComponent(
      categoryId
    )}`;
    const fullPath = `${basePath}/${ts}.${photoIE.ext}`;
    const thumbPath = `${basePath}/${ts}-thumb.${thumbIE.ext}`;

    const [photoBuf, thumbBuf] = await Promise.all([
      photo.arrayBuffer().then((ab) => Buffer.from(ab)),
      thumb.arrayBuffer().then((ab) => Buffer.from(ab)),
    ]);

    const up1 = await admin.storage.from(BUCKET).upload(fullPath, photoBuf, {
      contentType: photoIE.mime,
      upsert: true,
    });
    if (up1.error) throw up1.error;

    const up2 = await admin.storage.from(BUCKET).upload(thumbPath, thumbBuf, {
      contentType: thumbIE.mime,
      upsert: true,
    });
    if (up2.error) throw up2.error;

    const { data: fullPub } = admin.storage.from(BUCKET).getPublicUrl(fullPath);
    const { data: thumbPub } = admin.storage
      .from(BUCKET)
      .getPublicUrl(thumbPath);

    // (2) insert riwayat
    const entryId = crypto.randomUUID();
    const { error: histErr } = await admin.from("job_photo_entries").insert({
      id: entryId,
      job_id: jobId,
      category_id: categoryId,
      url: fullPub.publicUrl,
      thumb_url: thumbPub.publicUrl,
      created_at: new Date().toISOString(),
      sharpness: null,
      token: tokenNum,
    });
    if (histErr) {
      return NextResponse.json(
        { error: `Insert history failed: ${histErr.message}` },
        { status: 409 }
      );
    }

    // (3) update snapshot
    const payload: any = {
      job_id: jobId,
      category_id: categoryId,
      url: fullPub.publicUrl,
      thumb_url: thumbPub.publicUrl,
      updated_at: new Date().toISOString(),
      selected_photo_id: entryId,
    };
    if (serialNumber) payload.serial_number = serialNumber;
    const meterNum = toNumOrNull(meterStr);
    if (meterNum != null) payload.cable_meter = meterNum;

    const { error: upErr1 } = await admin
      .from("job_photos")
      .upsert(payload, { onConflict: "job_id,category_id" });
    if (upErr1) {
      const { selected_photo_id, ...fallback } = payload;
      const { error: upErr2 } = await admin
        .from("job_photos")
        .upsert(fallback, { onConflict: "job_id,category_id" });
      if (upErr2)
        return NextResponse.json({ error: upErr2.message }, { status: 500 });
    }

    // (4) poin (best-effort)
    try {
      await admin.rpc("add_point_for_upload", {
        p_technician_id: technicianId,
        p_user_id: uid,
        p_job_id: jobId,
        p_category_id: categoryId,
        p_entry_id: entryId,
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
      meter: meterNum ?? undefined,
    });
  } catch (e: any) {
    console.error("[job-photos/upload] ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
