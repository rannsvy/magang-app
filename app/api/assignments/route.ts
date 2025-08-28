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

// GET /api/assignments?date=YYYY-MM-DD
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

  // util minus 1 hari
  const prevDate = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
    dt.setDate(dt.getDate() - 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  const dMinus1 = prevDate(date);

  // 1) Membership aktif (sumber initial + leader). Handle nested technicians (obj/array).
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

  const projectIds = Array.from(
    new Set((pa ?? []).map((r: any) => r.project_id))
  );
  if (projectIds.length === 0) return NextResponse.json({ data: [] });

  // 2) Proyek yang aktif pada 'date' & bukan pending
  const { data: projects, error: projErr } = await supabaseServer
    .from("projects")
    .select(
      "id, project_status, pending_reason, closed_at, tanggal_mulai, tanggal_deadline"
    )
    .in("id", projectIds)
    .lte("tanggal_mulai", date)
    .or(`tanggal_deadline.is.null,tanggal_deadline.gte.${date}`)
    .is("closed_at", null);

  if (projErr) {
    console.error("[GET /api/assignments] projects error:", projErr);
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const activeProjectSet = new Set(
    (projects ?? [])
      .filter((p: any) => p.project_status !== "pending" && !p.pending_reason)
      .map((p: any) => p.id)
  );

  // 3) Attendance hari ini (D)
  const { data: attToday, error: attErr } = await supabaseServer
    .from("attendance")
    .select("project_id, technician_id")
    .eq("work_date", date)
    .in("project_id", Array.from(activeProjectSet));

  if (attErr) {
    console.error("[GET /api/assignments] attendance today error:", attErr);
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  }
  const todayCountByProject = new Map<string, number>();
  const selectedTodaySet = new Set(
    (attToday ?? []).map((r: any) => {
      todayCountByProject.set(
        r.project_id,
        (todayCountByProject.get(r.project_id) ?? 0) + 1
      );
      return `${r.project_id}::${r.technician_id}`;
    })
  );

  // 4) Attendance kemarin (D-1) untuk auto-continue
  const { data: attPrev, error: attPrevErr } = await supabaseServer
    .from("attendance")
    .select("project_id, technician_id")
    .eq("work_date", dMinus1)
    .in("project_id", Array.from(activeProjectSet));

  if (attPrevErr) {
    console.error("[GET /api/assignments] attendance prev error:", attPrevErr);
    return NextResponse.json({ error: attPrevErr.message }, { status: 500 });
  }
  const prevByProject = new Map<
    string,
    Array<{ project_id: string; technician_id: string }>
  >();
  for (const r of attPrev ?? []) {
    const arr = prevByProject.get(r.project_id) ?? [];
    arr.push(r);
    prevByProject.set(r.project_id, arr);
  }

  // 5) Final selectedSet:
  //    - jika proyek sudah punya attendance di D -> pakai itu,
  //    - jika belum & proyek aktif -> auto-continue dari D-1,
  //    - proyek pending/closed/di luar rentang -> tidak di-autoselect.
  const selectedSet = new Set(selectedTodaySet);
  for (const pid of activeProjectSet) {
    const hasToday = (todayCountByProject.get(pid) ?? 0) > 0;
    if (!hasToday) {
      const prevRows = prevByProject.get(pid) ?? [];
      for (const r of prevRows)
        selectedSet.add(`${r.project_id}::${r.technician_id}`);
    }
  }

  // 6) Bentuk payload untuk UI — HANYA kembalikan sel yang ter-select (atau leader pada sel ter-select),
  //    supaya tidak muncul abu-abu.
  const shaped: ShapedAssignment[] = (pa ?? [])
    .filter((row: any) => activeProjectSet.has(row.project_id))
    .map((row: any) => {
      const tRaw = row.technicians;
      const t = Array.isArray(tRaw) ? tRaw[0] ?? null : tRaw;
      const code: string =
        (t?.code as string | null) ?? (row.technician_id as string);
      const initials: string = String(t?.initials ?? code ?? "?").toUpperCase();
      const key = `${row.project_id}::${row.technician_id}`;
      const isSelected = selectedSet.has(key);
      const isLeader = Boolean(row.is_leader);

      return {
        projectId: row.project_id as string,
        technicianCode: code,
        initial: initials,
        isProjectLeader: isLeader && isSelected, // leader ditandai saat sel ter-select
        isSelected,
      } as ShapedAssignment;
    })
    .filter((x) => x.isSelected || x.isProjectLeader); // tidak kirim baris yang kosong

  return NextResponse.json({ data: shaped });
}

/**
 * POST /api/assignments
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   projectIds?: string[],
 *   assignments: Array<{ projectId, technicianId, isSelected?, isProjectLeader? }>
 * }
 */
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

  // Kelompokkan per proyek dari items yang dipilih
  const byProject = new Map<string, { selected: Set<string> }>();
  for (const it of items) {
    const bucket = byProject.get(it.projectId) ?? {
      selected: new Set<string>(),
    };
    if (it.isSelected !== false) bucket.selected.add(it.technicianId);
    byProject.set(it.projectId, bucket);
  }
  const projectIdsFromItems = Array.from(byProject.keys());

  // scope proyek: pakai body.projectIds kalau ada, fallback ke projectIdsFromItems
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectIdsFromItems;

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

  // 1) Upsert membership (jika ada items)
  if (items.length) {
    const upsertRows = items.map((it) => ({
      project_id: it.projectId,
      technician_id: it.technicianId,
      assigned_at: new Date(`${date}T00:00:00.000+07:00`).toISOString(),
      is_leader: !!it.isProjectLeader,
      removed_at: null,
    }));
    if (upsertRows.length) {
      const { error: upErr } = await supabaseServer
        .from("project_assignments")
        .upsert(upsertRows, { onConflict: "project_id,technician_id" });
      if (upErr) {
        console.error(
          "[POST /api/assignments] upsert project_assignments error:",
          upErr
        );
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }

    // 1.5) Sinkronisasi leader per proyek (reset -> set true pada yang dikirim)
    const leadersByProject = new Map<string, string[]>();
    for (const it of items) {
      if (it.isProjectLeader) {
        const arr = leadersByProject.get(it.projectId) ?? [];
        arr.push(it.technicianId);
        leadersByProject.set(it.projectId, arr);
      }
    }
    for (const [projectId, leaders] of leadersByProject.entries()) {
      await supabaseServer
        .from("project_assignments")
        .update({ is_leader: false })
        .eq("project_id", projectId)
        .is("removed_at", null);

      if (leaders.length) {
        await supabaseServer
          .from("project_assignments")
          .update({ is_leader: true, removed_at: null })
          .eq("project_id", projectId)
          .in("technician_id", leaders);
      }
    }
  }

  // 2) Hapus attendance HANYA untuk proyek yang ada di assignments (tanggal tsb)
  const projectsWithAssignments = Array.from(byProject.keys());
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

  // 2.5) Ambil leader terbaru (untuk flag di attendance)
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
  const leaderMap = new Map<string, Set<string>>();
  for (const r of leaderRows) {
    const set = leaderMap.get(r.project_id) ?? new Set<string>();
    set.add(r.technician_id);
    leaderMap.set(r.project_id, set);
  }

  // 3) Insert attendance untuk proyek yang ada assignments + preserve existing attendance proyek lain
  const attRows: Array<{
    project_id: string;
    technician_id: string;
    work_date: string;
    project_leader?: boolean;
  }> = [];

  // Tambah attendance dari assignments baru
  for (const pid of projectsWithAssignments) {
    const selected = byProject.get(pid)?.selected ?? new Set<string>();
    const leaderSet = leaderMap.get(pid) ?? new Set<string>();
    for (const tid of selected) {
      attRows.push({
        project_id: pid,
        technician_id: tid,
        work_date: date,
        project_leader: leaderSet.has(tid),
      });
    }
  }

  // Preserve: ambil attendance eksisting (tanggal tsb) untuk proyek AKTIF yang
  // tidak termasuk di "projectsWithAssignments", kemudian gabungkan.
  if (activeScopeProjectIds.length) {
    const { data: existingAtt } = await supabaseServer
      .from("attendance")
      .select("project_id, technician_id")
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds);

    const keep = (existingAtt ?? []).filter(
      (r) => !projectsWithAssignments.includes(r.project_id)
    );

    for (const r of keep) {
      const leaderSet = leaderMap.get(r.project_id) ?? new Set<string>();
      attRows.push({
        project_id: r.project_id,
        technician_id: r.technician_id,
        work_date: date,
        project_leader: leaderSet.has(r.technician_id),
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

  // 4) Update project_status berdasarkan ada/tidaknya assignment (kecuali pending)
  for (const pid of activeScopeProjectIds) {
    const hasAssignments = byProject.get(pid)?.selected.size > 0;
    const project = projRows?.find((p: any) => p.id === pid);
    if (
      project &&
      project.project_status !== "pending" &&
      !project.pending_reason
    ) {
      const newProjectStatus = hasAssignments ? "ongoing" : "unassigned";
      await supabaseServer
        .from("projects")
        .update({ project_status: newProjectStatus })
        .eq("id", pid);
    }
  }

  return NextResponse.json(
    { data: { count: attRows.length } },
    { status: 201 }
  );
}
