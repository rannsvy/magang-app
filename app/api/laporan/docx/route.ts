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
import { COMPONENT_TEMPLATE, COMPONENT_ROWS } from "@/lib/componentTemplate";

export const runtime = "nodejs";

/* ===================== Supabase (server) ===================== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSrvKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseSrvKey);

/* ===================== Konstanta ===================== */
const IMG_BOX_W = 220;
const IMG_BOX_H = 150;

const BLANK_IMAGE_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";

const TEMPLATE_FILE_MAP: Record<string, string> = {
  templatecctvrtrw: "Template_CCTV_RTRW.docx",
  templatebca: "Template_BCA.docx",
  templatemandiri: "Template_Mandiri.docx",
  templatebni: "Template_BNI.docx",
};

const REPORT_BUCKET = "generated-reports";

/* ===================== Utils ===================== */
const tplDir = () => path.join(process.cwd(), "public", "report-templates");
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function ensureReportBucket() {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    if (!buckets?.some((b) => b.name === REPORT_BUCKET)) {
      await supabase.storage.createBucket(REPORT_BUCKET, {
        public: true,
        fileSizeLimit: "50MB",
      });
    }
  } catch (e) {
    console.warn("[docx] ensureReportBucket warn:", e);
  }
}

async function readTemplateBinaryString(
  req: NextRequest,
  filename: string
): Promise<string> {
  const full = path.join(tplDir(), path.basename(filename));
  try {
    const bin = await fs.readFile(full, { encoding: "binary" });
    return bin;
  } catch {
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

async function fetchToDataUrl(url: string): Promise<string> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Gagal fetch image: ${url}`);
    const ct = r.headers.get("content-type") || "image/jpeg";
    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(new Uint8Array(ab)).toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch (error) {
    console.warn("[docx] fetchToDataUrl failed:", error);
    return BLANK_IMAGE_DATAURL;
  }
}

function buildImageModule(): ImageModule {
  return new ImageModule({
    getImage: (tagValue: string) => {
      try {
        const src = tagValue || BLANK_IMAGE_DATAURL;
        const base64 = src.startsWith("data:")
          ? src.split(",")[1] ?? ""
          : BLANK_IMAGE_DATAURL.split(",")[1] ?? "";
        return Buffer.from(base64, "base64");
      } catch (error) {
        console.warn("[docx] buildImageModule getImage failed:", error);
        return Buffer.from(BLANK_IMAGE_DATAURL.split(",")[1] ?? "", "base64");
      }
    },
    getSize: () => [IMG_BOX_W, IMG_BOX_H],
  } as ImageModuleOptions);
}

/* ===================== Resolusi template ===================== */
async function resolveTemplateFilenameByLabel(label: string): Promise<string> {
  if (!label) return "Template_CCTV_RTRW.docx";
  const trimmed = label.trim();

  const maybeFile = path.basename(trimmed);
  if (maybeFile.toLowerCase().endsWith(".docx")) {
    try {
      await fs.access(path.join(tplDir(), maybeFile));
      return maybeFile;
    } catch {}
  }

  const key = sanitize(trimmed);
  if (TEMPLATE_FILE_MAP[key]) return TEMPLATE_FILE_MAP[key];

  try {
    const files = await fs.readdir(tplDir());
    const docx = files.filter((f) => f.toLowerCase().endsWith(".docx"));

    for (const f of docx) {
      const base = path.basename(f, ".docx");
      if (sanitize(base) === key) return f;
    }
    for (const f of docx) {
      const baseSan = sanitize(path.basename(f, ".docx"));
      if (baseSan.includes(key) || key.includes(baseSan)) return f;
    }

    const altKeys = [
      sanitize(`template ${trimmed}`),
      sanitize(trimmed.replace(/^template\s+/i, "")),
    ];
    for (const f of docx) {
      const s = sanitize(path.basename(f, ".docx"));
      if (altKeys.includes(s)) return f;
    }
  } catch (error) {
    console.warn(
      "[docx] resolveTemplateFilenameByLabel readdir failed:",
      error
    );
  }

  return "Template_CCTV_RTRW.docx";
}

async function resolveTemplateFromDB(jobId: string): Promise<string> {
  try {
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
  } catch (error) {
    console.error("[docx] resolveTemplateFromDB failed:", error);
    return "Template_CCTV_RTRW.docx";
  }
}

async function resolveTemplateFilename(
  jobId: string,
  templateKeyParam?: string
): Promise<string> {
  if (templateKeyParam) {
    const candidate = path.basename(templateKeyParam);
    try {
      await fs.access(path.join(tplDir(), candidate));
      return candidate;
    } catch {
      return resolveTemplateFilenameByLabel(templateKeyParam);
    }
  }
  return resolveTemplateFromDB(jobId);
}

/* ===================== Loader foto + SN + meter ===================== */
type RowMerged = {
  category_id: string;
  url: string | null;
  serial_number: string | null;
  cable_meter: number | null;
};

const asNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function loadPhotosMerged(
  req: NextRequest,
  jobId: string
): Promise<RowMerged[]> {
  let apiItems: RowMerged[] = [];
  try {
    let res = await fetch(
      new URL(`/api/job-photos/${encodeURIComponent(jobId)}`, req.url),
      {
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const alt = new URL(`/api/job-photos`, req.url);
      alt.searchParams.set("jobId", jobId);
      res = await fetch(alt, { cache: "no-store" });
    }
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : [];
      apiItems = (items as any[]).map((it) => ({
        category_id: String(it.id),
        url: (it.photoThumb || it.photo || null) as string | null,
        serial_number: (it.serialNumber ?? null) as string | null,
        cable_meter: asNum(it.meter),
      }));
    }
  } catch (error) {
    console.warn("[docx] loadPhotosMerged API failed:", error);
  }

  const rowsFromDb: RowMerged[] = [];
  try {
    const { data: dbRows } = await supabase
      .from("job_photos")
      .select("category_id, url, thumb_url, serial_number, cable_meter")
      .eq("job_id", jobId);

    for (const r of (dbRows || []) as any[]) {
      rowsFromDb.push({
        category_id: String(r.category_id),
        url: (r.thumb_url || r.url || null) as string | null,
        serial_number: (r.serial_number ?? null) as string | null,
        cable_meter: asNum(r.cable_meter),
      });
    }
  } catch (error) {
    console.warn("[docx] loadPhotosMerged DB failed:", error);
  }

  const byId = new Map<string, RowMerged>();
  for (const r of [...rowsFromDb, ...apiItems]) {
    const cur = byId.get(r.category_id);
    byId.set(r.category_id, {
      category_id: r.category_id,
      url: cur?.url ?? r.url ?? null,
      serial_number: cur?.serial_number ?? r.serial_number ?? null,
      cable_meter: cur?.cable_meter ?? r.cable_meter ?? null,
    });
  }
  return Array.from(byId.values());
}

/* ===================== Otomasi komponen & label (AMAN) ===================== */
type ComponentItem = {
  kebutuhan: string;
  qty: number | string;
  satuan: string;
};

const escapeXml = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function getCellText(cellXml?: string): string {
  if (!cellXml) return "";
  try {
    const ts = cellXml.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
    return ts
      .map((m) => m.replace(/<w:t[^>]*>/g, "").replace(/<\/w:t>/g, ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  } catch (error) {
    console.warn("[docx] getCellText failed:", error);
    return "";
  }
}

const findCellIndex = (cellsXml: string[], names: string[]) => {
  try {
    const lowers = names.map((x) => x.toLowerCase());
    for (let i = 0; i < cellsXml.length; i++) {
      const t = getCellText(cellsXml[i]).toLowerCase();
      if (lowers.some((n) => t === n || t.includes(n))) return i;
    }
    return -1;
  } catch (error) {
    console.warn("[docx] findCellIndex failed:", error);
    return -1;
  }
};

function replaceCellText(cellXml: string, text: string) {
  try {
    const lines = String(text ?? "")
      .split(/\r?\n/)
      .map(escapeXml);

    // ganti <w:t> pertama dan tambahkan <w:br/> untuk baris berikutnya
    if (/<w:t[^>]*>[\s\S]*?<\/w:t>/.test(cellXml)) {
      let done = false;
      const out = cellXml.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, () => {
        done = true;
        const first = lines[0] ?? "";
        const tail =
          lines
            .slice(1)
            .map((l) => `<w:br/><w:t xml:space="preserve">${l}</w:t>`)
            .join("") || "";
        return `<w:t xml:space="preserve">${first}</w:t>${tail}`;
      });
      if (done) return out;
    }

    // kalau tak ada <w:t>, buat paragraf minimal
    const runs = lines
      .map((l, i) =>
        i === 0
          ? `<w:r><w:t xml:space="preserve">${l}</w:t></w:r>`
          : `<w:r><w:br/><w:t xml:space="preserve">${l}</w:t></w:r>`
      )
      .join("");
    return cellXml.replace(
      /(<w:tc[^>]*>)([\s\S]*?)(<\/w:tc>)/,
      (_full, open, _inner, close) => `${open}<w:p>${runs}</w:p>${close}`
    );
  } catch (error) {
    console.warn("[docx] replaceCellText failed:", error);
    return cellXml;
  }
}

function setCellTextByIndex(rowXml: string, cellIndex: number, value: string) {
  if (cellIndex < 0) return rowXml;

  try {
    const re = /<w:tc[\s\S]*?<\/w:tc>/g;
    let m: RegExpExecArray | null;
    let i = 0;
    let cursor = 0;
    const parts: string[] = [];
    while ((m = re.exec(rowXml))) {
      const before = rowXml.slice(cursor, m.index);
      if (i === cellIndex) {
        const newCell = replaceCellText(m[0], String(value ?? ""));
        parts.push(before, newCell);
        cursor = m.index + m[0].length;
        parts.push(rowXml.slice(cursor));
        return parts.join("");
      }
      i++;
      cursor = m.index + m[0].length;
    }
    return rowXml;
  } catch (error) {
    console.warn("[docx] setCellTextByIndex failed:", error);
    return rowXml;
  }
}

/** Bongkar tabel → {open, inner, close, rows[]} untuk rebuild aman */
function dissectTable(tblXml: string) {
  try {
    const m = tblXml.match(/^(<w:tbl[\s\S]*?>)([\s\S]*?)(<\/w:tbl>)$/);
    if (!m) return null;
    const [, open, inner, close] = m;
    const rows: { xml: string; start: number; end: number }[] = [];
    const re = /<w:tr[\s\S]*?<\/w:tr>/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(inner))) {
      rows.push({
        xml: mm[0],
        start: mm.index!,
        end: mm.index! + mm[0].length,
      });
    }
    return { open, inner, close, rows };
  } catch (error) {
    console.warn("[docx] dissectTable failed:", error);
    return null;
  }
}

/** Auto-isi tabel komponen bila TIDAK ada {#components} di template */
function autoFillComponentsTableIfNoPlaceholders(
  zip: PizZip,
  components: ComponentItem[]
) {
  if (!components?.length) return;

  const DOC_PATH = "word/document.xml";
  let xml = zip.file(DOC_PATH)?.asText() ?? "";
  if (!xml) return;

  try {
    // Basic XML validation
    if (!xml.includes("<w:document") || !xml.includes("</w:document>")) {
      console.warn("[docx] Invalid document XML structure, skipping auto-fill");
      return;
    }

    // kalau template sudah menyediakan loop, biarkan Docxtemplater
    if (/{#\s*components\s*}/i.test(xml)) return;

    const tblRe = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    let m: RegExpExecArray | null;
    let replaced = false;

    while ((m = tblRe.exec(xml))) {
      const tblXml = m[0];
      const dissect = dissectTable(tblXml);
      if (!dissect || dissect.rows.length === 0) continue;

      const header = dissect.rows[0].xml;
      const headerCells = header.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
      if (headerCells.length < 3) continue;

      const iNo = findCellIndex(headerCells, ["no", "no.", "nomor"]);
      const iKeb = findCellIndex(headerCells, [
        "kebutuhan",
        "uraian",
        "deskripsi",
        "komponen",
        "nama komponen",
      ]);
      const iQty = findCellIndex(headerCells, ["qty", "jumlah", "qty."]);
      const iSat = findCellIndex(headerCells, ["satuan", "unit"]);

      const score = [iNo, iKeb, iQty, iSat].filter((x) => x >= 0).length;
      if (score < 3) continue;

      // baris terakhir sebagai template
      const templateRow =
        dissect.rows[dissect.rows.length - 1]?.xml ?? dissect.rows[0].xml;

      const bodyRowsXml = components
        .map((it, idx) => {
          let row = templateRow;
          row = setCellTextByIndex(row, iNo, String(idx + 1));
          row = setCellTextByIndex(row, iKeb, String(it.kebutuhan ?? ""));
          row = setCellTextByIndex(row, iQty, String(it.qty ?? ""));
          row = setCellTextByIndex(row, iSat, String(it.satuan ?? ""));
          return row;
        })
        .join("");

      // rangkai ulang inner
      const beforeRows = dissect.inner.slice(0, dissect.rows[0].start);
      const lastRow = dissect.rows[dissect.rows.length - 1];
      const afterRows = dissect.inner.slice(lastRow.end);

      const newInner = beforeRows + header + bodyRowsXml + afterRows;
      const newTbl = dissect.open + newInner + dissect.close;

      xml = xml.slice(0, m.index) + newTbl + xml.slice(m.index + tblXml.length);
      replaced = true;
      break; // satu tabel yang cocok saja
    }

    if (replaced) zip.file(DOC_PATH, xml);
  } catch (error) {
    console.warn(
      "[docx] autoFillComponentsTableIfNoPlaceholders failed:",
      error
    );
  }
}

/** Isi label → nilai (mis. "Nama Paket", "Lokasi") TANPA placeholder */
function autoFillLabelValuePairsIfNoPlaceholders(
  zip: PizZip,
  kv: Record<string, string>
) {
  const DOC_PATH = "word/document.xml";
  let xml = zip.file(DOC_PATH)?.asText() ?? "";
  if (!xml) return;

  try {
    // Basic XML validation
    if (!xml.includes("<w:document") || !xml.includes("</w:document>")) {
      console.warn(
        "[docx] Invalid document XML structure, skipping label fill"
      );
      return;
    }

    // jika ada salah satu placeholdernya, biarkan Docxtemplater
    const hasAnyPlaceholder = Object.keys(kv).some((k) =>
      new RegExp(`{\\s*${sanitize(k)}\\s*}`, "i").test(xml)
    );
    if (hasAnyPlaceholder) return;

    const synonyms: Record<string, string[]> = {
      "nama paket": ["nama paket", "paket", "nama paket pekerjaan"],
      lokasi: [
        "lokasi",
        "alamat",
        "instansi",
        "lokasi pekerjaan",
        "alamat pelaksana",
      ],
    };

    const wanted = Object.keys(kv).map((k) => ({
      key: k,
      value: kv[k] ?? "",
      names: synonyms[k.toLowerCase()] || [k.toLowerCase()],
    }));

    const tblRe = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    let m: RegExpExecArray | null;
    let changedAny = false;

    while ((m = tblRe.exec(xml))) {
      const tblXml = m[0];
      const dissect = dissectTable(tblXml);
      if (!dissect) continue;

      let innerPos = 0;
      let acc = "";

      for (const row of dissect.rows) {
        acc += dissect.inner.slice(innerPos, row.start);
        let rowXml = row.xml;

        const cells = rowXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
        if (cells.length) {
          const firstText = (getCellText(cells[0]) || "").toLowerCase();
          const found = wanted.find((w) =>
            w.names.some((nm) => firstText === nm || firstText.includes(nm))
          );
          if (found) {
            const targetIdx = cells.length >= 2 ? 1 : cells.length - 1;
            rowXml = setCellTextByIndex(
              rowXml,
              targetIdx,
              String(found.value ?? "")
            );
            changedAny = true;
          }
        }
        acc += rowXml;
        innerPos = row.end;
      }
      acc += dissect.inner.slice(innerPos);

      if (changedAny) {
        const newTbl = dissect.open + acc + dissect.close;
        xml =
          xml.slice(0, m.index) + newTbl + xml.slice(m.index + tblXml.length);
        // lanjut tabel lain juga
      }
    }

    if (changedAny) zip.file(DOC_PATH, xml);
  } catch (error) {
    console.warn(
      "[docx] autoFillLabelValuePairsIfNoPlaceholders failed:",
      error
    );
  }
}

/* ===================== POG detail loader ===================== */
type ExternalType = "paket" | "npkt";
type ExternalOverride = { type: ExternalType; id: string } | undefined;

async function getExternalFromDB(jobId: string): Promise<ExternalOverride> {
  try {
    const { data } = await supabase
      .from("projects")
      .select("id_paket, id_npkt")
      .eq("job_id", jobId)
      .maybeSingle();

    const paket = (data as any)?.id_paket as string | null;
    const npkt = (data as any)?.id_npkt as string | null;

    if (paket) return { type: "paket", id: paket };
    if (npkt) return { type: "npkt", id: npkt };
    return undefined;
  } catch (error) {
    console.warn("[docx] getExternalFromDB failed:", error);
    return undefined;
  }
}

async function loadPogDetail(
  req: NextRequest,
  ext: ExternalOverride
): Promise<{ items: ComponentItem[]; namaPaket: string; lokasi: string }> {
  if (!ext?.id) return { items: [], namaPaket: "", lokasi: "" };

  try {
    const url = new URL("/api/pog/detail", req.url);
    url.searchParams.set("type", ext.type);
    url.searchParams.set("id", ext.id);

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return { items: [], namaPaket: "", lokasi: "" };

    const shaped = await r.json();
    const items: ComponentItem[] = Array.isArray(shaped?.items)
      ? shaped.items.map((it: any) => ({
          kebutuhan: String(it.kebutuhan ?? ""),
          qty: Number(it.qty ?? 0) || String(it.qty ?? ""),
          satuan: String(it.satuan ?? ""),
        }))
      : [];

    const namaPaket: string =
      shaped?.meta?.namaPaket ||
      shaped?.namaPaket ||
      shaped?.meta?.paketName ||
      "";

    const lokasi: string = shaped?.lokasi || "";

    return { items, namaPaket, lokasi };
  } catch (error) {
    console.warn("[docx] loadPogDetail failed:", error);
    return { items: [], namaPaket: "", lokasi: "" };
  }
}

/* ===================== Upload hasil + log ===================== */
async function uploadReportAndLog({
  jobId,
  templateFilename,
  fileBuffer,
  req,
}: {
  jobId: string;
  templateFilename: string;
  fileBuffer: Buffer;
  req: NextRequest;
}) {
  try {
    await ensureReportBucket();

    const ts = Date.now();
    const safeTpl = path.basename(templateFilename).replace(/\.docx$/i, "");
    const objectPath = `${encodeURIComponent(jobId)}/${ts}-${safeTpl}.docx`;

    const up = await supabase.storage
      .from(REPORT_BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (up.error) throw up.error;

    const publicUrl =
      supabase.storage.from(REPORT_BUCKET).getPublicUrl(objectPath).data
        .publicUrl || "";

    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id, template_key")
      .eq("job_id", jobId)
      .maybeSingle();

    if (pErr) throw pErr;

    const insertPayload: Record<string, any> = {
      project_id: proj?.id,
      job_id: jobId,
      file_url: publicUrl,
      template_key: proj?.template_key ?? templateFilename,
    };

    const ins = await supabase.from("generated_reports").insert(insertPayload);
    if (ins.error) {
      const msg = String(ins.error.message || "");
      const isMissing = /does not exist|relation .* generated_reports/i.test(
        msg
      );
      if (!isMissing) throw ins.error;
    }
  } catch (e) {
    console.warn("[docx] upload/log warning:", e);
  }
}

/* ===================== Generator ===================== */
async function generateDocx(
  req: NextRequest,
  jobId: string,
  templateKeyParam?: string,
  extOverride?: ExternalOverride
) {
  if (!jobId) throw new Error("jobId wajib diisi");

  try {
    const templateFilename = await resolveTemplateFilename(
      jobId,
      templateKeyParam
    );
    const templateBinary = await readTemplateBinaryString(
      req,
      templateFilename
    );
    if ((templateBinary as any)?.then)
      throw new Error("Internal: templateBinary masih Promise.");

    // Foto/SN/Meter
    const rows = await loadPhotosMerged(req, jobId);

    // POG (komponen + meta)
    const extFromDb = extOverride ?? (await getExternalFromDB(jobId));
    const pog = await loadPogDetail(req, extFromDb);

    const data: Record<string, any> = {};
    const metersById = new Map<string, number>();

    for (const r of rows) {
      const id = String(r.category_id);

      let photoDataUrl = BLANK_IMAGE_DATAURL;
      if (r.url) {
        if (r.url.startsWith("data:")) {
          photoDataUrl = r.url;
        } else {
          photoDataUrl = await fetchToDataUrl(r.url);
        }
      }
      data[`photo_${id}`] = photoDataUrl;

      if (r.serial_number) data[`sn_${id}`] = String(r.serial_number);

      const m = r.cable_meter;
      if (m !== null && m !== undefined && Number.isFinite(Number(m))) {
        const mv = Number(m);
        metersById.set(id, mv);
        data[`meter_${id}`] = String(mv);
      } else {
        data[`meter_${id}`] = "";
      }
    }

    // total meter awal-akhir
    [
      { before: "28", after: "29", key: "cam1" },
      { before: "30", after: "31", key: "cam2" },
      { before: "32", after: "33", key: "cam3" },
      { before: "34", after: "35", key: "cam4" },
      { before: "36", after: "37", key: "nvr" },
    ].forEach(({ before, after, key }) => {
      const a = metersById.get(before);
      const b = metersById.get(after);
      if (typeof a === "number" && typeof b === "number") {
        const diff = a - b; // awal - akhir
        data[`meter_total_${key}`] = String(diff);
        data[`meter_total_${before}_${after}`] = String(diff);
      } else {
        data[`meter_total_${key}`] = "";
        data[`meter_total_${before}_${after}`] = "";
      }
    });

    // Komponen & meta (untuk template yang ada placeholder-nya)
    data["components"] = pog.items ?? [];
    data["nama_paket"] = pog.namaPaket ?? "";
    data["lokasi"] = pog.lokasi ?? "";

    // Komponen statis (template lama)
    {
      const pad2 = (n: number) => String(n).padStart(2, "0");
      for (let row = 1; row <= COMPONENT_ROWS; row++) {
        const keyNama = `komp${pad2(row)}_nama`;
        const keySat = `komp${pad2(row)}_satuan`;
        const item =
          COMPONENT_TEMPLATE.find((x) => x.id === String(row)) || null;
        data[keyNama] = item?.name ?? "";
        data[keySat] = item?.unit ?? "";
      }
    }

    // Render Docx - dengan error handling yang lebih baik
    let zip: PizZip;
    let doc: Docxtemplater;

    try {
      zip = new PizZip(templateBinary);
    } catch (error) {
      console.error("[docx] Failed to create PizZip:", error);
      throw new Error("Template file corrupted or invalid");
    }

    try {
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        modules: [buildImageModule()],
        // hindari error kalau ada tag tak tersedia
        nullGetter() {
          return "";
        },
        // tambahan error handling
        errorLogging: true,
      });
    } catch (error) {
      console.error("[docx] Failed to create Docxtemplater:", error);
      throw new Error("Failed to initialize document templater");
    }

    try {
      doc.render(data);
    } catch (error) {
      console.error("[docx] Failed to render document:", error);
      // Log detail error untuk debugging
      if (error instanceof Error) {
        console.error("[docx] Render error details:", {
          message: error.message,
          stack: error.stack,
          dataKeys: Object.keys(data),
        });
      }
      throw new Error("Failed to render document template");
    }

    // Post-process AMAN (tanpa merusak struktur)
    let renderedZip: PizZip;
    try {
      renderedZip = doc.getZip();

      // Validasi zip sebelum post-processing
      const docXml = renderedZip.file("word/document.xml")?.asText();
      if (!docXml || docXml.length < 100) {
        throw new Error("Generated document appears to be corrupted");
      }

      autoFillComponentsTableIfNoPlaceholders(
        renderedZip,
        data["components"] || []
      );
      autoFillLabelValuePairsIfNoPlaceholders(renderedZip, {
        "Nama Paket": data["nama_paket"] || "",
        Lokasi: data["lokasi"] || "",
      });
    } catch (error) {
      console.error("[docx] Post-processing failed:", error);
      // Fallback ke zip asli tanpa post-processing
      renderedZip = doc.getZip();
    }

    // === Generate sebagai Buffer langsung (lebih aman untuk Response)
    let outBuffer: Buffer;
    try {
      outBuffer = renderedZip.generate({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: {
          level: 6, // balanced compression
        },
      }) as Buffer;

      // Validasi buffer hasil
      if (!outBuffer || outBuffer.length < 1000) {
        throw new Error("Generated buffer is too small or empty");
      }

      // Cek signature ZIP/DOCX (50 4B 03 04 untuk ZIP)
      if (outBuffer.length >= 4) {
        const signature = outBuffer.subarray(0, 4);
        const isZip =
          signature[0] === 0x50 &&
          signature[1] === 0x4b &&
          (signature[2] === 0x03 ||
            signature[2] === 0x05 ||
            signature[2] === 0x07);
        if (!isZip) {
          throw new Error("Generated file does not have valid ZIP signature");
        }
      }
    } catch (error) {
      console.error("[docx] Buffer generation failed:", error);
      throw new Error("Failed to generate document buffer");
    }

    // Upload ke storage (dengan error handling)
    try {
      await uploadReportAndLog({
        jobId,
        templateFilename,
        fileBuffer: outBuffer,
        req,
      });
    } catch (error) {
      console.warn(
        "[docx] Upload to storage failed, but continuing with download:",
        error
      );
    }

    // Return proper Response dengan Buffer yang dikonversi ke ArrayBuffer
    const arrayBuffer = new ArrayBuffer(outBuffer.length);
    new Uint8Array(arrayBuffer).set(outBuffer);
    
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="laporan-${encodeURIComponent(
          jobId
        )}.docx"`,
        "Content-Length": String(outBuffer.length),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[docx] generateDocx failed:", error);
    throw error;
  }
}

