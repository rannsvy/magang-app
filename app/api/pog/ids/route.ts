import { NextResponse } from "next/server";
import { getIdList } from "@/lib/pogClient";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "paket").toLowerCase() as
      | "paket"
      | "npkt";
    const tglAwal = searchParams.get("tglAwal") ?? "2025-03-01";
    const tglAkhir = searchParams.get("tglAkhir") ?? "2025-09-01";
    const q = (searchParams.get("q") ?? "").toLowerCase();
    const limit = Math.max(
      1,
      Math.min(20, Number(searchParams.get("limit") ?? "5"))
    );

    const items = await getIdList(type, tglAwal, tglAkhir);

    // filter by query
    const filtered = q
      ? items.filter(
          (x) =>
            x.id.toLowerCase().includes(q) || x.label.toLowerCase().includes(q)
        )
      : items;

    // sort terbaru by date desc if available, else by id desc (angka di-parse bila bisa)
    filtered.sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      // fallback: natural desc
      const na = Number(a.id.replace(/\D/g, ""));
      const nb = Number(b.id.replace(/\D/g, ""));
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
      return b.id.localeCompare(a.id);
    });

    return NextResponse.json({ items: filtered.slice(0, limit) });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed" },
      { status: 500 }
    );
  }
}
