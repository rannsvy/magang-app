"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AdminHeader } from "@/components/admin-header"
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
} from "lucide-react"

interface GenerateForm {
  projectName: string
  jobId: string
}

interface PhotoCategory {
  id: string
  name: string
  photos: string[]
  currentIndex: number
}

interface ReportPreview {
  jobName: string
  technicianName: string
  location: string
  completedDate: string
  photoCategories: PhotoCategory[]
  serialNumbers: { [key: string]: string }
  notes: string
}

interface HoverOverlayState {
  isOpen: boolean
  categoryId: string
  photoIndex: number
  isLoading: boolean
  hasError: boolean
}

const projects = [
  { id: "pemasangan-cctv", name: "Pemasangan CCTV" },
  { id: "maintenance-server", name: "Maintenance Server" },
  { id: "instalasi-wifi", name: "Instalasi WiFi" },
  { id: "perbaikan-router", name: "Perbaikan Router" },
  { id: "setup-jaringan", name: "Setup Jaringan" },
]

const jobs = [
  {
    id: "CCTV_Mandiri_Darmo",
    name: "CCTV_Mandiri_Darmo",
    projectId: "pemasangan-cctv",
    location: "Bank Mandiri Darmo",
    displayName: "Mandiri_Darmo",
  },
  {
    id: "CCTV_BNI_Pakis",
    name: "CCTV_BNI_Pakis",
    projectId: "pemasangan-cctv",
    location: "Bank BNI Pakis",
    displayName: "BNI_Pakis",
  },
  {
    id: "CCTV_BCA_Tunjungan",
    name: "CCTV_BCA_Tunjungan",
    projectId: "pemasangan-cctv",
    location: "Bank BCA Tunjungan",
    displayName: "BCA_Tunjungan",
  },
  {
    id: "Server_Telkom_Surabaya",
    name: "Server_Telkom_Surabaya",
    projectId: "maintenance-server",
    location: "PT Telkom Surabaya",
    displayName: "Telkom_Surabaya",
  },
  {
    id: "Server_Indosat_Malang",
    name: "Server_Indosat_Malang",
    projectId: "maintenance-server",
    location: "PT Indosat Malang",
    displayName: "Indosat_Malang",
  },
  {
    id: "WiFi_Unair_Kampus",
    name: "WiFi_Unair_Kampus",
    projectId: "instalasi-wifi",
    location: "Universitas Airlangga",
    displayName: "Unair_Kampus",
  },
  {
    id: "WiFi_ITS_Sukolilo",
    name: "WiFi_ITS_Sukolilo",
    projectId: "instalasi-wifi",
    location: "Institut Teknologi Sepuluh Nopember",
    displayName: "ITS_Sukolilo",
  },
  {
    id: "Router_Warnet_Gubeng",
    name: "Router_Warnet_Gubeng",
    projectId: "perbaikan-router",
    location: "Warnet Cyber Gubeng",
    displayName: "Warnet_Gubeng",
  },
  {
    id: "Jaringan_Pemkot_Surabaya",
    name: "Jaringan_Pemkot_Surabaya",
    projectId: "setup-jaringan",
    location: "Pemkot Surabaya",
    displayName: "Pemkot_Surabaya",
  },
]

const getSerialNumberForCategory = (categoryId: string, serialNumbers: { [key: string]: string }) => {
  // Map category IDs to serial number keys
  const categoryToSnMap: { [key: string]: string } = {
    "cctv-1": "Device 1",
    "cctv-2": "Device 2",
    "cctv-3": "Device 1",
    "cctv-4": "Device 2",
    "cctv-5": "Device 1",
    "dvr-nvr": "Main Unit",
    "network-switch": "Main Unit",
    "power-supply": "Device 2",
    "monitor-display": "Main Unit",
  }

  const snKey = categoryToSnMap[categoryId]
  return snKey ? serialNumbers[snKey] : null
}

const truncateSerialNumber = (sn: string, maxLength = 12) => {
  if (sn.length <= maxLength) return sn
  return sn.substring(0, maxLength) + "..."
}

