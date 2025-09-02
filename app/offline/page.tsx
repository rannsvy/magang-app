"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function OfflinePage() {
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <main className="min-h-screen grid place-items-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow p-6 text-center">
        <div className="mx-auto mb-3 h-16 w-16 grid place-items-center text-3xl">
          <span role="img" aria-label="offline">📡</span>
        </div>

        <h1 className="text-xl font-semibold mb-2">Mode Offline</h1>
        <p className="text-sm text-gray-600 mb-4">
          Anda sedang tidak terhubung ke internet. Aplikasi tetap dapat digunakan.
        </p>

        <ul className="text-left text-sm text-gray-600 list-disc list-inside mb-4 space-y-1">
          <li>Halaman yang sudah pernah dibuka tetap bisa diakses dari cache.</li>
          <li>Unggahan saat offline akan diantre dan otomatis terkirim ketika online.</li>
        </ul>

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => location.reload()}
            className="px-3 py-2 rounded-lg bg-blue-600 text-white"
          >
            Coba Muat Ulang
          </button>
          <Link
            href="/user/dashboard"
            className="px-3 py-2 rounded-lg border"
          >
            Buka Dashboard
          </Link>
          <Link
            href="/user/upload_foto"
            className="px-3 py-2 rounded-lg border"
          >
            Buka Upload Foto
          </Link>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Status koneksi:{" "}
          <span className={online ? "text-green-600" : "text-yellow-600"}>
            {online ? "Online" : "Offline"}
          </span>
        </p>
      </div>
    </main>
  );
}
