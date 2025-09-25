// components/ShareScheduleButtonMulti.tsx
"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Share2, ListChecks } from "lucide-react"
import * as htmlToImage from "html-to-image"

type Props = {
  tableContainerRef: React.RefObject<HTMLElement>
  /** Optional: seed numbers, e.g. ["62812xxxx","0812xxxx"] */
  seedNumbers?: string[]
  /** Optional: turn raw image url into OG preview page */
  makePreviewPageUrl?: (imgUrl: string) => string
  /** Batch size to open tabs per tick (to reduce popup blocking) */
  batchSize?: number
  /** Delay between batches (ms) */
  batchDelayMs?: number
}

/* ===== Utils ===== */
function normalizeIndoNumber(raw: string): string | null {
  let s = raw.replace(/[^\d+]/g, "") // keep digits and plus
  if (!s) return null
  // +62...
  if (s.startsWith("+")) s = s.slice(1)
  // 0xxxxxxxx -> 62xxxxxxxx
  if (s.startsWith("0")) s = "62" + s.slice(1)
  // already 62...
  if (/^\d{8,20}$/.test(s)) return s
  return null
}

function parseNumbers(input: string): string[] {
  // split by newline, comma, semicolon, space
  const parts = input.split(/[\n,; ]+/).map(p => p.trim()).filter(Boolean)
  const uniq = new Set<string>()
  for (const p of parts) {
    const n = normalizeIndoNumber(p)
    if (n) uniq.add(n)
  }
  return [...uniq]
}

/* ===== Upload stub (ganti ke API anda) ===== */
async function uploadImageAndGetUrl(blob: Blob): Promise<string> {
  const fd = new FormData()
  fd.append("file", blob, `penjadwalan-${Date.now()}.png`)
  const res = await fetch("/api/upload", { method: "POST", body: fd })
  if (!res.ok) throw new Error("Upload gagal")
  const { url } = await res.json()
  return url as string
}

export function ShareScheduleButtonMulti({
  tableContainerRef,
  seedNumbers = [],
  makePreviewPageUrl,
  batchSize = 5,
  batchDelayMs = 450,
}: Props) {
  const [open, setOpen] = useState(false)
  const [rawNumbers, setRawNumbers] = useState<string>(seedNumbers.join("\n"))
  const parsed = useMemo(() => parseNumbers(rawNumbers), [rawNumbers])
  const [loading, setLoading] = useState(false)
  const [customMessage, setCustomMessage] = useState("Berikut screenshot tabel penjadwalan teknisi:")
  const busyRef = useRef(false)

  async function captureTable(): Promise<Blob> {
    const node = tableContainerRef.current
    if (!node) throw new Error("Container tabel tidak ditemukan")
    const blob = await htmlToImage.toBlob(node, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    })
    if (!blob) throw new Error("Gagal membuat gambar")
    return blob
  }

  function makeWaLink(phone: string, text: string) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
  }

  async function handleShareToMany() {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    try {
      // 1) Capture sekali
      const blob = await captureTable()
      // 2) Upload sekali
      const imgUrl = await uploadImageAndGetUrl(blob)
      const shareUrl = makePreviewPageUrl ? makePreviewPageUrl(imgUrl) : imgUrl
      const finalText = `${customMessage}\n${shareUrl}`

      if (parsed.length === 0) {
        alert("Nomor belum diisi / tidak valid.")
        return
      }

      // 3) Buka tab per nomor, dibatch agar tidak semua diblokir
      let idx = 0
      while (idx < parsed.length) {
        const chunk = parsed.slice(idx, idx + batchSize)
        for (const phone of chunk) {
          const url = makeWaLink(phone, finalText)
          // buka tab; sebagian browser membolehkan multiple asalkan dari 1 gesture + tidak terlalu banyak sekaligus
          window.open(url, "_blank", "noopener,noreferrer")
        }
        idx += chunk.length
        if (idx < parsed.length) {
          // jeda antar batch
          await new Promise(r => setTimeout(r, batchDelayMs))
        }
      }

      // Selesai
      setOpen(false)
    } catch (e) {
      console.error(e)
      // Fallback: download untuk manual attach
      try {
        const blob = await captureTable()
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = `penjadwalan-${Date.now()}.png`
        a.click()
        URL.revokeObjectURL(a.href)
        alert("Share otomatis gagal. Gambar telah diunduh; kirim manual via WhatsApp Web.")
      } catch {}
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Share2 className="h-4 w-4" />
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Share ke Banyak Nomor WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nomor WhatsApp (satu per baris / koma / spasi)</Label>
              <Textarea
                value={rawNumbers}
                onChange={(e) => setRawNumbers(e.target.value)}
                placeholder={`contoh:\n081234567890\n628112223334\n+62855xxxxxxx`}
                className="min-h-32"
              />
              <div className="text-sm text-muted-foreground">
                Ditemukan {parsed.length} nomor valid.
              </div>
              <div className="text-xs text-muted-foreground">
                Format otomatis: <code>08…</code> → <code>62…</code>, <code>+62…</code> → <code>62…</code>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Pesan (akan ditambah URL gambar)</Label>
              <Input
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div>Batch size</div>
                <Input
                  type="number"
                  min={1}
                  max={15}
                  value={batchSize}
                  onChange={() => {}}
                  readOnly
                  className="opacity-70 cursor-not-allowed"
                  title="Ubah via prop batchSize jika perlu"
                />
              </div>
              <div>
                <div>Delay/batch (ms)</div>
                <Input
                  type="number"
                  min={100}
                  max={3000}
                  value={batchDelayMs}
                  onChange={() => {}}
                  readOnly
                  className="opacity-70 cursor-not-allowed"
                  title="Ubah via prop batchDelayMs jika perlu"
                />
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              Catatan: Browser bisa membatasi jumlah tab yang dibuka sekaligus. Karena itu pengiriman dilakukan per batch. Jika ada yang
              terblokir, ulangi batch berikutnya atau klik ulang.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Batal
            </Button>
            <Button onClick={handleShareToMany} disabled={loading || parsed.length === 0}>
              {loading ? "Mengirim…" : `Kirim ke ${parsed.length} nomor`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
