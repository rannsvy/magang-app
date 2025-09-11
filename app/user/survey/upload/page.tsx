"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TechnicianHeader } from "@/components/technician-header";
import { Camera, X } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface SurveyPhoto {
  id: string;
  file?: File;
  preview?: string;
  category: string;
  measureValue?: string;
  measureUnit: string;
  status: "empty" | "captured" | "uploaded";
  uploading?: boolean;
  // persisted (server) – agar ringkasan tetap saat reload
  persistedUrl?: string;
  persistedThumb?: string | null;
}

const photoCategories = [
  "Panjang Ruangan",
  "Lebar Ruangan",
  "Sudut Ruangan",
  "Dokumentasi Umum",
];

// Ambil param valid
const getParam = (sp: URLSearchParams, names: string[]): string | null => {
  for (const n of names) {
    const v = sp.get(n);
    if (
      v &&
      v.trim() !== "" &&
      v.toLowerCase() !== "null" &&
      v.toLowerCase() !== "undefined"
    ) {
      return v;
    }
  }
  return null;
};

// helper file → dataUrl
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read file failed"));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(file);
  });
}
// buat thumbnail dataUrl
function imageToThumb(
  dataUrl: string,
  maxDim = 640,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { width, height } = img;
      if (!width || !height) return resolve(dataUrl);
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const tw = Math.max(1, Math.round(width * scale));
      const th = Math.max(1, Math.round(height * scale));
      const c = document.createElement("canvas");
      c.width = tw;
      c.height = th;
      const ctx = c.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, tw, th);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("load image failed"));
    img.src = dataUrl;
  });
}

