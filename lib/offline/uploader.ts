// app/lib/offline/uploader.ts
import { enqueueUpload } from "./queue";

export type SafeUploadResult =
  | { status: "uploaded"; response: Response }
  | { status: "queued"; queueId: string }
  | { status: "error"; httpStatus?: number; message?: string; response?: Response };

export async function safeUpload(params: {
  endpoint: string;
  formData: FormData;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  meta?: Record<string, any>;
}): Promise<SafeUploadResult> {
  const { endpoint, formData, method = "POST", headers, meta } = params;

  const toQueue = async (): Promise<SafeUploadResult> => {
    const queueId = await enqueueUpload({ endpoint, formData, method, headers, meta });
    return { status: "queued", queueId };
  };

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return toQueue();
  }

  try {
    const res = await fetch(endpoint, { method, body: formData, headers });

    if (res.ok) return { status: "uploaded", response: res };

    if (res.status >= 400 && res.status < 500) {
      let message = "";
      try {
        const ct = res.headers.get("content-type") || "";
        message = ct.includes("application/json")
          ? ((await res.clone().json())?.message ?? (await res.clone().text()))
          : await res.clone().text();
      } catch {}
      return { status: "error", httpStatus: res.status, message, response: res };
    }

    if (res.status >= 500) return toQueue();
    return toQueue();
  } catch {
    return toQueue();
  }
}