/* ===================== Handlers ===================== */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || "");

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const templateKey =
      (body?.templateKey && String(body.templateKey)) ||
      (body?.template_key && String(body.template_key)) ||
      undefined;

    const extOverride =
      body?.external && body.external?.id
        ? ({
            type:
              String(body.external.type || "paket").toLowerCase() === "npkt"
                ? "npkt"
                : "paket",
            id: String(body.external.id),
          } as const)
        : undefined;

    return await generateDocx(req, jobId, templateKey, extOverride);
  } catch (e: any) {
    console.error("[docx] POST handler failed:", e);
    return NextResponse.json(
      {
        error: e?.message || "Gagal generate dokumen",
        details: process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const jobId = String(req.nextUrl.searchParams.get("jobId") || "");

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const templateKey =
      req.nextUrl.searchParams.get("template_key") ??
      req.nextUrl.searchParams.get("templateKey") ??
      undefined;

    const qp = req.nextUrl.searchParams;
    const extId = qp.get("extId") ?? qp.get("externalId") ?? qp.get("id");
    const extTypeRaw =
      qp.get("extType") ?? qp.get("externalType") ?? qp.get("type") ?? "paket";
    const extOverride = extId
      ? ({
          type: extTypeRaw.toLowerCase() === "npkt" ? "npkt" : "paket",
          id: extId,
        } as const)
      : undefined;

    return await generateDocx(req, jobId, templateKey, extOverride);
  } catch (e: any) {
    console.error("[docx] GET handler failed:", e);
    return NextResponse.json(
      {
        error: e?.message || "Gagal generate dokumen",
        details: process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
