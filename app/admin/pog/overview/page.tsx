// /app/admin/pog/overview/page.tsx
"use client";

import * as React from "react";

type ExternalType = "paket" | "npkt";

type IdItem = {
  id: string;
  label: string;
  type: ExternalType;
  date?: string | null;
};

type DetailItem = {
  kebutuhan: string;
  qty: number;
  satuan: string;
};

type DetailResp = {
  ok: boolean;
  type: ExternalType;
  id: string;
  meta: {
    paketId: string;
    namaPaket: string;
    instansi: string;
    alamatInstansi: string;
    tglPaket: string;
    salesId: string;
  };
  lokasi: string;
  salesName: string; // NOTE: sementara = salesId pada API Anda
  items: DetailItem[];
  data: any[]; // kompatibel lama
};

function classNames(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // Kalau perlu cookie auth, aktifkan:
    // credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchIds(type: ExternalType, limit: number): Promise<IdItem[]> {
  const qs = new URLSearchParams({
    type,
    limit: String(limit),
    fields: "id,label,date,type",
  });
  const data = await fetchJSON<{ items: IdItem[]; meta: any }>(
    `/api/pog/ids?${qs.toString()}`
  );
  return Array.isArray(data.items) ? data.items : [];
}

async function fetchDetail(
  type: ExternalType,
  id: string
): Promise<DetailResp | null> {
  try {
    const qs = new URLSearchParams({ type, id });
    const data = await fetchJSON<DetailResp>(
      `/api/pog/detail?${qs.toString()}`
    );
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/** Batched fetch dengan concurrency sederhana */
async function fetchDetailsInBatches(
  type: ExternalType,
  ids: string[],
  batchSize = 8
): Promise<(DetailResp | null)[]> {
  const out: (DetailResp | null)[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const chunk = await Promise.all(slice.map((id) => fetchDetail(type, id)));
    out.push(...chunk);
  }
  return out;
}

export default function PogOverviewPage() {
  const [type, setType] = React.useState<ExternalType>("paket");
  const [limit, setLimit] = React.useState<number>(30);
  const [loadingIds, setLoadingIds] = React.useState(false);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [ids, setIds] = React.useState<IdItem[]>([]);
  const [details, setDetails] = React.useState<DetailResp[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [salesQuery, setSalesQuery] = React.useState("");
  const [expandMap, setExpandMap] = React.useState<Record<string, boolean>>({}); // show all items per paket

  const reload = React.useCallback(async () => {
    try {
      setError(null);
      setDetails([]);
      setLoadingIds(true);
      const idRows = await fetchIds(type, limit);
      setIds(idRows);
      setLoadingIds(false);

      setLoadingDetails(true);
      const all = await fetchDetailsInBatches(
        type,
        idRows.map((r) => r.id),
        8
      );
      setDetails(all.filter(Boolean) as DetailResp[]);
    } catch (e: any) {
      setError(e?.message ?? "Gagal memuat data");
    } finally {
      setLoadingDetails(false);
      setLoadingIds(false);
    }
  }, [type, limit]);

  React.useEffect(() => {
    // Muat otomatis saat pertama kali dan saat type/limit berubah
    reload();
  }, [reload]);

  const filtered = React.useMemo(() => {
    const q = salesQuery.trim().toLowerCase();
    if (!q) return details;
    return details.filter((d) => (d.salesName || "").toLowerCase().includes(q));
  }, [details, salesQuery]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Paket/NPKT Overview (Dummy)</h1>
        <div className="flex flex-wrap items-center gap-3">
          {/* Type selector */}
          <label className="text-sm">
            <span className="mr-2 font-medium">Type</span>
            <select
              value={type}
              onChange={(e) =>
                setType((e.target.value as ExternalType) || "paket")
              }
              className="px-2 py-1 rounded border bg-neutral-900/20 border-neutral-700"
            >
              <option value="paket">paket</option>
              <option value="npkt">npkt</option>
            </select>
          </label>

          {/* Limit */}
          <label className="text-sm">
            <span className="mr-2 font-medium">Limit</span>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value || 1))}
              className="w-24 px-2 py-1 rounded border bg-neutral-900/20 border-neutral-700"
            />
          </label>

          {/* Search Sales */}
          <input
            value={salesQuery}
            onChange={(e) => setSalesQuery(e.target.value)}
            placeholder="Cari nama sales…"
            className="px-3 py-1 rounded border bg-neutral-900/20 border-neutral-700"
          />

          <button
            onClick={reload}
            className="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm"
            disabled={loadingIds || loadingDetails}
            title="Reload data"
          >
            {loadingIds || loadingDetails ? "Loading…" : "Reload"}
          </button>
        </div>
      </header>

      {/* Status bar */}
      <div className="text-sm text-neutral-400">
        {error && (
          <div className="text-red-400">
            Error: <span className="font-mono">{String(error)}</span>
          </div>
        )}
        {!error && (
          <div className="flex flex-wrap items-center gap-4">
            <span>
              ID fetched:{" "}
              <b>
                {ids.length}
                {loadingIds ? "…" : ""}
              </b>
            </span>
            <span>
              Detail loaded:{" "}
              <b>
                {details.length}
                {loadingDetails ? "…" : ""}
              </b>
            </span>
            <span>
              After “Sales” filter: <b>{filtered.length}</b>
            </span>
          </div>
        )}
      </div>

      {/* Grid of cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((d) => {
          const id = d.meta?.paketId || d.id;
          const expand = !!expandMap[id];
          const items = d.items ?? [];
          const shown = expand ? items : items.slice(0, 6);
          const hasMore = items.length > shown.length;

          return (
            <article
              key={id}
              className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-base">{id}</h2>
                    <span
                      className={classNames(
                        "text-[11px] uppercase px-2 py-0.5 rounded",
                        d.type === "paket"
                          ? "bg-emerald-600/20 text-emerald-300 border border-emerald-700/40"
                          : "bg-amber-600/20 text-amber-300 border border-amber-700/40"
                      )}
                    >
                      {d.type}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-300">
                    {d.meta?.namaPaket || "-"}
                  </div>
                </div>
                <div className="text-right text-xs text-neutral-400">
                  <div>Tanggal Paket</div>
                  <div className="font-mono text-neutral-300">
                    {d.meta?.tglPaket || "-"}
                  </div>
                </div>
              </div>

              <div className="text-sm">
                <div className="text-neutral-400">Lokasi</div>
                <div className="text-neutral-200">
                  {d.lokasi || d.meta?.instansi || "-"}
                </div>
              </div>

              <div className="text-sm">
                <div className="text-neutral-400">Sales</div>
                <div className="font-medium">
                  {d.salesName || d.meta?.salesId || "-"}
                </div>
              </div>

              <div className="text-sm">
                <div className="text-neutral-400 mb-1">Kebutuhan</div>
                <div className="rounded border border-neutral-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-800/50">
                      <tr className="text-left">
                        <th className="px-3 py-2 w-[60%] font-medium">Item</th>
                        <th className="px-3 py-2 w-[20%] font-medium">Qty</th>
                        <th className="px-3 py-2 w-[20%] font-medium">
                          Satuan
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-3 py-3 text-neutral-400"
                          >
                            Tidak ada data.
                          </td>
                        </tr>
                      ) : (
                        shown.map((it, idx) => (
                          <tr
                            key={idx}
                            className={classNames(
                              "border-t border-neutral-800",
                              idx % 2 === 0 && "bg-neutral-900/20"
                            )}
                          >
                            <td className="px-3 py-2">{it.kebutuhan || "-"}</td>
                            <td className="px-3 py-2 font-mono">
                              {Number.isFinite(it.qty) ? it.qty : "-"}
                            </td>
                            <td className="px-3 py-2">{it.satuan || "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {hasMore && (
                  <button
                    onClick={() =>
                      setExpandMap((m) => ({ ...m, [id]: !expand }))
                    }
                    className="mt-2 text-xs text-blue-300 hover:underline"
                  >
                    {expand ? "Show less" : `Show all (${items.length})`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Empty / Loading states */}
      {!loadingIds && !loadingDetails && filtered.length === 0 && !error && (
        <div className="text-center text-neutral-400 py-10">
          Tidak ada data untuk filter saat ini.
        </div>
      )}
      {(loadingIds || loadingDetails) && (
        <div className="text-center text-neutral-400 py-6 animate-pulse">
          Memuat data…
        </div>
      )}
    </div>
  );
}
