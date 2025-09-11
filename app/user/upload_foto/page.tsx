// app/user/upload-foto/page.tsx
"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TechnicianHeader } from "@/components/technician-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Camera } from "lucide-react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

// ==== OCR & Auto-crop ====
import { type OcrInfo, recognizeSerialNumber } from "@/lib/ocr";
import { suggestAutoCrop } from "@/lib/auto-crop";

// ==== Image utils (thumb & dataurl) ====
import { makeThumbnail, blobToDataUrl } from "@/lib/imageUtils";

// ==== Realtime (SUPABASE) ====
import { createClient } from "@supabase/supabase-js";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ================= Types ================= */
interface PhotoCategory {
  id: string;
  name: string;
  requiresSerialNumber: boolean;
  requiresCable?: boolean; // ← FLAG dari API (type: "photo+cable")
  photo?: string;
  photoThumb?: string;
  serialNumber?: string;
  snDraft?: string;
  meter?: number; // panjang kabel (manual, disimpan via /meta)
}

/* ===== Helpers ===== */
// parse aman numeric (termasuk string dari PG)
const toNum = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/* ===== Helpers Crop ===== */
type LooseCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  unit?: "px" | "%";
};
const cropsAlmostEqual = (
  a?: LooseCrop | null,
  b?: LooseCrop | null,
  e = 0.5
) =>
  !!a &&
  !!b &&
  Math.abs(a.x - b.x) < e &&
  Math.abs(a.y - b.y) < e &&
  Math.abs(a.width - b.width) < e &&
  Math.abs(a.height - b.height) < e &&
  a.unit === b.unit;

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

  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return await new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92
    )
  );
}

// Crop → DataURL (dengan “expand” agar OCR punya konteks lebih)
async function cropElToDataUrl(
  img: HTMLImageElement,
  cropPx: PixelCrop,
  expand = 0.2
): Promise<string> {
  const scaleX = img.naturalWidth / img.width;
  const scaleY = img.naturalHeight / img.height;

  const ex = Math.max(0, cropPx.x - cropPx.width * expand);
  const ey = Math.max(0, cropPx.y - cropPx.height * expand);
  const ew = cropPx.width * (1 + 2 * expand);
  const eh = cropPx.height * (1 + 2 * expand);

  let sx = Math.round(ex * scaleX);
  let sy = Math.round(ey * scaleY);
  let sw = Math.round(ew * scaleX);
  let sh = Math.round(eh * scaleY);

  if (sx + sw > img.naturalWidth) sw = img.naturalWidth - sx;
  if (sy + sh > img.naturalHeight) sh = img.naturalHeight - sy;
  sw = Math.max(1, sw);
  sh = Math.max(1, sh);

  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.toDataURL("image/png");
}

/* ===== Helper API ===== */
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
    requiresCable: !!it.requiresCable, // ← ambil flag dari API
    photo: it.photo ?? undefined,
    photoThumb: it.photoThumb ?? undefined,
    serialNumber: it.serialNumber ?? undefined,
    meter: typeof it.meter === "number" ? it.meter : undefined,
  }));
  setCategories(mapped);
}

