// app/api/job-photos/[jobId]/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";
import { PHOTO_TEMPLATE } from "@/lib/photoTemplate";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  const { jobId: raw } = await ctx.params;
  const jobId = decodeURIComponent(raw ?? "");
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const supabase = supabaseServer();

  // === Status project ===
  const pj = await supabase
    .from("projects")
    .select("status, pending_since, pending_reason")
    .eq("job_id", jobId)
    .maybeSingle();

  const isPending =
    (pj.data?.status as string) === "pending" ||
    pj.data?.pending_since !== null ||
    pj.data?.pending_reason !== null;

  // === Ambil meta foto per kategori ===
  const { data, error } = await supabase
    .from("job_photos")
    .select("category_id, url, thumb_url, serial_number, cable_meter")
    .eq("job_id", jobId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byCat = new Map<string, any>();
  for (const row of data ?? []) byCat.set(String(row.category_id), row);

  // urut berdasarkan template
  const template = PHOTO_TEMPLATE.slice().sort(
    (a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0)
  );

  const items = template.map((tpl: any) => {
    const r = byCat.get(tpl.id);

    // Hanya kategori cable yang boleh punya meter
    let meter: number | null = null;
    if (tpl.type === "photo+cable" && r?.cable_meter != null) {
      const n = Number(r.cable_meter);
      meter = Number.isFinite(n) ? n : null;
    }

    return {
      id: tpl.id,
      name: tpl.name,
      type: tpl.type, // opsional kalau mau dipakai UI
      requiresSerialNumber: tpl.type === "photo+sn",
      requiresCable: tpl.type === "photo+cable", // ← FLAG BARU
      photoThumb: r?.thumb_url ?? null,
      photo: r?.url ?? null,
      serialNumber: r?.serial_number ?? null,
      meter, // number|null — hanya terisi untuk type photo+cable
    };
  });

  // === Progres (tetap: butuh foto; kalau type photo+sn juga butuh SN)
  const total = template.length;
  const complete = items.filter((it: any) => {
    const hasImg = !!(it.photoThumb || it.photo);
    if (!hasImg) return false;
    if (it.requiresSerialNumber && !it.serialNumber) return false;
    return true;
  }).length;
  const percent = total ? Math.round((complete / total) * 100) : 0;

  return NextResponse.json({
    items,
    status: isPending ? "pending" : "active",
    progress: { total, complete, percent },
  });
}
