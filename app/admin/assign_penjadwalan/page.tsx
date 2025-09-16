"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminHeader } from "@/components/admin-header";
import Toolbar from "@/components/assign/Toolbar";
import ProjectTable from "@/components/assign/ProjectTable";
import ProjectShortcutPopup from "@/components/assign/ProjectShortcutPopup";
import EditProjectDialog from "@/components/assign/EditProjectDialog";
import CreateProjectDialog from "@/components/assign/CreateProjectDialog";
import AssignmentSummary from "@/components/assign/AssignmentSummary";

import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

import { createClient } from "@supabase/supabase-js";
import { apiFetch } from "@/lib/apiFetch";

import {
  CellAssignment,
  EditProjectForm,
  ProjectCategory,
  ProjectStatus,
  UITechnician,
  UIProject,
} from "@/components/assign/types";

import {
  addDaysToIso,
  formatDateDDMMYYYY,
  msToNextMidnight,
  safeUUID,
  time5,
  unwrap,
  getManDaysDisplay,
  getManDaysStatus,
  getProgressStatus,
  getProjectStatusDisplay,
} from "@/components/assign/helpers";

import {
  buildStyledExcelBlob,
  dataUrlToFile,
  downloadBlob,
  getTableDataUrl,
} from "@/lib/assignExport";

