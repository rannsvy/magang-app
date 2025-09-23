"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Crown,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Row = {
  rank: number;
  technicianId: string;
  name: string;
  nama_lengkap: string;
  points: number;
  prevPoints: number;
  delta: number;
  trend: "up" | "down" | "flat";
};

export default function LeaderboardClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [monthLabel, setMonthLabel] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/points/leaderboard", {
          cache: "no-store",
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setRows(data.data || []);
        const d = new Date(data.monthStart + "T00:00:00Z");
        const formatter = new Intl.DateTimeFormat("id-ID", {
          month: "long",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        });
        setMonthLabel(formatter.format(d));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="min-h-[100dvh] bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div className="text-base font-semibold text-gray-900">Leaderboard</div>
        <button className="p-2 rounded-full hover:bg-gray-100">
          <MoreHorizontal className="h-5 w-5 text-gray-700" />
        </button>
      </div>

      {/* Tabs (dummy visual sesuai desain) */}
      <div className="px-5 mt-2">
        <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
          <button disabled className="p-1 rounded-md bg-gray-100">
            <ChevronLeft className="h-4 w-4 text-gray-400" />
          </button>
          <span>{monthLabel || "Bulan ini"}</span>
          <button disabled className="p-1 rounded-md bg-gray-100">
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Podium */}
      <div className="px-5 mt-6">
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200 p-4">
          <div className="grid grid-cols-3 items-end gap-3">
            {/* 2nd */}
            <PodiumCard place={2} row={top3[1]} />
            {/* 1st */}
            <PodiumCard place={1} row={top3[0]} />
            {/* 3rd */}
            <PodiumCard place={3} row={top3[2]} />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="px-5 mt-6">
        <div className="rounded-2xl bg-white shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-6 text-gray-500 text-sm">Memuat...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-gray-500 text-sm">
              Belum ada poin bulan ini.
            </div>
          ) : (
            <ul>
              {rest.map((r) => (
                <li
                  key={r.technicianId}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-none"
                >
                  <div className="w-6 text-gray-400 text-sm tabular-nums">
                    {r.rank}
                  </div>
                  <Avatar name={r.name} />
                  <div className="flex-1">
                    <div className="text-sm font-medium leading-tight text-gray-900">
                      {r.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      @{r.name.toLowerCase()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold tabular-nums text-gray-900">
                      {r.points}
                    </div>
                    {r.trend === "up" ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : r.trend === "down" ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : (
                      <Minus className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}

function PodiumCard({ place, row }: { place: 1 | 2 | 3; row?: Row }) {
  const classes =
    place === 1 ? "bg-blue-50 h-44" : "bg-gray-50 h-36 opacity-90";
  const crown = place === 1;

  return (
    <div
      className={`rounded-2xl ${classes} flex flex-col items-center justify-end pb-3`}
    >
      <div className={`-mt-10 mb-2 relative`}>
        <Avatar
          name={(row?.name || "?").toUpperCase()}
          size={place === 1 ? 72 : 56}
          ringColor={
            place === 1 ? "#FACC15" : place === 2 ? "#60A5FA" : "#34D399"
          }
        />
        {crown && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <Crown className="h-6 w-6 text-yellow-400 drop-shadow" />
          </div>
        )}
      </div>
      <div className="text-sm font-semibold text-gray-900">
        {row?.nama_lengkap ?? (place === 1 ? "—" : "—")}
      </div>
      <div
        className={`${
          place === 1 ? "text-yellow-600" : "text-gray-700"
        } font-bold tabular-nums`}
      >
        {row?.points ?? 0}
      </div>
    </div>
  );
}

function Avatar({
  name,
  size = 40,
  ringColor = "#60A5FA",
}: {
  name: string;
  size?: number;
  ringColor?: string;
}) {
  const s = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderColor: ringColor,
  };
  return (
    <div
      className="rounded-full border-2 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-sm font-bold text-blue-800"
      style={s}
      title={name}
    >
      {name}
    </div>
  );
}
