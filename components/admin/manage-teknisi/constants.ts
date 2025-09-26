// components/admin/manage-teknisi/constants.ts
import type { RoleFilter } from "./types";

export const ROLE_LABEL: Record<RoleFilter, string> = {
  all: "User",
  gm: "General Manager",
  manager: "Manager",
  spv: "SPV",
  sales: "Sales",
  teknisi: "Teknisi",
  kendaraan: "Kendaraan",
};

export const ROLE_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "gm", label: "General Manager" },
  { value: "manager", label: "Manager" },
  { value: "spv", label: "Supervisor / SPV" },
  { value: "sales", label: "Sales" },
  { value: "teknisi", label: "Teknisi" },
  { value: "kendaraan", label: "Kendaraan" },
];
