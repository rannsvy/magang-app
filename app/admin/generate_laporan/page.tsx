"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminHeader } from "@/components/admin-header";
import {
  FileText,
  Download,
  Eye,
  Calendar,
  MapPin,
  User,
  Camera,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  X,
} from "lucide-react";

/* ================= Supabase ================= */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ================= Types ================= */
interface GenerateForm {
  projectName: string; // id group (job_group_id atau job_groups.id)
  jobId: string; // projects.job_id
}

interface ProjectGroup {
  id: string;
  name: string;
}

interface JobRow {
  id: string; // UI pakai ini = job_id
  job_id?: string | null; // raw
  name: string | null;
  project_id: string; // projects.id (uuid)
  lokasi: string | null;
  tanggal_mulai?: string | null;
  closed_at?: string | null;
  sigma_teknisi?: number | null;
  sales_name?: string | null;
  presales_name?: string | null;
}

interface PhotoCategory {
  id: string;
  name: string;
  photos: string[];
  currentIndex: number;
  snKey?: string | null; // mis. "Device 1" / "Main Unit"
}

interface ReportPreview {
  jobName: string;
  technicianName: string;
  location: string;
  completedDate: string;
  photoCategories: PhotoCategory[];
  serialNumbers: { [key: string]: string };
  notes: string;
  projectName?: string;
}

interface HoverOverlayState {
  isOpen: boolean;
  categoryId: string;
  photoIndex: number;
  isLoading: boolean;
  hasError: boolean;
}

/* =============== Fallback (jika DB kosong) =============== */
const FALLBACK_CATEGORIES: Array<Pick<PhotoCategory, "id" | "name" | "snKey">> =
  [
    { id: "fisik", name: "Fisik", snKey: undefined },
    { id: "serial-number", name: "Serial Number", snKey: undefined },
    { id: "cctv-1", name: "CCTV 1", snKey: "Device 1" },
    { id: "cctv-2", name: "CCTV 2", snKey: "Device 2" },
    { id: "power-supply", name: "Power Supply", snKey: "Device 2" },
    { id: "network-switch", name: "Network Switch", snKey: "Main Unit" },
    { id: "dvr-nvr", name: "DVR/NVR", snKey: "Main Unit" },
    { id: "monitor-display", name: "Monitor Display", snKey: "Main Unit" },
    { id: "testing", name: "Testing", snKey: undefined },
    { id: "dokumentasi-final", name: "Dokumentasi Final", snKey: undefined },
  ];

/* =============== Utils =============== */
const truncateSerialNumber = (sn: string, max = 12) =>
  sn.length <= max ? sn : sn.slice(0, max) + "...";

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toISOString().slice(0, 10); // YYYY-MM-DD
  } catch {
    return String(d);
  }
};

