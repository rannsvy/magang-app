// app/api/technicians/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/technicians
 * Prefer view v_technicians_with_status; fallback ke technicians.
 */
export async function GET() {
  // 1) Coba dari VIEW
  const { data: vdata, error: verror } = await supabaseAdmin
    .from("v_technicians_with_status")
    .select("*")
    .order("code", { ascending: true });

  if (!verror && vdata) {
    const shaped = (vdata ?? []).map((t: any) => ({
      id: t.id as string,
      code: (t.code ?? null) as string | null,
      name: t.name as string,
      initial: ((t.initials ?? t.name?.[0] ?? "?") as string).toUpperCase(),
      email: t.email ?? "",
      phone: t.phone ?? "",
      joinDate:
        t.join_date ?? (t.created_at ? String(t.created_at).slice(0, 10) : ""),
      status: (t.current_status ?? "Di_Kantor") as
        | "Di_Kantor"
        | "ditugaskan"
        | "selesai",
    }));
    return NextResponse.json({ data: shaped });
  }

  // 2) Fallback ke tabel technicians
  const { data, error } = await supabaseAdmin
    .from("technicians")
    .select("id, code, name, initials, created_at, email, phone")
    .order("code", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shaped = (data ?? []).map((t: any) => ({
    id: t.id as string,
    code: (t.code ?? null) as string | null,
    name: t.name as string,
    initial: ((t.initials ?? t.name?.[0] ?? "?") as string).toUpperCase(),
    email: t.email ?? "",
    phone: t.phone ?? "",
    joinDate: t.created_at ? String(t.created_at).slice(0, 10) : "",
    status: "Di_Kantor" as const,
  }));

  return NextResponse.json({ data: shaped });
}

/**
 * POST /api/technicians
 * Body: { code?, name*, initials?, email?, phone?, is_active? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      code,
      name,
      initials,
      email,
      phone,
      is_active = true,
    }: {
      code?: string | null;
      name: string;
      initials?: string | null;
      email?: string | null;
      phone?: string | null;
      is_active?: boolean;
    } = body || {};

    if (!name || String(name).trim().length === 0) {
      return NextResponse.json(
        { error: "Nama teknisi wajib diisi." },
        { status: 400 }
      );
    }
    if (initials && String(initials).length > 4) {
      return NextResponse.json(
        { error: "Initials maksimal 4 karakter." },
        { status: 400 }
      );
    }

    const insertPayload: any = {
      name: name.trim(),
      is_active: !!is_active,
    };
    if (code !== undefined) insertPayload.code = code?.trim() || null;
    if (initials !== undefined)
      insertPayload.initials = initials?.toUpperCase().slice(0, 4) || null;
    if (email !== undefined) insertPayload.email = email?.trim() || null;
    if (phone !== undefined) insertPayload.phone = phone?.trim() || null;

    const { data, error } = await supabaseAdmin
      .from("technicians")
      .insert(insertPayload)
      .select("id, code, name, initials, created_at, email, phone")
      .single();

    if (error) {
      const msg =
        (error as any).code === "23505"
          ? "Kode teknisi sudah digunakan."
          : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const shaped = {
      id: data!.id,
      code: data!.code ?? null,
      name: data!.name,
      initial: (
        (data!.initials ?? data!.name?.[0] ?? "?") as string
      ).toUpperCase(),
      email: data!.email ?? "",
      phone: data!.phone ?? "",
      joinDate: data!.created_at ? String(data!.created_at).slice(0, 10) : "",
      status: "Di_Kantor" as const,
    };

    return NextResponse.json({ data: shaped });
  } catch {
    return NextResponse.json(
      { error: "Gagal menambah teknisi" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/technicians?id=<uuid>
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const technicianId = searchParams.get("id");

    if (!technicianId) {
      return NextResponse.json(
        { error: "ID teknisi diperlukan" },
        { status: 400 }
      );
    }

    // Cegah hapus bila masih ada assignment aktif
    const { count, error: chkErr } = await supabaseAdmin
      .from("project_assignments")
      .select("id", { count: "exact", head: true })
      .eq("technician_id", technicianId)
      .is("removed_at", null);

    if (chkErr) {
      return NextResponse.json({ error: chkErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Teknisi masih memiliki penugasan aktif." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("technicians")
      .delete()
      .eq("id", technicianId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Teknisi berhasil dihapus" });
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan saat menghapus teknisi" },
      { status: 500 }
    );
  }
}
