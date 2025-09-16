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

type Job = {
  id: string; // projects.id (uuid)
  job_id: string; // projects.job_id (kode job)
  name: string;
  lokasi: string | null;
  status: "not-started" | "in-progress" | "completed";
  progress?: number | null; // 0..100
  isPending?: boolean; // dari /api/job-photos/[jobId]
  assignedTechnicians: { name: string; isLeader: boolean }[];

  // tambahan untuk filter Survey
  type?: "survey" | "instalasi";
  building_name?: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// debounce kecil
function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {
  let t: any;
  return (...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export default function DashboardClient() {
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
  const surveyRoomsChannelRef = useRef<ReturnType<
    typeof supabase.channel
  > | null>(null);

  // Cegah dobel PATCH completed
  const completedPostedRef = useRef<Set<string>>(new Set());

  async function getJobProgress(
    jobId: string
  ): Promise<{ percent: number; isPending: boolean }> {
    try {
      const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "progress fetch failed");
      const percent = Number(json?.progress?.percent ?? 0);
      const isPending = (json?.status as string) === "pending";
      return { percent, isPending };
    } catch {
      return { percent: 0, isPending: false };
    }
  }

  async function attachProgress(items: Job[]): Promise<Job[]> {
    const enriched = await Promise.all(
      items.map(async (j) => {
        const { percent, isPending } = await getJobProgress(j.job_id);
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

      const qTech = searchParams.get("technician");
      const lsCode =
        typeof window !== "undefined"
          ? localStorage.getItem("technician_code")
          : null;
      const lsId =
        typeof window !== "undefined"
          ? localStorage.getItem("technician_id")
          : null;

      const technician = qTech || lsId || lsCode; // prioritas
      technicianKeyRef.current = technician;

      const qs = technician
        ? `?technician=${encodeURIComponent(technician)}`
        : `?debug=1`;

      const res = await fetch(`/api/technicians/jobs${qs}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat pekerjaan");

      const withProgress = await attachProgress(json.items ?? []);
      setJobs(withProgress);

      // Auto-complete bila progress >= 100 & bukan pending
      const candidates = withProgress.filter(
        (j) => (j.progress ?? 0) >= 100 && !j.isPending
      );
      for (const j of candidates) {
        if (!completedPostedRef.current.has(j.id)) {
          completedPostedRef.current.add(j.id);
          markProjectCompleted(j.id);
        }
      }

      // Re-subscribe realtime untuk data yang relevan
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
  }, [searchParams]);

  // Realtime global: perubahan assignment/projects → refetch
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
      if (baseChannelRef.current)
        supabase.removeChannel(baseChannelRef.current);
      baseChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe khusus projects yang aktif di list
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

  // Subscribe khusus job_photos untuk job_id yang tampil
  function resubscribePhotos(jobIds: string[]) {
    if (photosChannelRef.current) {
      supabase.removeChannel(photosChannelRef.current);
      photosChannelRef.current = null;
    }
    if (!jobIds.length) return;

    // job_id text → perlu di-quote dan escape
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

  // Survey rooms → supaya filter Survey ikut realtime
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

  // ======== UI: filter + paging ========
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

  const getStatusDisplay = (job: Job) => {
    if (job.isPending) {
      return { text: "Pending", color: "bg-amber-100 text-amber-700" };
    }
    if ((job.progress ?? 0) >= 100) {
      return { text: "Selesai", color: "bg-green-100 text-green-700" };
    }
    return {
      text: `${Math.max(0, Math.min(100, Math.round(job.progress ?? 0)))}%`,
      color: "bg-blue-100 text-blue-700",
    };
  };

  const getCardBackground = (job: Job) => {
    if (job.isPending) return "bg-amber-50 border-amber-200";
    if ((job.progress ?? 0) >= 100) return "bg-green-50 border-green-200";
    if ((job.progress ?? 0) > 0) return "bg-blue-50 border-blue-200";
    return "bg-gray-50 border-gray-200";
  };

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

  // Bersihkan channel realtime saat unmount
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

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="SiLapor"
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
                {currentJobs.map((job) => {
                  const badge = getStatusDisplay(job);
                  const bg = getCardBackground(job);

                  return (
                    <Card
                      key={job.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${bg}`}
                      onClick={() => handleJobClick(job)}
                    >
                      <CardContent className="px-2 py-1">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex-1 pr-2">
                            <h3 className="font-bold text-sm text-gray-900 mb-0.5 leading-tight">
                              {job.name}
                            </h3>

                            {job.type === "survey" && job.building_name ? (
                              <p className="text-xs font-medium text-gray-700 leading-tight mb-0.5">
                                Nama Gedung: {job.building_name}
                              </p>
                            ) : null}

                            <p className="text-xs text-gray-600 leading-tight mb-0.5">
                              {job.lokasi ?? "-"}
                            </p>

                            <div className="text-xs text-gray-600 mb-0.5">
                              <span className="font-medium">
                                Ditugaskan bersama:
                              </span>
                              <div className="mt-0.5">
                                {job.assignedTechnicians.map((tech, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-1"
                                  >
                                    <span>
                                      {idx + 1}. {tech.name}
                                    </span>
                                    {tech.isLeader && (
                                      <Star className="h-2.5 w-2.5 text-red-500 fill-red-500" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-0.5">
                            <div
                              className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.color}`}
                            >
                              {badge.text}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono leading-none">
                              {job.job_id}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrevPage={handlePrevPage}
                  onNextPage={handleNextPage}
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
