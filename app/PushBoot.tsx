// app/PushBoot.tsx
"use client";

import { useEffect } from "react";
import { ensurePushSubscription, isPushSupported } from "@/lib/pushClient";

type Props = {
  /** Email user, diteruskan dari layout/server setelah login */
  userEmail?: string | null;
  /** VAPID public key (opsional, default ambil dari NEXT_PUBLIC_VAPID_PUBLIC_KEY) */
  vapidPublicKey?: string | null;
  /** Re-subscribe otomatis saat SW memberi sinyal (default: true) */
  autoSubscribe?: boolean;
};

export default function PushBoot({
  userEmail,
  vapidPublicKey,
  autoSubscribe = true,
}: Props) {
  useEffect(() => {
    // Hanya aktif di browser yang mendukung & sudah ada SW
    if (!isPushSupported() || !("serviceWorker" in navigator)) return;

    const onSWMessage = (e: MessageEvent) => {
      // SW boleh mengirim pesan bertipe "pushsubscriptionchange"
      if (
        e?.data?.type === "pushsubscriptionchange" &&
        autoSubscribe &&
        userEmail &&
        Notification.permission === "granted"
      ) {
        // Re-subscribe silent: user sudah grant permission
        ensurePushSubscription({
          email: userEmail, // <- ganti dari 'userEmail' prop ke field 'email' di options
          vapidPublicKey: vapidPublicKey ?? undefined,
          // subscribeEndpoint default: "/api/push/subscribe"
          // bisa tambahkan onError jika ingin logging:
          // onError: (err) => console.error("Re-subscribe gagal:", err),
        }).catch(() => {
          // diamkan agar tidak mengganggu UX; bisa tambahkan logging kalau perlu
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", onSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onSWMessage);
    };
  }, [userEmail, vapidPublicKey, autoSubscribe]);

  return null;
}
