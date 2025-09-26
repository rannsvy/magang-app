// app/login/page.tsx
"use client";

import type { FormEvent } from "react";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { getDailyQuote } from "@/lib/quotes";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { supabase } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();

  // ====== State ======
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // ====== Quote ======
  const quote = useMemo(() => getDailyQuote(), []);

  // ====== Gradient crossfade (dari code 1) ======
  const gradientThemes = [
    {
      bg: "bg-gradient-to-br from-emerald-600 to-emerald-800",
      text: "text-white",
    },
    { bg: "bg-gradient-to-br from-slate-900 to-slate-700", text: "text-white" },
    {
      bg: "bg-gradient-to-br from-rose-600 to-fuchsia-700",
      text: "text-white",
    },
    { bg: "bg-gradient-to-br from-cyan-600 to-blue-700", text: "text-white" },
    { bg: "bg-gradient-to-br from-sky-50 to-sky-200", text: "text-slate-900" },
    {
      bg: "bg-gradient-to-br from-amber-50 to-amber-200",
      text: "text-slate-900",
    },
    {
      bg: "bg-gradient-to-br from-violet-100 to-white",
      text: "text-slate-900",
    },
  ];

  const FADE_MS = 3000; // durasi transisi
  const HOLD_MS = 12000; // jeda sebelum transisi berikutnya

  const initialIdx =
    Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % gradientThemes.length;

  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  const [nextIdx, setNextIdx] = useState(
    (initialIdx + 1) % gradientThemes.length
  );
  const [textIdx, setTextIdx] = useState(initialIdx);
  const [crossfading, setCrossfading] = useState(false);

  useEffect(() => {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    const cycle = () => {
      setTextIdx(nextIdx);
      setCrossfading(true);

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

    holdTimer = setTimeout(cycle, HOLD_MS);

    return () => {
      if (holdTimer) clearTimeout(holdTimer);
      if (fadeTimer) clearTimeout(fadeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== Auth helpers ======
  const routeAfterLogin = async () => {
    let user = (await supabase.auth.getUser()).data.user;
    if (!user) {
      await new Promise((r) => setTimeout(r, 150));
      user = (await supabase.auth.getUser()).data.user;
    }
    if (!user) {
      setError("Login gagal menyelesaikan sesi. Coba lagi.");
      return;
    }

    let role: string | undefined =
      (user.user_metadata as any)?.role || (user.app_metadata as any)?.role;

    if (!role) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      role = prof?.role ?? "";
    }

    const isAdmin = role === "admin" || (user.email ?? "").includes("admin");
    router.replace(isAdmin ? "/admin/dashboard" : "/user/dashboard");
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const emailTrim = email.trim();

      const { error } = await supabase.auth.signInWithPassword({
        email: emailTrim,
        password,
      });
      if (error) {
        setError(error.message || "Email atau password salah");
        return;
      }

      // sinkronkan cookie httpOnly (opsional, jika ada endpoint /api/auth/set)
      const { data: sess } = await supabase.auth.getSession();
      const at = sess?.session?.access_token;
      const rt = sess?.session?.refresh_token;

      if (at && rt) {
        const res = await fetch("/api/auth/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ access_token: at, refresh_token: rt }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          console.warn("auth/set failed:", j?.error || res.statusText);
        }
      }

      await routeAfterLogin();
    } catch (err: any) {
      setError(err?.message ?? "Terjadi kesalahan saat login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const qs = window.location.search || "";
      const redirectTo = `${window.location.origin}/auth/callback${qs}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) setError(error.message);
    } catch (err: any) {
      setError(err?.message ?? "Gagal memulai login Google");
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = () => router.push("/auth/forgot_password");

  // ====== UI ======
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Reaport
          </CardTitle>
          <CardDescription>
            Masuk ke akun Anda untuk melanjutkan
          </CardDescription>

          {/* Quote dengan background gradient crossfade (dari code 1) */}
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

            {/* Teks: warna ikut tema target */}
            <blockquote
              className={[
                "relative z-10 px-6 py-7 sm:px-7 sm:py-8",
                "text-center italic leading-tight tracking-tight [text-wrap:balance]",
                "transition-colors duration-[3000ms] ease-linear",
                gradientThemes[textIdx].text,
              ].join(" ")}
            >
              <span className="block text-2xl sm:text-3xl lg:text-4xl font-semibold">
                “{quote}”
              </span>
            </blockquote>
          </div>
        </CardHeader>

        <CardContent>
          {/* Login Email / Password */}
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
                autoComplete="email"
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
                autoComplete="current-password"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading ? "Masuk..." : "Login"}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-500">atau</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Login dengan Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading || isLoading}
          >
            {/* Ikon Google */}
            <svg
              className="mr-2 h-4 w-4"
              viewBox="0 0 533.5 544.3"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M533.5 278.4c0-18.5-1.7-36.3-5-53.5H272v101.2h146.9c-6.3 34-25.2 62.8-53.8 82v68.1h86.9c51 47 80.5 116.3 80.5 196.8 0 17.7-1.7 35-4.9 51.6h105.9V278.4z"
                fill="#4285f4"
              />
              <path
                d="M272 544.3c73.5 0 135.3-24.3 180.4-65.9l-86.9-68.1c-24.2 16.3-55.2 26-93.5 26-71.9 0-132.8-48.6-154.6-114.1H-1.7v71.6C43.3 491.2 149.5 544.3 272 544.3z"
                fill="#34a853"
              />
              <path
                d="M117.4 322.2c-5.6-16.7-8.7-34.5-8.7-53s3.1-36.3 8.7-53V144.6H-1.7C-20.6 185.6-31 230.7-31 269.2s10.4 83.6 29.3 124.6l119.1-71.6z"
                fill="#fbbc05"
              />
              <path
                d="M272 106.6c39.9 0 75.7 13.8 103.9 40.7l78.1-78.1C407.3 25.6 345.5 1 272 1 149.5 1 43.3 54.1-1.7 143.7l119.1 71.6C139.2 155.9 200.1 106.6 272 106.6z"
                fill="#ea4335"
              />
            </svg>
            {isGoogleLoading ? "Menghubungkan..." : "Lanjutkan dengan Google"}
          </Button>

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

      <PWAInstallPrompt />
    </div>
  );
}
