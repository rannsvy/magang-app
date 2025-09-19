// app/api/supervisors/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServers } from "@/lib/supabaseServers";
import { resolveCurrentSupervisor } from "@/lib/resolveSupervisor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function todayWIB() {
  const ms = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServers();
    const url = new URL(req.url);
    const workDate = url.searchParams.get("date") || todayWIB();

    // auth
    const { data: me } = await supabase.auth.getUser();
    const user = me?.user;
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // resolve supervisor (id & role)
    const { supervisorId, isManagerOrGM, isSupervisor } =
      await resolveCurrentSupervisor(supabase);

    if (!isManagerOrGM && !isSupervisor) {
      // bukan supervisor/manager/GM
      return NextResponse.json(
        { error: "Akun ini bukan supervisor/manager/GM." },
        { status: 403 }
      );
    }

    // base query
    let q = supabase
      .from("projects")
      .select(
        `
        id, job_id, name, lokasi, project_status, closed_at, building_name,
        project_assignments!inner(
          project_id, is_leader, removed_at, work_date, supervisor_id
        )
      `
      )
      .eq("project_assignments.work_date", workDate)
      .is("project_assignments.removed_at", null);

    if (isSupervisor) {
      if (!supervisorId) {
        return NextResponse.json(
          {
            error: "Profil supervisor belum terhubung (supervisor_id kosong).",
          },
          { status: 403 }
        );
      }
      // filter ke supervisor yang login
      q = q.eq("project_assignments.supervisor_id", supervisorId);
    } else {
      // Manager/GM: no extra filter
    }

    const { data, error } = await q;
    if (error) throw error;

    const items = (data ?? []).map((p: any) => {
      const uiStatus = p.closed_at
        ? "completed"
        : p.project_status === "unassigned"
        ? "not-started"
        : "in-progress";
      return {
        id: String(p.id),
        job_id: String(p.job_id || p.id),
        name: String(p.name ?? "Project"),
        lokasi: (p.lokasi as string | null) ?? null,
        status: uiStatus,
        building_name: p.building_name ?? null,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}
