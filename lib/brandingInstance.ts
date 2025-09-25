// src/lib/branding.ts
export type Instansi = "PPE" | "POS" | "POK" | "SGN" | "PPTI" | "UNKNOWN";

const ALIASES: Record<string, Instansi> = {
  // kalau masih ada payload lama pakai "POG", anggap sebagai PPE
  POG: "PPE",
};

export const INSTANSI_COLORS: Record<Instansi, string> = {
  PPE: "#93C5FD",   // biru muda (Tailwind blue-300 vibes)
  POS: "#9CA3AF",   // abu-abu
  POK: "#7F1D1D",   // merah gelap
  SGN: "#14B8A6",   // hijau toska
  PPTI: "#F472B6",  // merah muda terang
  UNKNOWN: "#ffffffff",
};

const VALID: Instansi[] = ["PPE", "POS", "POK", "SGN", "PPTI", "UNKNOWN"];

export function extractInstansi(
  job: { instansi?: string; packageCode?: string; jobId?: string }
): Instansi {
  // 1) field eksplisit
  if (job.instansi) {
    const code = job.instansi.toUpperCase();
    if (ALIASES[code]) return ALIASES[code];
    if ((["PPE","POS","POK","SGN","PPTI"] as const).includes(code as any)) {
      return code as Instansi;
    }
  }

  // 2) fallback dari prefix kode paket / jobId
  const src = (job.packageCode || job.jobId || "").toUpperCase();
  const pref = src.slice(0, 3);
  if (ALIASES[pref]) return ALIASES[pref];
  if ((["PPE","POS","POK","SGN","PPTI"] as const).includes(pref as any)) {
    return pref as Instansi;
  }

  return "UNKNOWN";
}

// Hitung warna teks otomatis agar tetap terbaca
export function autoTextColor(bgHex: string): "#000000" | "#FFFFFF" {
  const hex = bgHex.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L > 0.55 ? "#000000" : "#FFFFFF";
}
