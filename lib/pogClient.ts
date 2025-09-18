export type PogIdItem = {
  id: string;
  type: "paket" | "npkt";
  date?: string | null;
  label: string; // apa yang ditampilkan di suggestion
  raw?: any;
};

const BASE = process.env.POG_API_BASE!;
const KEY = process.env.POG_API_KEY!;

async function fetchJson(url: string, opts?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `POG fetch error ${res.status}: ${txt || res.statusText}`
      );
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function getIdList(
  type: "paket" | "npkt",
  tglAwal: string,
  tglAkhir: string
): Promise<PogIdItem[]> {
  const ep = type === "npkt" ? "GetIdNPKT" : "GetIdPaket";
  const url = `${BASE}/${ep}?api-key=${encodeURIComponent(
    KEY
  )}&tglAwal=${encodeURIComponent(tglAwal)}&tglAkhir=${encodeURIComponent(
    tglAkhir
  )}`;
  const data = await fetchJson(url);

  // Normalisasi hasil yang mungkin beragam bentuknya
  const arr: any[] = Array.isArray(data)
    ? data
    : data?.data ?? data?.items ?? [];
  return (arr ?? [])
    .map((it: any) => {
      const id = it.idPaket ?? it.idpaket ?? it.id ?? it.ID ?? it.Id ?? "";
      const date = it.tglPaket ?? it.tgl ?? it.tanggal ?? it.tgl_npkt ?? null;

      // label ringkas di suggestion
      const label = [id, date ? `(${date})` : null].filter(Boolean).join(" ");

      return {
        id: String(id),
        type,
        date: date ? String(date) : null,
        label,
        raw: it,
      } as PogIdItem;
    })
    .filter((x) => x.id);
}

export async function getDetail(
  type: "paket" | "npkt",
  idPaket: string
): Promise<any> {
  const ep = type === "npkt" ? "npkt" : "Paket";
  const url = `${BASE}/${ep}?api-key=${encodeURIComponent(
    KEY
  )}&idPaket=${encodeURIComponent(idPaket)}`;
  return await fetchJson(url);
}