export default function SurveyUpload() {
  const searchParams = useSearchParams();
  const projectId = useMemo(
    () => getParam(searchParams, ["projectId", "jobId", "pid"]),
    [searchParams]
  );
  const roomId = useMemo(
    () => getParam(searchParams, ["roomId", "id"]),
    [searchParams]
  );
  const roomName =
    getParam(searchParams, ["roomName"]) ||
    (roomId ? roomId.replace(/^room-/, "Room ") : "Unknown Room");

  const backUrl = projectId
    ? `/user/survey/floors?projectId=${encodeURIComponent(projectId)}`
    : `/user/survey/floors`;

  // 10 slot sederhana; setiap slot jadi ringkasan setelah upload
  const [photos, setPhotos] = useState<SurveyPhoto[]>(
    Array.from({ length: 10 }, (_, i) => ({
      id: `photo-${i + 1}`,
      category: "",
      measureUnit: "m",
      status: "empty",
    }))
  );

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleCameraClick = (index: number) =>
    fileInputRefs.current[index]?.click();

  const handleFileChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhotos((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, file, preview, status: "captured" } : p
      )
    );
  };

  const handleCategoryChange = (index: number, category: string) =>
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, category } : p))
    );

  const handleMeasureValueChange = (index: number, v: string) =>
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, measureValue: v } : p))
    );

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) =>
      prev.map((p, i) =>
        i === index
          ? {
              ...p,
              file: undefined,
              preview: undefined,
              status: p.persistedUrl ? "uploaded" : "empty",
              category: p.persistedUrl ? p.category : "",
              measureValue: p.persistedUrl ? p.measureValue : "",
            }
          : p
      )
    );
    const el = fileInputRefs.current[index];
    if (el) el.value = "";
  };

  const canUpload = (p: SurveyPhoto) => {
    if (!p.file) return false;
    if (!p.category) return false;
    if (
      (p.category === "Panjang Ruangan" || p.category === "Lebar Ruangan") &&
      !(p.measureValue || "").trim()
    )
      return false;
    return true;
  };

  const doUpload = async (index: number) => {
    const p = photos[index];
    if (!projectId || !roomId) {
      alert("projectId/roomId tidak ditemukan di URL.");
      return;
    }
    if (!p.file) return;

    try {
      setPhotos((prev) =>
        prev.map((x, i) => (i === index ? { ...x, uploading: true } : x))
      );

      const dataUrl = await fileToDataUrl(p.file);
      const thumbDataUrl = await imageToThumb(dataUrl, 640, 0.85);
      const measure =
        (p.category === "Panjang Ruangan" || p.category === "Lebar Ruangan") &&
        (p.measureValue || "").trim()
          ? p.measureValue
          : null;

      const res = await fetch("/api/survey/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          roomId,
          dataUrl,
          thumbDataUrl,
          category: p.category,
          measureValue: measure,
          measureUnit: "m",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "upload failed");

      setPhotos((prev) =>
        prev.map((x, i) =>
          i === index
            ? {
                ...x,
                status: "uploaded",
                uploading: false,
                persistedUrl: json.url,
                persistedThumb: json.thumb_url,
                // bersihkan file & preview agar UI jelas ringkasan
                file: undefined,
                preview: json.thumb_url || x.preview,
              }
            : x
        )
      );
      const el = fileInputRefs.current[index];
      if (el) el.value = "";
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Gagal upload");
      setPhotos((prev) =>
        prev.map((x, i) => (i === index ? { ...x, uploading: false } : x))
      );
    }
  };

  // Muat ulang daftar upload yang sudah ada (ringkasan tetap saat reload)
  const fetchExisting = async () => {
    if (!projectId || !roomId) return;
    try {
      const res = await fetch(
        `/api/survey/uploads?projectId=${encodeURIComponent(
          projectId
        )}&roomId=${encodeURIComponent(roomId)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "failed to fetch uploads");

      // Mapkan ke slot kosong dulu (supaya simple)
      const existing = (json.items || []).slice(0, photos.length);
      setPhotos((prev) =>
        prev.map((p, i) => {
          const ex = existing[i];
          if (!ex) return p;
          return {
            ...p,
            status: "uploaded",
            persistedUrl: ex.url,
            persistedThumb: ex.thumb_url,
            preview: ex.thumb_url || ex.url,
            category: ex.meta?.category || p.category,
            measureValue:
              ex.meta?.measure_value != null
                ? String(ex.meta.measure_value)
                : p.measureValue,
            measureUnit: ex.meta?.measure_unit || p.measureUnit,
          };
        })
      );
    } catch (e) {
      console.warn(e);
    }
  };

  // Realtime: dengarkan INSERT di survey_room_uploads untuk room ini → refetch
  useEffect(() => {
    fetchExisting();
    if (!projectId || !roomId) return;

    const ch1 = supabase
      .channel(`sru-${projectId}-${roomId}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "survey_room_uploads",
          event: "*",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (row?.room_id === roomId) fetchExisting();
        }
      )
      .subscribe();

    const ch2 = supabase
      .channel(`sru-meta-${projectId}-${roomId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "survey_room_upload_meta", event: "*" },
        () => fetchExisting()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, roomId]);

  const getCategoryStyles = (status: string) =>
    status === "empty"
      ? "bg-gray-100 border-gray-300 text-gray-500"
      : status === "captured"
      ? "bg-red-50 border-red-300 text-red-600"
      : "bg-green-50 border-green-300 text-green-600";

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title={`Upload Foto - ${roomName}`}
        showBackButton
        backUrl={backUrl}
      />
      <main className="p-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 gap-1 mb-4">
            {photos.map((photo, index) => {
              const styles = getCategoryStyles(photo.status);
              const disabledUpload = !canUpload(photo) || photo.uploading;

              return (
                <div key={photo.id} className="space-y-1">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${styles} max-w-[130px] mx-auto`}
                  >
                    <CardContent
                      className="p-1 flex items-center justify-center h-[80px] w-[120px] relative"
                      onClick={() =>
                        photo.status !== "uploaded" && handleCameraClick(index)
                      }
                    >
                      {photo.status === "uploaded" &&
                      (photo.preview ||
                        photo.persistedThumb ||
                        photo.persistedUrl) ? (
                        <img
                          src={
                            photo.preview ||
                            photo.persistedThumb ||
                            photo.persistedUrl ||
                            "/placeholder.svg"
                          }
                          alt={`Foto ${index + 1}`}
                          className="max-w-full max-h-full object-contain rounded"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : photo.preview ? (
                        <>
                          <img
                            src={photo.preview || "/placeholder.svg"}
                            alt={`Foto ${index + 1}`}
                            className="max-w-full max-h-full object-contain rounded"
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePhoto(index);
                            }}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                            title="Hapus foto"
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

                  <p className="text-xs font-medium text-center text-gray-700 px-1">
                    Foto {index + 1}
                  </p>

                  {/* FORM hanya saat CAPTURED */}
                  {photo.status === "captured" && (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`category-${photo.id}`}
                        className="text-xs text-gray-600"
                      >
                        Kategori *
                      </Label>
                      <Select
                        value={photo.category}
                        onValueChange={(value) =>
                          handleCategoryChange(index, value)
                        }
                        disabled={photo.uploading}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Pilih Kategori" />
                        </SelectTrigger>
                        <SelectContent>
                          {photoCategories.map((category) => (
                            <SelectItem
                              key={category}
                              value={category}
                              className="text-sm"
                            >
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {(photo.category === "Panjang Ruangan" ||
                        photo.category === "Lebar Ruangan") && (
                        <div className="space-y-1">
                          <Label
                            htmlFor={`measure-${photo.id}`}
                            className="text-xs text-gray-600"
                          >
                            Nilai Ukur (m) *
                          </Label>
                          <Input
                            id={`measure-${photo.id}`}
                            type="number"
                            placeholder="Masukkan nilai"
                            value={photo.measureValue || ""}
                            onChange={(e) =>
                              handleMeasureValueChange(index, e.target.value)
                            }
                            className="text-sm"
                            min="0"
                            step="0.1"
                            required
                            disabled={photo.uploading}
                          />
                        </div>
                      )}

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => doUpload(index)}
                          disabled={disabledUpload}
                          className={`w-full text-xs rounded px-2 py-1 ${
                            disabledUpload
                              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                              : "bg-blue-600 text-white hover:bg-blue-700"
                          }`}
                        >
                          {photo.uploading ? "Mengunggah..." : "Upload"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* RINGKASAN hanya saat UPLOADED */}
                  {photo.status === "uploaded" && (
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div className="font-medium">{photo.category || "—"}</div>
                      {photo.measureValue ? (
                        <div>
                          Nilai: {photo.measureValue} {photo.measureUnit}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* input file */}
                  <input
                    ref={(el) => {
                      fileInputRefs.current[index] = el;
                    }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleFileChange(index, e)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
