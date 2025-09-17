// app/admin/manage_teknisi/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Edit, Plus } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

/* ================== Feature Flags ================== */
const USE_VEHICLE_MOCK = true;

/* ================== Roles ================== */
type RoleFilter =
  | "all"
  | "gm"
  | "manager"
  | "spv"
  | "sales"
  | "teknisi"
  | "kendaraan";

const ROLE_LABEL: Record<RoleFilter, string> = {
  all: "User",
  gm: "General Manager",
  manager: "Manager",
  spv: "SPV",
  sales: "Sales",
  teknisi: "Teknisi",
  kendaraan: "Kendaraan",
};

const ROLE_OPTIONS: Array<{ value: RoleFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "gm", label: "General Manager" },
  { value: "manager", label: "Manager" },
  { value: "spv", label: "Supervisor / SPV" },
  { value: "sales", label: "Sales" },
  { value: "teknisi", label: "Teknisi" },
  { value: "kendaraan", label: "Kendaraan" },
];

/* ================== Status Teknisi ================== */
type StatusType = "Di_Kantor" | "ditugaskan" | "selesai";

function normalizeTechStatus(raw: any): StatusType {
  const v = String(raw ?? "").toLowerCase().trim();
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

function getStatusBadge(status: StatusType) {
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

/* ================== Types ================== */
type UserRow = {
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

type VehicleRow = {
  id: string;
  merk: string;
  tipe: string;
  no_polisi: string;
  pajak_periode_ini?: string; // YYYY-MM-DD
  pajak_periode_berikutnya?: string; // YYYY-MM-DD
  status_pajak: "Aktif" | "Mati";
};

type FormUser = {
  id?: string;
  nama_panggilan: string;
  nama_lengkap: string;
  inisial?: string; // opsional & hanya untuk teknisi
  email: string;
  phone: string;
  is_active: "true" | "false";
  role: RoleFilter;
};

type FormVehicle = {
  id?: string;
  merk: string;
  tipe: string;
  no_polisi: string;
  pajak_periode_ini: string;
  pajak_periode_berikutnya: string;
  status_pajak: "Aktif" | "Mati";
};

/* ================== Helpers ================== */
const lo = (v: unknown) => (v ?? "").toString().toLowerCase();

function computeStatusPajak(
  _periodeIni?: string,
  periodeNext?: string
): "Aktif" | "Mati" {
  if (!periodeNext) return "Mati";
  const today = new Date();
  const next = new Date(periodeNext);
  const cutoff = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return today < cutoff ? "Aktif" : "Mati";
}

function toUserRow(x: any, fallbackRole: RoleFilter): UserRow {
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

function toVehicleRow(x: any): VehicleRow {
  const pIni = (x.pajak_periode_ini ?? x.tax_current)?.toString().slice(0, 10);
  const pNext = (x.pajak_periode_berikutnya ?? x.tax_next)
    ?.toString()
    .slice(0, 10);
  return {
    id: String(x.id ?? x.vehicle_id ?? ""),
    merk: x.merk ?? x.brand ?? "",
    tipe: x.tipe ?? x.model ?? "",
    no_polisi: x.no_polisi ?? x.plate ?? "",
    pajak_periode_ini: pIni,
    pajak_periode_berikutnya: pNext,
    status_pajak:
      (x.status_pajak as "Aktif" | "Mati") || computeStatusPajak(pIni, pNext),
  };
}

/* ================== Vehicle Mock ================== */
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

const VEHICLE_SEED: Array<{ merk: string; tipe: string; no_polisi: string }> = [
  { merk: "Toyota", tipe: "Avanza", no_polisi: "L 1992 KK" },
  { merk: "Honda", tipe: "Brio", no_polisi: "B 1321 XY" },
  { merk: "Suzuki", tipe: "Ertiga", no_polisi: "D 8875 ZQ" },
  { merk: "Mitsubishi", tipe: "Xpander", no_polisi: "H 2456 AN" },
  { merk: "Daihatsu", tipe: "Terios", no_polisi: "N 7719 JP" },
  { merk: "Hyundai", tipe: "Creta", no_polisi: "W 3008 QN" },
  { merk: "Kia", tipe: "Sonet", no_polisi: "F 9912 RT" },
  { merk: "Toyota", tipe: "Fortuner", no_polisi: "E 5432 LM" },
  { merk: "Honda", tipe: "CR-V", no_polisi: "AB 1830 CD" },
  { merk: "Nissan", tipe: "Livina", no_polisi: "AE 6021 VK" },
  { merk: "Wuling", tipe: "Almaz", no_polisi: "AD 7044 QS" },
  { merk: "Mazda", tipe: "CX-5", no_polisi: "K 2711 UF" },
  { merk: "Toyota", tipe: "Raize", no_polisi: "S 8320 AZ" },
  { merk: "Daihatsu", tipe: "Sigra", no_polisi: "AG 4507 DT" },
  { merk: "Honda", tipe: "HR-V", no_polisi: "B 8899 GH" },
  { merk: "Mitsubishi", tipe: "Pajero", no_polisi: "L 1203 MN" },
  { merk: "Toyota", tipe: "Innova", no_polisi: "H 5522 RP" },
  { merk: "Kia", tipe: "Seltos", no_polisi: "N 7654 YB" },
  { merk: "Hyundai", tipe: "Stargazer", no_polisi: "W 1145 CE" },
  { merk: "Toyota", tipe: "Calya", no_polisi: "F 3391 PX" },
  { merk: "Suzuki", tipe: "XL7", no_polisi: "E 6610 JT" },
  { merk: "Honda", tipe: "BR-V", no_polisi: "AB 9042 LA" },
  { merk: "DFSK", tipe: "Glory", no_polisi: "AE 2213 NB" },
  { merk: "Nissan", tipe: "X-Trail", no_polisi: "AD 7788 CK" },
  { merk: "Subaru", tipe: "Forester", no_polisi: "K 5501 VW" },
  { merk: "Toyota", tipe: "Yaris", no_polisi: "S 9900 OP" },
  { merk: "Honda", tipe: "Jazz", no_polisi: "AG 1122 QL" },
  { merk: "Toyota", tipe: "Zenix 2", no_polisi: "B 4120 ZS" },
  { merk: "MG", tipe: "ZS", no_polisi: "L 6608 TR" },
  { merk: "Chery", tipe: "Omoda", no_polisi: "H 3479 UA" },
];

function buildMockVehicles(): VehicleRow[] {
  const today = new Date();
  return VEHICLE_SEED.map((s, idx) => {
    const periode_ini = idx % 2 === 0 ? addDays(today, -180) : addDays(today, -400);
    const periode_next = idx % 2 === 0 ? addDays(today, 170) : addDays(today, -1);
    const pIni = toISO(periode_ini);
    const pNext = toISO(periode_next);
    return {
      id: s.no_polisi.replace(/\s/g, ""),
      merk: s.merk,
      tipe: s.tipe,
      no_polisi: s.no_polisi,
      pajak_periode_ini: pIni,
      pajak_periode_berikutnya: pNext,
      status_pajak: computeStatusPajak(pIni, pNext),
    };
  });
}

/* ================== Page ================== */
export default function ManageUsersVehiclesPage() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("teknisi");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);

  // pagination: perPage menjadi state (default 5)
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(5);

  // modal user
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"create" | "edit">(
    "create"
  );
  const [userForm, setUserForm] = useState<FormUser>({
    nama_panggilan: "",
    nama_lengkap: "",
    inisial: "",
    email: "",
    phone: "",
    is_active: "true",
    role: "teknisi",
  });

  // modal kendaraan
  const [vehModalOpen, setVehModalOpen] = useState(false);
  const [vehModalMode, setVehModalMode] = useState<"create" | "edit">("create");
  const [vehForm, setVehForm] = useState<FormVehicle>({
    merk: "",
    tipe: "",
    no_polisi: "",
    pajak_periode_ini: "",
    pajak_periode_berikutnya: "",
    status_pajak: "Aktif",
  });

  // load list on role change
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setPage(1);
        if (roleFilter === "kendaraan") {
          if (USE_VEHICLE_MOCK) {
            const list = buildMockVehicles();
            setVehicles(list);
            setUsers([]);
          } else {
            const r = await apiFetch("/api/cars", { cache: "no-store" });
            const arr = Array.isArray(r?.data)
              ? r.data
              : Array.isArray(r?.items)
              ? r.items
              : [];
            setVehicles(arr.map(toVehicleRow));
            setUsers([]);
          }
        } else {
          const endpoints: string[] =
            roleFilter === "all"
              ? [
                  "/api/users",
                  "/api/users?role=all",
                  "/api/users?role=teknisi",
                  "/api/technicians",
                ]
              : roleFilter === "teknisi"
              ? ["/api/users?role=teknisi", "/api/technicians"]
              : [`/api/users?role=${roleFilter}`];

          let fetched: any[] = [];
          for (const url of endpoints) {
            try {
              const r = await apiFetch(url, { cache: "no-store" });
              const arr = Array.isArray(r?.data)
                ? r.data
                : Array.isArray(r?.items)
                ? r.items
                : [];
              if (arr.length || url === endpoints[endpoints.length - 1]) {
                fetched = arr;
                break;
              }
            } catch {
              // try next
            }
          }
          setUsers((fetched || []).map((x) => toUserRow(x, roleFilter)));
          setVehicles([]);
        }
      } catch (e) {
        console.error(e);
        alert("Gagal memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [roleFilter]);

  /* ================== Derived ================== */
  const filteredUsers = useMemo(() => {
    if (roleFilter === "kendaraan") return [];
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        lo(u.nama_lengkap).includes(q) ||
        lo(u.nama_panggilan).includes(q) ||
        lo(u.email).includes(q) ||
        lo(u.phone).includes(q)
    );
  }, [users, search, roleFilter]);

  const filteredVehicles = useMemo(() => {
    if (roleFilter !== "kendaraan") return [];
    const q = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        lo(v.merk).includes(q) ||
        lo(v.tipe).includes(q) ||
        lo(v.no_polisi).includes(q)
    );
  }, [vehicles, search, roleFilter]);

  const totalItems =
    roleFilter === "kendaraan" ? filteredVehicles.length : filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const sliceStart = (page - 1) * perPage;

  const pageUsers =
    roleFilter === "kendaraan"
      ? []
      : filteredUsers.slice(sliceStart, sliceStart + perPage);
  const pageVehicles =
    roleFilter !== "kendaraan"
      ? []
      : filteredVehicles.slice(sliceStart, sliceStart + perPage);

  /* ================== Actions ================== */
  function openCreateForRole() {
    if (roleFilter === "kendaraan") {
      setVehModalMode("create");
      setVehForm({
        merk: "",
        tipe: "",
        no_polisi: "",
        pajak_periode_ini: "",
        pajak_periode_berikutnya: "",
        status_pajak: "Aktif",
      });
      setVehModalOpen(true);
      return;
    }
    setUserModalMode("create");
    setUserForm({
      nama_panggilan: "",
      nama_lengkap: "",
      inisial: "",
      email: "",
      phone: "",
      is_active: "true",
      role: roleFilter === "all" ? "teknisi" : roleFilter,
    });
    setUserModalOpen(true);
  }

  function openEditUser(u: UserRow) {
    const safeRole: RoleFilter =
      u.role && u.role !== "all" ? u.role : "teknisi";
    setUserModalMode("edit");
    setUserForm({
      id: u.id,
      nama_panggilan: u.nama_panggilan || "",
      nama_lengkap: u.nama_lengkap || "",
      inisial: u.inisial || "",
      email: u.email || "",
      phone: u.phone || "",
      is_active: u.is_active ? "true" : "false",
      role: safeRole,
    });
    setUserModalOpen(true);
  }

  function openEditVehicle(v: VehicleRow) {
    setVehModalMode("edit");
    setVehForm({
      id: v.id,
      merk: v.merk,
      tipe: v.tipe,
      no_polisi: v.no_polisi,
      pajak_periode_ini: v.pajak_periode_ini || "",
      pajak_periode_berikutnya: v.pajak_periode_berikutnya || "",
      status_pajak: v.status_pajak,
    });
    setVehModalOpen(true);
  }

  async function submitUserForm() {
    const payload: any = {
      nama_panggilan: userForm.nama_panggilan || null,
      nama_lengkap: userForm.nama_lengkap || null,
      email: userForm.email || null,
      phone: userForm.phone || null,
      is_active: userForm.is_active === "true",
      role_key: userForm.role,
    };
    if (userForm.role === "teknisi" && userForm.inisial)
      payload.inisial = userForm.inisial.toUpperCase().slice(0, 2);

    try {
      if (userModalMode === "create") {
        await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/users/${userForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      setUserModalOpen(false);
      setRoleFilter((r) => r); // refresh
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Gagal menyimpan user");
    }
  }

  async function submitVehicleForm() {
    const autoStatus = computeStatusPajak(
      vehForm.pajak_periode_ini,
      vehForm.pajak_periode_berikutnya
    );

    if (USE_VEHICLE_MOCK) {
      const newItem: VehicleRow = {
        id:
          vehForm.id ||
          vehForm.no_polisi.replace(/\s/g, "") ||
          `${vehForm.merk}-${vehForm.tipe}`.replace(/\s/g, ""),
        merk: vehForm.merk,
        tipe: vehForm.tipe,
        no_polisi: vehForm.no_polisi,
        pajak_periode_ini: vehForm.pajak_periode_ini || "",
        pajak_periode_berikutnya: vehForm.pajak_periode_berikutnya || "",
        status_pajak: vehForm.status_pajak || autoStatus,
      };
      setVehicles((prev) => {
        const idx = prev.findIndex((x) => x.id === newItem.id);
        if (idx === -1) return [newItem, ...prev];
        const copy = [...prev];
        copy[idx] = newItem;
        return copy;
      });
      setVehModalOpen(false);
      return;
    }

    const payload: any = {
      merk: vehForm.merk,
      tipe: vehForm.tipe,
      no_polisi: vehForm.no_polisi,
      pajak_periode_ini: vehForm.pajak_periode_ini || null,
      pajak_periode_berikutnya: vehForm.pajak_periode_berikutnya || null,
      status_pajak: vehForm.status_pajak || autoStatus,
    };

    try {
      if (vehModalMode === "create") {
        await apiFetch("/api/cars", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/cars/${vehForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      setVehModalOpen(false);
      setRoleFilter((r) => r); // refresh
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Gagal menyimpan kendaraan");
    }
  }

  /* ================== UI ================== */
  const addLabel =
    roleFilter === "all" ? "Tambah User" : `Tambah ${ROLE_LABEL[roleFilter]}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        title="Kelola User & Kendaraan"
        showBackButton
        backUrl="/admin/dashboard"
      />

      <main className="max-w-7xl mx-auto p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          {/* Role */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Role</Label>
            <Select
              value={roleFilter}
              onValueChange={(v: RoleFilter) => {
                setRoleFilter(v);
                setPage(1);
              }}
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
                setPerPage(n);
                setPage(1);
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
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <Button
            onClick={openCreateForRole}
            className="bg-blue-600 hover:bg-indigo-700 text-white whitespace-nowrap"
          >
            <Plus className="h-4 w-4 mr-2" />
            {addLabel}
          </Button>
        </div>

        {/* ===== Table ===== */}
        <div className="rounded-lg border bg-white">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Memuat…</div>
          ) : roleFilter === "kendaraan" ? (
            <VehicleTable
              rows={pageVehicles}
              total={filteredVehicles.length}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onEdit={openEditVehicle}
            />
          ) : (
            <UserTable
              rows={pageUsers}
              total={filteredUsers.length}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onEdit={openEditUser}
            />
          )}
        </div>
      </main>

      {/* ===== Modal User ===== */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {userModalMode === "create" ? "Tambah" : "Edit"}{" "}
              {ROLE_LABEL[userForm.role ?? "teknisi"]}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">Nama Panggilan</Label>
              <Input
                value={userForm.nama_panggilan}
                onChange={(e) =>
                  setUserForm({ ...userForm, nama_panggilan: e.target.value })
                }
                placeholder="Nama panggilan"
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">Nama Lengkap</Label>
              <Input
                value={userForm.nama_lengkap}
                onChange={(e) =>
                  setUserForm({ ...userForm, nama_lengkap: e.target.value })
                }
                placeholder="Nama lengkap"
              />
            </div>

            {/* Inisial hanya untuk teknisi */}
            {userForm.role === "teknisi" && (
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <Label className="md:w-40">Nama Inisial</Label>
                <Input
                  value={userForm.inisial}
                  maxLength={2}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      inisial: e.target.value.toUpperCase().slice(0, 2),
                    })
                  }
                  placeholder="2 huruf (opsional)"
                />
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">Email</Label>
              <Input
                type="email"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm({ ...userForm, email: e.target.value })
                }
                placeholder="email@contoh.com"
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">No. Telepon</Label>
              <Input
                value={userForm.phone}
                onChange={(e) =>
                  setUserForm({ ...userForm, phone: e.target.value })
                }
                placeholder="08xxxxxxxxxx"
              />
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">Role</Label>
              <Select
                value={userForm.role}
                onValueChange={(v: RoleFilter) =>
                  setUserForm((prev) => ({ ...prev, role: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Role user" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.filter((r) => r.value !== "kendaraan").map(
                    (opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">Status Keaktifan</Label>
              <Select
                value={userForm.is_active}
                onValueChange={(v: "true" | "false") =>
                  setUserForm((prev) => ({ ...prev, is_active: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Aktif</SelectItem>
                  <SelectItem value="false">Tidak Aktif</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setUserModalOpen(false)}>
                Batal
              </Button>
              <Button onClick={submitUserForm}>
                {userModalMode === "create" ? "Simpan" : "Update"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Modal Kendaraan ===== */}
      <Dialog open={vehModalOpen} onOpenChange={setVehModalOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {vehModalMode === "create" ? "Tambah" : "Edit"} Kendaraan
            </DialogTitle>
          </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Merk</Label>
            <Input
              value={vehForm.merk}
              onChange={(e) =>
                setVehForm({ ...vehForm, merk: e.target.value })
              }
              placeholder="Toyota, Honda, dll"
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Tipe</Label>
            <Input
              value={vehForm.tipe}
              onChange={(e) =>
                setVehForm({ ...vehForm, tipe: e.target.value })
              }
              placeholder="Avanza, Brio, dsb."
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">No Polisi</Label>
            <Input
              value={vehForm.no_polisi}
              onChange={(e) =>
                setVehForm({ ...vehForm, no_polisi: e.target.value })
              }
              placeholder="L 1992 KK"
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Pajak (Periode Ini)</Label>
            <Input
              type="date"
              value={vehForm.pajak_periode_ini}
              onChange={(e) =>
                setVehForm({
                  ...vehForm,
                  pajak_periode_ini: e.target.value,
                  status_pajak: computeStatusPajak(
                    e.target.value,
                    vehForm.pajak_periode_berikutnya
                  ),
                })
              }
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Pajak (Periode Berikutnya)</Label>
            <Input
              type="date"
              value={vehForm.pajak_periode_berikutnya}
              onChange={(e) =>
                setVehForm({
                  ...vehForm,
                  pajak_periode_berikutnya: e.target.value,
                  status_pajak: computeStatusPajak(
                    vehForm.pajak_periode_ini,
                    e.target.value
                  ),
                })
              }
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Status Pajak</Label>
            <Select
              value={vehForm.status_pajak}
              onValueChange={(v: "Aktif" | "Mati") =>
                setVehForm((p) => ({ ...p, status_pajak: v }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Aktif">Aktif</SelectItem>
                <SelectItem value="Mati">Mati</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setVehModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={submitVehicleForm}>
              {vehModalMode === "create" ? "Simpan" : "Update"}
            </Button>
          </div>
        </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================== Tables ================== */
function UserTable(props: {
  rows: UserRow[];
  total: number;
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
  onEdit: (u: UserRow) => void;
}) {
  const { rows, total, page, perPage, onPageChange, onEdit } = props;
  return (
    <>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="p-3 text-left">Nama</th>
            <th className="p-3 text-left">Email</th>
            <th className="p-3 text-left">No Telepon</th>
            <th className="p-3 text-left">Status</th>
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
                  <Button variant="outline" size="sm" onClick={() => onEdit(u)}>
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

function VehicleTable(props: {
  rows: VehicleRow[];
  total: number;
  page: number;
  perPage: number;
  onPageChange: (p: number) => void;
  onEdit: (v: VehicleRow) => void;
}) {
  const { rows, total, page, perPage, onPageChange, onEdit } = props;
  return (
    <>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="p-3 text-left">Merk</th>
            <th className="p-3 text-left">Tipe</th>
            <th className="p-3 text-left">No Polisi</th>
            <th className="p-3 text-left">Status Pajak</th>
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
                      variant="outline" // variant ini tidak memberi bg
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

function Pager({
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
