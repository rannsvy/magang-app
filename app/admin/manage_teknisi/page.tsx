// app/admin/manage_teknisi/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminHeader } from "@/components/admin-header";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

/* ================== Tipe & util ================== */
type StatusType = "Di_Kantor" | "ditugaskan" | "selesai";

type Teknisi = {
  id: string;
  nama_panggilan: string;
  nama_lengkap: string;
  inisial: string;
  email: string;
  phone: string;
  tanggal_gabung: string;
  status: StatusType;
  is_active?: boolean;
};

type Job = {
  id: string; // project id
  assignmentId: string; // gunakan id project (placeholder)
  jobName: string; // projects.name
  location: string;
  assignmentDate: string; // (tidak ada di API → kosong)
  technicianName: string; // gabungan assignedTechnicians
  status: StatusType;
  template: string; // (placeholder)
  notes: string; // (placeholder)
};

const TECH_PLACEHOLDER = "Cari teknisi...";
const JOB_PLACEHOLDER = "Cari pekerjaan...";

const lo = (v: unknown) => (v ?? "").toString().toLowerCase();
const text = (v: unknown, fallback = "—") =>
  v == null || String(v).trim() === "" ? fallback : String(v);

const getStatusBadge = (status: StatusType) => {
  switch (status) {
    case "Di_Kantor":
      return (
        <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
          Di Kantor
        </Badge>
      );
    case "ditugaskan":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
          Ditugaskan
        </Badge>
      );
    case "selesai":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          Selesai
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
          Unknown
        </Badge>
      );
  }
};

/* ================== Form Teknisi ================== */
type FormTeknisi = {
  id?: string;
  nama_panggilan: string;
  nama_lengkap: string;
  inisial: string; // max 2
  email: string;
  phone: string;
  is_active: "true" | "false";
};

/** ---------- wrapper mounted gate ---------- */
export default function ManageTechnicians() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminHeader
          title="Kelola Teknisi"
          showBackButton={true}
          backUrl="/admin/dashboard"
        />
        <main className="p-8">
          <div className="max-w-7xl mx-auto text-sm text-muted-foreground">
            Memuat…
          </div>
        </main>
      </div>
    );
  }
  return <ManageTechniciansBody />;
}

