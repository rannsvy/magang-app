// /app/api/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Bentuk respons untuk UI.
 */
type ShapedAssignment = {
  projectId: string;
  technicianCode: string;
  initial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
};

// ===== Helper waktu =====
// Menghasilkan string ISO dengan offset +07:00 (WIB) untuk "momen sekarang".
function nowWIBIso(): string {
  const wibMs = Date.now() + 7 * 60 * 60 * 1000; // UTC -> WIB
  return new Date(wibMs).toISOString().replace("Z", "+07:00");
}

// util: date - 1 hari (YYYY-MM-DD)
function prevDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// konversi timestamp -> tanggal WIB (YYYY-MM-DD)
function toWIBDate(isoTs?: string | null) {
  if (!isoTs) return null;
  const t = new Date(isoTs);
  if (Number.isNaN(t.getTime())) return null;
  const wibMs = t.getTime() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().slice(0, 10);
}

// GET /api/assignments?date=YYYY-MM-DD
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

  /* ------------------------------------------------------------------
   * 0) Ambil attendance H dan D-1 lebih dahulu (tanpa filter project)
   *    -> jadi kandidat kuat teknisi yg harus tampil walau membership
   *       sudah soft-delete
   * ------------------------------------------------------------------ */
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

  // peta jumlah attendance hari ini per project + set pasangan terpilih (H)
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

  // indeks attendance D-1 per project + leader D-1
  const prevByProject = new Map<
    string,
    Array<{
      project_id: string;
      technician_id: string;
      project_leader?: boolean;
    }>
  >();
  const leaderPrevSet = new Set<string>();
  for (const r of attPrev ?? []) {
    const arr = prevByProject.get(r.project_id) ?? [];
    arr.push(r);
    prevByProject.set(r.project_id, arr);
    if (r.project_leader)
      leaderPrevSet.add(`${r.project_id}::${r.technician_id}`);
  }

  /* ------------------------------------------------------------------
   * 1) Membership aktif (sumber initial + code jika tersedia)
   * ------------------------------------------------------------------ */
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

  // kandidat projectId dari membership & attendance
  const candidateProjectIds = new Set<string>();
  for (const r of pa ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attToday ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attPrev ?? []) candidateProjectIds.add(r.project_id);

  if (candidateProjectIds.size === 0) {
    return NextResponse.json({ data: [] });
  }

  /* ------------------------------------------------------------------
   * 2) Ambil proyek kandidat dan filter aktif utk tanggal 'date'
   *    - BUKAN pending
   *    - tanggal_mulai <= date
   *    - completed: tampil H (WIB), hilang H+1
   * ------------------------------------------------------------------ */
  const { data: projects, error: projErr } = await supabaseServer
    .from("projects")
    .select(
      "id, project_status, pending_reason, tanggal_mulai, tanggal_deadline, closed_at, completed_at"
    )
    .in("id", Array.from(candidateProjectIds))
    .lte("tanggal_mulai", date); // jangan filter closed_at di query

  if (projErr) {
    console.error("[GET /api/assignments] projects error:", projErr);
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const activeProjectSet = new Set(
    (projects ?? [])
      .filter((p: any) => {
        // skip pending
        if (p.project_status === "pending" || p.pending_reason) return false;
        // visibility completed: hanya H
        const completedWIB =
          toWIBDate(p.completed_at) ?? toWIBDate(p.closed_at);
        if (!completedWIB) return true; // belum selesai -> tampil
        return date <= completedWIB; // selesai -> tampil hanya pada H, hilang H+1
      })
      .map((p: any) => p.id)
  );

  if (activeProjectSet.size === 0) {
    return NextResponse.json({ data: [] });
  }

  /* ------------------------------------------------------------------
   * 3) Bentuk selectedSet:
   *    - jika proyek punya attendance H -> pakai H
   *    - jika tidak -> auto-continue D-1 (1 hari saja)
   * ------------------------------------------------------------------ */
  const selectedSet = new Set<string>(selectedTodaySet);
  const leaderMap = new Map<string, boolean>(); // key -> isLeader
  for (const k of selectedTodaySet) {
    leaderMap.set(k, leaderTodaySet.has(k));
  }

  for (const pid of activeProjectSet) {
    const hasToday = (todayCountByProject.get(pid) ?? 0) > 0;
    if (!hasToday) {
      const prevRows = prevByProject.get(pid) ?? [];
      for (const r of prevRows) {
        const key = `${r.project_id}::${r.technician_id}`;
        selectedSet.add(key);
        // gunakan leader D-1 hanya kalau H kosong
        leaderMap.set(key, !!r.project_leader);
      }
    }
  }

  if (selectedSet.size === 0) {
    return NextResponse.json({ data: [] });
  }

  /* ------------------------------------------------------------------
   * 4) Siapkan informasi teknisi (code/initials) dari:
   *    a) membership aktif (join technicians)
   *    b) jika masih kurang -> fetch langsung dari table technicians
   * ------------------------------------------------------------------ */
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

  // cari technician_id yg belum punya info
  const missingTechIds = new Set<string>();
  for (const key of selectedSet) {
    const [, techId] = key.split("::");
    if (!techInfoById.has(techId)) missingTechIds.add(techId);
  }

  if (missingTechIds.size) {
    const { data: techRows, error: techErr } = await supabaseServer
      .from("technicians")
      .select("id, code, initials")
      .in("id", Array.from(missingTechIds));
    if (techErr) {
      console.error("[GET /api/assignments] technicians fetch error:", techErr);
      // lanjut tanpa menghentikan—fallback akan pakai id sebagai code/initial
    } else {
      for (const t of techRows ?? []) {
        const code: string = (t.code as string | null) ?? (t.id as string);
        const initials: string = String(
          t.initials ?? code ?? "?"
        ).toUpperCase();
        techInfoById.set(t.id, { code, initials });
      }
    }
  }

  /* ------------------------------------------------------------------
   * 5) Bentuk payload untuk UI: hanya pasangan yg terpilih
   * ------------------------------------------------------------------ */
  const shaped: ShapedAssignment[] = [];
  for (const key of selectedSet) {
    const [pid, tid] = key.split("::");
    if (!activeProjectSet.has(pid)) continue;

    const info = techInfoById.get(tid) ?? {
      code: tid,
      initials: String(tid?.[0] ?? "?").toUpperCase(),
    };

    const isLeader = !!leaderMap.get(key);

    shaped.push({
      projectId: pid,
      technicianCode: info.code,
      initial: info.initials,
      isProjectLeader: isLeader, // tampilkan badge leader bila ada
      isSelected: true,
    });
  }

  return NextResponse.json({ data: shaped });
}