/* =============== Page =============== */
export default function GenerateLaporanPage() {
  const searchParams = useSearchParams();

  // Form
  const [formData, setFormData] = useState<GenerateForm>({
    projectName: "",
    jobId: "",
  });

  // List dari DB
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(
    null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGridPage, setCurrentGridPage] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  // Hover overlay
  const [hoverOverlay, setHoverOverlay] = useState<HoverOverlayState>({
    isOpen: false,
    categoryId: "",
    photoIndex: 0,
    isLoading: false,
    hasError: false,
  });
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  /* ======== Ambil Project Group ======== */
  useEffect(() => {
    let isMounted = true;

    async function fetchGroups() {
      setLoadingProjects(true);
      setErrorMsg(null);

      // Coba pakai tabel job_groups (kalau ada)
      const tryGroups = await supabase
        .from("job_groups")
        .select("id,name")
        .order("name", { ascending: true });

      if (!isMounted) return;

      if (!tryGroups.error && (tryGroups.data?.length ?? 0) > 0) {
        setProjectGroups(tryGroups.data as ProjectGroup[]);
        setLoadingProjects(false);
        return;
      }

      // Fallback: distinct job_group_id dari projects
      const { data, error } = await supabase
        .from("projects")
        .select("job_group_id")
        .not("job_group_id", "is", null)
        .order("job_group_id", { ascending: true });

      if (!isMounted) return;

      if (error) {
        console.error(error);
        setErrorMsg("Gagal memuat daftar project group");
        setProjectGroups([]);
      } else {
        const uniq = Array.from(
          new Set((data ?? []).map((r: any) => String(r.job_group_id)))
        );
        setProjectGroups(uniq.map((id) => ({ id, name: id })));
      }

      setLoadingProjects(false);
    }

    fetchGroups();
    return () => {
      isMounted = false;
    };
  }, []);

  /* ======== Ambil Jobs per group ======== */
  useEffect(() => {
    let isMounted = true;

    async function fetchJobsByGroup(groupId: string) {
      setLoadingJobs(true);
      setErrorMsg(null);

      // ⚠️ HANYA pilih kolom yang ADA di skema kamu
      const { data, error } = await supabase
        .from("projects")
        .select(
          "id, job_id, job_group_id, name, lokasi, tanggal_mulai, closed_at, sigma_teknisi, sales_name, presales_name"
        )
        .eq("job_group_id", groupId)
        .order("job_id", { ascending: true });

      if (!isMounted) return;

      if (error) {
        console.error(error);
        setErrorMsg("Gagal memuat daftar pekerjaan");
        setJobs([]);
      } else {
        const rows: JobRow[] = (data || []).map((j: any) => ({
          id: String(j.job_id),
          job_id: j.job_id ?? null,
          name: j.name ?? null,
          project_id: String(j.id),
          lokasi: j.lokasi ?? null,
          tanggal_mulai: j.tanggal_mulai ?? null,
          closed_at: j.closed_at ?? null,
          sigma_teknisi: j.sigma_teknisi ?? null,
          sales_name: j.sales_name ?? null,
          presales_name: j.presales_name ?? null,
        }));
        setJobs(rows);
      }

      setLoadingJobs(false);
    }

    if (formData.projectName) {
      fetchJobsByGroup(formData.projectName);
    } else {
      setJobs([]);
    }

    return () => {
      isMounted = false;
    };
  }, [formData.projectName]);

  // (opsional) auto-pilih group dari query ?project=
  useEffect(() => {
    const projectParam = searchParams.get("project");
    if (projectParam && !formData.projectName && projectGroups.length) {
      const decoded = decodeURIComponent(projectParam);
      const found = projectGroups.find(
        (p) => p.name === decoded || p.id === decoded
      );
      if (found) {
        setFormData((prev) => ({ ...prev, projectName: found.id, jobId: "" }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, projectGroups.length]);

  // Cleanup hover timeout
  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [hoverTimeout]);

  /* ================= Form handlers ================= */
  const handleInputChange = (field: keyof GenerateForm, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "projectName") next.jobId = "";
      return next;
    });
  };

  const selectedProject = useMemo(
    () => projectGroups.find((p) => p.id === formData.projectName) || null,
    [projectGroups, formData.projectName]
  );

  const isFormValid = () => Boolean(formData.projectName && formData.jobId);

  /* ================= Generate Preview ================= */
  const handleGenerate = async () => {
    if (!isFormValid()) {
      alert("Mohon lengkapi semua field");
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const selectedJob = jobs.find((j) => j.id === formData.jobId);

      // 1) Serial Numbers (opsional, fallback bila tabel belum ada)
      let serialNumbers: Record<string, string> = {
        "Device 1": "SN001234567",
        "Device 2": "SN001234568",
        "Main Unit": "MU987654321",
      };
      const snQuery = await supabase
        .from("job_serial_numbers")
        .select("label, value")
        .eq("job_id", formData.jobId);

      if (!snQuery.error && snQuery.data) {
        const map = (snQuery.data || []).reduce(
          (acc: Record<string, string>, r: any) => {
            acc[String(r.label)] = String(r.value);
            return acc;
          },
          {}
        );
        if (Object.keys(map).length) serialNumbers = map;
      }

      // 2) Categories (opsional)
      let categories: PhotoCategory[] = FALLBACK_CATEGORIES.map((c) => ({
        ...c,
        photos: [],
        currentIndex: 0,
      }));

      const catQuery = await supabase
        .from("job_photo_categories")
        .select("id, name, sn_key, sort_order")
        .order("sort_order", { ascending: true });

      if (!catQuery.error && catQuery.data?.length) {
        categories = (catQuery.data as any[]).map((c) => ({
          id: String(c.id),
          name: String(c.name),
          snKey: c.sn_key ? String(c.sn_key) : undefined,
          photos: [],
          currentIndex: 0,
        }));
      }

      // 3) Photos per job (opsional)
      const photoQuery = await supabase
        .from("job_photos")
        .select("category_id, url, sort_order")
        .eq("job_id", formData.jobId)
        .order("sort_order", { ascending: true });

      if (!photoQuery.error && photoQuery.data) {
        const photoMap = (photoQuery.data || []).reduce(
          (acc: Record<string, string[]>, p: any) => {
            const cid = String(p.category_id);
            if (!acc[cid]) acc[cid] = [];
            acc[cid].push(String(p.url || "/placeholder.svg"));
            return acc;
          },
          {}
        );
        categories = categories.map((c) => ({
          ...c,
          photos:
            photoMap[c.id] && photoMap[c.id].length
              ? photoMap[c.id]
              : ["/placeholder.svg?height=200&width=300"],
        }));
      } else {
        // Jika tabel job_photos belum ada → kasih placeholder biar tile tampil
        categories = categories.map((c) => ({
          ...c,
          photos: c.photos.length
            ? c.photos
            : ["/placeholder.svg?height=200&width=300"],
        }));
      }

      // Build header preview dari kolom yang ada
      const jobName = selectedJob?.name || selectedJob?.id || "";
      const location = selectedJob?.lokasi || "";
      const completedDate =
        fmtDate(selectedJob?.closed_at) ||
        fmtDate(selectedJob?.tanggal_mulai) ||
        "—";
      const technicianName =
        selectedJob?.sales_name ||
        selectedJob?.presales_name ||
        (typeof selectedJob?.sigma_teknisi === "number"
          ? `Teknisi (${selectedJob?.sigma_teknisi})`
          : "Teknisi");

      const preview: ReportPreview = {
        jobName,
        technicianName,
        location,
        completedDate,
        photoCategories: categories,
        serialNumbers,
        notes:
          "Pekerjaan telah selesai dilakukan dengan baik. Semua perangkat berfungsi normal dan sudah terhubung ke sistem.",
        projectName: selectedProject?.name,
      };

      setReportPreview(preview);
      setCurrentGridPage(0);
      setShowPreview(true);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Gagal menghasilkan preview laporan");
    } finally {
      setIsGenerating(false);
    }
  };

  /* ================= Grid & Overlay (seperti Code 1) ================= */
  const itemsPerPage = 20;
  const totalPages = reportPreview
    ? Math.ceil(reportPreview.photoCategories.length / itemsPerPage)
    : 0;

  const getCurrentPageItems = () => {
    if (!reportPreview) return [];
    const startIndex = currentGridPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return reportPreview.photoCategories.slice(startIndex, endIndex);
  };

  const handleGridNavigation = (dir: "prev" | "next") => {
    if (dir === "next" && currentGridPage < totalPages - 1) {
      setCurrentGridPage((p) => p + 1);
    } else if (dir === "prev" && currentGridPage > 0) {
      setCurrentGridPage((p) => p - 1);
    }
  };

  const getSerialNumberForCategory = (
    category: PhotoCategory,
    serialNumbers: { [key: string]: string }
  ) => {
    if (category.snKey && serialNumbers[category.snKey])
      return serialNumbers[category.snKey];
    const map: Record<string, string> = {
      "cctv-1": "Device 1",
      "cctv-2": "Device 2",
      "cctv-3": "Device 1",
      "cctv-4": "Device 2",
      "cctv-5": "Device 1",
      "dvr-nvr": "Main Unit",
      "network-switch": "Main Unit",
      "power-supply": "Device 2",
      "monitor-display": "Main Unit",
    };
    const key = map[category.id];
    return key ? serialNumbers[key] : undefined;
  };

  const [hoverOverlayState, setHoverOverlayState] = useState(0); // dummy to force re-render on quick nav

  const handleCarouselNavigation = (
    categoryId: string,
    direction: "prev" | "next"
  ) => {
    if (!reportPreview) return;
    setReportPreview((prev) => {
      if (!prev) return prev;
      const updated = prev.photoCategories.map((category) => {
        if (category.id === categoryId && category.photos.length > 0) {
          const maxIndex = category.photos.length - 1;
          let newIndex = category.currentIndex;
          newIndex =
            direction === "next"
              ? newIndex >= maxIndex
                ? 0
                : newIndex + 1
              : newIndex <= 0
              ? maxIndex
              : newIndex - 1;

          if (hoverOverlay.isOpen && hoverOverlay.categoryId === categoryId) {
            setHoverOverlay((ov) => ({
              ...ov,
              photoIndex: newIndex,
              isLoading: true,
              hasError: false,
            }));
            setTimeout(
              () => setHoverOverlay((ov) => ({ ...ov, isLoading: false })),
              150
            );
            setHoverOverlayState((s) => s + 1);
          }
          return { ...category, currentIndex: newIndex };
        }
        return category;
      });
      return { ...prev, photoCategories: updated };
    });
  };

  const showHoverOverlay = (categoryId: string) => {
    const category = reportPreview?.photoCategories.find(
      (c) => c.id === categoryId
    );
    if (!category || category.photos.length === 0) return;
    setHoverOverlay({
      isOpen: true,
      categoryId,
      photoIndex: category.currentIndex,
      isLoading: true,
      hasError: false,
    });
    setTimeout(
      () => setHoverOverlay((prev) => ({ ...prev, isLoading: false })),
      200
    );
  };

  const hideHoverOverlay = () =>
    setHoverOverlay((prev) => ({ ...prev, isOpen: false }));

  const handleImageHoverEnter = (categoryId: string) => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    const timeout = setTimeout(() => showHoverOverlay(categoryId), 1000);
    setHoverTimeout(timeout);
  };

  const handleImageHoverLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  };

  const handleArrowClick = (
    e: React.MouseEvent,
    categoryId: string,
    direction: "prev" | "next"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    handleCarouselNavigation(categoryId, direction);
  };

  const handleImageClick = (categoryId: string) => {
    if (hoverOverlay.isOpen && hoverOverlay.categoryId === categoryId) {
      hideHoverOverlay();
    } else {
      showHoverOverlay(categoryId);
    }
  };

  const getCurrentOverlayPhoto = () => {
    const category = reportPreview?.photoCategories.find(
      (c) => c.id === hoverOverlay.categoryId
    );
    return category?.photos[hoverOverlay.photoIndex] || "";
  };

  const getCurrentOverlayCategory = () =>
    reportPreview?.photoCategories.find(
      (c) => c.id === hoverOverlay.categoryId
    );

  const handleDownloadReport = () => {
    alert("Download report (PDF) belum diimplementasikan.");
  };

  const handleBackToForm = () => setShowPreview(false);

  /* ================= UI (Desain Code 1) ================= */
  return (
    <div className="min-h-screen bg-gray-50">
      {!showPreview ? (
        <AdminHeader
          title="Generate Laporan"
          showBackButton={true}
          backUrl="/admin/dashboard"
        />
      ) : (
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (window.location.href = "/admin/dashboard")}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">
                Generate Laporan
              </h1>
            </div>
            <Button
              onClick={handleBackToForm}
              variant="outline"
              className="flex items-center gap-2 bg-transparent"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Form
            </Button>
          </div>
        </div>
      )}

      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {!showPreview ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Form */}
              <div className="lg:sticky lg:top-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-3">
                      <FileText className="h-8 w-8 text-blue-600" />
                      Form Generate Laporan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="project" className="text-lg font-medium">
                        Nama Project *
                      </Label>
                      <Select
                        value={formData.projectName}
                        onValueChange={(value) =>
                          handleInputChange("projectName", value)
                        }
                        disabled={loadingProjects}
                      >
                        <SelectTrigger className="text-lg py-3">
                          <SelectValue
                            placeholder={
                              loadingProjects
                                ? "Memuat daftar project..."
                                : "Pilih nama project"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {projectGroups.map((p) => (
                            <SelectItem
                              key={p.id}
                              value={p.id}
                              className="text-lg"
                            >
                              {p.name}
                            </SelectItem>
                          ))}
                          {!loadingProjects && projectGroups.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              Tidak ada project
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="job" className="text-lg font-medium">
                        ID Pekerjaan *
                      </Label>
                      <Select
                        value={formData.jobId}
                        onValueChange={(value) =>
                          handleInputChange("jobId", value)
                        }
                        disabled={!formData.projectName || loadingJobs}
                      >
                        <SelectTrigger className="text-lg py-3">
                          <SelectValue
                            placeholder={
                              !formData.projectName
                                ? "Pilih nama project terlebih dahulu"
                                : loadingJobs
                                ? "Memuat daftar pekerjaan..."
                                : jobs.length
                                ? "Pilih ID pekerjaan"
                                : "Belum ada pekerjaan untuk project ini"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {jobs.map((job) => (
                            <SelectItem
                              key={job.id}
                              value={job.id}
                              className="text-lg"
                            >
                              {job.id}
                            </SelectItem>
                          ))}
                          {!loadingJobs &&
                            formData.projectName &&
                            jobs.length === 0 && (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                Tidak ada pekerjaan
                              </div>
                            )}
                        </SelectContent>
                      </Select>
                    </div>

                    {errorMsg && (
                      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                        {errorMsg}
                      </div>
                    )}

                    <div className="pt-4">
                      <Button
                        onClick={handleGenerate}
                        disabled={!isFormValid() || isGenerating}
                        className="w-full bg-green-600 hover:bg-green-700 text-lg py-4 disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            Generating...
                          </div>
                        ) : (
                          <>
                            <FileText className="h-5 w-5 mr-2" />
                            Generate Laporan
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Placeholder Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <Eye className="h-8 w-8 text-green-600" />
                    Preview Laporan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-96 text-gray-500">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">
                        Pilih data dan klik Generate untuk melihat preview
                        laporan
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* ================= PREVIEW ================= */
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                <div className="xl:col-span-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Detail Pekerjaan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-bold text-lg text-gray-900 mb-1">
                          {reportPreview?.jobName}
                        </h4>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Teknisi
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2" />
                          {reportPreview?.technicianName}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Tanggal
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          {reportPreview?.completedDate}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Lokasi
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-4 w-4 mr-2" />
                          {reportPreview?.location}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="xl:col-span-3">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl flex items-center gap-3">
                          <Camera className="h-6 w-6 text-green-600" />
                          Dokumentasi Foto
                        </CardTitle>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">
                            {currentGridPage + 1}/{totalPages || 1}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGridNavigation("prev")}
                              disabled={currentGridPage === 0}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGridNavigation("next")}
                              disabled={currentGridPage >= totalPages - 1}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="isolate grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {getCurrentPageItems().map((category) => {
                          const serialNumber = reportPreview
                            ? getSerialNumberForCategory(
                                category,
                                reportPreview.serialNumbers
                              )
                            : undefined;

                          return (
                            <div
                              key={category.id}
                              className="relative border rounded-lg overflow-hidden bg-white shadow-sm"
                            >
                              <div className="relative h-32 bg-gray-100 overflow-hidden">
                                {category.photos.length > 0 ? (
                                  <>
                                    <div
                                      className="absolute inset-0 cursor-pointer hover-zone"
                                      onMouseEnter={() =>
                                        handleImageHoverEnter(category.id)
                                      }
                                      onMouseLeave={handleImageHoverLeave}
                                      onClick={() =>
                                        handleImageClick(category.id)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleImageClick(category.id);
                                        }
                                      }}
                                      tabIndex={0}
                                      role="button"
                                      aria-label={`View ${category.name} photos`}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={
                                          category.photos[
                                            category.currentIndex
                                          ] || "/placeholder.svg"
                                        }
                                        alt={`${category.name} ${
                                          category.currentIndex + 1
                                        }`}
                                        className="w-full h-full object-cover transition-opacity hover:opacity-90"
                                      />
                                    </div>

                                    {category.photos.length > 1 && (
                                      <>
                                        <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center z-10">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) =>
                                              handleArrowClick(
                                                e,
                                                category.id,
                                                "prev"
                                              )
                                            }
                                            onMouseEnter={(e) =>
                                              e.stopPropagation()
                                            }
                                            onMouseLeave={(e) =>
                                              e.stopPropagation()
                                            }
                                            className="h-7 w-7 p-0 bg-black/30 hover:bg-black/50 text-white rounded-full pointer-events-auto"
                                            tabIndex={0}
                                            aria-label={`Previous ${category.name} photo`}
                                          >
                                            <ChevronLeft className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center z-10">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) =>
                                              handleArrowClick(
                                                e,
                                                category.id,
                                                "next"
                                              )
                                            }
                                            onMouseEnter={(e) =>
                                              e.stopPropagation()
                                            }
                                            onMouseLeave={(e) =>
                                              e.stopPropagation()
                                            }
                                            className="h-7 w-7 p-0 bg-black/30 hover:bg-black/50 text-white rounded-full pointer-events-auto"
                                            tabIndex={0}
                                            aria-label={`Next ${category.name} photo`}
                                          >
                                            <ChevronRight className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </>
                                    )}

                                    {category.photos.length > 1 && (
                                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none z-5">
                                        {category.currentIndex + 1}/
                                        {category.photos.length}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                    Tidak ada foto
                                  </div>
                                )}
                              </div>

                              <div className="p-2 min-h-[2.5rem] flex items-center justify-between border-t">
                                <p className="text-[10px] font-medium text-gray-700 leading-tight flex-1">
                                  {category.name}
                                </p>
                                {serialNumber ? (
                                  <div className="ml-2 flex items-center">
                                    <span
                                      className="text-[9px] text-gray-500 font-mono bg-gray-100 px-1 py-0.5 rounded cursor-help"
                                      title={`Serial Number: ${serialNumber}`}
                                    >
                                      SN:{" "}
                                      {truncateSerialNumber(serialNumber, 8)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="ml-2 flex items-center">
                                    <span className="text-[9px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded">
                                      SN: -
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="sticky bottom-0 z-30 bg-white border-t p-4 shadow-lg">
                <div className="max-w-7xl mx-auto">
                  <Button
                    onClick={handleDownloadReport}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-3"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Finalisasi & Download Laporan PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Hover Overlay */}
      {hoverOverlay.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center"
          onClick={hideHoverOverlay}
        >
          <div className="relative max-w-4xl max-h-[80vh] p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={hideHoverOverlay}
              className="absolute top-2 right-2 z-10 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="relative bg-white rounded-lg overflow-hidden shadow-2xl">
              {hoverOverlay.isLoading ? (
                <div className="flex items-center justify-center w-96 h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : hoverOverlay.hasError ? (
                <div className="flex flex-col items-center justify-center w-96 h-64 text-gray-600">
                  <p className="mb-4">Gagal memuat gambar</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setHoverOverlay((prev) => ({
                        ...prev,
                        isLoading: true,
                        hasError: false,
                      }));
                      setTimeout(
                        () =>
                          setHoverOverlay((prev) => ({
                            ...prev,
                            isLoading: false,
                          })),
                        200
                      );
                    }}
                  >
                    Coba Lagi
                  </Button>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getCurrentOverlayPhoto() || "/placeholder.svg"}
                    alt={`${getCurrentOverlayCategory()?.name} ${
                      hoverOverlay.photoIndex + 1
                    }`}
                    className="max-w-full max-h-[70vh] object-contain"
                    onError={() =>
                      setHoverOverlay((prev) => ({
                        ...prev,
                        hasError: true,
                        isLoading: false,
                      }))
                    }
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <p className="text-white text-sm font-medium">
                      {getCurrentOverlayCategory()?.name} —{" "}
                      {hoverOverlay.photoIndex + 1}/
                      {getCurrentOverlayCategory()?.photos.length || 0}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
