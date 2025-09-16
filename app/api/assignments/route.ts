// /app/api/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer"; // sesuai import kamu
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ShapedAssignment = {
  projectId: string;
  technicianId: string; // UUID
  technicianName: string;
  inisial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
};

/* ===================== Helpers Waktu ===================== */
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

/* ===================== GET ===================== */
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

  // 0) Attendance H & D-1
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

  // 1) Membership aktif (ambil info teknisi via relasi)
  const { data: pa, error: paErr } = await supabaseServer
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
    const key = `${row.project_id}::${row.technician_id}`;
    activeMembershipSet.add(key);
    if (row.is_leader) membershipLeaderKeys.add(key);
  }

  // 2) Filter proyek aktif di hari 'date'
  const candidateProjectIds = new Set<string>();
  for (const r of pa ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attToday ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attPrev ?? []) candidateProjectIds.add(r.project_id);

  if (candidateProjectIds.size === 0) return NextResponse.json({ data: [] });

  const { data: projects, error: projErr } = await supabaseServer
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

  // 3) Build selectedSet + leaderMap (H + carry dari D-1 saja)
  const selectedSet = new Set<string>(selectedTodaySet);
  const leaderMap = new Map<string, boolean>();

  // Flag leader untuk data H (hari ini)
  for (const k of selectedTodaySet) {
    leaderMap.set(k, leaderTodaySet.has(k));
  }

  // Jika proyek belum ada attendance H, copy dari D-1
  for (const pid of activeProjectSet) {
    const hasToday = (todayCountByProject.get(pid) ?? 0) > 0;
    if (!hasToday) {
      const prevRows = prevByProject.get(pid) ?? [];
      for (const r of prevRows) {
        const key = `${r.project_id}::${r.technician_id}`;
        if (!activeMembershipSet.has(key)) continue;
        selectedSet.add(key);
        // leader mengikuti kemarin/membership (tanpa memaksa lebih dari D-1)
        leaderMap.set(key, membershipLeaderKeys.has(key) || !!r.project_leader);
      }
    }
  }

  // Jika proyek selesai tepat H, tampilkan semua membership (leader ikut)
  if (completedTodayProjects.size > 0) {
    for (const row of pa ?? []) {
      if (completedTodayProjects.has(row.project_id)) {
        const key = `${row.project_id}::${row.technician_id}`;
        selectedSet.add(key);
        leaderMap.set(key, !!row.is_leader);
      }
    }
  }

  /**
   * PERUBAHAN UTAMA:
   * Treat leaders the same as regular techs — tidak ada “pemaksaan tampil”
   * khusus di luar H & carry D-1.
   */
  const displayKeys = selectedSet;

  if (displayKeys.size === 0) return NextResponse.json({ data: [] });

  // 4) Info teknisi (tanpa code; gunakan id + inisial + nama)
  type TechInfo = { id: string; inisial: string; name: string };
  const techInfoById = new Map<string, TechInfo>();
  for (const row of pa ?? []) {
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
  const missingTechIds = new Set<string>();
  for (const key of displayKeys) {
    const [, techId] = key.split("::");
    if (!techInfoById.has(techId)) missingTechIds.add(techId);
  }
  if (missingTechIds.size) {
    const { data: techRows } = await supabaseServer
      .from("technicians")
      .select("id, inisial, nama_lengkap")
      .in("id", Array.from(missingTechIds));
    for (const t of techRows ?? []) {
      const id: string = String(t.id);
      const inisial: string = String(t.inisial ?? "?").toUpperCase();
      techInfoById.set(t.id, { id, inisial, name: t.nama_lengkap ?? id });
    }
  }

  // 5) Payload ke UI (pakai technicianId)
  const shaped: ShapedAssignment[] = [];
  for (const key of displayKeys) {
    const [pid, tid] = key.split("::");
    if (!activeProjectSet.has(pid)) continue;
    const info: TechInfo = techInfoById.get(tid) ?? {
      id: tid,
      inisial: String(tid[0] ?? "?").toUpperCase(),
      name: tid,
    };
    shaped.push({
      projectId: pid,
      technicianId: info.id, // UUID
      technicianName: info.name,
      inisial: info.inisial,
      isProjectLeader: leaderMap.get(key) ?? false,
      isSelected: true,
    });
  }

  const filtered = shaped.filter((x) => x.isSelected || x.isProjectLeader);
  return NextResponse.json({ data: filtered });
}

