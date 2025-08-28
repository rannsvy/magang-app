/* eslint-disable @typescript-eslint/ban-ts-comment */
import Tesseract from "tesseract.js"

/** ===== Types untuk progress OCR di UI ===== */
export type OCRPhase = "idle" | "barcode" | "ocr" | "done" | "error"

export interface OcrInfo {
  status: OCRPhase
  progress: number
  error?: string
}

export type OcrProgress = (info: OcrInfo) => void

/** ===== Utils kecil ===== */

export function normalizeSN(val: string) {
  let out = (val || "").trim().toUpperCase()
  out = out.replace(/\s+/g, "")                           // gabung spasi internal
  // Koreksi ambiguity umum
  out = out.replace(/Q(?=\d)/g, "0")
  out = out.replace(/(?<=\d)O(?=\d)/g, "0").replace(/O(?=\d)/g, "0")
  out = out.replace(/(?<=\d)[IL](?=\d)/g, "1")
  out = out.replace(/(?<=\d)B(?=\d)/g, "8")
  out = out.replace(/(?<=\d)S(?=\d)/g, "5")
  // Biarkan - dan /, buang lainnya
  out = out.replace(/[^\w\-\/]/g, "")
  return out
}

/** Pilih SN terbaik secara dinamis (tidak selalu 8 char) */
function selectBestSN(raw: string): string | null {
  const hadSlash = raw.includes("/")
  const left = raw.split("/")[0] // buang revisi setelah slash (mis. /r3)
  const cleaned = normalizeSN(left)
  const alnum = cleaned.replace(/[^A-Z0-9]/g, "")

  // Jika ada slash dan bagian kiri sudah panjang (≥9), pakai utuh (contoh: HFE09F3HKDT/r3)
  if (hadSlash && alnum.length >= 9) return alnum

  // Barcode/angka panjang → pakai utuh
  if (/^\d{12,}$/.test(alnum)) return alnum

  // Prioritaskan tepat 8 yang mengandung huruf & angka (contoh HDD Seagate)
  const m8mix = alnum.match(/(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8}/)
  if (m8mix) return m8mix[0]

  // Jika 9–20 dan campuran huruf+angka → pakai utuh
  if (alnum.length >= 9 && alnum.length <= 20 && /[A-Z]/.test(alnum) && /\d/.test(alnum)) {
    return alnum
  }

  // Fallback: kalau ≥8 → ambil 8 pertama
  if (alnum.length >= 8) return alnum.slice(0, 8)

  return null
}

/**
 * Ambil Serial Number dari hasil OCR.
 * Strategi:
 * - Cari label "SN", "S/N", "Serial No", "Serial Number".
 * - Ambil kandidat setelah label, lalu pilih terbaik via selectBestSN.
 */
function extractSN(
  ocrText: string,
  words?: Array<{ text: string }>,
  lines?: Array<{ text: string }>
) {
  const labelRe = /\b(?:S\/?N|SERIAL(?:\s*NO\.?|(?:\s*NUMBER)?))\b/i

  // a) Per baris
  for (const L of (lines || [])) {
    if (labelRe.test(L.text)) {
      const after = L.text.split(labelRe)[1] ?? ""
      const sn1 = selectBestSN(after)
      if (sn1) return sn1
    }
  }

  // b) Per kata - cari token SN diikuti 1–2 token
  if (words && words.length) {
    for (let i = 0; i < words.length; i++) {
      if (labelRe.test(words[i].text)) {
        const joined = [(words[i + 1]?.text ?? ""), (words[i + 2]?.text ?? "")].join(" ")
        const sn2 = selectBestSN(joined)
        if (sn2) return sn2
      }
    }
  }

  // c) Global "SN: <nilai>"
  const T = (ocrText || "").toUpperCase()
  const globalRe = new RegExp(
    labelRe.source + String.raw`\s*[:#-]?\s*([A-Z0-9\s\-\/]{5,})`,
    "i"
  )
  const mg = T.match(globalRe)
  if (mg?.[1]) {
    const sn3 = selectBestSN(mg[1])
    if (sn3) return sn3
  }

  // d) Baris label → long run
  const lineWithLabel =
    (T.split(/\r?\n/).find((l) => labelRe.test(l)) || "").replace(labelRe, "")
  const mLoose = lineWithLabel.match(/[A-Z0-9\-\/]{6,}/i)
  if (mLoose?.[0]) {
    const sn4 = selectBestSN(mLoose[0])
    if (sn4) return sn4
  }

  // e) Fallback: deretan digit panjang di mana pun
  const mDigits = T.match(/\b\d{8,}\b/)
  if (mDigits?.[0]) {
    const sn5 = selectBestSN(mDigits[0])
    if (sn5) return sn5
  }

  return ""
}

/** Blob/DataURL helpers */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.readAsDataURL(blob)
  })
}

