import { NextResponse } from "next/server";
import { getDetail } from "@/lib/pogClient";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "paket").toLowerCase() as
      | "paket"
      | "npkt";
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const data = await getDetail(type, id);
    return NextResponse.json({ type, id, data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed" },
      { status: 500 }
    );
  }
}