export default function GenerateLaporanPage() {
  const searchParams = useSearchParams()
  const projectParam = searchParams.get("project")

  const [formData, setFormData] = useState<GenerateForm>({
    projectName: "",
    jobId: "",
  })
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentGridPage, setCurrentGridPage] = useState(0)
  const [showPreview, setShowPreview] = useState(false)

  const [hoverOverlay, setHoverOverlay] = useState<{
    isOpen: boolean
    categoryId: string
    photoIndex: number
    isLoading: boolean
    hasError: boolean
  }>({
    isOpen: false,
    categoryId: "",
    photoIndex: 0,
    isLoading: false,
    hasError: false,
  })

  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null)

  const getProjectIdFromName = (displayName: string): string => {
    const projectMap: { [key: string]: string } = {
      "Pemasangan CCTV": "pemasangan-cctv",
      "Maintenance Server": "maintenance-server",
      "Instalasi WiFi": "instalasi-wifi",
      "Perbaikan Router": "perbaikan-router",
      "Setup Jaringan": "setup-jaringan",
    }
    return projectMap[displayName] || ""
  }

  useEffect(() => {
    const projectParam = searchParams.get("project")
    if (projectParam && !formData.projectName) {
      const decodedProjectName = decodeURIComponent(projectParam)
      const projectId = getProjectIdFromName(decodedProjectName)

      if (projectId) {
        setFormData((prev) => ({
          ...prev,
          projectName: projectId,
        }))
      }
    }
  }, [searchParams, formData.projectName])

  useEffect(() => {
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hoverOverlay.isOpen) {
        hideHoverOverlay()
      }
    }

    document.addEventListener("keydown", handleEscapeKey)
    return () => document.removeEventListener("keydown", handleEscapeKey)
  }, [hoverOverlay.isOpen])

  useEffect(() => {
    return () => {
      if (hoverTimeout) {
        clearTimeout(hoverTimeout)
      }
    }
  }, [hoverTimeout])

  const handleInputChange = (field: keyof GenerateForm, value: string) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value }
      if (field === "projectName") {
        newData.jobId = ""
      }
      return newData
    })
  }

  const getFilteredJobs = () => {
    if (!formData.projectName) return []
    return jobs.filter((job) => job.projectId === formData.projectName)
  }

  const isFormValid = () => {
    return formData.projectName && formData.jobId
  }

  const handleGenerate = async () => {
    if (!isFormValid()) {
      alert("Mohon lengkapi semua field")
      return
    }

    setIsGenerating(true)

    setTimeout(() => {
      const selectedJob = jobs.find((job) => job.id === formData.jobId)

      const mockPreview: ReportPreview = {
        jobName: selectedJob?.name || "",
        technicianName: "Ahmad Teknisi",
        location: selectedJob?.location || "",
        completedDate: "2024-01-15",
        photoCategories: [
          {
            id: "fisik",
            name: "Fisik",
            photos: ["/cctv-installation.png", "/placeholder-n2tdv.png", "/surveillance-camera-housing.png"],
            currentIndex: 0,
          },
          {
            id: "serial-number",
            name: "Serial Number",
            photos: ["/placeholder-ma1ip.png", "/placeholder-wmmhg.png"],
            currentIndex: 0,
          },
          {
            id: "cctv-1",
            name: "CCTV 1",
            photos: [
              "/cctv-camera-view-1.png",
              "/security-camera-monitoring.png",
              "/placeholder-p8oau.png",
              "/cctv-night-vision-test.png",
            ],
            currentIndex: 0,
          },
          {
            id: "cctv-2",
            name: "CCTV 2",
            photos: ["/placeholder-glk0s.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "instalasi-camera-1",
            name: "Instalasi Camera 1",
            photos: [
              "/placeholder.svg?height=200&width=300",
              "/placeholder.svg?height=200&width=300",
              "/placeholder.svg?height=200&width=300",
            ],
            currentIndex: 0,
          },
          {
            id: "instalasi-camera-2",
            name: "Instalasi Camera 2",
            photos: ["/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "kabel-management",
            name: "Kabel Management",
            photos: [
              "/placeholder.svg?height=200&width=300",
              "/placeholder.svg?height=200&width=300",
              "/placeholder.svg?height=200&width=300",
            ],
            currentIndex: 0,
          },
          {
            id: "testing",
            name: "Testing",
            photos: ["/placeholder.svg?height=200&width=300", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "dokumentasi-final",
            name: "Dokumentasi Final",
            photos: [
              "/placeholder.svg?height=200&width=300",
              "/placeholder.svg?height=200&width=300",
              "/placeholder.svg?height=200&width=300",
            ],
            currentIndex: 0,
          },
          {
            id: "sertifikat",
            name: "Sertifikat",
            photos: ["/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "manual-book",
            name: "Manual Book",
            photos: ["/placeholder.svg?height=200&width=300", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "warranty",
            name: "Warranty",
            photos: ["/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "cctv-3",
            name: "CCTV 3",
            photos: ["/cctv-camera-3.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "cctv-4",
            name: "CCTV 4",
            photos: ["/cctv-camera-4.png"],
            currentIndex: 0,
          },
          {
            id: "cctv-5",
            name: "CCTV 5",
            photos: ["/cctv-camera-5.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "instalasi-camera-3",
            name: "Instalasi Camera 3",
            photos: ["/camera-installation-3.png"],
            currentIndex: 0,
          },
          {
            id: "instalasi-camera-4",
            name: "Instalasi Camera 4",
            photos: ["/camera-installation-4.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "power-supply",
            name: "Power Supply",
            photos: ["/power-supply-unit.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "network-switch",
            name: "Network Switch",
            photos: ["/network-switch.png"],
            currentIndex: 0,
          },
          {
            id: "dvr-nvr",
            name: "DVR/NVR",
            photos: ["/dvr-nvr-recorder.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "monitor-display",
            name: "Monitor Display",
            photos: ["/security-monitor-display.png"],
            currentIndex: 0,
          },
          {
            id: "konfigurasi-sistem",
            name: "Konfigurasi Sistem",
            photos: ["/system-configuration.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "testing-koneksi",
            name: "Testing Koneksi",
            photos: ["/connection-testing.png"],
            currentIndex: 0,
          },
          {
            id: "testing-rekaman",
            name: "Testing Rekaman",
            photos: ["/recording-test.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "testing-playback",
            name: "Testing Playback",
            photos: ["/playback-test.png"],
            currentIndex: 0,
          },
          {
            id: "user-training",
            name: "User Training",
            photos: ["/user-training-session.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "handover-dokumen",
            name: "Handover Dokumen",
            photos: ["/placeholder-hom1f.png"],
            currentIndex: 0,
          },
          {
            id: "cleaning-area",
            name: "Cleaning Area",
            photos: ["/cleaning-work-area.png", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "backup-konfigurasi",
            name: "Backup Konfigurasi",
            photos: ["/placeholder.svg?height=200&width=300", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
          {
            id: "label-perangkat",
            name: "Label Perangkat",
            photos: ["/placeholder.svg?height=200&width=300", "/placeholder.svg?height=200&width=300"],
            currentIndex: 0,
          },
        ],
        serialNumbers: {
          "Device 1": "SN001234567",
          "Device 2": "SN001234568",
          "Main Unit": "MU987654321",
        },
        notes:
          "Pekerjaan telah selesai dilakukan dengan baik. Semua perangkat berfungsi normal dan sudah terhubung ke sistem. Lokasi pemasangan strategis sesuai dengan kebutuhan.",
      }

      setReportPreview(mockPreview)
      setIsGenerating(false)
      setCurrentGridPage(0)
      setShowPreview(true)
    }, 2000)
  }

  const handleCarouselNavigation = (categoryId: string, direction: "prev" | "next") => {
    if (!reportPreview) return

    setReportPreview((prev) => {
      if (!prev) return prev

      const updatedCategories = prev.photoCategories.map((category) => {
        if (category.id === categoryId && category.photos.length > 0) {
          const maxIndex = category.photos.length - 1
          let newIndex = category.currentIndex

          if (direction === "next") {
            newIndex = newIndex >= maxIndex ? 0 : newIndex + 1
          } else if (direction === "prev") {
            newIndex = newIndex <= 0 ? maxIndex : newIndex - 1
          }

          if (hoverOverlay.isOpen && hoverOverlay.categoryId === categoryId) {
            setHoverOverlay((overlayPrev) => ({
              ...overlayPrev,
              photoIndex: newIndex,
              isLoading: true,
              hasError: false,
            }))

            setTimeout(() => {
              setHoverOverlay((overlayPrev) => ({ ...overlayPrev, isLoading: false }))
            }, 150)
          }

          return { ...category, currentIndex: newIndex }
        }
        return category
      })

      return { ...prev, photoCategories: updatedCategories }
    })
  }

  const showHoverOverlay = (categoryId: string) => {
    const category = reportPreview?.photoCategories.find((cat) => cat.id === categoryId)
    if (!category || category.photos.length === 0) return

    setHoverOverlay({
      isOpen: true,
      categoryId,
      photoIndex: category.currentIndex,
      isLoading: true,
      hasError: false,
    })

    setTimeout(() => {
      setHoverOverlay((prev) => ({ ...prev, isLoading: false }))
    }, 200)
  }

  const hideHoverOverlay = () => {
    setHoverOverlay((prev) => ({ ...prev, isOpen: false }))
  }

  const handleImageHoverEnter = (categoryId: string) => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
    }

    const delay = 1000 // 1 second delay for all photo categories

    const timeout = setTimeout(() => {
      showHoverOverlay(categoryId)
    }, delay)

    setHoverTimeout(timeout)
  }

  const handleImageHoverLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      setHoverTimeout(null)
    }
  }

  const handleArrowClick = (e: React.MouseEvent, categoryId: string, direction: "prev" | "next") => {
    e.stopPropagation()
    e.preventDefault()
    handleCarouselNavigation(categoryId, direction)
  }

  const handleImageClick = (categoryId: string) => {
    if (hoverOverlay.isOpen && hoverOverlay.categoryId === categoryId) {
      hideHoverOverlay()
    } else {
      showHoverOverlay(categoryId)
    }
  }

  const getCurrentOverlayPhoto = () => {
    const category = reportPreview?.photoCategories.find((cat) => cat.id === hoverOverlay.categoryId)
    return category?.photos[hoverOverlay.photoIndex] || ""
  }

  const getCurrentOverlayCategory = () => {
    return reportPreview?.photoCategories.find((cat) => cat.id === hoverOverlay.categoryId)
  }

  const handleDownloadReport = () => {
    alert("Download report functionality is not implemented yet.")
  }

  const itemsPerPage = 20
  const totalPages = reportPreview ? Math.ceil(reportPreview.photoCategories.length / itemsPerPage) : 0

  const getCurrentPageItems = () => {
    if (!reportPreview) return []
    const startIndex = currentGridPage * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return reportPreview.photoCategories.slice(startIndex, endIndex)
  }

  const handleGridNavigation = (direction: "prev" | "next") => {
    if (direction === "next" && currentGridPage < totalPages - 1) {
      setCurrentGridPage((prev) => prev + 1)
    } else if (direction === "prev" && currentGridPage > 0) {
      setCurrentGridPage((prev) => prev - 1)
    }
  }

  const handleBackToForm = () => {
    setShowPreview(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {!showPreview ? (
        <AdminHeader title="Generate Laporan" showBackButton={true} backUrl="/admin/dashboard" />
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
              <h1 className="text-2xl font-bold text-gray-900">Generate Laporan</h1>
            </div>
            <Button onClick={handleBackToForm} variant="outline" className="flex items-center gap-2 bg-transparent">
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
                        onValueChange={(value) => handleInputChange("projectName", value)}
                      >
                        <SelectTrigger className="text-lg py-3">
                          <SelectValue placeholder="Pilih nama project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.id} value={project.id} className="text-lg">
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="job" className="text-lg font-medium">
                        ID Pekerjaan *
                      </Label>
                      <Select
                        value={formData.jobId}
                        onValueChange={(value) => handleInputChange("jobId", value)}
                        disabled={!formData.projectName}
                      >
                        <SelectTrigger className="text-lg py-3">
                          <SelectValue
                            placeholder={
                              formData.projectName ? "Pilih ID pekerjaan" : "Pilih nama project terlebih dahulu"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {getFilteredJobs().map((job) => (
                            <SelectItem key={job.id} value={job.id} className="text-lg">
                              {job.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

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
                      <p className="text-lg">Pilih data dan klik Generate untuk melihat preview laporan</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                <div className="xl:col-span-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Detail Pekerjaan</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-bold text-lg text-gray-900 mb-1">{reportPreview?.jobName}</h4>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">Teknisi</h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2" />
                          {reportPreview?.technicianName}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">Tanggal</h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          {reportPreview?.completedDate}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">Lokasi</h5>
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
                            {currentGridPage + 1}/{totalPages}
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
                            ? getSerialNumberForCategory(category.id, reportPreview.serialNumbers)
                            : null

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
                                      onMouseEnter={() => handleImageHoverEnter(category.id)}
                                      onMouseLeave={handleImageHoverLeave}
                                      onClick={() => handleImageClick(category.id)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault()
                                          handleImageClick(category.id)
                                        }
                                      }}
                                      tabIndex={0}
                                      role="button"
                                      aria-label={`View ${category.name} photos`}
                                    >
                                      <img
                                        src={category.photos[category.currentIndex] || "/placeholder.svg"}
                                        alt={`${category.name} ${category.currentIndex + 1}`}
                                        className="w-full h-full object-cover transition-opacity hover:opacity-90"
                                      />
                                    </div>

                                    {category.photos.length > 1 && (
                                      <>
                                        {/* Left Control Zone */}
                                        <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center z-10">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => handleArrowClick(e, category.id, "prev")}
                                            onMouseEnter={(e) => e.stopPropagation()}
                                            onMouseLeave={(e) => e.stopPropagation()}
                                            className="h-7 w-7 p-0 bg-black/30 hover:bg-black/50 text-white rounded-full pointer-events-auto"
                                            tabIndex={0}
                                            aria-label={`Previous ${category.name} photo`}
                                          >
                                            <ChevronLeft className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        {/* Right Control Zone */}
                                        <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center z-10">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => handleArrowClick(e, category.id, "next")}
                                            onMouseEnter={(e) => e.stopPropagation()}
                                            onMouseLeave={(e) => e.stopPropagation()}
                                            className="h-7 w-7 p-0 bg-black/30 hover:bg-black/50 text-white rounded-full pointer-events-auto"
                                            tabIndex={0}
                                            aria-label={`Next ${category.name} photo`}
                                          >
                                            <ChevronRight className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </>
                                    )}

                                    {/* Photo counter */}
                                    {category.photos.length > 1 && (
                                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none z-5">
                                        {category.currentIndex + 1}/{category.photos.length}
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
                                      SN: {truncateSerialNumber(serialNumber, 8)}
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
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="sticky bottom-0 z-30 bg-white border-t p-4 shadow-lg">
                <div className="max-w-7xl mx-auto">
                  <Button onClick={handleDownloadReport} className="w-full bg-blue-600 hover:bg-blue-700 text-lg py-3">
                    <Download className="h-5 w-5 mr-2" />
                    Finalisasi & Download Laporan PDF
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {hoverOverlay.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center"
          onClick={hideHoverOverlay}
        >
          <div className="relative max-w-4xl max-h-[80vh] p-4">
            {/* Close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={hideHoverOverlay}
              className="absolute top-2 right-2 z-10 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>

            {/* Image container */}
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
                      setHoverOverlay((prev) => ({ ...prev, isLoading: true, hasError: false }))
                      setTimeout(() => {
                        setHoverOverlay((prev) => ({ ...prev, isLoading: false }))
                      }, 200)
                    }}
                  >
                    Coba Lagi
                  </Button>
                </div>
              ) : (
                <>
                  <img
                    src={getCurrentOverlayPhoto() || "/placeholder.svg"}
                    alt={`${getCurrentOverlayCategory()?.name} ${hoverOverlay.photoIndex + 1}`}
                    className="max-w-full max-h-[70vh] object-contain"
                    onError={() => setHoverOverlay((prev) => ({ ...prev, hasError: true, isLoading: false }))}
                  />

                  {/* Caption */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                    <p className="text-white text-sm font-medium">
                      {getCurrentOverlayCategory()?.name} — {hoverOverlay.photoIndex + 1}/
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
  )
}
