/* Auto-crop helper:
   Urutan: SN (barcode/teks) → COCO-SSD → SALIENCY v2 (edge + bright)  */
import Tesseract from "tesseract.js"

type Box = { x: number; y: number; w: number; h: number }
type Suggestion = { box: Box; naturalW: number; naturalH: number }

let cocoModel: any | null = null

/** ====== Utils umum ====== */
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = dataUrl
  })
}

function padClamp(b: Box, padRatio: number, W: number, H: number): Box {
  const pad = Math.round(Math.max(b.w, b.h) * padRatio)
  const x = Math.max(0, b.x - pad)
  const y = Math.max(0, b.y - pad)
  const w = Math.min(W - x, b.w + pad * 2)
  const h = Math.min(H - y, b.h + pad * 2)
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) }
}

function percentile(arr: Float32Array, p: number): number {
  const a = Array.from(arr).sort((x, y) => x - y)
  const idx = Math.max(0, Math.min(a.length - 1, Math.floor((p / 100) * a.length)))
  return a[idx]
}

// ⤵️ gunakan generik ArrayBufferLike supaya cocok dengan TS terbaru
function dilate(
  src: Uint8Array<ArrayBufferLike>,
  w: number,
  h: number,
  r = 1
): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let yy = -r; yy <= r && !v; yy++) {
        const ny = y + yy; if (ny < 0 || ny >= h) continue
        for (let xx = -r; xx <= r; xx++) {
          const nx = x + xx; if (nx < 0 || nx >= w) continue
          if (src[ny * w + nx]) { v = 1; break }
        }
      }
      out[y * w + x] = v
    }
  }
  return out
}

function erode(
  src: Uint8Array<ArrayBufferLike>,
  w: number,
  h: number,
  r = 1
): Uint8Array<ArrayBufferLike> {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1
      for (let yy = -r; yy <= r && v; yy++) {
        const ny = y + yy; if (ny < 0 || ny >= h) { v = 0; break }
        for (let xx = -r; xx <= r; xx++) {
          const nx = x + xx; if (nx < 0 || nx >= w) { v = 0; break }
          if (!src[ny * w + nx]) { v = 0; break }
        }
      }
      out[y * w + x] = v ? 1 : 0
    }
  }
  return out
}

/** ====== 1) Barcode bbox (ZXing) ====== */
async function detectBarcodeBox(dataUrl: string): Promise<Box | null> {
  try {
    if (typeof window === "undefined") return null
    const { BrowserMultiFormatReader } = await import("@zxing/browser")
    const img = await loadImage(dataUrl)
    // @ts-ignore
    const res = await new BrowserMultiFormatReader().decodeFromImageElement(img as HTMLImageElement)
    const pts = (res as any)?.getResultPoints?.() || []
    if (!pts?.length) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of pts) {
      const x = p.getX ? p.getX() : p.x
      const y = p.getY ? p.getY() : p.y
      minX = Math.min(minX, x); minY = Math.min(minY, y)
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    const w = Math.round(maxX - minX), h = Math.round(maxY - minY)
    if (w <= 2 || h <= 2) return null
    return padClamp({ x: Math.round(minX), y: Math.round(minY), w, h }, 0.25, img.naturalWidth, img.naturalHeight)
  } catch { return null }
}

/** ====== 2) Tesseract: cari label SN/Serial → gabung bbox kata-kata di dekatnya ====== */
async function detectSerialTextBox(dataUrl: string, natW: number, natH: number): Promise<Box | null> {
  try {
    const result = await Tesseract.recognize(dataUrl, "eng", {
      // @ts-ignore
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
    })
    const words = (result as any)?.data?.words as Array<{
      text: string; bbox: { x0: number; y0: number; x1: number; y1: number }
    }> || []
    if (!words.length) return null
    const labelRe = /\b(?:S\/?N|SERIAL(?:\s*NO\.?|(?:\s*NUMBER)?))\b/i
    for (let i = 0; i < words.length; i++) {
      if (labelRe.test(words[i].text)) {
        const take = [words[i], words[i + 1], words[i + 2]].filter(Boolean)
        const xs = take.map(w => w!.bbox.x0), ys = take.map(w => w!.bbox.y0)
        const xe = take.map(w => w!.bbox.x1), ye = take.map(w => w!.bbox.y1)
        const x = Math.min(...xs), y = Math.min(...ys)
        const w = Math.max(...xe) - x, h = Math.max(...ye) - y
        return padClamp({ x, y, w, h }, 0.25, natW, natH)
      }
    }
    return null
  } catch { return null }
}

