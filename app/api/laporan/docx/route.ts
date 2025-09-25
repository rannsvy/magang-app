// app/api/laporan/docx/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import { createClient } from "@supabase/supabase-js";
import { COMPONENT_TEMPLATE, COMPONENT_ROWS } from "@/lib/componentTemplate";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/* ===================== RUNTIME ===================== */
export const runtime = "nodejs";

/* ===================== Supabase ===================== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSrvKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseSrvKey);

/* ===================== Konstanta ===================== */
const REPORT_BUCKET = "generated-reports";
const DEFAULT_TEMPLATE = "Template_CCTV_RTRW.docx";

// ukuran box gambar (px)
const IMG_BOX_W = 220;
const IMG_BOX_H = 150;

// EMU helper (Word uses EMU units)
const PX_TO_EMU = (px: number) => Math.round(px * 9525);

/* ===================== Utils umum ===================== */
const tplDir = () => path.join(process.cwd(), "public", "report-templates");
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const isGeneratedName = (f: string) => /^laporan[_-]/i.test(f);

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

async function readTemplateBinary(
  req: NextRequest,
  filename: string
): Promise<Uint8Array> {
  const full = path.join(tplDir(), path.basename(filename));
  try {
    const buf = await fs.readFile(full);
    return new Uint8Array(buf);
  } catch {
    const url = new URL(
      `/report-templates/${encodeURIComponent(filename)}`,
      req.url
    );
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Gagal fetch template: ${url.toString()}`);
    const ab = await r.arrayBuffer();
    return new Uint8Array(ab);
  }
}

/* ===================== Pemilihan template ===================== */
async function resolveTemplateFilenameByLabel(label: string): Promise<string> {
  if (!label) return DEFAULT_TEMPLATE;

  const candidate = path.basename(label.trim());
  if (candidate.toLowerCase().endsWith(".docx")) {
    try {
      const full = path.join(tplDir(), candidate);
      await fs.access(full);
      if (!isGeneratedName(candidate)) return candidate;
    } catch {}
  }

  const key = sanitize(label);
  try {
    const files = await fs.readdir(tplDir());
    const docx = files
      .filter((f) => f.toLowerCase().endsWith(".docx"))
      .filter((f) => !isGeneratedName(f));

    for (const f of docx) {
      if (sanitize(path.basename(f, ".docx")) === key) return f;
    }
    for (const f of docx) {
      const base = sanitize(path.basename(f, ".docx"));
      if (base.includes(key) || key.includes(base)) return f;
    }
  } catch {}
  return DEFAULT_TEMPLATE;
}

async function resolveTemplateFromDB(jobId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("projects")
      .select("template_key")
      .eq("job_id", jobId)
      .limit(1)
      .maybeSingle();
    const label = (data?.template_key as string) ?? "";
    return await resolveTemplateFilenameByLabel(label);
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

async function resolveTemplateFilename(
  jobId: string,
  templateKeyParam?: string
): Promise<string> {
  if (templateKeyParam) return resolveTemplateFilenameByLabel(templateKeyParam);
  return resolveTemplateFromDB(jobId);
}

/* ===================== Loader foto + SN + meter ===================== */
type RowMerged = {
  category_id: string;
  url: string | null;
  serial_number: string | null;
  cable_meter: number | null;
  selected_photo_id?: string | null;
};
const asNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function loadPhotosMerged(req: NextRequest, jobId: string) {
  let apiItems: RowMerged[] = [];
  try {
    let res = await fetch(
      new URL(`/api/job-photos/${encodeURIComponent(jobId)}`, req.url),
      { cache: "no-store" }
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
        : Array.isArray((data as any).items)
        ? (data as any).items
        : [];
      apiItems = (items as any[]).map((it) => ({
        category_id: String(it.id),
        url: (it.photoThumb || it.photo || null) as string | null,
        serial_number: (it.serialNumber ?? null) as string | null,
        cable_meter: asNum(it.meter),
      }));
    }
  } catch (e) {
    console.warn("[docx] loadPhotosMerged API failed:", e);
  }

  const rowsFromDb: RowMerged[] = [];
  try {
    const { data: dbRows } = await supabase
      .from("job_photos")
      .select(
        "category_id, url, thumb_url, serial_number, cable_meter, selected_photo_id"
      )
      .eq("job_id", jobId);

    for (const r of (dbRows || []) as any[]) {
      rowsFromDb.push({
        category_id: String(r.category_id),
        url: (r.thumb_url || r.url || null) as string | null,
        serial_number: (r.serial_number ?? null) as string | null,
        cable_meter: asNum(r.cable_meter),
        selected_photo_id: (r.selected_photo_id ?? null) as string | null,
      });
    }

    // === Fallback SN/url dari job_photo_entries jika masih null ===
    const selectedIds: string[] = (dbRows || [])
      .map((r: any) => r.selected_photo_id)
      .filter((x: string | null) => !!x) as string[];

    const entriesById = new Map<
      string,
      { serial_number: string | null; url?: string | null }
    >();
    if (selectedIds.length) {
      const { data: ents } = await supabase
        .from("job_photo_entries")
        .select("id, serial_number, url, thumb_url")
        .in("id", selectedIds);
      for (const e of (ents || []) as any[]) {
        entriesById.set(String(e.id), {
          serial_number: e.serial_number ?? null,
          url: e.thumb_url ?? e.url ?? null,
        });
      }
    }

    // merge rowsFromDb dengan entry
    for (const r of rowsFromDb) {
      const ent =
        r.selected_photo_id && entriesById.get(String(r.selected_photo_id));
      if (ent) {
        if (!r.serial_number && ent.serial_number)
          r.serial_number = ent.serial_number;
        if (!r.url && ent.url) r.url = ent.url;
      }
    }
  } catch (e) {
    console.warn("[docx] loadPhotosMerged DB failed:", e);
  }

  // gabungkan DB & API (prioritas DB)
  const byId = new Map<string, RowMerged>();
  for (const r of rowsFromDb) byId.set(r.category_id, { ...r });
  for (const r of apiItems) {
    const cur = byId.get(r.category_id);
    byId.set(r.category_id, {
      category_id: r.category_id,
      url: cur?.url ?? r.url ?? null,
      serial_number: cur?.serial_number ?? r.serial_number ?? null,
      cable_meter: cur?.cable_meter ?? r.cable_meter ?? null,
      selected_photo_id: cur?.selected_photo_id ?? null,
    });
  }
  return Array.from(byId.values());
}

/* ===================== DOM helpers (pakai any untuk kompat TS) ===================== */
function qn(local: string) {
  return "w:" + local;
}
function getDirectChildren(el: any, tag: string): any[] {
  const out: any[] = [];
  if (!el) return out;
  for (let i = 0; i < (el.childNodes?.length || 0); i++) {
    const n: any = el.childNodes[i];
    if (n?.nodeType === 1 && n.tagName === tag) out.push(n);
  }
  return out;
}
function firstDescendant(el: any, tag: string): any | null {
  if (!el) return null;
  if (el.tagName === tag) return el;
  for (let i = 0; i < (el.childNodes?.length || 0); i++) {
    const n: any = el.childNodes[i];
    if (n?.nodeType === 1) {
      const got = firstDescendant(n, tag);
      if (got) return got;
    }
  }
  return null;
}
function allDescendants(el: any, tag: string, acc: any[] = []): any[] {
  if (!el) return acc;
  if (el.tagName === tag) acc.push(el);
  for (let i = 0; i < (el.childNodes?.length || 0); i++) {
    const n: any = el.childNodes[i];
    if (n?.nodeType === 1) allDescendants(n, tag, acc);
  }
  return acc;
}
function textOfT(el: any): string {
  const ts = allDescendants(el, qn("t"));
  return ts
    .map((t: any) => t.textContent || "")
    .join("")
    .trim();
}

/** Tulis ke run pertama dalam sel; multi-line via <w:br/> + <w:t xml:space="preserve"> */
function writeCellTextPreserveStyle(doc: any, tc: any, text: string) {
  if (!tc) return;
  let p = firstDescendant(tc, qn("p"));
  if (!p) {
    p = doc.createElement(qn("p"));
    tc.appendChild(p);
  }
  let r = firstDescendant(p, qn("r"));
  if (!r) {
    r = doc.createElement(qn("r"));
    p.appendChild(r);
  }
  const rPr = firstDescendant(r, qn("rPr"));

  while (r.childNodes.length) r.removeChild(r.childNodes[0]);
  if (rPr) r.appendChild(rPr);

  const lines = String(text ?? "").split(/\r?\n/);
  const t1 = doc.createElement(qn("t"));
  t1.setAttribute("xml:space", "preserve");
  t1.appendChild(doc.createTextNode(lines[0] ?? ""));
  r.appendChild(t1);

  for (let i = 1; i < lines.length; i++) {
    r.appendChild(doc.createElement(qn("br")));
    const ti = doc.createElement(qn("t"));
    ti.setAttribute("xml:space", "preserve");
    ti.appendChild(doc.createTextNode(lines[i]));
    r.appendChild(ti);
  }
}

/* ===================== Deteksi & pengisian tabel ===================== */
const LABELS_IDENTITAS = [
  "nama paket pekerjaan",
  "pelaksana",
  "alamat pelaksana",
  "lokasi pekerjaan",
  "waktu pelaksanaan",
];

function isIdentityTable(tbl: any): boolean {
  const trs = getDirectChildren(tbl, qn("tr"));
  if (trs.length < 3) return false;
  let hits = 0;
  for (let i = 0; i < Math.min(trs.length, 8); i++) {
    const tcs = getDirectChildren(trs[i], qn("tc"));
    if (tcs.length < 1) continue;
    const left = textOfT(tcs[0]).toLowerCase();
    if (LABELS_IDENTITAS.includes(left)) hits++;
  }
  return hits >= 3;
}
function isComponentTable(tbl: any): boolean {
  const trs = getDirectChildren(tbl, qn("tr"));
  if (!trs.length) return false;
  const hdr = trs[0];
  const cells = getDirectChildren(hdr, qn("tc"));
  if (cells.length < 3) return false;
  const texts = cells.map((c: any) => textOfT(c).toLowerCase());
  const hasNo = texts.some((t) => t === "no" || t === "no.");
  const hasNama = texts.some((t) => t.includes("nama"));
  const hasJumlah = texts.some((t) => t.includes("jumlah"));
  return hasNo && hasNama && hasJumlah;
}
function lockTablesFixed(doc: any) {
  const tbls = doc.getElementsByTagName(qn("tbl"));
  for (let i = 0; i < tbls.length; i++) {
    const tbl: any = tbls.item(i);
    let tblPr = firstDescendant(tbl, qn("tblPr"));
    if (!tblPr) {
      tblPr = doc.createElement(qn("tblPr"));
      tbl.insertBefore(tblPr, tbl.firstChild);
    }
    let layout = firstDescendant(tblPr, qn("tblLayout"));
    if (!layout) {
      layout = doc.createElement(qn("tblLayout"));
      tblPr.appendChild(layout);
    }
    layout.setAttribute("w:type", "fixed");
  }
}

function fillIdentityTable(doc: any, kv: Record<string, string>) {
  const body = doc.getElementsByTagName(qn("body")).item(0) as any;
  if (!body) return;
  const tbls = body.getElementsByTagName(qn("tbl"));
  let target: any = null;
  for (let i = 0; i < tbls.length; i++) {
    const t = tbls.item(i) as any;
    if (isIdentityTable(t)) {
      target = t;
      break;
    }
  }
  if (!target) return;

  const trs = getDirectChildren(target, qn("tr"));
  for (const tr of trs) {
    const cells = getDirectChildren(tr, qn("tc"));
    if (cells.length < 2) continue;
    const label = textOfT(cells[0]).toLowerCase();
    if (!LABELS_IDENTITAS.includes(label)) continue;

    const mid = cells.length >= 3 ? textOfT(cells[1]).trim() : "";
    const idxVal = mid === ":" || mid === "：" ? cells.length - 1 : 1;

    const val =
      label === "nama paket pekerjaan"
        ? kv["Nama Paket Pekerjaan"] ?? kv["nama paket pekerjaan"] ?? ""
        : label === "pelaksana"
        ? kv["Pelaksana"] ?? kv["pelaksana"] ?? ""
        : label === "alamat pelaksana"
        ? kv["Alamat Pelaksana"] ?? kv["alamat pelaksana"] ?? ""
        : label === "lokasi pekerjaan"
        ? kv["Lokasi Pekerjaan"] ?? kv["lokasi pekerjaan"] ?? ""
        : label === "waktu pelaksanaan"
        ? kv["Waktu Pelaksanaan"] ?? kv["waktu pelaksanaan"] ?? ""
        : "";

    writeCellTextPreserveStyle(doc, cells[idxVal], String(val ?? ""));
  }
}

type ComponentItem = {
  kebutuhan: string;
  qty: number | string;
  satuan: string;
};

function fillComponentTable(doc: any, items: ComponentItem[]) {
  if (!items?.length) return;

  const body = doc.getElementsByTagName(qn("body")).item(0) as any;
  if (!body) return;
  const tbls = body.getElementsByTagName(qn("tbl"));
  let target: any = null;
  for (let i = 0; i < tbls.length; i++) {
    const t = tbls.item(i) as any;
    if (isComponentTable(t)) {
      target = t;
      break;
    }
  }
  if (!target) return;

  const trs = getDirectChildren(target, qn("tr"));
  if (!trs.length) return;

  const hdr = trs[0];
  const hdrCells = getDirectChildren(hdr, qn("tc"));
  let iNo = -1,
    iNama = -1,
    iJumlah = -1,
    iSatuan = -1;
  const norm = (s: string) => s.toLowerCase();
  hdrCells.forEach((c: any, idx: number) => {
    const t = norm(textOfT(c));
    if (t === "no" || t === "no.") iNo = idx;
    else if (t.includes("nama")) iNama = idx;
    else if (t.includes("jumlah")) iJumlah = idx;
    else if (t.includes("satuan")) iSatuan = idx;
  });
  if (!(iNo >= 0 && iNama >= 0 && iJumlah >= 0)) return;

  // model row sesudah header
  let modelRow: any = null;
  for (let r = 1; r < trs.length; r++) {
    const cs = getDirectChildren(trs[r], qn("tc"));
    if (cs.length >= Math.max(iNo, iNama, iJumlah, iSatuan) + 1) {
      modelRow = trs[r];
      break;
    }
  }
  if (!modelRow) modelRow = trs[trs.length - 1];

  // hapus body rows
  for (let i = trs.length - 1; i >= 1; i--) target.removeChild(trs[i]);

  // isi ulang
  for (let i = 0; i < items.length; i++) {
    const rowClone = modelRow.cloneNode(true) as any;
    const cs = getDirectChildren(rowClone, qn("tc"));
    const put = (idx: number, val: string) => {
      if (idx < 0 || idx >= cs.length) return;
      writeCellTextPreserveStyle(doc, cs[idx], val);
    };
    put(iNo, String(i + 1));
    put(iNama, String(items[i].kebutuhan ?? ""));
    put(iJumlah, String(items[i].qty ?? ""));
    if (iSatuan >= 0) put(iSatuan, String(items[i].satuan ?? ""));
    target.appendChild(rowClone);
  }
}

/* ===================== Gambar: fetch, content types, rels, drawing ===================== */
type ImgExt = "png" | "jpg" | "jpeg" | "gif";

async function fetchImageBinary(
  url: string
): Promise<{ buf: Buffer; ext: ImgExt }> {
  // data URL?
  if (/^data:/i.test(url)) {
    const m = url.match(/^data:(.+?);base64,(.+)$/i);
    const ct = (m?.[1] || "image/jpeg").toLowerCase();
    const b64 = m?.[2] || "";
    const buf = Buffer.from(b64, "base64");
    const ext: ImgExt = ct.includes("png")
      ? "png"
      : ct.includes("gif")
      ? "gif"
      : ct.includes("jpg")
      ? "jpg"
      : "jpeg";
    return { buf, ext };
  }

  // remote
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("fetch image failed: " + url);
  const ct = (r.headers.get("content-type") || "image/jpeg").toLowerCase();
  const ab = await r.arrayBuffer();
  const buf = Buffer.from(new Uint8Array(ab));
  const ext: ImgExt = ct.includes("png")
    ? "png"
    : ct.includes("gif")
    ? "gif"
    : ct.includes("jpg")
    ? "jpg"
    : "jpeg";
  return { buf, ext };
}

function ensureContentTypes(zip: PizZip, usedExts: Set<string>) {
  const CT_PATH = "[Content_Types].xml";
  let ctXml =
    zip.file(CT_PATH)?.asText() ||
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`;
  const dom = new DOMParser().parseFromString(ctXml, "text/xml");
  const root = dom.getElementsByTagName("Types").item(0) as any;

  const has = (ext: string) => {
    const nodes = dom.getElementsByTagName("Default");
    for (let i = 0; i < nodes.length; i++) {
      if (
        (nodes.item(i) as any).getAttribute("Extension")?.toLowerCase() === ext
      )
        return true;
    }
    return false;
  };
  const add = (ext: string, mime: string) => {
    if (has(ext)) return;
    const d = dom.createElement("Default");
    d.setAttribute("Extension", ext);
    d.setAttribute("ContentType", mime);
    root.appendChild(d);
  };

  if (usedExts.has("png")) add("png", "image/png");
  if (usedExts.has("jpeg")) add("jpeg", "image/jpeg");
  if (usedExts.has("jpg")) add("jpg", "image/jpeg");
  if (usedExts.has("gif")) add("gif", "image/gif");

  const out = new XMLSerializer().serializeToString(dom);
  zip.file(CT_PATH, out);
}

function ensureDocRelsDom(zip: PizZip): { relsDom: any; RELS_PATH: string } {
  const RELS_PATH = "word/_rels/document.xml.rels";
  let relsXml =
    zip.file(RELS_PATH)?.asText() ||
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const relsDom = new DOMParser().parseFromString(relsXml, "text/xml");
  return { relsDom, RELS_PATH };
}
function nextRid(relsDom: any): string {
  const rs = relsDom.getElementsByTagName("Relationship");
  let max = 0;
  for (let i = 0; i < rs.length; i++) {
    const id = rs.item(i).getAttribute("Id") || "";
    const m = id.match(/^rId(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `rId${max + 1}`;
}

function addImageAsset(
  zip: PizZip,
  relsDom: any,
  preferredName: string,
  ext: ImgExt,
  buf: Buffer
): string {
  // unique path under word/media
  const mediaDir = "word/media";
  let base = `image_${preferredName}`.replace(/[^a-z0-9_]+/gi, "_");
  let filePath = `${mediaDir}/${base}.${ext}`;
  let idx = 1;
  while (zip.file(filePath)) {
    filePath = `${mediaDir}/${base}_${idx++}.${ext}`;
  }
  zip.file(filePath, buf);

  const rid = nextRid(relsDom);
  const rel = relsDom.createElement("Relationship");
  rel.setAttribute("Id", rid);
  rel.setAttribute(
    "Type",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
  );
  rel.setAttribute("Target", filePath.replace(/^word\//, ""));
  const root = relsDom.getElementsByTagName("Relationships").item(0);
  root.appendChild(rel);
  return rid;
}

function ensureDrawingNamespaces(doc: any) {
  const wdoc = doc.getElementsByTagName("w:document").item(0) as any;
  if (!wdoc) return;
  const ensure = (k: string, v: string) => {
    if (!wdoc.getAttribute(k)) wdoc.setAttribute(k, v);
  };
  ensure(
    "xmlns:r",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  );
  ensure(
    "xmlns:wp",
    "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  );
  ensure("xmlns:a", "http://schemas.openxmlformats.org/drawingml/2006/main");
  ensure(
    "xmlns:pic",
    "http://schemas.openxmlformats.org/drawingml/2006/picture"
  );
}

function buildImageDrawing(
  doc: any,
  rId: string,
  pxW = IMG_BOX_W,
  pxH = IMG_BOX_H
) {
  const cx = PX_TO_EMU(pxW);
  const cy = PX_TO_EMU(pxH);

  const wDrawing = doc.createElement("w:drawing");
  const inline = doc.createElement("wp:inline");
  inline.setAttribute("distT", "0");
  inline.setAttribute("distB", "0");
  inline.setAttribute("distL", "0");
  inline.setAttribute("distR", "0");

  const extent = doc.createElement("wp:extent");
  extent.setAttribute("cx", String(cx));
  extent.setAttribute("cy", String(cy));
  inline.appendChild(extent);

  const effect = doc.createElement("wp:effectExtent");
  effect.setAttribute("l", "0");
  effect.setAttribute("t", "0");
  effect.setAttribute("r", "0");
  effect.setAttribute("b", "0");
  inline.appendChild(effect);

  const docPr = doc.createElement("wp:docPr");
  docPr.setAttribute("id", String(Date.now() % 100000));
  docPr.setAttribute("name", "Picture");
  inline.appendChild(docPr);

  inline.appendChild(doc.createElement("wp:cNvGraphicFramePr"));

  const graphic = doc.createElement("a:graphic");
  const gData = doc.createElement("a:graphicData");
  gData.setAttribute(
    "uri",
    "http://schemas.openxmlformats.org/drawingml/2006/picture"
  );

  const pic = doc.createElement("pic:pic");
  const nv = doc.createElement("pic:nvPicPr");
  const cNvPr = doc.createElement("pic:cNvPr");
  cNvPr.setAttribute("id", "0");
  cNvPr.setAttribute("name", "");
  nv.appendChild(cNvPr);
  nv.appendChild(doc.createElement("pic:cNvPicPr"));

  const blipFill = doc.createElement("pic:blipFill");
  const blip = doc.createElement("a:blip");
  blip.setAttribute("r:embed", rId);
  blipFill.appendChild(blip);
  const stretch = doc.createElement("a:stretch");
  stretch.appendChild(doc.createElement("a:fillRect"));
  blipFill.appendChild(stretch);

  const spPr = doc.createElement("pic:spPr");
  const xfrm = doc.createElement("a:xfrm");
  const off = doc.createElement("a:off");
  off.setAttribute("x", "0");
  off.setAttribute("y", "0");
  const aExt = doc.createElement("a:ext");
  aExt.setAttribute("cx", String(cx));
  aExt.setAttribute("cy", String(cy));
  xfrm.appendChild(off);
  xfrm.appendChild(aExt);
  spPr.appendChild(xfrm);
  const prst = doc.createElement("a:prstGeom");
  prst.setAttribute("prst", "rect");
  prst.appendChild(doc.createElement("a:avLst"));
  spPr.appendChild(prst);

  pic.appendChild(nv);
  pic.appendChild(blipFill);
  pic.appendChild(spPr);

  gData.appendChild(pic);
  graphic.appendChild(gData);
  inline.appendChild(graphic);
  wDrawing.appendChild(inline);

  return wDrawing;
}

/** Replace token text (sn_xx, meter_xx, dst) lintas-run di level paragraf */
function replaceTextTokensCrossRun(doc: any, tokenMap: Record<string, string>) {
  const keys = Object.keys(tokenMap);
  if (!keys.length) return;

  const P = doc.getElementsByTagName("w:p");
  // {sn_3} | {% sn_3 %} | [[sn_3]]
  const OUTER = /(\{\%?\s*([a-z0-9_]+)\s*\%?\}|\[\[\s*([a-z0-9_]+)\s*\]\])/gi;

  for (let pi = 0; pi < P.length; pi++) {
    const p = P.item(pi) as any;

    const tNodes: any[] = [];
    const walker = p.getElementsByTagName("w:t");
    for (let i = 0; i < walker.length; i++) tNodes.push(walker.item(i));
    if (!tNodes.length) continue;

    let combined = "";
    const segs: Array<{
      t: any;
      r: any;
      start: number;
      end: number;
      text: string;
    }> = [];
    for (const t of tNodes) {
      const txt = String(t.textContent || "");
      let r: any = t.parentNode;
      while (r && r.tagName !== "w:r") r = r.parentNode;
      const start = combined.length;
      combined += txt;
      const end = combined.length;
      segs.push({ t, r, start, end, text: txt });
    }
    if (!combined) continue;

    OUTER.lastIndex = 0;
    let changed = false;
    let m: RegExpExecArray | null;

    while ((m = OUTER.exec(combined)) != null) {
      const full = m[0];
      const keyRaw = (m[2] || m[3] || "").toLowerCase();
      const val = tokenMap[keyRaw];
      if (typeof val === "undefined") continue;

      const mStart = m.index;
      const mEnd = mStart + full.length;

      let firstIdx = -1,
        lastIdx = -1;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (s.end > mStart && s.start < mEnd) {
          if (firstIdx === -1) firstIdx = i;
          lastIdx = i;
        }
      }
      if (firstIdx < 0 || lastIdx < 0) continue;

      const firstSeg = segs[firstIdx];
      const lastSeg = segs[lastIdx];

      const leftKeep = Math.max(0, mStart - firstSeg.start);
      const rightKeep = Math.max(0, lastSeg.end - mEnd);
      const leftText = firstSeg.text.slice(0, leftKeep);
      const rightText = lastSeg.text.slice(lastSeg.text.length - rightKeep);

      const firstRun = firstSeg.r;
      const lastRun = lastSeg.r;

      // rPr
      let rPr = null as any;
      const cand = firstRun.getElementsByTagName("w:rPr");
      if (cand.length) rPr = cand.item(0).cloneNode(true);

      // kosongi firstRun
      while (firstRun.firstChild) firstRun.removeChild(firstRun.firstChild);
      if (rPr) firstRun.appendChild(rPr);

      // tulis LEFT + VALUE
      const t1 = doc.createElement("w:t");
      t1.setAttribute("xml:space", "preserve");
      t1.appendChild(doc.createTextNode(leftText + val));
      firstRun.appendChild(t1);

      // hapus run tengah
      for (let i = firstIdx + 1; i < lastIdx; i++) {
        const midRun = segs[i].r;
        const pRun = midRun.parentNode;
        if (pRun) pRun.removeChild(midRun);
      }

      // tulis sisa kanan
      if (lastRun !== firstRun) {
        while (lastRun.firstChild) lastRun.removeChild(lastRun.firstChild);
        if (rightText) {
          const tR = doc.createElement("w:t");
          tR.setAttribute("xml:space", "preserve");
          tR.appendChild(doc.createTextNode(rightText));
          lastRun.appendChild(tR);
        } else {
          const pr = lastRun.parentNode;
          if (pr) pr.removeChild(lastRun);
        }
      } else {
        if (rightText) {
          const tR = doc.createElement("w:t");
          tR.setAttribute("xml:space", "preserve");
          tR.appendChild(doc.createTextNode(rightText));
          firstRun.appendChild(tR);
        }
      }

      // rebuild segs
      const newT: any[] = [];
      const w = p.getElementsByTagName("w:t");
      let newCombined = "";
      for (let i = 0; i < w.length; i++) {
        const t = w.item(i);
        newT.push(t);
        newCombined += String(t.textContent || "");
      }
      combined = newCombined;

      segs.length = 0;
      let pos = 0;
      for (const t of newT) {
        let r: any = t.parentNode;
        while (r && r.tagName !== "w:r") r = r.parentNode;
        const txt = String(t.textContent || "");
        const start = pos;
        const end = start + txt.length;
        pos = end;
        segs.push({ t, r, start, end, text: txt });
      }

      changed = true;
      OUTER.lastIndex = 0;
    }
  }
}

/** Replace photo token lintas-run: {photo_3} / [[photo_3]] / {% photo_3 %} */
function replacePhotoTokensCrossRun(
  doc: any,
  photoRidById: Record<string, string>
) {
  const P = doc.getElementsByTagName("w:p");
  const RE = /(\{\%?\s*photo_(\d+)\s*\%?\}|\[\[\s*photo_(\d+)\s*\]\])/i;

  for (let pi = 0; pi < P.length; pi++) {
    const p = P.item(pi) as any;
    const tNodes: any[] = [];
    const walker = p.getElementsByTagName("w:t");
    for (let i = 0; i < walker.length; i++) tNodes.push(walker.item(i));
    if (!tNodes.length) continue;

    let combined = "";
    const segs: Array<{
      t: any;
      r: any;
      start: number;
      end: number;
      text: string;
    }> = [];
    for (const t of tNodes) {
      const txt = String(t.textContent || "");
      let r: any = t.parentNode;
      while (r && r.tagName !== "w:r") r = r.parentNode;
      const start = combined.length;
      combined += txt;
      const end = combined.length;
      segs.push({ t, r, start, end, text: txt });
    }
    if (!combined) continue;

    const m = combined.match(RE);
    if (!m) continue;
    const mStart = m.index || 0;
    const mEnd = mStart + m[0].length;
    const id = String(m[2] || m[3] || "");
    const rid = photoRidById[id];
    if (!rid) continue;

    let firstIdx = -1,
      lastIdx = -1;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.end > mStart && s.start < mEnd) {
        if (firstIdx === -1) firstIdx = i;
        lastIdx = i;
      }
    }
    if (firstIdx < 0 || lastIdx < 0) continue;

    const firstSeg = segs[firstIdx];
    const lastSeg = segs[lastIdx];

    const leftKeep = Math.max(0, mStart - firstSeg.start);
    const rightKeep = Math.max(0, lastSeg.end - mEnd);
    const leftText = firstSeg.text.slice(0, leftKeep);
    const rightText = lastSeg.text.slice(lastSeg.text.length - rightKeep);

    const firstRun = firstSeg.r;
    const lastRun = lastSeg.r;

    // rPr
    let rPr = null as any;
    const cand = firstRun.getElementsByTagName("w:rPr");
    if (cand.length) rPr = cand.item(0).cloneNode(true);

    // kosongkan firstRun
    while (firstRun.firstChild) firstRun.removeChild(firstRun.firstChild);
    if (rPr) firstRun.appendChild(rPr);

    // tulis LEFT
    if (leftText) {
      const t1 = doc.createElement("w:t");
      t1.setAttribute("xml:space", "preserve");
      t1.appendChild(doc.createTextNode(leftText));
      firstRun.appendChild(t1);
    }

    // sisipkan gambar
    firstRun.appendChild(buildImageDrawing(doc, rid, IMG_BOX_W, IMG_BOX_H));

    // hapus run tengah
    for (let i = firstIdx + 1; i < lastIdx; i++) {
      const midRun = segs[i].r;
      const pRun = midRun.parentNode;
      if (pRun) pRun.removeChild(midRun);
    }

    // tulis RIGHT
    if (lastRun !== firstRun) {
      while (lastRun.firstChild) lastRun.removeChild(lastRun.firstChild);
      if (rightText) {
        const tR = doc.createElement("w:t");
        tR.setAttribute("xml:space", "preserve");
        tR.appendChild(doc.createTextNode(rightText));
        lastRun.appendChild(tR);
      } else {
        const pr = lastRun.parentNode;
        if (pr) pr.removeChild(lastRun);
      }
    } else {
      if (rightText) {
        const tR = doc.createElement("w:t");
        tR.setAttribute("xml:space", "preserve");
        tR.appendChild(doc.createTextNode(rightText));
        firstRun.appendChild(tR);
      }
    }
  }
}

/* ===================== Tokens util ===================== */
function addToken(
  map: Record<string, string>,
  base: string,
  id: string | number,
  value: string
) {
  const sid = String(id);
  const sid2 = sid.padStart(2, "0"); // dukung {sn_03}
  map[`${base}_${sid}`.toLowerCase()] = value;
  map[`${base}_${sid2}`.toLowerCase()] = value;
}

/* ===================== Upload + log ===================== */
async function uploadReportAndLog({
  jobId,
  templateFilename,
  fileBuffer,
}: {
  jobId: string;
  templateFilename: string;
  fileBuffer: Buffer;
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

    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("job_id", jobId)
      .maybeSingle();

    const row: Record<string, any> = {
      job_id: jobId,
      file_url: publicUrl,
      template_key: templateFilename,
    };
    if (proj?.id) row.project_id = proj.id;

    const ins = await supabase.from("generated_reports").insert(row);
    if (ins.error) {
      const msg = String(ins.error.message || "");
      if (!/not-null|null value/i.test(msg)) throw ins.error;
    }
  } catch (e) {
    console.warn("[docx] upload/log warning:", e);
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
  } catch {
    return undefined;
  }
}

type ComponentItemDTO = {
  kebutuhan: string;
  qty: number | string;
  satuan: string;
};

async function loadPogDetail(
  req: NextRequest,
  ext: ExternalOverride
): Promise<{
  items: ComponentItemDTO[];
  namaPaket: string;
  pelaksana: string;
  alamatPelaksana: string;
  lokasiPekerjaan: string;
  waktuPelaksanaan: string;
}> {
  if (!ext?.id) {
    return {
      items: [],
      namaPaket: "",
      pelaksana: "",
      alamatPelaksana: "",
      lokasiPekerjaan: "",
      waktuPelaksanaan: "",
    };
  }
  try {
    const url = new URL("/api/pog/detail", req.url);
    url.searchParams.set("type", ext.type);
    url.searchParams.set("id", ext.id);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok)
      return {
        items: [],
        namaPaket: "",
        pelaksana: "",
        alamatPelaksana: "",
        lokasiPekerjaan: "",
        waktuPelaksanaan: "",
      };

    const shaped = await r.json();
    const items: ComponentItemDTO[] = Array.isArray(shaped?.items)
      ? shaped.items.map((it: any) => ({
          kebutuhan: String(it.kebutuhan ?? ""),
          qty: Number(it.qty ?? 0) || String(it.qty ?? ""),
          satuan: String(it.satuan ?? ""),
        }))
      : [];

    return {
      items,
      namaPaket:
        shaped?.meta?.namaPaket ||
        shaped?.namaPaket ||
        shaped?.meta?.paketName ||
        "",
      pelaksana: shaped?.meta?.pelaksana || shaped?.pelaksana || "",
      alamatPelaksana:
        shaped?.meta?.alamatPelaksana || shaped?.alamatPelaksana || "",
      lokasiPekerjaan: shaped?.lokasi || shaped?.meta?.lokasiPekerjaan || "",
      waktuPelaksanaan:
        shaped?.meta?.waktuPelaksanaan || shaped?.waktuPelaksanaan || "",
    };
  } catch {
    return {
      items: [],
      namaPaket: "",
      pelaksana: "",
      alamatPelaksana: "",
      lokasiPekerjaan: "",
      waktuPelaksanaan: "",
    };
  }
}

/* ===================== Header/Footer processor ===================== */
function processXmlParts(
  zip: PizZip,
  pattern: RegExp,
  mutator: (dom: any, path: string) => void
) {
  const names = Object.keys(zip.files).filter((n) => pattern.test(n));
  for (const name of names) {
    const xml = zip.file(name)?.asText();
    if (!xml) continue;
    const dom = new DOMParser().parseFromString(xml, "text/xml");
    mutator(dom, name);
    const out = new XMLSerializer().serializeToString(dom);
    zip.file(name, out);
  }
}

/* ===================== Generator ===================== */
async function generateDocx(
  req: NextRequest,
  jobId: string,
  templateKeyParam?: string,
  extOverride?: ExternalOverride
): Promise<Response> {
  if (!jobId) throw new Error("jobId wajib diisi");

  const templateFilename = await resolveTemplateFilename(
    jobId,
    templateKeyParam
  );
  const templateBinary = await readTemplateBinary(req, templateFilename);

  // Muat data (komponen, foto, sn, meter)
  const photoRows = await loadPhotosMerged(req, jobId);
  const serialById: Record<string, string> = {};
  const meterById: Record<string, number> = {};
  const urlById: Record<string, string> = {};
  for (const r of photoRows) {
    if (r.serial_number)
      serialById[String(r.category_id)] = String(r.serial_number);
    if (r.cable_meter != null && Number.isFinite(Number(r.cable_meter)))
      meterById[String(r.category_id)] = Number(r.cable_meter);
    if (r.url) urlById[String(r.category_id)] = r.url;
  }

  const extFromDb = extOverride ?? (await getExternalFromDB(jobId));
  const pog = await loadPogDetail(req, extFromDb);

  // Buka docx
  let zip = new PizZip(templateBinary);

  // Ambil document.xml
  const DOC = "word/document.xml";
  const xml = zip.file(DOC)?.asText() || "";
  if (!xml) throw new Error("Dokumen rusak / tidak ada document.xml");

  // Parse DOM
  const dom = new DOMParser().parseFromString(xml, "text/xml");

  // Namespace untuk gambar bila belum ada
  ensureDrawingNamespaces(dom);

  // Kunci layout tabel
  lockTablesFixed(dom);

  // Isi tabel identitas
  fillIdentityTable(dom, {
    "Nama Paket Pekerjaan": pog.namaPaket || "",
    Pelaksana: pog.pelaksana || "",
    "Alamat Pelaksana": pog.alamatPelaksana || "",
    "Lokasi Pekerjaan": pog.lokasiPekerjaan || "",
    "Waktu Pelaksanaan": pog.waktuPelaksanaan || "",
  });

  // Isi tabel komponen
  fillComponentTable(dom, (pog.items ?? []) as any);

  // ====== Foto: simpan ke media + rels ======
  const { relsDom, RELS_PATH } = ensureDocRelsDom(zip);
  const usedExts = new Set<string>();
  const photoRidById: Record<string, string> = {};

  for (const id of Object.keys(urlById)) {
    try {
      const { buf, ext } = await fetchImageBinary(urlById[id]);
      usedExts.add(ext);
      const rid = addImageAsset(zip, relsDom, id, ext, buf);
      photoRidById[id] = rid;
    } catch (e) {
      console.warn("[docx] skip image id", id, e);
    }
  }

  // tulis kembali rels & content types
  zip.file(RELS_PATH, new XMLSerializer().serializeToString(relsDom));
  ensureContentTypes(zip, usedExts);

  // ====== Token teks: sn_xx, meter_xx, dan total meter umum ======
  const tokenMap: Record<string, string> = {};
  for (const k of Object.keys(serialById))
    addToken(tokenMap, "sn", k, serialById[k]);
  for (const k of Object.keys(meterById))
    addToken(tokenMap, "meter", k, String(meterById[k]));

  (
    [
      ["28", "29", "cam1"],
      ["30", "31", "cam2"],
      ["32", "33", "cam3"],
      ["34", "35", "cam4"],
      ["36", "37", "nvr"],
    ] as const
  ).forEach(([a, b, key]) => {
    const va = meterById[a],
      vb = meterById[b];
    if (typeof va === "number" && typeof vb === "number") {
      addToken(tokenMap, "meter_total", key, String(va - vb));
      addToken(tokenMap, "meter_total", `${a}_${b}`, String(va - vb));
    }
  });

  // Replace teks lintas-run (body)
  replaceTextTokensCrossRun(dom, tokenMap);

  // Replace foto lintas-run (body)
  replacePhotoTokensCrossRun(dom, photoRidById);

  // Simpan balik document.xml
  const outXml = new XMLSerializer().serializeToString(dom);
  zip.file(DOC, outXml);

  // === (opsional) proses header/footer untuk token teks (bukan foto) ===
  processXmlParts(zip, /^word\/header\d+\.xml$/i, (partDom) => {
    replaceTextTokensCrossRun(partDom, tokenMap);
  });
  processXmlParts(zip, /^word\/footer\d+\.xml$/i, (partDom) => {
    replaceTextTokensCrossRun(partDom, tokenMap);
  });

  // (opsional) Isi komponen statis kompat lama (tidak mengubah layout)
  {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    for (let row = 1; row <= COMPONENT_ROWS; row++) {
      const keyNama = `komp${pad2(row)}_nama`;
      const keySat = `komp${pad2(row)}_satuan`;
      const item = COMPONENT_TEMPLATE.find((x) => x.id === String(row)) || null;
      void keyNama;
      void keySat;
      void item; // placeholder kompatibilitas
    }
  }

  // Generate ZIP
  const outBuffer = zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  }) as Buffer;

  // best-effort log (non-blocking)
  uploadReportAndLog({ jobId, templateFilename, fileBuffer: outBuffer }).catch(
    () => {}
  );

  const uint8 = new Uint8Array(outBuffer);
  return new Response(uint8, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="laporan-${encodeURIComponent(
        jobId
      )}.docx"`,
      "Content-Length": String(uint8.byteLength),
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/* ===================== Handlers ===================== */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || "");
    if (!jobId)
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });

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
    if (!jobId)
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });

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
    return NextResponse.json(
      {
        error: e?.message || "Gagal generate dokumen",
        details: process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
