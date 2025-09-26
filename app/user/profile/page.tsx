"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TechnicianHeader } from "@/components/technician-header";
import { Key, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseBrowser";

/* ---------- Helpers ---------- */
const s = (v: any) => (v ?? "").toString();
const trimOrNull = (v: any) => {
  const t = s(v).trim();
  return t.length ? t : null;
};
const normalize = (v?: string | null) => (v ? v.trim() : null);

function formatFullWithNick(
  fullName?: string | null,
  nickName?: string | null
) {
  const f = normalize(fullName);
  const n = normalize(nickName);
  if (f && n) {
    if (/\(.*\)/.test(f) && f.toLowerCase().includes(n.toLowerCase())) return f;
    if (f.toLowerCase() === n.toLowerCase()) return f;
    return `${f} (${n})`;
  }
  return f || n || "Pengguna";
}

/** Ambil 2 huruf inisial dari nama (atau email jika nama kosong) */
function initialsFrom(name?: string | null, email?: string | null) {
  const fallbackFromEmail = () => {
    const local = (email || "").split("@")[0] || "";
    if (!local) return "U";
    const clean = local.replace(/[^a-zA-Z0-9]+/g, " ").trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    const letters =
      parts.length > 1
        ? parts[0][0] + parts[parts.length - 1][0]
        : clean.slice(0, 2);
    return letters.toUpperCase();
  };

  const src = (name || "").trim();
  if (!src) return fallbackFromEmail();

  // Hilangkan isi tanda kurung untuk ekstraksi inisial nama murni
  const noParen = src.replace(/\(.*?\)/g, "").trim();
  const parts = noParen.split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : noParen.slice(0, 2);
  return letters.toUpperCase();
}

export default function TechnicianProfile() {
  const router = useRouter();

  const [fullName, setFullName] = useState<string | null>(null);
  const [nickName, setNickName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;
        if (!user) return;

        let resolvedEmail: string | null = trimOrNull(user.email);

        const { data: profile } = await supabase
          .from("profiles")
          .select("nama_lengkap, nama_panggilan, technician_id, email")
          .eq("id", user.id)
          .maybeSingle();

        const profileFull = trimOrNull(profile?.nama_lengkap);
        const profileNick = trimOrNull(profile?.nama_panggilan);

        const emailFromProfile = trimOrNull(profile?.email);
        if (emailFromProfile) resolvedEmail = emailFromProfile;

        let techFull: string | null = null;
        let techNick: string | null = null;

        const technicianId = trimOrNull(profile?.technician_id);
        if (technicianId) {
          const { data: techById } = await supabase
            .from("technicians")
            .select("nama_lengkap, nama_panggilan")
            .eq("id", technicianId)
            .maybeSingle();
          if (techById) {
            techFull = trimOrNull(techById?.nama_lengkap);
            techNick = trimOrNull(techById?.nama_panggilan);
          }
        }

        if (!techFull && !techNick) {
          const lookupEmail = resolvedEmail?.toLowerCase() ?? null;
          if (lookupEmail) {
            const { data: techByEmail } = await supabase
              .from("technicians")
              .select("nama_lengkap, nama_panggilan, email")
              .eq("email", lookupEmail)
              .maybeSingle();
            if (techByEmail) {
              techFull = trimOrNull(techByEmail?.nama_lengkap);
              techNick = trimOrNull(techByEmail?.nama_panggilan);
            }
          }
        }

        const metaFull = trimOrNull(user.user_metadata?.full_name);
        const metaName = trimOrNull(user.user_metadata?.name);

        const finalFull =
          techFull || profileFull || metaFull || metaName || null;
        const finalNick = techNick || profileNick || null;

        if (!active) return;
        setFullName(finalFull);
        setNickName(finalNick);
        setEmail(resolvedEmail ?? null);
      } catch (err) {
        if (!active) return;
        console.warn("[profile] failed to load user/technician", err);
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  const displayName = useMemo(
    () => formatFullWithNick(fullName, nickName),
    [fullName, nickName]
  );

  // === INISIAL UNTUK AVATAR ===
  const initials = useMemo(
    () => initialsFrom(displayName, email),
    [displayName, email]
  );

  const handleResetPassword = () => {
    router.push("/user/reset-password");
  };

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    window.location.href = `/auth/login`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="Profil"
        showBackButton={true}
        backUrl="/user/dashboard"
      />

      <main className="p-4">
        <div className="max-w-md mx-auto">
          <div className="flex flex-col items-center mt-6 mb-8">
            <Avatar className="h-24 w-24 mb-4 border border-gray-200">
              {/* Di sini inisial ditampilkan */}
              <AvatarFallback className="bg-gray-100 text-gray-600 text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <h2 className="text-lg font-bold text-gray-900">{displayName}</h2>
            <p className="text-sm text-gray-500">
              {email || "Tidak ada email"}
            </p>
          </div>

          <div className="space-y-4">
            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:bg-gray-50"
              onClick={handleResetPassword}
            >
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full mr-4">
                    <Key className="h-5 w-5 text-blue-600" />
                  </div>
                  <span className="text-gray-900 font-medium">
                    Reset Password
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:shadow-md hover:bg-red-50"
              onClick={handleLogout}
            >
              <CardContent className="p-4">
                <div className="flex items-center">
                  <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full mr-4">
                    <LogOut className="h-5 w-5 text-red-600" />
                  </div>
                  <span className="text-red-600 font-medium">Logout</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
