// components/manage-teknisi/helpers.ts
import type {
  FormVehicle,
  RoleFilter,
  StatusType,
  UserRow,
  VehicleRow,
} from "./types";

export const lo = (v: unknown) => (v ?? "").toString().toLowerCase();

export function normalizeTechStatus(raw: any): StatusType {
  const v = String(raw ?? "")
    .toLowerCase()
    .trim();
  if (!v) return "Di_Kantor";
  if (v.includes("selesai") || v.includes("done") || v.includes("complete"))
    return "selesai";
  if (
    v.includes("ditugaskan") ||
    v.includes("assign") ||
    v.includes("in-progress") ||
    v.includes("progress") ||
    v.includes("on site") ||
    v.includes("onsite")
  )
    return "ditugaskan";
  return "Di_Kantor";
}

/** Status pajak: MATI jika paid > due, atau jika hari ini > due */
export function computeStatusPajak(
  taxPaidDate?: string,
  taxDueDate?: string
): "Aktif" | "Mati" {
  if (!taxDueDate) return "Mati";
  const due = new Date(taxDueDate);

  if (taxPaidDate) {
    const paid = new Date(taxPaidDate);
    if (isFinite(paid.getTime()) && isFinite(due.getTime()) && paid > due) {
      return "Mati";
    }
  }
  const today = new Date();
  if (isFinite(due.getTime()) && today > due) return "Mati";
  return "Aktif";
}

export function toUserRow(x: any, fallbackRole: RoleFilter): UserRow {
  const resolvedRole =
    (x.role_key as RoleFilter) ||
    (fallbackRole === "all" ? "teknisi" : fallbackRole);

  const rawStatus =
    x.status_sekarang ??
    x.current_status ??
    x.status ??
    x.tech_status ??
    x.assignment_status;

  return {
    id: String(x.id ?? x.user_id ?? ""),
    nama_panggilan: x.nama_panggilan ?? x.nickname ?? x.name ?? x.nama ?? "",
    nama_lengkap: x.nama_lengkap ?? x.full_name ?? x.name ?? x.nama ?? "",
    inisial: (x.inisial ?? x.initial ?? x.initials ?? "")
      .toString()
      .toUpperCase()
      .slice(0, 2),
    email: x.email ?? "",
    phone: x.phone ?? x.no_telp ?? "",
    is_active: (x.is_active ?? x.active ?? true) as boolean,
    role: resolvedRole,
    tech_status:
      resolvedRole === "teknisi" ? normalizeTechStatus(rawStatus) : undefined,
  };
}

export function toVehicleRow(x: any): VehicleRow {
  const paid = (x.tax_paid_date ?? x.pajak_periode_ini ?? x.tax_current)
    ?.toString()
    .slice(0, 10);
  const due = (x.tax_due_date ?? x.pajak_periode_berikutnya ?? x.tax_next)
    ?.toString()
    .slice(0, 10);

  return {
    id: String(x.id ?? x.vehicle_id ?? x.vehicle_code ?? x.plate ?? ""),
    merk: x.merk ?? x.brand ?? "",
    tipe: x.tipe ?? x.model ?? "",
    no_polisi: x.no_polisi ?? x.plate ?? "",
    pajak_periode_ini: paid,
    pajak_periode_berikutnya: due,
    status_pajak:
      (x.status_pajak as "Aktif" | "Mati") ?? computeStatusPajak(paid, due),
  };
}

/** Simple string comparator */
export function cmp(a: any, b: any) {
  const aa = (a ?? "").toString().toLowerCase();
  const bb = (b ?? "").toString().toLowerCase();
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
}

/** Utility untuk set status pajak ketika edit vehicle form */
export function computeStatusForForm(form: FormVehicle): "Aktif" | "Mati" {
  return computeStatusPajak(
    form.pajak_periode_ini,
    form.pajak_periode_berikutnya
  );
}
