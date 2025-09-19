// /app/api/pog/detail/route.ts
import { NextResponse } from "next/server";
import {
  getDetail,
  type RawResponse,
  type ExternalType,
} from "@/lib/pogClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Normalisasi respons untuk frontend + kompatibel lama (sediakan "data" sebagai array)
function shape(raw: RawResponse, type: ExternalType, id: string) {
  const items = Array.isArray(raw?.data) ? raw.data : [];
  const first = items[0];

  const meta = {
    paketId: (first?.idPaket || id) ?? "",
    namaPaket: first?.namaPaket ?? "",
    instansi: first?.instansi ?? "",
    alamatInstansi: (first?.alamatInstansi ?? "").trim(),
    tglPaket: first?.tglPaket ?? "",
    salesId: first?.idSales ?? "",
  };

  const lokasi =
    (meta.instansi && meta.alamatInstansi
      ? `${meta.instansi} — ${meta.alamatInstansi}`
      : meta.instansi || meta.alamatInstansi) || "";

  const salesName = meta.salesId || "";

  // Kembalikan field 'data' (array) agar parsing lama di FE tetap berjalan.
  return {
    ok: true,
    type,
    id,
    meta,
    lokasi,
    salesName,
    items: items.map((it) => ({
      kebutuhan: it.kebutuhan,
      qty: Number(it.qty) || 0,
      satuan: it.satuan,
    })),
    data: items, // <— kompatibel: FE Anda baca resp.data
  };
}

function parseType(t: string | null): ExternalType {
  return t?.toLowerCase() === "npkt" ? "npkt" : "paket";
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = parseType(searchParams.get("type"));
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id required" },
        { status: 400 }
      );
    }

    const raw = await getDetail(type, id);

    if (
      !raw ||
      raw.status === false ||
      !Array.isArray(raw.data) ||
      raw.data.length === 0
    ) {
      return NextResponse.json(
        { ok: false, error: "Detail tidak ditemukan", data: [] },
        { status: 404 }
      );
    }

    const shaped = shape(raw, type, id);
    return NextResponse.json(shaped, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed" },
      { status: 500 }
    );
  }
}
