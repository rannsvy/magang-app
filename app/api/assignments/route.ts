// /app/api/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers"; // server-side client (RLS ON)
import { supabaseAdmin, supabaseAdmins } from "@/lib/supabaseAdmin"; // admin client (service-role, RLS BYPASS)

type ShapedAssignment = {
  projectId: string;
  technicianId: string; // UUID teknisi atau vehicle-code "car-01"
  technicianName: string;
  inisial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
  supervisor?: { id: string; name: string; nickname: string } | null;
};

/* ===================== Helpers ===================== */
function nowWIBIso(): string {
  const wibMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().replace("Z", "+07:00");
}
function prevDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function toWIBDate(isoTs?: string | null) {
  if (!isoTs) return null;
  const t = new Date(isoTs);
  if (Number.isNaN(t.getTime())) return null;
  const wibMs = t.getTime() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().slice(0, 10);
}
function initialFrom(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return "?";
  const tokens = raw.split(/\s+/);
  let tok = tokens[tokens.length - 1] || tokens[0] || "";
  if (!/[A-Za-z\u00C0-\u024F]/.test(tok)) tok = tokens[0] || "";
  const ch = (tok.match(/[A-Za-z\u00C0-\u024F]/) || [tok[0] || "?"])[0];
  return (ch || "?").toUpperCase();
}

