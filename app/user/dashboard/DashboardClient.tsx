// app/user/dashboard/DashboardClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { TechnicianHeader } from "@/components/technician-header";
import { Pagination } from "@/components/pagination";
import { Star } from "lucide-react";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { createClient } from "@supabase/supabase-js";

// Branding util (sudah ada)
import {
  extractInstansi,
  INSTANSI_COLORS,
  autoTextColor,
} from "@/lib/brandingInstance";

/** ===================== Types ===================== **/
type Job = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  status: "not-started" | "in-progress" | "completed";
  progress?: number | null;
  isPending?: boolean;
  assignedTechnicians: { name: string; isLeader: boolean }[];
  type?: "survey" | "instalasi";
  building_name?: string | null;
  supervisor_name?: string | null;
  sales_name?: string | null;
  vehicle_name?: string | null;
  vehicle_names?: string[];
  progressDone?: number | null;
  progressTotal?: number | null;

  /** opsional dari BE (dipakai extractInstansi juga tetap jalan) */
  instansi?: "PPE" | "POS" | "POK" | "SGN" | "PPTI";
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** ===================== Utils umum ===================== **/
function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
function toNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** ===================== Milestone Celebration (ADD from code 1) ===================== **/
type Milestone = 25 | 50 | 75 | 100;

function getReachedMilestone(progressPct: number): Milestone | null {
  const pct = Math.max(0, Math.min(100, Math.round(progressPct || 0)));
  if (pct === 100) return 100;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  if (pct >= 25) return 25;
  return null;
}
function milestoneMessage(ms: Milestone): string {
  switch (ms) {
    case 25:
      return "Selamat anda sudah menyentuh 25% dari 100%, Push terus masbroo!";
    case 50:
      return "Cieee udah setengah nih, ayoo semangat terus sampe 100%";
    case 75:
      return "wahh udah hampir di penghujung nihh, ayoo ayoo gass terus dikit lagi bisaa nih";
    case 100:
      return "akhirnya selesai! selamat yaa dan terimakasih atas kerja kerasnya masbroo!";
  }
}

declare global {
  interface Window {
    confetti?: (opts?: any) => void;
    __confettiLoading?: boolean;
  }
}

async function ensureConfetti(): Promise<((opts?: any) => void) | null> {
  if (typeof window === "undefined") return null;
  if (typeof window.confetti === "function") return window.confetti;

  if (window.__confettiLoading) {
    return new Promise((resolve) => {
      let tries = 0;
      const t = setInterval(() => {
        if (typeof window.confetti === "function" || tries > 40) {
          clearInterval(t);
          resolve(typeof window.confetti === "function" ? window.confetti! : null);
        }
        tries++;
      }, 100);
    });
  }
  window.__confettiLoading = true;
  const src =
    "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
  try {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = reject;
      document.head.appendChild(s);
    });
  } catch {
    window.__confettiLoading = false;
    return null;
  }
  window.__confettiLoading = false;
  return typeof window.confetti === "function" ? window.confetti : null;
}

async function fireConfetti() {
  const confetti = await ensureConfetti();
  if (confetti) {
    confetti({
      particleCount: 80,
      spread: 70,
      startVelocity: 45,
      gravity: 0.9,
      origin: { y: 0.6 },
      zIndex: 9999,
    });
    setTimeout(() => {
      confetti({
        particleCount: 120,
        spread: 90,
        startVelocity: 55,
        ticks: 180,
        origin: { y: 0.4 },
        zIndex: 9999,
      });
    }, 250);
    return;
  }
  // Fallback sederhana
  const burst = document.createElement("div");
  burst.setAttribute(
    "style",
    [
      "position:fixed;inset:0;pointer-events:none;z-index:9999;",
      "background:radial-gradient(circle at 50% 60%, rgba(255,255,255,0.15), transparent 40%)",
      "animation:fadeout 900ms ease forwards",
    ].join("")
  );
  const style = document.createElement("style");
  style.innerHTML = `
    @keyframes fadeout { from { opacity: 1; } to { opacity: 0; } }
  `;
  document.body.appendChild(style);
  document.body.appendChild(burst);
  setTimeout(() => {
    burst.remove();
    style.remove();
  }, 1000);
}

