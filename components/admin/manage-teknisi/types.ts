// components/admin/manage-teknisi/types.ts
export type RoleFilter =
  | "all"
  | "gm"
  | "manager"
  | "spv"
  | "sales"
  | "teknisi"
  | "kendaraan";

export type StatusType = "Di_Kantor" | "ditugaskan" | "selesai";

export type UserRow = {
  id: string;
  nama_panggilan?: string;
  nama_lengkap?: string;
  inisial?: string; // hanya teknisi
  email?: string;
  phone?: string;
  is_active?: boolean;
  role?: RoleFilter;
  tech_status?: StatusType; // status teknisi untuk badge
};

export type VehicleRow = {
  id: string; // bisa id uuid atau vehicle_code
  merk: string;
  tipe: string;
  no_polisi: string;
  pajak_periode_ini?: string; // tax_paid_date (YYYY-MM-DD)
  pajak_periode_berikutnya?: string; // tax_due_date (YYYY-MM-DD)
  status_pajak: "Aktif" | "Mati";
};

export type FormUser = {
  id?: string;
  nama_panggilan: string;
  nama_lengkap: string;
  inisial?: string; // opsional & hanya untuk teknisi
  email: string;
  phone: string;
  is_active: "true" | "false";
  role: RoleFilter;
};

export type FormVehicle = {
  id?: string; // kode atau uuid
  merk: string;
  tipe: string;
  no_polisi: string;
  pajak_periode_ini: string; // tax_paid_date
  pajak_periode_berikutnya: string; // tax_due_date
  status_pajak: "Aktif" | "Mati";
};

// Sorting
export type UserSortKey = "nama" | "email" | "phone" | "status";
export type SortDir = "asc" | "desc";
export type VehicleSortKey = "merk" | "tipe" | "no_polisi" | "status_pajak";
