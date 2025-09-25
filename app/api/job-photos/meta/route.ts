// app/api/job-photos/meta/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, type User } from "@supabase/supabase-js";
import { supabaseAdmin, supabaseServer } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ---------- helpers ---------- */
function parseMeter(input: unknown): number | null | undefined {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string") {
    const n = Number(input.replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Ambil user dari Authorization: Bearer <token> atau cookie Supabase (fallback) */
async function getUserFromRequest(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  // Bearer
  const authz = req.headers.get("authorization") || "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (bearer) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return { supa, user: data.user as User };
  }

  // Cookie
  const cookieStore = await cookies();
  const access =
    cookieStore.get("sb-access-token")?.value ??
    cookieStore.get("supabase-auth-token")?.value ??
    null;

  if (access) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${access}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return { supa, user: data.user as User };
  }

  return { supa: null, user: null };
}

type GuardOK = { ok: true; uid: string };
type GuardNG = { ok: false; res: NextResponse };

/** Hanya teknisi yang boleh; coba session server dulu, lalu fallback Bearer/cookie.
 * Gunakan admin client untuk cek profile agar bebas RLS.
 */
async function assertTechnician(req: Request): Promise<GuardOK | GuardNG> {
  const admin = supabaseAdmin();
  let uid: string | null = null;

  // 1) Coba session server
  try {
    const supa = supabaseServer();
    const { data: auth, error: authErr } = await supa.auth.getUser();
    if (!authErr && auth?.user) {
      uid = auth.user.id;
    }
  } catch {
    // ignore
  }

  // 2) Fallback ke Bearer/cookie
  if (!uid) {
    const { user } = await getUserFromRequest(req);
    if (!user) {
      return {
        ok: false,
        res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    uid = user.id;
  }

  // Verifikasi teknisi di profiles
  const { data: profile, error } = await admin
    .from("profiles")
    .select("technician_id")
    .eq("id", uid)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: error.message || "Auth failed" },
        { status: 500 }
      ),
    };
  }

  if (!profile?.technician_id) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Forbidden: hanya teknisi yang dapat memperbarui meta." },
        { status: 403 }
      ),
    };
  }

  return { ok: true, uid };
}

/* ---------- handler ---------- */
export async function POST(req: Request) {
  const admin = supabaseAdmin(); // bypass RLS utk validasi & upsert
  try {
    // 1) Guard
    const guard = await assertTechnician(req);
    if (!guard.ok) return guard.res;

    // 2) Body
    const body = await req.json().catch(() => ({} as any));
    const jobId = (body?.jobId ?? "").toString().trim();
    const categoryId =
      body?.categoryId !== undefined ? String(body.categoryId) : "";

    if (!jobId || !categoryId) {
      return NextResponse.json(
        { error: "jobId & categoryId required" },
        { status: 400 }
      );
    }

    // 3) Bangun payload patch snapshot
    const payload: Record<string, any> = {
      job_id: jobId,
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    };

    // serial number
    if ("serialNumber" in body) {
      const v = body.serialNumber;
      payload.serial_number =
        v === null || (typeof v === "string" && v.trim() === "")
          ? null
          : String(v).trim();
    }

    // cable meter
    if ("meter" in body) {
      const m = parseMeter(body.meter);
      if (m !== undefined) payload.cable_meter = m;
    }

    // ocr_status (string/obj/null)
    if ("ocrStatus" in body) {
      const s = body.ocrStatus;
      if (typeof s === "string") payload.ocr_status = s;
      else if (s && typeof s === "object")
        payload.ocr_status = JSON.stringify(s);
      else if (s === null) payload.ocr_status = null;
    }

    // selected_photo_id — bisa dari field langsung atau dari ocrStatus.selectedPhotoId
    let selectedPhotoId: string | null | undefined = undefined;

    if ("selectedPhotoId" in body) {
      selectedPhotoId =
        body.selectedPhotoId === null
          ? null
          : String(body.selectedPhotoId || "").trim() || null;
    }
    if (
      selectedPhotoId === undefined &&
      body?.ocrStatus &&
      typeof body.ocrStatus === "object" &&
      body.ocrStatus.selectedPhotoId
    ) {
      const sid = String(body.ocrStatus.selectedPhotoId || "").trim();
      selectedPhotoId = sid || null;
    }

    // Validasi selectedPhotoId milik job/category yang sama;
    // jika valid, sinkronkan url/thumb snapshot ke foto terpilih
    if (selectedPhotoId) {
      const { data: entry, error: e1 } = await admin
        .from("job_photo_entries")
        .select("id, url, thumb_url")
        .eq("job_id", jobId)
        .eq("category_id", categoryId)
        .eq("id", selectedPhotoId)
        .maybeSingle();

      if (e1) {
        return NextResponse.json(
          { error: `Validasi selectedPhotoId gagal: ${e1.message}` },
          { status: 400 }
        );
      }
      if (!entry) {
        return NextResponse.json(
          { error: "selectedPhotoId tidak cocok dengan job/category" },
          { status: 400 }
        );
      }

      payload.selected_photo_id = selectedPhotoId;
      if (entry.url) payload.url = entry.url;
      if (entry.thumb_url) payload.thumb_url = entry.thumb_url;
    } else if (selectedPhotoId === null) {
      payload.selected_photo_id = null; // mengosongkan pilihan
    }

    // 4) Upsert snapshot (fallback bila kolom selected_photo_id belum ada)
    try {
      const { error: upErr } = await admin
        .from("job_photos")
        .upsert(payload, { onConflict: "job_id,category_id" });
      if (upErr) throw upErr;
    } catch (e: any) {
      if (Object.prototype.hasOwnProperty.call(payload, "selected_photo_id")) {
        const { selected_photo_id, ...fallback } = payload;
        const { error: e2 } = await admin
          .from("job_photos")
          .upsert(fallback, { onConflict: "job_id,category_id" });
        if (e2) {
          return NextResponse.json(
            { error: `DB error: ${e2.message}` },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: e?.message || "DB error" },
          { status: 500 }
        );
      }
    }

    // 5) Best-effort: persist SN ke tabel reporting
    if (typeof payload.serial_number === "string" && payload.serial_number.trim()) {
      try {
        const { error: snErr } = await admin.from("job_serial_numbers").upsert(
          {
            job_id: jobId,
            label: categoryId,
            value: payload.serial_number.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_id,label" }
        );
        if (snErr) {
          console.warn("[meta] upsert job_serial_numbers ignored:", snErr.message);
        }
      } catch {
        /* no-op */
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[/api/job-photos/meta] ERROR:", e);
    return NextResponse.json(
      { error: e?.message || "Meta update failed" },
      { status: 500 }
    );
  }
}
