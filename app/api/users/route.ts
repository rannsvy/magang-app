// app/api/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD?.trim() || "123456"; // min 6 char

type RoleFilter = "all" | "gm" | "manager" | "spv" | "sales" | "teknisi";

function toUserRow(x: any, role: RoleFilter) {
  return {
    id: String(x.id),
    nama_panggilan:
      x.nama_panggilan ?? x.nickname ?? x.full_name ?? x.nama ?? "",
    nama_lengkap: x.full_name ?? x.nama_lengkap ?? x.nama ?? "",
    email: x.email ?? "",
    phone: x.telepon ?? x.phone ?? "",
    is_active: x.aktif ?? true,
    role,
  };
}

export async function GET(req: NextRequest) {
  const role = (new URL(req.url).searchParams.get("role") ??
    "all") as RoleFilter;

  const salesQ =
    role === "sales" || role === "all"
      ? supabaseAdmin
          .from("sales")
          .select("id, nama_lengkap, nama_panggilan, email, telepon, aktif")
          .eq("aktif", true)
      : null;

  const supvRoles =
    role === "gm"
      ? ["GM", "General Manager"]
      : role === "manager"
      ? ["Manager"]
      : role === "spv"
      ? ["Supervisor"]
      : role === "all"
      ? ["GM", "General Manager", "Manager", "Supervisor"]
      : [];

  const supvQ =
    supvRoles.length > 0
      ? supabaseAdmin
          .from("supervisors")
          .select("id, full_name, nickname, email, role")
          .in("role", supvRoles)
      : null;

  const results: any[] = [];

  if (salesQ) {
    const { data, error } = await salesQ;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    for (const x of data ?? []) results.push(toUserRow(x, "sales"));
  }

  if (supvQ) {
    const { data, error } = await supvQ;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    for (const x of data ?? [])
      results.push(
        toUserRow(
          {
            ...x,
            nama_lengkap: x.full_name,
            nama_panggilan: x.nickname,
            telepon: null,
            aktif: true,
          },
          x.role?.toLowerCase() === "manager"
            ? "manager"
            : x.role?.toLowerCase().includes("gm")
            ? "gm"
            : "spv"
        )
      );
  }

  return NextResponse.json({ data: results });
}

/**
 * POST /api/users
 * Body:
 * { role_key: "sales"|"spv"|"manager"|"gm"|"teknisi", nama_lengkap, nama_panggilan?, email*, phone?, inisial? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role: RoleFilter = (body?.role_key ?? "").toLowerCase() as any;

    const email: string = String(body?.email ?? "").trim();
    if (!email) {
      return NextResponse.json(
        { error: "Email wajib diisi untuk membuat akun." },
        { status: 400 }
      );
    }

    const nama_lengkap: string = String(
      body?.nama_lengkap ?? body?.full_name ?? ""
    ).trim();
    const nama_panggilan: string | null = body?.nama_panggilan ?? null;

    if (!nama_lengkap) {
      return NextResponse.json(
        { error: "Nama lengkap wajib diisi." },
        { status: 400 }
      );
    }

    // 1) Buat row per role
    let createdRoleRowId: string | null = null;

    if (role === "sales") {
      const { data, error } = await supabaseAdmin
        .from("sales")
        .insert({
          nama_lengkap,
          nama_panggilan,
          email,
          telepon: body?.phone ?? null,
          aktif: true,
        })
        .select("id")
        .single();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
      createdRoleRowId = String(data.id);
    } else if (role === "gm" || role === "manager" || role === "spv") {
      const supvRole =
        role === "gm" ? "GM" : role === "manager" ? "Manager" : "Supervisor";
      const { data, error } = await supabaseAdmin
        .from("supervisors")
        .insert({
          full_name: nama_lengkap,
          nickname: nama_panggilan ?? nama_lengkap.split(" ")[0],
          email,
          role: supvRole,
        })
        .select("id")
        .single();
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
      createdRoleRowId = String(data.id);
    } else if (role === "teknisi") {
      const inisialRaw: string | null = body?.inisial ?? null;
      const inisial =
        inisialRaw
          ?.toString()
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, 2) || null;

      const { data, error } = await supabaseAdmin
        .from("technicians")
        .insert({
          nama_lengkap,
          inisial,
          email,
          telepon: body?.phone ?? null,
          aktif: true,
          nama_panggilan,
        })
        .select("id")
        .single();

      if (error) {
        const msg =
          (error as any).code === "23505"
            ? "Inisial teknisi telah digunakan."
            : error.message;
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      createdRoleRowId = String(data.id);
    } else {
      return NextResponse.json(
        { error: "role_key tidak dikenali." },
        { status: 400 }
      );
    }

    // 2) Buat akun Auth
    const { data: authData, error: authErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          app_role: role,
          full_name: nama_lengkap,
        },
      });

    if (authErr || !authData?.user) {
      return NextResponse.json(
        { error: authErr?.message || "Gagal membuat akun auth." },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // 3) Sinkron ke profiles dengan strategi "cek lalu update/insert"
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, email, technician_id, supervisor_id, sales_id")
      .eq("id", userId)
      .maybeSingle();

    // siapkan payload bersih (null-kan kolom role lain untuk hindari unique partial idx)
    const basePatch: any = {
      role: role === "gm" ? "gm" : role,
      email,
      technician_id: null,
      supervisor_id: null,
      sales_id: null,
    };
    if (role === "sales") basePatch.sales_id = createdRoleRowId;
    if (role === "teknisi") basePatch.technician_id = createdRoleRowId;
    if (role === "gm" || role === "manager" || role === "spv")
      basePatch.supervisor_id = createdRoleRowId;

    if (existingProfile) {
      // UPDATE
      const { error: profUpdErr } = await supabaseAdmin
        .from("profiles")
        .update(basePatch)
        .eq("id", userId);

      if (profUpdErr) {
        return NextResponse.json(
          {
            error:
              "Akun auth dibuat, namun gagal meng-update profile: " +
              profUpdErr.message,
          },
          { status: 500 }
        );
      }
    } else {
      // INSERT (atau bisa .upsert({...}, { onConflict: "id" }))
      const { error: profInsErr } = await supabaseAdmin
        .from("profiles")
        .insert({ id: userId, ...basePatch });

      if (profInsErr) {
        return NextResponse.json(
          {
            error:
              "Akun auth dibuat, namun gagal membuat profile: " +
              profInsErr.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      data: {
        id: userId,
        email,
        role,
        profile_linked_id: createdRoleRowId,
      },
      default_password_used: DEFAULT_PASSWORD,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal membuat user" },
      { status: 500 }
    );
  }
}
