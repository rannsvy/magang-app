// app/api/technicians/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers"; // sesuai import kamu

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
};

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseServer();
    const url = new URL(req.url);

    const technicianParam = url.searchParams.get("technician"); // UUID atau inisial (baru)
    const debugAll = url.searchParams.get("debug") === "1";

    let technicianId: string | null = null;

    if (technicianParam) {
      if (isUuid(technicianParam)) {
        technicianId = technicianParam;
      } else {
        // treat as INISIAL → lookup id dari tabel technicians
        const inisial = String(technicianParam).toUpperCase();
        const { data: t, error: tErr } = await supabase
          .from("technicians")
          .select("id")
          .eq("inisial", inisial)
          .maybeSingle();
        if (tErr) throw tErr;
        technicianId = t?.id ?? null;
      }
    }

    const baseSelect =
      "id, job_id, name, lokasi, closed_at, sigma_teknisi, project_status, status, " +
      "project_assignments!inner(technician_id, technician_name, is_leader, removed_at)";

    let q = supabase
      .from("projects")
      .select(baseSelect as any)
      .is("project_assignments.removed_at", null)
      .order("created_at", { ascending: false });

    if (!debugAll) {
      if (!technicianId) {
        return NextResponse.json({ items: [] });
      }
      q = q.eq("project_assignments.technician_id", technicianId);
    }

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data ?? []) as any[];
    const projectIds = rows.map((p) => p.id);

    // cek survey rooms (tetap)
    let surveySet = new Set<string>();
    if (projectIds.length) {
      const rs = await supabase
        .from("project_survey_rooms")
        .select("project_id")
        .in("project_id", projectIds);
      if (rs.error && !/does not exist/i.test(rs.error.message)) {
        throw rs.error;
      }
      for (const r of rs.data ?? []) {
        surveySet.add(String(r.project_id));
      }
    }

    const items: UiJob[] = rows.map((p) => {
      const uiStatus: UiJob["status"] = p.closed_at
        ? "completed"
        : p.project_status === "unassigned"
        ? "not-started"
        : "in-progress";

      const crewActive = (p.project_assignments ?? []).filter(
        (a: any) => !a.removed_at
      );
      const progress =
        typeof p.sigma_teknisi === "number" && p.sigma_teknisi > 0
          ? Math.min(
              100,
              Math.round((crewActive.length / p.sigma_teknisi) * 100)
            )
          : null;

      const assignedTechnicians = crewActive.map((a: any) => ({
        name: a.technician_name ?? "Teknisi",
        isLeader: !!a.is_leader,
      }));

      const isSurvey = surveySet.has(String(p.id));

      return {
        id: String(p.id),
        job_id: String(p.job_id || p.id),
        name: String(p.name ?? "Project"),
        lokasi: p.lokasi ?? null,
        status: uiStatus,
        progress,
        assignedTechnicians,
        type: isSurvey ? "survey" : "instalasi",
        building_name: isSurvey ? String(p.name ?? "Gedung") : null,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
