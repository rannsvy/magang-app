// app/api/job-photos/meta/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseServer";

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

/** Ambil user dari Authorization: Bearer <token> atau cookie Supabase */
async function getUserFromRequest(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  const authz = req.headers.get("authorization") || "";
  const bearer = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (bearer) {
    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data } = await supa.auth.getUser();
    if (data?.user) return { supa, user: data.user };
  }

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
    if (data?.user) return { supa, user: data.user };
  }
  return { supa: null, user: null };
}

type GuardOK = { ok: true; uid: string };
type GuardNG = { ok: false; res: NextResponse };

/** Hanya teknisi yang boleh */
async function assertTechnician(req: Request): Promise<GuardOK | GuardNG> {
  const admin = supabaseAdmin();
  const { user } = await getUserFromRequest(req);
  if (!user) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select("technician_id")
    .eq("id", user.id)
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

  return { ok: true, uid: user.id };
}

/* ---------- handler ---------- */
export async function POST(req: Request) {
  const admin = supabaseAdmin(); // bypass RLS utk validasi & upsert ringan
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

    // 3) Patch snapshot
    const patch: Record<string, any> = {
      job_id: jobId,
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    };

    // serial number
    if ("serialNumber" in body) {
      const v = body.serialNumber;
      patch.serial_number =
        v === null || (typeof v === "string" && v.trim() === "")
          ? null
          : String(v).trim();
    }

    // cable meter
    if ("meter" in body) {
      const m = parseMeter(body.meter);
      if (m !== undefined) patch.cable_meter = m;
    }

    // ocr_status (string/obj/null)
    if ("ocrStatus" in body) {
      const s = body.ocrStatus;
      if (typeof s === "string") patch.ocr_status = s;
      else if (s && typeof s === "object") patch.ocr_status = JSON.stringify(s);
      else if (s === null) patch.ocr_status = null;
    }

    // selected_photo_id — opsional & tidak mem-fail bila tidak cocok
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

    if (selectedPhotoId !== undefined) {
      if (selectedPhotoId === null) {
        patch.selected_photo_id = null;
      } else if (selectedPhotoId) {
        const { data: entry, error: e1 } = await admin
          .from("job_photo_entries")
          .select("id")
          .eq("job_id", jobId)
          .eq("category_id", categoryId)
          .eq("id", selectedPhotoId)
          .maybeSingle();

        if (e1) {
          console.warn(
            "[meta] validasi selectedPhotoId error (ignored):",
            e1.message
          );
        } else if (entry?.id) {
          patch.selected_photo_id = selectedPhotoId;
        } else {
          console.warn("[meta] selectedPhotoId mismatch — ignored");
        }
      }
    }

    // 4) Upsert snapshot (pakai admin agar tak terganjal RLS saat init)
    const { error: upErr } = await admin
      .from("job_photos")
      .upsert(patch, { onConflict: "job_id,category_id" });
    if (upErr) {
      return NextResponse.json(
        { error: `DB error: ${upErr.message}` },
        { status: 500 }
      );
    }

    // 5) Best-effort: persist SN ke tabel reporting (tanpa .catch chaining)
    if (typeof patch.serial_number === "string" && patch.serial_number.trim()) {
      try {
        const { error: snErr } = await admin.from("job_serial_numbers").upsert(
          {
            job_id: jobId,
            label: categoryId,
            value: patch.serial_number.trim(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_id,label" }
        );
        // abaikan error best-effort
        if (snErr) {
          console.warn(
            "[meta] upsert job_serial_numbers ignored:",
            snErr.message
          );
        }
      } catch (_) {
        // no-op
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