/* ================== Supabase client for realtime ================== */
const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AssignScheduling() {
  const tableRef = useRef<HTMLTableElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [loading, setLoading] = useState(false);

  const [currentDate, setCurrentDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [techs, setTechs] = useState<UITechnician[]>([]);
  const [projectsData, setProjectsData] = useState<UIProject[]>([]);
  const [techCodeToUuid, setTechCodeToUuid] = useState<Record<string, string>>(
    {}
  );

  const [assignments, setAssignments] = useState<CellAssignment[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const [showEditProject, setShowEditProject] = useState(false);
  const [editProjectForm, setEditProjectForm] = useState<EditProjectForm>({
    projectId: "",
    status: "unassigned",
    reason: "",
    isReadOnlyProject: false,
  });

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showProjectSuccess, setShowProjectSuccess] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [showProjectShortcut, setShowProjectShortcut] = useState(false);
  const [shortcutPosition, setShortcutPosition] = useState({ x: 0, y: 0 });
  const [selectedProjectForShortcut, setSelectedProjectForShortcut] =
    useState<UIProject | null>(null);
  const shortcutRef = useRef<HTMLDivElement>(null);
  const lastClickTimeRef = useRef<number>(0);

  /* ---------- Load awal ---------- */
  useEffect(() => {
    (async () => {
      await Promise.all([loadTechnicians(), loadProjects()]);
      await loadAssignments(currentDate);
    })();
  }, [currentDate]);

  /* ---------- Scheduler: auto advance di tengah malam ---------- */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(async () => {
        const key = `advance-done-${currentDate}`;
        if (!localStorage.getItem(key)) {
          try {
            await apiFetch("/api/cron/advance-day", {
              method: "POST",
              body: JSON.stringify({ date: currentDate }),
            });
            localStorage.setItem(key, "1");
          } catch (e) {
            console.error("advance-day failed", e);
          }
        }
        const newIso = new Date().toISOString().slice(0, 10);
        setCurrentDate(newIso);
        await loadAssignments(newIso);
        schedule();
      }, msToNextMidnight());
    };
    schedule();
    const onFocus = async () => {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (todayIso !== currentDate) {
        setCurrentDate(todayIso);
        await loadAssignments(todayIso);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [currentDate]);

  /* ---------- Realtime subscribe projects ---------- */
  useEffect(() => {
    let t: any;
    const trigger = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        await loadProjects();
        await loadAssignments(currentDate);
      }, 150);
    };
    const ch = sbAdmin
      .channel("assign-admin-projects")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        trigger
      )
      .subscribe();
    return () => {
      clearTimeout(t);
      sbAdmin.removeChannel(ch);
    };
  }, [currentDate]);

  /* ---------- API loaders ---------- */
  async function loadTechnicians() {
    try {
      let res = await apiFetch<any>("/api/technicians", { cache: "no-store" });
      let rows = unwrap<any[]>(res);
      if (!rows?.length) {
        try {
          res = await apiFetch<any>("/api/technicians/all", {
            cache: "no-store",
          });
          rows = unwrap<any[]>(res);
        } catch {}
      }
      const ui: UITechnician[] = rows.map((t: any) => ({
        id: String(t.id), // <-- pakai UUID langsung
        name: String(t.nama_panggilan ?? "Teknisi"),
        inisial: String(
          t.inisial ?? "?"
        ).toUpperCase(),
      }));
      setTechs(ui);

      // mapping id→uuid (identitas) agar handleSaveAssignment tetap simpel
      const mapping: Record<string, string> = {};
      for (const t of rows) {
        const uuid = String(t.id ?? t.uuid);
        mapping[uuid] = uuid; // identity
      }
      setTechCodeToUuid(mapping);
    } catch (e) {
      console.error("loadTechnicians failed:", e);
      setTechs([]);
      setTechCodeToUuid({});
    }
  }

  async function loadProjects() {
    try {
      let res = await apiFetch<any>(`/api/projects?date=${currentDate}`, {
        cache: "no-store",
      });
      let rows = unwrap<any[]>(res);
      if (!rows?.length) {
        res = await apiFetch<any>(`/api/grid?date=${currentDate}`, {
          cache: "no-store",
        });
        rows = unwrap<any[]>(
          unwrap<{ date?: string; projects?: any[]; data?: any[] }>(res)
        );
      }
      const ui: UIProject[] = rows.map((p: any) => {
        const id = String(p.id ?? p.projectId ?? safeUUID());
        const name = p.name ?? p.nama ?? "Project";
        const sigmaTek = Number(p.sigma_teknisi ?? p.sigmaTechnicians ?? 0);
        const sigmaHari = Number(p.sigma_hari ?? p.sigmaDays ?? 0);
        const sigmaMD = Number(p.sigma_man_days ?? p.sigmaManDays ?? 0);
        const daysElap = Number(
          p.days_elapsed ??
            p.daysElapsed ??
            (typeof p.progressHari === "string"
              ? Number(p.progressHari.split("/")[0])
              : 0)
        );
        const status = p.status ?? p.progressStatus ?? "ongoing";
        const projectStatus =
          p.project_status ?? p.projectStatus ?? "unassigned";
        const mdCurrent = Number(
          p.actual_man_days ??
            p.actualManDays ??
            (typeof p.manDays === "string"
              ? Number(p.manDays.split("/")[0])
              : 0)
        );
        const jamDatang = time5(p.jam_datang ?? p.datangDefault, "08:00");
        const jamPulang = time5(p.jam_pulang ?? p.pulangDefault, "17:00");
        const sales: string = p.sales ?? p.sales_name ?? p.nama_sales ?? "";
        return {
          id,
          name,
          manPower: sigmaTek,
          jamDatang,
          jamPulang,
          jobId: p.job_id ?? p.code ?? "",
          duration: sigmaHari,
          daysElapsed: daysElap,
          status,
          projectStatus,
          pendingReason: p.pending_reason ?? p.pendingReason ?? "",
          sigmaHari,
          sigmaTeknisi: sigmaTek,
          sigmaManDays: String(sigmaMD),
          actualManDays: mdCurrent,
          sales,
        } as UIProject;
      });
      setProjectsData(ui);
    } catch (e) {
      console.error("loadProjects failed:", e);
      setProjectsData([]);
    }
  }

  async function loadAssignments(isoDate: string) {
    try {
      let res = await apiFetch<any>(`/api/assignments?date=${isoDate}`, {
        cache: "no-store",
      });
      let rows = unwrap<any[]>(res);

      if (!rows?.length) {
        res = await apiFetch<any>(`/api/grid?date=${isoDate}`, {
          cache: "no-store",
        });
        const projects = unwrap<any[]>(
          unwrap<{ date?: string; projects?: any[]; data?: any[] }>(res)
        );

        const derived: CellAssignment[] = [];
        for (const p of projects ?? []) {
          const pid = String(p.id ?? p.projectId ?? safeUUID());
          const technicians = p.technicians ?? [];
          for (const t of technicians) {
            derived.push({
              projectId: pid,
              technicianId: String(t.code ?? t.id),
              isSelected: true,
              inisial: String(
                t.inisials ?? t.inisial ?? t.name?.[0] ?? ""
              ).toUpperCase(),
              isProjectLeader: Boolean(
                t.isProjectLeader ?? t.project_leader ?? false
              ),
            });
          }
        }
        setAssignments(derived);
        return;
      }

      const filteredAssignments = rows.map((r: any) => ({
        projectId: String(r.projectId ?? r.project_id),
        technicianId: String(
          r.technicianCode ??
            r.technician_code ??
            r.technicianId ??
            r.technician_id
        ),
        isSelected: Boolean(r.isSelected ?? false),
        inisial: String(r.inisial ?? r.inisials ?? "").toUpperCase(),
        isProjectLeader: Boolean(r.isProjectLeader ?? false),
      }));
      setAssignments(filteredAssignments);
    } catch (e) {
      console.error("loadAssignments failed:", e);
      setAssignments([]);
    }
  }

  /* ---------- Helpers dari state ---------- */
  const getCellAssignment = (projectId: string, technicianId: string) =>
    assignments.find(
      (a) => a.projectId === projectId && a.technicianId === technicianId
    );

  const getTechnicianTrackNumber = (technicianId: string) =>
    assignments.filter(
      (a) =>
        a.technicianId === technicianId && (a.isSelected || a.isProjectLeader)
    ).length;

  const getProjectAssignmentCount = (projectId: string) =>
    assignments.filter(
      (a) => a.projectId === projectId && (a.isSelected || a.isProjectLeader)
    ).length;

  const getSelectedCount = () =>
    assignments.filter((a) => a.isSelected || a.isProjectLeader).length;

  const getIdleTechnicians = () => {
    const assigned = new Set(assignments.map((a) => a.technicianId));
    return techs.filter((t) => !assigned.has(t.id));
  };
  const getTechnicianStatus = (technicianId: string) => {
    const techAssignments = assignments.filter(
      (a) => a.technicianId === technicianId
    );
    if (techAssignments.length === 0) {
      return { status: "idle", color: "bg-gray-300 text-gray-700" };
    }
    const isWorkingToday = techAssignments.some(
      (a) => a.isSelected || a.isProjectLeader
    );
    if (isWorkingToday)
      return { status: "working", color: "bg-blue-200 text-blue-900" };
    return { status: "assigned", color: "bg-green-200 text-green-900" };
  };

  /* ---------- Interaksi Grid ---------- */
  const handleCellClick = (projectId: string, technicianId: string) => {
    const project = projectsData.find((p) => p.id === projectId);
    if (!project) return;
    if (project.projectStatus === "pending") return;
    if (project.status === "completed") return;

    const technician = techs.find((t) => t.id === technicianId);
    if (!technician) return;

    setAssignments((prev) => {
      const existingIndex = prev.findIndex(
        (a) => a.projectId === projectId && a.technicianId === technicianId
      );
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        if (existing.isSelected) {
          if (existing.isProjectLeader) return prev;
          const updated = prev.filter((_, index) => index !== existingIndex);
          const remaining = updated.filter(
            (a) =>
              a.projectId === projectId && (a.isSelected || a.isProjectLeader)
          );
          if (remaining.length === 0) {
            setProjectsData((prevProjects) =>
              prevProjects.map((p) =>
                p.id === projectId ? { ...p, projectStatus: "unassigned" } : p
              )
            );
          }
          return updated;
        } else {
          const updated = [...prev];
          updated[existingIndex] = {
            ...existing,
            isSelected: true,
            inisial: technician.inisial,
            isProjectLeader: existing.isProjectLeader || false,
          };
          const projectAssignments = updated.filter(
            (a) =>
              a.projectId === projectId && (a.isSelected || a.isProjectLeader)
          );
          if (projectAssignments.length === 1) {
            setProjectsData((prevProjects) =>
              prevProjects.map((p) =>
                p.id === projectId && p.projectStatus === "unassigned"
                  ? { ...p, projectStatus: "ongoing" }
                  : p
              )
            );
          }
          return updated;
        }
      } else {
        const existingAssignments = prev.filter(
          (a) =>
            a.projectId === projectId && (a.isSelected || a.isProjectLeader)
        );
        if (existingAssignments.length === 0) {
          setProjectsData((prevProjects) =>
            prevProjects.map((p) =>
              p.id === projectId && p.projectStatus === "unassigned"
                ? { ...p, projectStatus: "ongoing" }
                : p
            )
          );
        }
        return [
          ...prev,
          {
            projectId,
            technicianId,
            isSelected: true,
            inisial: technician.inisial,
            isProjectLeader: false,
          },
        ];
      }
    });
  };

  const handleCellDoubleClick = (projectId: string, technicianId: string) => {
    const project = projectsData.find((p) => p.id === projectId);
    if (!project) return;
    if (project.projectStatus === "pending") return;
    if (project.status === "completed") return;

    const technician = techs.find((t) => t.id === technicianId);
    if (!technician) return;

    setAssignments((prev) => {
      const existingIndex = prev.findIndex(
        (a) => a.projectId === projectId && a.technicianId === technicianId
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        const current = updated[existingIndex];
        const newLeaderStatus = !current.isProjectLeader;
        updated[existingIndex] = {
          ...current,
          isSelected: newLeaderStatus ? true : current.isSelected,
          isProjectLeader: newLeaderStatus,
          inisial: technician.inisial,
        };
        if (newLeaderStatus) {
          for (let i = 0; i < updated.length; i++) {
            if (i !== existingIndex && updated[i].projectId === projectId) {
              updated[i] = { ...updated[i], isProjectLeader: false };
            }
          }
        }
        return updated;
      } else {
        const updated = [...prev];
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].projectId === projectId)
            updated[i] = { ...updated[i], isProjectLeader: false };
        }
        return [
          ...updated,
          {
            projectId,
            technicianId,
            isSelected: true,
            isProjectLeader: true,
            inisial: technician.inisial,
          },
        ];
      }
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      const all: CellAssignment[] = [];
      projectsData.forEach((project) => {
        const locked =
          project.projectStatus === "pending" || project.status === "completed";
        techs.forEach((t) => {
          const exist = assignments.find(
            (a) => a.projectId === project.id && a.technicianId === t.id
          );
          all.push({
            projectId: project.id,
            technicianId: t.id,
            isSelected: locked ? Boolean(exist?.isSelected) : true,
            inisial: t.inisial,
            isProjectLeader: exist?.isProjectLeader || false,
          });
        });
      });
      setAssignments(all);
    } else {
      setAssignments((prev) => prev.filter((a) => a.isProjectLeader));
    }
  };

  /* ---------- Export / Share ---------- */
  const handleExportTableImage = async (type: "png" | "jpeg" = "png") => {
    if (!tableRef.current) return;
    setIsExporting(true);

    const downloadDataUrl = (dataUrl: string, filename: string) => {
      try {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        window.open(dataUrl, "_blank");
      }
    };

    try {
      const node = tableRef.current;
      const dataUrl = await getTableDataUrl(node, type, 1920);
      const ext = type === "png" ? "png" : "jpg";
      const mime = type === "png" ? "image/png" : "image/jpeg";
      const dateStr = formatDateDDMMYYYY(currentDate);
      const imgName = `assign-penjadwalan_${currentDate}_1080p.${ext}`;
      const imgFile = dataUrlToFile(dataUrl, imgName, mime);

      const canShareImage =
        typeof navigator !== "undefined" &&
        "canShare" in navigator &&
        (navigator as any).canShare?.({ files: [imgFile] });

      if (canShareImage) {
        await (navigator as any).share({
          files: [imgFile],
          title: "Penjadwalan Teknisi",
          text: `Penjadwalan Teknisi ${dateStr}`,
        });
        try {
          const blob = await (await fetch(dataUrl)).blob();
          downloadBlob(blob, imgName);
        } catch {
          downloadDataUrl(dataUrl, imgName);
        }
      } else {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          downloadBlob(blob, imgName);
        } catch {
          downloadDataUrl(dataUrl, imgName);
        }
        alert(
          "Gambar sudah diunduh. Kirim manual lewat WhatsApp/WhatsApp Web ya."
        );
      }

      const xlsxBlob = await buildStyledExcelBlob(
        techs,
        projectsData,
        assignments,
        currentDate
      );
      const xlsxName = `assign-penjadwalan_${currentDate}.xlsx`;
      downloadBlob(xlsxBlob, xlsxName);
    } catch (err) {
      console.error(err);
      alert("Gagal menyiapkan gambar/Excel. Coba lagi.");
    } finally {
      setIsExporting(false);
    }
  };

  /* ---------- Simpan ---------- */
  const handleSaveAssignment = async () => {
    const projectIds = projectsData.map((p) => p.id);
    const payload = {
      date: currentDate,
      projectIds,
      assignments: assignments
        .filter((a) => a.isSelected || a.isProjectLeader)
        .map((a) => {
          const techUuid = techCodeToUuid[a.technicianId] ?? a.technicianId;
          const projectUuid = a.projectId;
          if (!techUuid || !projectUuid) return null;
          return {
            projectId: projectUuid,
            technicianId: techUuid,
            isSelected: a.isSelected,
            isProjectLeader: !!a.isProjectLeader,
          };
        })
        .filter(Boolean),
    };

    try {
      setLoading(true);
      await apiFetch<{ data: any }>("/api/assignments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await Promise.all([loadProjects(), loadAssignments(currentDate)]);
      setShowConfirmation(true);
    } catch (e: any) {
      alert(e?.message || "Gagal menyimpan assignment");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Edit Status Project ---------- */
  const handleEditProject = async () => {
    if (!editProjectForm.projectId || !editProjectForm.status) return;
    if (
      editProjectForm.status === "pending" &&
      editProjectForm.reason.trim().length < 5
    )
      return;

    try {
      setLoading(true);
      await apiFetch<{ data: any }>("/api/projects/status", {
        method: "PATCH",
        body: JSON.stringify({
          projectId: editProjectForm.projectId,
          status: editProjectForm.status,
          reason:
            editProjectForm.status === "pending"
              ? editProjectForm.reason
              : undefined,
        }),
      });
      await loadProjects();
    } catch (e: any) {
      alert(e?.message || "Gagal update status project");
    } finally {
      setLoading(false);
      setShowEditProject(false);
      setEditProjectForm({
        projectId: "",
        status: "unassigned",
        reason: "",
        isReadOnlyProject: false,
      });
    }
  };

  /* ---------- Shortcut “Generate Laporan” ---------- */
  const downloadDocx = (jobId: string) => {
    const url = `/api/laporan/docx?jobId=${encodeURIComponent(jobId)}`;
    window.open(url, "_blank");
  };
  const handleProjectNameRightClick = (
    event: React.MouseEvent,
    project: UIProject
  ) => {
    event.preventDefault();
    const now = Date.now();
    if (now - (lastClickTimeRef.current || 0) < 300) return;
    lastClickTimeRef.current = now;
    if (!project?.id) return;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    let x = rect.left + rect.width / 2;
    let y = rect.bottom + 8;
    if (x + 150 > viewportWidth) x = rect.left - 150;
    if (y + 60 > viewportHeight) y = rect.top - 60;
    setShortcutPosition({ x, y });
    setSelectedProjectForShortcut(project);
    setShowProjectShortcut(true);
  };
  const handleGenerateLaporan = () => {
    if (selectedProjectForShortcut?.jobId)
      downloadDocx(selectedProjectForShortcut.jobId);
    else alert("Job ID tidak ditemukan untuk project ini.");
    setShowProjectShortcut(false);
  };

  /* ---------- Navigasi tanggal ---------- */
  const handleDateNavigation = async (dir: "prev" | "next") => {
    const newIso = addDaysToIso(currentDate, dir === "prev" ? -1 : 1);
    setCurrentDate(newIso);
    await loadAssignments(newIso);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        title="Assign Penjadwalan Teknisi"
        showBackButton={true}
        backUrl="/admin/dashboard"
        rightContent={
          <Button
            onClick={handleSaveAssignment}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
            disabled={loading || getSelectedCount() === 0}
          >
            {loading
              ? "Menyimpan..."
              : `Simpan Assignment (${getSelectedCount()})`}
          </Button>
        }
      />

      <main className="p-4">
        <div className="max-w-full mx-auto">
          <Toolbar
            selectAll={selectAll}
            onSelectAllChange={handleSelectAll}
            onEditProjectOpen={() => setShowEditProject(true)}
            onCreateProjectOpen={() => setShowCreateProject(true)}
            onShare={() => handleExportTableImage("png")}
            isExporting={isExporting}
            onSaveAssignment={handleSaveAssignment}
            selectedCount={getSelectedCount()}
            loading={loading}
            currentDateLabel={formatDateDDMMYYYY(currentDate)}
            onPrevDate={() => handleDateNavigation("prev")}
            onNextDate={() => handleDateNavigation("next")}
            totalAssignments={
              assignments.filter((a) => a.isSelected || a.isProjectLeader)
                .length
            }
          />

          <ProjectTable
            tableRef={tableRef}
            techs={techs}
            projects={projectsData}
            assignments={assignments}
            onCellClick={handleCellClick}
            onCellDoubleClick={handleCellDoubleClick}
            onStatusDoubleClick={(project) => {
              setEditProjectForm({
                projectId: project.id,
                status: project.projectStatus,
                reason: project.pendingReason || "",
                isReadOnlyProject: true,
              });
              setShowEditProject(true);
            }}
            onProjectNameRightClick={handleProjectNameRightClick}
            getCellAssignment={getCellAssignment}
            getTechnicianTrackNumber={getTechnicianTrackNumber}
            getProjectAssignmentCount={getProjectAssignmentCount}
            getIdleTechnicians={getIdleTechnicians}
            getTechnicianStatus={getTechnicianStatus}
          />

          <AssignmentSummary count={getSelectedCount()} />
        </div>
      </main>

      <ProjectShortcutPopup
        open={showProjectShortcut}
        position={shortcutPosition}
        jobId={selectedProjectForShortcut?.jobId}
        onGenerate={handleGenerateLaporan}
        onClose={() => setShowProjectShortcut(false)}
        containerRef={shortcutRef}
      />

      <EditProjectDialog
        open={showEditProject}
        onOpenChange={setShowEditProject}
        projectsData={projectsData}
        form={editProjectForm}
        setForm={setEditProjectForm}
        onSubmit={handleEditProject}
        loading={loading}
      />

      <CreateProjectDialog
        open={showCreateProject}
        onOpenChange={setShowCreateProject}
        onCreated={(p) => {
          setProjectsData((prev) => [p, ...prev]);
          setShowProjectSuccess(true);
        }}
      />

      {/* Notifs */}
      {showProjectSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Projek Baru Telah Selesai Dibuat
              </h3>
              <Button
                onClick={() => setShowProjectSuccess(false)}
                className="w-full bg-green-600 hover:bg-green-700 text-lg py-3"
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}

      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">
                Assignment Berhasil Disimpan!
              </h3>
              <p className="text-lg text-gray-600 mb-6">
                {getSelectedCount()} assignment teknisi telah berhasil disimpan
                ke sistem.
              </p>
              <Button
                onClick={() => setShowConfirmation(false)}
                className="w-full bg-green-600 hover:bg-green-700 text-lg py-3"
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
