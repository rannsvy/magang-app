// app/user/dailyReport/page.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { TechnicianHeader } from "@/components/technician-header";
import { supabase } from "@/lib/supabaseBrowser";
import { apiFetch } from "@/lib/apiFetch";
import { Loader2, Send, MapPin, Users, Building2, CalendarDays } from "lucide-react";

/* ===== KONFIG ===== */
const ADMIN_WHATSAPP = "6281332424312"; // nomor admin
const ENDPOINTS = {
  jobsToday: (isoDate: string) =>
    `/api/technicians/jobs?date=${encodeURIComponent(isoDate)}`,

  // Koordinat sesuai skema attendance (longitude/latitude terpisah) — PERTAHANKAN
  todayCoords: (projectId: string, jobId: string | null | undefined, techId: string) => {
    const u = new URL("/api/attendance/coords", window.location.origin);
    u.searchParams.set("technicianId", techId);   // HARUS technicians.id
    if (projectId) u.searchParams.set("projectId", projectId);
    if (jobId) u.searchParams.set("jobId", jobId);
    return `${u.pathname}${u.search}`;
  },

  // Waktu Check In / Check Out — jalur GET /api/attendance (times)
  todayTimes: (projectId: string, jobId: string | null | undefined, techId: string) => {
    const u = new URL("/api/attendance", window.location.origin);
    u.searchParams.set("technicianId", techId);
    if (projectId) u.searchParams.set("projectId", projectId);
    if (jobId) u.searchParams.set("jobId", jobId);
    return `${u.pathname}${u.search}`;
  },

  // Progress (x/X)
  progressByJob: (jobId: string) => `/api/job-photos/${encodeURIComponent(jobId)}`,
} as const;

/* ===== TIPE ===== */
type UiJob = {
  id: string; // projects.id
  job_id: string;
  name: string;
  lokasi: string | null;
  status: "not-started" | "in-progress" | "completed";
  progress?: number | null;
  assignedTechnicians: { name: string; isLeader: boolean }[];
  type?: "survey" | "instalasi";
  building_name?: string | null;
  supervisor_name?: string | null;
  sales_name?: string | null;
  vehicle_name?: string | null;
  vehicle_names?: string[];
  // optional legacy fields:
  progressDone?: number | null;
  progressTotal?: number | null;
};

