// app/api/manage-projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServers } from "@/lib/supabaseServers";

/**
 * GET /api/manage-projects?query=...
 * Mengembalikan daftar project yang masih waitlist (tanggal_mulai IS NULL),
 * lengkap dengan kolom sesuai skema DB + detail paket (project_packages).
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseServers();

  const url = new URL(req.url);
  const q = (url.searchParams.get("query") || "").trim();

  // Base query: waitlist + kolom sesuai skema + relasi project_packages
  let query = supabase
    .from("projects")
    .select(
      `
      id,
      job_id,
      name,
      lokasi,
      tgl_spk_user,
      tgl_terima_po,
      tanggal_mulai,
      tanggal_deadline,
      sigma_man_days,
      sigma_hari,
      sigma_teknisi,
      status,
      closed_at,
      created_at,
      updated_at,
      jam_datang,
      jam_pulang,
      sales_name,
      presales_name,
      project_status,
      pending_reason,
      job_group_id,
      pending_since,
      template_key,
      completed_at,
      durasi_minutes,
      insentif,
      id_paket,
      id_npkt,
      project_packages ( seq, rw, rt )
    `
    )
    .is("tanggal_mulai", null) // hanya yang belum punya tanggal mulai (waitlist)
    .order("created_at", { ascending: false });

  // Pencarian opsional: name atau job_id
  if (q) {
    query = query.or(`name.ilike.%${q}%,job_id.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bentuk payload sesuai tipe WaitlistUnit yang dipakai ManageProject.tsx
  const items = (data || []).map((p: any) => {
    // urutkan detail paket supaya RW/RT tampil runtut
    const packages = Array.isArray(p.project_packages)
      ? p.project_packages.slice().sort((a: any, b: any) => (a?.seq ?? 0) - (b?.seq ?? 0))
      : [];

    return {
      // === kolom utama sesuai skema ===
      id: p.id as string,
      job_id: p.job_id as string,
      name: p.name as string,
      lokasi: p.lokasi ?? null,
      tgl_spk_user: p.tgl_spk_user ?? null,
      tgl_terima_po: p.tgl_terima_po ?? null,
      tanggal_mulai: p.tanggal_mulai ?? null, // tetap null pada waitlist
      tanggal_deadline: p.tanggal_deadline ?? null,
      sigma_man_days: Number(p.sigma_man_days ?? 0),
      sigma_hari: Number(p.sigma_hari ?? 0),
      sigma_teknisi: Number(p.sigma_teknisi ?? 0),
      status: p.status ?? "belum_diassign",
      closed_at: p.closed_at ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      jam_datang: p.jam_datang ?? null,
      jam_pulang: p.jam_pulang ?? null,
      sales_name: p.sales_name ?? null,
      presales_name: p.presales_name ?? null,
      project_status: p.project_status ?? "unassigned",
      pending_reason: p.pending_reason ?? null,
      job_group_id: p.job_group_id ?? null,
      pending_since: p.pending_since ?? null,
      template_key: p.template_key ?? null,
      completed_at: p.completed_at ?? null,
      durasi_minutes: Number(p.durasi_minutes ?? 120),
      insentif: Number(p.insentif ?? 0), // numeric -> number
      id_paket: p.id_paket ?? null,
      id_npkt: p.id_npkt ?? null,

      // === tambahan untuk kebutuhan tabel ManageProject ===
      project_packages: packages,               // seluruh daftar paket
      paket_count: packages.length,             // jumlah paket untuk kolom "Paket"
      first_rw: packages[0]?.rw ?? null,        // bisa dipakai jika mau tampilkan RW pertama
      first_rt: packages[0]?.rt ?? null,        // bisa dipakai jika mau tampilkan RT pertama
    };
  });

  return NextResponse.json({ data: items });
}
