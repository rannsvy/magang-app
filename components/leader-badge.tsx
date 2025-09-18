// /components/leader-badge.tsx
"use client";

import * as React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type SupervisorLite = {
  id: string;
  name: string;
  nickname: string;
  role?: string;
};
type Props = {
  date: string; // YYYY-MM-DD
  projectId: string;
  leaderName: string;
  currentSupervisor?: SupervisorLite | null;
  supervisors: SupervisorLite[];
  onAssigned?: (s?: SupervisorLite | null) => void;
};

export function LeaderBadge({
  date,
  projectId,
  leaderName,
  currentSupervisor,
  supervisors,
  onAssigned,
}: Props) {
  const [busy, setBusy] = React.useState(false);

  const assign = async (supervisorId: string) => {
    try {
      setBusy(true);
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          assignments: [], // tidak mengubah teknisi
          supervisors: [{ projectId, supervisorId }],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error || "Gagal menyimpan supervisor");
      }
      const picked = supervisors.find((s) => s.id === supervisorId) || null;
      onAssigned?.(picked || null);
    } catch (e: any) {
      alert(e?.message || "Gagal menyimpan supervisor");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          className={`px-2 py-1 rounded text-white ${
            busy ? "bg-emerald-400" : "bg-emerald-600"
          } hover:opacity-95`}
          title="Klik kanan untuk mengatur supervisor"
        >
          Leader: {leaderName}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled>
          {currentSupervisor
            ? `Supervisor: ${currentSupervisor.nickname} — ${currentSupervisor.name}`
            : "Supervisor: —"}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Pilih Supervisor</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {supervisors.map((s) => (
              <ContextMenuItem key={s.id} onClick={() => assign(s.id)}>
                {s.nickname} {s.role ? `— ${s.role}` : ""}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
