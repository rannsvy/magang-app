// lib/offline/uploader.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export async function safeUpload(opts: {
  endpoint: string;
  formData: FormData;
  meta?: { accessToken?: string; [k: string]: any };
}) {
  try {
    const u = opts.endpoint.startsWith("http")
      ? new URL(opts.endpoint, location.origin)
      : new URL(opts.endpoint, location.origin);
    const endpoint = u.pathname + u.search;

    let accessToken = opts.meta?.accessToken;
    if (!accessToken) {
      const { data } = await supabase.auth.getSession();
      accessToken = data.session?.access_token;
    }

    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    // bypass SW saat development supaya gampang tracing
    if (process.env.NODE_ENV !== "production") headers["x-sw-bypass"] = "1";

    const res = await fetch(endpoint, {
      method: "POST",
      body: opts.formData,
      credentials: "include",
      headers,
      cache: "no-store",
      keepalive: true,
    });

    let json: any = null;
    try {
      json = await res.clone().json();
    } catch {}

    if (json && json.status === "queued") {
      return { status: "queued", queueId: String(json.queueId) } as const;
    }

    if (!res.ok) {
      return {
        status: "error" as const,
        httpStatus: res.status,
        message: json?.error || res.statusText,
      };
    }

    if (json?.ok) {
      try {
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: "upload-online-ack",
            ...json,
          });
          navigator.serviceWorker.controller.postMessage({
            type: "persist-now",
          });
        }
      } catch {}
      return { status: "uploaded", ...json } as const;
    }

    return { status: "uploaded" } as const;
  } catch (err: any) {
    return {
      status: "error" as const,
      message: err?.message || "Network error",
    };
  }
}
