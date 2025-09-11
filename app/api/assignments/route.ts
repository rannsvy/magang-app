// /app/api/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/** Payload untuk UI grid */
type ShapedAssignment = {
  projectId: string;
  technicianCode: string;
  initial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
};

/* ===================== Helpers Waktu ===================== */
// ISO dengan offset +07:00 (WIB) untuk cap waktu sekarang
function nowWIBIso(): string {
  const wibMs = Date.now() + 7 * 60 * 60 * 1000; // UTC -> WIB
  return new Date(wibMs).toISOString().replace("Z", "+07:00");
}

// YYYY-MM-DD - 1 hari
function prevDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Timestamp -> tanggal WIB (YYYY-MM-DD)
function toWIBDate(isoTs?: string | null) {
  if (!isoTs) return null;
  const t = new Date(isoTs);
  if (Number.isNaN(t.getTime())) return null;
  const wibMs = t.getTime() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().slice(0, 10);
}

/* ===================== GET =====================
 * /api/assignments?date=YYYY-MM-DD
 * - Attendance H; fallback D-1 (sekali)
 * - Proyek pending disembunyikan
 * - Proyek selesai tampil H (WIB) saja; H+1 menghilang
 * - H (WIB) selesai: semua membership aktif ikut terlihat walau tanpa attendance
 * - Leader selalu terlihat (tak bergantung isSelected)
 * ================================================= */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { error: "Query ?date=YYYY-MM-DD wajib ada" },
      { status: 400 }
    );
  }

  const dMinus1 = prevDate(date);

  // 0) Attendance H & D-1 (tanpa filter project)
  const [
    { data: attToday, error: attErr },
    { data: attPrev, error: attPrevErr },
  ] = await Promise.all([
    supabaseServer
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", date),
    supabaseServer
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", dMinus1),
  ]);

  if (attErr) {
    console.error("[GET /api/assignments] attendance today error:", attErr);
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  }
  if (attPrevErr) {
    console.error("[GET /api/assignments] attendance prev error:", attPrevErr);
    return NextResponse.json({ error: attPrevErr.message }, { status: 500 });
  }

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

  // 1) Membership aktif (ambil juga code/initials + info leader membership)
  const { data: pa, error: paErr } = await supabaseServer
    .from("project_assignments")
    .select(
      `
      project_id,
      technician_id,
      is_leader,
      removed_at,
      technicians:technician_id ( id, code, initials )
    `
    )
    .is("removed_at", null);

  if (paErr) {
    console.error("[GET /api/assignments] project_assignments error:", paErr);
    return NextResponse.json({ error: paErr.message }, { status: 500 });
  }

  // Map leader dari membership (agar leader selalu muncul)
  const membershipLeaderKeys = new Set<string>();
  for (const row of pa ?? []) {
    if (row.is_leader) {
      membershipLeaderKeys.add(`${row.project_id}::${row.technician_id}`);
    }
  }

  // Kandidat project dari membership + attendance
  const candidateProjectIds = new Set<string>();
  for (const r of pa ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attToday ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attPrev ?? []) candidateProjectIds.add(r.project_id);

  if (candidateProjectIds.size === 0) {
    return NextResponse.json({ data: [] });
  }

  // 2) Ambil proyek kandidat → tentukan aktif untuk 'date'
  const { data: projects, error: projErr } = await supabaseServer
    .from("projects")
    .select(
      "id, project_status, pending_reason, tanggal_mulai, tanggal_deadline, closed_at, completed_at"
    )
    .in("id", Array.from(candidateProjectIds))
    .lte("tanggal_mulai", date);

  if (projErr) {
    console.error("[GET /api/assignments] projects error:", projErr);
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const activeProjectSet = new Set<string>();
  const completedTodayProjects = new Set<string>();

  for (const p of projects ?? []) {
    // sembunyikan pending
    if (p.project_status === "pending" || p.pending_reason) continue;

    // completed/closed → tampil H (WIB) saja
    const completedWIB = toWIBDate(p.completed_at) ?? toWIBDate(p.closed_at);
    if (!completedWIB) {
      // belum selesai → tampil
      activeProjectSet.add(p.id);
      continue;
    }
    if (date <= completedWIB) {
      // tampil sampai (dan termasuk) hari selesai
      activeProjectSet.add(p.id);
      if (completedWIB === date) completedTodayProjects.add(p.id);
    }
  }

  if (activeProjectSet.size === 0) {
    return NextResponse.json({ data: [] });
  }

  // 3) selectedSet: H; jika kosong → auto-continue D-1
  const selectedSet = new Set<string>(selectedTodaySet);
  const leaderMap = new Map<string, boolean>(); // key -> isLeader
  for (const k of selectedTodaySet) leaderMap.set(k, leaderTodaySet.has(k));

  for (const pid of activeProjectSet) {
    const hasToday = (todayCountByProject.get(pid) ?? 0) > 0;
    if (!hasToday) {
      const prevRows = prevByProject.get(pid) ?? [];
      for (const r of prevRows) {
        const key = `${r.project_id}::${r.technician_id}`;
        selectedSet.add(key);
        leaderMap.set(key, !!r.project_leader);
      }
    }
  }

  // 3b) Jika proyek selesai PADA HARI INI (WIB), tampilkan SEMUA membership aktif,
  //     walau belum ada attendance H → dan set leader dari membership.
  if (completedTodayProjects.size > 0) {
    for (const row of pa ?? []) {
      if (completedTodayProjects.has(row.project_id)) {
        const key = `${row.project_id}::${row.technician_id}`;
        selectedSet.add(key);
        if (row.is_leader) leaderMap.set(key, true);
      }
    }
  }

  // Tambah leader membership agar selalu tampil (meski tak terpilih)
  const displayKeys = new Set<string>(selectedSet);
  for (const key of membershipLeaderKeys) {
    const [pid] = key.split("::");
    if (activeProjectSet.has(pid)) displayKeys.add(key);
  }

  if (displayKeys.size === 0) {
    return NextResponse.json({ data: [] });
  }

  // 4) Info teknisi (code/initials) dari membership → fallback table technicians
  type TechInfo = { code: string; initials: string };
  const techInfoById = new Map<string, TechInfo>();

  for (const row of pa ?? []) {
    const tRaw: any = row.technicians;
    const t = Array.isArray(tRaw) ? tRaw[0] ?? null : tRaw;
    const code: string =
      (t?.code as string | null) ?? (row.technician_id as string);
    const initials: string = String(t?.initials ?? code ?? "?").toUpperCase();
    techInfoById.set(row.technician_id, { code, initials });
  }

  const missingTechIds = new Set<string>();
  for (const key of displayKeys) {
    const [, techId] = key.split("::");
    if (!techInfoById.has(techId)) missingTechIds.add(techId);
  }

  if (missingTechIds.size) {
    const { data: techRows, error: techErr } = await supabaseServer
      .from("technicians")
      .select("id, code, initials")
      .in("id", Array.from(missingTechIds));
    if (!techErr) {
      for (const t of techRows ?? []) {
        const code: string = (t.code as string | null) ?? (t.id as string);
        const initials: string = String(
          t.initials ?? code ?? "?"
        ).toUpperCase();
        techInfoById.set(t.id, { code, initials });
      }
    } else {
      console.warn(
        "[GET /api/assignments] technicians fallback error:",
        techErr
      );
    }
  }

  // 5) Payload untuk UI (tampilkan pasangan terpilih ATAU leader)
  const shaped: ShapedAssignment[] = [];
  for (const key of displayKeys) {
    const [pid, tid] = key.split("::");
    if (!activeProjectSet.has(pid)) continue;

    const info = techInfoById.get(tid) ?? {
      code: tid,
      initials: String(tid?.[0] ?? "?").toUpperCase(),
    };

    shaped.push({
      projectId: pid,
      technicianCode: info.code,
      initial: info.initials,
      isProjectLeader: !!leaderMap.get(key) || membershipLeaderKeys.has(key),
      isSelected: selectedSet.has(key),
    });
  }

  // filter final: tampil jika dipilih ATAU leader
  const filtered = shaped.filter((x) => x.isSelected || x.isProjectLeader);
  return NextResponse.json({ data: filtered });
}

