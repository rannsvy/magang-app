"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { TechnicianHeader } from "@/components/technician-header";
import { Pagination } from "@/components/pagination";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  type OcrInfo,
  recognizeSerialNumber,
  recognizeCableMeters,
} from "@/lib/ocr";
import { makeThumbnail, blobToDataUrl } from "@/lib/imageUtils";

/* ==== Realtime (SUPABASE) ==== */
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ================= Types lokal ================= */
interface PhotoCategory {
  id: string;
  name: string;
  requiresSerialNumber: boolean;
  photo?: string;
  photoThumb?: string;
  serialNumber?: string;
  snDraft?: string;
  meter?: number;
}

/* ===== helper bandingkan crop ===== */
type LooseCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  unit?: "px" | "%";
};
function cropsAlmostEqual(
  a?: LooseCrop | null,
  b?: LooseCrop | null,
  eps = 0.5
) {
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps &&
    a.unit === b.unit
  );
}

/* ============== crop <img> → Blob ============== */
async function cropElToBlob(
  img: HTMLImageElement,
  cropPx: PixelCrop
): Promise<Blob> {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;
  const sx = Math.max(0, Math.round(cropPx.x * scaleX));
  const sy = Math.max(0, Math.round(cropPx.y * scaleY));
  const sw = Math.max(1, Math.round(cropPx.width * scaleX));
  const sh = Math.max(1, Math.round(cropPx.height * scaleY));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92
    )
  );
}

/* ===== helper: refetch kategori (dipakai realtime) ===== */
async function refetchCategories(
  jobId: string,
  setCategories: React.Dispatch<React.SetStateAction<PhotoCategory[]>>
) {
  const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal memuat kategori");
  const mapped: PhotoCategory[] = (json.items || []).map((it: any) => ({
    id: String(it.id),
    name: it.name,
    requiresSerialNumber: !!it.requiresSerialNumber,
    photo: it.photo ?? undefined,
    photoThumb: it.photoThumb ?? undefined,
    serialNumber: it.serialNumber ?? undefined,
    meter: typeof it.meter === "number" ? it.meter : undefined,
  }));
  setCategories(mapped);
}

