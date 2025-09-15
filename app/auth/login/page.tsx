"use client"

import type React from "react"
import { useState, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getDailyQuote } from "@/lib/quotes"   // ⬅️ cukup ini
import { PWAInstallPrompt } from "@/components/pwa-install-prompt"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  // quote harian (tanpa role)
  const quote = useMemo(() => getDailyQuote(), []);

  // seed awal tetap berdasarkan hari (biar start-of-day beda tema)
  const dayIndex = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.floor((+now - +start) / (1000 * 60 * 60 * 24));
  }, []);

  const gradientThemes = [
    { bg: "bg-gradient-to-br from-emerald-600 to-emerald-800", text: "text-white" },
    { bg: "bg-gradient-to-br from-slate-900 to-slate-700",     text: "text-white" },
    { bg: "bg-gradient-to-br from-rose-600 to-fuchsia-700",    text: "text-white" },
    { bg: "bg-gradient-to-br from-cyan-600 to-blue-700",       text: "text-white" },
    { bg: "bg-gradient-to-br from-sky-50 to-sky-200",          text: "text-slate-900" },
    { bg: "bg-gradient-to-br from-amber-50 to-amber-200",      text: "text-slate-900" },
    { bg: "bg-gradient-to-br from-violet-100 to-white",        text: "text-slate-900" },
  ];

  // ====== Crossfade halus & warna teks ikut background ======
  const FADE_MS = 3000;   // 3s untuk transisi
  const HOLD_MS = 12000;  // 12s diam -> total 15s/tema

  const initialIdx =
    Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % gradientThemes.length;

  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [nextIdx, setNextIdx]       = useState((initialIdx + 1) % gradientThemes.length);
  const [textIdx, setTextIdx]       = useState(initialIdx); // <- warna teks aktif
  const [crossfading, setCrossfading] = useState(false);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    const cycle = () => {
      // mulai fade: langsung minta teks menuju warna tema berikutnya
      setTextIdx(nextIdx);
      setCrossfading(true);

      // akhir fade: commit background baru & siapkan next
      fadeTimer = setTimeout(() => {
        setCurrentIdx((c) => {
          const newCur = (c + 1) % gradientThemes.length;
          setNextIdx((newCur + 1) % gradientThemes.length);
          return newCur;
        });
        setCrossfading(false);
        holdTimer = setTimeout(cycle, HOLD_MS);
      }, FADE_MS);
    };

    // tampilkan tema awal dulu, lalu jalankan siklus
    holdTimer = setTimeout(cycle, HOLD_MS);

    return () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);



  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    setTimeout(() => {
      if (email && password) {
        if (email.includes("admin")) router.push("/admin/dashboard")
        else router.push("/user/dashboard")
      } else {
        setError("Email atau password salah")
      }
      setIsLoading(false)
    }, 1000)
  }

  const handleForgotPassword = () => router.push("/auth/forgot_password")

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Sistem Laporan Otomatis Teknisi
          </CardTitle>
          <CardDescription>Masuk ke akun Anda untuk melanjutkan</CardDescription>

      <div className="mt-4 relative rounded-xl shadow-sm ring-1 ring-black/5 overflow-hidden">
        {/* BG A */}
        <div
          className={[
            "absolute inset-0 transition-opacity duration-[3000ms] ease-linear",
            "will-change-[opacity] pointer-events-none",
            gradientThemes[currentIdx].bg,
            crossfading ? "opacity-0" : "opacity-100",
          ].join(" ")}
        />
        {/* BG B */}
        <div
          className={[
            "absolute inset-0 transition-opacity duration-[3000ms] ease-linear",
            "will-change-[opacity] pointer-events-none",
            gradientThemes[nextIdx].bg,
            crossfading ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />

        {/* Teks: warna di-animate sinkron 3s */}
        <blockquote
          className={[
            "relative z-10 px-6 py-7 sm:px-7 sm:py-8",
            "text-center italic leading-tight tracking-tight [text-wrap:balance]",
            "transition-colors duration-[3000ms] ease-linear",
            gradientThemes[textIdx].text, // <- otomatis gelap/terang sesuai tema target
          ].join(" ")}
        >
          <span className="block text-2xl sm:text-3xl lg:text-4xl font-semibold">
            “{quote}”
          </span>
        </blockquote>
      </div>


        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Masukkan email Anda"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Masukkan password Anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Masuk..." : "Login"}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Lupa Password?
            </button>
          </div>
        </CardContent>
      </Card>

      <PWAInstallPrompt/>
    </div>
  )
}
