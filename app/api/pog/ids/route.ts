// app/api/pog/ids/route.ts
import { NextResponse } from "next/server";
import { getIdList } from "@/lib/pogClient";

export const dynamic = "force-dynamic";

/* ===================== Types ===================== */
type ExternalType = "paket" | "npkt";
type Item = {
  id: string;
  label: string;
  type: ExternalType;
  date?: string | null;
};

/* ================== In-memory cache ================== */
type CacheVal = { ts: number; items: Item[]; normKeys: string[] };
type CacheMap = Map<string, CacheVal>;
function getCache(): CacheMap {
  const g = globalThis as any;
  if (!g.__POG_IDS_CACHE) g.__POG_IDS_CACHE = new Map<string, CacheVal>();
  return g.__POG_IDS_CACHE as CacheMap;
}
const CACHE_TTL_MS = 60_000;

/* ===================== Utils ===================== */
function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
function naturalNumFromId(id: string) {
  const n = Number(id.replace(/\D+/g, ""));
  return Number.isFinite(n) ? n : NaN;
}
function sortItems(a: Item, b: Item) {
  if (a.date && b.date) {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
  } else if (a.date && !b.date) return -1;
  else if (!a.date && b.date) return 1;

  const na = naturalNumFromId(a.id);
  const nb = naturalNumFromId(b.id);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && nb !== na) return nb - na;

  return b.id.localeCompare(a.id);
}
function makeCombinedKey(it: Item) {
  return norm(`${it.id} ${it.label ?? ""} ${it.type}`);
}

/* ====== WIB date helpers ====== */
const TZ = "Asia/Jakarta";
const DAY_MS = 86_400_000;
function ymdInTZ(date: Date, tz = TZ) {
  const y = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
  }).format(date);
  const m = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    month: "2-digit",
  }).format(date);
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    day: "2-digit",
  }).format(date);
  return `${y}-${m}-${d}`;
}
function defaultOneYearRange() {
  const now = new Date();
  const start = new Date(now.getTime() - 365 * DAY_MS);
  return { tglAwal: ymdInTZ(start), tglAkhir: ymdInTZ(now) };
}

// NEW: clamp jendela ke 1 tahun terakhir (WIB)
function clampToLastYearWIB(tglAwal: string, tglAkhir: string) {
  const today = ymdInTZ(new Date()); // YYYY-MM-DD (WIB)
  const minStart = ymdInTZ(new Date(Date.now() - 365 * DAY_MS));
  // bandingkan string ISO YYYY-MM-DD secara leksikografis
  if (tglAkhir > today) tglAkhir = today;
  if (tglAwal < minStart) tglAwal = minStart;
  if (tglAwal > tglAkhir) [tglAwal, tglAkhir] = [tglAkhir, tglAwal];
  return { tglAwal, tglAkhir };
}

/* ============== Build / Read cache index ============== */
async function ensureIndex(
  type: ExternalType,
  tglAwal: string,
  tglAkhir: string
): Promise<CacheVal> {
  const key = `${type}|${tglAwal}|${tglAkhir}`;
  const cache = getCache();
  const now = Date.now();
  const current = cache.get(key);
  if (current && now - current.ts <= CACHE_TTL_MS) return current;

  const itemsRaw = await getIdList(type, tglAwal, tglAkhir);
  const items: Item[] = (itemsRaw as Item[]).slice().sort(sortItems);
  const normKeys = items.map(makeCombinedKey);

  const val: CacheVal = { ts: now, items, normKeys };
  cache.set(key, val);
  return val;
}

/* ===================== Search ===================== */
function search(
  items: Item[],
  normKeys: string[],
  q: string,
  limit: number
): Item[] {
  if (!q) return items.slice(0, limit);

  const nq = norm(q);
  const out: Item[] = [];
  const len = items.length;

  // 1) prefix by id
  for (let i = 0; i < len && out.length < limit; i++) {
    if (norm(items[i].id).startsWith(nq)) out.push(items[i]);
  }
  if (out.length >= limit) return out;

  // 2) includes by id
  for (let i = 0; i < len && out.length < limit; i++) {
    const it = items[i];
    const ni = norm(it.id);
    if (!ni.startsWith(nq) && ni.includes(nq)) out.push(it);
  }
  if (out.length >= limit) return out;

  // 3) includes by combined
  for (let i = 0; i < len && out.length < limit; i++) {
    const nk = normKeys[i];
    if (!nk.includes(nq)) continue;
    const it = items[i];
    if (!out.includes(it)) out.push(it);
  }
  return out.slice(0, limit);
}

/* ===================== Fields ===================== */
type FieldKey = keyof Item;
function isFieldKey(s: string): s is FieldKey {
  return s === "id" || s === "label" || s === "date" || s === "type";
}
function shapeFields<K extends FieldKey>(
  row: Item,
  fields?: K[]
): Item | Pick<Item, K> {
  if (!fields || fields.length === 0) return row;
  const shaped = {} as Pick<Item, K>;
  for (const f of fields) shaped[f] = row[f] as Item[K];
  return shaped;
}

/* ===================== Handler ===================== */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // tipe
    const typeParam = searchParams.get("type");
    const type: ExternalType =
      typeParam && typeParam.toLowerCase() === "npkt" ? "npkt" : "paket";

    // default WIB: today .. today-365d
    const def = defaultOneYearRange();
    let tglAwal = searchParams.get("tglAwal") ?? def.tglAwal;
    let tglAkhir = searchParams.get("tglAkhir") ?? def.tglAkhir;

    // safety: kalau user kebalik, tukar
    if (tglAwal > tglAkhir) [tglAwal, tglAkhir] = [tglAkhir, tglAwal];

    // paksa tetap di jendela 1 tahun terakhir (WIB)
    ({ tglAwal, tglAkhir } = clampToLastYearWIB(tglAwal, tglAkhir));

    const q = searchParams.get("q") ?? "";

    const rawLimit = Number(searchParams.get("limit") ?? "");
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(100, rawLimit))
      : 25;

    const fieldsParam = searchParams.get("fields") ?? "";
    const fields: FieldKey[] | undefined = fieldsParam
      ? fieldsParam
          .split(",")
          .map((s) => s.trim())
          .filter(isFieldKey)
      : undefined;

    const idx = await ensureIndex(type, tglAwal, tglAkhir);
    const rows = search(idx.items, idx.normKeys, q, limit);
    const shaped = fields ? rows.map((r) => shapeFields(r, fields)) : rows;

    const res = NextResponse.json({
      items: shaped,
      meta: { count: shaped.length, refreshedAt: idx.ts, tglAwal, tglAkhir },
    });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=15, stale-while-revalidate=120"
    );
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed" },
      { status: 500 }
    );
  }
}
