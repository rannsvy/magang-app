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

/** Ambil user dari Bearer token atau cookie Supabase */
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
  const c = await cookies(); // sync
  const accessCookie =
    c.get("sb-access-token")?.value ??
    c.get("supabase-auth-token")?.value ?? // jaga-jaga nama lain
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

type GuardOK = {
  ok: true;
  uid: string;
  technicianId?: string | null;
  role: "technician" | "supervisor";
};
type GuardNG = { ok: false; res: NextResponse };

/** Izinkan teknisi ATAU supervisor */
async function assertUploader(req: Request): Promise<GuardOK | GuardNG> {
  const admin = supabaseAdmin();
  const user = await getUserFromRequest(req);

  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Ambil profile (cek technician_id) + email untuk cek supervisor
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("technician_id, email")
    .eq("id", user.id)
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

  const isTechnician = !!profile?.technician_id;
  if (isTechnician) {
    return {
      ok: true,
      uid: user.id,
      technicianId: profile?.technician_id || null,
      role: "technician",
    };
  }

  // Cek supervisor berdasarkan email
  const email = (profile?.email || user.email || "").toLowerCase();
  if (email) {
    const { data: supv, error: sErr } = await admin
      .from("supervisors")
      .select("email")
      .eq("email", email)
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
      return { ok: true, uid: user.id, technicianId: null, role: "supervisor" };
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

function toNumOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  console.log("[job-photos/upload] hit", new Date().toISOString());
  const admin = supabaseAdmin();

  try {
    const guard = await assertUploader(req);
    if (!guard.ok) return (guard as GuardNG).res;

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

    // Parent snapshot untuk FK job_photo_entries → job_photos
    {
      const { error } = await admin
        .from("job_photos")
        .upsert(
          { job_id: jobId, category_id: categoryId },
          { onConflict: "job_id,category_id" }
        );
      if (error) {
        return NextResponse.json(
          { error: `Snapshot upsert failed: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // Upload ke storage
    const ts = Date.now();
    const basePath = `${encodeURIComponent(jobId)}/${encodeURIComponent(
      categoryId
    )}`;
    const fullPath = `${basePath}/${ts}.jpg`;
    const thumbPath = `${basePath}/${ts}-thumb.jpg`;

    const [photoBuf, thumbBuf] = await Promise.all([
      photo.arrayBuffer().then((ab) => Buffer.from(ab)),
      thumb.arrayBuffer().then((ab) => Buffer.from(ab)),
    ]);

    const up1 = await admin.storage.from(BUCKET).upload(fullPath, photoBuf, {
      contentType: photo.type || "image/jpeg",
      upsert: true,
    });
    if (up1.error) throw up1.error;

    const up2 = await admin.storage.from(BUCKET).upload(thumbPath, thumbBuf, {
      contentType: thumb.type || "image/jpeg",
      upsert: true,
    });
    if (up2.error) throw up2.error;

    const { data: fullPub } = admin.storage.from(BUCKET).getPublicUrl(fullPath);
    const { data: thumbPub } = admin.storage
      .from(BUCKET)
      .getPublicUrl(thumbPath);

    // Insert riwayat (job_photo_entries)
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

    // Update snapshot (job_photos)
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
      // fallback tanpa selected_photo_id (kalau FK belum siap di skema)
      const { selected_photo_id, ...fallback } = payload;
      const { error: upErr2 } = await admin
        .from("job_photos")
        .upsert(fallback, { onConflict: "job_id,category_id" });
      if (upErr2) {
        return NextResponse.json({ error: upErr2.message }, { status: 500 });
      }
    }

    // Poin (best-effort)
    try {
      await admin.rpc("add_point_for_upload", {
        p_technician_id: guard.technicianId ?? null,
        p_user_id: guard.uid,
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
      role: guard.role,
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
