"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type WaitlistUnit = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  sales_name: string | null;
  presales_name: string | null;
  tgl_spk_user: string | null;
  tgl_terima_po: string | null;
  tanggal_deadline: string | null;
  sigma_teknisi: number;
  sigma_hari: number;
  sigma_man_days: number;
  durasi_minutes: number;
  insentif: number;
  id_paket: string | null;
  id_npkt: string | null;
  project_status: string;
  status: string;
  closed_at: string | null;
  completed_at: string | null;
  tanggal_mulai: string | null;
  created_at: string;
  updated_at: string;
  jam_datang: string | null;
  jam_pulang: string | null;
  project_packages?: Array<{
    seq: number;
    rw: string | null;
    rt: string | null;
  }>;
  paket_count?: number;
};

export default function ManageProject({ onDone }: { onDone?: () => void }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<WaitlistUnit[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dates, setDates] = useState<Record<string, string>>({});

  const canSave = useMemo(
    () => Object.entries(selected).some(([id, v]) => v && !!dates[id]),
    [selected, dates]
  );

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/manage-projects?query=${encodeURIComponent(q)}`
      );
      setItems((res?.data as WaitlistUnit[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  /* ========== Helper: normalisasi tanggal ke YYYY-MM-DD ========== */
  const toIsoDate = (raw?: string | null): string | null => {
    if (!raw) return null;
    const s = String(raw).trim();

    // sudah ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // dd/mm/yyyy | dd-mm-yyyy | dd mm yyyy
    const m = s.match(/^(\d{1,2})[\/\-\s](\d{1,2})[\/\-\s](\d{2,4})$/);
    if (!m) return null;

    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    let y = m[3];
    if (y.length === 2) y = `20${y}`;
    y = y.padStart(4, "0");

    const monthNum = Number(mo);
    const dayNum = Number(d);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

    return `${y}-${mo}-${d}`;
  };
  /* =============================================================== */

  async function handleSave() {
    const targets = Object.keys(selected).filter(
      (id) => selected[id] && dates[id]
    );
    if (!targets.length) return;

    setLoading(true);
    try {
      await Promise.all(
        targets.map((id) => {
          const iso = toIsoDate(dates[id]); // <- pastikan ISO
          if (!iso) {
            throw new Error(
              "Format tanggal tidak valid. Gunakan dd/mm/yyyy atau yyyy-mm-dd."
            );
          }
          // Kirim kedua field agar kompatibel dengan route yang
          // mengharapkan 'tanggal_mulai' ATAU 'installation_start_date'.
          return apiFetch(`/api/manage-projects/${id}/schedule`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tanggal_mulai: iso,
              installation_start_date: iso,
            }),
          });
        })
      );
      await load();
      setSelected({});
      setDates({});
      onDone?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* baris search: compact */}
      <div className="flex items-center gap-2 mb-2">
        <Input
          placeholder="Cari nama project / ID project..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full max-w-[640px]"
        />
        <Button onClick={load} disabled={loading}>
          Cari
        </Button>
      </div>

      {/* wrapper tabel */}
      <div className="flex-1 min-h-0">
        <div className="rounded-lg border bg-white overflow-auto min-h-[44vh] max-h-[60vh]">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>

            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr className="text-left text-xs font-semibold text-gray-700">
                <th className="px-3 py-2">Nama Project</th>
                <th className="px-3 py-2">Lokasi</th>
                <th className="px-3 py-2">ID Paket / ID NPKT</th>
                <th className="px-3 py-2 text-center">Paket</th>
                <th className="px-3 py-2">Detail Paket (RW/RT)</th>
                <th className="px-3 py-2">Tanggal Deadline Instalasi</th>
                <th className="px-3 py-2">Tanggal Mulai Instalasi</th>
                <th className="px-3 py-2 text-center">Select</th>
              </tr>
            </thead>

            <tbody className="text-sm">
              {items.map((it) => {
                const detail =
                  (it.project_packages ?? [])
                    .map((p) => `RW${p.rw ?? "-"}/RT${p.rt ?? "-"}`)
                    .join(", ") || "—";
                const paketCode = it.id_paket ?? it.id_npkt ?? "—";

                return (
                  <tr key={it.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium truncate" title={it.name}>
                        {it.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Sales: {it.sales_name ?? "—"} • Presales:{" "}
                        {it.presales_name ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        SPK: {it.tgl_spk_user ?? "—"} • PO:{" "}
                        {it.tgl_terima_po ?? "—"}
                      </div>
                    </td>

                    <td className="px-3 py-2 break-words">
                      <span title={it.lokasi ?? ""}>{it.lokasi ?? "—"}</span>
                    </td>

                    <td className="px-3 py-2">
                      <span className="truncate block" title={paketCode}>
                        {paketCode}
                      </span>
                    </td>

                    <td className="px-3 py-2 text-center">
                      {it.paket_count ?? 0}
                    </td>

                    <td className="px-3 py-2">
                      <span className="truncate block" title={detail}>
                        {detail}
                      </span>
                    </td>

                    <td className="px-3 py-2">{it.tanggal_deadline ?? "—"}</td>

                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 opacity-70 shrink-0" />
                        <input
                          type="date"
                          className="border rounded px-2 py-1 text-xs w-[110px]"
                          value={dates[it.id] ?? ""}
                          onChange={(e) =>
                            setDates((d) => ({ ...d, [it.id]: e.target.value }))
                          }
                          disabled={!selected[it.id]}
                          title="Tanggal Mulai Instalasi"
                        />
                      </div>
                    </td>

                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!selected[it.id]}
                          onCheckedChange={(v) =>
                            setSelected((s) => ({ ...s, [it.id]: v === true }))
                          }
                          aria-label="Select project"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!items.length && (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-sm text-gray-500"
                    colSpan={8}
                  >
                    Tidak ada data.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Tutup
        </Button>
        <Button onClick={handleSave} disabled={!canSave || loading}>
          Simpan
        </Button>
      </div>
    </div>
  );
}