/* ======================================================================
 * POST tetapkan assignment & attendance (TIDAK diubah di sini)
 * — Anda bisa tetap pakai versi Anda sebelumnya.
 * ====================================================================== */
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

  // ⏱ Realtime WIB untuk cap waktu
  const nowWIB = nowWIBIso();

  // Kelompokkan per proyek dari items yang dipilih
  const byProject = new Map<string, { selected: Set<string> }>();
  for (const it of items) {
    const bucket = byProject.get(it.projectId) ?? {
      selected: new Set<string>(),
    };
    if (it.isSelected !== false) bucket.selected.add(it.technicianId);
    byProject.set(it.projectId, bucket);
  }
  const projectsWithAssignments = Array.from(byProject.keys());

  // scope proyek: body.projectIds? else projectsWithAssignments
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectsWithAssignments;

  if (!scopeProjectIds.length) {
    return NextResponse.json({ data: { count: 0 } }, { status: 201 });
  }

  // Ambil status proyek → skip pending/completed
  const { data: projRows, error: projErr } = await supabaseServer
    .from("projects")
    .select("id, status, project_status, pending_reason")
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
    (projRows ?? [])
      .filter((p: any) => p?.status === "completed")
      .map((p: any) => p.id)
  );

  const activeScopeProjectIds = scopeProjectIds.filter(
    (id) => !pendingSet.has(id) && !completedSet.has(id)
  );

  /* ------------------------------------------------------------------
   * 1) SOFT-DELETE membership yang tidak lagi dipilih per proyek
   * ------------------------------------------------------------------ */
  for (const pid of activeScopeProjectIds) {
    const selected = Array.from(byProject.get(pid)?.selected ?? []);
    let q = supabaseServer
      .from("project_assignments")
      .update({ removed_at: nowWIB, is_leader: false }) // ✅ realtime WIB
      .eq("project_id", pid)
      .is("removed_at", null);

    // NOT IN (selected) bila ada yang dipertahankan
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

  /* ------------------------------------------------------------------
   * 2) INSERT pasangan (project, technician) yang BELUM aktif
   * ------------------------------------------------------------------ */
  // Ambil membership aktif terbaru
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
    if (!activeScopeProjectIds.includes(pid)) continue; // hormati pending/completed
    for (const tid of bucket.selected) {
      const key = `${pid}::${tid}`;
      if (!activeSet.has(key)) {
        toInsert.push({
          project_id: pid,
          technician_id: tid,
          assigned_at: nowWIB, // ✅ realtime WIB
          is_leader: false, // akan di-set di langkah 3
          removed_at: null,
        });
        activeSet.add(key); // cegah duplikat dalam payload yang sama
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

  /* ------------------------------------------------------------------
   * 3) Sinkronisasi leader per proyek (maks 1 aktif)
   * ------------------------------------------------------------------ */
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

    // reset leader aktif proyek
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

  /* ------------------------------------------------------------------
   * 4) Attendance hari D
   * ------------------------------------------------------------------ */
  if (projectsWithAssignments.length) {
    const { error: delErr } = await supabaseServer
      .from("attendance")
      .delete()
      .eq("work_date", date)
      .in("project_id", projectsWithAssignments);
    if (delErr) {
      console.error("[POST /api/assignments] delete attendance error:", delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // Ambil leader aktif terkini untuk flag attendance
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

  // Build rows hanya untuk proyek yang disentuh + dedup key
  const attRows: Array<{
    project_id: string;
    technician_id: string;
    work_date: string;
    project_leader?: boolean;
  }> = [];
  const attKey = new Set<string>();

  for (const pid of projectsWithAssignments) {
    const selected = byProject.get(pid)?.selected ?? new Set<string>();
    const leaderSet = leaderMapByProject.get(pid) ?? new Set<string>();
    for (const tid of selected) {
      const k = `${pid}::${tid}::${date}`;
      if (attKey.has(k)) continue; // dedup
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
    const { error: insErr } = await supabaseServer
      .from("attendance")
      .insert(attRows);
    if (insErr) {
      console.error("[POST /api/assignments] insert attendance error:", insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  /* ------------------------------------------------------------------
   * 5) Update project_status berbasis attendance HARI D
   * ------------------------------------------------------------------ */
  const projectsWithAnyAttendanceToday = new Set(
    attRows.map((r) => r.project_id)
  );

  for (const pid of activeScopeProjectIds) {
    const project = projRows?.find((p: any) => p.id === pid);
    if (
      project &&
      project.project_status !== "pending" &&
      !project.pending_reason
    ) {
      const newProjectStatus = projectsWithAnyAttendanceToday.has(pid)
        ? "ongoing"
        : "unassigned";
      const { error: upProjErr } = await supabaseServer
        .from("projects")
        .update({ project_status: newProjectStatus })
        .eq("id", pid);
      if (upProjErr) {
        console.error(
          "[POST /api/assignments] update project status error:",
          upProjErr
        );
        return NextResponse.json({ error: upProjErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json(
    { data: { count: attRows.length } },
    { status: 201 }
  );
}
