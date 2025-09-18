// /app/api/supervisors/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const withTech = url.searchParams.get("includeTechnicians") === "1";

    const sb = supabaseServer();

    const { data: sups, error } = await sb
      .from("supervisors")
      .select("id, full_name, nickname, email, role")
      .order("nickname", { ascending: true });

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    if (!withTech) {
      return NextResponse.json({ items: sups ?? [] });
    }

    const supIds = (sups ?? []).map((s) => s.id);
    let techMap = new Map<
      string,
      Array<{ id: string; name: string; inisial: string }>
    >();

    if (supIds.length) {
      const { data: rows, error: e2 } = await sb
        .from("supervisor_technicians")
        .select(
          `
          supervisor_id,
          technicians:technician_id ( id, nama_panggilan, nama_lengkap, inisial )
        `
        )
        .in("supervisor_id", supIds)
        .is("removed_at", null);

      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

      for (const r of rows ?? []) {
        const tRaw: any = r.technicians;
        const t = Array.isArray(tRaw) ? tRaw[0] : tRaw;
        const arr = techMap.get(r.supervisor_id) ?? [];
        if (t) {
          arr.push({
            id: t.id,
            name:
              (t.nama_panggilan as string) ??
              (t.nama_lengkap as string) ??
              t.id,
            inisial: String(t.inisial ?? "?").toUpperCase(),
          });
        }
        techMap.set(r.supervisor_id, arr);
      }
    }

    const items = (sups ?? []).map((s) => ({
      ...s,
      technicians: techMap.get(s.id) ?? [],
    }));

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
