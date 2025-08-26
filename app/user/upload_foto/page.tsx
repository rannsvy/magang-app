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
  { id: "1", name: "Fisik", requiresSerialNumber: false },
  { id: "2", name: "S/N CCTV 1", requiresSerialNumber: true },
  { id: "3", name: "S/N CCTV 2", requiresSerialNumber: true },
  { id: "4", name: "Instalasi", requiresSerialNumber: false },
  { id: "5", name: "Kabel", requiresSerialNumber: false },
  { id: "6", name: "DVR", requiresSerialNumber: true },
  { id: "7", name: "Monitor", requiresSerialNumber: false },
  { id: "8", name: "Dokumentasi", requiresSerialNumber: false },
]

export default function UploadFotoPage() {
  const [categories, setCategories] = useState<PhotoCategory[]>(mockCategories)
  const [currentPage, setCurrentPage] = useState(1)
  const router = useRouter()
  const searchParams = useSearchParams()
  const jobId = searchParams.get("job")

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({})
  const categoriesPerPage = 6

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
                    ref={(el) => (fileInputRefs.current[category.id] = el)}
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
