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

type StatusType = "Di_Kantor" | "ditugaskan" | "selesai";

interface Technician {
  id: string;
  code: string | null;
  name: string;
  initial: string;
  email: string;
  phone: string;
  joinDate: string;
  status: StatusType;
}

interface Job {
  id: string;
  assignmentId: string;
  jobName: string;
  location: string;
  assignmentDate: string;
  technicianId: string;
  technicianName: string;
  status: StatusType;
  template: string;
  notes: string;
}

const TECH_PLACEHOLDER = "Cari teknisi...";
const JOB_PLACEHOLDER = "Cari pekerjaan...";

// helper aman untuk lower-case dan tampilan teks
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

type TechForm = {
  id?: string;
  code: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  is_active: "true" | "false";
};

/** ---------- WRAPPER: hanya pegang gate mounted ---------- */
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
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  // search/filter/pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusType>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [jobCurrentPage, setJobCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // edit job
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false);

  // add/edit technician
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [techModalMode, setTechModalMode] = useState<"create" | "edit">(
    "create"
  );
  const [techForm, setTechForm] = useState<TechForm>({
    code: "",
    name: "",
    initials: "",
    email: "",
    phone: "",
    is_active: "true",
  });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [techRes, jobRes] = await Promise.all([
          apiFetch("/api/technicians"),
          apiFetch("/api/jobs"),
        ]);
        setTechnicians(techRes.data ?? []);
        setJobs(jobRes.data ?? []);
      } catch (e) {
        console.error(e);
        alert("Gagal memuat data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function reloadTechnicians() {
    const res = await apiFetch("/api/technicians");
    if (res.error) throw new Error(res.error);
    setTechnicians(res.data ?? []);
  }

  async function reloadJobs() {
    const res = await apiFetch("/api/jobs");
    if (res.error) throw new Error(res.error);
    setJobs(res.data ?? []);
  }

  async function deleteTechnician(
    technicianId: string,
    technicianName: string
  ) {
    if (
      !confirm(
        `Apakah Anda yakin ingin menghapus teknisi ${technicianName}? Tindakan ini tidak dapat dibatalkan.`
      )
    ) {
      return;
    }
    try {
      setLoading(true);
      const response = await apiFetch(`/api/technicians?id=${technicianId}`, {
        method: "DELETE",
      });
      if (response.error) throw new Error(response.error);
      await reloadTechnicians();
      alert(`Teknisi ${technicianName} berhasil dihapus`);
    } catch (error: any) {
      console.error("Error deleting technician:", error);
      alert(`Gagal menghapus teknisi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ====== Tambah/Edit Teknisi ======
  function openCreateTech() {
    setTechModalMode("create");
    setTechForm({
      code: "",
      name: "",
      initials: "",
      email: "",
      phone: "",
      is_active: "true",
    });
    setIsTechModalOpen(true);
  }

  function openEditTech(t: Technician) {
    setTechModalMode("edit");
    setTechForm({
      id: t.id,
      code: t.code ?? "",
      name: t.name,
      initials: t.initial ?? "",
      email: t.email ?? "",
      phone: t.phone ?? "",
      is_active: "true", // jika ingin real is_active, expose di GET
    });
    setIsTechModalOpen(true);
  }

  function validateTechForm() {
    if (!techForm.name.trim()) {
      alert("Nama teknisi wajib diisi.");
      return false;
    }
    if (techForm.initials && techForm.initials.length > 4) {
      alert("Initials maksimal 4 karakter.");
      return false;
    }
    return true;
  }

  async function submitTech() {
    if (!validateTechForm()) return;
    try {
      setLoading(true);
      const payload = {
        code: techForm.code || null,
        name: techForm.name.trim(),
        initials: techForm.initials
          ? techForm.initials.toUpperCase().slice(0, 4)
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
        await reloadTechnicians();
        alert("Teknisi berhasil ditambahkan.");
      } else {
        const id = techForm.id as string;
        const res = await apiFetch(`/api/technicians/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.error) throw new Error(res.error);
        await reloadTechnicians();
        alert("Teknisi berhasil diperbarui.");
      }

      setIsTechModalOpen(false);
    } catch (e: any) {
      alert(e.message || "Terjadi kesalahan saat menyimpan teknisi");
    } finally {
      setLoading(false);
    }
  }

  // ====== Edit/Hapus Job ======
  const handleEditJob = (job: Job) => {
    setEditingJob({ ...job });
    setIsEditJobModalOpen(true);
  };

  async function handleSaveJob() {
    if (!editingJob) return;
    try {
      setLoading(true);
      const payload = {
        location: editingJob.location,
        assignmentDate: editingJob.assignmentDate,
        template: editingJob.template,
        notes: editingJob.notes,
      };
      const res = await apiFetch(`/api/jobs/${editingJob.assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.error) throw new Error(res.error);
      await reloadJobs();
      alert("Perubahan job berhasil disimpan!");
      setIsEditJobModalOpen(false);
      setEditingJob(null);
    } catch (e: any) {
      alert(`Gagal menyimpan perubahan: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  async function handleDeleteJob(assignmentId: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus job ini?")) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/jobs?id=${assignmentId}`, {
        method: "DELETE",
      });
      if (res.error) throw new Error(res.error);
      await reloadJobs();
      alert(`Job dengan Assignment ID: ${assignmentId} telah dihapus`);
    } catch (e: any) {
      alert(`Gagal menghapus job: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ====== Filter & Pagination ======
  const filteredTechnicians = technicians.filter((tech) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      lo(tech.name).includes(q) ||
      lo(tech.email).includes(q) ||
      (tech.phone ?? "").includes(searchTerm);
    const matchesStatus =
      statusFilter === "all" || tech.status === statusFilter;
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

  // Technicians pagination
  const itemsStart = (currentPage - 1) * itemsPerPage;
  const totalPages = Math.ceil(filteredTechnicians.length / itemsPerPage) || 1;
  const paginatedTechnicians = filteredTechnicians.slice(
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
                            Nama Teknisi
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
                        {paginatedTechnicians.length === 0 ? (
                          <tr>
                            <td
                              className="py-6 px-4 text-center text-gray-500"
                              colSpan={5}
                            >
                              Tidak ada data teknisi.
                            </td>
                          </tr>
                        ) : (
                          paginatedTechnicians.map((tech) => (
                            <tr
                              key={tech.id}
                              className="border-b border-gray-100 hover:bg-gray-50"
                            >
                              <td className="py-4 px-4">
                                <div className="font-medium text-gray-900 text-lg">
                                  {tech.name}
                                </div>
                                <div className="text-sm text-gray-500">
                                  Bergabung: {tech.joinDate}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-gray-700 text-lg">
                                {tech.email}
                              </td>
                              <td className="py-4 px-4 text-gray-700 text-lg">
                                {tech.phone}
                              </td>
                              <td className="py-4 px-4">
                                {getStatusBadge(tech.status)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openEditTech(tech)}
                                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    disabled={loading}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      deleteTechnician(tech.id, tech.name)
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

                  {filteredTechnicians.length > 0 && totalPages > 1 && (
                    <div className="flex items-center justify-between mt-6">
                      <div className="text-lg text-gray-700">
                        Menampilkan {itemsStart + 1}-
                        {Math.min(
                          itemsStart + itemsPerPage,
                          filteredTechnicians.length
                        )}{" "}
                        dari {filteredTechnicians.length} teknisi
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

            {/* Tab 2: Jobs */}
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
                            ID Pekerjaan
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Nama Pekerjaan
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Lokasi
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Tanggal Penugasan
                          </th>
                          <th className="text-left py-4 px-4 font-semibold text-gray-700 text-lg">
                            Status Pekerjaan
                          </th>
                          <th className="text-center py-4 px-4 font-semibold text-gray-700 text-lg">
                            Aksi
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredJobs.length === 0 ? (
                          <tr>
                            <td
                              className="py-6 px-4 text-center text-gray-500"
                              colSpan={6}
                            >
                              Tidak ada data pekerjaan.
                            </td>
                          </tr>
                        ) : (
                          filteredJobs
                            .slice(jobItemsStart, jobItemsStart + itemsPerPage)
                            .map((job) => (
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
                                <td className="py-4 px-4 text-gray-700 text-lg">
                                  {text(job.assignmentDate)}
                                </td>
                                <td className="py-4 px-4">
                                  {getStatusBadge(
                                    (job.status || "ditugaskan") as StatusType
                                  )}
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
                {/* Hilangkan warning shadcn dengan deskripsi tersembunyi */}
                <DialogDescription className="sr-only">
                  Formulir untuk menambah atau mengedit teknisi.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="code" className="text-lg font-medium">
                      Kode (opsional)
                    </Label>
                    <Input
                      id="code"
                      value={techForm.code}
                      onChange={(e) =>
                        setTechForm((s) => ({ ...s, code: e.target.value }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="e.g. T-001"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Harus unik bila diisi.
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="initials" className="text-lg font-medium">
                      Initials
                    </Label>
                    <Input
                      id="initials"
                      value={techForm.initials}
                      onChange={(e) =>
                        setTechForm((s) => ({ ...s, initials: e.target.value }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="Max 4 huruf"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="name" className="text-lg font-medium">
                      Nama*
                    </Label>
                    <Input
                      id="name"
                      value={techForm.name}
                      onChange={(e) =>
                        setTechForm((s) => ({ ...s, name: e.target.value }))
                      }
                      className="mt-2 text-lg py-3"
                      placeholder="Nama teknisi"
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

          {/* Modal: Edit Job */}
          <Dialog
            open={isEditJobModalOpen}
            onOpenChange={setIsEditJobModalOpen}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-2xl">Edit Job Teknisi</DialogTitle>
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
                    <p className="text-sm text-gray-500 mt-1">
                      Field ini tidak dapat diedit
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="location" className="text-lg font-medium">
                      Lokasi
                    </Label>
                    <Input
                      id="location"
                      value={editingJob.location}
                      onChange={(e) =>
                        setEditingJob({
                          ...editingJob,
                          location: e.target.value,
                        })
                      }
                      className="mt-2 text-lg py-3"
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor="assignmentDate"
                      className="text-lg font-medium"
                    >
                      Tanggal Penugasan
                    </Label>
                    <Input
                      id="assignmentDate"
                      type="date"
                      value={editingJob.assignmentDate}
                      onChange={(e) =>
                        setEditingJob({
                          ...editingJob,
                          assignmentDate: e.target.value,
                        })
                      }
                      className="mt-2 text-lg py-3"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template" className="text-lg font-medium">
                      Template Laporan
                    </Label>
                    <Select
                      value={editingJob.template}
                      onValueChange={(value) =>
                        setEditingJob({ ...editingJob, template: value })
                      }
                    >
                      <SelectTrigger className="mt-2 text-lg py-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Template A">Template A</SelectItem>
                        <SelectItem value="Template B">Template B</SelectItem>
                        <SelectItem value="Template C">Template C</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="notes" className="text-lg font-medium">
                      Catatan Tambahan
                    </Label>
                    <Textarea
                      id="notes"
                      value={editingJob.notes}
                      onChange={(e) =>
                        setEditingJob({ ...editingJob, notes: e.target.value })
                      }
                      className="mt-2 text-lg"
                      rows={4}
                    />
                  </div>
                  <div className="flex gap-4 pt-4">
                    <Button
                      onClick={handleSaveJob}
                      className="bg-blue-600 hover:bg-blue-700 text-lg px-6 py-3"
                      disabled={loading}
                    >
                      Simpan Perubahan
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditJobModalOpen(false)}
                      className="text-lg px-6 py-3"
                      disabled={loading}
                    >
                      Batal
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
