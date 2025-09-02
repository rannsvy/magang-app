"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // reload otomatis saat SW baru aktif (agar cache sinkron)
        reg.addEventListener?.("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              location.reload();
            }
          });
        });
      } catch (e) {
        console.warn("SW register failed:", e);
      }
    })();
  }, []);
  return null;
}