/** ====== 3) COCO-SSD: objek umum ====== */
async function ensureCoco() {
  if (cocoModel || typeof window === "undefined") return cocoModel
  const tf = await import("@tensorflow/tfjs")
  // @ts-ignore
  await (tf as any).ready?.()
  // @ts-ignore
  cocoModel = await (await import("@tensorflow-models/coco-ssd")).load({ base: "lite_mobilenet_v2" })
  return cocoModel
}
function preferredClassesFor(name?: string): string[] {
  const n = (name || "").toLowerCase()
  if (/monitor/.test(n)) return ["tv"]
  return []
}
async function detectGenericObjectBox(dataUrl: string, name?: string): Promise<Box | null> {
  try {
    await ensureCoco()
    const img = await loadImage(dataUrl)
    // @ts-ignore
    const preds = (await cocoModel.detect(img, 20)) as Array<{ class: string; score: number; bbox: [number, number, number, number] }>
    const picks = preds.filter(p => p.score >= 0.5)
    if (!picks.length) return null

    const pref = preferredClassesFor(name)
    let best = picks[0]
    if (pref.length) {
      const byPref = picks.filter(p => pref.includes(p.class))
      best = (byPref.length ? byPref : picks).sort((a, b) =>
        (b.score - a.score) || (b.bbox[2] * b.bbox[3] - a.bbox[2] * a.bbox[3])
      )[0]
    } else {
      best = picks.sort((a, b) => (b.bbox[2] * b.bbox[3]) - (a.bbox[2] * a.bbox[3]))[0]
    }
    const [x, y, w, h] = best.bbox.map(v => Math.round(v)) as [number, number, number, number]
    return padClamp({ x, y, w, h }, 0.15, img.naturalWidth, img.naturalHeight)
  } catch { return null }
}

