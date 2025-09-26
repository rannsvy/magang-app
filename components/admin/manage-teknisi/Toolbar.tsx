// components/admin/manage-teknisi/Toolbar.tsx
"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { RoleFilter } from "./types";
import { ROLE_OPTIONS } from "./constants";

export function Toolbar({
  roleFilter,
  onRoleChange,
  perPage,
  onPerPageChange,
  search,
  onSearchChange,
  addLabel,
  onAddClick,
  loading,
}: {
  roleFilter: RoleFilter;
  onRoleChange: (r: RoleFilter) => void;
  perPage: number;
  onPerPageChange: (n: number) => void;
  search: string;
  onSearchChange: (s: string) => void;
  addLabel: string;
  onAddClick: () => void;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
      {/* Role */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">Role</Label>
        <Select
          value={roleFilter}
          onValueChange={(v: RoleFilter) => onRoleChange(v)}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Pilih role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* View Data (jumlah per halaman) */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">View Data</Label>
        <Select
          value={String(perPage)}
          onValueChange={(v) => {
            const n = parseInt(v, 10) || 5;
            onPerPageChange(n);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="5 per halaman" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5</SelectItem>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      <div className="w-full md:w-80">
        <Input
          placeholder={
            roleFilter === "kendaraan"
              ? "Cari kendaraan (merk/tipe/plat)…"
              : "Cari user (nama/email/telpon)…"
          }
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Button
        onClick={onAddClick}
        className="bg-blue-600 hover:bg-indigo-700 text-white whitespace-nowrap"
        disabled={loading}
      >
        <Plus className="h-4 w-4 mr-2" />
        {addLabel}
      </Button>
    </div>
  );
}
