// app/api/manage-projects/[id]/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServers } from "@/lib/supabaseServers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const client = await supabaseServers();
  const id = params.id;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid" }, { status: 400 });
  }

  const start = (body?.installation_start_date || "").trim();
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    return NextResponse.json(
      { error: "installation_start_date harus format YYYY-MM-DD" },
      { status: 400 }
    );
  }

  // Update hanya tanggal_mulai (biarkan status2 lain mengikuti default/logic lain)
  const { data, error } = await client
    .from("projects")
    .update({ tanggal_mulai: start })
    .eq("id", id)
    .select("id, tanggal_mulai")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