/** ====== 4) SALIENCY v2: edge (Sobel) + bright region + closing + scoring ====== */
async function detectSaliencyBox(dataUrl: string): Promise<Box | null> {
  const img = await loadImage(dataUrl)
  const W = img.naturalWidth, H = img.naturalHeight

  const MAX_SIDE = 640
  const scale = Math.min(1, MAX_SIDE / Math.max(W, H))
  const w = Math.max(16, Math.round(W * scale))
  const h = Math.max(16, Math.round(H * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  let globalSum = 0
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    gray[j] = g; globalSum += g
  }
  const globalMean = globalSum / (w * h)

  // Sobel magnitude
  const mag = new Float32Array(w * h)
  const KX = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const KY = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0, sy = 0, k = 0
      for (let yy = -1; yy <= 1; yy++) {
        for (let xx = -1; xx <= 1; xx++) {
          const v = gray[(y + yy) * w + (x + xx)]
          sx += KX[k] * v; sy += KY[k] * v; k++
        }
      }
      mag[y * w + x] = Math.hypot(sx, sy)
    }
  }

  const EDGE_P = 92, BRIGHT_P = 90
  const edgeTh = percentile(mag, EDGE_P)
  const brightTh = percentile(gray, BRIGHT_P)

  const edgeMask: Uint8Array<ArrayBufferLike> = new Uint8Array(w * h)
  const brightMask: Uint8Array<ArrayBufferLike> = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    edgeMask[i] = mag[i] >= edgeTh ? 1 : 0
    brightMask[i] = gray[i] >= brightTh ? 1 : 0
  }

  // gabung + closing
  let mask: Uint8Array<ArrayBufferLike> = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) mask[i] = (edgeMask[i] | brightMask[i]) ? 1 : 0
  mask = dilate(mask, w, h, 3)
  mask = erode(mask, w, h, 2)

  // connected components
  const seen: Uint8Array<ArrayBufferLike> = new Uint8Array(w * h)
  let bestScore = 0
  let bestBox: { x0: number; y0: number; x1: number; y1: number } | null = null
  const stack = new Int32Array(w * h * 2)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (!mask[idx] || seen[idx]) continue

      let top = 0; stack[top++] = x; stack[top++] = y
      seen[idx] = 1

      let minx = x, miny = y, maxx = x, maxy = y
      let cnt = 0, sumG = 0, edgeCnt = 0

      while (top) {
        const yy = stack[--top], xx = stack[--top]
        const ii = yy * w + xx
        cnt++; sumG += gray[ii]; if (edgeMask[ii]) edgeCnt++

        if (xx < minx) minx = xx
        if (yy < miny) miny = yy
        if (xx > maxx) maxx = xx
        if (yy > maxy) maxy = yy

        if (xx + 1 < w && mask[ii + 1] && !seen[ii + 1]) { seen[ii + 1] = 1; stack[top++] = xx + 1; stack[top++] = yy }
        if (xx - 1 >= 0 && mask[ii - 1] && !seen[ii - 1]) { seen[ii - 1] = 1; stack[top++] = xx - 1; stack[top++] = yy }
        if (yy + 1 < h && mask[ii + w] && !seen[ii + w]) { seen[ii + w] = 1; stack[top++] = xx; stack[top++] = yy + 1 }
        if (yy - 1 >= 0 && mask[ii - w] && !seen[ii - w]) { seen[ii - w] = 1; stack[top++] = xx; stack[top++] = yy - 1 }
      }

      const bw = maxx - minx + 1, bh = maxy - miny + 1
      const aspect = bw / bh
      const area = bw * bh
      const meanG = sumG / Math.max(1, cnt)
      const contrast = Math.max(0, meanG - globalMean)

      let score = (edgeCnt + 1) * (1 + contrast / 40) * Math.sqrt(cnt)
      if (aspect < 0.2 || aspect > 5) score *= 0.6
      if (area < (w * h) * 0.02) score *= 0.7

      if (score > bestScore) { bestScore = score; bestBox = { x0: minx, y0: miny, x1: maxx, y1: maxy } }
    }
  }

  if (!bestBox) return null

  const bx = Math.round(bestBox.x0 / scale)
  const by = Math.round(bestBox.y0 / scale)
  const bw2 = Math.round((bestBox.x1 - bestBox.x0 + 1) / scale)
  const bh2 = Math.round((bestBox.y1 - bestBox.y0 + 1) / scale)
  return padClamp({ x: bx, y: by, w: bw2, h: bh2 }, 0.18, W, H)
}

/** ====== PUBLIC: cari saran crop ====== */
export async function suggestAutoCrop(dataUrl: string, categoryName?: string): Promise<Suggestion | null> {
  if (typeof window === "undefined") return null
  const img = await loadImage(dataUrl)
  const W = img.naturalWidth, H = img.naturalHeight

  if (/s\/?n/i.test(categoryName || "") || /serial/i.test(categoryName || "")) {
    const bar = await detectBarcodeBox(dataUrl)
    if (bar) return { box: bar, naturalW: W, naturalH: H }
    const txt = await detectSerialTextBox(dataUrl, W, H)
    if (txt) return { box: txt, naturalW: W, naturalH: H }
  }

  const gen = await detectGenericObjectBox(dataUrl, categoryName)
  if (gen) return { box: gen, naturalW: W, naturalH: H }

  const sal = await detectSaliencyBox(dataUrl)
  if (sal) return { box: sal, naturalW: W, naturalH: H }

  return null
}