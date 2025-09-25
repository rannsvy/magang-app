import { createClient } from "@supabase/supabase-js";

const supabase =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      )
    : (null as any);

export type SafePostResult =
  | { status: "ok" }
  | { status: "queued"; queueId: string }
  | { status: "error"; httpStatus?: number; message?: string };

export async function safePostJSON(
  endpoint: string,
  payload: any
): Promise<SafePostResult> {
  try {
    // Ambil access token (untuk Authorization fallback)
    let accessToken: string | undefined;
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token;
      } catch {}
    }

    const res = await fetch(endpoint, {
      method: "POST",
      credentials: "include", // ⬅️ penting agar cookie sb-* ikut
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      keepalive: true,
    });

    // parse response (json atau text)
    const ct = res.headers.get("content-type") || "";
    let data: any = null;
    if (ct.includes("application/json")) {
      try {
        data = await res.json();
      } catch {}
    } else {
      try {
        data = JSON.parse(await res.text());
      } catch {}
    }

    if (res.ok) {
      if (data?.status === "queued" && data?.queueId) {
        return { status: "queued", queueId: String(data.queueId) };
      }
      return { status: "ok" };
    }

    return {
      status: "error",
      httpStatus: res.status,
      message: data?.message || data?.error || res.statusText,
    };
  } catch (e: any) {
    return { status: "error", message: e?.message || "network error" };
  }
}
