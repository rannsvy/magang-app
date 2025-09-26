// components/admin/manage-teknisi/UserModal.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { FormUser, RoleFilter } from "./types";
import { ROLE_LABEL, ROLE_OPTIONS } from "./constants";

export function UserModal({
  open,
  mode,
  form,
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  form: FormUser;
  onChange: (f: Partial<FormUser>) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tambah" : "Edit"}{" "}
            {ROLE_LABEL[form.role ?? "teknisi"]}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-40">Nama Panggilan</Label>
            <Input
              value={form.nama_panggilan}
              onChange={(e) => onChange({ nama_panggilan: e.target.value })}
              placeholder="Nama panggilan"
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-40">Nama Lengkap</Label>
            <Input
              value={form.nama_lengkap}
              onChange={(e) => onChange({ nama_lengkap: e.target.value })}
              placeholder="Nama lengkap"
            />
          </div>

          {form.role === "teknisi" && (
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label className="md:w-40">Nama Inisial</Label>
              <Input
                value={form.inisial}
                maxLength={2}
                onChange={(e) =>
                  onChange({
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
              value={form.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="email@contoh.com"
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-40">No. Telepon</Label>
            <Input
              value={form.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
              placeholder="08xxxxxxxxxx"
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-40">Role</Label>
            <Select
              value={form.role}
              onValueChange={(v: RoleFilter) => onChange({ role: v })}
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
              value={form.is_active}
              onValueChange={(v: "true" | "false") =>
                onChange({ is_active: v })
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
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={onSubmit}>
              {mode === "create" ? "Simpan" : "Update"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
