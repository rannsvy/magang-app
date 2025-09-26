// components/admin/manage-teknisi/UserTable.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, ArrowUpDown } from "lucide-react";
import { Pager } from "./Pager";
import type { SortDir, UserRow, UserSortKey } from "./types";
import { getStatusBadge } from "./badges";
import { lo } from "./utils";

export function UserTable(props: {
  rows: UserRow[];
  total: number;
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
  onEdit: (u: UserRow) => void;
  showDelete?: boolean;
  onDelete?: (u: UserRow) => void;
  sortKey: UserSortKey;
  sortDir: SortDir;
  onSort: (key: UserSortKey) => void;
}) {
  const {
    rows,
    total,
    page,
    perPage,
    onPageChange,
    onEdit,
    showDelete,
    onDelete,
    sortKey,
    sortDir,
    onSort,
  } = props;

  const SortBtn = ({ label, k }: { label: string; k: UserSortKey }) => (
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
              <SortBtn label="Nama" k="nama" />
            </th>
            <th className="p-3 text-left">
              <SortBtn label="Email" k="email" />
            </th>
            <th className="p-3 text-left">
              <SortBtn label="No Telepon" k="phone" />
            </th>
            <th className="p-3 text-left">
              <SortBtn label="Status" k="status" />
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
            rows.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">
                    {u.nama_lengkap || u.nama_panggilan || "—"}
                  </div>
                  {u.inisial && (
                    <div className="text-xs text-gray-500">
                      Inisial: {u.inisial}
                    </div>
                  )}
                </td>
                <td className="p-3">{u.email || "—"}</td>
                <td className="p-3">{u.phone || "—"}</td>
                <td className="p-3">
                  {u.role === "teknisi" ? (
                    getStatusBadge(u.tech_status ?? "Di_Kantor")
                  ) : u.is_active ? (
                    <Badge>Aktif</Badge>
                  ) : (
                    <Badge variant="secondary">Tidak Aktif</Badge>
                  )}
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(u)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                    </Button>
                    {showDelete && onDelete && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDelete(u)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                      </Button>
                    )}
                  </div>
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
