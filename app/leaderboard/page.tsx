// app/leaderboard/page.tsx
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import LeaderboardClient from "./ui";

const ALLOWED = new Set(["supervisor", "gm", "manager" /*, "admin" */]);

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/* ============ Helpers ============ */
function projectRefFromUrl(url?: string | null) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

type CookieStore = Awaited<ReturnType<typeof cookies>>;

// Ambil access_token dari berbagai kemungkinan cookie
function readAccessFromCookies(c: CookieStore): string | null {
  // Prioritas: sb-access-token, lalu access_token
  const a =
    c.get("sb-access-token")?.value || c.get("access_token")?.value || null;
  if (a) return a;

  // Coba format paket: sb-<ref>-auth-token (JSON)
  const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (ref) {
    const name = `sb-${ref}-auth-token`;
    const v = c.get(name)?.value;
    if (v) {
      try {
        // Bisa plain JSON, atau diawali "base64-"
        const text = v.startsWith("base64-")
          ? Buffer.from(v.slice(7), "base64").toString("utf8")
          : v;
        const obj = JSON.parse(text);
        const sess = obj?.currentSession;
        if (sess?.access_token) return String(sess.access_token);
        if (obj?.access_token) return String(obj.access_token);
      } catch {}
    }
  }
  return null;
}

// Decode payload JWT ala kadarnya
function decodeJwtPayload<T = any>(token: string): T | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    let b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    b64 += pad;
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function fetchProfileRoleWithRLS(token: string, userId: string) {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const url = new URL(`${base}/rest/v1/profiles`);
    url.searchParams.set("id", `eq.${userId}`);
    url.searchParams.set("select", "role");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ role?: string }>;
    const r = rows?.[0]?.role;
    return r ? String(r).toLowerCase().trim() : null;
  } catch {
    return null;
  }
}

/* ============ Page ============ */
export default async function Page() {
  // di versi kamu: cookies() bisa asynchronous → aman pakai await
  const c = await cookies();
  const access = readAccessFromCookies(c);

  if (!access) {
    redirect("/auth/login?next=/leaderboard");
  }

  // Ambil role langsung dari JWT payload. Jangan ngecek exp di sini.
  const p = decodeJwtPayload<any>(access!);
  const userId = String(p?.sub || "");
  let role = String(p?.user_metadata?.role ?? p?.app_metadata?.role ?? "")
    .toLowerCase()
    .trim();

  // Fallback ke profiles bila claim kosong
  if (!role && userId) {
    role = (await fetchProfileRoleWithRLS(access!, userId)) || "";
  }

  if (!ALLOWED.has(role)) {
    redirect("/403");
  }

  return <LeaderboardClient />;
}
