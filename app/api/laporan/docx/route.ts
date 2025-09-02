// app/api/laporan/docx/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule, {
  ImageModuleOptions,
} from "docxtemplater-image-module-free";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/* ===================== Supabase (server) ===================== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSrvKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseSrvKey);

/* ===================== Konstanta ===================== */
const BLANK_IMAGE_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";

// Pemetaan label → nama file di /public/report-templates
// KEY sudah DISANITIZE (lowercase & non-alnum dihapus)
const TEMPLATE_FILE_MAP: Record<string, string> = {
  templatecctvrtrw: "Template_CCTV_RTRW.docx",
  templatebca: "Template_BCA.docx",
  templatemandiri: "Template_Mandiri.docx",
  templatebni: "Template_BNI.docx",
};

/* ===================== Utils ===================== */
const tplDir = () => path.join(process.cwd(), "public", "report-templates");
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Ambil file template sebagai STRING BINER (latin1) */
async function readTemplateBinaryString(
  req: NextRequest,
  filename: string
): Promise<string> {
  const full = path.join(tplDir(), path.basename(filename));

  // 1) Baca langsung dari filesystem (Node)
  try {
    const bin = await fs.readFile(full, { encoding: "binary" });
    return bin; // ← string biner (BUKAN Promise/Buffer)
  } catch {
    // 2) Fallback: fetch dari public URL (dev tertentu)
    const url = new URL(
      `/report-templates/${encodeURIComponent(filename)}`,
      req.url
    );
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Gagal fetch template: ${url.toString()}`);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab).toString("binary");
  }
}

/** Prefetch image URL jadi data URL (base64) agar getImage sinkron */
async function fetchToDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Gagal fetch image: ${url}`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const ab = await r.arrayBuffer();
  const b64 = Buffer.from(new Uint8Array(ab)).toString("base64");
  return `data:${ct};base64,${b64}`;
}

/** Image module (sinkron) */
function buildImageModule(): ImageModule {
  return new ImageModule({
    getImage: (tagValue: string) => {
      try {
        if (!tagValue) return Buffer.from([]);
        // kita pastikan tagValue sudah data:URL
        if (tagValue.startsWith("data:")) {
          const base64 = tagValue.split(",")[1] ?? "";
          return Buffer.from(base64, "base64");
        }
        // fallback: blank
        const base64 = BLANK_IMAGE_DATAURL.split(",")[1] ?? "";
        return Buffer.from(base64, "base64");
      } catch {
        const base64 = BLANK_IMAGE_DATAURL.split(",")[1] ?? "";
        return Buffer.from(base64, "base64");
      }
    },
    getSize: () => [480, 360],
  } as ImageModuleOptions);
}

// GANTI seluruh fungsi ini di app/api/laporan/docx/route.ts
async function resolveTemplateFilenameByLabel(label: string): Promise<string> {
  // default aman
  if (!label) return "Template_CCTV_RTRW.docx";

  const trimmed = label.trim();

  // 1) Jika label tampak seperti NAMA FILE .docx → pakai langsung jika ada
  const maybeFile = path.basename(trimmed);
  if (maybeFile.toLowerCase().endsWith(".docx")) {
    try {
      await fs.access(path.join(tplDir(), maybeFile));
      return maybeFile; // ketemu file persis
    } catch {
      // lanjutkan ke heuristik di bawah
    }
  }

  // 2) Coba lewat map eksplisit (label disanitasi)
  const key = sanitize(trimmed); // "Template BCA" -> "templatebca"
  if (TEMPLATE_FILE_MAP[key]) return TEMPLATE_FILE_MAP[key];

  // 3) Scan folder template
  const files = await fs.readdir(tplDir());
  const docx = files.filter((f) => f.toLowerCase().endsWith(".docx"));

  // 3a) exact match setelah sanitize (tanpa ekstensi)
  for (const f of docx) {
    const base = path.basename(f, ".docx");
    if (sanitize(base) === key) return f;
  }

  // 3b) contains dua arah (lebih fleksibel)
  for (const f of docx) {
    const baseSan = sanitize(path.basename(f, ".docx"));
    if (baseSan.includes(key) || key.includes(baseSan)) return f;
  }

  // 3c) coba variasi dengan/ tanpa prefix "template "
  const altKeys = [
    sanitize(`template ${trimmed}`),
    sanitize(trimmed.replace(/^template\s+/i, "")),
  ];
  for (const f of docx) {
    const s = sanitize(path.basename(f, ".docx"));
    if (altKeys.includes(s)) return f;
  }

  // 4) fallback default
  return "Template_CCTV_RTRW.docx";
}

async function resolveTemplateFromDB(jobId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("template_key")
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[docx] gagal query template project:", error);
    return "Template_CCTV_RTRW.docx";
  }
  const label = (data?.template_key as string) ?? "";
  return await resolveTemplateFilenameByLabel(label);
}