/* ================= Page ================= */
export default function UploadFotoPage() {
  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job") ?? "";

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const categoriesPerPage = 8;

  // ReactCrop state
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(
    null
  );
  const [srcToCrop, setSrcToCrop] = useState<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);

  const [isPortrait, setIsPortrait] = useState(false);
  const ignoreNextChangeRef = useRef(false);
  const lastAspectRef = useRef<number | undefined>(undefined);

  // OCR per-kategori untuk UI
  const [ocr, setOcr] = useState<Record<string, OcrInfo>>({});

  const totalPages = Math.ceil(categories.length / categoriesPerPage);
  const startIndex = (currentPage - 1) * categoriesPerPage;
  const currentCategories = categories.slice(
    startIndex,
    startIndex + categoriesPerPage
  );

  const getCategoryStatus = (category: PhotoCategory) => {
    const hasImg = !!(category.photoThumb || category.photo);
    if (!hasImg) return "empty";
    if (category.requiresSerialNumber && !category.serialNumber)
      return "incomplete";
    return "complete";
  };

  const getCategoryStyles = (status: string) => {
    switch (status) {
      case "empty":
        return "bg-gray-100 border-gray-300 text-gray-500";
      case "pending":
        return "bg-yellow-50 border-yellow-300 text-yellow-600";
      case "incomplete":
        return "bg-red-50 border-red-300 text-red-600";
      case "complete":
        return "bg-green-50 border-green-300 text-green-600";
      default:
        return "bg-gray-100 border-gray-300 text-gray-500";
    }
  };

  const isCableCategory = (name: string) =>
    /kabel\s*cam\s*\d/i.test(name) && /(before|after)/i.test(name);

  /* ====== INIT & LOAD dari server ====== */
  useEffect(() => {
    if (!jobId) return;
    (async () => {
      try {
        await fetch("/api/job-photos/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        }).catch(() => {});
        await refetchCategories(jobId, setCategories);
      } catch (e) {
        console.error(e);
        setCategories([]);
      }
    })();
  }, [jobId]);

  /* ====== Realtime subscribe: auto-refresh grid ====== */
  useEffect(() => {
    if (!jobId) return;

    let isActive = true;
    const refetch = async () => {
      try {
        const res = await fetch(
          `/api/job-photos/${encodeURIComponent(jobId)}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!isActive) return;
        if (res.ok) {
          const mapped: PhotoCategory[] = (json.items || []).map((it: any) => ({
            id: String(it.id),
            name: it.name,
            requiresSerialNumber: !!it.requiresSerialNumber,
            photo: it.photo ?? undefined,
            photoThumb: it.photoThumb ?? undefined,
            serialNumber: it.serialNumber ?? undefined,
            meter: typeof it.meter === "number" ? it.meter : undefined,
          }));
          setCategories(mapped);
        }
      } catch {
        // abaikan
      }
    };

    const channel = supabase
      .channel(`tech-upload-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=eq.${jobId}`,
        },
        refetch
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_serial_numbers",
          filter: `job_id=eq.${jobId}`,
        },
        refetch
      )
      .subscribe();

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  /* ====== Ambil foto → tampilkan modal crop ====== */
  const handleCameraClick = (categoryId: string) => {
    fileInputRefs.current[categoryId]?.click();
  };

  const handlePhotoCapture = (
    categoryId: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPendingCategoryId(categoryId);
      setSrcToCrop(dataUrl);
      setCropOpen(true);
      setCrop(undefined);
      setCompletedCrop(null);
      setAspect(undefined);
    };
    reader.readAsDataURL(file);
  };

  // ========== RESPONSIVE onImageLoaded ==========
  const onImageLoaded = (img: HTMLImageElement) => {
    imgRef.current = img;
    setIsPortrait(img.naturalHeight >= img.naturalWidth);
    if (crop) return;

    const iw = img.width;
    const ih = img.height;
    const shortest = Math.min(iw, ih);
    const base = Math.round(shortest * 0.85);

    let w: number, h: number;
    if (aspect) {
      w = base;
      h = Math.round(w / aspect);
      if (h > ih) {
        h = Math.round(ih * 0.85);
        w = Math.round(h * aspect);
      }
      if (w > iw) {
        w = Math.round(iw * 0.85);
        h = Math.round(w / aspect);
      }
    } else {
      w = base;
      h = base;
    }

    const x = Math.max(0, Math.round((iw - w) / 2));
    const y = Math.max(0, Math.round((ih - h) / 2));
    const nextCrop: Crop = { unit: "px", x, y, width: w, height: h };
    if (!cropsAlmostEqual(crop as any, nextCrop as any)) {
      ignoreNextChangeRef.current = true;
      setCrop(nextCrop);
    }
  };

  // Recompute crop bila aspect berubah
  useEffect(() => {
    if (!imgRef.current) return;
    if (lastAspectRef.current === aspect) return;
    lastAspectRef.current = aspect;

    const img = imgRef.current;
    const iw = img.width;
    const ih = img.height;
    const shortest = Math.min(iw, ih);
    const base = Math.round(shortest * 0.85);

    let w: number, h: number;
    if (aspect) {
      w = base;
      h = Math.round(w / aspect);
      if (h > ih) {
        h = Math.round(ih * 0.85);
        w = Math.round(h * aspect);
      }
      if (w > iw) {
        w = Math.round(iw * 0.85);
        h = Math.round(w / aspect);
      }
    } else {
      w = base;
      h = base;
    }

    const x = Math.max(0, Math.round((iw - w) / 2));
    const y = Math.max(0, Math.round((ih - h) / 2));
    const nextCrop: Crop = { unit: "px", x, y, width: w, height: h };

    setCrop((prev) => {
      if (cropsAlmostEqual(prev as any, nextCrop as any)) return prev;
      ignoreNextChangeRef.current = true;
      return nextCrop;
    });
  }, [aspect]);

  /* ============== Persist meta helper ============== */
  async function saveMeta(
    categoryId: string,
    meta: {
      serialNumber?: string | null;
      meter?: number | null;
      ocrStatus?: string;
    }
  ) {
    try {
      await fetch("/api/job-photos/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          categoryId,
          serialNumber: meta.serialNumber ?? null,
          meter: typeof meta.meter === "number" ? meta.meter : null,
          ocrStatus: meta.ocrStatus ?? "done",
        }),
      });
    } catch (e) {
      console.error("saveMeta failed:", e);
    }
  }

  /** ================== OCR ================== */
  async function runOCRForCategory_SN(
    catId: string,
    imageSource: Blob | string
  ) {
    setOcr((prev) => ({
      ...prev,
      [catId]: { status: "barcode", progress: 0 },
    }));
    const serial = await recognizeSerialNumber(imageSource, {
      onProgress: (info) => setOcr((prev) => ({ ...prev, [catId]: info })),
      enableBarcode: true,
    });
    if (serial) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === catId
            ? { ...c, serialNumber: serial, snDraft: undefined }
            : c
        )
      );
      await saveMeta(catId, { serialNumber: serial, ocrStatus: "done" });
    } else {
      await saveMeta(catId, { serialNumber: null, ocrStatus: "done" });
    }
  }

  async function runOCRForCategory_Cable(
    catId: string,
    imageSource: Blob | string
  ) {
    setOcr((prev) => ({ ...prev, [catId]: { status: "ocr", progress: 0 } }));
    const meter = await recognizeCableMeters(imageSource, {
      onProgress: (info) => setOcr((prev) => ({ ...prev, [catId]: info })),
    });
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, meter: meter ?? undefined } : c
      )
    );
    await saveMeta(catId, { meter: meter ?? null, ocrStatus: "done" });
  }

  /* ============== KONFIRM CROP → upload full + thumb ============== */
  const handleConfirmCrop = async () => {
    if (!imgRef.current || !completedCrop || !pendingCategoryId) return;

    const fullBlob = await cropElToBlob(imgRef.current, completedCrop);
    const thumbBlob = await makeThumbnail(fullBlob, 640, true, 0.8);

    const [fullDataUrl, thumbDataUrl] = await Promise.all([
      blobToDataUrl(fullBlob),
      blobToDataUrl(thumbBlob),
    ]);

    setCategories((prev) =>
      prev.map((c) =>
        c.id === pendingCategoryId
          ? { ...c, photoThumb: thumbDataUrl, snDraft: undefined }
          : c
      )
    );

    try {
      const res = await fetch("/api/job-photos/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          categoryId: pendingCategoryId,
          dataUrl: fullDataUrl,
          thumbDataUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal upload");

      setCategories((prev) =>
        prev.map((c) =>
          c.id === pendingCategoryId
            ? {
                ...c,
                photoThumb: json.thumbUrl ?? c.photoThumb,
                photo: json.photoUrl ?? c.photo,
              }
            : c
        )
      );
    } catch (e) {
      console.error(e);
    }

    const cat = categories.find((c) => c.id === pendingCategoryId);
    if (cat) {
      if (cat.requiresSerialNumber) {
        await runOCRForCategory_SN(pendingCategoryId, fullBlob);
      } else if (isCableCategory(cat.name)) {
        await runOCRForCategory_Cable(pendingCategoryId, fullBlob);
      }
    }

    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
  };

  const handleCancelCrop = () => {
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
  };

  const handleSerialNumberDraftChange = (categoryId: string, value: string) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId ? { ...cat, snDraft: value } : cat
      )
    );
  };

  const handleConfirmSerialNumber = async (categoryId: string) => {
    let finalSN = "";
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          finalSN = (cat.snDraft || "").trim();
          return { ...cat, serialNumber: finalSN, snDraft: undefined };
        }
        return cat;
      })
    );
    setOcr((prev) => ({
      ...prev,
      [categoryId]: { status: "done", progress: 100 },
    }));
    await saveMeta(categoryId, { serialNumber: finalSN, ocrStatus: "done" });
  };

  const handlePrevPage = () => currentPage > 1 && setCurrentPage((p) => p - 1);
  const handleNextPage = () =>
    currentPage < totalPages && setCurrentPage((p) => p + 1);

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
              const status = getCategoryStatus(category);
              const styles = getCategoryStyles(status);
              const o = ocr[category.id];

              return (
                <div key={category.id} className="space-y-1">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[130px] mx-auto`}
                    onClick={() => handleCameraClick(category.id)}
                  >
                    <CardContent className="p-1 flex items-center justify-center h-[80px] w-[130px] relative">
                      {category.photoThumb ? (
                        <img
                          src={category.photoThumb}
                          alt={category.name}
                          className="max-w-full max-h-full object-contain rounded"
                          loading="lazy"
                          decoding="async"
                          width={130}
                          height={80}
                        />
                      ) : category.photo ? (
                        <img
                          src={category.photo}
                          alt={category.name}
                          className="max-w-full max-h-full object-contain rounded"
                          loading="lazy"
                          decoding="async"
                          width={130}
                          height={80}
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
                  {!category.requiresSerialNumber &&
                    (category.photoThumb || category.photo) &&
                    /kabel\s*cam\s*\d/i.test(category.name) &&
                    /(before|after)/i.test(category.name) && (
                      <p className="text-[11px] text-gray-600 text-center">
                        {typeof category.meter === "number" ? (
                          <>
                            Panjang tertera: <b>{category.meter} m</b>
                          </>
                        ) : (
                          <>Panjang belum terdeteksi</>
                        )}
                      </p>
                    )}

                  {/* ===== SN (khusus kategori SN) ===== */}
                  {category.requiresSerialNumber &&
                    (category.photoThumb || category.photo) && (
                      <div className="space-y-2">
                        {category.serialNumber ? (
                          <p className="text-[9px] text-gray-600 text-center">
                            SN ={" "}
                            <span className="font-semibold">
                              {category.serialNumber}
                            </span>
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
                                    handleSerialNumberDraftChange(
                                      category.id,
                                      e.target.value
                                    )
                                  }
                                  className="text-[10px]"
                                />
                                <Button
                                  type="button"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() =>
                                    handleConfirmSerialNumber(category.id)
                                  }
                                  disabled={
                                    !(category.snDraft ?? "").trim().length
                                  }
                                >
                                  Enter
                                </Button>
                              </div>
                            </div>

                            {o && (
                              <p className="text-[10px] text-gray-600">
                                {o.status === "barcode" &&
                                  "Mencoba baca barcode..."}
                                {o.status === "ocr" &&
                                  `Memproses OCR: ${o.progress}%`}
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
                    ref={(el) => {
                      fileInputRefs.current[category.id] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handlePhotoCapture(category.id, e)}
                  />
                </div>
              );
            })}
          </div>

          <div className="mb-6">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevPage={() => currentPage > 1 && setCurrentPage((p) => p - 1)}
              onNextPage={() =>
                currentPage < totalPages && setCurrentPage((p) => p + 1)
              }
            />
          </div>
        </div>
      </main>

      {/* ===== Modal Crop (ReactCrop) ===== */}
      {cropOpen && srcToCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className={`bg-white rounded-xl p-4 w-[92vw] ${
              isPortrait ? "max-w-[480px]" : "max-w-[720px]"
            }`}
          >
            <h3 className="text-sm font-semibold mb-3">Crop Foto</h3>

            <div className="relative max-h-[70vh] max-w-[92vw] bg-black/5 rounded overflow-hidden flex items-center justify-center">
              <ReactCrop
                crop={crop}
                onChange={(c: PixelCrop) => {
                  const lc = c as unknown as LooseCrop;
                  if (!lc || !lc.width || !lc.height) return;
                  if (ignoreNextChangeRef.current) {
                    ignoreNextChangeRef.current = false;
                    return;
                  }
                  if (cropsAlmostEqual(crop as any as LooseCrop, lc)) return;
                  ignoreNextChangeRef.current = true;
                  setCrop(c as unknown as Crop);
                }}
                onComplete={(c: PixelCrop) => {
                  const pc = c;
                  if (!pc || !pc.width || !pc.height) return;
                  if (
                    cropsAlmostEqual(
                      completedCrop as any as LooseCrop,
                      pc as any
                    )
                  )
                    return;
                  setCompletedCrop(pc);
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
                    const v = e.target.value;
                    setAspect(
                      v === "free"
                        ? undefined
                        : v === "1:1"
                        ? 1
                        : v === "4:3"
                        ? 4 / 3
                        : 16 / 9
                    );
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
              <button
                onClick={handleCancelCrop}
                className="px-3 py-1.5 text-sm rounded border"
              >
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
  );
}
