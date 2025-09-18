// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AdminHeader } from "@/components/admin-header";
import {
  FileText,
  CheckCircle,
  Clock,
  Users,
  CalendarCheck,
  History,
  Server,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Stats = {
  completedCount: number;
  ongoingCount: number;
  reportsCount: number;
};

type SystemMetrics = {
  totalRamBytes: number;     // total RAM VM (bytes)
  usedRamBytes: number;      // RAM terpakai (bytes)
  totalStorageBytes: number; // total storage root (bytes)
  usedStorageBytes: number;  // storage terpakai (bytes)
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ================== MOCK SYSTEM METRICS (tanpa API) ================== */
function useMockSystemMetrics() {
  const [sys, setSys] = useState<SystemMetrics | null>(null);

  const GB = (n: number) => n * 1024 ** 3;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  useEffect(() => {
    const totalRamBytes = GB(4);       // 4 GB
    const totalStorageBytes = GB(256); // 256 GB

    // start dari angka yang terlihat realistis
    let ramPct = 0.48 + Math.random() * 0.18;       // ~48–66%
    let storagePct = 0.30 + Math.random() * 0.22;   // ~30–52%

    const emit = () => {
      setSys({
        totalRamBytes,
        usedRamBytes: Math.round(totalRamBytes * ramPct),
        totalStorageBytes,
        usedStorageBytes: Math.round(totalStorageBytes * storagePct),
      });
    };

    emit(); // initial render

    // random-walk agar terasa "live"
    const id = setInterval(() => {
      ramPct = clamp(ramPct + (Math.random() - 0.5) * 0.10, 0.10, 0.97);       // ±5% step
      storagePct = clamp(storagePct + (Math.random() - 0.5) * 0.04, 0.05, 0.95); // ±2% step
      emit();
    }, 3000);

    return () => clearInterval(id);
  }, []);

  return sys;
}

export default function AdminDashboard() {
  const router = useRouter();

  // ====== Dashboard Stats ======
  const [stats, setStats] = useState<Stats>({
    completedCount: 0,
    ongoingCount: 0,
    reportsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const handleNavigation = (path: string) => router.push(path);

  async function loadStats() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/stats/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "gagal ambil statistik");
      setStats(json.data as Stats);
    } catch (e: any) {
      setErr(e?.message || "gagal ambil statistik");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  // Realtime refresh angka
  useEffect(() => {
    let t: any;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(loadStats, 150);
    };

    const ch = supabase
      .channel("admin-dashboard-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_reports" },
        refresh
      )
      .subscribe();

    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, []);

  // ====== System Metrics (RAM/Storage) — MOCK ======
  const sys = useMockSystemMetrics();

  // Helpers
  const toGB = (bytes: number) => bytes / (1024 ** 3);
  const formatGB = (bytes: number) => `${toGB(bytes).toFixed(1)} GB`;

  const ramPct = useMemo(() => {
    if (!sys) return 0;
    if (sys.totalRamBytes <= 0) return 0;
    return Math.min(100, Math.max(0, (sys.usedRamBytes / sys.totalRamBytes) * 100));
  }, [sys]);

  const storagePct = useMemo(() => {
    if (!sys) return 0;
    if (sys.totalStorageBytes <= 0) return 0;
    return Math.min(100, Math.max(0, (sys.usedStorageBytes / sys.totalStorageBytes) * 100));
  }, [sys]);

  const barClass = (pct: number) =>
    pct >= 90 ? "bg-red-500" : "bg-blue-500";

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader title="Dashboard Admin" />

      <main className="p-4">
        <div className="max-w-10xl mx-auto">
          {/* Statistics Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {/* Pekerjaan Selesai */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex items-center">
                  <div className="p-4 bg-green-100 rounded-full">
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  </div>
                  <div className="ml-6">
                    <p className="text-lg font-medium text-gray-600 mb-1">
                      Pekerjaan Selesai
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {loading ? "…" : stats.completedCount}
                    </p>
                  </div>
                </div>
                {err && (
                  <p className="text-xs text-red-600 mt-2">Error: {err}</p>
                )}
              </CardContent>
            </Card>

            {/* Sedang Berlangsung */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex items-center">
                  <div className="p-4 bg-yellow-100 rounded-full">
                    <Clock className="h-12 w-12 text-yellow-600" />
                  </div>
                  <div className="ml-6">
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Sedang Berlangsung
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {loading ? "…" : stats.ongoingCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Laporan Dibuat */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex items-center">
                  <div className="p-4 bg-blue-100 rounded-full">
                    <FileText className="h-12 w-12 text-blue-600" />
                  </div>
                  <div className="ml-6">
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Laporan Dibuat
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {loading ? "…" : stats.reportsCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex flex-col items-center gap-6">
                  {/* Status RAM (centered) */}
                  <div className="w-full max-w-xs text-center">
                    <p className="text-[13px] font-medium text-gray-600">Status RAM</p>
                    <p className="text-[13px] text-gray-700">
                      {sys
                        ? `${formatGB(sys.usedRamBytes)} / ${formatGB(sys.totalRamBytes)}`
                        : "…"}
                    </p>
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden mx-auto">
                      <div
                        className={`h-full ${barClass(ramPct)} transition-all`}
                        style={{ width: `${ramPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Status Storage (centered) */}
                  <div className="w-full max-w-xs text-center">
                    <p className="text-[13px] font-medium text-gray-600">Status Storage</p>
                    <p className="text-[13px] text-gray-700">
                      {sys
                        ? `${formatGB(sys.usedStorageBytes)} / ${formatGB(sys.totalStorageBytes)}`
                        : "…"}
                    </p>
                    <div className="mt-2 h-2 w-full rounded-full bg-gray-200 overflow-hidden mx-auto">
                      <div
                        className={`h-full ${barClass(storagePct)} transition-all`}
                        style={{ width: `${storagePct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Menu Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/manage_teknisi")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6 bg-purple-100 rounded-full group-hover:bg-purple-200 transition-colors">
                    <Users className="h-16 w-16 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Kelola Data
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Lihat & Kelola Data User dan Kendaraaan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/assign_penjadwalan")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6 bg-orange-100 rounded-full group-hover:bg-orange-200 transition-colors">
                    <CalendarCheck className="h-16 w-16 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Assign Penjadwalan
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Penjadwalan Project dan Teknisi
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/generate_laporan")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6  bg-green-100 rounded-full group-hover:bg-green-200 transition-colors">
                    <FileText className="h-16 w-16 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Generate Laporan
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Pilih pekerjaan dan generate laporan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/history_pekerjaan")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6 bg-indigo-100 rounded-full group-hover:bg-indigo-200 transition-colors">
                    <History className="h-16 w-16 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Riwayat Pekerjaan
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Lihat riwayat semua pekerjaan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