async function saveMeta(
  jobId: string,
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

/* ================= Page ================= */
export default function UploadFotoPage() {
  const jobId = useSearchParams().get("job") ?? "";

  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [ocr, setOcr] = useState<Record<string, OcrInfo>>({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // crop states
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(
    null
  );
  const [srcToCrop, setSrcToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const ignoreNextChangeRef = useRef(false);
  const lastAspectRef = useRef<number | undefined>(undefined);

  // kabel meter (manual) di modal crop
  const [isPendingCable, setIsPendingCable] = useState(false);
  const [cableMeterDraft, setCableMeterDraft] = useState<string>("");

  // pagination
  const perPage = 10;
  const totalPages = Math.ceil(categories.length / perPage);
  const slice = categories.slice(
    (currentPage - 1) * perPage,
    (currentPage - 1) * perPage + perPage
  );

  const resetFileInput = (id: string) => {
    const el = fileInputRefs.current[id];
    if (el) el.value = "";
  };

  const getCategoryStatus = (c: PhotoCategory) =>
    !(c.photoThumb || c.photo)
      ? "empty"
      : c.requiresSerialNumber && !(c.serialNumber ?? "").trim()
      ? "incomplete"
      : "complete";

  const getCategoryStyles = (s: string) =>
    s === "complete"
      ? "bg-green-50 border-green-300 text-green-600"
      : s === "incomplete"
      ? "bg-red-50 border-red-300 text-red-600"
      : s === "pending"
      ? "bg-yellow-50 border-yellow-300 text-yellow-600"
      : "bg-gray-100 border-gray-300 text-gray-500";

  const handleCameraClick = (id: string) => fileInputRefs.current[id]?.click();

  /* ========== INIT + load pertama ========== */
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

  /* ========== Realtime sync (patch-in-place untuk job_photos) ========== */
  useEffect(() => {
    if (!jobId) return;

    const applyJobPhotoPatch = (row: any) => {
      if (!row || String(row.job_id) !== String(jobId)) return;
      const catId = String(row.category_id);

      setCategories((prev) => {
        let found = false;
        const next = prev.map((c) => {
          if (c.id !== catId) return c;
          found = true;
          return {
            ...c,
            photo: row.url ?? c.photo,
            photoThumb: row.thumb_url ?? c.photoThumb,
            serialNumber: row.serial_number ?? c.serialNumber,
            meter: toNum(row.cable_meter) ?? c.meter,
          };
        });

        if (!found) {
          // kalau belum ada di state (mis. baru dibuat), refetch ringan
          setTimeout(() => refetchCategories(jobId, setCategories), 0);
        }
        return next;
      });
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
        (payload) => {
          const row = payload.new ?? payload.old;
          applyJobPhotoPatch(row);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  /* ========== Ambil foto → modal crop ========== */
  const handlePhotoCapture = (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cat = categories.find((c) => c.id === id);
    if (cat?.requiresSerialNumber) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, serialNumber: undefined, snDraft: undefined }
            : c
        )
      );
      setOcr((prev) => ({ ...prev, [id]: { status: "idle", progress: 0 } }));
    }

    const fr = new FileReader();
    fr.onload = (ev) => {
      setPendingCategoryId(id);
      setSrcToCrop(ev.target?.result as string);
      setCropOpen(true);
      setCrop(undefined);
      setCompletedCrop(null);
      setAspect(undefined);

      // HANYA kategori dengan requiresCable yang menampilkan input meter
      const isCable = !!cat?.requiresCable;
      setIsPendingCable(isCable);
      setCableMeterDraft(
        isCable && typeof cat?.meter === "number" ? String(cat.meter) : ""
      );
    };
    fr.readAsDataURL(file);

    (e.target as HTMLInputElement).value = "";
  };

  /* ========== onImageLoaded + auto-crop suggestion ========== */
  const onImageLoaded = (img: HTMLImageElement) => {
    imgRef.current = img;
    setIsPortrait(img.naturalHeight >= img.naturalWidth);

    const iw = img.width;
    const ih = img.height;
    const base = Math.round(Math.min(iw, ih) * 0.85);
    let w = base,
      h = base;
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
    }
    setCrop({
      unit: "px",
      x: Math.max(0, Math.round((iw - w) / 2)),
      y: Math.max(0, Math.round((ih - h) / 2)),
      width: w,
      height: h,
    });

    (async () => {
      try {
        if (!srcToCrop || !pendingCategoryId) return;
        const cat = categories.find((c) => c.id === pendingCategoryId);
        const suggestion = await suggestAutoCrop(srcToCrop, cat?.name);
        if (!suggestion || !imgRef.current) return;

        const dispW = imgRef.current.width;
        const dispH = imgRef.current.height;
        const scaleX = dispW / suggestion.naturalW;
        const scaleY = dispH / suggestion.naturalH;
        const nx = Math.round(suggestion.box.x * scaleX);
        const ny = Math.round(suggestion.box.y * scaleY);
        const nw = Math.round(suggestion.box.w * scaleX);
        const nh = Math.round(suggestion.box.h * scaleY);

        setCrop({ unit: "px", x: nx, y: ny, width: nw, height: nh });
      } catch {
        // fallback default crop
      }
    })();
  };

  useEffect(() => {
    if (!imgRef.current || lastAspectRef.current === aspect) return;
    lastAspectRef.current = aspect;
    onImageLoaded(imgRef.current);
  }, [aspect]);

  /* ========== OCR (SN) ========== */
  async function runOCR_SN(
    catId: string,
    sources: (Blob | string)[],
    _token: number
  ) {
    setOcr((prev) => ({
      ...prev,
      [catId]: { status: "barcode", progress: 0 },
    }));
    let sn: string | null = null;
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      sn = await recognizeSerialNumber(src, {
        onProgress: (info) => setOcr((prev) => ({ ...prev, [catId]: info })),
        enableBarcode: true,
      });
      if (sn) break;
      if (i === 0)
        setOcr((prev) => ({
          ...prev,
          [catId]: { status: "ocr", progress: 5 },
        }));
    }
    if (sn) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === catId ? { ...c, serialNumber: sn!, snDraft: undefined } : c
        )
      );
      setOcr((prev) => ({
        ...prev,
        [catId]: { status: "done", progress: 100 },
      }));
      await saveMeta(jobId, catId, { serialNumber: sn, ocrStatus: "done" });
    } else {
      setOcr((prev) => ({
        ...prev,
        [catId]: {
          status: "error",
          progress: 0,
          error: "SN tidak terdeteksi.",
        },
      }));
      await saveMeta(jobId, catId, { serialNumber: null, ocrStatus: "done" });
    }
  }

  const handleConfirmSerialNumber = async (id: string) => {
    let finalSN = "";
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          finalSN = (c.snDraft || "").trim().toUpperCase();
          return { ...c, serialNumber: finalSN, snDraft: undefined };
        }
        return c;
      })
    );
    setOcr((prev) => ({ ...prev, [id]: { status: "done", progress: 100 } }));
    await saveMeta(jobId, id, { serialNumber: finalSN, ocrStatus: "done" });
  };

  /* ========== Konfirmasi crop → upload + simpan meter/SN ========== */
  const handleConfirmCrop = async () => {
    if (!imgRef.current || !completedCrop || !pendingCategoryId) return;

    // Simpan gambar hasil crop (full + thumb)
    const fullBlob = await cropElToBlob(imgRef.current, completedCrop);
    const thumbBlob = await makeThumbnail(fullBlob, 640, true, 0.8);
    const [fullDataUrl, thumbDataUrl] = await Promise.all([
      blobToDataUrl(fullBlob),
      blobToDataUrl(thumbBlob),
    ]);
    const token = Date.now();

    // Tampilkan thumb dulu
    setCategories((prev) =>
      prev.map((c) =>
        c.id === pendingCategoryId
          ? {
              ...c,
              photoThumb: thumbDataUrl,
              snDraft: c.requiresSerialNumber ? c.snDraft : undefined,
            }
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

    // Panjang kabel (manual), HANYA bila kategori cable
    const cat = categories.find((c) => c.id === pendingCategoryId);
    const isCable = !!cat?.requiresCable;
    const draft = (cableMeterDraft || "").trim();
    const parsed = parseFloat(draft.replace(",", "."));
    const meterVal =
      isCable && !Number.isNaN(parsed) && parsed >= 0 ? parsed : undefined;

    if (isCable && meterVal !== undefined) {
      await saveMeta(jobId, pendingCategoryId, { meter: meterVal });
      setCategories((prev) =>
        prev.map((c) =>
          c.id === pendingCategoryId ? { ...c, meter: meterVal } : c
        )
      );
    }

    // OCR SN (expand 20% → fallback full)
    if (cat?.requiresSerialNumber) {
      const expandedCropDataUrl = await cropElToDataUrl(
        imgRef.current,
        completedCrop,
        0.2
      );
      const originalSrc = srcToCrop!;
      await runOCR_SN(
        pendingCategoryId,
        [expandedCropDataUrl, originalSrc],
        token
      );
    }

    // Reset & tutup modal
    resetFileInput(pendingCategoryId!);
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
    setIsPendingCable(false);
    setCableMeterDraft("");
  };

  const handleCancelCrop = () => {
    if (pendingCategoryId) resetFileInput(pendingCategoryId);
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
    setIsPendingCable(false);
    setCableMeterDraft("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title={`Upload Foto - Job #${jobId}`}
        showBackButton={true}
        backUrl="/user/dashboard"
      />

      <main className="p-2">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-1 mb-4">
            {slice.map((category) => {
              const status = getCategoryStatus(category);
              const styles = getCategoryStyles(status);
              const oc = ocr[category.id];

              return (
                <div key={category.id} className="space-y-1">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[110px] mx-auto`}
                    onClick={() => handleCameraClick(category.id)}
                  >
                    <CardContent className="p-1 flex items-center justify-center h-[50px] w-[110px] relative">
                      {category.photoThumb || category.photo ? (
                        <img
                          src={category.photoThumb || category.photo}
                          alt={category.name}
                          className="max-w-full max-h-full object-contain rounded"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Camera className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <p className="text-xs font-medium text-center text-gray-700 px-1">
                    {category.name}
                  </p>

                  {/* Panjang kabel (manual) — hanya untuk kategori cable */}
                  {(category.photoThumb || category.photo) &&
                    category.requiresCable && (
                      <p className="text-[11px] text-gray-600 text-center">
                        {typeof category.meter === "number" ? (
                          <>
                            Panjang: <b>{category.meter} m</b>
                          </>
                        ) : (
                          <>Panjang belum diisi</>
                        )}
                      </p>
                    )}

                  {/* Kategori SN */}
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
                                    setCategories((prev) =>
                                      prev.map((c) =>
                                        c.id === category.id
                                          ? {
                                              ...c,
                                              snDraft:
                                                e.target.value.toUpperCase(),
                                            }
                                          : c
                                      )
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

                            {oc && oc.status !== "idle" && (
                              <p className="text-[10px] text-center">
                                {oc.status === "barcode" &&
                                  "Mencoba baca barcode..."}
                                {oc.status === "ocr" &&
                                  `Memproses OCR: ${oc.progress}%`}
                                {oc.status === "done" && "Selesai ✔"}
                                {oc.status === "error" && (
                                  <span className="text-red-600">
                                    Gagal: {oc.error || "SN tidak terdeteksi."}
                                  </span>
                                )}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                  {/* input file hidden */}
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

      {/* Modal Crop + input meter (manual untuk kategori kabel) */}
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
                onChange={(c) => {
                  const lc = c as unknown as LooseCrop;
                  if (!lc?.width || !lc?.height) return;
                  if (ignoreNextChangeRef.current) {
                    ignoreNextChangeRef.current = false;
                    return;
                  }
                  if (!cropsAlmostEqual(crop as any, lc)) {
                    ignoreNextChangeRef.current = true;
                    setCrop(c as unknown as Crop);
                  }
                }}
                onComplete={(c) => {
                  const pc = c as PixelCrop;
                  if (pc?.width && pc?.height) setCompletedCrop(pc);
                }}
                aspect={aspect}
                keepSelection
              >
                <img
                  ref={imgRef}
                  src={srcToCrop}
                  alt="To crop"
                  onLoad={(e) => onImageLoaded(e.currentTarget)}
                  className="max-h/[70vh] max-w/[92vw] w-auto h-auto object-contain"
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

              {/* Input panjang kabel — hanya untuk kategori cable */}
              {isPendingCable && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 min-w-[120px]">
                    Panjang Kabel (m)
                  </label>
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