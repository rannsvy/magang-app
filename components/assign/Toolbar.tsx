"use client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, ChevronLeft, ChevronRight, Edit, Plus, Share } from "lucide-react";
import React from "react";

type Props = {
  selectAll: boolean;
  onSelectAllChange: (v: boolean) => void;
  onEditProjectOpen: () => void;
  onCreateProjectOpen: () => void;
  onShare: () => void;
  isExporting: boolean;

  onSaveAssignment: () => void;
  selectedCount: number;
  loading: boolean;

  currentDateLabel: string;
  onPrevDate: () => void;
  onNextDate: () => void;
  totalAssignments: number;
};

export default function Toolbar({
  selectAll,
  onSelectAllChange,
  onEditProjectOpen,
  onCreateProjectOpen,
  onShare,
  isExporting,
  onSaveAssignment,
  selectedCount,
  loading,
  currentDateLabel,
  onPrevDate,
  onNextDate,
  totalAssignments,
}: Props) {
  return (
    <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-lg shadow-sm">
      <div className="flex items-center gap-3">
        <Checkbox
          id="select-all"
          checked={selectAll}
          onCheckedChange={(v) => onSelectAllChange(Boolean(v))}
          className="h-4 w-4"
        />
        <label
          htmlFor="select-all"
          className="text-sm font-medium cursor-pointer"
        >
          Select All Projects & Technicians
        </label>
        <div className="ml-3 text-xs text-gray-500">
          Total: <span className="font-semibold">{totalAssignments}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={onEditProjectOpen}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 text-sm"
        >
          <Edit className="h-4 w-4" />
          Edit Project
        </Button>
        <Button
          onClick={onCreateProjectOpen}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm"
        >
          <Plus className="h-4 w-4" />
          Buat Project
        </Button>
        <Button
          onClick={onShare}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm"
          disabled={isExporting}
          title="Kirim gambar tabel ke WhatsApp"
        >
          <Share className="h-4 w-4" />
          {isExporting ? "Menyiapkan..." : "Share"}
        </Button>

        <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevDate}
            className="h-8 w-8 p-0 hover:bg-gray-200"
            aria-label="Sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-2">
            <Calendar className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium text-gray-700 min-w-[96px] text-center">
              {currentDateLabel}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNextDate}
            className="h-8 w-8 p-0 hover:bg-gray-200"
            aria-label="Berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
