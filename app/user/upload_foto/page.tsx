"use client"

import type React from "react"

import { useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { TechnicianHeader } from "@/components/technician-header"
import { Pagination } from "@/components/pagination"
import { Camera } from "lucide-react"

interface PhotoCategory {
  id: string
  name: string
  requiresSerialNumber: boolean
  photo?: string
  serialNumber?: string
}

// Mock categories for demonstration
const mockCategories: PhotoCategory[] = [
  { id: "1", name: "Fisik CCTV", requiresSerialNumber: false },
  { id: "2", name: "Foto Terpasang CCTV 1", requiresSerialNumber: false },
  { id: "3", name: "S/N CCTV 1", requiresSerialNumber: true },
  { id: "4", name: "Foto Terpasang CCTV 2", requiresSerialNumber: false },
  { id: "5", name: "S/N CCTV 2", requiresSerialNumber: true },
  { id: "6", name: "Foto Terpasang CCTV 3", requiresSerialNumber: false },
  { id: "7", name: "S/N CCTV 3", requiresSerialNumber: true },
  { id: "8", name: "Foto Terpasang CCTV 4", requiresSerialNumber: false },
  { id: "9", name: "S/N CCTV 4", requiresSerialNumber: true},
  { id: "10", name: "Fisik Switch", requiresSerialNumber: false },
  { id: "11", name: "S/N Switch", requiresSerialNumber: true },
  { id: "12", name: "Foto Terpasang Switch", requiresSerialNumber: false },
  { id: "13", name: "Fisik NVR", requiresSerialNumber: false },
  { id: "14", name: "S/N NVR", requiresSerialNumber: true },
  { id: "15", name: "NVR Terpasang", requiresSerialNumber: false },
  { id: "16", name: "Fisik Router", requiresSerialNumber: false },
  { id: "17", name: "S/N Router", requiresSerialNumber: true },
  { id: "18", name: "Router Terpasang", requiresSerialNumber: false },
  { id: "19", name: "Fisik Monitor", requiresSerialNumber: false },
  { id: "20", name: "S/N Monitor", requiresSerialNumber: true },
  { id: "21", name: "Monitor Terpasang", requiresSerialNumber: false },
  { id: "22", name: "Fisik Hard Disk", requiresSerialNumber: false },
  { id: "23", name: "S/N Hard Disk", requiresSerialNumber: true },
  { id: "24", name: "Hard Disk Terpasang", requiresSerialNumber: false },
  { id: "25", name: "Foto Fisik Connector RJ 45", requiresSerialNumber: false },
  { id: "26", name: "RJ 45 Terpasang", requiresSerialNumber: false },
  { id: "27", name: "Fisik LAN SFTP", requiresSerialNumber: false },
  { id: "28", name: "Kabel Cam 1 (Before)", requiresSerialNumber: false },
  { id: "29", name: "Kabel Cam 1 (After)", requiresSerialNumber: false },
  { id: "30", name: "Kabel Cam 2 (Before)", requiresSerialNumber: false },
  { id: "31", name: "Kabel Cam 2 (After)", requiresSerialNumber: false },
  { id: "32", name: "Kabel Cam 3 (Before)", requiresSerialNumber: false },
  { id: "33", name: "Kabel Cam 3 (After)", requiresSerialNumber: false },
  { id: "34", name: "Kabel Cam 4 (Before)", requiresSerialNumber: false },
  { id: "35", name: "Kabel Cam 4 (After)", requiresSerialNumber: false },
  { id: "36", name: "Fisik Kabel NYM", requiresSerialNumber: false },
  { id: "37", name: "Kabel NYM Terpasang", requiresSerialNumber: false },
  { id: "38", name: "Fisik Duradus Masko", requiresSerialNumber: false },
  { id: "39", name: "Duradus Masko Terpasang", requiresSerialNumber: false },
  { id: "40", name: "Fisik Box Panel Outdoor", requiresSerialNumber: true },
  { id: "41", name: "Box Panel Terpasang", requiresSerialNumber: false },
  { id: "42", name: "Fisik Steker Arde Uticon", requiresSerialNumber: false },
  { id: "43", name: "Steker Terpasang", requiresSerialNumber: false },
  { id: "44", name: "Fisik Stop Kontak Outbow", requiresSerialNumber: false },
  { id: "45", name: "Stop Kontak Terpasang", requiresSerialNumber: false },
  { id: "46", name: "Fisik Kabel Twisted", requiresSerialNumber: false },
  { id: "47", name: "Kabel Twisted Terpasang", requiresSerialNumber: false },
  { id: "49", name: "Foto Proses Instalasi Cam 1", requiresSerialNumber: false },
  { id: "50", name: "Foto Proses Instalasi Cam 2", requiresSerialNumber: false },
  { id: "51", name: "Foto Proses Instalasi Cam 3", requiresSerialNumber: false },
  { id: "52", name: "Foto Proses Instalasi Cam 4", requiresSerialNumber: false },
  { id: "53", name: "View Keseluruhan", requiresSerialNumber: false },
  { id: "54", name: "Pelatihan", requiresSerialNumber: false },
 
]

export default function UploadFotoPage() {
  const [categories, setCategories] = useState<PhotoCategory[]>(mockCategories)
  const [currentPage, setCurrentPage] = useState(1)
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("job")

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const categoriesPerPage = 8

  const totalPages = Math.ceil(categories.length / categoriesPerPage)
  const startIndex = (currentPage - 1) * categoriesPerPage
  const currentCategories = categories.slice(startIndex, startIndex + categoriesPerPage)

  const getCategoryStatus = (category: PhotoCategory) => {
    if (!category.photo) return "empty"
    if (category.requiresSerialNumber && !category.serialNumber) return "incomplete"
    return "complete"
  }

  const getCategoryStyles = (status: string) => {
    switch (status) {
      case "empty":
        return "bg-gray-100 border-gray-300 text-gray-500"
      case "pending":
        return "bg-yellow-50 border-yellow-300 text-yellow-600"
      case "incomplete":
        return "bg-red-50 border-red-300 text-red-600"
      case "complete":
        return "bg-green-50 border-green-300 text-green-600"
      default:
        return "bg-gray-100 border-gray-300 text-gray-500"
    }
  }

  const handleCameraClick = (categoryId: string) => {
    const input = fileInputRefs.current[categoryId]
    if (input) {
      input.click()
    }
  }

  const handlePhotoCapture = (categoryId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const photoUrl = e.target?.result as string
        setCategories((prev) => prev.map((cat) => (cat.id === categoryId ? { ...cat, photo: photoUrl } : cat)))
        // Auto-upload to server if online, or queue for later if offline
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSerialNumberChange = (categoryId: string, value: string) => {
    setCategories((prev) => prev.map((cat) => (cat.id === categoryId ? { ...cat, serialNumber: value } : cat)))
  }

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader title={`Upload Foto - Job #${jobId}`} showBackButton={true} backUrl="/user/dashboard" />

      {/* Main Content */}
      <main className="p-4">
        <div className="max-w-4xl mx-auto">
          {/* Categories Grid */}
          <div className="grid grid-cols-2 gap-1 mb-4">
            {currentCategories.map((category) => {
              const status = getCategoryStatus(category)
              const styles = getCategoryStyles(status)

              return (
                <div key={category.id} className="space-y-1">
                  <Card className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[130px] mx-auto`}>
                    <CardContent
                      className="p-1 flex items-center justify-center h-[80px] w-[120px] relative"
                      onClick={() => handleCameraClick(category.id)}
                    >
                      {category.photo ? (
                        <img
                          src={category.photo || "/placeholder.svg"}
                          alt={category.name}
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <p className="text-xs font-medium text-center text-gray-700 px-1">{category.name}</p>

                  {/* Serial Number Input */}
                  {category.requiresSerialNumber && category.photo && (
                    <div className="space-y-1">
                      <Label htmlFor={`sn-${category.id}`} className="text-xs text-gray-600">
                        Serial Number *
                      </Label>
                      <Input
                        id={`sn-${category.id}`}
                        type="text"
                        placeholder="Masukkan SN"
                        value={category.serialNumber || ""}
                        onChange={(e) => handleSerialNumberChange(category.id, e.target.value)}
                        className="text-sm"
                        required
                      />
                    </div>
                  )}

                  {/* Hidden file input for camera */}
                  <input
                     ref={(el) => { fileInputRefs.current[category.id] = el; }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoCapture(category.id, e)}
                  />
                </div>
              )
            })}
          </div>

          <div className="mb-6">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
