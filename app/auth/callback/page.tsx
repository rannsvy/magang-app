"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const ranOnce = useRef(false); // <-- guard anti double-run
  const [msg, setMsg] = useState("Menyelesaikan login…");

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    (async () => {
      const err = sp.get("error_description") || sp.get("error");
      if (err) {
        setMsg(decodeURIComponent(err));
        return;
      }

      const code = sp.get("code");
      if (!code) {
        setMsg("Kode OAuth tidak ditemukan.");
        return;
      }

      // kalau render pertama sudah sukses (mis. karena strict-mode duplikasi),
      // hindari tukar code lagi
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        const next = sp.get("next") || "/user/dashboard";
        router.replace(next);
        return;
      }

      // Tukar code → session (PKCE)
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        if (/invalid flow state/i.test(error.message)) {
          setMsg(
            "Sesi OAuth tidak ditemukan. Silakan coba login Google lagi dari halaman Login."
          );
          const next = sp.get("next") || "/user/dashboard";
          setTimeout(() => {
            router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
          }, 1200);
          return;
        }
        setMsg(error.message || "Gagal menyelesaikan login.");
        return;
      }

      // Kirim token ke server (cookie httpOnly untuk API routes)
      try {
        await fetch("/api/auth/set", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: data.session?.access_token,
            refresh_token: data.session?.refresh_token,
          }),
        });
      } catch {
        // tidak fatal untuk sisi klien
      }

      // Route by role
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let role: string | undefined =
        (user?.user_metadata as any)?.role || (user?.app_metadata as any)?.role;

      if (user && !role) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = prof?.role;
      }

      const isAdmin = role === "admin" || (user?.email ?? "").includes("admin");
      const next = sp.get("next");
      router.replace(
        next || (isAdmin ? "/admin/dashboard" : "/user/dashboard")
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-700">{msg}</p>
    </div>
  );
}