/* ===================== POST =====================
 * Menetapkan assignment & attendance HARI D
 * - Operasi hanya untuk proyek AKTIF (bukan pending & belum completed)
 * - Mendukung "hapus semua": kirim scope `projectIds` + kosongkan `assignments`
 * - Attendance dihapus/ditulis ulang untuk proyek yang disentuh & aktif
 * ================================================= */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date: string | undefined = body?.date;
  const items: Array<{
    projectId: string;
    technicianId: string; // UUID
    isSelected?: boolean;
    isProjectLeader?: boolean;
  }> = Array.isArray(body?.assignments) ? body.assignments : [];

  if (!date) {
    return NextResponse.json({ error: "date wajib diisi" }, { status: 400 });
  }

  const nowWIB = nowWIBIso();

  // Kelompokkan teknisi terpilih per project
  const byProject = new Map<string, { selected: Set<string> }>();
  for (const it of items) {
    const bucket = byProject.get(it.projectId) ?? {
      selected: new Set<string>(),
    };
    if (it.isSelected !== false) bucket.selected.add(it.technicianId);
    byProject.set(it.projectId, bucket);
  }
  const projectsWithAssignments = Array.from(byProject.keys());

  // Scope proyek yang mau disentuh:
  // - jika body.projectIds ada → gunakan itu (mendukung "hapus semua")
  // - else gunakan proyek yang dikirim di assignments
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectsWithAssignments;

  if (!scopeProjectIds.length) {
    return NextResponse.json({ data: { count: 0 } }, { status: 201 });
  }

  // Ambil status proyek → skip pending & completed (pakai completed_at sebagai acuan selesai)
  const { data: projRows, error: projErr } = await supabaseServer
    .from("projects")
    .select("id, project_status, pending_reason, completed_at")
    .in("id", scopeProjectIds);

  if (projErr) {
    console.error("[POST /api/assignments] fetch projects error:", projErr);
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const pendingSet = new Set(
    (projRows ?? [])
      .filter((p: any) => p?.project_status === "pending" || p?.pending_reason)
      .map((p: any) => p.id)
  );
  const completedSet = new Set(
    (projRows ?? []).filter((p: any) => !!p?.completed_at).map((p: any) => p.id)
  );

  // Hanya proyek aktif yang boleh dimodifikasi
  const activeScopeProjectIds = scopeProjectIds.filter(
    (id) => !pendingSet.has(id) && !completedSet.has(id)
  );

  /* 1) SOFT-DELETE membership yang tidak lagi dipilih (per proyek aktif)
     - Jika selected kosong → semua membership aktif di proyek tsb disoft-delete
  */
  for (const pid of activeScopeProjectIds) {
    const selected = Array.from(byProject.get(pid)?.selected ?? []);
    let q = supabaseServer
      .from("project_assignments")
      .update({ removed_at: nowWIB, is_leader: false })
      .eq("project_id", pid)
      .is("removed_at", null);

    if (selected.length > 0) {
      const notInList =
        "(" + selected.map((s) => `"${s.replace(/"/g, '""')}"`).join(",") + ")";
      q = q.not("technician_id", "in", notInList);
    }

    const { error: rmErr } = await q;
    if (rmErr) {
      console.error("[POST /api/assignments] soft-delete error:", rmErr);
      return NextResponse.json({ error: rmErr.message }, { status: 500 });
    }
  }

  /* 2) INSERT membership baru yang belum aktif (aktif saja) */
  let activePairs: Array<{ project_id: string; technician_id: string }> = [];
  if (activeScopeProjectIds.length) {
    const { data: act, error: actErr } = await supabaseServer
      .from("project_assignments")
      .select("project_id, technician_id")
      .in("project_id", activeScopeProjectIds)
      .is("removed_at", null);
    if (actErr) {
      console.error(
        "[POST /api/assignments] fetch active memberships error:",
        actErr
      );
      return NextResponse.json({ error: actErr.message }, { status: 500 });
    }
    activePairs = act ?? [];
  }

  const activeSet = new Set(
    activePairs.map((r) => `${r.project_id}::${r.technician_id}`)
  );

  const toInsert: Array<{
    project_id: string;
    technician_id: string;
    assigned_at: string;
    is_leader: boolean;
    removed_at: null;
  }> = [];

  for (const [pid, bucket] of byProject.entries()) {
    if (!activeScopeProjectIds.includes(pid)) continue;
    for (const tid of bucket.selected) {
      const key = `${pid}::${tid}`;
      if (!activeSet.has(key)) {
        toInsert.push({
          project_id: pid,
          technician_id: tid,
          assigned_at: nowWIB,
          is_leader: false,
          removed_at: null,
        });
        activeSet.add(key);
      }
    }
  }

  if (toInsert.length) {
    const { error: insErr } = await supabaseServer
      .from("project_assignments")
      .insert(toInsert);
    if (insErr) {
      console.error("[POST /api/assignments] insert membership error:", insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  /* 3) Sinkronisasi leader (maks 1 aktif) – proyek aktif saja */
  const leadersByProject = new Map<string, string[]>();
  for (const it of items) {
    if (it.isProjectLeader) {
      const arr = leadersByProject.get(it.projectId) ?? [];
      arr.push(it.technicianId);
      leadersByProject.set(it.projectId, arr);
    }
  }

  for (const [projectId, leaders] of leadersByProject.entries()) {
    if (!activeScopeProjectIds.includes(projectId)) continue;

    const { error: clrErr } = await supabaseServer
      .from("project_assignments")
      .update({ is_leader: false })
      .eq("project_id", projectId)
      .is("removed_at", null);
    if (clrErr) {
      console.error("[POST /api/assignments] clear leaders error:", clrErr);
      return NextResponse.json({ error: clrErr.message }, { status: 500 });
    }

    if (leaders.length) {
      const { error: setErr } = await supabaseServer
        .from("project_assignments")
        .update({ is_leader: true })
        .eq("project_id", projectId)
        .in("technician_id", leaders)
        .is("removed_at", null);
      if (setErr) {
        console.error("[POST /api/assignments] set leaders error:", setErr);
        return NextResponse.json({ error: setErr.message }, { status: 500 });
      }
    }
  }

  /* 4) Attendance HARI D
     - Hapus & tulis ulang untuk PROYEK YANG DISENTUH & AKTIF
     - Ini juga meng-cover kasus "hapus semua" (scope via body.projectIds)
  */
  const projectsToWriteAttendance = activeScopeProjectIds; // semua yang disentuh & aktif

  if (projectsToWriteAttendance.length) {
    const { error: delErr } = await supabaseServer
      .from("attendance")
      .delete()
      .eq("work_date", date)
      .in("project_id", projectsToWriteAttendance);
    if (delErr) {
      console.error("[POST /api/assignments] delete attendance error:", delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // Ambil leader aktif terkini utk flag attendance
  let leaderRows: Array<{ project_id: string; technician_id: string }> = [];
  if (activeScopeProjectIds.length) {
    const { data: lr } = await supabaseServer
      .from("project_assignments")
      .select("project_id, technician_id")
      .in("project_id", activeScopeProjectIds)
      .eq("is_leader", true)
      .is("removed_at", null);
    leaderRows = lr ?? [];
  }
  const leaderMapByProject = new Map<string, Set<string>>();
  for (const r of leaderRows) {
    const set = leaderMapByProject.get(r.project_id) ?? new Set<string>();
    set.add(r.technician_id);
    leaderMapByProject.set(r.project_id, set);
  }

  const attRows: Array<{
    project_id: string;
    technician_id: string;
    work_date: string;
    project_leader?: boolean;
  }> = [];
  const attKey = new Set<string>();

  for (const pid of projectsToWriteAttendance) {
    const selected = byProject.get(pid)?.selected ?? new Set<string>();
    const leaderSet = leaderMapByProject.get(pid) ?? new Set<string>();
    for (const tid of selected) {
      const k = `${pid}::${tid}::${date}`;
      if (attKey.has(k)) continue;
      attKey.add(k);
      attRows.push({
        project_id: pid,
        technician_id: tid,
        work_date: date,
        project_leader: leaderSet.has(tid),
      });
    }
  }

  if (attRows.length) {
    const { error: insAttErr } = await supabaseServer
      .from("attendance")
      .insert(attRows);
    if (insAttErr) {
      console.error(
        "[POST /api/assignments] insert attendance error:",
        insAttErr
      );
      return NextResponse.json({ error: insAttErr.message }, { status: 500 });
    }
  }

  /* 5) Update project_status berbasis attendance hari D – proyek aktif saja */
  const projectsWithAnyAttendanceToday = new Set(
    attRows.map((r) => r.project_id)
  );

  for (const pid of activeScopeProjectIds) {
    const newStatus = projectsWithAnyAttendanceToday.has(pid)
      ? "ongoing"
      : "unassigned";
    const { error: upProjErr } = await supabaseServer
      .from("projects")
      .update({ project_status: newStatus })
      .eq("id", pid);
    if (upProjErr) {
      console.error(
        "[POST /api/assignments] update project status error:",
        upProjErr
      );
      return NextResponse.json({ error: upProjErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { data: { count: attRows.length } },
    { status: 201 }
  );
}