function storageKey(jobId: string) {
  return `job:${jobId}:celebrated`;
}
function readCelebrated(jobId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(storageKey(jobId));
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
function writeCelebrated(jobId: string, ms: Milestone) {
  try {
    localStorage.setItem(storageKey(jobId), String(ms));
  } catch {}
}
function showFloatingMessage(msg: string) {
  const node = document.createElement("div");
  node.setAttribute(
    "style",
    [
      "position:fixed;left:50%;top:24px;transform:translateX(-50%);",
      "background:#16a34a;color:white;padding:12px 16px;",
      "border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.2);",
      "font-weight:600;z-index:10000;max-width:90vw;text-align:center;",
    ].join("")
  );
  node.textContent = `🎉 ${msg}`;
  document.body.appendChild(node);
  setTimeout(() => {
    node.style.transition = "opacity 300ms ease, transform 300ms ease";
    node.style.opacity = "0";
    node.style.transform = "translateX(-50%) translateY(-6px)";
    setTimeout(() => node.remove(), 350);
  }, 3000);
}

/** ==== Who am I (sales?) ==== */
type WhoLite = { isSales: boolean };
async function whoLite(): Promise<WhoLite> {
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user ?? null;
  if (!user) return { isSales: false };
  const email = (user.email || "").toLowerCase();

  // Cek email_roles.sales
  const { data: er } = await supabase
    .from("email_roles")
    .select("app_role")
    .eq("email", email)
    .limit(1);
  let isSales = Array.isArray(er) && er[0]?.app_role === "sales";

  // Fallback: tabel sales
  if (!isSales) {
    const { data: sr } = await supabase
      .from("sales")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    isSales = !!sr;
  }
  return { isSales };
}

/** ===================== Page ===================== **/
export default function TechnicianDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const jobsPerPage = 4;

  const [filterType, setFilterType] = useState<"all" | "survey" | "instalasi">(
    "all"
  );

  const technicianKeyRef = useRef<string | null>(null);
  const baseChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const projectsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const photosChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const surveyRoomsChannelRef = useRef<
    ReturnType<typeof supabase.channel> | null
  >(null);

  const completedPostedRef = useRef<Set<string>>(new Set());

  const [who, setWho] = useState<WhoLite>({ isSales: false });
  useEffect(() => {
    whoLite()
      .then(setWho)
      .catch(() => setWho({ isSales: false }));
  }, []);

  /** ==== Progress helper ==== */
  async function getJobProgress(jobId: string): Promise<{
    percent: number;
    isPending: boolean;
    done?: number;
    total?: number;
  }> {
    try {
      const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "progress fetch failed");

      const percent = toNum(json?.progress?.percent) ?? 0;
      const isPending = String(json?.status || "") === "pending";
      const done =
        toNum(json?.progress?.done) ??
        toNum(json?.progress?.complete) ??
        toNum(json?.uploaded);
      const total = toNum(json?.progress?.total) ?? toNum(json?.total);

      return { percent, isPending, done, total };
    } catch {
      return { percent: 0, isPending: false };
    }
  }

  async function attachProgress(items: Job[]): Promise<Job[]> {
    const enriched = await Promise.all(
      items.map(async (j) => {
        const { percent, isPending, done, total } = await getJobProgress(
          j.job_id
        );
        const status: Job["status"] =
          percent >= 100
            ? "completed"
            : percent > 0
            ? "in-progress"
            : "not-started";
        return {
          ...j,
          progress: percent,
          isPending,
          status: isPending ? "in-progress" : status,
          progressDone: typeof done === "number" ? done : null,
          progressTotal: typeof total === "number" ? total : null,
        };
      })
    );
    return enriched;
  }

  async function markProjectCompleted(projectId: string) {
    try {
      await fetch("/api/projects/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, status: "completed" }),
      });
    } catch (e) {
      completedPostedRef.current.delete(projectId);
      console.error("markProjectCompleted failed:", e);
    }
  }

  const loadJobs = async () => {
    try {
      setLoading(true);
      setErr(null);

      const res = await fetch(`/api/technicians/jobs`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat pekerjaan");

      const withProgress = await attachProgress(json.items ?? []);
      setJobs(withProgress);

      // ===== tetap: MATIKAN AUTO-PATCH COMPLETED UNTUK SALES =====
      if (!who.isSales) {
        const candidates = withProgress.filter(
          (j) => (j.progress ?? 0) >= 100 && !j.isPending
        );
        for (const j of candidates) {
          if (!completedPostedRef.current.has(j.id)) {
            completedPostedRef.current.add(j.id);
            markProjectCompleted(j.id);
          }
        }
      }

      const projectIds = (json.items ?? []).map((j: Job) => j.id);
      const jobIds = (json.items ?? []).map((j: Job) => j.job_id);
      resubscribeProjects(projectIds);
      resubscribePhotos(jobIds);
      resubscribeSurveyRooms(projectIds);
    } catch (e: any) {
      setErr(e.message || "Gagal memuat pekerjaan");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, who.isSales]); // reload saat info sales terdeteksi

  /** ==== Realtime Global ==== */
  useEffect(() => {
    const debouncedReload = debounce(loadJobs, 200);
    const ch = supabase
      .channel("tech-dashboard-base")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_assignments" },
        debouncedReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        debouncedReload
      )
      .subscribe();
    baseChannelRef.current = ch;
    return () => {
      if (baseChannelRef.current) supabase.removeChannel(baseChannelRef.current);
      baseChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resubscribeProjects(projectIds: string[]) {
    if (projectsChannelRef.current) {
      supabase.removeChannel(projectsChannelRef.current);
      projectsChannelRef.current = null;
    }
    if (!projectIds.length) return;
    const isUuid = /^[0-9a-f-]{36}$/i.test(projectIds[0]);
    const inList = isUuid
      ? projectIds.map((x) => `"${x}"`).join(",")
      : projectIds.join(",");
    const ch = supabase
      .channel(`tech-dashboard-projects`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
          filter: `id=in.(${inList})`,
        },
        debounce(loadJobs, 150)
      )
      .subscribe();
    projectsChannelRef.current = ch;
  }

  function resubscribePhotos(jobIds: string[]) {
    if (photosChannelRef.current) {
      supabase.removeChannel(photosChannelRef.current);
      photosChannelRef.current = null;
    }
    if (!jobIds.length) return;
    const q = jobIds.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");
    const ch = supabase
      .channel(`tech-dashboard-photos`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=in.(${q})`,
        },
        debounce(loadJobs, 150)
      )
      .subscribe();
    photosChannelRef.current = ch;
  }

  function resubscribeSurveyRooms(projectIds: string[]) {
    if (surveyRoomsChannelRef.current) {
      supabase.removeChannel(surveyRoomsChannelRef.current);
      surveyRoomsChannelRef.current = null;
    }
    if (!projectIds.length) return;
    const inList = projectIds.map((x) => `"${x}"`).join(",");
    const ch = supabase
      .channel("tech-dashboard-surveyrooms")
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "project_survey_rooms",
          event: "*",
          filter: `project_id=in.(${inList})`,
        },
        debounce(loadJobs, 150)
      )
      .subscribe();
    surveyRoomsChannelRef.current = ch;
  }

  /** ==== UI helpers (tetap dari code 2) ==== */
  const getStatusDisplay = (job: Job) => {
    const hasCount =
      typeof job.progressDone === "number" &&
      typeof job.progressTotal === "number";
    const countText = hasCount
      ? `${job.progressDone}/${job.progressTotal}`
      : null;

    if (job.isPending) {
      return {
        text: "Pending",
        color: "bg-amber-100 text-amber-700",
        countText,
      };
    }
    if ((job.progress ?? 0) >= 100) {
      return {
        text: "Selesai",
        color: "bg-green-100 text-green-700",
        countText,
      };
    }
    return {
      text: `${Math.max(0, Math.min(100, Math.round(job.progress ?? 0)))}%`,
      color: "bg-blue-100 text-blue-700",
      countText,
    };
  };

  // ADD from code 1: border berdasarkan status
  const getCardBorder = (job: Job) => {
    if (job.isPending) return "border-amber-200";
    if ((job.progress ?? 0) >= 100) return "border-green-200";
    if ((job.progress ?? 0) > 0) return "border-blue-200";
    return "border-gray-200";
  };

  /** ==== Navigasi card ==== */
  const handleJobClick = (job: Job) => {
    if (job.type === "survey") {
      router.push(`/user/survey/floors?jobId=${encodeURIComponent(job.id)}`);
    } else {
      router.push(`/user/upload_foto?job=${encodeURIComponent(job.job_id)}`);
    }
  };
  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () =>
    setCurrentPage((p) => Math.min(totalPages, p + 1));

  /** ==== Filter + Paging ==== */
  const filteredJobs = useMemo(() => {
    if (filterType === "all") return jobs;
    return jobs.filter((j) => (j.type ?? "instalasi") === filterType);
  }, [jobs, filterType]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage)),
    [filteredJobs.length]
  );
  const startIndex = (currentPage - 1) * jobsPerPage;
  const currentJobs = filteredJobs.slice(startIndex, startIndex + jobsPerPage);

  /** ==== Komponen Kartu (ADD from code 1, ditaruh di dalam agar akses helper) ==== */
  function JobCard({
    job,
    onClick,
  }: {
    job: Job;
    onClick: (job: Job) => void;
  }) {
    // Trigger milestone di level card
    const pct = Math.max(0, Math.min(100, Math.round(job.progress ?? 0)));
    const lastFiredRef = useRef<number>(-1);

    useEffect(() => {
      if (!job.id) return;
      const reached = getReachedMilestone(pct);
      if (!reached) return;

      const already = readCelebrated(job.id);
      if (reached > already && reached !== lastFiredRef.current) {
        lastFiredRef.current = reached;
        fireConfetti();
        showFloatingMessage(milestoneMessage(reached));
        writeCelebrated(job.id, reached);
      }
    }, [job.id, pct]);

    const badge = getStatusDisplay(job);

    // Branding instansi & warna
    const instansi = extractInstansi(job);
    const bgHex = INSTANSI_COLORS[instansi];
    const fgHex = autoTextColor(bgHex);

    const strongText = fgHex === "#FFFFFF" ? "text-white" : "text-black";
    const subtleText = fgHex === "#FFFFFF" ? "text-white/85" : "text-black/75";
    const monoText = fgHex === "#FFFFFF" ? "text-white/70" : "text-black/65";

    const borderClass = getCardBorder(job);
    const cardStyle: React.CSSProperties = { backgroundColor: bgHex, color: fgHex };

    const vehicleList: string[] = (
      job.vehicle_names?.length
        ? job.vehicle_names
        : job.vehicle_name
        ? [job.vehicle_name]
        : []
    ) as string[];

    return (
      <Card
        key={job.id}
        className={`cursor-pointer transition-all hover:shadow-md border ${borderClass}`}
        style={cardStyle}
        onClick={() => onClick(job)}
      >
        <CardContent className="px-2 py-1">
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 pr-2">
              <div className={`text-[10px] font-medium leading-none mb-0.5 ${monoText}`}>
                {instansi}
              </div>

              <h3 className={`font-bold text-sm mb-0.5 leading-tight ${strongText}`}>
                {job.name}
              </h3>

              {job.type === "survey" && job.building_name ? (
                <p className={`text-xs font-medium leading-tight mb-0.5 ${subtleText}`}>
                  Nama Gedung: {job.building_name}
                </p>
              ) : null}

              <p className={`text-xs leading-tight mb-0.5 ${subtleText}`}>
                {job.lokasi ?? "-"}
              </p>

              <div className={`text-xs mb-0.5 ${subtleText}`}>
                <span className="font-medium">Ditugaskan bersama:</span>
                <div className="mt-0.5">
                  {job.assignedTechnicians.map((tech, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <span>- {tech.name}</span>
                      {tech.isLeader && (
                        <Star className="h-2.5 w-2.5 text-red-500 fill-red-500" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-0.5">
              {/* Badge persentase + Rasio 1/50 */}
              <div className="flex items-center gap-1">
                <div
                  className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.color}`}
                  title={badge.countText ? `Progress ${badge.countText}` : undefined}
                >
                  {badge.text}
                </div>

                {badge.countText && (
                  <div
                    className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.color}`}
                    aria-label="rasio progress"
                    title={`Progress ${badge.countText}`}
                  >
                    {badge.countText}
                  </div>
                )}
              </div>

              <div className={`text-[10px] font-mono leading-none ${monoText}`}>
                {job.job_id}
              </div>

              {(job.supervisor_name || job.sales_name) && (
                <div className={`text-[10px] leading-tight text-right mt-0.5 ${subtleText}`}>
                  <div>
                    SPV: <b className={strongText}>{job.supervisor_name ?? "-"}</b>
                  </div>
                  <div>
                    Sales: <b className={strongText}>{job.sales_name ?? "-"}</b>
                  </div>
                </div>
              )}

              {/* Kendaraan */}
              <div className={`text-[10px] leading-tight text-right mt-0.5 ${subtleText}`}>
                {vehicleList.length === 0 ? (
                  <div>Kendaraan : -</div>
                ) : vehicleList.length === 1 ? (
                  <div>
                    Kendaraan : -{" "}
                    <b className={`whitespace-nowrap ${strongText}`}>{vehicleList[0]}</b>
                  </div>
                ) : (
                  <div className="text-right">
                    <div>Kendaraan :</div>
                    <div className="mt-0.5 space-y-0.5">
                      {vehicleList.map((v, idx) => (
                        <div key={idx} className="flex items-center gap-1 justify-end">
                          <span>-</span>
                          <b className={`whitespace-nowrap ${strongText}`}>{v}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  /** ==== Cleanup ==== */
  useEffect(() => {
    return () => {
      if (projectsChannelRef.current)
        supabase.removeChannel(projectsChannelRef.current);
      if (photosChannelRef.current)
        supabase.removeChannel(photosChannelRef.current);
      if (surveyRoomsChannelRef.current)
        supabase.removeChannel(surveyRoomsChannelRef.current);
    };
  }, []);

  /** ===================== Render ===================== **/
  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="Reaport"
        showFilter
        filterValue={filterType}
        onFilterChange={(v) => {
          setFilterType(v);
          setCurrentPage(1);
        }}
      />

      <main className="p-4">
        <div className="max-w-md mx-auto">
          {loading ? (
            <div className="text-center text-sm text-gray-600">Memuat...</div>
          ) : err ? (
            <div className="text-center text-sm text-red-600">{err}</div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center text-sm text-gray-600">
              Tidak ada tugas untuk filter ini.
            </div>
          ) : (
            <>
              <div className="space-y-1 mb-6">
                {currentJobs.map((job) => (
                  <JobCard key={job.id} job={job} onClick={handleJobClick} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  onNextPage={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                />
              )}
            </>
          )}
        </div>
      </main>

      <PWAInstallPrompt />
    </div>
  );
}
