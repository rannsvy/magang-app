"use client";

import { useEffect, useState } from "react";
import { processQueue } from "./queue";

/** Hook status koneksi online/offline */
export function useOnlineStatus() {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Auto-sync antrean saat mount & saat kembali online */
export function useAutoSync(onSynced?: (ids: string[]) => void) {
  useEffect(() => {
    const run = async () => {
      const ok = await processQueue();
      if (ok.length && onSynced) onSynced(ok);
    };
    run(); // saat mount (app dibuka)
    const on = () => run(); // saat koneksi balik
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [onSynced]);
}
