// app/api/points/leaderboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin as supabaseAdminExport } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED = new Set(["supervisor", "gm", "manager"]);

/* ========== Helpers ========== */
function projectRefFromUrl(url?: string | null) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}
function readAccessFromReq(req: NextRequest): string | null {
  const c = req.cookies;
  const a =
    c.get("sb-access-token")?.value || c.get("access_token")?.value || null;
  if (a) return a;

  const ref = projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!ref) return null;
  const v = c.get(`sb-${ref}-auth-token`)?.value;
  if (!v) return null;
  try {
    const text = v.startsWith("base64-")
      ? Buffer.from(v.slice(7), "base64").toString("utf8")
      : v;
    const obj = JSON.parse(text);
    const sess = obj?.currentSession;
    if (sess?.access_token) return String(sess.access_token);
    if (obj?.access_token) return String(obj.access_token);
  } catch {}
  return null;
}
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
async function fetchProfileRoleWithRLS(access: string, userId: string) {
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
        Authorization: `Bearer ${access}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) return null; // kalau RLS nolak, ya null
    const rows = (await res.json()) as Array<{ role?: string }>;
    const r = rows?.[0]?.role;
    return r ? String(r).toLowerCase().trim() : null;
  } catch {
    return null;
  }
}
function monthStartWIBISO(): string {
  const now = new Date();
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const start = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), 1));
  return start.toISOString().slice(0, 10);
}
function prevMonthStartISO(cur: string): string {
  const [y, m] = cur.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 2, 1));
  return d.toISOString().slice(0, 10);
}

/* ========== Handler ========== */
export async function GET(req: NextRequest) {
  const res = new NextResponse();

  // SSR client (biar bisa refresh cookie kalau perlu), tapi JANGAN diandalkan untuk RLS
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    }
  );

  // 1) Token dari cookie request
  const access = readAccessFromReq(req);
  if (!access) {
    return NextResponse.json(
      { error: "Unauthorized (no token)" },
      { status: 401, headers: res.headers }
    );
  }

  // 2) Validasi user ke Auth (pakai token langsung)
  const {
    data: { user },
  } = await sb.auth.getUser(access);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: res.headers }
    );
  }

  // 3) Role dari JWT claim dulu, fallback ke profiles via REST (Authorization: Bearer)
  const p = decodeJwtPayload<any>(access);
  let role = String(p?.user_metadata?.role ?? p?.app_metadata?.role ?? "")
    .toLowerCase()
    .trim();

  if (!role) {
    role = (await fetchProfileRoleWithRLS(access, user.id)) || "";
  }

  if (!ALLOWED.has(role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: res.headers }
    );
  }

  // 4) Admin client (instance)
  const admin =
    // @ts-ignore: kalau ekspor berupa fungsi pembuat client, panggil; kalau instance, pakai apa adanya
    typeof supabaseAdminExport === "function"
      ? // @ts-ignore
        supabaseAdminExport()
      : supabaseAdminExport;

  const monthStart = monthStartWIBISO();
  const prevStart = prevMonthStartISO(monthStart);

  // 5) Query poin bulan ini
  const { data: rows, error: rErr } = await admin
    .from("tech_month_points")
    .select(
      `
      technician_id,
      month_start,
      points,
      technicians:technician_id ( id, inisial, nama_panggilan, nama_lengkap )
    `
    )
    .eq("month_start", monthStart)
    .order("points", { ascending: false });

  if (rErr) {
    return NextResponse.json(
      { error: rErr.message },
      { status: 500, headers: res.headers }
    );
  }

  // 6) Ambil poin bulan sebelumnya untuk delta
  const techIds = (rows ?? []).map((r: any) => r.technician_id);
  const { data: prev, error: pErr } = await admin
    .from("tech_month_points")
    .select("technician_id, points")
    .eq("month_start", prevStart)
    .in(
      "technician_id",
      techIds.length ? techIds : ["00000000-0000-0000-0000-000000000000"]
    );
  if (pErr) {
    return NextResponse.json(
      { error: pErr.message },
      { status: 500, headers: res.headers }
    );
  }

  const prevMap = new Map<string, number>();
  for (const r of prev ?? [])
    prevMap.set(r.technician_id as string, r.points as number);

  const list = (rows ?? []).map((r: any, idx: number) => {
    const t = Array.isArray(r.technicians) ? r.technicians[0] : r.technicians;
    const name = t?.nama_panggilan && String(t.nama_panggilan).trim();
    const nama_lengkap =
      (t?.nama_lengkap && String(t.nama_lengkap).trim()) ||
      `Teknisi ${t?.nama_lengkap || ""}`;
    const points = r.points as number;
    const prevPoints = prevMap.get(r.technician_id as string) ?? 0;
    const delta = points - prevPoints;
    const trend: "up" | "down" | "flat" =
      delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return {
      rank: idx + 1,
      technicianId: r.technician_id as string,
      name,
      nama_lengkap,
      points,
      prevPoints,
      delta,
      trend,
    };
  });

  return NextResponse.json(
    { monthStart, prevMonthStart: prevStart, data: list },
    { headers: res.headers }
  );
}