async function scaleUpDataUrl(dataUrl: string, factor = 2): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.naturalWidth * factor
      canvas.height = img.naturalHeight * factor
      const ctx = canvas.getContext("2d")!
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function rotateDataUrl(dataUrl: string, deg: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const rad = (deg * Math.PI) / 180
      const w = img.naturalWidth
      const h = img.naturalHeight
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")!

      if (deg % 180 === 0) {
        canvas.width = w
        canvas.height = h
      } else {
        canvas.width = h
        canvas.height = w
      }

      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(rad)
      ctx.drawImage(img, -w / 2, -h / 2)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/** Optional barcode decode (ZXing). Jika paket tidak ada → return null */
async function tryDecodeBarcodeFromDataUrl(dataUrl: string): Promise<string | null> {
  try {
    if (typeof window === "undefined") return null
    const mod = await import("@zxing/browser")
    const reader = new mod.BrowserMultiFormatReader()
    const imgEl = new Image()
    imgEl.src = dataUrl
    await new Promise<void>((res, rej) => {
      imgEl.onload = () => res()
      imgEl.onerror = () => rej(new Error("Image load error"))
    })
    // @ts-ignore - zxing typing
    const result = await reader.decodeFromImageElement(imgEl as HTMLImageElement)
    const txt = (result as any)?.getText?.() ?? ""
    const sn = selectBestSN(txt)
    return sn ?? null
  } catch {
    return null
  }
}

/** ======= OCR: kabel meter ======= */
function extractMeters(text: string): number | null {
  const T = (text || "")
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")

  const near = T.match(/\b(\d{2,4})\s*(M(?:TRS?|ET(?:ER|ERS)?)?)\b/)
  if (near) return parseInt(near[1], 10)

  if (/\bM(?:TRS?|ET(?:ER|ERS)?)?\b/.test(T)) {
    const nums = Array.from(T.matchAll(/\b(\d{2,4})\b/g)).map((x) => parseInt(x[1], 10))
    if (nums.length) return Math.max(...nums)
  }

  return null
}

/** ================== API yang dipakai page.tsx ================== */

/** OCR Serial Number */
export async function recognizeSerialNumber(
  imageSource: Blob | string,
  opts?: { onProgress?: OcrProgress; enableBarcode?: boolean }
): Promise<string | null> {
  const onProgress = opts?.onProgress
  const enableBarcode = opts?.enableBarcode ?? true

  try {
    onProgress?.({ status: "barcode", progress: 0 })

    let dataUrl: string
    if (typeof imageSource === "string") {
      dataUrl = imageSource
    } else {
      dataUrl = await blobToDataUrl(imageSource)
    }

    // 1) Coba barcode dulu
    if (enableBarcode) {
      const bc = await tryDecodeBarcodeFromDataUrl(dataUrl)
      if (bc) {
        onProgress?.({ status: "done", progress: 100 })
        return bc
      }
    }

    // 2) OCR (rotate + upscale + beberapa PSM)
    const scaled = await scaleUpDataUrl(dataUrl, 3)
    const tryModes = [6, 7] as const
    const angles = [0, 90, 180, 270]
    onProgress?.({ status: "ocr", progress: 10 })

    let snVal: string | null = null

    for (const psm of tryModes) {
      for (const ang of angles) {
        const du = ang === 0 ? scaled : await rotateDataUrl(scaled, ang)
        // @ts-ignore
        const result = await Tesseract.recognize(du, "eng", {
          // @ts-ignore
          logger: (m) => {
            if (m.status === "recognizing text" && m.progress != null) {
              onProgress?.({
                status: "ocr",
                progress: Math.min(99, Math.round(10 + m.progress * 80)),
              })
            }
          },
          // @ts-ignore
          tessedit_pageseg_mode: String(psm),
          preserve_interword_spaces: "1",
        })
        const text = (result.data?.text ?? "").trim()
        // @ts-ignore
        const words = (result.data?.words ?? []) as Array<{ text: string }>
        // @ts-ignore
        const lines = (result.data?.lines ?? []) as Array<{ text: string }>
        snVal = extractSN(text, words, lines)
        if (snVal && snVal.length >= 8) break
      }
      if (snVal && snVal.length >= 8) break
    }

    if (snVal) {
      onProgress?.({ status: "done", progress: 100 })
      return snVal
    } else {
      onProgress?.({ status: "error", progress: 0, error: "SN tidak terdeteksi." })
      return null
    }
  } catch (e: any) {
    onProgress?.({ status: "error", progress: 0, error: e?.message || "Gagal memproses OCR." })
    return null
  }
}

/** OCR angka meter kabel */
export async function recognizeCableMeters(
  imageSource: Blob | string,
  opts?: { onProgress?: OcrProgress }
): Promise<number | null> {
  const onProgress = opts?.onProgress
  try {
    let dataUrl: string
    if (typeof imageSource === "string") dataUrl = imageSource
    else dataUrl = await blobToDataUrl(imageSource)

    const scaled = await scaleUpDataUrl(dataUrl, 3)
    const angles = [0, 90, 180, 270]
    const psms = [7, 6, 11, 13] as const

    for (const ang of angles) {
      const rotated = await rotateDataUrl(scaled, ang)
      for (const psm of psms) {
        onProgress?.({ status: "ocr", progress: 1 })
        const result = await Tesseract.recognize(rotated, "eng", {
          // @ts-ignore
          tessedit_char_whitelist: "0123456789Mm",
          // @ts-ignore
          user_defined_dpi: "300",
          // @ts-ignore
          tessedit_pageseg_mode: psm,
          // @ts-ignore
          preserve_interword_spaces: "1",
        })
        const text = (result.data?.text ?? "").trim()
        const meter = extractMeters(text)
        if (typeof meter === "number") {
          onProgress?.({ status: "done", progress: 100 })
          return meter
        }
      }
    }
    onProgress?.({ status: "error", progress: 0, error: "Meter tidak terdeteksi." })
    return null
  } catch (e: any) {
    onProgress?.({ status: "error", progress: 0, error: e?.message || "Gagal OCR meter." })
    return null
  }
}
