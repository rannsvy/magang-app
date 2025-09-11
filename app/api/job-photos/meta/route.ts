// app/api/job-photos/meta/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseMeter(input: unknown): number | null | undefined {
  // undefined => jangan sentuh kolom di DB
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string") {
    const n = Number(input.replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const jobId = body?.jobId as string | undefined;
    const categoryId = body?.categoryId as string | number | undefined;
    if (!jobId || categoryId === undefined) {
      return NextResponse.json(
        { error: "jobId & categoryId required" },
        { status: 400 }
      );
    }

    const payload: Record<string, any> = {
      job_id: jobId,
      category_id: String(categoryId),
      updated_at: new Date().toISOString(),
    };

    // serialNumber: terima string/number/null
    if (body.hasOwnProperty("serialNumber")) {
      const v = body.serialNumber;
      payload.serial_number =
        v === null || (typeof v === "string" && v.trim() === "")
          ? null
          : String(v).trim();
    }

    // meter (DALAM METER): terima number/string/null
    if (body.hasOwnProperty("meter")) {
      const m = parseMeter(body.meter);
      if (m !== undefined) payload.cable_meter = m; // null => clear, number => set
    }

    if (body.hasOwnProperty("ocrStatus")) {
      payload.ocr_status = String(body.ocrStatus);
    }

    const supabase = supabaseServer();
    const { error } = await supabase
      .from("job_photos")
      .upsert(payload, { onConflict: "job_id,category_id" });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Meta update failed" },
      { status: 500 }
    );
  }
}