async function resolveTemplateFilename(
  jobId: string,
  templateKeyParam?: string
): Promise<string> {
  if (templateKeyParam) {
    // kalau ini nama file yang ada → langsung pakai
    const candidate = path.basename(templateKeyParam);
    try {
      await fs.access(path.join(tplDir(), candidate));
      return candidate;
    } catch {
      // kalau bukan file → anggap label
      return resolveTemplateFilenameByLabel(templateKeyParam);
    }
  }
  // kalau tidak ada param → baca dari DB berdasarkan jobId
  return resolveTemplateFromDB(jobId);
}

/* ===================== Foto loader ===================== */
async function loadPhotos(req: NextRequest, jobId: string) {
  // coba /api/job-photos/[jobId]
  let res = await fetch(
    new URL(`/api/job-photos/${encodeURIComponent(jobId)}`, req.url),
    {
      cache: "no-store",
    }
  );

  if (!res.ok) {
    // fallback /api/job-photos?jobId=
    const alt = new URL(`/api/job-photos`, req.url);
    alt.searchParams.set("jobId", jobId);
    res = await fetch(alt, { cache: "no-store" });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Gagal ambil data foto");
  }

  const data = await res.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
    ? data.items
    : [];

  type Item = {
    id: string | number;
    photo?: string | null;
    photoThumb?: string | null;
    serialNumber?: string | null;
    meter?: number | null;
  };

  return (items as Item[]).map((it) => ({
    category_id: String(it.id),
    url: (it.photoThumb || it.photo || null) as string | null, // tampilkan thumb jika ada
    serial_number: it.serialNumber ?? null,
    cable_meter: it.meter ?? null,
  }));
}

/* ===================== Generator ===================== */
async function generateDocx(
  req: NextRequest,
  jobId: string,
  templateKeyParam?: string
) {
  if (!jobId) throw new Error("jobId wajib diisi");

  // 1) Tentukan file template (dari param atau DB)
  const templateFilename = await resolveTemplateFilename(
    jobId,
    templateKeyParam
  );

  // 2) Baca template sebagai STRING BINER
  const templateBinary = await readTemplateBinaryString(req, templateFilename);

  // Safety: pastikan bukan Promise (penyebab utama error PizZip)
  if (templateBinary && typeof (templateBinary as any).then === "function") {
    throw new Error(
      "Internal: templateBinary masih Promise (harusnya sudah di-await)."
    );
  }

  // 3) Ambil foto + PREFETCH semua URL → data URL (agar getImage sinkron)
  const photoRows = await loadPhotos(req, jobId);

  const data: Record<string, any> = {};
  for (const r of photoRows) {
    const id = String(r.category_id);

    // photo → jadikan data:URL (prefetch)
    let photoDataUrl = BLANK_IMAGE_DATAURL;
    if (r.url) {
      if (r.url.startsWith("data:")) {
        photoDataUrl = r.url;
      } else {
        try {
          photoDataUrl = await fetchToDataUrl(r.url);
        } catch {
          photoDataUrl = BLANK_IMAGE_DATAURL;
        }
      }
    }
    data[`photo_${id}`] = photoDataUrl;

    if (r.serial_number) data[`sn_${id}`] = r.serial_number;
    if (typeof r.cable_meter === "number")
      data[`meter_${id}`] = String(r.cable_meter);
  }

  // 4) Buat zip dari STRING BINER (bukan Buffer/Promise)
  const zip = new PizZip(templateBinary);

  // 5) Render dokumen (v4: pakai modules & render(data))
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [buildImageModule()],
  });

  try {
    doc.render(data);
  } catch (e: any) {
    // debugging nyaman
    const errs = e?.properties?.errors as Array<any> | undefined;
    if (errs?.length) {
      console.error("[docx] render errors:");
      for (const er of errs) {
        console.error(`- ${er.properties?.id}: ${er.properties?.explanation}`);
      }
    } else {
      console.error("[docx] render error:", e);
    }
    throw e;
  }

  // 6) Kirim hasil
  const out = doc.getZip().generate({ type: "arraybuffer" });
  return new NextResponse(out, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="laporan-${jobId}.docx"`,
    },
  });
}

/* ===================== Handlers ===================== */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || "");
    const templateKey =
      (body?.templateKey && String(body.templateKey)) ||
      (body?.template_key && String(body.template_key)) ||
      undefined; // opsional

    return await generateDocx(req, jobId, templateKey);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal generate dokumen" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const jobId = String(req.nextUrl.searchParams.get("jobId") || "");
    // override opsional via ?template_key= / ?templateKey=
    const templateKey =
      req.nextUrl.searchParams.get("template_key") ||
      req.nextUrl.searchParams.get("templateKey") ||
      undefined;

    return await generateDocx(req, jobId, templateKey);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal generate dokumen" },
      { status: 500 }
    );
  }
}
