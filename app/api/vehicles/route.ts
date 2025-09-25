// app/api/vehicles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/* ================== Helpers ================== */
function computeStatusPajakServer(
  paid?: string | null,
  due?: string | null
): "Aktif" | "Mati" {
  if (!due) return "Mati";
  const dDue = new Date(String(due));
  if (paid) {
    const dPaid = new Date(String(paid));
    if (isFinite(dPaid.getTime()) && isFinite(dDue.getTime()) && dPaid > dDue) {
      return "Mati";
    }
  }
  const today = new Date();
  return isFinite(dDue.getTime()) && today > dDue ? "Mati" : "Aktif";
}

function mapRowToUI(v: any) {
  return {
    id: v.vehicle_code ?? v.id, // prioritaskan code agar stabil
    merk: v.brand ?? "",
    tipe: v.model ?? "",
    no_polisi: v.plate ?? "",
    pajak_periode_ini: v.tax_paid_date ?? null,
    pajak_periode_berikutnya: v.tax_due_date ?? null,
    status_pajak: computeStatusPajakServer(v.tax_paid_date, v.tax_due_date),
  };
}

/** Baca access token dari berbagai skema cookie yang kamu gunakan */
function readAccessTokenFromCookies(req: NextRequest): string | null {
  const c = req.cookies;

  // 1) Cookie custom yang kamu set di middleware
  //    - "access_token"
  //    - "sb-access-token"
  const direct =
    c.get("access_token")?.value || c.get("sb-access-token")?.value;
  if (direct) return direct;

  // 2) Format auth-helpers baru: "sb-<ref>-auth-token" (berupa JSON)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const m = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  const ref = m ? m[1] : null;
  if (ref) {
    const name = `sb-${ref}-auth-token`;
    const raw = c.get(name)?.value;
    if (raw) {
      // Bisa jadi plain JSON atau "base64-<json>"
      let txt = raw;
      if (txt.startsWith("base64-")) {
        const b64 = txt.slice(7);
        try {
          // @ts-ignore
          txt = Buffer.from(b64, "base64").toString("utf8");
        } catch {
          /* noop */
        }
      }
      try {
        const obj = JSON.parse(txt);
        if (obj?.currentSession?.access_token) {
          return String(obj.currentSession.access_token);
        }
        if (obj?.access_token) return String(obj.access_token);
      } catch {
        // abaikan parse error
      }
    }
  }

  // 3) Nama lama yang kadang muncul
  const legacy =
    c.get("supabase-access-token")?.value ||
    c.get("supabase-auth-token")?.value;
  if (legacy) return legacy;

  return null;
}

/** Buat Supabase client + propagate cookies */
function makeSb(req: NextRequest, res: NextResponse) {
  const access = readAccessTokenFromCookies(req);

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      // ⬇️ KUNCI PERBAIKAN: pakai token user agar RLS & getUser() jalan
      global: {
        headers: access ? { Authorization: `Bearer ${access}` } : {},
      },
    }
  );
}

/* ================== Handlers ================== */
export async function GET(req: NextRequest) {
  const res = new NextResponse();
  const sb = makeSb(req, res);

  // Wajib login
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();

  if (userErr) {
    return NextResponse.json(
      { error: userErr.message || "Auth error" },
      { status: 401, headers: res.headers }
    );
  }
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: res.headers }
    );
  }

  const { data: rows, error } = await sb
    .from("vehicles")
    .select(
      "id, vehicle_code, brand, model, plate, tax_paid_date, tax_due_date, active"
    )
    .eq("active", true)
    .order("vehicle_code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Gagal mengambil data kendaraan" },
      { status: 500, headers: res.headers }
    );
  }

  const mapped = (rows ?? []).map(mapRowToUI);
  return NextResponse.json({ data: mapped }, { headers: res.headers });
}

export async function POST(req: NextRequest) {
  const res = new NextResponse();
  const sb = makeSb(req, res);

  // Wajib login
  const {
    data: { user },
    error: userErr,
  } = await sb.auth.getUser();

  if (userErr) {
    return NextResponse.json(
      { error: userErr.message || "Auth error" },
      { status: 401, headers: res.headers }
    );
  }
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: res.headers }
    );
  }

  const body = await req.json().catch(() => ({} as any));

  // terima gaya payload baru & lama
  const brand = body.brand ?? body.merk ?? null;
  const model = body.model ?? body.tipe ?? null;
  const plate = body.plate ?? body.no_polisi;
  const paid = body.tax_paid_date ?? body.pajak_periode_ini ?? null;
  const due = body.tax_due_date ?? body.pajak_periode_berikutnya ?? null;

  if (!plate || String(plate).trim() === "") {
    return NextResponse.json(
      { error: "Field 'plate' (no_polisi) wajib diisi." },
      { status: 400, headers: res.headers }
    );
  }

  const nameRaw = body.name ?? `${brand ?? ""} ${model ?? ""}`.trim();
  const name = nameRaw || String(plate);

  const { data, error } = await sb
    .from("vehicles")
    .insert([
      {
        name,
        brand,
        model,
        plate,
        tax_paid_date: paid,
        tax_due_date: due,
        active: body.active ?? true,
      },
    ])
    .select(
      "id, vehicle_code, brand, model, plate, tax_paid_date, tax_due_date, active"
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Gagal menambahkan kendaraan" },
      { status: 500, headers: res.headers }
    );
  }

  return NextResponse.json(
    { data: mapRowToUI(data) },
    { status: 201, headers: res.headers }
  );
}
