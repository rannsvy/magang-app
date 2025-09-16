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

/* ==== OCR SN (logika dari file kamu) ==== */
import {
  type OcrInfo,
  recognizeSerialNumberWithCandidates,
} from "@/lib/ocr";

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
interface PhotoCategory {
  id: string;
  name: string;
  requiresSerialNumber: boolean;
  photo?: string;
  photoThumb?: string;
  offlineThumb?: string;
  serialNumber?: string;
  snDraft?: string;
  meter?: number;
  photoToken?: number;

  uploadState?: "queued" | "uploading" | "uploaded" | "error";
  queueId?: string;
  uploadError?: string;
}

/* ===== Helpers ===== */
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

async function cropElToDataUrl(
  img: HTMLImageElement,
  cropPx: PixelCrop,
  expand = 0.35
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

/* ===== API helper ===== */
async function fetchCategories(jobId: string): Promise<PhotoCategory[]> {
  const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Gagal memuat kategori");

  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((it: any): PhotoCategory => ({
    id: String(it.id),
    name: String(it.name ?? ""),
    requiresSerialNumber: Boolean(it.requiresSerialNumber),
    photo: it.photo ?? undefined,
    photoThumb: it.photoThumb ?? undefined,
    offlineThumb: undefined, // lokal, akan diisi client
    serialNumber: it.serialNumber ?? undefined,
    snDraft: undefined,
    meter: typeof it.meter === "number" ? it.meter : undefined,
    photoToken: undefined,
    uploadState: undefined,
    queueId: undefined,
    uploadError: undefined,
  }));
}


/* ============== Persist meta (SN/meter) – OFFLINE READY via SW ============== */
async function saveMeta(
  jobId: string,
  categoryId: string,
  meta: {
    serialNumber?: string | null;
    meter?: number | null;
    ocrStatus?: string;
  }
) {
  const payload = {
    jobId,
    categoryId,
    serialNumber: meta.serialNumber ?? null,
    meter: typeof meta.meter === "number" ? meta.meter : null,
    ocrStatus: meta.ocrStatus ?? "done",
  };
  await safePostJSON("/api/job-photos/meta", payload);
}

/* ===== UI helpers ===== */
const getCategoryStatus = (c: PhotoCategory) => {
  if (c.uploadState === "queued" || c.uploadState === "uploading")
    return "pending";
  if (c.uploadState === "error") return "error";
  const hasImg = !!(c.offlineThumb || c.photoThumb || c.photo);
  if (!hasImg) return "empty";
  if (c.requiresSerialNumber && (c.serialNumber ?? "").trim().length < 8)
    return "incomplete";
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

/* ===== Component ===== */
export default function InstalasiClient() {
  const sp = useSearchParams();
  const qJob = sp.get("job") ?? "";
  const [jobId, setJobId] = useState<string>(qJob);

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
  const [isPendingCable, setIsPendingCable] = useState(false);
  const [cableMeterDraft, setCableMeterDraft] = useState<string>("");

  // Loading tombol "Simpan Crop"
  const [savingCrop, setSavingCrop] = useState(false);

  // ==== SN Validation Modal state ====
  const [snOpen, setSnOpen] = useState(false);
  const [snSrc, setSnSrc] = useState<string | null>(null);
  const [snCandidates, setSnCandidates] = useState<string[]>([]);
  const [snDraft, setSnDraft] = useState<string>("");
  const [snLoading, setSnLoading] = useState(false);
  const [snSaving, setSnSaving] = useState(false); // NEW: animasi simpan
  const [snProgress, setSnProgress] = useState(0);
  const [snError, setSnError] = useState("");

  // pagination
  const perPage = 12;
  const totalPages = Math.max(1, Math.ceil(categories.length / perPage));
  const slice = categories.slice(
    (currentPage - 1) * perPage,
    (currentPage - 1) * perPage + perPage
  );

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
      if (document.visibilityState === "hidden")
        persistSnapshotNow(cacheKey, categoriesRef.current);
    };
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cacheKey]);

  const mergePending = (
    serverItems: PhotoCategory[],
    localItems: PhotoCategory[]
  ) => {
    const mapLocal = new Map(localItems.map((c) => [c.id, c] as const));
    return serverItems.map((it) => {
      const local = mapLocal.get(it.id);
      if (!local) return it;
      return {
        ...it,
        uploadState: local.uploadState,
        queueId: local.queueId,
        uploadError: local.uploadError,
        photoToken: local.photoToken ?? it.photoToken,
        offlineThumb: local.offlineThumb ?? undefined,
        serialNumber: local.serialNumber ?? it.serialNumber,
        meter: typeof local.meter === "number" ? local.meter : it.meter,
        photoThumb: it.photoThumb ?? local.photoThumb,
      };
    });
  };

  useEffect(() => {
    if (!jobId) return;
    (async () => {
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
        setCategories((prev) => {
          const next = mergePending(server, prev);
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, online]);

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

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    (async () => {
      const need = categories.filter((c) => c.photoThumb && !c.offlineThumb);
      for (const c of need) {
        try {
          const dataUrl = await urlToDataUrl(c.photoThumb!);
          if (cancelled) return;
          setCategories((prev) => {
            const next = prev.map((p) =>
              p.id === c.id ? { ...p, offlineThumb: dataUrl } : p
            );
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
      active = false;
      supabase.removeChannel(channel);
    };
  }, [jobId, cacheKey]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d: any = e.data;
      if (!d || typeof d !== "object") return;

      if (d.type === "upload-online-ack" && d.categoryId) {
        setCategories((prev) => {
          const next = prev.map((c) =>
            c.id === d.categoryId
              ? {
                  ...c,
                  offlineThumb: d.thumbUrl || c.offlineThumb || c.photoThumb,
                  photoThumb: d.thumbUrl || c.photoThumb,
                  ...(typeof d.meter === "number" ? { meter: d.meter } : {}),
                  ...(d.serialNumber ? { serialNumber: d.serialNumber } : {}),
                }
              : c
          );
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }

      if (d.type === "persist-now") {
        persistSnapshotNow(cacheKey, categoriesRef.current);
      }

      if (d.type === "sync-complete" && Array.isArray(d.queueIds)) {
        setCategories((prev) => {
          const next = prev.map((c) =>
            c.queueId && d.queueIds.includes(c.queueId)
              ? {
                  ...c,
                  uploadState: "uploaded" as const,
                  queueId: undefined,
                  uploadError: undefined,
                }
              : c
          );
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }

      if (d.type === "upload-synced" && d.queueId) {
        setCategories((prev) => {
          const next = prev.map((c) =>
            c.queueId === d.queueId
              ? {
                  ...c,
                  uploadState: "uploaded" as const,
                  queueId: undefined,
                  uploadError: undefined,
                }
              : c
          );
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
          const next = prev.map((c) =>
            c.queueId === d.queueId
              ? {
                  ...c,
                  uploadState: "error" as const,
                  uploadError:
                    d.message ||
                    (d.status ? `HTTP ${d.status}` : "Replay gagal"),
                }
              : c
          );
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
      return () =>
        navigator.serviceWorker.removeEventListener("message", onMessage);
    }
  }, [jobId, cacheKey]);

  useEffect(() => {
    if (online && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "force-sync" });
      let tries = 3;
      const t = setInterval(() => {
        if (tries-- <= 0) return clearInterval(t);
        navigator.serviceWorker?.controller?.postMessage({ type: "heartbeat" });
        navigator.serviceWorker?.controller?.postMessage({
          type: "persist-now",
        });
      }, 700);
      return () => clearInterval(t);
    }
  }, [online]);

  const resetFileInput = (id: string) => {
    const el = fileInputRefs.current[id];
    if (el) el.value = "";
  };
  const handleCameraClick = (id: string) => fileInputRefs.current[id]?.click();

  const handlePhotoCapture = (
    id: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cat = categories.find((c) => c.id === id);
    if (cat?.requiresSerialNumber) {
      setCategories((prev) => {
        const next = prev.map((c) =>
          c.id === id
            ? { ...c, serialNumber: undefined, snDraft: undefined }
            : c
        );
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

      const isCable = !!cat && isCableCategory(cat.name);
      setIsPendingCable(isCable);
      setCableMeterDraft(
        isCable && typeof cat?.meter === "number" ? String(cat.meter) : ""
      );
    };
    fr.readAsDataURL(file);
    (e.target as HTMLInputElement).value = "";
  };

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
    const def: Crop = {
      unit: "px",
      x: Math.max(0, Math.round((iw - w) / 2)),
      y: Math.max(0, Math.round((ih - h) / 2)),
      width: w,
      height: h,
    };
    setCrop(def);
    setCompletedCrop(def as unknown as PixelCrop);

    (async () => {
      try {
        if (!srcToCrop || !pendingCategoryId) return;
        const cat = categories.find((c) => c.id === pendingCategoryId);
        const suggestion = await suggestAutoCrop(srcToCrop, cat?.name);
        if (!suggestion || !imgRef.current) return;

        const dispW = imgRef.current.width,
          dispH = imgRef.current.height;
        const scaleX = dispW / suggestion.naturalW;
        const scaleY = dispH / suggestion.naturalH;
        const nx = Math.round(suggestion.box.x * scaleX);
        const ny = Math.round(suggestion.box.y * scaleY);
        const nw = Math.round(suggestion.box.w * scaleX);
        const nh = Math.round(suggestion.box.h * scaleY);

        const autoCrop: Crop = {
          unit: "px",
          x: nx,
          y: ny,
          width: nw,
          height: nh,
        };
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

    // Buat blob & thumb
    const fullBlob = await cropElToBlob(imgRef.current, completedCrop);
    const thumbBlob = await makeThumbnail(fullBlob, 640, true, 0.8);

    const [, thumbDataUrl] = await Promise.all([
      blobToDataUrl(fullBlob),
      blobToDataUrl(thumbBlob),
    ]);
    const token = Date.now();

    const cat = categories.find((c) => c.id === pendingCategoryId);
    const isCable = !!cat && isCableCategory(cat.name);

    const draft = (cableMeterDraft || "").trim();
    const parsed = parseFloat(draft.replace(",", "."));
    const meterVal =
      isCable && !Number.isNaN(parsed) && parsed >= 0 ? parsed : undefined;

    // Optimistic UI
    const initialState: PhotoCategory["uploadState"] = online
      ? "uploading"
      : "queued";
    setCategories((prev) => {
      const next = prev.map((c) =>
        c.id === pendingCategoryId
          ? {
              ...c,
              photoThumb: thumbDataUrl,
              offlineThumb: thumbDataUrl,
              photoToken: token,
              uploadState: initialState,
              uploadError: undefined,
              ...(typeof meterVal === "number" ? { meter: meterVal } : {}),
            }
          : c
      );
      persistSnapshotNow(cacheKey, next);
      return next;
    });

    // Upload (non-blocking untuk UI)
    (async () => {
      try {
        const fd = new FormData();
        const fileName = `job-${
          jobId || "NA"
        }-cat-${pendingCategoryId}-${token}.jpg`;
        fd.append(
          "photo",
          new File([fullBlob], fileName, { type: "image/jpeg" })
        );
        fd.append(
          "thumb",
          new File([thumbBlob], `thumb-${fileName}`, { type: "image/jpeg" })
        );
        fd.append("jobId", jobId);
        fd.append("categoryId", pendingCategoryId);
        if (typeof meterVal === "number") fd.append("meter", String(meterVal));

        // ikutkan SN final jika sudah ada
        const catNow = categoriesRef.current.find(
          (x) => x.id === pendingCategoryId
        );
        if (catNow?.requiresSerialNumber && catNow.serialNumber) {
          fd.append("serialNumber", catNow.serialNumber);
        }

        const result: any = await safeUpload({
          endpoint: UPLOAD_ENDPOINT,
          formData: fd,
          meta: { jobId, categoryId: pendingCategoryId, token },
        });

        if (result?.status === "uploaded") {
          setCategories((prev) => {
            const next = prev.map((c) =>
              c.id === pendingCategoryId
                ? {
                    ...c,
                    uploadState: "uploaded" as const,
                    queueId: undefined,
                    uploadError: undefined,
                  }
                : c
            );
            persistSnapshotNow(cacheKey, next);
            return next;
          });
        } else if (result?.status === "queued") {
          setCategories((prev) => {
            const next = prev.map((c) =>
              c.id === pendingCategoryId
                ? {
                    ...c,
                    uploadState: "queued" as const,
                    queueId: result.queueId as string,
                    uploadError: undefined,
                  }
                : c
            );
            persistSnapshotNow(cacheKey, next);
            return next;
          });
        } else {
          const msg = result?.httpStatus
            ? `HTTP ${result.httpStatus}${
                result.message ? ` — ${result.message}` : ""
              }`
            : result?.message || "Gagal upload";
          setCategories((prev) => {
            const next = prev.map((c) =>
              c.id === pendingCategoryId
                ? { ...c, uploadState: "error" as const, uploadError: msg }
                : c
            );
            persistSnapshotNow(cacheKey, next);
            return next;
          });
        }
      } catch {
        setCategories((prev) => {
          const next = prev.map((c) =>
            c.id === pendingCategoryId
              ? { ...c, uploadState: "queued" as const, uploadError: undefined }
              : c
          );
          persistSnapshotNow(cacheKey, next);
          return next;
        });
      }
    })();

    // Simpan META meter (kalau diisi)
    if (typeof meterVal === "number") {
      await saveMeta(jobId, pendingCategoryId, {
        meter: meterVal,
        ocrStatus: "done",
      });
      persistSnapshotNow(cacheKey, categoriesRef.current);
    }

    // === BUKA POPUP VALIDASI SN ===
    const needSN = cat?.requiresSerialNumber && !cat.serialNumber;
    if (needSN) {
      const expandedCropDataUrl = await cropElToDataUrl(
        imgRef.current,
        completedCrop,
        0.35
      );
      setSnSrc(expandedCropDataUrl);
      setSnOpen(true);
      setSnLoading(true);
      setSnError("");
      setSnProgress(1);
      setSnCandidates([]);
      setSnDraft("");

      // jalankan OCR+barcode kandidat
      (async () => {
        try {
          const { candidates } = await recognizeSerialNumberWithCandidates(
            expandedCropDataUrl,
            {
              enableBarcode: true,
              onProgress: (info: OcrInfo) => {
                if (info.status === "ocr") setSnProgress(info.progress);
              },
            }
          );
          setSnCandidates(candidates);
          setSnDraft(candidates[0] ?? "");
        } catch (e: any) {
          setSnError(e?.message || "Gagal membaca SN.");
        } finally {
          setSnLoading(false);
        }
      })();
    }

    // reset & tutup modal crop
    if (pendingCategoryId) resetFileInput(pendingCategoryId);
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
    setIsPendingCable(false);
    setCableMeterDraft("");
    setSavingCrop(false);
  };

  const handleCancelCrop = () => {
    if (pendingCategoryId) resetFileInput(pendingCategoryId);
    setCropOpen(false);
    setSrcToCrop(null);
    setPendingCategoryId(null);
    setIsPendingCable(false);
    setCableMeterDraft("");
    setSavingCrop(false);
  };

  // ====== Popup SN actions ======
  const applySNToCategory = async (finalSn: string) => {
    const catId = pendingCategoryId;
    let targetId = catId;
    if (!targetId) {
      const newest = [...categoriesRef.current]
        .filter(
          (c) => c.photoToken && c.requiresSerialNumber && !c.serialNumber
        )
        .sort((a, b) => b.photoToken! - a.photoToken!)[0];
      targetId = newest?.id ?? null;
    }
    if (!targetId) return;

    setCategories((prev) => {
      const next = prev.map((c) =>
        c.id === targetId ? { ...c, serialNumber: finalSn } : c
      );
      persistSnapshotNow(cacheKey, next);
      return next;
    });
    await saveMeta(jobId, targetId, {
      serialNumber: finalSn,
      ocrStatus: "done",
    });
    persistSnapshotNow(cacheKey, categoriesRef.current);
  };

  // ====== Render ======
  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title={`Upload Foto - Job #${jobId}`}
        showBackButton={true}
        backUrl="/user/dashboard"
      />
      <main className="p-2">
        <div className="max-w-4xl mx-auto">
          {!jobId ? (
            <div className="text-center text-sm text-red-600">
              Job tidak diketahui. Buka dari dashboard saat online terlebih
              dahulu.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1 mb-4">
                {slice.map((category) => {
                  const status = getCategoryStatus(category);
                  const styles = getCategoryStyles(status);
                  const imgSrc =
                    category.offlineThumb ||
                    category.photoThumb ||
                    category.photo ||
                    "";

                  return (
                    <div key={category.id} className="space-y-1">
                <Card
                  className={`cursor-pointer transition-all hover:shadow-md ${styles} mx-auto overflow-hidden rounded-md`}
                  onClick={() => handleCameraClick(category.id)}
                >
                <CardContent className="p-2">
                  <div className="relative size-[110px] overflow-hidden rounded-md bg-gray-100">
                    {category.photoThumb || category.photo ? (
                    <img
                      src={category.photoThumb || category.photo}
                      alt={category.name}
                      className="absolute inset-0 h-full w-full object-cover
                                [object-position:44%_50%] [transform:scale(1.04)]"
                      loading="lazy"
                      decoding="async"
                    />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        {/* icon normal 20×20px */}
                        <Camera className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                </CardContent>
                </Card>

                      <p className="text-xs font-medium text-center text-gray-700 px-1">
                        {category.name}
                      </p>

                      {category.uploadState && (
                        <p className="text-[10px] text-center text-gray-600">
                          {category.uploadState === "uploaded" && "Terkirim ✔"}
                          {category.uploadState === "uploading" &&
                            "Mengunggah..."}
                          {category.uploadState === "queued" &&
                            "Menunggu koneksi—otomatis dikirim"}
                          {category.uploadState === "error" && (
                            <span className="text-red-600">
                              Gagal
                              {category.uploadError
                                ? `: ${category.uploadError}`
                                : ""}
                            </span>
                          )}
                        </p>
                      )}

                      {!category.requiresSerialNumber &&
                        (category.offlineThumb ||
                          category.photoThumb ||
                          category.photo) &&
                        isCableCategory(category.name) && (
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

                      {category.requiresSerialNumber &&
                        (category.offlineThumb ||
                          category.photoThumb ||
                          category.photo) && (
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
                                {/* Opsi input manual tetap ada di grid (opsional) */}
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
                                        setCategories((prev) => {
                                          const next = prev.map((c) =>
                                            c.id === category.id
                                              ? {
                                                  ...c,
                                                  snDraft:
                                                    e.target.value.toUpperCase(),
                                                }
                                              : c
                                          );
                                          persistSnapshotNow(cacheKey, next);
                                          return next;
                                        })
                                      }
                                      className="text-[10px]"
                                    />
                                    <Button
                                      type="button"
                                      className="h-6 px-2 text-[10px]"
                                      onClick={async () => {
                                        const final = (category.snDraft || "")
                                          .trim()
                                          .toUpperCase();
                                        if (!final) return;
                                        setCategories((prev) => {
                                          const next = prev.map((c) =>
                                            c.id === category.id
                                              ? {
                                                  ...c,
                                                  serialNumber: final,
                                                  snDraft: undefined,
                                                }
                                              : c
                                          );
                                          persistSnapshotNow(cacheKey, next);
                                          return next;
                                        });
                                        await saveMeta(jobId, category.id, {
                                          serialNumber: final,
                                          ocrStatus: "done",
                                        });
                                        persistSnapshotNow(
                                          cacheKey,
                                          categoriesRef.current
                                        );
                                      }}
                                      disabled={
                                        !(category.snDraft ?? "").trim().length
                                      }
                                    >
                                      Enter
                                    </Button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )}

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

      {/* ===== Modal Crop + input meter ===== */}
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
                className={`px-3 py-1.5 text-sm rounded text-white ${
                  savingCrop ? "bg-blue-400" : "bg-blue-600"
                } flex items-center gap-2`}
                disabled={!completedCrop || savingCrop}
              >
                {savingCrop && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                )}
                {savingCrop ? "Menyimpan..." : "Simpan Crop"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Validasi SN ===== */}
      {snOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className={`bg-white rounded-xl p-4 w-[92vw] ${
              isPortrait ? "max-w-[480px]" : "max-w-[720px]"
            }`}
          >
            <h3 className="text-sm font-semibold mb-3">
              Validasi Serial Number
            </h3>

            <div className="relative max-h-[70vh] max-w-[92vw] rounded overflow-hidden">
              {snSrc ? (
                <img
                  src={snSrc}
                  alt="SN crop"
                  className="max-h-[260px] w-full object-contain bg-black/5 rounded"
                />
              ) : (
                <div className="text-xs text-gray-500 p-3">
                  Tidak ada gambar
                </div>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {snLoading ? (
                <p className="text-xs text-gray-600">
                  Memproses… {snProgress}%
                </p>
              ) : snCandidates.length ? (
                <div className="flex flex-wrap gap-2">
                  {snCandidates.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSnDraft(c)}
                      className={`px-2 py-1 rounded border text-xs ${
                        snDraft === c
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white hover:bg-gray-50"
                      }`}
                      title={c}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Tidak ada kandidat otomatis. Isi SN secara manual.
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">S/N (manual / pilih kandidat)</Label>
                <Input
                  value={snDraft}
                  onChange={(e) => setSnDraft(e.target.value.toUpperCase())}
                  placeholder="Masukkan SN"
                  className="text-xs"
                />
              </div>

              {snError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {snError}
                </div>
              )}
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
                  } finally {
                    setSnSaving(false);
                  }
                }}
                className={`px-3 py-1.5 text-sm rounded text-white flex items-center gap-2 ${
                  snSaving || snLoading ? "bg-blue-400" : "bg-blue-600"
                } disabled:opacity-60`}
                disabled={snLoading || snSaving || !snDraft.trim()}
              >
                {(snSaving || snLoading) && (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                )}
                {snLoading ? "Mencari…" : snSaving ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
