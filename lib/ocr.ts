// src/lib/ocr.ts
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
  out = out.replace(/\s+/g, "")                           // join spasi internal
  out = out.replace(/Q(?=\d)/g, "0")
  out = out.replace(/(?<=\d)O(?=\d)/g, "0").replace(/O(?=\d)/g, "0")
  out = out.replace(/(?<=\d)[IL](?=\d)/g, "1")
  out = out.replace(/(?<=\d)B(?=\d)/g, "8")
  out = out.replace(/(?<=\d)S(?=\d)/g, "5")
  out = out.replace(/[^\w\-\/]/g, "")                     // simpan '/'
  return out
}

function extractSN(
  ocrText: string,
  words?: Array<{ text: string }>,
  lines?: Array<{ text: string }>
) {
  const labelPattern = /\b(?:S\/?N|Serial(?:\s*No\.?| Number)?)\b/i
  const spacedToken = "((?:[A-Z0-9\\-\\/]\\s*){5,})"
  const valueRegex = new RegExp(`[:#\\-]?\\s*${spacedToken}`, "i")

  for (const l of lines || []) {
    if (labelPattern.test(l.text)) {
      const after = l.text.replace(new RegExp(`^[\\s\\S]*?${labelPattern.source}`, "i"), "")
      const m = after.match(valueRegex)
      if (m?.[1]) return normalizeSN(m[1])
    }
  }

  const mAll = ocrText.match(new RegExp(labelPattern.source + "\\s*" + valueRegex.source, "i"))
  if (mAll?.[1]) return normalizeSN(mAll[1])

  const labelLine = (ocrText.split(/\r?\n/).find((l) => labelPattern.test(l)) || "").replace(
    labelPattern,
    ""
  )
  const mLoose = labelLine.match(new RegExp(spacedToken, "i"))
  if (mLoose?.[1]) return normalizeSN(mLoose[1])

  const mDigits = ocrText.replace(/\s+/g, "").match(/\d{10,}/)
  if (mDigits?.[0]) return normalizeSN(mDigits[0])

  return ""
}

/** Blob/DataURL helpers */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })
}

async function scaleUpDataUrl(dataUrl: string, factor = 3): Promise<string> {
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
    if (typeof window === "undefined") return null // jaga SSR/RSC
    // Dynamic import supaya tidak membebani bundle kalau tak terpakai
    const mod = await import("@zxing/browser")
    const reader = new mod.BrowserMultiFormatReader()
    const imgEl = new Image()
    imgEl.src = dataUrl
    await new Promise<void>((res, rej) => {
      imgEl.onload = () => res()
      imgEl.onerror = () => rej(new Error("Image load error"))
    })
    // @ts-ignore - zxing typing agak berbeda-beda per versi
    const result = await reader.decodeFromImageElement(imgEl as HTMLImageElement)
    const txt = (result as any)?.getText?.() ?? ""
    return txt ? normalizeSN(txt) : null
  } catch {
    return null
  }
}

/** ======= OCR: kabel meter ======= */
export function extractMeters(text: string): number | null {
  const T = text
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/\s{2,}/g, " ")

  let m =
    T.match(/\b(\d{2,4})\s*(?:M|MTRS?|METERS?)\b/) ||
    T.match(/\b(?:LEN|LENGTH)\s*[:\-]?\s*(\d{2,4})\s*M\b/)
  if (m?.[1]) {
    const n = parseInt(m[1], 10)
    if (!isNaN(n)) return n
  }

  const m2 = T.match(/\b((?:\d\s*){2,4})\s*(?:M|MTRS?|METERS?)\b/)
  if (m2?.[1]) {
    const digits = m2[1].replace(/\s+/g, "")
    const n = parseInt(digits, 10)
    if (!isNaN(n)) return n
  }

  if (/\bM(?:TRS?|ET(?:ER|ERS)?)?\b/.test(T)) {
    const nums = Array.from(T.matchAll(/\b(\d{2,4})\b/g)).map((x) => parseInt(x[1], 10))
    if (nums.length) return Math.max(...nums)
  }

  return null
}

/** ================== API yang dipakai page.tsx ================== */

/**
 * OCR Serial Number:
 * - Coba barcode (ZXing) lebih dulu (jika paket tersedia).
 * - Lalu Tesseract dua mode (PSM 6, 7) + upscale.
 * - onProgress dipanggil untuk update UI (opsional).
 */
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

    if (enableBarcode) {
      const bc = await tryDecodeBarcodeFromDataUrl(dataUrl)
      if (bc) {
        onProgress?.({ status: "done", progress: 100 })
        return bc
      }
    }

    const scaled = await scaleUpDataUrl(dataUrl, 3)
    const tryModes = [6, 7] as const
    let snVal = ""

    for (let i = 0; i < tryModes.length; i++) {
      onProgress?.({ status: "ocr", progress: i === 0 ? 1 : 60 })
      const result = await Tesseract.recognize(scaled, "eng", {
        // @ts-ignore
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:-/#",
        // @ts-ignore
        user_defined_dpi: "300",
        // @ts-ignore
        tessedit_pageseg_mode: tryModes[i],
        // @ts-ignore
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

/**
 * OCR angka meter kabel:
 * - Upscale → rotate [0,90,180,270] → PSM [7,6,11,13]
 */
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
