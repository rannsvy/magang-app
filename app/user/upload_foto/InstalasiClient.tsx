// app/user/upload_foto/page.tsx
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
import { Camera, Star, Plus } from "lucide-react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

/* ==== OCR SN (dengan kandidat) ==== */
import { type OcrInfo, recognizeSerialNumberWithCandidates } from "@/lib/ocr";

/* ==== Auto-crop ==== */
import { suggestAutoCrop } from "@/lib/auto-crop";

/* ==== Util gambar ==== */
import { makeThumbnail, blobToDataUrl } from "@/lib/imageUtils";

/* ==== Realtime (SUPABASE) ==== */
import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

/* ==== OFFLINE PWA ==== */
import { useOnlineStatus } from "@/lib/offline/online";
import { safeUpload } from "@/lib/offline/uploader";
import { safePostJSON } from "@/lib/offline/safePost";

const UPLOAD_ENDPOINT = "/api/job-photos/upload";

/* ===== Types ===== */
type UploadState = "queued" | "uploading" | "uploaded" | "error";

interface PhotoEntry {
  id: string;
  createdAt: number;
  full?: string;
  thumb: string;
  remoteUrl?: string;
  sharpness: number;
  sn?: string;              // ⬅️ SN PER-FOTO
  uploadState?: UploadState;
  queueId?: string;
  uploadError?: string;
  token?: number;
}

interface PhotoCategory {
  id: string;
  name: string;
  requiresSerialNumber: boolean;
  requiresCable?: boolean; // dukung flag server + deteksi nama
  // Legacy single (kompat)
  photo?: string;
  photoThumb?: string;

  // Multi
  photos?: PhotoEntry[];
  selectedPhotoId?: string; // dipakai di tampilan & laporan
  offlineThumb?: string;    // thumb utk offline (pakai selected)

  serialNumber?: string;    // mirror dari foto terpilih (untuk server)
  meter?: number;

  // state agregat kategori (untuk badge status)
  uploadState?: UploadState;
  queueId?: string;
  uploadError?: string;

  photoToken?: number;
}

/* ===== Helpers ===== */
type LooseCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  unit?: "px" | "%";
};

const cropsAlmostEqual = (a?: LooseCrop | null, b?: LooseCrop | null, e = 0.5) =>
  !!a &&
  !!b &&
  Math.abs(a.x - b.x) < e &&
  Math.abs(a.y - b.y) < e &&
  Math.abs(a.width - b.width) < e &&
  Math.abs(a.height - b.height) < e &&
  a.unit === b.unit;

async function cropElToBlob(img: HTMLImageElement, cropPx: PixelCrop): Promise<Blob> {
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

async function cropElToDataUrl(img: HTMLImageElement, cropPx: PixelCrop, expand = 0.35): Promise<string> {
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

const isCableCategory = (name: string) =>
  /kabel\s*cam\s*\d/i.test(name) && /(before|after)/i.test(name);

async function urlToDataUrl(u: string): Promise<string> {
  const r = await fetch(u, { cache: "force-cache" });
  const b = await r.blob();
  return await new Promise<string>((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(b);
  });
}

/* ======= QUALITY SCORE (Sobel + Laplacian, normalized & center-weighted) ======= */
async function computeSharpnessFromDataUrl(dataUrl: string): Promise<number> {
  const im = new Image();
  (im as any).decoding = "async";
  im.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    im.onload = () => res();
    im.onerror = () => rej(new Error("img load failed"));
    im.src = dataUrl;
  });

  const maxW = 640;
  const ratio = Math.min(1, maxW / im.naturalWidth);
  const W = Math.max(64, Math.round(im.naturalWidth * ratio));
  const H = Math.max(64, Math.round(im.naturalHeight * ratio));

  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  (ctx as any).imageSmoothingEnabled = false;
  ctx.drawImage(im, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  const Y = new Float32Array(W * H);
  let m = 0;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    Y[j] = y;
    m += y;
  }
  const mean = m / (W * H);

  let v = 0;
  for (let i = 0; i < Y.length; i++) {
    const d = Y[i] - mean;
    v += d * d;
  }
  const contrastVar = v / (W * H);

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const sx = W * 0.28;
  const sy = H * 0.28;

  let sobelEnergy = 0;
  let lapSum = 0;
  let lapSqSum = 0;
  let npx = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;

      const gx =
        -Y[i - W - 1] - 2 * Y[i - 1] - Y[i + W - 1] +
        Y[i - W + 1] + 2 * Y[i + 1] + Y[i + W + 1];
      const gy =
        -Y[i - W - 1] - 2 * Y[i - W] - Y[i - W + 1] +
        Y[i + W - 1] + 2 * Y[i + W] + Y[i + W + 1];
      const g2 = gx * gx + gy * gy;

      const L = Y[i - W] + Y[i - 1] + Y[i + 1] + Y[i + W] - 4 * Y[i];

      const dx = x - cx;
      const dy = y - cy;
      const w = Math.exp(-(dx * dx) / (2 * sx * sx) - (dy * dy) / (2 * sy * sy));

      sobelEnergy += g2 * w;
      lapSum += L * w;
      lapSqSum += (L * L) * w;
      npx++;
    }
  }
  const lapMean = lapSum / Math.max(1, npx);
  const lapVar = lapSqSum / Math.max(1, npx) - lapMean * lapMean;

  const raw = 0.6 * sobelEnergy + 0.4 * lapVar;
  const score = raw / Math.max(1e-3, contrastVar);

  return score;
}

