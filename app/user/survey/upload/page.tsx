"use client"

import type React from "react"

import { useState, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TechnicianHeader } from "@/components/technician-header"
import { Camera, X } from "lucide-react"

interface SurveyPhoto {
  id: string
  file?: File
  preview?: string
  category: string
  measureValue?: string
  measureUnit: string
  status: "empty" | "captured" | "uploaded"
}

const photoCategories = ["Panjang Ruangan", "Lebar Ruangan", "Sudut Ruangan", "Dokumentasi Umum"]

export default function SurveyUpload() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roomId = searchParams.get("roomId")
  const floorId = searchParams.get("floorId")
  const jobId = searchParams.get("jobId")
  const roomName = searchParams.get("roomName") || roomId?.replace("room-", "Room ") || "Unknown Room"

  const [photos, setPhotos] = useState<SurveyPhoto[]>(
    Array.from({ length: 10 }, (_, i) => ({
      id: `photo-${i + 1}`,
      category: "",
      measureUnit: "m",
      status: "empty",
    })),
  )

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleCameraClick = (index: number) => {
    fileInputRefs.current[index]?.click()
  }

  const handleFileChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const preview = URL.createObjectURL(file)
      setPhotos((prev) =>
        prev.map((photo, i) => (i === index ? { ...photo, file, preview, status: "captured" as const } : photo)),
      )
    }
  }

  const handleCategoryChange = (index: number, category: string) => {
    setPhotos((prev) => prev.map((photo, i) => (i === index ? { ...photo, category } : photo)))
  }

  const handleMeasureValueChange = (index: number, value: string) => {
    setPhotos((prev) => prev.map((photo, i) => (i === index ? { ...photo, measureValue: value } : photo)))
  }

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) =>
      prev.map((photo, i) =>
        i === index
          ? { ...photo, file: undefined, preview: undefined, status: "empty" as const, category: "", measureValue: "" }
          : photo,
      ),
    )
  }

  const getCategoryStyles = (status: string) => {
    switch (status) {
      case "empty":
        return "bg-gray-100 border-gray-300 text-gray-500"
      case "captured":
        return "bg-red-50 border-red-300 text-red-600"
      case "uploaded":
        return "bg-green-50 border-green-300 text-green-600"
      default:
        return "bg-gray-100 border-gray-300 text-gray-500"
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title={`Upload Foto - ${roomName}`}
        showBackButton={true}
        backUrl={`/user/survey/floors?jobId=${jobId}`}
      />

      <main className="p-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-1 mb-4">
            {photos.map((photo, index) => {
              const styles = getCategoryStyles(photo.status)

              return (
                <div key={photo.id} className="space-y-1">
                  <Card className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[130px] mx-auto`}>
                    <CardContent
                      className="p-1 flex items-center justify-center h-[80px] w-[120px] relative"
                      onClick={() => handleCameraClick(index)}
                    >
                      {photo.preview ? (
                        <>
                          <img
                            src={photo.preview || "/placeholder.svg"}
                            alt={`Foto ${index + 1}`}
                            className="max-w-full max-h-full object-contain rounded"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemovePhoto(index)
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <p className="text-xs font-medium text-center text-gray-700 px-1">Foto {index + 1}</p>

                  {photo.status === "captured" && (
                    <div className="space-y-1">
                      <Label htmlFor={`category-${photo.id}`} className="text-xs text-gray-600">
                        Kategori *
                      </Label>
                      <Select value={photo.category} onValueChange={(value) => handleCategoryChange(index, value)}>
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Pilih Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {photoCategories.map((category) => (
                            <SelectItem key={category} value={category} className="text-sm">
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {(photo.category === "Panjang Ruangan" || photo.category === "Lebar Ruangan") && (
                        <div className="space-y-1">
                          <Label htmlFor={`measure-${photo.id}`} className="text-xs text-gray-600">
                            Nilai Ukur (m) *
                          </Label>
                          <Input
                            id={`measure-${photo.id}`}
                            type="number"
                            placeholder="Masukkan nilai"
                            value={photo.measureValue || ""}
                            onChange={(e) => handleMeasureValueChange(index, e.target.value)}
                            className="text-sm"
                            min="0"
                            step="0.1"
                            required
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {photo.status === "uploaded" && (
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div className="font-medium">{photo.category}</div>
                      {photo.measureValue && (
                        <div>
                          Nilai: {photo.measureValue} {photo.measureUnit}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hidden file input for camera */}
                  <input
                    ref={(el) => {
                    fileInputRefs.current[index] = el
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFileChange(index, e)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