/* ====================================================================== */
/* ===============================  GET  ================================ */
/* ====================================================================== */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { error: "Query ?date=YYYY-MM-DD wajib ada" },
      { status: 400 }
    );
  }

  const sb = supabaseServer();

  // A) Ambil penugasan harian (gabungan)
  const { data: paDaily, error: paDailyErr } = await sb
    .from("project_assignments")
    .select(
      "project_id, technician_id, vehicle_id, is_leader, removed_at, supervisor_id, supervisor_name"
    )
    .eq("work_date", date)
    .is("removed_at", null);

  if (paDailyErr) {
    return NextResponse.json({ error: paDailyErr.message }, { status: 500 });
  }

  if ((paDaily?.length ?? 0) > 0) {
    // kumpulkan id teknisi & kendaraan
    const techIds = Array.from(
      new Set(
        paDaily
          .filter((r) => r.technician_id)
          .map((r) => r.technician_id as string)
      )
    );
    const vehIds = Array.from(
      new Set(
        paDaily.filter((r) => r.vehicle_id).map((r) => r.vehicle_id as string)
      )
    );

    // meta teknisi
    let techMap = new Map<string, { inisial: string; name: string }>();
    if (techIds.length) {
      const { data: techs, error: tErr } = await sb
        .from("technicians")
        .select("id, inisial, nama_panggilan, nama_lengkap")
        .in("id", techIds);
      if (tErr)
        return NextResponse.json({ error: tErr.message }, { status: 500 });
      for (const t of techs ?? []) {
        techMap.set(t.id, {
          inisial: String(t.inisial ?? "?").toUpperCase(),
          name:
            (t.nama_panggilan as string | null) ??
            (t.nama_lengkap as string | null) ??
            String(t.id),
        });
      }
    }

    // meta kendaraan
    let vehMap = new Map<string, { code: string; model: string }>();
    if (vehIds.length) {
      const { data: vehs, error: vErr } = await sb
        .from("vehicles")
        .select("id, vehicle_code, model, name")
        .in("id", vehIds);
      if (vErr)
        return NextResponse.json({ error: vErr.message }, { status: 500 });
      for (const v of vehs ?? []) {
        vehMap.set(v.id, {
          code: v.vehicle_code,
          model: v.model ?? v.name ?? "",
        });
      }
    }

    const shaped: ShapedAssignment[] = [];
    for (const r of paDaily ?? []) {
      if (r.technician_id) {
        const meta = techMap.get(r.technician_id);
        shaped.push({
          projectId: r.project_id,
          technicianId: r.technician_id,
          technicianName: meta?.name ?? r.technician_id,
          inisial: meta?.inisial ?? "?",
          isProjectLeader: !!r.is_leader,
          isSelected: true,
          supervisor: r.is_leader
            ? r.supervisor_id
              ? {
                  id: r.supervisor_id,
                  name: r.supervisor_name ?? "",
                  nickname: r.supervisor_name ?? "",
                }
              : null
            : undefined,
        });
      } else if (r.vehicle_id) {
        const meta = vehMap.get(r.vehicle_id);
        const model = meta?.model ?? "";
        shaped.push({
          projectId: r.project_id,
          technicianId: meta?.code || "car-??",
          technicianName: model || (meta?.code ?? "Kendaraan"),
          inisial: initialFrom(model || meta?.code || "C"),
          isProjectLeader: !!r.is_leader,
          isSelected: true,
        });
      }
    }

    return NextResponse.json({ data: shaped });
  }

  /* ----------------- Fallback lama (attendance + carry D-1) ----------------- */
  const dMinus1 = prevDate(date);
  const [
    { data: attToday, error: attErr },
    { data: attPrev, error: attPrevErr },
  ] = await Promise.all([
    sb
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", date),
    sb
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", dMinus1),
  ]);
  if (attErr)
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (attPrevErr)
    return NextResponse.json({ error: attPrevErr.message }, { status: 500 });

  const todayCountByProject = new Map<string, number>();
  const selectedTodaySet = new Set<string>();
  const leaderTodaySet = new Set<string>();
  for (const r of attToday ?? []) {
    const key = `${r.project_id}::${r.technician_id}`;
    selectedTodaySet.add(key);
    todayCountByProject.set(
      r.project_id,
      (todayCountByProject.get(r.project_id) ?? 0) + 1
    );
    if (r.project_leader) leaderTodaySet.add(key);
  }

  const prevByProject = new Map<
    string,
    Array<{
      project_id: string;
      technician_id: string;
      project_leader?: boolean;
    }>
  >();
  for (const r of attPrev ?? []) {
    const arr = prevByProject.get(r.project_id) ?? [];
    arr.push(r);
    prevByProject.set(r.project_id, arr);
  }

  const { data: pa, error: paErr } = await sb
    .from("project_assignments")
    .select(
      `
      project_id,
      technician_id,
      technician_name,
      is_leader,
      removed_at,
      technicians:technician_id ( id, inisial, nama_lengkap, nama_panggilan )
    `
    )
    .is("removed_at", null);
  if (paErr)
    return NextResponse.json({ error: paErr.message }, { status: 500 });

  const activeMembershipSet = new Set<string>();
  const membershipLeaderKeys = new Set<string>();
  for (const row of pa ?? []) {
    if (!row.technician_id) continue;
    const key = `${row.project_id}::${row.technician_id}`;
    activeMembershipSet.add(key);
    if (row.is_leader) membershipLeaderKeys.add(key);
  }

  const candidateProjectIds = new Set<string>();
  for (const r of pa ?? [])
    if (r.technician_id) candidateProjectIds.add(r.project_id);
  for (const r of attToday ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attPrev ?? []) candidateProjectIds.add(r.project_id);
  if (candidateProjectIds.size === 0) return NextResponse.json({ data: [] });

  const { data: projects, error: projErr } = await sb
    .from("projects")
    .select(
      "id, project_status, pending_reason, tanggal_mulai, tanggal_deadline, closed_at, completed_at"
    )
    .in("id", Array.from(candidateProjectIds))
    .lte("tanggal_mulai", date);
  if (projErr)
    return NextResponse.json({ error: projErr.message }, { status: 500 });

  const activeProjectSet = new Set<string>();
  const completedTodayProjects = new Set<string>();
  for (const p of projects ?? []) {
    if (p.project_status === "pending" || p.pending_reason) continue;
    const completedWIB = toWIBDate(p.completed_at) ?? toWIBDate(p.closed_at);
    if (!completedWIB) {
      activeProjectSet.add(p.id);
      continue;
    }
    if (date <= completedWIB) {
      activeProjectSet.add(p.id);
      if (completedWIB === date) completedTodayProjects.add(p.id);
    }
  }
  if (activeProjectSet.size === 0) return NextResponse.json({ data: [] });

  const selectedSet = new Set<string>(selectedTodaySet);
  const leaderMap = new Map<string, boolean>();
  for (const k of selectedTodaySet) leaderMap.set(k, leaderTodaySet.has(k));
  for (const pid of activeProjectSet) {
    const hasToday = (todayCountByProject.get(pid) ?? 0) > 0;
    if (!hasToday) {
      const prevRows = prevByProject.get(pid) ?? [];
      for (const r of prevRows) {
        const key = `${r.project_id}::${r.technician_id}`;
        if (!activeMembershipSet.has(key)) continue;
        selectedSet.add(key);
        leaderMap.set(key, membershipLeaderKeys.has(key) || !!r.project_leader);
      }
    }
  }
  if (completedTodayProjects.size > 0) {
    for (const row of pa ?? []) {
      if (!row.technician_id) continue;
      if (completedTodayProjects.has(row.project_id)) {
        const key = `${row.project_id}::${row.technician_id}`;
        selectedSet.add(key);
        leaderMap.set(key, !!row.is_leader);
      }
    }
  }

  type TechInfo = { id: string; inisial: string; name: string };
  const techInfoById = new Map<string, TechInfo>();
  for (const row of pa ?? []) {
    if (!row.technician_id) continue;
    const tRaw: any = row.technicians;
    const t = Array.isArray(tRaw) ? tRaw[0] ?? null : tRaw;
    const id: string = String(t?.id ?? row.technician_id);
    const inisial: string = String(t?.inisial ?? "?").toUpperCase();
    const name: string =
      (t?.nama_panggilan as string | null) ??
      (row.technician_name as string | null) ??
      (t?.nama_lengkap as string | null) ??
      id;
    techInfoById.set(row.technician_id, { id, inisial, name });
  }

  const shaped: ShapedAssignment[] = [];
  for (const key of selectedSet) {
    const [pid, tid] = key.split("::");
    if (!activeProjectSet.has(pid)) continue;
    const info: TechInfo = techInfoById.get(tid) ?? {
      id: tid,
      inisial: String(tid[0] ?? "?").toUpperCase(),
      name: tid,
    };
    shaped.push({
      projectId: pid,
      technicianId: info.id,
      technicianName: info.name,
      inisial: info.inisial,
      isProjectLeader: !!(leaderMap.get(key) ?? false),
      isSelected: true,
    });
  }

  return NextResponse.json({ data: shaped });
}