/* ===== API helper ===== */
async function fetchCategories(jobId: string): Promise<PhotoCategory[]> {
  const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal memuat kategori");

  const items = Array.isArray(json.items) ? json.items : [];

  // Server → state client (multi-foto + kompat lama)
  const list = items.map((it: any) => {
    const requiresCable =
      !!it.requiresCable ||
      String(it.type || "").toLowerCase() === "photo+cable" ||
      isCableCategory(String(it.name || ""));

    const base: PhotoCategory = {
      id: String(it.id),
      name: String(it.name ?? ""),
      requiresSerialNumber:
        !!it.requiresSerialNumber ||
        String(it.type || "").toLowerCase() === "photo+sn",
      requiresCable,
      photo: it.photo ?? undefined,
      photoThumb: it.photoThumb ?? undefined,
      offlineThumb: undefined,
      serialNumber: it.serialNumber ?? undefined, // mirror
      meter: typeof it.meter === "number" ? it.meter : undefined,
      photoToken: undefined,
      uploadState: undefined,
      queueId: undefined,
      uploadError: undefined,
      photos: [],
      selectedPhotoId: undefined,
    };

    // kompat record lama: jadikan 1 foto di array
    if (it.photoThumb || it.photo) {
      const thumb = String(it.photoThumb || it.photo);
      const entry: PhotoEntry = {
        id: `remote-${it.id}-${it.updatedAt ?? Date.now()}`,
        createdAt: Date.now(),
        thumb,
        remoteUrl: String(it.photo || it.photoThumb),
        sharpness: 0,
        sn: it.serialNumber ?? undefined,
        uploadState: "uploaded",
      };
      base.photos = [entry];
      base.selectedPhotoId = entry.id;
      base.offlineThumb = thumb;
    }

    return base;
  });

  return list;
}

/* ============== Persist meta (SN/meter/selected photo) – OFFLINE ============== */
async function saveMeta(
  jobId: string,
  categoryId: string,
  meta: {
    serialNumber?: string | null;
    meter?: number | null;
    ocrStatus?: string;
    selectedPhotoId?: string | null;
  }
) {
  const payload: any = {
    jobId,
    categoryId,
    serialNumber: meta.serialNumber ?? null,
    meter: typeof meta.meter === "number" ? meta.meter : null,
    ocrStatus: meta.ocrStatus ?? "done",
  };
  if (meta.selectedPhotoId) {
    payload.ocrStatus = JSON.stringify({
      status: meta.ocrStatus ?? "done",
      selectedPhotoId: meta.selectedPhotoId,
    });
  }
  await safePostJSON("/api/job-photos/meta", payload);
}

/* ===== UI helpers (status & pilihan foto utama) ===== */
const getSelectedThumb = (c: PhotoCategory | undefined): string | undefined => {
  if (!c) return undefined;
  if (c.selectedPhotoId && c.photos?.length) {
    const p = c.photos.find((x) => x.id === c.selectedPhotoId);
    if (p?.thumb) return p.thumb;
  }
  return c.offlineThumb || c.photoThumb || c.photo || undefined;
};

const getSelectedPhoto = (c: PhotoCategory | undefined): PhotoEntry | undefined =>
  c?.photos?.find((p) => p.id === c.selectedPhotoId);

const getCategoryStatus = (c: PhotoCategory) => {
  const thumb = getSelectedThumb(c);
  const hasImg = !!thumb;

  if (c.uploadState === "queued" || c.uploadState === "uploading") return "pending";
  if (c.uploadState === "error") return "error";

  if (!hasImg) return "empty";
  if (c.requiresSerialNumber) {
    const sel = getSelectedPhoto(c);
    if (!(sel?.sn ?? "").trim()) return "incomplete";
  }
  return "complete";
};

const getCategoryStyles = (s: string) =>
  s === "complete"
    ? "bg-green-50 border-green-300 text-green-600"
    : s === "incomplete"
    ? "bg-red-50 border-red-300 text-red-600"
    : s === "error"
    ? "bg-red-50 border-red-300 text-red-600"
    : s === "pending"
    ? "bg-yellow-50 border-yellow-300 text-yellow-600"
    : "bg-gray-100 border-gray-300 text-gray-500";

