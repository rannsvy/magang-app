// components/admin/manage-teknisi/VehicleTable.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, ArrowUpDown } from "lucide-react";
import { Pager } from "./Pager";
import type { SortDir, VehicleRow, VehicleSortKey } from "./types";

export function VehicleTable(props: {
  rows: VehicleRow[];
  total: number;
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
  onEdit: (v: VehicleRow) => void;
  sortKey: VehicleSortKey;
  sortDir: SortDir;
  onSort: (key: VehicleSortKey) => void;
}) {
  const {
    rows,
    total,
    page,
    perPage,
    onPageChange,
    onEdit,
    sortKey,
    sortDir,
    onSort,
  } = props;

  const SortBtn = ({ label, k }: { label: string; k: VehicleSortKey }) => (
    <button
      className="inline-flex items-center gap-1"
      onClick={() => onSort(k)}
      title={`Urutkan berdasarkan ${label}`}
    >
      {label}
      <ArrowUpDown
        className={`h-3 w-3 ${sortKey === k ? "opacity-100" : "opacity-50"}`}
      />
      {sortKey === k && (
        <span className="sr-only">{sortDir === "asc" ? "Naik" : "Turun"}</span>
      )}
    </button>
  );

  return (
    <>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="p-3 text-left">
              <SortBtn label="Merk" k="merk" />
            </th>
            <th className="p-3 text-left">
              <SortBtn label="Tipe" k="tipe" />
            </th>
            <th className="p-3 text-left">
              <SortBtn label="No Polisi" k="no_polisi" />
            </th>
            <th className="p-3 text-left">
              <SortBtn label="Status Pajak" k="status_pajak" />
            </th>
            <th className="p-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-6 text-center text-muted-foreground">
                Tidak ada data.
              </td>
            </tr>
          ) : (
            rows.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="p-3">{v.merk || "—"}</td>
                <td className="p-3">{v.tipe || "—"}</td>
                <td className="p-3">{v.no_polisi || "—"}</td>
                <td className="p-3">
                  {v.status_pajak === "Aktif" ? (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500 text-white hover:bg-emerald-600 border-transparent"
                    >
                      Aktif
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Mati</Badge>
                  )}
                </td>
                <td className="p-3 text-right">
                  <Button variant="outline" size="sm" onClick={() => onEdit(v)}>
                    <Edit className="h-4 w-4 mr-1" />
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <Pager
        total={total}
        page={page}
        perPage={perPage}
        onPageChange={onPageChange}
      />
    </>
  );
}
