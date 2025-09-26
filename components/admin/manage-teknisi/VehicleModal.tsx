// components/admin/manage-teknisi/VehicleModal.tsx
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
import type { FormVehicle } from "./types";
import { computeStatusPajak } from "./utils";

export function VehicleModal({
  open,
  mode,
  form,
  onChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  form: FormVehicle;
  onChange: (f: Partial<FormVehicle>) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tambah" : "Edit"} Kendaraan
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Merk</Label>
            <Input
              value={form.merk}
              onChange={(e) => onChange({ merk: e.target.value })}
              placeholder="Toyota, Honda, dll"
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Tipe</Label>
            <Input
              value={form.tipe}
              onChange={(e) => onChange({ tipe: e.target.value })}
              placeholder="Avanza, Brio, dsb."
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">No Polisi</Label>
            <Input
              value={form.no_polisi}
              onChange={(e) => onChange({ no_polisi: e.target.value })}
              placeholder="L 1992 KK"
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Pajak (Periode Ini)</Label>
            <Input
              type="date"
              value={form.pajak_periode_ini}
              onChange={(e) =>
                onChange({
                  pajak_periode_ini: e.target.value,
                  status_pajak: computeStatusPajak(
                    e.target.value,
                    form.pajak_periode_berikutnya
                  ),
                })
              }
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Pajak (Periode Berikutnya)</Label>
            <Input
              type="date"
              value={form.pajak_periode_berikutnya}
              onChange={(e) =>
                onChange({
                  pajak_periode_berikutnya: e.target.value,
                  status_pajak: computeStatusPajak(
                    form.pajak_periode_ini,
                    e.target.value
                  ),
                })
              }
            />
          </div>
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <Label className="md:w-48">Status Pajak</Label>
            <Select
              value={form.status_pajak}
              onValueChange={(v: "Aktif" | "Mati") =>
                onChange({ status_pajak: v })
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
