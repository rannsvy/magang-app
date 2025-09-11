// /app/api/projects/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { nowWIBIso } from "@/lib/wib";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const projectId: string = body?.projectId;
  const status: string = body?.status;
  const reason: string | undefined = body?.reason;

  if (!projectId || !status) {
    return NextResponse.json(
      { error: "projectId & status wajib diisi" },
      { status: 400 }
    );
  }

  if (status === "completed") {
    const nowIsoWIB = nowWIBIso();

    // 1) Tandai project selesai + set completed_at (WIB)
    const { error: upErr } = await supabaseServer
      .from("projects")
      .update({
        status: "completed", // progress status
        project_status: "unassigned", // supaya tidak dianggap 'ongoing'
        pending_reason: null,
        completed_at: nowIsoWIB, // ✅ cap waktu WIB
      })
      .eq("id", projectId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // 2) Putuskan semua assignment aktif (cap removed_at WIB)
    const { error: rmErr } = await supabaseServer
      .from("project_assignments")
      .update({ removed_at: nowIsoWIB, is_leader: false })
      .eq("project_id", projectId)
      .is("removed_at", null);

    if (rmErr) {
      return NextResponse.json({ error: rmErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // selain completed => update project_status + reason (pending)
  const payload: any = { project_status: status };
  payload.pending_reason = status === "pending" ? reason ?? null : null;

  const { error } = await supabaseServer
    .from("projects")
    .update(payload)
    .eq("id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