/* ===================== POST (HARIAN, NON-HISTORICAL) ===================== */
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

  // Kelompokkan teknisi terpilih per project (attendance HARI INI)
  const byProject = new Map<
    string,
    { selected: Set<string>; leaders: Set<string> }
  >();
  for (const it of items) {
    const bucket = byProject.get(it.projectId) ?? {
      selected: new Set<string>(),
      leaders: new Set<string>(),
    };
    if (it.isSelected !== false) bucket.selected.add(it.technicianId);
    if (it.isProjectLeader) bucket.leaders.add(it.technicianId);
    byProject.set(it.projectId, bucket);
  }
  const projectsWithAssignments = Array.from(byProject.keys());

  // Scope proyek yang mau disentuh
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectsWithAssignments;

  if (!scopeProjectIds.length) {
    return NextResponse.json({ data: { count: 0 } }, { status: 201 });
  }

  // Ambil status proyek → skip pending/completed/awaiting_bast
  const { data: projRows, error: projErr } = await supabaseServer
    .from("projects")
    .select("id, project_status, pending_reason, completed_at")
    .in("id", scopeProjectIds);

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const bastSet = new Set(
    (projRows ?? [])
      .filter((p: any) => p?.project_status === "awaiting_bast")
      .map((p: any) => p.id)
  );
  const pendingSet = new Set(
    (projRows ?? [])
      .filter((p: any) => p?.project_status === "pending" || p?.pending_reason)
      .map((p: any) => p.id)
  );
  const completedSet = new Set(
    (projRows ?? []).filter((p: any) => !!p?.completed_at).map((p: any) => p.id)
  );

  const activeScopeProjectIds = scopeProjectIds.filter(
    (id) => !pendingSet.has(id) && !completedSet.has(id) && !bastSet.has(id)
  );

  /* ========= 1) Attendance HARI INI ========= */

  // Hapus attendance hari ini untuk proyek aktif dalam scope
  if (activeScopeProjectIds.length) {
    const { error: delErr } = await supabaseServer
      .from("attendance")
      .delete()
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // Tulis ulang attendance hari ini
  const attRows: Array<{
    project_id: string;
    technician_id: string;
    work_date: string;
    project_leader?: boolean;
  }> = [];
  for (const pid of activeScopeProjectIds) {
    const selected = byProject.get(pid)?.selected ?? new Set<string>();
    const leaders = byProject.get(pid)?.leaders ?? new Set<string>();
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
    const { error: insAttErr } = await supabaseServer
      .from("attendance")
      .insert(attRows);
    if (insAttErr) {
      return NextResponse.json({ error: insAttErr.message }, { status: 500 });
    }
  }

  // Update project_status dari attendance hari ini
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
      return NextResponse.json({ error: upProjErr.message }, { status: 500 });
    }
  }

  /* ========= 2) SYNC project_assignments (membership) ========= */
  // Atur apakah non-terpilih dihapus (soft-remove) dari membership aktif:
  const REMOVE_NONSELECTED = true;

  for (const pid of activeScopeProjectIds) {
    const selected = byProject.get(pid)?.selected ?? new Set<string>();
    const leaders = byProject.get(pid)?.leaders ?? new Set<string>();

    // a) Ambil membership aktif saat ini
    const { data: current, error: curErr } = await supabaseAdmin
      .from("project_assignments")
      .select("id, technician_id, is_leader")
      .eq("project_id", pid)
      .is("removed_at", null);

    if (curErr) {
      return NextResponse.json({ error: curErr.message }, { status: 500 });
    }

    const currentByTech = new Map<string, { id: string; is_leader: boolean }>();
    for (const r of current ?? []) {
      currentByTech.set(r.technician_id, {
        id: r.id,
        is_leader: !!r.is_leader,
      });
    }

    // b) Insert yang belum ada
    const toInsert: Array<{
      project_id: string;
      technician_id: string;
      is_leader: boolean;
    }> = [];
    for (const tid of selected) {
      if (!currentByTech.has(tid)) {
        toInsert.push({
          project_id: pid,
          technician_id: tid,
          is_leader: leaders.has(tid),
        });
      }
    }
    if (toInsert.length) {
      const { error: insErr } = await supabaseAdmin
        .from("project_assignments")
        .insert(toInsert);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    // c) Update flag leader pada yang sudah ada bila berubah
    const toUpdate: Array<{ id: string; is_leader: boolean }> = [];
    for (const [tid, cur] of currentByTech.entries()) {
      const shouldBeLeader = leaders.has(tid);
      if (cur.is_leader !== shouldBeLeader) {
        toUpdate.push({ id: cur.id, is_leader: shouldBeLeader });
      }
    }
    if (toUpdate.length) {
      const { error: updErr } = await supabaseAdmin
        .from("project_assignments")
        .upsert(
          toUpdate.map((x) => ({ id: x.id, is_leader: x.is_leader })),
          { onConflict: "id" }
        );
      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
    }

    // d) (Opsional) Soft-remove yang tidak dipilih hari ini
    if (REMOVE_NONSELECTED) {
      const toRemoveIds: string[] = [];
      for (const [tid, cur] of currentByTech.entries()) {
        if (!selected.has(tid)) {
          toRemoveIds.push(cur.id);
        }
      }
      if (toRemoveIds.length) {
        const { error: remErr } = await supabaseAdmin
          .from("project_assignments")
          .update({ removed_at: new Date().toISOString() })
          .in("id", toRemoveIds);
        if (remErr) {
          return NextResponse.json({ error: remErr.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json(
    { data: { count: attRows.length } },
    { status: 201 }
  );
}
