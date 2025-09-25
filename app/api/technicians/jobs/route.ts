// app/api/technicians/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServers } from "@/lib/supabaseServers";

// Default & varian template
import { PHOTO_TEMPLATE as PHOTO_TEMPLATE_DEFAULT } from "@/lib/photoTemplate";
import { PHOTO_TEMPLATE as PHOTO_TEMPLATE_BALI_MAP } from "@/lib/photoTemplate.bali";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UiJob = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  status: "not-started" | "in-progress" | "completed";
  progress?: number | null;
  assignedTechnicians: { name: string; isLeader: boolean }[];
  type?: "survey" | "instalasi";
  building_name?: string | null;
  supervisor_name?: string | null;
  sales_name?: string | null;
  vehicle_name?: string | null;
  vehicle_names?: string[];
  // baru:
  progressDone?: number | null;
  progressTotal?: number | null;
};

type TemplateType = "photo" | "photo+sn" | "photo+cable";

type TemplateItem = {
  id: string;
  name: string;
  type: TemplateType;
  sort?: number | null;
};

const normalizeLabel = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const slugifyLabel = (label: string) =>
  normalizeLabel(label).replace(/\s+/g, "-");

const BALI_TEMPLATE_ENTRIES: Array<{
  label: string;
  normalized: string;
  slug: string;
  items: TemplateItem[];
}> = Object.entries(PHOTO_TEMPLATE_BALI_MAP).map(([label, items]) => ({
  label,
  normalized: normalizeLabel(label),
  slug: slugifyLabel(label),
  items: items as TemplateItem[],
}));

function findBaliTemplate(term?: string | null): TemplateItem[] | null {
  if (!term) return null;
  const normalizedTerm = normalizeLabel(term);
  if (!normalizedTerm) return null;

  let entry = BALI_TEMPLATE_ENTRIES.find(
    (e) => e.normalized === normalizedTerm
  );
  if (entry) return entry.items;

  entry = BALI_TEMPLATE_ENTRIES.find(
    (e) =>
      normalizedTerm.includes(e.normalized) ||
      e.normalized.includes(normalizedTerm)
  );
  if (entry) return entry.items;

  const slugTerm = slugifyLabel(term);
  entry = BALI_TEMPLATE_ENTRIES.find(
    (e) =>
      e.slug === slugTerm ||
      slugTerm.includes(e.slug) ||
      e.slug.includes(slugTerm)
  );
  if (entry) return entry.items;

  return null;
}

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );

function todayWIB() {
  const ms = Date.now() + 7 * 60 * 60 * 1000; // UTC -> WIB
  return new Date(ms).toISOString().slice(0, 10);
}

function vehicleLabel(v?: {
  model?: string | null;
  name?: string | null;
  vehicle_code?: string | null;
  plate?: string | null;
}) {
  if (!v) return null;
  const base = (v.model || v.name || v.vehicle_code || "").trim();
  const plate = (v.plate || "").trim();
  if (!base && !plate) return null;
  return plate ? `${base} (${plate})` : base;
}

/** Pilih template berdasarkan project (selalu mengembalikan array TemplateItem) */
function resolveTemplateByProject(
  templateKey?: string | null,
  templateLokasi?: string | null
): TemplateItem[] {
  const templateFromLokasi = findBaliTemplate(templateLokasi);
  if (templateFromLokasi) return templateFromLokasi;

  const templateFromKey = findBaliTemplate(templateKey);
  if (templateFromKey) return templateFromKey;

  const lok = (templateLokasi || "").toLowerCase();
  const key = (templateKey || "").toLowerCase();

  if (key.includes("bali") || lok.includes("bali")) {
    return BALI_TEMPLATE_ENTRIES[0]?.items ?? PHOTO_TEMPLATE_DEFAULT;
  }

  return PHOTO_TEMPLATE_DEFAULT;
}

/** Cek apakah email adalah sales, dan ambil identitas sales (nama & panggilan) */
async function fetchSalesIdentity(
  supabase: Awaited<ReturnType<typeof supabaseServers>>,
  email: string
): Promise<{
  isSales: boolean;
  namaLengkap?: string | null;
  namaPanggilan?: string | null;
}> {
  const em = (email || "").toLowerCase();

  // 1) email_roles
  const { data: erows } = await supabase
    .from("email_roles")
    .select("app_role")
    .eq("email", em)
    .limit(1);
  const fromRole = Array.isArray(erows) && erows[0]?.app_role === "sales";

  // 2) sales table
  const { data: srow } = await supabase
    .from("sales")
    .select("nama_lengkap, nama_panggilan, email")
    .eq("email", em)
    .maybeSingle();

  const fromSalesTable = !!srow;

  return {
    isSales: fromRole || fromSalesTable,
    namaLengkap: srow?.nama_lengkap ?? null,
    namaPanggilan: srow?.nama_panggilan ?? null,
  };
}

