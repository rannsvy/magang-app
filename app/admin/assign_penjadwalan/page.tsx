"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin-header"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckCircle, Calendar, Plus, Edit, ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const technicians = [
  { id: "1", name: "Ahmad", initial: "A" },
  { id: "2", name: "Budi", initial: "B" },
  { id: "3", name: "Candra", initial: "C" },
  { id: "4", name: "Dedi", initial: "D" },
  { id: "5", name: "Eko", initial: "E" },
  { id: "6", name: "Fajar", initial: "F" },
  { id: "7", name: "Gilang", initial: "G" },
  { id: "8", name: "Hadi", initial: "H" },
  { id: "9", name: "Indra", initial: "I" },
  { id: "10", name: "Joko", initial: "J" },
  { id: "11", name: "Krisna", initial: "K" },
  { id: "12", name: "Lukman", initial: "L" },
  { id: "13", name: "Maman", initial: "M" },
  { id: "14", name: "Nanda", initial: "N" },
  { id: "15", name: "Oscar", initial: "O" },
  { id: "16", name: "Putra", initial: "P" },
  { id: "17", name: "Qomar", initial: "Q" },
  { id: "18", name: "Rizki", initial: "R" },
  { id: "19", name: "Sandi", initial: "S" },
  { id: "20", name: "Toni", initial: "T" },
  { id: "21", name: "Umar", initial: "U" },
  { id: "22", name: "Vino", initial: "V" },
  { id: "23", name: "Wahyu", initial: "W" },
  { id: "24", name: "Xavi", initial: "X" },
  { id: "25", name: "Yanto", initial: "Y" },
  { id: "26", name: "Zaki", initial: "Z" },
  { id: "27", name: "Arif", initial: "AR" },
  { id: "28", name: "Bayu", initial: "BY" },
  { id: "29", name: "Coki", initial: "CK" },
  { id: "30", name: "Dani", initial: "DN" },
]

type ProjectStatus = "unassigned" | "ongoing" | "pending"

const projects = [
  {
    id: "1",
    name: "Pemasangan CCTV",
    manPower: 2,
    jamDatang: "08:00",
    jamPulang: "17:00",
    jobId: "JOB-PEMASANGAN-CCTV-001",
    duration: 10,
    daysElapsed: 3,
    status: "ongoing" as "ongoing" | "completed" | "overdue",
    projectStatus: "ongoing" as ProjectStatus,
    pendingReason: "",
    sigmaHari: 10,
    sigmaTeknisi: 2,
    sigmaManDays: "30",
    sales: "Andi Pratama",
  },
  {
    id: "2",
    name: "Maintenance Server",
    manPower: 1,
    jamDatang: "08:00",
    jamPulang: "17:00",
    jobId: "JOB-MAINTENANCE-SERVER-001",
    duration: 10,
    daysElapsed: 5,
    status: "completed" as "ongoing" | "completed" | "overdue",
    projectStatus: "ongoing" as ProjectStatus,
    pendingReason: "",
    sigmaHari: 10,
    sigmaTeknisi: 1,
    sigmaManDays: "30",
    sales: "Budi Santoso",
  },
  {
    id: "3",
    name: "Instalasi WiFi",
    manPower: 2,
    jamDatang: "08:00",
    jamPulang: "17:00",
    jobId: "JOB-INSTALASI-WIFI-001",
    duration: 10,
    daysElapsed: 11,
    status: "overdue" as "ongoing" | "completed" | "overdue",
    projectStatus: "pending" as ProjectStatus,
    pendingReason: "Menunggu persetujuan dari klien untuk perubahan spesifikasi teknis",
    sigmaHari: 10,
    sigmaTeknisi: 2,
    sigmaManDays: "30",
    sales: "Citra Dewi",
  },
  {
    id: "4",
    name: "Perbaikan Router",
    manPower: 1,
    jamDatang: "08:00",
    jamPulang: "17:00",
    jobId: "JOB-PERBAIKAN-ROUTER-001",
    duration: 10,
    daysElapsed: 0,
    status: "ongoing" as "ongoing" | "completed" | "overdue",
    projectStatus: "unassigned" as ProjectStatus,
    pendingReason: "",
    sigmaHari: 10,
    sigmaTeknisi: 1,
    sigmaManDays: "30",
    sales: "Dewi Lestari",
  },
  {
    id: "5",
    name: "Setup Jaringan",
    manPower: 3,
    jamDatang: "08:00",
    jamPulang: "17:00",
    jobId: "JOB-SETUP-JARINGAN-001",
    duration: 10,
    daysElapsed: 8,
    status: "ongoing" as "ongoing" | "completed" | "overdue",
    projectStatus: "ongoing" as ProjectStatus,
    pendingReason: "",
    sigmaHari: 10,
    sigmaTeknisi: 3,
    sigmaManDays: "30",
    sales: "Eko Wijaya",
  },
]