/* ===== UID util & tanggal ===== */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
function formatDateOnly(epochMs: number) {
  const d = new Date(epochMs);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/* ===== Component (gabungan) ===== */
export default function UploadFotoPage() {
  const sp = useSearchParams();
  const qJob = sp.get("job") ?? "";
  const [jobId, setJobId] = useState<string>(qJob);

  // simpan/restore last_job_id
  useEffect(() => {
    if (jobId) {
      try {
        localStorage.setItem("last_job_id", jobId);
      } catch {}
    }
  }, [jobId]);

  useEffect(() => {
    if (!qJob) {
      try {
        const last = localStorage.getItem("last_job_id");
        if (last) setJobId(last);
      } catch {}
    }
  }, [qJob]);

  const [categories, setCategories] = useState<PhotoCategory[]>([]);
  const categoriesRef = useRef<PhotoCategory[]>([]);
  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  const [currentPage, setCurrentPage] = useState(1);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const setFileInputRef =
    (id: string): React.RefCallback<HTMLInputElement> =>
    (el) => {
      fileInputRefs.current[id] = el;
    };

  const online = useOnlineStatus();

  // ==== Crop state ====
  const [cropOpen, setCropOpen] = useState(false);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [srcToCrop, setSrcToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const ignoreNextChangeRef = useRef(false);
  const lastAspectRef = useRef<number | undefined>(undefined);
  const [isPendingCable, setIsPendingCable] = useState(false);
  const [cableMeterDraft, setCableMeterDraft] = useState<string>("");

  // Loading tombol "Simpan Crop"
  const [savingCrop, setSavingCrop] = useState(false);

  // ==== SN Validation (modal) ====
  const [snOpen, setSnOpen] = useState(false);
  const [snSrc, setSnSrc] = useState<string | null>(null);
  const [snCandidates, setSnCandidates] = useState<string[]>([]);
  const [snDraft, setSnDraft] = useState<string>("");
  const [snLoading, setSnLoading] = useState(false);
  const [snSaving, setSnSaving] = useState(false);
  const [snProgress, setSnProgress] = useState(0);
  const [snError, setSnError] = useState("");
  const snImgRef = useRef<HTMLImageElement | null>(null);
  const [snCrop, setSnCrop] = useState<Crop | undefined>();
  const [snCompletedCrop, setSnCompletedCrop] = useState<PixelCrop | null>(null);

  // target foto yang akan diisi SN (agar tidak salah nempel)
  const snTargetRef = useRef<{ catId: string; photoId: string } | null>(null);

  // ==== Review Modal ====
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCatId, setReviewCatId] = useState<string | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number>(0);

  // === Reopen Review setelah crop ===
  const reopenReviewAfterCropRef = useRef<{ reopen: boolean; catId?: string }>({
    reopen: false,
    catId: undefined,
  });

  // pagination — “seperti semula” (12 / halaman)
  const perPage = 12;
  const totalPages = Math.max(1, Math.ceil(categories.length / perPage));
  const slice = categories.slice((currentPage - 1) * perPage, (currentPage - 1) * perPage + perPage);

  // cache key & helpers
  const cacheKey = jobId ? `upload_cats_${jobId}` : "";
  function persistSnapshotNow(key: string, next: PhotoCategory[]) {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  useEffect(() => {
    if (!jobId || !cacheKey) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(categories));
    } catch {}
  }, [categories, cacheKey, jobId]);

  useEffect(() => {
    if (!cacheKey) return;
    const onOffline = () => persistSnapshotNow(cacheKey, categoriesRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistSnapshotNow(cacheKey, categoriesRef.current);
    };
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cacheKey]);

  const mergePending = (serverItems: PhotoCategory[], localItems: PhotoCategory[]) => {
    const mapLocal = new Map(localItems.map((c) => [c.id, c] as const));
    return serverItems.map((it) => {
      const local = mapLocal.get(it.id);
      if (!local) return it;
      return {
        ...it,
        requiresCable: typeof it.requiresCable === "boolean" ? it.requiresCable : local.requiresCable,
        photos: local.photos?.length ? local.photos : it.photos ?? [],
        selectedPhotoId: local.selectedPhotoId ?? it.selectedPhotoId,
        uploadState: local.uploadState,
        queueId: local.queueId,
        uploadError: local.uploadError,
        photoToken: local.photoToken ?? it.photoToken,
        offlineThumb: local.offlineThumb ?? undefined,
        serialNumber: local.serialNumber ?? it.serialNumber,
        meter: typeof local.meter === "number" ? local.meter : it.meter,
        photoThumb: it.photoThumb ?? local.photoThumb,
      } as PhotoCategory;
    });
  };

  /* ========== INIT + cache + fetch pertama ========== */
  useEffect(() => {
    if (!jobId) return;
    (async () => {
      // opsional init kategori di server
      fetch("/api/job-photos/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      }).catch(() => {});

      if (cacheKey) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached) as PhotoCategory[];
            setCategories((prev) => {
              if (!prev.length) return parsed;
              const byId = new Map(parsed.map((x) => [x.id, x]));
              return prev.map((p) => byId.get(p.id) ?? p);
            });
          }
        } catch {}
      }
      try {
        const server = await fetchCategories(jobId);
        const enriched = await Promise.all(
          server.map(async (cat) => {
            if (cat.photos?.length) {
              const withSharp = await Promise.all(
                cat.photos.map(async (p) =>
                  p.sharpness > 0 ? p : { ...p, sharpness: await computeSharpnessFromDataUrl(p.thumb) }
                )
              );
              let selectedId = cat.selectedPhotoId;
              if (!selectedId) {
                let best = withSharp[0];
                for (const it of withSharp) if (it.sharpness > best.sharpness) best = it;
                selectedId = best.id;
              }
              const selPhoto = withSharp.find((x) => x.id === selectedId);
              const thumb = selPhoto?.thumb ?? withSharp[0].thumb;
              // mirror serialNumber dari foto terpilih bila ada
              const serialNumber = selPhoto?.sn ?? cat.serialNumber;
              return { ...cat, photos: withSharp, selectedPhotoId: selectedId, offlineThumb: thumb, serialNumber };
            }
            return cat;
          })
        );
        setCategories((prev) => {
          const next = mergePending(enriched, prev);
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, online]);

  // offline restore saat network putus
  useEffect(() => {
    if (!cacheKey) return;
    const onOffline = () => {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as PhotoCategory[];
          setCategories((prev) => {
            if (!prev.length) return parsed;
            const byId = new Map(parsed.map((x) => [x.id, x]));
            return prev.map((p) => byId.get(p.id) ?? p);
          });
        }
      } catch {}
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [cacheKey]);

  // prefetch thumbnail terpilih ke dataURL agar tersedia offline
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const need = categories
        .map((c) => ({ c, sel: getSelectedThumb(c) }))
        .filter((x) => x.sel && !x.c.offlineThumb) as { c: PhotoCategory; sel: string }[];
      for (const { c, sel } of need) {
        try {
          const dataUrl = await urlToDataUrl(sel);
          if (cancelled) return;
          setCategories((prev) => {
            const next = prev.map((p) => (p.id === c.id ? { ...p, offlineThumb: dataUrl } : p));
            persistSnapshotNow(cacheKey, next);
            return next;
          });
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, categories, cacheKey]);

  // realtime patch dari Supabase
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const refetch = async () => {
      try {
        const server = await fetchCategories(jobId);
        if (!active) return;
        setCategories((prev) => {
          const next = mergePending(server, prev);
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      } catch {}
    };
    const channel = supabase
      .channel(`tech-upload-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_photos", filter: `job_id=eq.${jobId}` },
        refetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_serial_numbers", filter: `job_id=eq.${jobId}` },
        refetch
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [jobId, cacheKey]);

  // SW message handlers (sinkronisasi offline queue) — gabungan
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d: any = e.data;
      if (!d || typeof d !== "object") return;

      // Kompat pesan dari code 1
      if (d.type === "upload-online-ack" && d.categoryId) {
        setCategories((prev) => {
          const next = prev.map((c) => {
            if (c.id !== d.categoryId) return c;
            const thumb = d.thumbUrl || c.offlineThumb || c.photoThumb;
            let photos = c.photos ?? [];
            if (photos.length && c.selectedPhotoId) {
              photos = photos.map((p) =>
                p.id === c.selectedPhotoId
                  ? { ...p, uploadState: "uploaded" as UploadState }
                  : p
              );
            }
            return {
              ...c,
              offlineThumb: thumb,
              photoThumb: d.thumbUrl || c.photoThumb,
              meter: typeof d.meter === "number" ? d.meter : c.meter,
              serialNumber: d.serialNumber ? d.serialNumber : c.serialNumber,
              photos,
              uploadState: "uploaded" as UploadState,
              queueId: undefined,
              uploadError: undefined,
            };
          });
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }

      if (d.type === "persist-now") {
        persistSnapshotNow(cacheKey, categoriesRef.current);
      }

      if (d.type === "sync-complete" && Array.isArray(d.queueIds)) {
        setCategories((prev) => {
          const next = prev.map((c) => {
            if (!c.photos?.length) return c;
            const photos = c.photos.map((p) =>
              p.queueId && d.queueIds.includes(p.queueId)
                ? { ...p, uploadState: "uploaded" as UploadState, queueId: undefined, uploadError: undefined }
                : p
            );
            return { ...c, photos, uploadState: "uploaded" as UploadState };
          });
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }

      if (d.type === "upload-synced" && d.queueId) {
        setCategories((prev) => {
          const next = prev.map((c) => {
            if (!c.photos?.length) return c;
            const photos = c.photos.map((p) =>
              p.queueId === d.queueId
                ? { ...p, uploadState: "uploaded" as UploadState, queueId: undefined, uploadError: undefined }
                : p
            );
            return { ...c, photos, uploadState: "uploaded" as UploadState };
          });
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }

      if (d.type === "meta-synced" && jobId) {
        fetchCategories(jobId)
          .then((server) => {
            setCategories((prev) => {
              const next = mergePending(server, prev);
              persistSnapshotNow(cacheKey, next);
              return next;
            });
          })
          .catch(() => {});
      }

      if (d.type === "upload-error" && d.queueId) {
        setCategories((prev) => {
          const next = prev.map((c) => {
            if (!c.photos?.length) return c;
            const photos = c.photos.map((p) =>
              p.queueId === d.queueId
                ? {
                    ...p,
                    uploadState: "error" as UploadState,
                    uploadError: d.message || (d.status ? `HTTP ${d.status}` : "Replay gagal"),
                  }
                : p
            );
            return { ...c, photos, uploadState: "error" as UploadState };
          });
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
      return () => navigator.serviceWorker.removeEventListener("message", onMessage);
    }
  }, [jobId, cacheKey]);

  // saat online, minta SW sync
  useEffect(() => {
    if (online && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "force-sync" });
      let tries = 3;
      const t = setInterval(() => {
        if (tries-- <= 0) return clearInterval(t);
        navigator.serviceWorker?.controller?.postMessage({ type: "heartbeat" });
        navigator.serviceWorker?.controller?.postMessage({ type: "persist-now" });
      }, 700);
      return () => clearInterval(t);
    }
  }, [online]);

  const resetFileInput = (id: string) => {
    const el = fileInputRefs.current[id];
    if (el) el.value = "";
  };

  /* ====== UX klik kartu: pertahankan UI card code 1, perilaku code 2 ====== */
  const openReview = (catId: string) => {
    const cat = categoriesRef.current.find((c) => c.id === catId);
    if (!cat) return;
    const selId = cat.selectedPhotoId;
    const idx = selId && cat.photos ? Math.max(0, cat.photos.findIndex((p) => p.id === selId)) : 0;
    setReviewCatId(catId);
    setReviewIndex(idx < 0 ? 0 : idx);
    setReviewOpen(true);
  };

  const handleCardClick = (id: string) => {
    const cat = categoriesRef.current.find((c) => c.id === id);
    const hasImg = !!getSelectedThumb(cat);
    if (!hasImg) {
      fileInputRefs.current[id]?.click();
    } else {
      openReview(id);
    }
  };

  /* ========== Ambil foto → modal crop ========== */
  const handlePhotoCapture = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cat = categories.find((c) => c.id === id);
    if (cat?.requiresSerialNumber) {
      setCategories((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, serialNumber: undefined } : c));
        persistSnapshotNow(cacheKey, next);
        return next;
      });
    }

    const fr = new FileReader();
    fr.onload = (ev) => {
      setPendingCategoryId(id);
      setSrcToCrop(ev.target?.result as string);
      setCropOpen(true);
      setCrop(undefined);
      setCompletedCrop(null);
      setAspect(undefined);

      const isCable = !!cat?.requiresCable || isCableCategory(cat?.name || "");
      setIsPendingCable(isCable);
      setCableMeterDraft(isCable && typeof cat?.meter === "number" ? String(cat.meter) : "");
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
    let w = base, h = base;
    if (aspect) {
      w = base;
      h = Math.round(w / aspect);
      if (h > ih) { h = Math.round(ih * 0.85); w = Math.round(h * aspect); }
      if (w > iw) { w = Math.round(iw * 0.85); h = Math.round(w / aspect); }
    }
    const def: Crop = { unit: "px", x: Math.max(0, Math.round((iw - w) / 2)), y: Math.max(0, Math.round((ih - h) / 2)), width: w, height: h };
    setCrop(def);
    setCompletedCrop(def as unknown as PixelCrop);

    (async () => {
      try {
        if (!srcToCrop || !pendingCategoryId) return;
        const cat = categories.find((c) => c.id === pendingCategoryId);
        const suggestion = await suggestAutoCrop(srcToCrop, cat?.name);
        if (!suggestion || !imgRef.current) return;

        const dispW = imgRef.current.width, dispH = imgRef.current.height;
        const scaleX = dispW / suggestion.naturalW;
        const scaleY = dispH / suggestion.naturalH;
        const nx = Math.round(suggestion.box.x * scaleX);
        const ny = Math.round(suggestion.box.y * scaleY);
        const nw = Math.round(suggestion.box.w * scaleX);
        const nh = Math.round(suggestion.box.h * scaleY);

        const autoCrop: Crop = { unit: "px", x: nx, y: ny, width: nw, height: nh };
        ignoreNextChangeRef.current = true;
        setCrop(autoCrop);
        setCompletedCrop(autoCrop as unknown as PixelCrop);
      } catch {}
    })();
  };

  useEffect(() => {
    if (!imgRef.current || lastAspectRef.current === aspect) return;
    lastAspectRef.current = aspect;
    onImageLoaded(imgRef.current);
  }, [aspect]);

  /* ============== KONFIRM CROP ============== */
  const handleConfirmCrop = async () => {
    if (!imgRef.current || !completedCrop || !pendingCategoryId) return;
    setSavingCrop(true);

    const fullBlob = await cropElToBlob(imgRef.current, completedCrop);
    const thumbBlob = await makeThumbnail(fullBlob, 640, true, 0.8);

    const [fullDataUrl, thumbDataUrl] = await Promise.all([blobToDataUrl(fullBlob), blobToDataUrl(thumbBlob)]);
    const sharpness = await computeSharpnessFromDataUrl(thumbDataUrl);

    const token = Date.now();
    const photoId = uid();

    // meter parsing (kalau kategori kabel)
    const meterVal = isPendingCable && (cableMeterDraft || "").trim().length
      ? Number((cableMeterDraft || "").trim().replace(",", "."))
      : undefined;

    // Optimistic add (multi-foto)
    setCategories((prev) => {
      const next = prev.map((c) => {
        if (c.id !== pendingCategoryId) return c;
        const photos: PhotoEntry[] = [
          ...(c.photos ?? []),
          {
            id: photoId,
            createdAt: token,
            full: fullDataUrl,
            thumb: thumbDataUrl,
            sharpness,
            uploadState: (online ? "uploading" : "queued") as UploadState,
            token,
          },
        ];

        // pilih foto paling tajam sebagai utama
        let best = photos[0];
        for (const it of photos) if (it.sharpness > best.sharpness) best = it;
        const selected = best.id;
        const thumbSel = best.thumb ?? thumbDataUrl;

        return {
          ...c,
          photos,
          selectedPhotoId: selected,
          offlineThumb: thumbSel,
          photoToken: token,
          uploadState: (online ? "uploading" : "queued") as UploadState,
          uploadError: undefined,
          meter: typeof meterVal === "number" && !Number.isNaN(meterVal) ? meterVal : c.meter,
        };
      });
      persistSnapshotNow(cacheKey, next);
      return next;
    });

    // simpan meter kalau ada
    if (typeof meterVal === "number" && !Number.isNaN(meterVal)) {
      await saveMeta(jobId, pendingCategoryId, { meter: meterVal });
    }

    // Upload (non-blocking)
    (async () => {
      try {
        const fd = new FormData();
        const fileName = `job-${jobId || "NA"}-cat-${pendingCategoryId}-${token}.jpg`;
        fd.append("photo", new File([fullBlob], fileName, { type: "image/jpeg" }));
        fd.append("thumb", new File([thumbBlob], `thumb-${fileName}`, { type: "image/jpeg" }));
        fd.append("jobId", jobId);
        fd.append("categoryId", pendingCategoryId);

        const catSnap = categoriesRef.current.find((x) => x.id === pendingCategoryId);
        if (typeof catSnap?.meter === "number") fd.append("meter", String(catSnap.meter));
        if (catSnap?.requiresSerialNumber && catSnap.serialNumber) {
          fd.append("serialNumber", catSnap.serialNumber);
        }

        const result: any = await safeUpload({
          endpoint: UPLOAD_ENDPOINT,
          formData: fd,
          meta: { jobId, categoryId: pendingCategoryId, token, photoId },
        });

        setCategories((prev) => {
          const next = prev.map((c) => {
            if (c.id !== pendingCategoryId || !c.photos?.length) return c;
            const photos = c.photos.map((p) =>
              p.id === photoId
                ? {
                    ...p,
                    uploadState: (result?.status === "queued" ? "queued" : "uploaded") as UploadState,
                    queueId: result?.status === "queued" ? result.queueId : undefined,
                    uploadError: undefined,
                  }
                : p
            );
            const aggState = (result?.status === "queued" ? "queued" : "uploaded") as UploadState;
            return { ...c, photos, uploadState: aggState };
          });
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      } catch {
        setCategories((prev) => {
          const next = prev.map((c) => {
            if (c.id !== pendingCategoryId || !c.photos?.length) return c;
            const photos = c.photos.map((p) =>
              p.id === photoId ? { ...p, uploadState: "queued" as UploadState, uploadError: undefined } : p
            );
            return { ...c, photos, uploadState: "queued" as UploadState };
          });
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }
    })();

    // === Buka popup validasi SN (jika perlu) dan catat target foto untuk SN ===
    const cat = categoriesRef.current.find((c) => c.id === pendingCategoryId);
    const needSN = cat?.requiresSerialNumber && !cat.serialNumber;
    if (needSN) {
      snTargetRef.current = { catId: pendingCategoryId, photoId }; // SN menempel ke foto ini
      const expandedCropDataUrl = await cropElToDataUrl(imgRef.current, completedCrop, 0.35);
      setSnSrc(expandedCropDataUrl);
      setSnOpen(true);
      setSnLoading(false);
      setSnError("");
      setSnProgress(0);
      setSnCandidates([]);
      setSnDraft("");
      setSnCrop(undefined);
      setSnCompletedCrop(null);
    }

    // reset & tutup modal crop
    if (pendingCategoryId) resetFileInput(pendingCategoryId);
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
    setIsPendingCable(false);
    setCableMeterDraft("");
    setSavingCrop(false);

    // reopen review jika sebelumnya dari review
    const rr = reopenReviewAfterCropRef.current;
    if (rr.reopen && rr.catId) openReview(rr.catId);
    reopenReviewAfterCropRef.current = { reopen: false, catId: undefined };
  };

  const handleCancelCrop = () => {
    if (pendingCategoryId) resetFileInput(pendingCategoryId);
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
    setIsPendingCable(false);
    setCableMeterDraft("");
    setSavingCrop(false);

    const rr = reopenReviewAfterCropRef.current;
    if (rr.reopen && rr.catId) openReview(rr.catId);
    reopenReviewAfterCropRef.current = { reopen: false, catId: undefined };
  };

  // ===== set photo utama =====
  const setSelectedPhoto = async (catId: string, photoId: string) => {
    setCategories((prev) => {
      const next = prev.map((c) => {
        if (c.id !== catId) return c;
        const thumb = c.photos?.find((p) => p.id === photoId)?.thumb || c.offlineThumb || c.photoThumb || c.photo;
        const serialNumber = c.photos?.find((p) => p.id === photoId)?.sn; // mirror SN dari foto terpilih
        return { ...c, selectedPhotoId: photoId, offlineThumb: thumb, serialNumber };
      });
      persistSnapshotNow(cacheKey, next);
      return next;
    });
    await saveMeta(jobId, catId, { selectedPhotoId: photoId, ocrStatus: "selected", serialNumber: undefined });
  };

  // ====== SN modal helpers ======
  async function snCropToDataUrl(img: HTMLImageElement, cropPx: PixelCrop, expand = 0): Promise<string> {
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

  async function readSNFromSelectedArea() {
    if (!snSrc || !snImgRef.current || !snCompletedCrop) return;
    try {
      setSnLoading(true);
      setSnError("");
      setSnCandidates([]);
      setSnProgress(1);

      const roiDataUrl = await snCropToDataUrl(snImgRef.current, snCompletedCrop, 0.1);
      const { candidates } = await recognizeSerialNumberWithCandidates(roiDataUrl, {
        enableBarcode: true,
        onProgress: (info: OcrInfo) => {
          if (info.status === "ocr") setSnProgress(info.progress);
        },
      });
      setSnCandidates(candidates);
      setSnDraft(candidates[0] ?? "");
    } catch (e: any) {
      setSnError(e?.message || "Gagal membaca SN dari area.");
    } finally {
      setSnLoading(false);
    }
  }

  async function autoDetectSNWhole() {
    if (!snSrc) return;
    try {
      setSnLoading(true);
      setSnError("");
      setSnCandidates([]);
      setSnProgress(1);

      const { candidates } = await recognizeSerialNumberWithCandidates(snSrc, {
        enableBarcode: true,
        onProgress: (info: OcrInfo) => {
          if (info.status === "ocr") setSnProgress(info.progress);
        },
      });
      setSnCandidates(candidates);
      setSnDraft(candidates[0] ?? "");
    } catch (e: any) {
      setSnError(e?.message || "Gagal membaca SN otomatis.");
    } finally {
      setSnLoading(false);
    }
  }

  const applySNToCategory = async (finalSn: string) => {
    const target = snTargetRef.current;
    if (!target) return;

    setCategories((prev) => {
      const next = prev.map((c) => {
        if (c.id !== target.catId) return c;
        const photos = (c.photos ?? []).map((p) => (p.id === target.photoId ? { ...p, sn: finalSn } : p));
        // mirror ke kategori bila foto yang dipilih adalah foto terpilih
        const selected = photos.find((p) => p.id === c.selectedPhotoId);
        const serialNumber = selected?.sn ?? finalSn;
        return { ...c, photos, serialNumber };
      });
      persistSnapshotNow(cacheKey, next);
      return next;
    });

    await saveMeta(jobId, target.catId, { serialNumber: finalSn, ocrStatus: "done" });
    persistSnapshotNow(cacheKey, categoriesRef.current);
    snTargetRef.current = null;
  };

  /* ====== Render ====== */
  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title={`Upload Foto - Job #${jobId}`}
        showBackButton
        backUrl="/user/dashboard"
      />

      <main className="p-2">
        <div className="max-w-4xl mx-auto">
          {!jobId ? (
            <div className="text-center text-sm text-red-600">
              Job tidak diketahui. Buka dari dashboard saat online terlebih dahulu.
            </div>
          ) : (
            <>
              {/* === Grid card: PERTAHANKAN UI CODE 1 (rasio 1:1, aspect-square) === */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1 mb-4">
                {slice.map((category) => {
                  const status = getCategoryStatus(category);
                  const styles = getCategoryStyles(status);
                  const imgSrc = getSelectedThumb(category);
                  const selPhoto = getSelectedPhoto(category);

                  return (
                    <div key={category.id} className="space-y-1">
                      <Card
                        className={`cursor-pointer transition-all hover:shadow-md ${styles} overflow-hidden w-full`}
                        onClick={() => handleCardClick(category.id)}
                      >
                        <CardContent className="">
                          {/* Kotak rasio 1:1, gambar memenuhi penuh */}
                          <div className="relative w-full aspect-square overflow-hidden rounded-md bg-gray-100">
                            {imgSrc ? (
                              <img
                                src={imgSrc}
                                alt={category.name}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Camera className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      <p className="text-xs font-medium text-center text-gray-700 px-1">
                        {category.name}
                      </p>

                      {/* Status upload (offline queue) */}
                      {category.uploadState && (
                        <p className="text-[10px] text-center text-gray-600">
                          {category.uploadState === "uploaded" && "Terkirim ✔"}
                          {category.uploadState === "uploading" && "Mengunggah..."}
                          {category.uploadState === "queued" && "Menunggu koneksi—otomatis dikirim"}
                          {category.uploadState === "error" && (
                            <span className="text-red-600">
                              Gagal
                              {category.uploadError ? `: ${category.uploadError}` : ""}
                            </span>
                          )}
                        </p>
                      )}

                      {/* Ringkas: tampilkan meter utk kategori kabel (bila sudah ada foto) */}
                      {(category.offlineThumb || category.photoThumb || category.photo) &&
                        (category.requiresCable || isCableCategory(category.name)) && !category.requiresSerialNumber && (
                        <p className="text-[11px] text-gray-600 text-center">
                          {typeof category.meter === "number" ? (
                            <>Panjang: <b>{category.meter} m</b></>
                          ) : (
                            <>Panjang belum diisi</>
                          )}
                        </p>
                      )}

                      {/* Tampilkan SN singkat dari foto terpilih (tanpa input manual di grid) */}
                      {category.requiresSerialNumber && selPhoto?.sn && (
                        <p className="text-[9px] text-gray-600 text-center">
                          SN = <span className="font-semibold">{selPhoto.sn}</span>
                        </p>
                      )}

                      {/* Hidden input (per kartu) */}
                      <input
                        ref={setFileInputRef(category.id)}
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
                  onPrevPage={() =>
                    currentPage > 1 && setCurrentPage((p) => p - 1)
                  }
                  onNextPage={() =>
                    currentPage < totalPages && setCurrentPage((p) => p + 1)
                  }
                />
              </div>
            </>
          )}
        </div>
      </main>

      {/* ===== Modal Crop + input meter (UI code 1) ===== */}
      {cropOpen && srcToCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`bg-white rounded-xl p-4 w-[92vw] ${isPortrait ? "max-w-[480px]" : "max-w-[720px]"}`}>
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
                    setAspect(v === "free" ? undefined : v === "1:1" ? 1 : v === "4:3" ? 4 / 3 : 16 / 9);
                  }}
                  className="text-xs border rounded px-2 py-1"
                >
                  <option value="free">Free</option>
                  <option value="1:1">1 : 1</option>
                  <option value="4:3">4 : 3</option>
                  <option value="16:9">16 : 9</option>
                </select>
              </div>

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
              <button onClick={handleCancelCrop} className="px-3 py-1.5 text-sm rounded border">
                Batal
              </button>
              <button
                onClick={handleConfirmCrop}
                className={`px-3 py-1.5 text-sm rounded text-white ${savingCrop ? "bg-blue-400" : "bg-blue-600"} flex items-center gap-2`}
                disabled={!completedCrop || savingCrop}
              >
                {savingCrop && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                {savingCrop ? "Menyimpan..." : "Simpan Crop"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Validasi SN (dari code 2) ===== */}
      {snOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`bg-white rounded-xl p-4 w-[92vw] ${isPortrait ? "max-w-[480px]" : "max-w-[720px]"}`}>
            <h3 className="text-sm font-semibold mb-3">Validasi Serial Number</h3>

            <div className="relative max-h-[70vh] max-w-[92vw] rounded overflow-hidden bg-black/5 p-2">
              {snSrc ? (
                <ReactCrop crop={snCrop} onChange={(c) => setSnCrop(c as Crop)} onComplete={(c) => setSnCompletedCrop(c as PixelCrop)} keepSelection>
                  <img ref={snImgRef} src={snSrc} alt="SN crop" className="max-h-[260px] w-full object-contain rounded" />
                </ReactCrop>
              ) : (
                <div className="text-xs text-gray-500 p-3">Tidak ada gambar</div>
              )}
            </div>

            <p className="mt-2 text-[11px] text-gray-600">
              Tarik kotak pada bagian tulisan SN (atau barcode) lalu klik <b>Baca Area</b>. Atau gunakan <b>Deteksi Otomatis</b>.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={readSNFromSelectedArea} className="px-3 py-1.5 text-sm" disabled={!snCompletedCrop || snLoading}>
                {snLoading ? "Membaca…" : "Baca Area"}
              </Button>

              <button type="button" onClick={autoDetectSNWhole} className="px-3 py-1.5 text-sm rounded border" disabled={snLoading}>
                Deteksi Otomatis
              </button>

              <button
                type="button"
                onClick={() => {
                  setSnCrop(undefined);
                  setSnCompletedCrop(null);
                }}
                className="px-3 py-1.5 text-sm rounded border"
                disabled={snLoading}
              >
                Reset Area
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {snLoading ? (
                <p className="text-xs text-gray-600">Memproses… {snProgress}%</p>
              ) : snCandidates.length ? (
                <div className="flex flex-wrap gap-2">
                  {snCandidates.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSnDraft(c)}
                      className={`px-2 py-1 rounded border text-xs ${snDraft === c ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-gray-50"}`}
                      title={c}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Belum ada kandidat. Pilih area lalu klik <b>Baca Area</b>, atau pakai <b>Deteksi Otomatis</b>.
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">S/N (manual / pilih kandidat)</Label>
                <Input value={snDraft} onChange={(e) => setSnDraft(e.target.value.toUpperCase())} placeholder="Masukkan SN" className="text-xs" />
              </div>

              {snError && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{snError}</div>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  if (snSaving) return;
                  setSnOpen(false);
                  setSnSrc(null);
                  setSnCandidates([]);
                  setSnDraft("");
                  setSnError("");
                  setSnLoading(false);
                  setSnProgress(0);
                  setSnCrop(undefined);
                  setSnCompletedCrop(null);
                  snTargetRef.current = null;
                }}
                className="px-3 py-1.5 text-sm rounded border disabled:opacity-60"
                disabled={snSaving}
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  const final = (snDraft || "").trim().toUpperCase();
                  if (!final || snSaving || snLoading) return;
                  setSnSaving(true);
                  try {
                    await applySNToCategory(final);
                    setSnOpen(false);
                    setSnSrc(null);
                    setSnCandidates([]);
                    setSnDraft("");
                    setSnError("");
                    setSnLoading(false);
                    setSnProgress(0);
                    setSnCrop(undefined);
                    setSnCompletedCrop(null);
                  } finally {
                    setSnSaving(false);
                  }
                }}
                className={`px-3 py-1.5 text-sm rounded text-white flex items-center gap-2 ${snSaving || snLoading ? "bg-blue-400" : "bg-blue-600"} disabled:opacity-60`}
                disabled={snLoading || snSaving || !snDraft.trim()}
              >
                {snLoading ? "Mencari…" : snSaving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Review Riwayat Foto (tanpa tombol Hapus) ===== */}
      {reviewOpen && reviewCatId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60" onClick={() => setReviewOpen(false)}>
          <div className="bg-white rounded-xl p-4 w-[94vw] max-w-[920px] max-h-[92vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const cat = categories.find((c) => c.id === reviewCatId);
              const photos = cat?.photos ?? [];
              const idx = Math.min(Math.max(0, reviewIndex), Math.max(0, photos.length - 1));
              const current = photos[idx];

              return (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">{cat?.name || "Foto"}</h3>
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 text-xs rounded border" onClick={() => {
                        reopenReviewAfterCropRef.current = { reopen: true, catId: reviewCatId! };
                        setReviewOpen(false);
                        fileInputRefs.current[reviewCatId!]?.click();
                      }}>
                        <Plus className="inline-block mr-1 h-3.5 w-3.5" /> Tambah Foto
                      </button>
                      <button className="px-2 py-1 text-xs rounded border" onClick={() => setReviewOpen(false)}>
                        Tutup
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Preview besar */}
                    <div className="md:col-span-2">
                      <div className="relative aspect-video bg-gray-50 rounded-md overflow-hidden flex items-center justify-center">
                        {current ? (
                          <img src={current.thumb} alt="preview" className="max-h-full max-w-full object-contain" />
                        ) : (
                          <div className="text-xs text-gray-500">Belum ada foto</div>
                        )}
                        {current && (
                          <>
                            <span className="absolute top-2 left-2 text-[11px] px-2 py-0.5 rounded bg-black/60 text-white">
                              Diambil: {formatDateOnly(current.createdAt)}
                            </span>
                            {cat?.requiresSerialNumber && (
                              <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded bg-blue-600 text-white">
                                SN: {current.sn ?? "—"}
                              </span>
                            )}
                            {!cat?.requiresSerialNumber && typeof cat?.meter === "number" && (
                              <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded bg-emerald-600 text-white">
                                Panjang: {cat.meter} m
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {current && cat && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className={`px-3 py-1.5 text-xs rounded text-white ${cat.selectedPhotoId === current.id ? "bg-emerald-600" : "bg-blue-600"}`}
                            onClick={() => setSelectedPhoto(cat.id, current.id)}
                          >
                            <Star className="inline-block h-3.5 w-3.5 mr-1" />
                            {cat.selectedPhotoId === current.id ? "Utama" : "Set sebagai Utama"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Thumbnails */}
                    <div className="md:col-span-1">
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-2 gap-2 overflow-auto max-h-[60vh] pr-1">
                        {photos.map((p, i) => (
                          <button
                            key={p.id}
                            className={`relative rounded border overflow-hidden ${i === idx ? "ring-2 ring-blue-600" : ""}`}
                            onClick={() => setReviewIndex(i)}
                          >
                            <img src={p.thumb} className="h-[80px] w-full object-cover" alt={`p-${i}`} />
                            {cat?.selectedPhotoId === p.id && (
                              <span className="absolute bottom-1 right-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">Utama</span>
                            )}
                            <span className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                              {formatDateOnly(p.createdAt)}
                            </span>
                            {cat?.requiresSerialNumber && p.sn && (
                              <span className="absolute bottom-1 left-1 bg-slate-900/80 text-white text-[9px] px-1 py-0.5 rounded">{p.sn}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
