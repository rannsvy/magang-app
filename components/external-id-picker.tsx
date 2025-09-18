"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type ExternalType = "paket" | "npkt";

export type ExternalSelected = {
  type: ExternalType;
  id: string;
  label: string;
} | null;

type Item = {
  id: string;
  label: string;
  type: ExternalType;
  date?: string | null;
};

export function ExternalIdPicker(props: {
  value: ExternalSelected;
  onChange: (v: ExternalSelected) => void;
  defaultType?: ExternalType;
  tglAwal?: string;
  tglAkhir?: string;
}) {
  const [type, setType] = React.useState<ExternalType>(
    props.defaultType ?? "paket"
  );
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const tglAwal = props.tglAwal ?? "2025-03-01";
  const tglAkhir = props.tglAkhir ?? "2025-09-01";

  // fetch 5 terbaru (ketika q kosong) atau berdasarkan q (debounce)
  React.useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(
      async () => {
        try {
          setLoading(true);
          const url = `/api/pog/ids?type=${type}&tglAwal=${encodeURIComponent(
            tglAwal
          )}&tglAkhir=${encodeURIComponent(tglAkhir)}&limit=5${
            q ? `&q=${encodeURIComponent(q)}` : ""
          }`;
          const res = await fetch(url, {
            signal: ctrl.signal,
            cache: "no-store",
          });
          const json = await res.json();
          setItems(json.items ?? []);
          setOpen(true);
        } catch {
          if (!ctrl.signal.aborted) setItems([]);
        } finally {
          setLoading(false);
        }
      },
      q ? 300 : 0
    ); // debounce saat user mengetik

    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [type, q, tglAwal, tglAkhir]);

  const chosen = props.value;

  return (
    <div className="flex flex-col gap-2">
      <Label className="min-w-[140px]">ID Paket / ID NPKT</Label>
      <div className="flex gap-2">
        {/* Toggle tipe kecil */}
        <div className="flex rounded-md border px-1 py-1 gap-1">
          <Button
            type="button"
            variant={type === "paket" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("paket")}
          >
            Paket
          </Button>
          <Button
            type="button"
            variant={type === "npkt" ? "default" : "outline"}
            size="sm"
            onClick={() => setType("npkt")}
          >
            NPKT
          </Button>
        </div>

        {/* Input tunggal */}
        <div className="relative flex-1">
          <input
            type="text"
            value={chosen ? chosen.id : q}
            onChange={(e) => {
              props.onChange(null); // reset pilihan saat user mengetik ulang
              setQ(e.target.value);
            }}
            onFocus={() => setOpen(true)}
            placeholder={
              type === "paket" ? "Cari ID Paket..." : "Cari ID NPKT..."
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          {open && (items.length > 0 || loading) && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow">
              <div className="max-h-64 overflow-auto">
                {loading && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Memuat…
                  </div>
                )}
                {!loading &&
                  items.map((it) => (
                    <button
                      key={`${it.type}-${it.id}`}
                      type="button"
                      onClick={() => {
                        props.onChange({
                          type: it.type,
                          id: it.id,
                          label: it.label,
                        });
                        setQ("");
                        setOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                      title={it.label}
                    >
                      <div className="font-medium">{it.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.type.toUpperCase()} {it.date ? `• ${it.date}` : ""}
                      </div>
                    </button>
                  ))}
                {!loading && items.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Tidak ada data
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clear */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setQ("");
            props.onChange(null);
            setOpen(false);
          }}
        >
          Reset
        </Button>
      </div>

      {chosen && (
        <p className="text-xs text-muted-foreground">
          Terpilih: <span className="font-medium">{chosen.id}</span> (
          {chosen.type.toUpperCase()})
        </p>
      )}
    </div>
  );
}
