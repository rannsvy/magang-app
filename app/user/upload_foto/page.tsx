"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TechnicianHeader } from "@/components/technician-header"
import { Pagination } from "@/components/pagination"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"

// OCR SN saja
import { type OcrInfo, recognizeSerialNumber } from "@/lib/ocr"
// Auto-crop (barcode/teks → COCO → saliency)
import { suggestAutoCrop } from "@/lib/auto-crop"

/* ===== Types ===== */
interface PhotoCategory {
  id: string
  name: string
  requiresSerialNumber: boolean
  photo?: string
  serialNumber?: string
  snDraft?: string
  meter?: number            // panjang kabel (manual)
  photoToken?: number
}

/* ===== Data kategori ===== */
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

  // Kategori kabel (input manual meter di modal crop)
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

/* ===== Helpers Crop ===== */
type LooseCrop = { x: number; y: number; width: number; height: number; unit?: "px" | "%" }
const cropsAlmostEqual = (a?: LooseCrop | null, b?: LooseCrop | null, e = 0.5) =>
  !!a && !!b &&
  Math.abs(a.x - b.x) < e &&
  Math.abs(a.y - b.y) < e &&
  Math.abs(a.width - b.width) < e &&
  Math.abs(a.height - b.height) < e &&
  a.unit === b.unit

async function cropElToBlob(img: HTMLImageElement, cropPx: PixelCrop): Promise<Blob> {
  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height
  const sx = Math.max(0, Math.round(cropPx.x * scaleX))
  const sy = Math.max(0, Math.round(cropPx.y * scaleY))
  const sw = Math.max(1, Math.round(cropPx.width * scaleX))
  const sh = Math.max(1, Math.round(cropPx.height * scaleY))

  const c = document.createElement("canvas")
  c.width = sw; c.height = sh
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)

  return await new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92)
  )
}

// === NEW: crop ke DataURL untuk kebutuhan OCR, dengan perlebar 'expand'
async function cropElToDataUrl(
  img: HTMLImageElement,
  cropPx: PixelCrop,
  expand = 0.2
): Promise<string> {
  const scaleX = img.naturalWidth / img.width
  const scaleY = img.naturalHeight / img.height

  const ex = Math.max(0, cropPx.x - cropPx.width * expand)
  const ey = Math.max(0, cropPx.y - cropPx.height * expand)
  const ew = cropPx.width * (1 + 2 * expand)
  const eh = cropPx.height * (1 + 2 * expand)

  let sx = Math.round(ex * scaleX)
  let sy = Math.round(ey * scaleY)
  let sw = Math.round(ew * scaleX)
  let sh = Math.round(eh * scaleY)

  // clamp
  if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx
  if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy
  sw = Math.max(1, sw); sh = Math.max(1, sh)

  const c = document.createElement("canvas")
  c.width = sw; c.height = sh
  const ctx = c.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  return c.toDataURL("image/png")
}

const isCableCategory = (name: string) =>
  /kabel\s*cam\s*\d/i.test(name) && /(before|after)/i.test(name)

