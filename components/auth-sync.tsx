// components/auth-sync.tsx
"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseBrowser";

async function pushSessionToServer() {
  const s = (await supabase.auth.getSession()).data.session;
  if (!s) return;
  await fetch("/api/auth/set", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
    }),
  });
}

export function AuthSync() {
  const pushedOnce = useRef(false);

  useEffect(() => {
    let mounted = true;

    // 1) Saat halaman pertama kali load, kirim session yang dipulihkan
    if (!pushedOnce.current) {
      pushedOnce.current = true;
      void pushSessionToServer();
    }

    // 2) Saat token auto-refresh / sign-in / user update, sinkron lagi
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "USER_UPDATED"
        ) {
          if (session) {
            await fetch("/api/auth/set", {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              }),
            });
          }
        } else if (event === "SIGNED_OUT") {
          await fetch("/api/auth/clear", {
            method: "POST",
            credentials: "include",
          });
        }
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
