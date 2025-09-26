// components/admin/manage-teknisi/badges.tsx
"use client";

import { Badge } from "@/components/ui/badge";
import type { StatusType } from "./types";

export function getStatusBadge(status: StatusType) {
  switch (status) {
    case "Di_Kantor":
      return (
        <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
          Di Kantor
        </Badge>
      );
    case "ditugaskan":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
          Ditugaskan
        </Badge>
      );
    case "selesai":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          Selesai
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
          Unknown
        </Badge>
      );
  }
}