/* ===== Page Component ===== */
export default function UploadFotoPage() {
  const [categories, setCategories] = useState<PhotoCategory[]>(mockCategories)
  const [currentPage, setCurrentPage] = useState(1)
  const [ocr, setOcr] = useState<Record<string, OcrInfo>>({})

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const jobId = useSearchParams().get("job") ?? ""

  // crop states
  const [cropOpen, setCropOpen] = useState(false)
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null)
  const [srcToCrop, setSrcToCrop] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop | undefined>(undefined)
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null)
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [isPortrait, setIsPortrait] = useState(false)
  const ignoreNextChangeRef = useRef(false)
  const lastAspectRef = useRef<number | undefined>(undefined)

  // kabel meter (manual) di modal crop
  const [isPendingCable, setIsPendingCable] = useState(false)
  const [cableMeterDraft, setCableMeterDraft] = useState<string>("")

  // pagination
  const perPage = 10
  const totalPages = Math.ceil(categories.length / perPage)
  const slice = categories.slice((currentPage - 1) * perPage, (currentPage - 1) * perPage + perPage)

  // reset input file (agar bisa pilih file yang sama lagi)
  const resetFileInput = (id: string) => {
    const el = fileInputRefs.current[id]
    if (el) el.value = ""
  }

  const getCategoryStatus = (c: PhotoCategory) =>
    !c.photo ? "empty" : c.requiresSerialNumber && (c.serialNumber ?? "").trim().length < 8 ? "incomplete" : "complete"

  const getCategoryStyles = (s: string) =>
    s === "complete" ? "bg-green-50 border-green-300 text-green-600"
      : s === "incomplete" ? "bg-red-50 border-red-300 text-red-600"
      : s === "pending" ? "bg-yellow-50 border-yellow-300 text-yellow-600"
      : "bg-gray-100 border-gray-300 text-gray-500"

  const handleCameraClick = (id: string) => fileInputRefs.current[id]?.click()

  const handlePhotoCapture = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const cat = categories.find((c) => c.id === id)
    if (cat?.requiresSerialNumber) {
      setCategories(prev => prev.map(c => c.id === id ? { ...c, serialNumber: undefined, snDraft: undefined } : c))
      setOcr(prev => ({ ...prev, [id]: { status: "idle", progress: 0 } }))
    }

    const fr = new FileReader()
    fr.onload = (ev) => {
      setPendingCategoryId(id)
      setSrcToCrop(ev.target?.result as string)
      setCropOpen(true)
      setCrop(undefined)
      setCompletedCrop(null)
      setAspect(undefined)

      const isCable = !!cat && isCableCategory(cat.name)
      setIsPendingCable(isCable)
      setCableMeterDraft(isCable && typeof cat?.meter === "number" ? String(cat.meter) : "")
    }
    fr.readAsDataURL(file)

    // reset supaya pilih file yang sama tetap memicu onChange
    ;(e.target as HTMLInputElement).value = ""
  }

  const onImageLoaded = (img: HTMLImageElement) => {
    imgRef.current = img
    setIsPortrait(img.naturalHeight >= img.naturalWidth)

    // default crop (center)
    const iw = img.width
    const ih = img.height
    const base = Math.round(Math.min(iw, ih) * 0.85)
    let w = base, h = base
    if (aspect) {
      w = base; h = Math.round(w / aspect)
      if (h > ih) { h = Math.round(ih * 0.85); w = Math.round(h * aspect) }
      if (w > iw) { w = Math.round(iw * 0.85); h = Math.round(w / aspect) }
    }
    setCrop({
      unit: "px",
      x: Math.max(0, Math.round((iw - w) / 2)),
      y: Math.max(0, Math.round((ih - h) / 2)),
      width: w,
      height: h,
    })

    // ==== AUTO-CROP suggestion ====
    ;(async () => {
      try {
        if (!srcToCrop || !pendingCategoryId) return
        const cat = categories.find((c) => c.id === pendingCategoryId)
        const suggestion = await suggestAutoCrop(srcToCrop, cat?.name)
        if (!suggestion || !imgRef.current) return

        const dispW = imgRef.current.width
        const dispH = imgRef.current.height
        const scaleX = dispW / suggestion.naturalW
        const scaleY = dispH / suggestion.naturalH
        const nx = Math.round(suggestion.box.x * scaleX)
        const ny = Math.round(suggestion.box.y * scaleY)
        const nw = Math.round(suggestion.box.w * scaleX)
        const nh = Math.round(suggestion.box.h * scaleY)

        setCrop({ unit: "px", x: nx, y: ny, width: nw, height: nh })
      } catch {
        // diamkan, fallback pakai default crop
      }
    })()
  }

  useEffect(() => {
    if (!imgRef.current || lastAspectRef.current === aspect) return
    lastAspectRef.current = aspect
    onImageLoaded(imgRef.current)
  }, [aspect])

  // === NEW: OCR SN mencoba beberapa sumber (crop diperlebar → fallback full image)
  async function runOCR_SN(catId: string, sources: (Blob | string)[], token: number) {
    setOcr(prev => ({ ...prev, [catId]: { status: "barcode", progress: 0 } }))
    let sn: string | null = null
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]
      sn = await recognizeSerialNumber(src, {
        onProgress: info => setOcr(prev => ({ ...prev, [catId]: info })),
        enableBarcode: true,
      })
      if (sn) break
      if (i === 0) setOcr(prev => ({ ...prev, [catId]: { status: "ocr", progress: 5 } }))
    }
    if (sn) {
      setCategories(prev => prev.map(c =>
        (c.id === catId && c.photoToken === token) ? { ...c, serialNumber: sn! } : c
      ))
      setOcr(prev => ({ ...prev, [catId]: { status: "done", progress: 100 } }))
    } else {
      setOcr(prev => ({ ...prev, [catId]: { status: "error", progress: 0, error: "SN tidak terdeteksi." } }))
    }
  }

  const handleConfirmSerialNumber = (id: string) => {
    setCategories(prev => prev.map(c =>
      c.id === id ? { ...c, serialNumber: (c.snDraft || "").trim().toUpperCase(), snDraft: undefined } : c
    ))
    setOcr(prev => ({ ...prev, [id]: { status: "done", progress: 100 } }))
  }

  const handleConfirmCrop = async () => {
    if (!imgRef.current || !completedCrop || !pendingCategoryId) return

    // simpan gambar hasil crop
    const blob = await cropElToBlob(imgRef.current, completedCrop)
    const dataUrl = await new Promise<string>((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(blob)
    })
    const token = Date.now()

    const cat = categories.find((c) => c.id === pendingCategoryId)
    const isCable = !!cat && isCableCategory(cat.name)

    // parse meter manual
    const draft = (cableMeterDraft || "").trim()
    const parsed = parseFloat(draft.replace(",", "."))
    const meterVal = isCable && !Number.isNaN(parsed) && parsed >= 0 ? parsed : undefined

    setCategories(prev => prev.map(c =>
      c.id === pendingCategoryId
        ? {
            ...c,
            photo: dataUrl,
            photoToken: token,
            serialNumber: c.requiresSerialNumber ? undefined : c.serialNumber,
            snDraft: c.requiresSerialNumber ? undefined : c.snDraft,
            meter: isCable ? (meterVal !== undefined ? meterVal : c.meter) : c.meter,
          }
        : c
    ))

    // OCR SN (pakai crop diperlebar 20% → fallback full)
    if (cat?.requiresSerialNumber) {
      const expandedCropDataUrl = await cropElToDataUrl(imgRef.current, completedCrop, 0.2)
      const originalSrc = srcToCrop! // full image dataUrl dari upload
      await runOCR_SN(pendingCategoryId, [expandedCropDataUrl, originalSrc], token)
    }

    // reset file input & tutup modal
    resetFileInput(pendingCategoryId)
    setCropOpen(false)
    setSrcToCrop(null)
    setPendingCategoryId(null)
    setIsPendingCable(false)
    setCableMeterDraft("")
  }

  const handleCancelCrop = () => {
    if (pendingCategoryId) resetFileInput(pendingCategoryId)
    setCropOpen(false)
    setSrcToCrop(null)
    setPendingCategoryId(null)
    setIsPendingCable(false)
    setCableMeterDraft("")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader title={`Upload Foto - Job #${jobId}`} />
      <main className="p-2">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-1 mb-4">
            {slice.map((category) => {
              const status = getCategoryStatus(category)
              const styles = getCategoryStyles(status)
              const oc = ocr[category.id]

              return (
                <div key={category.id} className="space-y-1">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[110px] mx-auto`}
                    onClick={() => handleCameraClick(category.id)}
                  >
                    <CardContent className="p-1 flex items-center justify-center h-[50px] w-[110px] relative">
                      {category.photo ? (
                        <img
                          src={category.photo}
                          alt={category.name}
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <p className="text-xs font-medium text-center text-gray-700 px-1">{category.name}</p>

                  {/* Panjang kabel (manual) */}
                  {!category.requiresSerialNumber && category.photo && isCableCategory(category.name) && (
                    <p className="text-[11px] text-gray-600 text-center">
                      {typeof category.meter === "number" ? <>Panjang: <b>{category.meter} m</b></> : <>Panjang belum diisi</>}
                    </p>
                  )}

                  {/* Kategori SN */}
                  {category.requiresSerialNumber && category.photo && (
                    <div className="space-y-2">
                      {category.serialNumber ? (
                        <p className="text-[9px] text-gray-600 text-center">
                          SN = <span className="font-semibold">{category.serialNumber}</span>
                        </p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`sn-${category.id}`} className="text-[10px] text-gray-600 justify-center">
                              SN (isi manual)
                            </Label>
                            <div className="flex items-center gap-1">
                              <Input
                                id={`sn-${category.id}`}
                                type="text"
                                placeholder="Masukkan SN"
                                value={category.snDraft ?? ""}
                                onChange={(e) =>
                                  setCategories(prev => prev.map(c =>
                                    c.id === category.id ? { ...c, snDraft: e.target.value.toUpperCase() } : c
                                  ))
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

                          {oc && oc.status !== "idle" && (
                            <p className="text-[10px] text-center">
                              {oc.status === "barcode" && "Mencoba baca barcode..."}
                              {oc.status === "ocr" && `Memproses OCR: ${oc.progress}%`}
                              {oc.status === "done" && "Selesai ✔"}
                              {oc.status === "error" && (
                                <span className="text-red-600">Gagal: {oc.error || "SN tidak terdeteksi."}</span>
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* input file hidden */}
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
              onPrevPage={() => currentPage > 1 && setCurrentPage(p => p - 1)}
              onNextPage={() => currentPage < totalPages && setCurrentPage(p => p + 1)}
            />
          </div>
        </div>
      </main>

      {/* Modal Crop + input meter (manual khusus kategori kabel) */}
      {cropOpen && srcToCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`bg-white rounded-xl p-4 w-[92vw] ${isPortrait ? "max-w-[480px]" : "max-w-[720px]"}`}>
            <h3 className="text-sm font-semibold mb-3">Crop Foto</h3>

            <div className="relative max-h-[70vh] max-w-[92vw] bg-black/5 rounded overflow-hidden flex items-center justify-center">
              <ReactCrop
                crop={crop}
                onChange={(c) => {
                  const lc = c as unknown as LooseCrop
                  if (!lc?.width || !lc?.height) return
                  if (ignoreNextChangeRef.current) { ignoreNextChangeRef.current = false; return }
                  if (!cropsAlmostEqual(crop as any, lc)) { ignoreNextChangeRef.current = true; setCrop(c as unknown as Crop) }
                }}
                onComplete={(c) => { const pc = c as PixelCrop; if (pc?.width && pc?.height) setCompletedCrop(pc) }}
                aspect={aspect}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={srcToCrop}
                  alt="To crop"
                  onLoad={(e) => onImageLoaded(e.currentTarget)}
                  className="max-h/[70vh] max-w-[92vw] w-auto h-auto object-contain"
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

              {/* Input panjang kabel — hanya untuk kategori kabel */}
              {isPendingCable && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 min-w-[120px]">Panjang Kabel (m)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder="mis. 56"
                    value={cableMeterDraft}
                    onChange={(e) => setCableMeterDraft(e.target.value)}
                    className="text-xs border rounded px-2 py-1 w-[140px]"
                  />
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={handleCancelCrop} className="px-3 py-1.5 text-sm rounded border">Batal</button>
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