/* ===== UTIL ===== */
const hariIndo = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const bulanIndo = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function formatHariTanggalID(d: Date) {
  const h = hariIndo[d.getDay()];
  return `${h}, ${d.getDate()} ${bulanIndo[d.getMonth()]} ${d.getFullYear()}`;
}
function todayISO_WIB() {
  const ms = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
function techListForMessage(list: { name: string }[]) {
  if (!list?.length) return "";
  if (list.length === 1) return list[0].name;                  // inline jika 1 teknisi
  return list.map((t, i) => `${i + 1}. ${t.name}`).join("\n"); // list kebawah jika >1
}
function techListForDisplay(list: { name: string }[]) {
  return techListForMessage(list);
}
function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/* ==== DMS untuk koordinat (LAT dulu, lalu LON) ==== */
function toDMS(dec: number) {
  const abs = Math.abs(dec);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  const secStr = sec.toFixed(1).padStart(4, "0");
  return { deg, min, secStr };
}
function formatLatDMS(lat: number) {
  const hemi = lat < 0 ? "S" : "N";
  const { deg, min, secStr } = toDMS(lat);
  return `${deg}°${String(min).padStart(2, "0")}'${secStr}"${hemi}`;
}
function formatLonDMS(lon: number) {
  const hemi = lon < 0 ? "W" : "E";
  const { deg, min, secStr } = toDMS(lon);
  return `${deg}°${String(min).padStart(2, "0")}'${secStr}"${hemi}`;
}
function formatCoordsDMS(lat?: number | null, lon?: number | null) {
  const hasLat = typeof lat === "number" && Number.isFinite(lat);
  const hasLon = typeof lon === "number" && Number.isFinite(lon);
  if (!hasLat && !hasLon) return "";
  if (hasLat && hasLon) return `${formatLatDMS(lat!)} ${formatLonDMS(lon!)}`;
  if (hasLat) return formatLatDMS(lat!);
  return formatLonDMS(lon!);
}

/* ==== Deteksi zona waktu Indonesia dari LONGITUDE ==== */
/** Mengembalikan { key: 'WIB'|'WITA'|'WIT', label: string, offsetFromWIB: 0|1|2 } */
function detectIndoTZFromLongitude(lon?: number | null) {
  // Default WIB jika belum ada koordinat
  if (typeof lon !== "number" || !Number.isFinite(lon)) {
    return { key: "WIB" as const, label: "WIB", offsetFromWIB: 0 };
  }
  // Batas sederhana: <114.5 = WIB, 114.5–129.5 = WITA, ≥129.5 = WIT
  if (lon < 114.5) return { key: "WIB" as const, label: "WIB", offsetFromWIB: 0 };
  if (lon < 129.5) return { key: "WITA" as const, label: "WITA", offsetFromWIB: 1 };
  return { key: "WIT" as const, label: "WIT", offsetFromWIB: 2 };
}

/** Geser "HH:mm:ss" (WIB) ke zona lokal dengan delta jam (bisa 0/1/2) */
function shiftHHMMSS(wibTime?: string | null, deltaHours: number = 0) {
  if (!wibTime) return "";
  const [hStr, mStr, sStr] = wibTime.split(":");
  let h = Number(hStr || "0");
  const m = Number(mStr || "0");
  const s = Number(sStr || "0");
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return "";
  h = (h + deltaHours + 24) % 24; // geser & wrap 0..23
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ===== KOMPONEN ===== */
export default function DailyReportPage() {
  const [loading, setLoading] = useState(true);

  // technicians.id (bukan auth uid)
  const [techId, setTechId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<UiJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");

  // Koordinat & Progress
  const [coords, setCoords] = useState<{ lng?: number | null; lat?: number | null } | null>(null);
  const [progress, setProgress] = useState<{ done: number | null; total: number | null } | null>(null);

  // Times (as stored in WIB from DB)
  const [timesWIB, setTimesWIB] = useState<{ in?: string | null; out?: string | null }>({ in: null, out: null });

  // Pesan editable
  const [messageText, setMessageText] = useState("");
  const [messageDirty, setMessageDirty] = useState(false); // true = user sudah edit

  // Tanggal tampilan
  const [todayStr, setTodayStr] = useState<string>("");

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  // progress text
  const progressText = useMemo(() => {
    const pDone = progress?.done ?? selectedJob?.progressDone ?? null;
    const pTotal = progress?.total ?? selectedJob?.progressTotal ?? null;
    return typeof pDone === "number" && typeof pTotal === "number" && pTotal > 0
      ? `${pDone}/${pTotal}`
      : "";
  }, [progress, selectedJob]);

  // TZ berdasarkan longitude (kalau belum ada koordinat → WIB)
  const tz = useMemo(() => detectIndoTZFromLongitude(coords?.lng ?? null), [coords?.lng]);

  // Waktu lokal (display) dari WIB-time di DB
  const timeInLocal = useMemo(
    () => shiftHHMMSS(timesWIB.in, tz.offsetFromWIB) && timesWIB.in ? `${shiftHHMMSS(timesWIB.in, tz.offsetFromWIB)} ${tz.label}` : "",
    [timesWIB.in, tz]
  );
  const timeOutLocal = useMemo(
    () => shiftHHMMSS(timesWIB.out, tz.offsetFromWIB) && timesWIB.out ? `${shiftHHMMSS(timesWIB.out, tz.offsetFromWIB)} ${tz.label}` : "",
    [timesWIB.out, tz]
  );

  const ready = useMemo(() => {
    return Boolean(
      todayStr &&
        selectedJob &&
        (selectedJob.lokasi || "").length > 0 &&
        (selectedJob.assignedTechnicians?.length || 0) > 0 &&
        (selectedJob.sales_name || "").length > 0 &&
        (selectedJob.supervisor_name || "").length > 0 &&
        coords &&
        (safeNum(coords?.lat) !== null || safeNum(coords?.lng) !== null)
    );
  }, [todayStr, selectedJob, coords]);

  // builder template pesan
  function buildTemplate(opts: {
    todayStr: string;
    job: UiJob | null;
    coords: { lng?: number | null; lat?: number | null } | null;
    progressText: string;
    timeInLocal: string;
    timeOutLocal: string;
  }) {
    const { todayStr, job, coords, progressText, timeInLocal, timeOutLocal } = opts;
    if (!job) return "";

    const techJoined = techListForMessage(job.assignedTechnicians || []);
    const techBlock = techJoined.includes("\n")
      ? `Nama / List Teknisi:\n${techJoined}`
      : `Nama / List Teknisi: ${techJoined}`;

    const lngLatDms = formatCoordsDMS(coords?.lat ?? null, coords?.lng ?? null);

    const lines = [
      `Hari/Tanggal : ${todayStr}`,
      `Nama Project : ${job.name ?? ""}`,
      `Lokasi Project : ${job.lokasi ?? ""}`,
      `Waktu Check In : ${timeInLocal || "-"}`,
      `Waktu Check Out : ${timeOutLocal || "-"}`,
      techBlock,
      `Nama Sales: ${job.sales_name ?? ""}`,
      `Nama Supervisor: ${job.supervisor_name ?? ""}`,
      `Koordinat : ${lngLatDms}`,
      `Code Lokasi : `,
      `Progress: ${progressText || ""}`,
      `Ip Address : `,
      "",
      `Keterangan : \nListrik ON,\nMoratel ON`,
    ];

    return lines.map((l) => l.replace(/\s+$/g, "")).join("\n");
  }

  // saat template siap & user belum edit, isi otomatis
  useEffect(() => {
    if (ready && !messageDirty) {
      setMessageText(
        buildTemplate({
          todayStr,
          job: selectedJob,
          coords,
          progressText,
          timeInLocal,
          timeOutLocal,
        })
      );
    }
  }, [ready, messageDirty, todayStr, selectedJob, coords, progressText, timeInLocal, timeOutLocal]);

  const onEditMessage = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageDirty(true);
    setMessageText(e.target.value);
  };

  const resetMessageToTemplate = () => {
    setMessageDirty(false);
    setMessageText(
      buildTemplate({
        todayStr,
        job: selectedJob,
        coords,
        progressText,
        timeInLocal,
        timeOutLocal,
      })
    );
  };

  const waHref = useMemo(() => {
    if (!messageText) return "";
    const url = new URL(`https://wa.me/${ADMIN_WHATSAPP}`);
    url.searchParams.set("text", messageText);
    return url.toString();
  }, [messageText]);

  // init tanggal & resolve technicians.id
  useEffect(() => {
    setTodayStr(formatHariTanggalID(new Date()));
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id || null;

      let resolvedTechId: string | null = null;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("technician_id")
          .eq("id", uid)
          .maybeSingle();
        resolvedTechId = prof?.technician_id ? String(prof.technician_id) : uid; // fallback
      }
      setTechId(resolvedTechId);
    })();
  }, []);

  // fetch jobs hari ini
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const dateISO = todayISO_WIB();
        const res = await apiFetch<{ items: UiJob[] }>(ENDPOINTS.jobsToday(dateISO));
        if (cancelled) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        setJobs(items);
        if (items.length === 1) setSelectedJobId(items[0].id);
      } catch (e) {
        console.error("[dailyReport] gagal fetch jobs:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // fetch koordinat (PERTAHANKAN)
  useEffect(() => {
    if (!selectedJobId || !techId) {
      setCoords(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const job = jobs.find((j) => j.id === selectedJobId) || null;
        const url = ENDPOINTS.todayCoords(selectedJobId, job?.job_id, techId);

        const resp = await apiFetch<{
          data: { longitude: number | null; latitude: number | null; source?: string | null };
        }>(url);

        if (cancelled) return;

        const d = resp?.data || {};
        const lng = safeNum(d?.longitude);
        const lat = safeNum(d?.latitude);
        setCoords({ lng, lat });
      } catch (e) {
        console.error("[dailyReport] gagal fetch koordinat (/api/attendance/coords):", e);
        setCoords(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedJobId, techId, jobs]);

  // fetch waktu (Check In / Out) — dari /api/attendance?technicianId=&projectId=
  useEffect(() => {
    if (!selectedJobId || !techId) {
      setTimesWIB({ in: null, out: null });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const job = jobs.find((j) => j.id === selectedJobId) || null;
        const url = ENDPOINTS.todayTimes(selectedJobId, job?.job_id, techId);
        const res = await apiFetch<{ data?: { check_in_time?: string | null; check_out_time?: string | null } }>(url);
        if (cancelled) return;
        const tIn = res?.data?.check_in_time ?? null;
        const tOut = res?.data?.check_out_time ?? null;
        setTimesWIB({ in: tIn, out: tOut });
      } catch (e) {
        console.error("[dailyReport] gagal fetch times (GET /api/attendance):", e);
        setTimesWIB({ in: null, out: null });
      }
    })();
    return () => { cancelled = true; };
  }, [selectedJobId, techId, jobs]);

  // fetch PROGRESS (x/X)
  useEffect(() => {
    const jobId = selectedJob?.job_id;
    if (!jobId) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = ENDPOINTS.progressByJob(jobId);
        const res = await apiFetch<{
          progress?: { total?: number; complete?: number; uploaded?: number; done?: number; percent?: number };
          total?: number;
          uploaded?: number;
        }>(url);

        if (cancelled) return;

        const done =
          (typeof res?.progress?.done === "number" ? res?.progress?.done : undefined) ??
          (typeof res?.progress?.complete === "number" ? res?.progress?.complete : undefined) ??
          (typeof res?.uploaded === "number" ? res?.uploaded : undefined) ??
          null;

        const total =
          (typeof res?.progress?.total === "number" ? res?.progress?.total : undefined) ??
          (typeof res?.total === "number" ? res?.total : undefined) ??
          null;

        setProgress({ done: done ?? null, total: total ?? null });
      } catch (e) {
        console.error("[dailyReport] gagal fetch progress (x/X):", e);
        setProgress(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedJob?.job_id]);

  const handleSelectJob = useCallback((val: string) => {
    setSelectedJobId(val);
    setMessageDirty(false);
    setProgress(null);
    setCoords(null);
    setTimesWIB({ in: null, out: null });
  }, []);

  return (
    <div className="min-h-screen">
      <TechnicianHeader title="Daily Report" showBackButton backUrl="/user/dashboard" />
      <div className="max-w-2xl mx-auto px-4 pb-24">
        <Card className="mt-4 shadow-sm">
          <CardContent className="space-y-5 pt-6">
            {/* Hari & Tanggal */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                Hari & Tanggal
              </Label>
              <Input readOnly value={todayStr} />
            </div>

            {/* Nama Project */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Nama Project
              </Label>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Memuat project…
                </div>
              ) : jobs.length <= 1 ? (
                <Input readOnly value={selectedJob?.name || (jobs[0]?.name ?? "")} />
              ) : (
                <Select value={selectedJobId} onValueChange={handleSelectJob}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih project" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Lokasi */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lokasi
              </Label>
              <Input readOnly value={selectedJob?.lokasi ?? ""} placeholder="Pilih project terlebih dahulu" />
            </div>

            {/* Waktu Check In / Out (otomatis WIB→WITA/WIT via longitude) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Waktu Check In</Label>
                <Input readOnly value={timeInLocal || ""} placeholder="-" />
              </div>
              <div className="space-y-1.5">
                <Label>Waktu Check Out</Label>
                <Input readOnly value={timeOutLocal || ""} placeholder="-" />
              </div>
            </div>

            {/* Nama Teknisi / List Teknisi */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Nama Teknisi / List Teknisi
                </Label>
              </div>

              {(() => {
                const list = selectedJob?.assignedTechnicians || [];
                if (list.length <= 1) {
                  return (
                    <Input
                      readOnly
                      value={list[0]?.name ?? ""}
                      placeholder="Akan terisi otomatis setelah memilih project"
                    />
                  );
                }
                return (
                  <Textarea
                    readOnly
                    value={techListForDisplay(list)}
                    className="min-h-[88px] whitespace-pre-wrap"
                    placeholder="Akan terisi otomatis setelah memilih project"
                  />
                );
              })()}
            </div>

            {/* Sales & Supervisor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nama Sales</Label>
                <Input readOnly value={selectedJob?.sales_name ?? ""} placeholder="-" />
              </div>
              <div className="space-y-1.5">
                <Label>Nama Supervisor</Label>
                <Input readOnly value={selectedJob?.supervisor_name ?? ""} placeholder="-" />
              </div>
            </div>

            {/* Koordinat */}
            <div className="space-y-1.5">
              <Label>Koordinat (Check-in / Check-out)</Label>
              <Input
                readOnly
                value={formatCoordsDMS(coords?.lat ?? null, coords?.lng ?? null)}
                placeholder="Akan terisi otomatis apabila sudah Check In dan Check Out"
              />
            </div>

            {/* Pesan (Template) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Pesan (Template)</Label>
                {messageText && (
                  <button
                    type="button"
                    onClick={resetMessageToTemplate}
                    className="text-xs text-blue-600 hover:underline"
                    title="Kembalikan isi pesan ke template otomatis"
                  >
                    Reset ke template
                  </button>
                )}
              </div>

              <Textarea
                className="min-h-[220px] font-mono text-sm whitespace-pre-wrap"
                placeholder="Template akan muncul otomatis setelah semua data siap."
                value={messageText}
                onChange={onEditMessage}
                readOnly={!ready}
              />

              {!ready && (
                <p className="text-xs text-muted-foreground">
                  Lengkapi data (project, lokasi, teknisi, sales, supervisor, koordinat) agar template muncul.
                </p>
              )}
            </div>

            {/* Kirim via WhatsApp (full width, opsional jika Anda ingin) */}
            <div className="mt-3">
              <Button asChild disabled={!waHref} className="w-full h-11 gap-2 text-base">
                <a href={waHref || "#"} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center">
                  <Send className="h-4 w-4" />
                  Kirim via WhatsApp
                </a>
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Catatan: Isi <em>Code Lokasi</em>, <em>IP Address</em>, dan <em>Keterangan</em> secara manual setelah WhatsApp terbuka.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
