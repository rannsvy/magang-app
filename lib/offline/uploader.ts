// lib/offline/uploader.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export async function safeUpload(opts: {
  endpoint: string; // sebaiknya '/api/job-photos/upload'
  formData: FormData;
  meta?: { accessToken?: string; [k: string]: any };
}): Promise<
  | {
      status: "uploaded";
      jobId?: string;
      categoryId?: string;
      photoUrl?: string;
      thumbUrl?: string;
      serialNumber?: string;
      meter?: number;
    }
  | { status: "queued"; queueId: string }
  | { status: "error"; message?: string; httpStatus?: number }
> {
  try {
    // Normalisasi ke URL relatif (agar cookie terkirim)
    const u = opts.endpoint.startsWith("http")
      ? new URL(opts.endpoint, location.origin)
      : new URL(opts.endpoint, location.origin);
    const endpoint = u.pathname + u.search;

    // Ambil access token Supabase sebagai fallback kalau cookie tidak terbaca di server
    let accessToken = opts.meta?.accessToken;
    if (!accessToken) {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      body: opts.formData, // biarkan browser set boundary; jangan set Content-Type manual
      credentials: "include", // PENTING: kirim cookie Supabase
      // Bearer token jadi fallback (mis. kalau route membaca dari Authorization header)
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
      cache: "no-store",
      keepalive: true,
    });

    // Kalau SW mengantrikan permintaan (offline), server akan balas {status: 'queued'}
    let json: any = null;
    try {
      json = await res.clone().json();
    } catch {
      json = null;
    }

    if (json && json.status === "queued") {
      return { status: "queued", queueId: String(json.queueId) };
    }

    if (!res.ok) {
      return {
        status: "error",
        httpStatus: res.status,
        message: json?.error || res.statusText,
      };
    }

    // ONLINE sukses → informasikan ke SW agar UI & cache sinkron
    if (json?.ok) {
      try {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "upload-online-ack",
            ...json, // jobId, categoryId, photoUrl, thumbUrl, serialNumber, meter, entryId
          });
          navigator.serviceWorker.controller.postMessage({
            type: "persist-now",
          });
        }
      } catch {}
      return { status: "uploaded", ...json };
    }

    return { status: "uploaded" };
  } catch (err: any) {
    return { status: "error", message: err?.message || "Network error" };
  }
}
