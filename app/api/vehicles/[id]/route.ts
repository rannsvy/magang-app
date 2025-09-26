// app/api/vehicles/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function makeSb(req: NextRequest, res: NextResponse) {
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
    }
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const res = new NextResponse();
  const sb = makeSb(req, res);
  const id = params.id;
  const body = await req.json().catch(() => ({} as any));

  const payload = {
    name:
      (body.name ?? `${body.brand ?? ""} ${body.model ?? ""}`.trim()) ||
      body.plate,
    brand: body.brand ?? body.merk ?? null,
    model: body.model ?? body.tipe ?? null,
    plate: body.plate ?? body.no_polisi ?? null,
    tax_paid_date: body.tax_paid_date ?? body.pajak_periode_ini ?? null,
    tax_due_date: body.tax_due_date ?? body.pajak_periode_berikutnya ?? null,
    active: typeof body.active === "boolean" ? body.active : true,
  };

  const { data, error } = await sb
    .from("vehicles")
    .update(payload)
    .eq("id", id)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400, headers: res.headers }
    );
  }
  return NextResponse.json(
    { data: { id: data!.id } },
    { headers: res.headers }
  );
}