/** ---------- BODY ---------- */
function ManageTechniciansBody() {
  const [teknisi, setTeknisi] = useState<Teknisi[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  // search/filter/pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusType>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [jobCurrentPage, setJobCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // edit job (read-only sumbernya, tapi UI tetap ada)
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false);

  // add/edit teknisi
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [techModalMode, setTechModalMode] = useState<"create" | "edit">(
    "create"
  );
  const [techForm, setTechForm] = useState<FormTeknisi>({
    nama_panggilan: "",
    nama_lengkap: "",
    inisial: "",
    email: "",
    phone: "",
    is_active: "true",
  });

  /* --------- loaders ---------- */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // 1) Teknisi
        const techRes = await apiFetch("/api/technicians", {
          cache: "no-store",
        });
        const list = Array.isArray(techRes?.data) ? techRes.data : [];
        const mapped: Teknisi[] = list.map(
          (t: any): Teknisi => ({
            id: String(t.id),
            nama_panggilan:
              t.nama_panggilan ??
              t.name ??
              t.nama ??
              t.nama_lengkap ??
              "Teknisi",
            nama_lengkap:
              t.nama_lengkap ??
              t.name ??
              t.nama ??
              t.nama_panggilan ??
              "Teknisi",
            inisial: String(t.inisial ?? t.initial ?? t.initials ?? "?")
              .toUpperCase()
              .slice(0, 2),
            email: t.email ?? "",
            phone: t.phone ?? "",
            tanggal_gabung:
              t.join_date ??
              t.joinDate ??
              (t.created_at ? String(t.created_at).slice(0, 10) : ""),
            status: (t.status_sekarang ??
              t.current_status ??
              t.status ??
              "Di_Kantor") as StatusType,
            is_active: t.is_active ?? true,
          })
        );
        setTeknisi(mapped);

        // 2) Jobs (pakai /api/technicians/jobs)
        const jobsRes = await apiFetch("/api/technicians/jobs?debug=1", {
          cache: "no-store",
        });
        const items = Array.isArray(jobsRes?.items)
          ? jobsRes.items
          : Array.isArray(jobsRes?.data)
          ? jobsRes.data
          : [];
        const jobMapped: Job[] = items.map((p: any): Job => {
          // map status UI ke StatusType
          const s: StatusType =
            p.status === "completed"
              ? "selesai"
              : p.status === "in-progress"
              ? "ditugaskan"
              : "Di_Kantor";
          const crew =
            Array.isArray(p.assignedTechnicians) && p.assignedTechnicians.length
              ? p.assignedTechnicians
                  .map((a: any) =>
                    a?.name
                      ? String(a.name)
                      : a?.isLeader
                      ? "Leader"
                      : "Teknisi"
                  )
                  .join(", ")
              : "";
          return {
            id: String(p.id ?? p.project_id ?? ""),
            assignmentId: String(p.id ?? p.project_id ?? ""),
            jobName: String(p.name ?? "Project"),
            location: p.lokasi ?? "",
            assignmentDate: "", // tidak tersedia di API ini
            technicianName: crew,
            status: s,
            template: "",
            notes: "",
          };
        });
        setJobs(jobMapped);
      } catch (e) {
        console.error(e);
        alert("Gagal memuat data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function reloadTeknisi() {
    const res = await apiFetch("/api/technicians", { cache: "no-store" });
    if (res.error) throw new Error(res.error);
    const list = Array.isArray(res?.data) ? res.data : [];
    const mapped: Teknisi[] = list.map((t: any) => ({
      id: String(t.id),
      nama_panggilan:
        t.nama_panggilan ?? t.name ?? t.nama ?? t.nama_lengkap ?? "Teknisi",
      nama_lengkap:
        t.nama_lengkap ?? t.name ?? t.nama ?? t.nama_panggilan ?? "Teknisi",
      inisial: String(t.inisial ?? t.initial ?? t.initials ?? "?")
        .toUpperCase()
        .slice(0, 2),
      email: t.email ?? "",
      phone: t.phone ?? "",
      tanggal_gabung:
        t.join_date ??
        t.joinDate ??
        (t.created_at ? String(t.created_at).slice(0, 10) : ""),
      status: (t.status_sekarang ??
        t.current_status ??
        t.status ??
        "Di_Kantor") as StatusType,
      is_active: t.is_active ?? true,
    }));
    setTeknisi(mapped);
  }

  async function reloadJobs() {
    const res = await apiFetch("/api/technicians/jobs?debug=1", {
      cache: "no-store",
    });
    if (res.error) throw new Error(res.error);
    const items = Array.isArray(res?.items)
      ? res.items
      : Array.isArray(res?.data)
      ? res.data
      : [];
    const jobMapped: Job[] = items.map((p: any): Job => {
      const s: StatusType =
        p.status === "completed"
          ? "selesai"
          : p.status === "in-progress"
          ? "ditugaskan"
          : "Di_Kantor";
      const crew =
        Array.isArray(p.assignedTechnicians) && p.assignedTechnicians.length
          ? p.assignedTechnicians
              .map((a: any) => (a?.name ? String(a.name) : "Teknisi"))
              .join(", ")
          : "";
      return {
        id: String(p.id ?? p.project_id ?? ""),
        assignmentId: String(p.id ?? p.project_id ?? ""),
        jobName: String(p.name ?? "Project"),
        location: p.lokasi ?? "",
        assignmentDate: "",
        technicianName: crew,
        status: s,
        template: "",
        notes: "",
      };
    });
    setJobs(jobMapped);
  }

  async function deleteTeknisi(teknisiId: string, displayName: string) {
    if (
      !confirm(
        `Apakah Anda yakin ingin menghapus teknisi ${displayName}? Tindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return;
    }
    try {
      setLoading(true);
      const response = await apiFetch(`/api/technicians?id=${teknisiId}`, {
        method: "DELETE",
      });
      if (response.error) throw new Error(response.error);
      await reloadTeknisi();
      alert(`Teknisi ${displayName} berhasil dihapus`);
    } catch (error: any) {
      console.error("Error deleting technician:", error);
      alert(`Gagal menghapus teknisi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  /* ====== Tambah/Edit Teknisi ====== */
  function openCreateTech() {
    setTechModalMode("create");
    setTechForm({
      nama_panggilan: "",
      nama_lengkap: "",
      inisial: "",
      email: "",
      phone: "",
      is_active: "true",
    });
    setIsTechModalOpen(true);
  }

  function openEditTech(t: Teknisi) {
    setTechModalMode("edit");
    setTechForm({
      id: t.id,
      nama_panggilan: t.nama_panggilan,
      nama_lengkap: t.nama_lengkap,
      inisial: t.inisial,
      email: t.email ?? "",
      phone: t.phone ?? "",
      is_active: t.is_active ?? true ? "true" : "false",
    });
    setIsTechModalOpen(true);
  }

  function validateTechForm() {
    if (!techForm.nama_lengkap.trim() && !techForm.nama_panggilan.trim()) {
      alert("Minimal isi salah satu: Nama Lengkap atau Nama Panggilan.");
      return false;
    }
    if (techForm.inisial && techForm.inisial.length > 2) {
      alert("Inisial maksimal 2 huruf.");
      return false;
    }
    return true;
  }

  async function submitTech() {
    if (!validateTechForm()) return;
    try {
      setLoading(true);
      const payload = {
        nama_panggilan: techForm.nama_panggilan.trim() || null,
        nama_lengkap: techForm.nama_lengkap.trim() || null,
        inisial: techForm.inisial
          ? techForm.inisial.toUpperCase().slice(0, 2)
          : null,
        email: techForm.email || null,
        phone: techForm.phone || null,
        is_active: techForm.is_active === "true",
      };

      if (techModalMode === "create") {
        const res = await apiFetch("/api/technicians", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.error) throw new Error(res.error);
        await reloadTeknisi();
        alert("Teknisi berhasil ditambahkan.");
      } else {
        const id = techForm.id as string;
        const res = await apiFetch(`/api/technicians/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.error) throw new Error(res.error);
        await reloadTeknisi();
        alert("Teknisi berhasil diperbarui.");
      }

      setIsTechModalOpen(false);
    } catch (e: any) {
      alert(e.message || "Terjadi kesalahan saat menyimpan teknisi");
    } finally {
      setLoading(false);
    }
  }

  /* ====== Edit/Hapus Job (saat ini read-only; endpoint khusus belum ada) ====== */
  const handleEditJob = (job: Job) => {
    setEditingJob({ ...job });
    setIsEditJobModalOpen(true);
  };

  async function handleSaveJob() {
    // Placeholder: belum ada /api/jobs PATCH di backend baru
    alert("Edit Job belum tersedia pada skema/endpoint saat ini.");
    setIsEditJobModalOpen(false);
    setEditingJob(null);
  }

  async function handleDeleteJob(assignmentId: string) {
    // Placeholder: belum ada /api/jobs DELETE di backend baru
    alert("Hapus Job belum tersedia pada skema/endpoint saat ini.");
  }

  /* ====== Filter & Pagination ====== */
  const filteredTeknisi = teknisi.filter((t) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      lo(t.nama_lengkap).includes(q) ||
      lo(t.nama_panggilan).includes(q) ||
      lo(t.email).includes(q) ||
      (t.phone ?? "").includes(searchTerm);
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredJobs = jobs.filter((job) => {
    const q = searchTerm.toLowerCase();
    return (
      lo(job.jobName).includes(q) ||
      lo(job.technicianName).includes(q) ||
      lo(job.location).includes(q)
    );
  });

  // Teknisi pagination
  const itemsStart = (currentPage - 1) * itemsPerPage;
  const totalPages = Math.ceil(filteredTeknisi.length / itemsPerPage) || 1;
  const paginatedTeknisi = filteredTeknisi.slice(
    itemsStart,
    itemsStart + itemsPerPage
  );

  // Jobs pagination
  const jobItemsStart = (jobCurrentPage - 1) * itemsPerPage;
  const jobTotalPages = Math.ceil(filteredJobs.length / itemsPerPage) || 1;
  const paginatedJobs = filteredJobs.slice(
    jobItemsStart,
    jobItemsStart + itemsPerPage
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        title="Kelola Teknisi"
        showBackButton={true}
        backUrl="/admin/dashboard"
      />

      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="technicians" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8">
              <TabsTrigger value="technicians" className="text-lg py-3">
                Data Teknisi
              </TabsTrigger>
              <TabsTrigger value="jobs" className="text-lg py-3">
                Daftar Pekerjaan Teknisi
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Data Teknisi */}
            <TabsContent value="technicians">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-1">
                  <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      placeholder={TECH_PLACEHOLDER}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 text-lg py-3"
                    />
                  </div>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) =>
                      setStatusFilter(v as "all" | StatusType)
                    }
                  >
                    <SelectTrigger className="w-48 text-lg py-3">
                      <SelectValue placeholder="Filter Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Status</SelectItem>
                      <SelectItem value="Di_Kantor">Di Kantor</SelectItem>
                      <SelectItem value="ditugaskan">Ditugaskan</SelectItem>
                      <SelectItem value="selesai">Selesai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={openCreateTech}
                  className="bg-blue-600 hover:bg-blue-700 text-lg px-6 py-3"
                  disabled={loading}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  <span>Tambah Teknisi</span>
                </Button>
              </div>

              <Card aria-busy={loading}>
                <CardHeader>
                  <CardTitle className="text-2xl">Daftar Teknisi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Nama
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Email
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Nomor Telepon
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Status Keaktifan
                          </th>
                          <th className="text-center py-4 px-4 font-semibold text-gray-700 text-lg">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedTeknisi.length === 0 ? (
                          <tr>
                            <td
                              className="py-6 px-4 text-center text-gray-500"
                              colSpan={5}
                            >
                              Tidak ada data teknisi.
                            </td>
                          </tr>
                        ) : (
                          paginatedTeknisi.map((t) => (
                            <tr
                              key={t.id}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-4 px-4">
                                <div className="font-medium text-gray-900 text-lg">
                                  {t.nama_panggilan || t.nama_lengkap}
                                  {t.inisial ? (
                                    <span className="ml-2 text-gray-500">
                                      ({t.inisial})
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Nama Lengkap: {t.nama_lengkap || "—"}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Bergabung: {t.tanggal_gabung || "—"}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-gray-700 text-lg">
                                {t.email}
                              </td>
                              <td className="py-4 px-4 text-gray-700 text-lg">
                                {t.phone}
                              </td>
                              <td className="py-4 px-4">
                                {getStatusBadge(t.status)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditTech(t)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    disabled={loading}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      deleteTeknisi(
                                        t.id,
                                        t.nama_panggilan || t.nama_lengkap
                                      )
                                    }
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    disabled={loading}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredTeknisi.length > 0 && totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-lg text-gray-700">
                        Menampilkan {itemsStart + 1}-
                        {Math.min(
                          itemsStart + itemsPerPage,
                          filteredTeknisi.length
                        )}{" "}
                        dari {filteredTeknisi.length} teknisi
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setCurrentPage((p) => Math.max(p - 1, 1))
                          }
                          disabled={currentPage === 1 || loading}
                          className="text-lg px-4 py-2"
                        >
                          <ChevronLeft className="h-5 w-5 mr-1" /> Sebelumnya
                        </Button>
                        <span className="text-lg font-medium px-4">
                          {currentPage} / {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setCurrentPage((p) => Math.min(p + 1, totalPages))
                          }
                          disabled={currentPage === totalPages || loading}
                          className="text-lg px-4 py-2"
                        >
                          Selanjutnya <ChevronRight className="h-5 w-5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 2: Jobs (read-only dari /api/technicians/jobs) */}
            <TabsContent value="jobs">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <Input
                    placeholder={JOB_PLACEHOLDER}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 text-lg py-3"
                  />
                </div>
              </div>

              <Card aria-busy={loading}>
                <CardHeader>
                  <CardTitle className="text-2xl">
                    Daftar Pekerjaan Teknisi
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            ID Proyek
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Nama Pekerjaan
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Lokasi
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Status
                          </th>
                          <th className="text-center py-4 px-4 font-semibold text-gray-700 text-lg">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedJobs.length === 0 ? (
                          <tr>
                            <td
                              className="py-6 px-4 text-center text-gray-500"
                              colSpan={5}
                            >
                              Tidak ada data pekerjaan.
                            </td>
                          </tr>
                        ) : (
                          paginatedJobs.map((job) => (
                            <tr
                              key={job.assignmentId || job.id}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-4 px-4 font-medium text-gray-900 text-lg">
                                {text(job.id)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="font-medium text-gray-900 text-lg">
                                  {text(job.jobName)}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Teknisi: {text(job.technicianName)}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-gray-700 text-lg">
                                {text(job.location)}
                              </td>
                              <td className="py-4 px-4">
                                {getStatusBadge(job.status)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditJob(job)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    disabled={loading}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteJob(
                                        job.assignmentId || job.id
                                      )
                                    }
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    disabled={loading}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredJobs.length > 0 && jobTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-lg text-gray-700">
                        Menampilkan {jobItemsStart + 1}-
                        {Math.min(
                          jobItemsStart + itemsPerPage,
                          filteredJobs.length
                        )}{" "}
                        dari {filteredJobs.length} pekerjaan
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setJobCurrentPage((p) => Math.max(p - 1, 1))
                          }
                          disabled={jobCurrentPage === 1 || loading}
                          className="text-lg px-4 py-2"
                        >
                          <ChevronLeft className="h-5 w-5 mr-1" /> Sebelumnya
                        </Button>
                        <span className="text-lg font-medium px-4">
                          {jobCurrentPage} / {jobTotalPages}
                        </span>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setJobCurrentPage((p) =>
                              Math.min(p + 1, jobTotalPages)
                            )
                          }
                          disabled={jobCurrentPage === jobTotalPages || loading}
                          className="text-lg px-4 py-2"
                        >
                          Selanjutnya <ChevronRight className="h-5 w-5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Modal: Tambah/Edit Teknisi */}
          <Dialog open={isTechModalOpen} onOpenChange={setIsTechModalOpen}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  {techModalMode === "create"
                    ? "Tambah Teknisi"
                    : "Edit Teknisi"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Formulir untuk menambah atau mengedit teknisi.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="inisial" className="text-lg font-medium">
                      Inisial (maks 2)
                    </Label>
                    <Input
                      id="inisial"
                      value={techForm.inisial}
                      onChange={(e) =>
                        setTechForm((s) => ({
                          ...s,
                          inisial: e.target.value.toUpperCase().slice(0, 2),
                        }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="CTH: AB"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="nama_panggilan"
                      className="text-lg font-medium"
                    >
                      Nama Panggilan
                    </Label>
                    <Input
                      id="nama_panggilan"
                      value={techForm.nama_panggilan}
                      onChange={(e) =>
                        setTechForm((s) => ({
                          ...s,
                          nama_panggilan: e.target.value,
                        }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="Mis. Dika"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label
                      htmlFor="nama_lengkap"
                      className="text-lg font-medium"
                    >
                      Nama Lengkap*
                    </Label>
                    <Input
                      id="nama_lengkap"
                      value={techForm.nama_lengkap}
                      onChange={(e) =>
                        setTechForm((s) => ({
                          ...s,
                          nama_lengkap: e.target.value,
                        }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="Nama lengkap teknisi"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-lg font-medium">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={techForm.email}
                      onChange={(e) =>
                        setTechForm((s) => ({ ...s, email: e.target.value }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="nama@contoh.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-lg font-medium">
                      Nomor Telepon
                    </Label>
                    <Input
                      id="phone"
                      value={techForm.phone}
                      onChange={(e) =>
                        setTechForm((s) => ({ ...s, phone: e.target.value }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div>
                    <Label className="text-lg font-medium">Status Akun</Label>
                    <Select
                      value={techForm.is_active}
                      onValueChange={(v) =>
                        setTechForm((s) => ({
                          ...s,
                          is_active: v as "true" | "false",
                        }))
                      }
                    >
                      <SelectTrigger className="mt-2 text-lg py-3">
                        <SelectValue placeholder="Pilih status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Aktif</SelectItem>
                        <SelectItem value="false">Nonaktif</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <Button
                    onClick={submitTech}
                    className="bg-blue-600 hover:bg-blue-700 text-lg px-6 py-3"
                    disabled={loading}
                  >
                    {techModalMode === "create" ? "Tambah" : "Simpan Perubahan"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsTechModalOpen(false)}
                    className="text-lg px-6 py-3"
                    disabled={loading}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Modal: Edit Job (read-only) */}
          <Dialog
            open={isEditJobModalOpen}
            onOpenChange={setIsEditJobModalOpen}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl">
                  Detail Job Teknisi
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Formulir pengeditan data pekerjaan teknisi.
                </DialogDescription>
              </DialogHeader>
              {editingJob && (
                <div className="space-y-6">
                  <div>
                    <Label htmlFor="jobName" className="text-lg font-medium">
                      Nama Pekerjaan
                    </Label>
                    <Input
                      id="jobName"
                      value={editingJob.jobName}
                      disabled
                      className="mt-2 text-lg py-3 bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="location" className="text-lg font-medium">
                      Lokasi
                    </Label>
                    <Input
                      id="location"
                      value={editingJob.location}
                      disabled
                      className="mt-2 text-lg py-3 bg-gray-50"
                    />
                  </div>
                  <div>
                    <Label className="text-lg font-medium">Teknisi</Label>
                    <Input
                      value={editingJob.technicianName}
                      disabled
                      className="mt-2 text-lg py-3 bg-gray-50"
                    />
                  </div>
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                    Edit/Hapus Job belum tersedia pada skema API saat ini.
                  </div>
                  <div className="flex gap-4 pt-4">
                    <Button
                      onClick={handleSaveJob}
                      className="bg-blue-600 hover:bg-blue-700 text-lg px-6 py-3"
                      disabled
                    >
                      Simpan Perubahan
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditJobModalOpen(false)}
                      className="text-lg px-6 py-3"
                    >
                      Tutup
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </main>
    </div>
  );
}