const projectTypes = [
  { id: "cctv", name: "Pemasangan CCTV", template: "Template A" },
  { id: "maintenance", name: "Maintenance Server", template: "Template B" },
  { id: "wifi", name: "Instalasi WiFi", template: "Template C" },
  { id: "router", name: "Perbaikan Router", template: "Template D" },
  { id: "jaringan", name: "Setup Jaringan", template: "Template A" },
]

interface CellAssignment {
  projectId: string
  technicianId: string
  isSelected: boolean
  initial?: string
  isProjectLeader?: boolean
}

interface NewProjectForm {
  namaProject: string
  lokasi: string
  namaSales: string
  namaPresales: string
  tanggalSpkUser: string
  tanggalTerimaPo: string
  tanggalMulaiProject: string
  tanggalDeadlineProject: string
  sigmaManDays: string
  sigmaHari: string
  sigmaTeknisi: string
  tipeTemplate: string
}

interface EditProjectForm {
  projectId: string
  status: ProjectStatus
  reason: string
  isReadOnlyProject?: boolean
}

export default function AssignScheduling() {
  const router = useRouter()
  const [activeDate, setActiveDate] = useState<Date>(new Date())
  const [assignments, setAssignments] = useState<CellAssignment[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showProjectSuccess, setShowProjectSuccess] = useState(false)
  const [newProjectForm, setNewProjectForm] = useState<NewProjectForm>({
    namaProject: "",
    lokasi: "",
    namaSales: "",
    namaPresales: "",
    tanggalSpkUser: "",
    tanggalTerimaPo: "",
    tanggalMulaiProject: "",
    tanggalDeadlineProject: "",
    sigmaManDays: "",
    sigmaHari: "",
    sigmaTeknisi: "",
    tipeTemplate: "",
  })
  const [showSubFields, setShowSubFields] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [editProjectForm, setEditProjectForm] = useState<EditProjectForm>({
    projectId: "",
    status: "unassigned",
    reason: "",
    isReadOnlyProject: false,
  })
  const [projectsData, setProjectsData] = useState(projects)
  const [dateValidationError, setDateValidationError] = useState<string>("")
  const [tipeTemplateError, setTipeTemplateError] = useState<string>("")

  const [showProjectShortcut, setShowProjectShortcut] = useState(false)
  const [shortcutPosition, setShortcutPosition] = useState({ x: 0, y: 0 })
  const [selectedProjectForShortcut, setSelectedProjectForShortcut] = useState<string>("")
  const shortcutRef = useRef<HTMLDivElement>(null)
  const lastClickTimeRef = useRef<number>(0)

  const formatDateDDMMYYYY = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const year = date.getFullYear()
    return `${day}-${month}-${year}`
  }

  const isSameOrBefore = (dateA: Date, dateB: Date) => {
    return dateA <= dateB
  }

  const isSameOrAfter = (dateA: Date, dateB: Date) => {
    return dateA >= dateB
  }

  const getProjectsByActiveDate = (projects: typeof projectsData, activeDate: Date) => {
    return projects.filter((project) => {
      // For demo purposes, we'll simulate project dates based on current date and project properties
      // In real implementation, these would come from actual project date fields
      const today = new Date()
      const projectStartDate = new Date(today.getTime() - project.daysElapsed * 24 * 60 * 60 * 1000)

      let projectEndDate: Date | null = null
      if (project.status === "completed") {
        // Completed projects end on their completion date (simulated as today for demo)
        projectEndDate = new Date(today.getTime())
      } else if (project.status === "overdue") {
        // Overdue projects should have ended but are still ongoing
        projectEndDate = new Date(today.getTime() - 24 * 60 * 60 * 1000) // Yesterday
      }
      // For ongoing/pending projects, projectEndDate remains null (no end date yet)

      // Show project if:
      // 1. activeDate is on or after project start date
      // 2. AND either project has no end date OR activeDate is on or before end date
      const showProject =
        isSameOrAfter(activeDate, projectStartDate) &&
        (projectEndDate === null || isSameOrBefore(activeDate, projectEndDate))

      return showProject
    })
  }

  const handleDateNavigation = (direction: "prev" | "next") => {
    setActiveDate((prevDate) => {
      const newDate = new Date(prevDate)
      if (direction === "prev") {
        newDate.setDate(newDate.getDate() - 1)
      } else {
        newDate.setDate(newDate.getDate() + 1)
      }
      return newDate
    })
  }

  const filteredProjects = getProjectsByActiveDate(projectsData, activeDate)

  const getCellAssignment = (projectId: string, technicianId: string) => {
    return assignments.find((a) => a.projectId === projectId && a.technicianId === technicianId)
  }

  const getTechnicianTrackNumber = (technicianId: string) => {
    return assignments.filter((a) => a.technicianId === technicianId && a.isSelected).length
  }

  const getProjectAssignmentCount = (projectId: string) => {
    return assignments.filter((a) => a.projectId === projectId && a.isSelected).length
  }

  const handleCellClick = (projectId: string, technicianId: string) => {
    const technician = technicians.find((t) => t.id === technicianId)
    if (!technician) return

    setAssignments((prev) => {
      const existingIndex = prev.findIndex((a) => a.projectId === projectId && a.technicianId === technicianId)

      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          isSelected: !updated[existingIndex].isSelected,
          initial: !updated[existingIndex].isSelected ? technician.initial : undefined,
        }

        const projectAssignments = updated.filter((a) => a.projectId === projectId && a.isSelected)
        if (projectAssignments.length === 1 && updated[existingIndex].isSelected) {
          setProjectsData((prevProjects) =>
            prevProjects.map((p) =>
              p.id === projectId && p.projectStatus === "unassigned"
                ? { ...p, projectStatus: "ongoing" as ProjectStatus }
                : p,
            ),
          )
        }

        return updated
      } else {
        const existingAssignments = prev.filter((a) => a.projectId === projectId && a.isSelected)
        if (existingAssignments.length === 0) {
          setProjectsData((prevProjects) =>
            prevProjects.map((p) =>
              p.id === projectId && p.projectStatus === "unassigned"
                ? { ...p, projectStatus: "ongoing" as ProjectStatus }
                : p,
            ),
          )
        }

        return [
          ...prev,
          {
            projectId,
            technicianId,
            isSelected: true,
            initial: technician.initial,
          },
        ]
      }
    })
  }

  const handleCellDoubleClick = (projectId: string, technicianId: string) => {
    const technician = technicians.find((t) => t.id === technicianId)
    if (!technician) return

    setAssignments((prev) => {
      const existingIndex = prev.findIndex((a) => a.projectId === projectId && a.technicianId === technicianId)

      if (existingIndex >= 0) {
        const updated = [...prev]
        const currentAssignment = updated[existingIndex]

        updated[existingIndex] = {
          ...currentAssignment,
          isSelected: true,
          isProjectLeader: !currentAssignment.isProjectLeader,
          initial: technician.initial,
        }
        return updated
      } else {
        return [
          ...prev,
          {
            projectId,
            technicianId,
            isSelected: true,
            isProjectLeader: true,
            initial: technician.initial,
          },
        ]
      }
    })
  }

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked)

    if (checked) {
      const allAssignments: CellAssignment[] = []
      projects.forEach((project) => {
        technicians.forEach((technician) => {
          allAssignments.push({
            projectId: project.id,
            technicianId: technician.id,
            isSelected: true,
            initial: technician.initial,
          })
        })
      })
      setAssignments(allAssignments)
    } else {
      setAssignments((prev) => prev.map((a) => ({ ...a, isSelected: false, initial: undefined })))
    }
  }

  const handleSaveAssignment = () => {
    const selectedAssignments = assignments.filter((a) => a.isSelected)
    console.log("Saving assignments:", selectedAssignments)
    setShowConfirmation(true)
  }

  const getSelectedCount = () => {
    return assignments.filter((a) => a.isSelected).length
  }

  const getCurrentDate = () => {
    return formatDateDDMMYYYY(activeDate)
  }

  const getTotalAssignments = () => {
    return assignments.filter((a) => a.isSelected).length
  }

  const getIdleTechnicians = () => {
    const assignedTechnicianIds = new Set(assignments.filter((a) => a.isSelected).map((a) => a.technicianId))
    return technicians.filter((tech) => !assignedTechnicianIds.has(tech.id))
  }

  const getProgressStatus = (project: (typeof projects)[0]) => {
    const { status } = project
    const sigmaHari = project.sigmaHari
    const currentDays = project.daysElapsed

    let bgColor = "bg-gray-100"
    let textColor = "text-gray-700"

    switch (status) {
      case "completed":
        bgColor = "bg-green-100"
        textColor = "text-green-700"
        break
      case "overdue":
        bgColor = "bg-red-100"
        textColor = "text-red-700"
        break
      case "ongoing":
      default:
        bgColor = "bg-gray-100"
        textColor = "text-gray-700"
        break
    }

    return { bgColor, textColor, display: `${currentDays}/${sigmaHari}` }
  }

  const getSigmaDisplay = (project: (typeof projects)[0]) => {
    const assignedTechnicians = getProjectAssignmentCount(project.id)
    const sigmaTeknisi = project.sigmaTeknisi
    return {
      current: assignedTechnicians,
      target: sigmaTeknisi,
      display: `${assignedTechnicians}/${sigmaTeknisi}`,
    }
  }

  const generateJobId = (projectType: string) => {
    const selectedType = projectTypes.find((type) => type.id === projectType)
    if (!selectedType) return ""

    const existingProjects = projects.filter((p) => p.name.toLowerCase().includes(selectedType.name.toLowerCase()))
    const nextNumber = String(existingProjects.length + 1).padStart(selectedType.id === "maintenance" ? 3 : 2, "0")

    const typeCode = selectedType.name.toUpperCase().replace(/\s+/g, "-")
    return `JOB-${typeCode}-${nextNumber}`
  }

  const handleCreateProject = () => {
    if (
      !newProjectForm.namaProject ||
      !newProjectForm.lokasi ||
      !newProjectForm.tanggalMulaiProject ||
      !newProjectForm.tanggalDeadlineProject ||
      !newProjectForm.sigmaManDays ||
      !newProjectForm.sigmaHari ||
      !newProjectForm.sigmaTeknisi
    ) {
      return
    }

    if (!newProjectForm.tipeTemplate) {
      setTipeTemplateError("Harap pilih tipe template")
      return
    }

    if (!validateDates(newProjectForm.tanggalMulaiProject, newProjectForm.tanggalDeadlineProject)) {
      return
    }

    setTipeTemplateError("")

    console.log("Creating new project:", newProjectForm)
    setShowCreateProject(false)
    setShowProjectSuccess(true)
    setNewProjectForm({
      namaProject: "",
      lokasi: "",
      namaSales: "",
      namaPresales: "",
      tanggalSpkUser: "",
      tanggalTerimaPo: "",
      tanggalMulaiProject: "",
      tanggalDeadlineProject: "",
      sigmaManDays: "",
      sigmaHari: "",
      sigmaTeknisi: "",
      tipeTemplate: "",
    })
    setShowSubFields(false)
  }

  const getManDaysDisplay = (project: (typeof projects)[0]) => {
    const assignedTechnicians = getProjectAssignmentCount(project.id)
    const targetManDays = Number.parseInt(project.sigmaManDays) || 30
    return {
      current: assignedTechnicians,
      target: targetManDays,
      display: `${assignedTechnicians}/${targetManDays}`,
    }
  }

  const getManDaysStatus = (project: (typeof projects)[0]) => {
    const assignedTechnicians = getProjectAssignmentCount(project.id)
    const targetManDays = Number.parseInt(project.sigmaManDays) || 30

    let bgColor = "bg-gray-100"
    let textColor = "text-gray-700"

    if (assignedTechnicians >= targetManDays) {
      bgColor = "bg-green-100"
      textColor = "text-green-700"
    } else if (assignedTechnicians > targetManDays * 1.2) {
      bgColor = "bg-red-100"
      textColor = "text-red-700"
    }

    return { bgColor, textColor }
  }

  const getTechnicianStatus = (technicianId: string) => {
    const hasAssignments = assignments.some((a) => a.technicianId === technicianId && a.isSelected)
    if (hasAssignments) {
      return { color: "bg-green-500", label: "berlangsung" }
    }
    return { color: "bg-gray-400", label: "belum dimulai" }
  }

  const handleEditProject = () => {
    if (!editProjectForm.projectId || !editProjectForm.status) return
    if (editProjectForm.status === "pending" && editProjectForm.reason.trim().length < 5) return

    const previousProjectsData = [...projectsData]

    setProjectsData((prevProjects) =>
      prevProjects.map((p) =>
        p.id === editProjectForm.projectId
          ? {
              ...p,
              projectStatus: editProjectForm.status,
              pendingReason: editProjectForm.status === "pending" ? editProjectForm.reason : "",
            }
          : p,
      ),
    )

    setTimeout(() => {
      const success = Math.random() > 0.1 // 90% success rate for demo
      if (!success) {
        // Revert changes
        setProjectsData(previousProjectsData)

        // Show user-friendly error message
        alert("Gagal mengupdate status project. Silakan coba lagi.")

        // Keep the modal open so user can retry
        return
      }

      // Success - close modal and reset form
      setShowEditProject(false)
      setEditProjectForm({
        projectId: "",
        status: "unassigned",
        reason: "",
        isReadOnlyProject: false,
      })
    }, 1000)
  }

  const getProjectStatusDisplay = (project: (typeof projectsData)[0]) => {
    const { projectStatus, pendingReason } = project

    let bgColor = "bg-gray-100"
    let textColor = "text-gray-700"
    let label = "Belum Diassign"

    switch (projectStatus) {
      case "ongoing":
        bgColor = "bg-green-100"
        textColor = "text-green-700"
        label = "Berlangsung"
        break
      case "pending":
        bgColor = "bg-yellow-100"
        textColor = "text-yellow-700"
        label = "Pending"
        break
      case "unassigned":
      default:
        bgColor = "bg-gray-100"
        textColor = "text-gray-700"
        label = "Belum Diassign"
        break
    }

    return { bgColor, textColor, label, reason: pendingReason }
  }

  const truncateText = (text: string, maxLength = 20) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  const handleStatusDoubleClick = (project: (typeof projectsData)[0]) => {
    setEditProjectForm({
      projectId: project.id,
      status: project.projectStatus,
      reason: project.pendingReason || "",
      isReadOnlyProject: true,
    })
    setShowEditProject(true)
  }

  const handleProjectNameRightClick = (event: React.MouseEvent, projectName: string) => {
    // Prevent default browser context menu
    event.preventDefault()

    // Debounce to prevent multiple popups
    const now = Date.now()
    if (now - lastClickTimeRef.current < 300) return
    lastClickTimeRef.current = now

    if (!projectName.trim()) return // Don't show popup for empty project names

    const rect = (event.target as HTMLElement).getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Calculate popup position with flip logic to avoid viewport edges
    let x = rect.left + rect.width / 2
    let y = rect.bottom + 8

    // Flip horizontally if too close to right edge
    if (x + 150 > viewportWidth) {
      x = rect.left - 150
    }

    // Flip vertically if too close to bottom edge
    if (y + 60 > viewportHeight) {
      y = rect.top - 60
    }

    setShortcutPosition({ x, y })
    setSelectedProjectForShortcut(projectName)
    setShowProjectShortcut(true)
  }

  const handleGenerateLaporan = () => {
    if (selectedProjectForShortcut) {
      const encodedProjectName = encodeURIComponent(selectedProjectForShortcut)
      router.push(`/admin/generate_laporan?project=${encodedProjectName}`)
    }
    setShowProjectShortcut(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shortcutRef.current && !shortcutRef.current.contains(event.target as Node)) {
        setShowProjectShortcut(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowProjectShortcut(false)
      } else if (event.key === "Enter" && showProjectShortcut) {
        handleGenerateLaporan()
      }
    }

    if (showProjectShortcut) {
      document.addEventListener("mousedown", handleClickOutside)
      document.addEventListener("keydown", handleKeyDown)

      // Focus the popup for keyboard navigation
      setTimeout(() => {
        shortcutRef.current?.focus()
      }, 0)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [showProjectShortcut])

  const validateDates = (startDate: string, deadlineDate: string) => {
    if (startDate && deadlineDate) {
      const start = new Date(startDate)
      const deadline = new Date(deadlineDate)
      if (deadline < start) {
        setDateValidationError("Tanggal deadline harus sama atau setelah tanggal mulai project")
        return false
      }
    }
    setDateValidationError("")
    return true
  }

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
            disabled={getSelectedCount() === 0}
          >
            Simpan Assignment ({getSelectedCount()})
          </Button>
        }
      />

      <main className="p-4">
        <div className="max-w-full mx-auto">
          <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <Checkbox id="select-all" checked={selectAll} onCheckedChange={handleSelectAll} className="h-4 w-4" />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                Select All Projects & Technicians
              </label>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowEditProject(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 text-sm"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Project
              </Button>
              <Button
                onClick={() => setShowCreateProject(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Buat Project
              </Button>
              <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDateNavigation("prev")}
                  className="h-8 w-8 p-0 hover:bg-gray-200"
                  aria-label="Sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2 px-2">
                  <Calendar className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
                    {formatDateDDMMYYYY(activeDate)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDateNavigation("next")}
                  className="h-8 w-8 p-0 hover:bg-gray-200"
                  aria-label="Berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold text-gray-900 border-r border-gray-300 w-28">
                      Nama Proyek
                    </th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-10">
                      <div className="flex flex-col items-center justify-end h-full">
                        <div className="text-lg font-bold mb-2">Σ</div>
                        <div className="text-xs font-bold bg-gray-200 rounded px-1 min-w-[18px] text-center">
                          {getTotalAssignments()}
                        </div>
                      </div>
                    </th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-16">
                      Progress (Hari)
                    </th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-16">
                      Man Days
                    </th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-14">
                      Datang
                    </th>
                    <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-14">
                      Pulang
                    </th>
                    {technicians.map((technician) => (
                      <th
                        key={technician.id}
                        className="px-1 py-4 text-center font-semibold text-gray-900 border-r border-gray-300 w-6 sticky top-0 bg-gray-100 h-32"
                        title={technician.name}
                      >
                        <div className="flex flex-col items-center justify-end h-full">
                          <div
                            className="text-xs font-bold whitespace-nowrap mb-2"
                            style={{
                              writingMode: "vertical-lr",
                              textOrientation: "mixed",
                              transform: "rotate(180deg)",
                              height: "70px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {technician.name}
                          </div>
                          <div className="text-xs font-bold bg-gray-200 rounded px-1 min-w-[18px] text-center">
                            {getTechnicianTrackNumber(technician.id)}
                          </div>
                        </div>
                      </th>
                    ))}
                    <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                      Status
                    </th>
                    <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                      Sales
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredProjects.map((project, projectIndex) => {
                    const rowBgColor = projectIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
                    const progressStatus = getProgressStatus(project)
                    const sigmaDisplay = getSigmaDisplay(project)
                    const manDaysDisplay = getManDaysDisplay(project)
                    const manDaysStatus = getManDaysStatus(project)
                    const projectStatusDisplay = getProjectStatusDisplay(project)

                    return (
                      <tr key={project.id} className={rowBgColor}>
                        <td className={`px-1 py-1 border-r border-gray-200 font-medium ${rowBgColor}`}>
                          <div
                          
                            className="text-xs font-semibold cursor-pointer hover:bg-blue-50 px-1 py-1 rounded transition-colors"
                            onContextMenu={(e) => handleProjectNameRightClick(e, project.name)}
                            title="Klik kanan untuk shortcut Generate Laporan"
                          >
                            {project.name}
                          </div>
                          <div className="text-[9px] text-gray-500 leading-tight">{project.jobId}</div>
                        </td>

                        <td className={`px-2 py-1 text-center border-r border-gray-200 font-semibold ${rowBgColor}`}>
                          <div className="text-xs font-bold">{sigmaDisplay.display}</div>
                        </td>

                        <td className={`px-2 py-1 text-center border-r border-gray-200 ${rowBgColor}`}>
                          <div
                            className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${progressStatus.bgColor} ${progressStatus.textColor}`}
                          >
                            <span>{progressStatus.display}</span>
                          </div>
                        </td>

                        <td className={`px-2 py-1 text-center border-r border-gray-200 ${rowBgColor}`}>
                          <div
                            className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${manDaysStatus.bgColor} ${manDaysStatus.textColor}`}
                          >
                            <span>{manDaysDisplay.display}</span>
                          </div>
                        </td>

                        <td className={`px-2 py-1 text-center border-r border-gray-200 text-xs ${rowBgColor}`}>
                          {project.jamDatang}
                        </td>

                        <td className={`px-2 py-1 text-center border-r border-gray-200 text-xs ${rowBgColor}`}>
                          {project.jamPulang}
                        </td>

                        {technicians.map((technician) => {
                          const assignment = getCellAssignment(project.id, technician.id)
                          const isSelected = assignment?.isSelected || false
                          const isProjectLeader = assignment?.isProjectLeader || false

                          let cellBgColor = rowBgColor
                          let textColor = "text-gray-900"

                          if (isProjectLeader) {
                            cellBgColor = "bg-red-500"
                            textColor = "text-white"
                          } else if (isSelected) {
                            cellBgColor = "bg-blue-200"
                            textColor = "text-blue-900"
                          }

                          return (
                            <td
                              key={`${project.id}-${technician.id}`}
                              className={`px-1 py-1 text-center border-r border-gray-200 cursor-pointer transition-colors hover:bg-blue-100 ${cellBgColor}`}
                              onClick={() => handleCellClick(project.id, technician.id)}
                              onDoubleClick={() => handleCellDoubleClick(project.id, technician.id)}
                              title={`Single click: assign ${technician.name} | Double click: set as project leader`}
                            >
                              <div
                                className={`h-4 w-4 mx-auto flex items-center justify-center rounded font-bold text-xs ${textColor}`}
                              >
                                {assignment?.initial || ""}
                              </div>
                            </td>
                          )
                        })}

                        <td className={`px-1 py-1 text-center border-r border-gray-200 ${rowBgColor}`}>
                          <div
                            className={`px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${projectStatusDisplay.bgColor} ${projectStatusDisplay.textColor}`}
                            title={
                              project.projectStatus === "pending" && project.pendingReason
                                ? project.pendingReason
                                : projectStatusDisplay.label
                            }
                            onDoubleClick={() => handleStatusDoubleClick(project)}
                          >
                            {project.projectStatus === "pending" && project.pendingReason
                              ? truncateText(project.pendingReason)
                              : projectStatusDisplay.label}
                          </div>
                        </td>
                        <td className={`px-1 py-1 text-center border-r border-gray-200 ${rowBgColor}`}>
                          <div className="px-2 py-1 text-xs font-medium text-gray-700">
                            {project.sales ? truncateText(project.sales, 25) : "-"}
                          </div>
                        </td>
                      </tr>
                    )
                  })}

                  <tr className="bg-blue-50 border-t-2 border-blue-200">
                    <td className="px-1 py-1 border-r border-gray-200 font-medium bg-blue-50">
                      <div className="text-xs font-semibold">Di Kantor</div>
                      <div className="text-[9px] text-gray-500 leading-tight">Teknisi Idle</div>
                    </td>

                    <td className="px-2 py-1 text-center border-r border-gray-200 font-semibold bg-blue-50">
                      <div className="text-xs font-bold">{getIdleTechnicians().length}</div>
                    </td>

                    <td className="px-2 py-1 text-center border-r border-gray-200 bg-blue-50">
                      <div className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        <span>-</span>
                      </div>
                    </td>

                    <td className="px-2 py-1 text-center border-r border-gray-200 bg-blue-50">
                      <div className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        <span>-</span>
                      </div>
                    </td>

                    <td className="px-2 py-1 text-center border-r border-gray-200 text-xs bg-blue-50">-</td>

                    <td className="px-2 py-1 text-center border-r border-gray-200 text-xs bg-blue-50">-</td>

                    {technicians.map((technician) => {
                      const idleTechnicians = getIdleTechnicians()
                      const isIdle = idleTechnicians.some((idle) => idle.id === technician.id)

                      return (
                        <td
                          key={`idle-${technician.id}`}
                          className="px-1 py-1 text-center border-r border-gray-200 bg-blue-50"
                        >
                          <div className="h-4 w-4 mx-auto flex items-center justify-center rounded font-bold text-xs text-gray-700">
                            {isIdle ? technician.initial : ""}
                          </div>
                        </td>
                      )
                    })}

                    <td className="px-1 py-1 text-center border-r border-gray-200 bg-blue-50"></td>
                    <td className="px-1 py-1 text-center border-r border-gray-200 bg-blue-50"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 bg-white p-3 rounded-lg shadow-sm">
            <h3 className="text-sm font-semibold mb-2">Assignment Summary</h3>
            <p className="text-xs text-gray-600">
              Total assignments selected: <span className="font-bold text-blue-600">{getSelectedCount()}</span>
            </p>
          </div>
        </div>
      </main>

      {showProjectShortcut && (
        <div
          ref={shortcutRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 focus:outline-none"
          style={{
            left: `${shortcutPosition.x}px`,
            top: `${shortcutPosition.y}px`,
            minWidth: "150px",
          }}
          tabIndex={-1}
        >
          <Button
            onClick={handleGenerateLaporan}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-3"
            autoFocus
          >
            Generate Laporan
          </Button>
        </div>
      )}

      <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-select" className="flex items-center gap-1">
                Nama Project
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={editProjectForm.projectId}
                onValueChange={(value) => setEditProjectForm((prev) => ({ ...prev, projectId: value }))}
                disabled={editProjectForm.isReadOnlyProject}
              >
                <SelectTrigger className={editProjectForm.isReadOnlyProject ? "bg-gray-100" : ""}>
                  <SelectValue placeholder="Pilih project yang akan diedit" />
                </SelectTrigger>
                <SelectContent>
                  {projectsData.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editProjectForm.isReadOnlyProject && (
                <div className="text-xs text-gray-500">
                  Project dipilih otomatis. Gunakan tombol "Edit Project" di header untuk mengganti project.
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="status-select" className="flex items-center gap-1">
                Ganti Status
                <span className="text-red-500">*</span>
              </Label>
              <Select
                value={editProjectForm.status}
                onValueChange={(value: ProjectStatus) => setEditProjectForm((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger autoFocus={editProjectForm.isReadOnlyProject}>
                  <SelectValue placeholder="Pilih status baru" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Belum Diassign (Abu-abu)</SelectItem>
                  <SelectItem value="ongoing">Berlangsung (Hijau)</SelectItem>
                  <SelectItem value="pending">Pending (Kuning)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editProjectForm.status === "pending" && (
              <div className="grid gap-2">
                <Label htmlFor="pending-reason" className="flex items-center gap-1">
                  Alasan Pending
                  <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="pending-reason"
                  value={editProjectForm.reason}
                  onChange={(e) => setEditProjectForm((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="Masukkan alasan mengapa project di-pending..."
                  className="min-h-[80px] resize-none"
                  maxLength={300}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowEditProject(false)
                    }
                    if (e.key === "Enter" && e.ctrlKey) {
                      handleEditProject()
                    }
                  }}
                />
                <div className="text-xs text-gray-500 text-right">{editProjectForm.reason.length}/300 karakter</div>
                {editProjectForm.reason.trim().length < 5 && editProjectForm.reason.length > 0 && (
                  <div className="text-xs text-red-500">Alasan minimal 5 karakter</div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowEditProject(false)
                setEditProjectForm({
                  projectId: "",
                  status: "unassigned",
                  reason: "",
                  isReadOnlyProject: false,
                })
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setShowEditProject(false)
                }
              }}
            >
              Batal
            </Button>
            <Button
              onClick={handleEditProject}
              disabled={
                !editProjectForm.projectId ||
                !editProjectForm.status ||
                (editProjectForm.status === "pending" && editProjectForm.reason.trim().length < 5)
              }
              className="bg-orange-600 hover:bg-orange-700"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleEditProject()
                }
              }}
            >
              Simpan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateProject} onOpenChange={setShowCreateProject}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <DialogTitle>Buat Project Baru</DialogTitle>
              <div className="flex flex-col items-end gap-2 mr-6">
                <Button
                  onClick={handleCreateProject}
                  disabled={
                    !newProjectForm.namaProject ||
                    !newProjectForm.lokasi ||
                    !newProjectForm.tanggalMulaiProject ||
                    !newProjectForm.tanggalDeadlineProject ||
                    !newProjectForm.sigmaManDays ||
                    !newProjectForm.sigmaHari ||
                    !newProjectForm.sigmaTeknisi ||
                    !newProjectForm.tipeTemplate ||
                    !!dateValidationError
                  }
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  Buat Project
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaProject" className="flex items-center gap-1 min-w-[140px] md:min-w-[140px]">
                Nama Project
                <span className="text-red-500">*</span>
              </Label>
              <div className="flex-1">
                <input
                  id="namaProject"
                  type="text"
                  value={newProjectForm.namaProject}
                  onChange={(e) => setNewProjectForm((prev) => ({ ...prev, namaProject: e.target.value }))}
                  placeholder="Format: NamaBarang_NamaInstansi_Lokasi"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="lokasi" className="flex items-center gap-1 min-w-[140px] md:min-w-[140px]">
                Lokasi
                <span className="text-red-500">*</span>
              </Label>
              <div className="flex-1">
                <input
                  id="lokasi"
                  type="text"
                  value={newProjectForm.lokasi}
                  onChange={(e) => setNewProjectForm((prev) => ({ ...prev, lokasi: e.target.value }))}
                  placeholder="Contoh: Bank Mandiri Darmo"
                  maxLength={140}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                  aria-describedby="lokasi-helper"
                />
                <p id="lokasi-helper" className="text-xs text-gray-500 mt-1">
                  Maksimal 140 karakter ({newProjectForm.lokasi.length}/140)
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaSales" className="min-w-[140px] md:min-w-[140px]">
                Nama Sales
              </Label>
              <div className="flex-1">
                <input
                  id="namaSales"
                  type="text"
                  value={newProjectForm.namaSales}
                  onChange={(e) => setNewProjectForm((prev) => ({ ...prev, namaSales: e.target.value }))}
                  placeholder="Masukkan nama sales"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaPresales" className="min-w-[140px] md:min-w-[140px]">
                Nama Presales
              </Label>
              <div className="flex-1">
                <input
                  id="namaPresales"
                  type="text"
                  value={newProjectForm.namaPresales}
                  onChange={(e) => setNewProjectForm((prev) => ({ ...prev, namaPresales: e.target.value }))}
                  placeholder="Masukkan nama presales"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="tanggalSpkUser" className="min-w-[120px]">
                    Tanggal SPK User
                  </Label>
                  <input
                    id="tanggalSpkUser"
                    type="date"
                    value={newProjectForm.tanggalSpkUser}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, tanggalSpkUser: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="tanggalMulaiProject" className="flex items-center gap-1 min-w-[120px]">
                    Tanggal Mulai Project
                    <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="tanggalMulaiProject"
                    type="date"
                    value={newProjectForm.tanggalMulaiProject}
                    onChange={(e) => {
                      setNewProjectForm((prev) => ({ ...prev, tanggalMulaiProject: e.target.value }))
                      validateDates(e.target.value, newProjectForm.tanggalDeadlineProject)
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="sigmaManDays" className="flex items-center gap-1 min-w-[120px]">
                    Sigma Man Days
                    <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="sigmaManDays"
                    type="number"
                    min="0"
                    value={newProjectForm.sigmaManDays}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, sigmaManDays: e.target.value }))}
                    placeholder="Masukkan target man days"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="sigmaTeknisi" className="flex items-center gap-1 min-w-[120px]">
                    Sigma Teknisi
                    <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="sigmaTeknisi"
                    type="number"
                    min="0"
                    value={newProjectForm.sigmaTeknisi}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, sigmaTeknisi: e.target.value }))}
                    placeholder="Masukkan jumlah teknisi"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="tanggalTerimaPo" className="min-w-[120px]">
                    Tanggal Terima PO
                  </Label>
                  <input
                    id="tanggalTerimaPo"
                    type="date"
                    value={newProjectForm.tanggalTerimaPo}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, tanggalTerimaPo: e.target.value }))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <Label htmlFor="tanggalDeadlineProject" className="flex items-center gap-1 min-w-[120px] md:mt-2">
                    Tanggal Deadline Project
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex-1">
                    <input
                      id="tanggalDeadlineProject"
                      type="date"
                      value={newProjectForm.tanggalDeadlineProject}
                      onChange={(e) => {
                        setNewProjectForm((prev) => ({ ...prev, tanggalDeadlineProject: e.target.value }))
                        validateDates(newProjectForm.tanggalMulaiProject, e.target.value)
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                        dateValidationError ? "border-red-500" : "border-input"
                      }`}
                      required
                    />
                    {dateValidationError && <p className="text-xs text-red-500 mt-1">{dateValidationError}</p>}
                  </div>
                </div>

                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="sigmaHari" className="flex items-center gap-1 min-w-[120px]">
                    Sigma Hari
                    <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="sigmaHari"
                    type="number"
                    min="0"
                    value={newProjectForm.sigmaHari}
                    onChange={(e) => setNewProjectForm((prev) => ({ ...prev, sigmaHari: e.target.value }))}
                    placeholder="Masukkan durasi project (hari)"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <Label htmlFor="tipeTemplate" className="flex items-center gap-1 min-w-[120px] md:mt-2">
                    Tipe Template
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex-1">
                    <select
                      id="tipeTemplate"
                      value={newProjectForm.tipeTemplate}
                      onChange={(e) => {
                        setNewProjectForm((prev) => ({ ...prev, tipeTemplate: e.target.value }))
                        if (e.target.value) {
                          setTipeTemplateError("")
                        }
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                        tipeTemplateError ? "border-red-500" : "border-input"
                      }`}
                      required
                    >
                      <option value="" disabled>
                        Pilih Tipe Template
                      </option>
                      <option value="Template BCA">Template BCA</option>
                      <option value="Template Mandiri">Template Mandiri</option>
                      <option value="Template BNI">Template BNI</option>
                    </select>
                    {tipeTemplateError && <p className="text-xs text-red-500 mt-1">{tipeTemplateError}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showProjectSuccess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Projek Baru Telah Selesai Dibuat</h3>
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
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Assignment Berhasil Disimpan!</h3>
              <p className="text-lg text-gray-600 mb-6">
                {getSelectedCount()} assignment teknisi telah berhasil disimpan ke sistem.
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
  )
}
