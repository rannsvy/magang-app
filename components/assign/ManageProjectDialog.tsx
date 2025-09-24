"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ManageProject from "./ManageProject";

export default function ManageProjectDialog({ open, onOpenChange }:{
  open:boolean; onOpenChange:(v:boolean)=>void
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* kurangi padding vertikal; penuh tinggi agar konten proporsional */}
      <DialogContent className="w-[96vw] max-w-[1500px] h-[88vh] p-3 md:p-4 flex flex-col">
        {/* rapatkan header */}
        <DialogHeader className="pb-2">
          <DialogTitle>Manage Project (Waitlist)</DialogTitle>
        </DialogHeader>

        {/* isi menempel ke header, tidak ada gap tak perlu */}
        <div key={refreshKey} className="flex-1 min-h-0">
          <ManageProject
            onDone={() => {
              setRefreshKey(k => k + 1);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

