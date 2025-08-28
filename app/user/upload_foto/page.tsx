"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { TechnicianHeader } from "@/components/technician-header"
import { Pagination } from "@/components/pagination"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { type OcrInfo, type OCRPhase, recognizeSerialNumber, recognizeCableMeters } from "@/lib/ocr"



/* ================= Types lokal ================= */

interface PhotoCategory {
  id: string
  name: string
  requiresSerialNumber: boolean
  photo?: string
  serialNumber?: string
  snDraft?: string
  meter?: number
}

/* ================= Data ================= */

const mockCategories: PhotoCategory[] = [
  { id: "1", name: "Fisik CCTV", requiresSerialNumber: false },
  { id: "2", name: "Foto Terpasang CCTV 1", requiresSerialNumber: false },
  { id: "3", name: "S/N CCTV 1", requiresSerialNumber: true },
  { id: "4", name: "Foto Terpasang CCTV 2", requiresSerialNumber: false },
  { id: "5", name: "S/N CCTV 2", requiresSerialNumber: true },
  { id: "6", name: "Foto Terpasang CCTV 3", requiresSerialNumber: false },
  { id: "7", name: "S/N CCTV 3", requiresSerialNumber: true },
  { id: "8", name: "Foto Terpasang CCTV 4", requiresSerialNumber: false },
  { id: "9", name: "S/N CCTV 4", requiresSerialNumber: true },
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

/* ===== helper bandingkan crop (hindari setState berulang) ===== */
type LooseCrop = { x: number; y: number; width: number; height: number; unit?: "px" | "%" }
function cropsAlmostEqual(a?: LooseCrop | null, b?: LooseCrop | null, eps = 0.5) {
  if (!a || !b) return false
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps &&
    a.unit === b.unit
  )
}

/* ============== Helper: crop <img> → Blob (via canvas) ============== */
async function cropElToBlob(img: HTMLImageElement, cropPx: PixelCrop): Promise<Blob> {
  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height
  const sx = Math.max(0, Math.round(cropPx.x * scaleX))
  const sy = Math.max(0, Math.round(cropPx.y * scaleY))
  const sw = Math.max(1, Math.round(cropPx.width * scaleX))
  const sh = Math.max(1, Math.round(cropPx.height * scaleY))

  const canvas = document.createElement("canvas")
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92)
  )
}

/* ================= Page ================= */