function dedupeCrew(list: Array<{ name: string; isLeader: boolean }>) {
  const seen = new Set<string>();
  return list.filter((it) => {
    const k = `${(it.name || "").toLowerCase()}|${it.isLeader ? 1 : 0}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function sortLeaderFirst(list: Array<{ name: string; isLeader: boolean }>) {
  return [...list].sort((a, b) =>
    a.isLeader === b.isLeader ? 0 : a.isLeader ? -1 : 1
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServers();
    const url = new URL(req.url);

    // ===== Auth
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ===== Profile
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role, technician_id, email")
      .eq("id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;

    const role = (profile?.role ?? "user").toLowerCase();
    const myTechId = profile?.technician_id ?? null;
    const email = (profile?.email || user.email || "").toLowerCase();

    // ===== Supervisor (by email)
    let mySupervisor: {
      id: string;
      role: string;
      nickname: string | null;
      full_name: string | null;
    } | null = null;

    if (email) {
      const { data: sup, error: sErr } = await supabase
        .from("supervisors")
        .select("id, role, nickname, full_name, email")
        .eq("email", email)
        .maybeSingle();
      if (sErr) throw sErr;
      if (sup) {
        mySupervisor = {
          id: String(sup.id),
          role: String(sup.role),
          nickname: (sup as any).nickname ?? null,
          full_name: (sup as any).full_name ?? null,
        };
      }
    }

    // ===== Sales (by email_roles / sales table)
    const { isSales, namaLengkap, namaPanggilan } = await fetchSalesIdentity(
      supabase,
      email
    );

    // ===== Admin like
    const isAdminEmail = (user.email ?? "").toLowerCase().includes("admin");
    const isAdmin = role === "admin" || isAdminEmail;

    const supRole = (mySupervisor?.role || "").toLowerCase().trim();
    const isManagerTier =
      supRole === "gm" ||
      supRole === "general manager" ||
      supRole === "manager";

    const isAdminLike = isAdmin || isManagerTier;

    // ===== Query params
    const workDate = url.searchParams.get("date") || todayWIB();
    const technicianParam = url.searchParams.get("technician");
    const debugAll = url.searchParams.get("debug") === "1"; // efektif untuk admin-like

    // ===== Tentukan filter akses
    let filterByTechnicianId: string | null = null;
    let filterBySupervisorId: string | null = null;
    let filterBySupervisorName: string | null = null;
    let filterBySalesNames: string[] = [];

    if (isAdminLike) {
      if (technicianParam) {
        if (isUuid(technicianParam)) {
          filterByTechnicianId = technicianParam;
        } else {
          const { data: t } = await supabase
            .from("technicians")
            .select("id, inisial, email")
            .or(
              `inisial.eq.${String(
                technicianParam
              ).toUpperCase()},email.eq.${technicianParam}`
            )
            .maybeSingle();
          if (t?.id) filterByTechnicianId = String(t.id);
        }
      }
      if (debugAll) {
        // admin-like + debug=1 -> tidak pakai filter khusus
        filterByTechnicianId = null;
        filterBySupervisorId = null;
        filterBySupervisorName = null;
        filterBySalesNames = [];
      }
    } else {
      // Non admin-like:
      if (myTechId) {
        filterByTechnicianId = myTechId; // teknisi → job miliknya
      } else if (mySupervisor) {
        // supervisor → proyek yang dipimpin
        filterBySupervisorId = mySupervisor.id;
        const nick =
          mySupervisor.nickname ||
          mySupervisor.full_name ||
          (user.user_metadata as any)?.name ||
          (user.email || "").split("@")[0];
        filterBySupervisorName = nick ? String(nick).trim() : null;
      } else if (isSales) {
        // SALES → view-only, lihat proyek miliknya (sales_name mengandung nama / panggilan / email)
        const guesses = new Set<string>();
        if (namaLengkap) guesses.add(namaLengkap);
        if (namaPanggilan) guesses.add(namaPanggilan);
        if (email) guesses.add(email);
        if (email.includes("@")) guesses.add(email.split("@")[0]); // local part
        filterBySalesNames = [...guesses].filter(Boolean);
      } else {
        return NextResponse.json(
          { error: "Akun belum terhubung ke teknisi/supervisor/sales." },
          { status: 403 }
        );
      }
    }

    // ===== Query projects (+ assignment hari itu)
    let q = supabase
      .from("projects")
      .select(
        `
        id,
        job_id,
        name,
        lokasi,
        project_status,
        closed_at,
        sales_name,
        sigma_teknisi,
        template_key,
        template_lokasi,
        project_assignments!inner(
          project_id,
          technician_id,
          technician_name,
          is_leader,
          supervisor_id,
          supervisor_name,
          removed_at,
          work_date
        )
      `
      )
      .eq("project_assignments.work_date", workDate)
      .is("project_assignments.removed_at", null)
      .order("created_at", { ascending: false });

    // Terapkan filter akses
    if (
      !isAdminLike ||
      filterByTechnicianId ||
      filterBySupervisorId ||
      filterBySupervisorName ||
      filterBySalesNames.length
    ) {
      if (filterByTechnicianId) {
        q = q.eq("project_assignments.technician_id", filterByTechnicianId);
      } else if (filterBySupervisorId) {
        q = q
          .eq("project_assignments.is_leader", true)
          .eq("project_assignments.supervisor_id", filterBySupervisorId);
      } else if (filterBySupervisorName) {
        // pakai wildcard agar robust
        q = q.ilike(
          "project_assignments.supervisor_name",
          `%${filterBySupervisorName}%`
        );
      } else if (filterBySalesNames.length) {
        const sanitize = (s: string) =>
          s.replace(/,/g, " ").replace(/\*/g, "").trim();
        const clauses = filterBySalesNames.map(
          (s) => `sales_name.ilike.*${sanitize(s)}*`
        );
        if (clauses.length) q = q.or(clauses.join(","));
      }
    }

    const { data, error } = await q;
    if (error) throw error;

    const projects = (data ?? []) as any[];
    const projectIds = projects.map((p) => String(p.id));
    const jobIds = projects.map((p) => String(p.job_id || p.id));

    // ===== Crew teknisi aktif
    const crewByProject = new Map<
      string,
      Array<{ name: string; isLeader: boolean }>
    >();
    if (projectIds.length) {
      const { data: crewRows, error: crewErr } = await supabase
        .from("project_assignments")
        .select("project_id, technician_name, is_leader")
        .eq("work_date", workDate)
        .is("removed_at", null)
        .not("technician_id", "is", null)
        .in("project_id", projectIds);
      if (crewErr) throw crewErr;
      for (const r of crewRows ?? []) {
        const pid = String(r.project_id);
        const arr = crewByProject.get(pid) ?? [];
        arr.push({
          name: r.technician_name ?? "Teknisi",
          isLeader: !!r.is_leader,
        });
        crewByProject.set(pid, arr);
      }
    }

    // ===== Kendaraan aktif per project
    const vehicleNamesByProject = new Map<string, string[]>();
    if (projectIds.length) {
      const { data: vehRows, error: vehErr } = await supabase
        .from("project_assignments")
        .select(
          `
          project_id,
          vehicles:vehicle_id (model, name, plate, vehicle_code)
        `
        )
        .eq("work_date", workDate)
        .is("removed_at", null)
        .not("vehicle_id", "is", null)
        .in("project_id", projectIds);
      if (vehErr) throw vehErr;

      for (const r of vehRows ?? []) {
        const pid = String(r.project_id);
        const v = Array.isArray((r as any).vehicles)
          ? (r as any).vehicles[0]
          : (r as any).vehicles;
        const label = vehicleLabel(v);
        if (!label) continue;
        const arr = vehicleNamesByProject.get(pid) ?? [];
        if (!arr.includes(label)) arr.push(label);
        vehicleNamesByProject.set(pid, arr);
      }
    }

    // ===== Supervisor name (leader hari ini)
    const supervisorNameByProject = new Map<string, string>();
    if (projectIds.length) {
      const { data: spvRows, error: spvErr } = await supabase
        .from("project_assignments")
        .select(
          `
          project_id,
          supervisor_name,
          supervisors:supervisor_id ( nickname, full_name )
        `
        )
        .eq("work_date", workDate)
        .is("removed_at", null)
        .eq("is_leader", true)
        .in("project_id", projectIds);
      if (spvErr) throw spvErr;

      for (const r of spvRows ?? []) {
        const sRaw: any = (r as any).supervisors;
        const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
        const nameFromJoin: string | null =
          (s?.nickname as string) ?? (s?.full_name as string) ?? null;

        const finalName = (r as any).supervisor_name ?? nameFromJoin ?? null;
        if (finalName) {
          supervisorNameByProject.set(String((r as any).project_id), finalName);
        }
      }
    }

    // ===== Deteksi survey
    const surveySet = new Set<string>();
    if (projectIds.length) {
      const rs = await supabase
        .from("project_survey_rooms")
        .select("project_id")
        .in("project_id", projectIds);
      if (rs.error && !/does not exist/i.test(rs.error.message)) throw rs.error;
      for (const r of rs.data ?? []) surveySet.add(String(r.project_id));
    }

    // ===== Progress foto per job (job_photos)
    const doneByJob = new Map<string, number>();
    const totalByJob = new Map<string, number>(); // fallback lama
    if (jobIds.length) {
      // total kategori per job_photos (fallback – akan ditimpa oleh template length)
      const { data: totRows, error: totErr } = await supabase
        .from("job_photos")
        .select("job_id, id")
        .in("job_id", jobIds);
      if (totErr && !/does not exist/i.test(totErr.message)) throw totErr;
      for (const r of totRows ?? []) {
        const k = String(r.job_id);
        totalByJob.set(k, (totalByJob.get(k) ?? 0) + 1);
      }

      // kategori yang sudah ada foto utama
      const { data: doneRows, error: doneErr } = await supabase
        .from("job_photos")
        .select("job_id, selected_photo_id, photo, thumb_url")
        .in("job_id", jobIds)
        .or(
          "selected_photo_id.not.is.null,photo.not.is.null,thumb_url.not.is.null"
        );
      if (doneErr && !/does not exist/i.test(doneErr.message)) throw doneErr;
      for (const r of doneRows ?? []) {
        const k = String(r.job_id);
        doneByJob.set(k, (doneByJob.get(k) ?? 0) + 1);
      }
    }

    // ===== Bentuk respon
    const items: UiJob[] = projects.map((p) => {
      const uiStatus: UiJob["status"] = p.closed_at
        ? "completed"
        : p.project_status === "unassigned"
        ? "not-started"
        : "in-progress";

      const pid = String(p.id);
      const jid = String(p.job_id || p.id);

      // === crew dari JOIN (inner) — sebagai fallback saja
      const joinedCrewRaw: any[] = Array.isArray((p as any).project_assignments)
        ? (p as any).project_assignments
        : [];
      const joinedCrew: Array<{ name: string; isLeader: boolean }> =
        joinedCrewRaw
          .filter((x) => !x.removed_at)
          .map((r) => ({
            name: r.technician_name ?? "Teknisi",
            isLeader: !!r.is_leader,
          }));

      // === crew “lengkap” dari query terpisah (semua teknisi pada project itu di hari tsb)
      // gunakan ini agar card menampilkan SEMUA nama teknisi
      const crewFullRaw = crewByProject.get(pid) ?? [];
      const crewFull = sortLeaderFirst(
        dedupeCrew(crewFullRaw.length ? crewFullRaw : joinedCrew)
      );

      // === progress berbasis jumlah teknisi (pakai crewFull agar konsisten)
      const sigmaTek = Number(p.sigma_teknisi ?? 0);
      const progress =
        sigmaTek > 0
          ? Math.min(100, Math.round((crewFull.length / sigmaTek) * 100))
          : null;

      // survey?
      const isSurvey = surveySet.has(pid);

      // supervisor (leader hari ini)
      const spvFromPA = supervisorNameByProject.get(pid) ?? null;
      const supervisor_name: string | null =
        spvFromPA ??
        (p.supervisor_name as string | null) ??
        (p.spv_name as string | null) ??
        null;

      // sales
      const sales_name: string | null =
        (p.sales_name as string | null) ??
        (p.sales as string | null) ??
        (p.nama_sales as string | null) ??
        null;

      // kendaraan
      const vehArr: string[] = vehicleNamesByProject.get(pid) ?? [];
      const vehicle_name: string | null = vehArr.length
        ? vehArr.join(", ")
        : null;

      // progress foto berdasarkan TEMPLATE
      const tplLen: number = resolveTemplateByProject(
        (p as any).template_key,
        (p as any).template_lokasi
      ).length;

      const progressTotal: number | null =
        tplLen > 0 ? tplLen : totalByJob.get(jid) ?? null;
      const progressDone: number | null =
        doneByJob.get(jid) ?? (progressTotal ? 0 : null);

      return {
        id: pid,
        job_id: jid,
        name: String(p.name ?? "Project"),
        lokasi: (p.lokasi as string | null) ?? null,
        status: uiStatus,
        progress,
        assignedTechnicians: crewFull, // ⬅️ PENTING: pakai crewFull (SEMUA teknisi)
        type: isSurvey ? "survey" : "instalasi",
        building_name: isSurvey ? String(p.name ?? "Gedung") : null,
        supervisor_name,
        sales_name,
        vehicle_name,
        vehicle_names: vehArr,
        progressDone,
        progressTotal,
      };
    });

    return NextResponse.json({ items, date: workDate });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}
