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

/* ================= Client cache & inflight dedupe ================= */
const clientCache = new Map<string, { ts: number; items: Item[] }>();
const inflight = new Map<string, Promise<Item[]>>();
const CLIENT_TTL_MS = 60_000;

async function fetchIdsOnce(
  url: string,
  signal?: AbortSignal
): Promise<Item[]> {
  const now = Date.now();
  const cached = clientCache.get(url);
  if (cached && now - cached.ts < CLIENT_TTL_MS) return cached.items;

  const pending = inflight.get(url);
  if (pending) return pending;

  const p = (async () => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error("Failed to fetch");
    const j = await r.json();
    const items: Item[] = j.items ?? [];
    clientCache.set(url, { ts: Date.now(), items });
    return items;
  })().finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p;
}

/* ================= WIB date helpers ================= */
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
function oneYearRangeWIB() {
  const now = new Date();
  const start = new Date(now.getTime() - 365 * DAY_MS);
  return { tglAwal: ymdInTZ(start), tglAkhir: ymdInTZ(now) };
}

/* ================= Utils ================= */
function clsx(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}
function buildUrl(params: {
  type: ExternalType;
  tglAwal: string;
  tglAkhir: string;
  q: string;
}) {
  const { type, tglAwal, tglAkhir, q } = params;
  return (
    `/api/pog/ids` +
    `?type=${type}` +
    `&tglAwal=${encodeURIComponent(tglAwal)}` +
    `&tglAkhir=${encodeURIComponent(tglAkhir)}` +
    `&limit=50` +
    (q ? `&q=${encodeURIComponent(q)}` : "") +
    `&fields=id,label,date,type`
  );
}

/* ================= Komponen ================= */
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
  const qDeferred = React.useDeferredValue(q);

  const [items, setItems] = React.useState<Item[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const didInitialFetch = React.useRef(false);
  const reqIdRef = React.useRef(0);

  // Default range WIB: today .. today-365d, bisa di-override via props
  const defaultRange = React.useMemo(oneYearRangeWIB, []);
  const tglAwal = props.tglAwal ?? defaultRange.tglAwal;
  const tglAkhir = props.tglAkhir ?? defaultRange.tglAkhir;

  const chosen = props.value;

  /* ===== Tutup dropdown saat klik di luar ===== */
  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  /* ===== Fetch data tanpa flicker ===== */
  React.useEffect(() => {
    if (!open) return;
    if (document.activeElement !== inputRef.current) return;

    const ctrl = new AbortController();
    const wait = qDeferred ? 150 : 0;
    const thisReqId = ++reqIdRef.current;

    const t = setTimeout(async () => {
      try {
        if (!qDeferred && didInitialFetch.current) return;

        const url = buildUrl({ type, tglAwal, tglAkhir, q: qDeferred });

        setLoading(true);
        const list = await fetchIdsOnce(url, ctrl.signal);
        if (thisReqId === reqIdRef.current && !ctrl.signal.aborted) {
          setItems(list);
          didInitialFetch.current = true;
        }
      } catch {
        // silent; tetap render items lama
      } finally {
        if (thisReqId === reqIdRef.current && !ctrl.signal.aborted)
          setLoading(false);
      }
    }, wait);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, type, qDeferred, tglAwal, tglAkhir]);

  return (
    <div className="flex flex-col gap-2">
      <Label className="min-w-[140px]">ID Paket / ID NPKT</Label>
      <div className="flex gap-2">
        {/* Toggle tipe */}
        <div className="flex rounded-md border px-1 py-1 gap-1">
          <Button
            type="button"
            variant={type === "paket" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setType("paket");
              setOpen(false);
              didInitialFetch.current = false;
              reqIdRef.current++;
            }}
          >
            Paket
          </Button>
          <Button
            type="button"
            variant={type === "npkt" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setType("npkt");
              setOpen(false);
              didInitialFetch.current = false;
              reqIdRef.current++;
            }}
          >
            NPKT
          </Button>
        </div>

        {/* Input + dropdown */}
        <div ref={rootRef} className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={chosen ? chosen.id : q}
            onChange={(e) => {
              props.onChange(null);
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder={
              type === "paket" ? "Cari ID Paket..." : "Cari ID NPKT..."
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-expanded={open}
            aria-controls="external-id-suggestions"
            aria-autocomplete="list"
            role="combobox"
          />

          {open && (items.length > 0 || loading) && (
            <div
              id="external-id-suggestions"
              className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow"
              role="listbox"
            >
              <div
                className={clsx(
                  "h-0.5 w-full origin-left scale-x-0 transition-transform",
                  loading && "scale-x-100",
                  "bg-primary/70"
                )}
              />
              <div className="max-h-64 overflow-auto">
                {items.map((it) => (
                  <button
                    key={`${it.type}-${it.id}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
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
                    role="option"
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
            didInitialFetch.current = false;
            reqIdRef.current++;
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
