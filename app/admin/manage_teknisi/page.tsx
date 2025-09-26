// app/admin/manage_teknisi/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "@/components/admin-header";
import { apiFetch } from "@/lib/apiFetch";

import {
  FormUser,
  FormVehicle,
  RoleFilter,
  SortDir,
  UserRow,
  UserSortKey,
  VehicleRow,
  VehicleSortKey,
} from "@/components/admin/manage-teknisi/types";
import { ROLE_LABEL } from "@/components/admin/manage-teknisi/constants";
import {
  buildTechPayloadFromForm,
  buildUserPayloadFromForm,
  cmp,
  computeStatusPajak,
  lo,
  toUserRow,
  toVehicleRow,
} from "@/components/admin/manage-teknisi/utils";
import { UserTable } from "@/components/admin/manage-teknisi/UserTable";
import { VehicleTable } from "@/components/admin/manage-teknisi/VehicleTable";
import { UserModal } from "@/components/admin/manage-teknisi/UserModal";
import { VehicleModal } from "@/components/admin/manage-teknisi/VehicleModal";
import { Toolbar } from "@/components/admin/manage-teknisi/Toolbar";

export default function ManageUsersVehiclesPage() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("teknisi");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);

  // pagination
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(5);

  // sorting
  const [userSortKey, setUserSortKey] = useState<UserSortKey>("nama");
  const [userSortDir, setUserSortDir] = useState<SortDir>("asc");
  const [vehSortKey, setVehSortKey] = useState<VehicleSortKey>("merk");
  const [vehSortDir, setVehSortDir] = useState<SortDir>("asc");

  // modals
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

  // fetch list on role change
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setPage(1);

        if (roleFilter === "kendaraan") {
          const r = await apiFetch("/api/vehicles", { cache: "no-store" });
          const arr = Array.isArray(r?.data)
            ? r.data
            : Array.isArray(r?.items)
            ? r.items
            : [];
          setVehicles((arr as any[]).map((x: any) => toVehicleRow(x)));
          setUsers([]);
        } else if (roleFilter === "teknisi") {
          const techRes = await apiFetch("/api/technicians", {
            cache: "no-store",
          });
          const list = Array.isArray(techRes?.data) ? techRes.data : [];
          setUsers(list.map((x: any) => toUserRow(x, "teknisi")));
          setVehicles([]);
        } else {
          const endpoints: string[] =
            roleFilter === "all"
              ? [
                  "/api/users",
                  "/api/users?role=all",
                  "/api/users?role=teknisi",
                  "/api/technicians",
                ]
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
          const last = endpoints[endpoints.length - 1];
          const fbRole = last.includes("/api/technicians")
            ? "teknisi"
            : roleFilter;
          setUsers(
            ((fetched || []) as any[]).map((x: any) =>
              toUserRow(x, fbRole as RoleFilter)
            )
          );
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

  // derived + search + sort
  const filteredUsers = useMemo(() => {
    if (roleFilter === "kendaraan") return [];
    const q = search.toLowerCase();
    const arr = users.filter(
      (u) =>
        lo(u.nama_lengkap).includes(q) ||
        lo(u.nama_panggilan).includes(q) ||
        lo(u.email).includes(q) ||
        lo(u.phone).includes(q)
    );

    arr.sort((a, b) => {
      let s = 0;
      if (userSortKey === "nama") {
        s = cmp(
          a.nama_lengkap || a.nama_panggilan,
          b.nama_lengkap || b.nama_panggilan
        );
      } else if (userSortKey === "email") {
        s = cmp(a.email, b.email);
      } else if (userSortKey === "phone") {
        s = cmp(a.phone, b.phone);
      } else {
        const av =
          a.role === "teknisi"
            ? a.tech_status ?? "Di_Kantor"
            : a.is_active
            ? "Aktif"
            : "Tidak Aktif";
        const bv =
          b.role === "teknisi"
            ? b.tech_status ?? "Di_Kantor"
            : b.is_active
            ? "Aktif"
            : "Tidak Aktif";
        s = cmp(av, bv);
      }
      return userSortDir === "asc" ? s : -s;
    });
    return arr;
  }, [users, search, roleFilter, userSortKey, userSortDir]);

  const filteredVehicles = useMemo(() => {
    if (roleFilter !== "kendaraan") return [];
    const q = search.toLowerCase();
    const arr = vehicles.filter(
      (v) =>
        lo(v.merk).includes(q) ||
        lo(v.tipe).includes(q) ||
        lo(v.no_polisi).includes(q)
    );

    arr.sort((a, b) => {
      let s = 0;
      if (vehSortKey === "merk") s = cmp(a.merk, b.merk);
      else if (vehSortKey === "tipe") s = cmp(a.tipe, b.tipe);
      else if (vehSortKey === "no_polisi") s = cmp(a.no_polisi, b.no_polisi);
      else s = cmp(a.status_pajak, b.status_pajak);
      return vehSortDir === "asc" ? s : -s;
    });

    return arr;
  }, [vehicles, search, roleFilter, vehSortKey, vehSortDir]);

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

  // Handlers
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
    const isTechnician = userForm.role === "teknisi";
    const payloadTech = buildTechPayloadFromForm(userForm);
    const payloadUser = buildUserPayloadFromForm(userForm);

    try {
      if (userModalMode === "create") {
        if (isTechnician) {
          await apiFetch("/api/technicians", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadTech),
          });
        } else {
          await apiFetch("/api/users", {
            method: "POST",
            body: JSON.stringify(payloadUser),
          });
        }
      } else {
        if (isTechnician) {
          await apiFetch(`/api/technicians/${userForm.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadTech),
          });
        } else {
          await apiFetch(`/api/users/${userForm.id}`, {
            method: "PUT",
            body: JSON.stringify(payloadUser),
          });
        }
      }
      setUserModalOpen(false);
      setRoleFilter((r) => r); // refresh
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Gagal menyimpan data");
    }
  }

  async function deleteTechnician(id: string, displayName: string) {
    if (
      !confirm(
        `Hapus teknisi ${displayName}? Tindakan ini tidak dapat dibatalkan.`
      )
    )
      return;
    try {
      await apiFetch(`/api/technicians?id=${id}`, { method: "DELETE" });
      setRoleFilter((r) => r); // refresh
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Gagal menghapus teknisi");
    }
  }

  async function submitVehicleForm() {
    const payload = {
      name:
        `${vehForm.merk ?? ""} ${vehForm.tipe ?? ""}`.trim() ||
        vehForm.no_polisi,
      brand: vehForm.merk || null,
      model: vehForm.tipe || null,
      plate: vehForm.no_polisi,
      tax_paid_date: vehForm.pajak_periode_ini || null,
      tax_due_date: vehForm.pajak_periode_berikutnya || null,
      active: true,
    };

    try {
      if (vehModalMode === "create") {
        await apiFetch("/api/vehicles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch(`/api/vehicles/${vehForm.id}`, {
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

  const addLabel =
    roleFilter === "all" ? "Tambah User" : `Tambah ${ROLE_LABEL[roleFilter]}`;

  // sort togglers
  function handleUserSort(key: UserSortKey) {
    setUserSortKey((prev) => {
      if (prev === key) {
        setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setUserSortDir("asc");
      return key;
    });
  }
  function handleVehSort(key: VehicleSortKey) {
    setVehSortKey((prev) => {
      if (prev === key) {
        setVehSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setVehSortDir("asc");
      return key;
    });
  }

  // reset halaman saat search/perPage berubah
  useEffect(() => {
    setPage(1);
  }, [search, perPage]);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        title="Kelola User & Kendaraan"
        showBackButton
        backUrl="/admin/dashboard"
      />

      <main className="max-w-7xl mx-auto p-6">
        <Toolbar
          roleFilter={roleFilter}
          onRoleChange={(v) => {
            setRoleFilter(v);
            setPage(1);
          }}
          perPage={perPage}
          onPerPageChange={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          search={search}
          onSearchChange={(s) => setSearch(s)}
          addLabel={addLabel}
          onAddClick={openCreateForRole}
          loading={loading}
        />

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
              sortKey={vehSortKey}
              sortDir={vehSortDir}
              onSort={handleVehSort}
            />
          ) : (
            <UserTable
              rows={pageUsers}
              total={filteredUsers.length}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              onEdit={openEditUser}
              showDelete={roleFilter === "teknisi"}
              onDelete={(u) =>
                deleteTechnician(u.id, u.nama_panggilan || u.nama_lengkap || "")
              }
              sortKey={userSortKey}
              sortDir={userSortDir}
              onSort={handleUserSort}
            />
          )}
        </div>
      </main>

      {/* Modals */}
      <UserModal
        open={userModalOpen}
        mode={userModalMode}
        form={userForm}
        onChange={(f) => setUserForm((prev) => ({ ...prev, ...f }))}
        onSubmit={submitUserForm}
        onClose={() => setUserModalOpen(false)}
      />

      <VehicleModal
        open={vehModalOpen}
        mode={vehModalMode}
        form={vehForm}
        onChange={(f) => {
          const newState = { ...vehForm, ...f } as FormVehicle;
          // jaga2: pastikan status_pajak update saat tanggal berubah
          if ("pajak_periode_ini" in f || "pajak_periode_berikutnya" in f) {
            newState.status_pajak = computeStatusPajak(
              newState.pajak_periode_ini,
              newState.pajak_periode_berikutnya
            );
          }
          setVehForm(newState);
        }}
        onSubmit={submitVehicleForm}
        onClose={() => setVehModalOpen(false)}
      />
    </div>
  );
}
