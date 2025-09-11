// app/api/technicians/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * PATCH /api/technicians/:id
 * Body: { code?, name?, initials?, email?, phone?, is_active? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();
    const {
      code,
      name,
      initials,
      email,
      phone,
      is_active,
    }: {
      code?: string | null;
      name?: string | null;
      initials?: string | null;
      email?: string | null;
      phone?: string | null;
      is_active?: boolean | null;
    } = body || {};

    const updatePayload: any = {};
    if (code !== undefined) updatePayload.code = code?.trim() || null;
    if (name !== undefined) {
      if (!name || String(name).trim().length === 0) {
        return NextResponse.json(
          { error: "Nama teknisi wajib diisi." },
          { status: 400 }
        );
      }
      updatePayload.name = name.trim();
    }
    if (initials !== undefined) {
      if (initials && String(initials).length > 4) {
        return NextResponse.json(
          { error: "Initials maksimal 4 karakter." },
          { status: 400 }
        );
      }
      updatePayload.initials = initials
        ? initials.toUpperCase().slice(0, 4)
        : null;
    }
    if (email !== undefined) updatePayload.email = email?.trim() || null;
    if (phone !== undefined) updatePayload.phone = phone?.trim() || null;
    if (is_active !== undefined && is_active !== null)
      updatePayload.is_active = !!is_active;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ message: "Tidak ada perubahan." });
    }

    const { data, error } = await supabaseAdmin
      .from("technicians")
      .update(updatePayload)
      .eq("id", id)
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
      { error: "Gagal mengubah teknisi" },
      { status: 500 }
    );
  }
}
