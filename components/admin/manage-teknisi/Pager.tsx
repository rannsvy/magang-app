// components/admin/manage-teknisi/Pager.tsx
"use client";

import { Button } from "@/components/ui/button";

export function Pager({
  total,
  page,
  perPage,
  onPageChange,
}: {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-between items-center px-4 py-3 border-t bg-gray-50">
      <div className="text-xs text-muted-foreground">
        Halaman {page} dari {totalPages} • {total} data
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Sebelumnya
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