/* ====================================================================== */
/* ===============================  POST ================================ */
/* ====================================================================== */
/**
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   projectIds?: string[],
 *   assignments: [{
 *     projectId: string,
 *     technicianId: string,   // UUID teknisi ATAU "car-01"
 *     isSelected?: boolean,
 *     isProjectLeader?: boolean
 *   }],
 *   supervisors?: [{ projectId: string, supervisorId: string }]  // override manual
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date: string | undefined = body?.date;
  const items: Array<{
    projectId: string;
    technicianId: string;
    isSelected?: boolean;
    isProjectLeader?: boolean;
  }> = Array.isArray(body?.assignments) ? body.assignments : [];
  const supItems: Array<{ projectId: string; supervisorId: string }> =
    Array.isArray(body?.supervisors) ? body.supervisors : [];

  if (!date) {
    return NextResponse.json({ error: "date wajib diisi" }, { status: 400 });
  }

  // Kelompokkan per project
  const byProject = new Map<
    string,
    {
      techSelected: Set<string>;
      techLeaders: Set<string>;
      vehSelected: Set<string>;
      vehLeaders: Set<string>;
    }
  >();

  for (const it of items) {
    const bucket = byProject.get(it.projectId) ?? {
      techSelected: new Set<string>(),
      techLeaders: new Set<string>(),
      vehSelected: new Set<string>(),
      vehLeaders: new Set<string>(),
    };
    const isVehicle = it.technicianId?.startsWith?.("car-");

    if (it.isSelected !== false) {
      if (isVehicle) bucket.vehSelected.add(it.technicianId);
      else bucket.techSelected.add(it.technicianId);
    }
    if (it.isProjectLeader) {
      if (isVehicle) bucket.vehLeaders.add(it.technicianId);
      else bucket.techLeaders.add(it.technicianId);
    }
    byProject.set(it.projectId, bucket);
  }

  const projectsWithAssignments = Array.from(byProject.keys());
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectsWithAssignments;

  if (!scopeProjectIds.length && !supItems.length) {
    return NextResponse.json(
      { data: { count: 0, attendance: 0 } },
      { status: 201 }
    );
  }

  // Ambil status proyek
  const sb = supabaseServer();
  const sa = supabaseAdmins(); // <-- penting: PANGGIL fungsinya

  const { data: projRows, error: projErr } = await sb
    .from("projects")
    .select("id, project_status, pending_reason, completed_at")
    .in(
      "id",
      scopeProjectIds.length
        ? scopeProjectIds
        : supItems.map((s) => s.projectId)
    );
  if (projErr)
    return NextResponse.json({ error: projErr.message }, { status: 500 });

  const bastSet = new Set(
    (projRows ?? [])
      .filter((p) => p?.project_status === "awaiting_bast")
      .map((p) => p.id)
  );
  const pendingSet = new Set(
    (projRows ?? [])
      .filter((p) => p?.project_status === "pending" || p?.pending_reason)
      .map((p) => p.id)
  );
  const completedSet = new Set(
    (projRows ?? []).filter((p) => !!p?.completed_at).map((p) => p.id)
  );

  const activeScopeProjectIds = (
    scopeProjectIds.length ? scopeProjectIds : supItems.map((s) => s.projectId)
  ).filter(
    (id) => !pendingSet.has(id) && !completedSet.has(id) && !bastSet.has(id)
  );

  // Enforce tepat 1 leader per project (hanya untuk proyek yang disinkron assignment-nya)
  for (const pid of activeScopeProjectIds) {
    const leadersCount = byProject.get(pid)?.techLeaders?.size ?? 0;
    if (leadersCount !== 1 && projectsWithAssignments.includes(pid)) {
      return NextResponse.json(
        {
          error: `Project ${pid} wajib tepat 1 project leader (ada: ${leadersCount}).`,
        },
        { status: 400 }
      );
    }
  }

  /* ========= (BARU) Siapkan default supervisor untuk setiap LEADER ========= */
  // Kumpulkan semua technician_id yang jadi leader di payload
  const leaderTechIds = Array.from(
    new Set(
      Array.from(byProject.values()).flatMap((b) => Array.from(b.techLeaders))
    )
  );

  // Map: technician_id -> { id, name }
  type SupInfo = { id: string; name: string };
  const defaultSupByTech = new Map<string, SupInfo>();

  if (leaderTechIds.length) {
    const { data: stRows, error: stErr } = await sb
      .from("supervisor_technicians")
      .select(
        `
        supervisor_id,
        technician_id,
        supervisors:supervisor_id ( id, nickname, full_name )
      `
      )
      .in("technician_id", leaderTechIds)
      .is("removed_at", null);

    if (stErr) {
      return NextResponse.json({ error: stErr.message }, { status: 500 });
    }

    for (const r of stRows ?? []) {
      const sRaw: any = r.supervisors;
      const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
      const name = (s?.nickname ?? s?.full_name ?? "") as string;
      defaultSupByTech.set(r.technician_id as string, {
        id: (s?.id ?? r.supervisor_id) as string,
        name,
      });
    }
  }

  /* ========= 1) Attendance HARI INI (teknisi) ========= */
  if (projectsWithAssignments.length) {
    if (activeScopeProjectIds.length) {
      const { error: delErr } = await sb
        .from("attendance")
        .delete()
        .eq("work_date", date)
        .in("project_id", activeScopeProjectIds);
      if (delErr)
        return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const attRows: Array<{
      project_id: string;
      technician_id: string;
      work_date: string;
      project_leader?: boolean;
    }> = [];
    for (const pid of activeScopeProjectIds) {
      const bucket = byProject.get(pid);
      const selected = bucket?.techSelected ?? new Set<string>();
      const leaders = bucket?.techLeaders ?? new Set<string>();
      for (const tid of selected) {
        attRows.push({
          project_id: pid,
          technician_id: tid,
          work_date: date,
          project_leader: leaders.has(tid),
        });
      }
    }
    if (attRows.length) {
      const { error: insAttErr } = await sb.from("attendance").insert(attRows);
      if (insAttErr)
        return NextResponse.json({ error: insAttErr.message }, { status: 500 });
    }

    const projectsWithAnyAttendanceToday = new Set(
      attRows.map((r) => r.project_id)
    );
    for (const pid of activeScopeProjectIds) {
      const newStatus = projectsWithAnyAttendanceToday.has(pid)
        ? "ongoing"
        : "unassigned";
      const { error: upProjErr } = await sb
        .from("projects")
        .update({ project_status: newStatus })
        .eq("id", pid);
      if (upProjErr)
        return NextResponse.json({ error: upProjErr.message }, { status: 500 });
    }
  }

  /* ========= 2) Sinkron project_assignments (harian; teknisi & kendaraan) ========= */
  if (projectsWithAssignments.length && activeScopeProjectIds.length) {
    // 2.a AMBIL DULU supervisor EXISTING per PROJECT (leader) untuk tanggal ini
    const existingSupByProject = new Map<string, string>(); // project_id -> supervisor_id
    {
      const { data: existingLeaders, error: exErr } = await sa
        .from("project_assignments")
        .select("project_id, supervisor_id")
        .eq("work_date", date)
        .in("project_id", activeScopeProjectIds)
        .is("removed_at", null)
        .eq("is_leader", true);

      if (exErr) {
        return NextResponse.json({ error: exErr.message }, { status: 500 });
      }
      for (const row of existingLeaders ?? []) {
        if (row.supervisor_id) {
          existingSupByProject.set(
            row.project_id as string,
            row.supervisor_id as string
          );
        }
      }
    }

    // 2.b full replace untuk tanggal tsb & scope project
    const { error: delPADayErr } = await sa
      .from("project_assignments")
      .delete()
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds);
    if (delPADayErr)
      return NextResponse.json({ error: delPADayErr.message }, { status: 500 });

    // 2.c Vehicle code -> id (kode existing kamu)
    const allVehicleCodes = Array.from(
      new Set(
        items
          .filter(
            (i) =>
              i.isSelected !== false && i.technicianId?.startsWith?.("car-")
          )
          .map((i) => i.technicianId)
      )
    );
    const codeToVehId = new Map<string, string>();
    if (allVehicleCodes.length) {
      const { data: vehs, error: vErr } = await sb
        .from("vehicles")
        .select("id, vehicle_code")
        .in("vehicle_code", allVehicleCodes);
      if (vErr)
        return NextResponse.json({ error: vErr.message }, { status: 500 });
      for (const v of vehs ?? []) codeToVehId.set(v.vehicle_code, v.id);
    }

    type PARow = {
      work_date: string;
      project_id: string;
      technician_id?: string | null;
      vehicle_id?: string | null;
      is_leader: boolean;
      assigned_at: string;
      supervisor_id?: string | null;
    };

    const paRows: PARow[] = [];

    for (const pid of activeScopeProjectIds) {
      const bucket = byProject.get(pid);

      // teknisi
      for (const tid of bucket?.techSelected ?? []) {
        const isLeader = !!bucket?.techLeaders?.has(tid);

        // <-- INI KUNCI: kalau project ini sudah punya supervisor hasil pilihan manual,
        // gunakan itu; kalau tidak ada, baru cek default mapping (supervisor_technicians)
        let supId: string | null = null;
        if (isLeader) {
          supId =
            existingSupByProject.get(pid) ??
            defaultSupByTech.get(tid)?.id ??
            null;
        }

        paRows.push({
          work_date: date,
          project_id: pid,
          technician_id: tid,
          vehicle_id: null,
          is_leader: isLeader,
          assigned_at: nowWIBIso(),
          supervisor_id: supId,
        });
      }

      // kendaraan (tanpa supervisor)
      for (const code of bucket?.vehSelected ?? []) {
        const vid = codeToVehId.get(code);
        if (!vid) continue;
        paRows.push({
          work_date: date,
          project_id: pid,
          technician_id: null,
          vehicle_id: vid,
          is_leader: !!bucket?.vehLeaders?.has(code),
          assigned_at: nowWIBIso(),
          supervisor_id: null,
        });
      }
    }

    if (paRows.length) {
      const { error: insPaErr } = await sa
        .from("project_assignments")
        .insert(paRows);
      if (insPaErr)
        return NextResponse.json({ error: insPaErr.message }, { status: 500 });
    }
  }

  /* ========= 3A) AUTO-ASSIGN supervisor utk LEADER yg masih NULL ========= */
  if (projectsWithAssignments.length && activeScopeProjectIds.length) {
    const { data: leaderRows2, error: leadersFetchErr } = await sa
      .from("project_assignments")
      .select("id, project_id, technician_id")
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds)
      .is("removed_at", null)
      .eq("is_leader", true)
      .is("supervisor_id", null);

    if (leadersFetchErr) {
      return NextResponse.json(
        { error: leadersFetchErr.message },
        { status: 500 }
      );
    }

    if ((leaderRows2?.length ?? 0) > 0) {
      const missingTechIds = Array.from(
        new Set((leaderRows2 ?? []).map((r) => r.technician_id as string))
      );

      // Ambil mapping default supervisor (jika ada) dari bridge
      const mapByTech = new Map<string, { id: string; name: string }>();
      if (missingTechIds.length) {
        const { data: stRows, error: stErr } = await sb
          .from("supervisor_technicians")
          .select(
            `
            supervisor_id,
            technician_id,
            supervisors:supervisor_id ( id, nickname, full_name )
          `
          )
          .in("technician_id", missingTechIds)
          .is("removed_at", null);

        if (stErr) {
          return NextResponse.json({ error: stErr.message }, { status: 500 });
        }

        for (const r of stRows ?? []) {
          const sRaw: any = r.supervisors;
          const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
          mapByTech.set(
            r.technician_id,
            s
              ? {
                  id: s.id as string,
                  name: (s.nickname ?? s.full_name) as string,
                }
              : { id: r.supervisor_id as string, name: "" }
          );
        }
      }

      // Update satu per satu (aman terkait RLS karena pakai admin)
      for (const row of leaderRows2 ?? []) {
        const sup = mapByTech.get(row.technician_id as string);
        if (!sup) continue;
        const { error: upErr } = await sa
          .from("project_assignments")
          .update({ supervisor_id: sup.id }) // trigger akan isi supervisor_name
          .eq("id", row.id);
        if (upErr) {
          return NextResponse.json({ error: upErr.message }, { status: 500 });
        }
      }
    }
  }

  /* ========= 3B) MANUAL override supervisor (dari UI) ========= */
  for (const { projectId: pid, supervisorId: sid } of supItems) {
    if (!activeScopeProjectIds.includes(pid)) continue;

    const { data: leaderRow, error: leaderErr } = await sa
      .from("project_assignments")
      .select("id")
      .eq("work_date", date)
      .eq("project_id", pid)
      .is("removed_at", null)
      .eq("is_leader", true)
      .maybeSingle();

    if (leaderErr)
      return NextResponse.json({ error: leaderErr.message }, { status: 500 });
    if (!leaderRow) {
      return NextResponse.json(
        {
          error: `Leader untuk project ${pid} belum ada, tidak bisa set supervisor.`,
        },
        { status: 400 }
      );
    }

    const { error: upSupErr } = await sa
      .from("project_assignments")
      .update({ supervisor_id: sid }) // trigger isi supervisor_name
      .eq("id", leaderRow.id);

    if (upSupErr)
      return NextResponse.json({ error: upSupErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        count: projectsWithAssignments.length,
        attendance: (items || []).length,
      },
    },
    { status: 201 }
  );
}
