// src/lib/quotes.ts

const QUOTES: string[] = [
  "Kerja yang baik, hasil memuaskan.",
  "Hari ini lebih baik dari kemarin.",
  "Tugas hari ini selesai semua!",
  "Teknisi andal, solusi tuntas.",
  "Setiap detail kecil itu penting.",
  "Kerja sempurna, tanpa rework.",
  "Kamu adalah pahlawan keluarga.",
  "Tantangan itu bikin kita kuat.",
  "Keberhasilan butuh ketekunan.",
  "Lakukan yang terbaik hari ini.",
  "Semangat bekerja, teknisi hebat!",
  "Pelanggan menanti hasil kerjamu.",
  "Kesuksesan dimulai dari sini.",
  "Bekerja sempurna, menjadi yang terbaik.",
  "Kerja itu ibadah.",
  "Jadikan hari ini hari yang sukses bekerja.",
  "Tetap semangat, Mas Bro!",
  "Senyum pelanggan adalah energimu.",
  "Berikan servis terbaikmu.",
  "Kerja tuntas, hati puas.",
  "Kualitas adalah prioritas utama.",
  "Selalu bekerja sepenuh hati.",
  "Ayo buat gebrakan hari ini!",
  "Masa depanmu ada di tanganmu.",
  "Jaga keselamatan, kerja aman.",
  "Kamu pasti bisa, buktikan!",
  "Waktunya beraksi, Mas Bro!",
  "Jadikan masalah jadi batu loncatan.",
  "Ini rejekimu, ayo kerja yang baik.",
  "Lelah boleh, menyerah jangan.",
  "Pelanggan menunggumu.",
  "Kerjamu adalah investasi.",
  "Satu langkah kecil, dampak besar.",
  "Buktikan dirimu layak sukses.",
  "Pahami masalah, selesaikan cepat.",
  "Hasil baik, rezeki lancar.",
  "Bersyukur hari ini bisa bekerja.",
  "Jadilah teknisi yang diandalkan.",
  "Buktikan kerjamu berkualitas.",
  "Kerja kerasmu takkan sia-sia.",
  "Selalu ada jalan keluar.",
  "Bekerja dengan hati, bukan hanya tangan.",
  "Kerjamu adalah rejeki, bukan beban.",
  "Buatlah harimu lebih produktif.",
  "Jangan tunda, kerjakan sekarang.",
  "Berbagi ilmu, saling membantu.",
  "Sukses adalah milik kita semua.",
  "Jadilah solusi, bukan masalah.",
  "Kita adalah tim yang solid.",
  "Ayo mulai harimu dengan senyum.",
  "Percaya pada kemampuanmu.",
  "Setiap usaha pasti ada hasilnya.",
  "Keringat hari ini, senyum esok.",
  "Waktu adalah uang.",
  "Fokus pada tujuan, bukan hambatan.",
  "Kerjakan dengan teliti dan cermat.",
  "Selalu ikuti prosedur kerja!",
  "Bangunlah reputasimu dari sekarang.",
  "Tetaplah rendah hati dan profesional.",
  "Kejujuran adalah modal utama.",
  "Kerjamu menentukan masa depanmu.",
  "Lakukan yang terbaik.",
  "Hasil kerjamu adalah cerminan dirimu.",
  "Maju terus pantang mundur!",
  "Kamu adalah andalan perusahaan.",
  "Jadilah teknisi yang terpercaya.",
  "Allah tersenyum saat dirimu bekerja.",
  "Cari solusi, bukan cari siapa yang salah!",
  "Jadilah teknisi terbaik"

];

/** hash harian deterministik (berganti tiap hari UTC) */
function dailySeed(date = new Date()): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
  return Math.floor(day);
}

/** Ambil quote untuk hari ini */
export function getDailyQuote(date = new Date()): string {
  if (QUOTES.length === 0) {
    return "Selalu ada cara yang lebih baik—kita temukan hari ini.";
  }
  const idx = dailySeed(date) % QUOTES.length;
  return QUOTES[idx];
}
