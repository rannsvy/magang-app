// /app/api/job-photos/[jobId]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers"; // sesuaikan path jika berbeda
import { PHOTO_TEMPLATE } from "@/lib/photoTemplate";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type TemplateType = "photo" | "photo+sn" | "photo+cable";

type TemplateItem = {
  id: string;
  name: string;
  type: TemplateType;
  sort?: number | null;
};

type PhotoRow = {
  category_id: string;
  url: string | null;
  thumb_url: string | null;
  serial_number: string | null;
  cable_meter: number | string | null;
};

type ApiItem = {
  id: string;
  name: string;
  type: TemplateType;
  requiresSerialNumber: boolean;
  requiresCable: boolean;
  photoThumb: string | null;
  photo: string | null;
  serialNumber: string | null;
  meter: number | null; // hanya untuk type "photo+cable"
};

// ⬇️ Perubahan utama: params adalah Promise → wajib di-await
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId: raw } = await params;             // ✅ await di sini
    const jobId = decodeURIComponent(raw ?? "");
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const supabase = supabaseServer();

    // ===== Status project (pending / active) =====
    const pj = await supabase
      .from("projects")
      .select("status, pending_since, pending_reason")
      .eq("job_id", jobId)
      .maybeSingle();

    const isPending =
      !!pj.data &&
      (pj.data.status === "pending" ||
        pj.data.pending_since !== null ||
        pj.data.pending_reason !== null);

    // ===== Ambil meta foto yang sudah terunggah =====
    const { data: rows, error } = await supabase
      .from("job_photos")
      .select("category_id, url, thumb_url, serial_number, cable_meter")
      .eq("job_id", jobId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map untuk akses cepat berdasarkan category_id
    const byCat = new Map<string, PhotoRow>();
    for (const r of rows ?? []) {
      byCat.set(String(r.category_id), r);
    }

    // Urutkan template berdasar "sort" (jika ada)
    const template: TemplateItem[] = (PHOTO_TEMPLATE as TemplateItem[])
      .slice()
      .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));

    // Bangun daftar item untuk UI
    const items: ApiItem[] = template.map((tpl) => {
      const r = byCat.get(tpl.id);

      // Meter hanya valid untuk "photo+cable"
      let meter: number | null = null;
      if (tpl.type === "photo+cable" && r?.cable_meter != null) {
        const n = Number(r.cable_meter);
        meter = Number.isFinite(n) ? n : null;
      }

      return {
        id: tpl.id,
        name: tpl.name,
        type: tpl.type,
        requiresSerialNumber: tpl.type === "photo+sn",
        requiresCable: tpl.type === "photo+cable",
        photoThumb: r?.thumb_url ?? null,
        photo: r?.url ?? null,
        serialNumber: r?.serial_number ?? null,
        meter,
      };
    });

    // ===== Hitung progres =====
    const total = template.length;
    const complete = items.filter((it) => {
      const hasImg = Boolean(it.photoThumb || it.photo);
      if (!hasImg) return false;
      if (it.requiresSerialNumber && !it.serialNumber) return false;
      // Untuk "photo+cable" tidak diwajibkan meter agar dianggap lengkap.
      return true;
    }).length;

    const uploaded = complete; // alias untuk kompatibilitas frontend (X/Y)
    const percent = total ? Math.round((uploaded / total) * 100) : 0;

    // Respons lengkap
    return NextResponse.json({
      items,
      status: isPending ? "pending" : "active",
      uploaded,
      total,
      progress: {
        total,
        complete,
        uploaded,
        percent,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
