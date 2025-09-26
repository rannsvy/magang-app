"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TechnicianHeader } from "@/components/technician-header";

/* ===== Utils ===== */
function sanitizePhoneForWa(input: string): string {
  // Ambil digit saja
  const digits = (input || "").replace(/\D/g, "");
  if (!digits) return "";
  // Jika mulai 0 → ganti 0 awal dengan 62 (Indonesia)
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return digits; // sudah +62 / 62 / atau internasional lain
}

function compactForWhatsApp(text: string): string {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export default function ComplainPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job") || "001";

  const [complaintType, setComplaintType] = useState("");
  const [complaintText, setComplaintText] = useState("");
  const [technicianName, setTechnicianName] = useState("Ahmad Teknisi");

  useEffect(() => {
    // Get technician name dari localStorage (safe-try)
    try {
      const storedName =
        (typeof window !== "undefined" &&
          localStorage.getItem("technicianName")) ||
        "Ahmad Teknisi";
      setTechnicianName(storedName);
    } catch {
      setTechnicianName("Ahmad Teknisi");
    }
  }, []);

  useEffect(() => {
    if (complaintType === "salah-lokasi") {
      setComplaintText(
        `Halo Admin, saya ${technicianName} dengan ID pekerjaan ${jobId} melaporkan bahwa saya dikirim ke lokasi yang salah.\n` +
          `Lokasi saat ini: [LOKASI_SAAT_INI]\n` +
          `Seharusnya: [LOKASI_SEHARUSNYA]\n` +
          `Mohon tindak lanjut.`
      );
    } else if (complaintType === "") {
      setComplaintText("");
    }
  }, [complaintType, jobId, technicianName]);

  const handleSubmitComplaint = () => {
    if (!complaintType || !complaintText.trim()) return;

    const message = compactForWhatsApp(complaintText);
    const encodedMessage = encodeURIComponent(message);

    // === Nomor WA tujuan (sesuai permintaan): 085749453922 ===
    const targetRaw = "085749453922";
    const adminWhatsAppNumber = sanitizePhoneForWa(targetRaw); // -> 6285749453922

    if (!adminWhatsAppNumber) return;

    const whatsappUrl = `https://wa.me/${adminWhatsAppNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const isFormValid = Boolean(complaintType && complaintText.trim());

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="Ajukan Komplain"
        showBackButton={true}
        backUrl="/user/dashboard"
      />

      {/* Main Content */}
      <main className="p-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Complaint Type Dropdown */}
              <div className="space-y-2">
                <Label htmlFor="complaint-type">Ajuan Komplain</Label>
                <Select
                  value={complaintType}
                  onValueChange={(val) => setComplaintType(val)}
                >
                  <SelectTrigger id="complaint-type">
                    <SelectValue placeholder="Pilih tipe komplain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salah-lokasi">Salah Lokasi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Complaint Text Field */}
              <div className="space-y-2">
                <Label htmlFor="complaint-text">Alasan</Label>
                <Textarea
                  id="complaint-text"
                  value={complaintText}
                  onChange={(e) => setComplaintText(e.target.value)}
                  className="min-h-[200px] resize-none"
                  placeholder="Tulis alasan Anda..."
                />
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleSubmitComplaint}
                disabled={!isFormValid}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Kirim Ajuan Komplain (WA)
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