export default function UploadFotoPage() {
  const [categories, setCategories] = useState<PhotoCategory[]>(mockCategories)
  const [currentPage, setCurrentPage] = useState(1)
  const searchParams = useSearchParams()
  const jobId = searchParams.get("job") ?? ""

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const categoriesPerPage = 8

  // ReactCrop state
  const [cropOpen, setCropOpen] = useState(false)
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null)
  const [srcToCrop, setSrcToCrop] = useState<string | null>(null)

  const imgRef = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState<Crop | undefined>(undefined)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [aspect, setAspect] = useState<number | undefined>(undefined)

  // orientasi & anti feedback-loop
  const [isPortrait, setIsPortrait] = useState(false)
  const ignoreNextChangeRef = useRef(false)
  const lastAspectRef = useRef<number | undefined>(undefined)

  // OCR per-kategori untuk UI
  const [ocr, setOcr] = useState<Record<string, OcrInfo>>({})

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

  const isCableCategory = (name: string) =>
    /kabel\s*cam\s*\d/i.test(name) && /(before|after)/i.test(name)

  /* ====== Ambil foto → tampilkan modal crop ====== */
  const handleCameraClick = (categoryId: string) => {
    fileInputRefs.current[categoryId]?.click()
  }

  const handlePhotoCapture = (categoryId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setPendingCategoryId(categoryId)
      setSrcToCrop(dataUrl)
      setCropOpen(true)
      setCrop(undefined)
      setCompletedCrop(null)
      setAspect(undefined)
    }
    reader.readAsDataURL(file)
  }

  // ========== RESPONSIVE onImageLoaded ==========
  const onImageLoaded = (img: HTMLImageElement) => {
    imgRef.current = img
    setIsPortrait(img.naturalHeight >= img.naturalWidth)
    if (crop) return

    const iw = img.width
    const ih = img.height
    const shortest = Math.min(iw, ih)
    const base = Math.round(shortest * 0.85)

    let w: number, h: number
    if (aspect) {
      w = base
      h = Math.round(w / aspect)
      if (h > ih) { h = Math.round(ih * 0.85); w = Math.round(h * aspect) }
      if (w > iw) { w = Math.round(iw * 0.85); h = Math.round(w / aspect) }
    } else {
      w = base; h = base
    }

    const x = Math.max(0, Math.round((iw - w) / 2))
    const y = Math.max(0, Math.round((ih - h) / 2))
    const nextCrop: Crop = { unit: "px", x, y, width: w, height: h }
    if (!cropsAlmostEqual(crop as any, nextCrop as any)) {
      ignoreNextChangeRef.current = true
      setCrop(nextCrop)
    }
  }

  // Recompute crop bila aspect berubah
  useEffect(() => {
    if (!imgRef.current) return
    if (lastAspectRef.current === aspect) return
    lastAspectRef.current = aspect

    const img = imgRef.current
    const iw = img.width
    const ih = img.height
    const shortest = Math.min(iw, ih)
    const base = Math.round(shortest * 0.85)

    let w: number, h: number
    if (aspect) {
      w = base; h = Math.round(w / aspect)
      if (h > ih) { h = Math.round(ih * 0.85); w = Math.round(h * aspect) }
      if (w > iw) { w = Math.round(iw * 0.85); h = Math.round(w / aspect) }
    } else {
      w = base; h = base
    }

    const x = Math.max(0, Math.round((iw - w) / 2))
    const y = Math.max(0, Math.round((ih - h) / 2))
    const nextCrop: Crop = { unit: "px", x, y, width: w, height: h }

    setCrop((prev) => {
      if (cropsAlmostEqual(prev as any, nextCrop as any)) return prev
      ignoreNextChangeRef.current = true
      return nextCrop
    })
  }, [aspect])

  /** ================== Pemanggilan OCR yang dipisah ================== */
  async function runOCRForCategory_SN(catId: string, imageSource: Blob | string) {
    setOcr((prev) => ({ ...prev, [catId]: { status: "barcode", progress: 0 } }))
    const serial = await recognizeSerialNumber(imageSource, {
      onProgress: (info) => setOcr((prev) => ({ ...prev, [catId]: info })),
      enableBarcode: true, // set false kalau tak ingin barcode
    })
    if (serial) {
      setCategories((prev) =>
        prev.map((c) => (c.id === catId ? { ...c, serialNumber: serial, snDraft: undefined } : c))
      )
    }
  }

  async function runOCRForCategory_Cable(catId: string, imageSource: Blob | string) {
    const meter = await recognizeCableMeters(imageSource, {
      onProgress: (info) => setOcr((prev) => ({ ...prev, [catId]: info })),
    })
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, meter: meter ?? undefined } : c))
    )
  }

  const handleConfirmCrop = async () => {
    if (!imgRef.current || !completedCrop || !pendingCategoryId) return
    const blob = await cropElToBlob(imgRef.current, completedCrop)

    const dataUrl = await new Promise<string>((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(blob)
    })

    setCategories((prev) =>
      prev.map((c) =>
        c.id === pendingCategoryId ? { ...c, photo: dataUrl, snDraft: undefined } : c
      )
    )

    const cat = categories.find((c) => c.id === pendingCategoryId)
    if (cat) {
      if (cat.requiresSerialNumber) {
        await runOCRForCategory_SN(pendingCategoryId, blob)
      } else if (isCableCategory(cat.name)) {
        await runOCRForCategory_Cable(pendingCategoryId, blob)
      }
    }

    setCropOpen(false)
    setSrcToCrop(null)
    setPendingCategoryId(null)
  }

  const handleCancelCrop = () => {
    setCropOpen(false)
    setSrcToCrop(null)
    setPendingCategoryId(null)
  }

  const handleSerialNumberDraftChange = (categoryId: string, value: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === categoryId ? { ...cat, snDraft: value } : cat))
    )
  }

  const handleConfirmSerialNumber = (categoryId: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, serialNumber: (cat.snDraft || "").trim(), snDraft: undefined }
          : cat
      )
    )
    setOcr((prev) => ({ ...prev, [categoryId]: { status: "done", progress: 100 } }))
  }

  const handlePrevPage = () => currentPage > 1 && setCurrentPage((p) => p - 1)
  const handleNextPage = () => currentPage < totalPages && setCurrentPage((p) => p + 1)

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title={`Upload Foto - Job #${jobId}`}
        showBackButton
        backUrl="/user/dashboard"
      />

      <main className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Categories Grid */}
          <div className="grid grid-cols-2 gap-1 mb-4">
            {currentCategories.map((category) => {
              const status = getCategoryStatus(category)
              const styles = getCategoryStyles(status)
              const o = ocr[category.id]

              return (
                <div key={category.id} className="space-y-1">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[130px] mx-auto`}
                    onClick={() => handleCameraClick(category.id)}
                  >
                    <CardContent className="p-1 flex items-center justify-center h-[80px] w-[130px] relative">
                      {category.photo ? (
                        <img
                          src={category.photo}
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

                  <p className="text-xs font-medium text-center text-gray-700 px-1">
                    {category.name}
                  </p>

                  {/* Kabel: tampilkan meter bila ada */}
                  {!category.requiresSerialNumber && category.photo && /kabel\s*cam\s*\d/i.test(category.name) && /(before|after)/i.test(category.name) && (
                    <p className="text-[11px] text-gray-600 text-center">
                      {typeof category.meter === "number"
                        ? <>Panjang tertera: <b>{category.meter} m</b></>
                        : <>Panjang belum terdeteksi</>}
                    </p>
                  )}

                  {/* ===== SN (khusus kategori SN) ===== */}
                  {category.requiresSerialNumber && category.photo && (
                    <div className="space-y-2">
                      {category.serialNumber ? (
                        <p className="text-[9px] text-gray-600 text-center">
                          SN = <span className="font-semibold">{category.serialNumber}</span>
                        </p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <Label
                              htmlFor={`sn-${category.id}`}
                              className="text-[10px] text-gray-600 justify-center"
                            >
                              SN (isi manual)
                            </Label>
                            <div className="flex items-center gap-1">
                              <Input
                                id={`sn-${category.id}`}
                                type="text"
                                placeholder="Masukkan SN"
                                value={category.snDraft ?? ""}
                                onChange={(e) =>
                                  handleSerialNumberDraftChange(category.id, e.target.value)
                                }
                                className="text-[10px]"
                              />
                              <Button
                                type="button"
                                className="h-6 px-2 text-[10px]"
                                onClick={() => handleConfirmSerialNumber(category.id)}
                                disabled={!((category.snDraft ?? "").trim().length)}
                              >
                                Enter
                              </Button>
                            </div>
                          </div>

                          {o && o.status !== "idle" && (
                            <p className="text-[10px] text-gray-600">
                              {o.status === "barcode" && "Mencoba baca barcode..."}
                              {o.status === "ocr" && `Memproses OCR: ${o.progress}%`}
                              {o.status === "done" && "Selesai ✔"}
                              {o.status === "error" && (
                                <span className="text-[10px] justify-center text-red-600">
                                  Gagal: {o.error || "SN tidak terdeteksi."}
                                </span>
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Hidden file input */}
                  <input
                    ref={(el) => { fileInputRefs.current[category.id] = el }}
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

      {/* ===== Modal Crop (ReactCrop) ===== */}
      {cropOpen && srcToCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`bg-white rounded-xl p-4 w-[92vw] ${isPortrait ? "max-w-[480px]" : "max-w-[720px]"}`}>
            <h3 className="text-sm font-semibold mb-3">Crop Foto</h3>

            <div className="relative max-h-[70vh] max-w-[92vw] bg-black/5 rounded overflow-hidden flex items-center justify-center">
              <ReactCrop
                crop={crop}
                onChange={(c: PixelCrop) => {
                  const lc = c as unknown as LooseCrop
                  if (!lc || !lc.width || !lc.height) return
                  if (ignoreNextChangeRef.current) {
                    ignoreNextChangeRef.current = false
                    return
                  }
                  if (cropsAlmostEqual((crop as any) as LooseCrop, lc)) return
                  ignoreNextChangeRef.current = true
                  setCrop(c as unknown as Crop)
                }}
                onComplete={(c: PixelCrop) => {
                  const pc = c
                  if (!pc || !pc.width || !pc.height) return
                  if (cropsAlmostEqual((completedCrop as any) as LooseCrop, pc as any)) return
                  setCompletedCrop(pc)
                }}
                aspect={aspect}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={srcToCrop!}
                  alt="To crop"
                  onLoad={(e) => onImageLoaded(e.currentTarget)}
                  className="max-h-[70vh] max-w-[92vw] w-auto h-auto object-contain"
                />
              </ReactCrop>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600">Aspect</label>
                <select
                  value={aspect ?? "free"}
                  onChange={(e) => {
                    const v = e.target.value
                    setAspect(v === "free" ? undefined : v === "1:1" ? 1 : v === "4:3" ? 4 / 3 : 16 / 9)
                  }}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="free">Free</option>
                  <option value="1:1">1 : 1</option>
                  <option value="4:3">4 : 3</option>
                  <option value="16:9">16 : 9</option>
                </select>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={handleCancelCrop} className="px-3 py-1.5 text-sm rounded border">
                Batal
              </button>
              <button
                onClick={handleConfirmCrop}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
                disabled={!completedCrop}
              >
                Simpan Crop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
