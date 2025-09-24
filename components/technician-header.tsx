"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseBrowser";
import { ensurePushSubscription } from "@/lib/pushClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Menu,
  LogOut,
  UserCircle,
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  CircleCheck,
  CircleX,
} from "lucide-react";

interface TechnicianHeaderProps {
  title: string;
  showBackButton?: boolean;
  backUrl?: string;
  showFilter?: boolean;
  filterValue?: "all" | "survey" | "instalasi";
  onFilterChange?: (value: "all" | "survey" | "instalasi") => void;
  /** opsional; kalau tidak ada akan di-lookup dari sesi */
  technicianId?: string;
}

type NotifStatus =
  | "idle"
  | "loading"
  | "enabled"
  | "prompt"
  | "blocked"
  | "unsupported"
  | "error";

/* ===== GPS wajib ===== */
async function getStrictLocation(timeoutMs = 15000): Promise<GeolocationPosition> {
  if (!("geolocation" in navigator))
    throw new Error("Perangkat tidak mendukung Geolocation.");
  if ("permissions" in navigator && (navigator as any).permissions?.query) {
    try {
      const p = await (navigator as any).permissions.query({
        name: "geolocation" as PermissionName,
      });
      if (p.state === "denied")
        throw new Error("Izin lokasi ditolak. Aktifkan lokasi/GPS untuk melanjutkan.");
    } catch {}
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(new Error(err?.message || "Gagal mendapatkan lokasi.")),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  });
}

// FE helper: rentang WIB hari ini (UTC ISO) untuk filter created_at
function todayWIBWindow() {
  const nowUtcMs = Date.now();
  const wibMs = nowUtcMs + 7 * 60 * 60 * 1000;
  const wib = new Date(wibMs);
  const y = wib.getUTCFullYear();
  const m = wib.getUTCMonth();
  const d = wib.getUTCDate();
  const startUtcMs = Date.UTC(y, m, d, -7, 0, 0, 0);
  const endUtcMs = Date.UTC(y, m, d + 1, -7, 0, 0, 0);
  return {
    startISO: new Date(startUtcMs).toISOString(),
    endISO: new Date(endUtcMs).toISOString(),
  };
}

/* ==== Tambahan: durasi popup sukses (ms) ==== */
const SUCCESS_DURATION_MS = 2000;

export function TechnicianHeader({
  title,
  showBackButton = false,
  backUrl = "/user/dashboard",
  showFilter = false,
  filterValue = "all",
  onFilterChange,
  technicianId,
}: TechnicianHeaderProps) {
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  /* logout & nav */
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
  const handleBack = () => router.push(backUrl);
  const handleProfileClick = () => router.push("/user/profile");
  const handleComplaintClick = () => router.push("/user/complain");
  const handleDamageComplainClick = () => router.push("/user/damageComplain");

  /* Push notif */
  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    []
  );
  const [notifStatus, setNotifStatus] = useState<NotifStatus>("idle");
  const [email, setEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const em =
          (data?.user?.email && data.user.email.trim()) ||
          (typeof window !== "undefined"
            ? localStorage.getItem("userEmail") || undefined
            : undefined);
        setEmail(em || undefined);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!supported) {
      setNotifStatus("unsupported");
      return;
    }
    let disposed = false;
    (async () => {
      try {
        const perm = Notification.permission;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (disposed) return;
        if (perm === "denied") setNotifStatus("blocked");
        else if (perm === "granted") setNotifStatus(sub ? "enabled" : "prompt");
        else setNotifStatus("prompt");
      } catch {
        if (!disposed) setNotifStatus("error");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [supported]);

  async function handleEnableNotifications() {
    if (!supported) {
      setNotifStatus("unsupported");
      return;
    }
    if (!email) {
      alert("Tidak dapat mengaktifkan notifikasi: email user tidak tersedia.");
      return;
    }
    setNotifStatus("loading");
    try {
      await ensurePushSubscription({
        subscribeEndpoint: "/api/push/subscribe",
        getEmail: () => email!,
        onDenied: () => setNotifStatus("blocked"),
        onError: () => setNotifStatus("error"),
      });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setNotifStatus(sub ? "enabled" : "prompt");
    } catch {
      setNotifStatus("error");
    }
  }

  const NotifButton = () => {
    if (!supported)
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled
        >
          <BellOff className="h-4 w-4 mr-1" />
          Notifikasi: Tidak didukung
        </Button>
      );
    if (notifStatus === "enabled")
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Notifikasi Aktif
        </Button>
      );
    if (notifStatus === "blocked")
      return (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() =>
            alert(
              "Notifikasi diblokir oleh browser. Buka pengaturan situs dan izinkan Notifications."
            )
          }
        >
          <BellOff className="h-4 w-4 mr-1" /> Notifikasi Diblokir
        </Button>
      );
    if (notifStatus === "loading")
      return (
        <Button
          variant="default"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled
        >
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Mengaktifkan...
        </Button>
      );
    if (notifStatus === "error")
      return (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleEnableNotifications}
        >
          <Bell className="h-4 w-4 mr-1" />
          Coba Lagi
        </Button>
      );
    return (
      <Button
        variant="default"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={handleEnableNotifications}
      >
        <Bell className="h-4 w-4 mr-1" />
        Aktifkan Notifikasi
      </Button>
    );
  };

  /* Auto-lookup technicianId dari sesi */
  const [techIdAuto, setTechIdAuto] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (technicianId) {
        setTechIdAuto(undefined);
        return;
      }
      try {
        const { data: authRes } = await supabase.auth.getUser();
        const uid = authRes?.user?.id;
        const email = authRes?.user?.email ?? undefined;
        if (!uid && !email) return;

        // by auth_user_id
        let q1 = await supabase
          .from("technicians")
          .select("id")
          .eq("auth_user_id", uid || "__no_uid__")
          .limit(1)
          .single();
        if (!q1.error && q1.data?.id) {
          if (alive) setTechIdAuto(q1.data.id);
          return;
        }

        // fallback by user_id
        let q2 = await supabase
          .from("technicians")
          .select("id")
          .eq("user_id", uid || "__no_uid__")
          .limit(1)
          .single();
        if (!q2.error && q2.data?.id) {
          if (alive) setTechIdAuto(q2.data.id);
          return;
        }

        // fallback by email
        if (email) {
          let q3 = await supabase
            .from("technicians")
            .select("id")
            .eq("email", email)
            .limit(1)
            .single();
          if (!q3.error && q3.data?.id) {
            if (alive) setTechIdAuto(q3.data.id);
            return;
          }
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [technicianId]);

  const effTechnicianId = technicianId ?? techIdAuto;
  const canCheck = Boolean(effTechnicianId);

  /* Check In/Out state */
  const [confirmType, setConfirmType] = useState<null | "in" | "out">(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [projectChoices, setProjectChoices] = useState<
    Array<{ id: string; name?: string }>
  >([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | "">("");

  // ===== Tambahan: popup sukses =====
  const [success, setSuccess] = useState<null | { type: "in" | "out"; text: string }>(null);
  const showSuccess = useCallback((text: string, type: "in" | "out") => {
    setSuccess({ type, text });
    // Optional: haptic
    if ("vibrate" in navigator) { try { navigator.vibrate?.(50); } catch {} }
    const to = setTimeout(() => setSuccess(null), SUCCESS_DURATION_MS);
    return () => clearTimeout(to);
  }, []);

  // menu & focus
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeDialogAndRestore = () => {
    setConfirmType(null);
    setMenuOpen(false);
    setCheckError(null);
    setProjectChoices([]);
    setSelectedProjectId("");
    requestAnimationFrame(() => {
      menuTriggerRef.current?.focus();
    });
  };

  /* Ambil assignment HARI INI (WIB) untuk teknisi – hanya project yang di-assign */
  async function loadTodayAssignments(techId: string) {
    const { startISO, endISO } = todayWIBWindow();
    // optional: filter tanggal_mulai project ≤ hari ini (WIB)
    const todayWIBDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { data, error } = await supabase
      .from("project_assignments")
      .select(
        `
        projects!inner(
          id,
          name,
          completed_at,
          tanggal_mulai
        ),
        created_at
      `
      )
      .eq("technician_id", techId)
      .is("removed_at", null)
      .is("projects.completed_at", null)
      .lte("projects.tanggal_mulai", todayWIBDate)
      .gte("created_at", startISO)
      .lt("created_at", endISO);

    if (error) throw new Error(error.message);

    const rows = (data ?? [])
      .map((r: any) => ({
        id: String(r?.projects?.id ?? ""),
        name: r?.projects?.name ? String(r.projects.name) : undefined,
      }))
      .filter((x) => x.id);

    // TANPA de-dupe: tampilkan apa adanya
    setProjectChoices(rows);
    return rows;
  }

  async function performCheckCore(
    type: "in" | "out",
    technicianId: string,
    projectId: string
  ) {
    const pos = await getStrictLocation();
    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      altitudeAccuracy,
      heading,
      speed,
    } = pos.coords;

    const payload: any = {
      type,
      technicianId,
      projectId,
      location: {
        latitude,
        longitude,
        accuracy,
        altitude,
        altitudeAccuracy,
        heading,
        speed,
      },
      ua: navigator.userAgent,
    };

    const res = await fetch("/api/attendance/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    if (!res.ok) {
      const msg =
        (body && (body.error || body.message)) ||
        (typeof body === "string" ? body : "");
      throw new Error(msg || `HTTP ${res.status}`);
    }
  }

  const performCheck = useCallback(
    async (type: "in" | "out") => {
      setCheckError(null);
      setProjectChoices([]);
      setSelectedProjectId("");

      if (!canCheck) {
        setCheckError(
          "Teknisi tidak teridentifikasi. Pastikan akun terhubung ke data teknisi."
        );
        return;
      }

      setCheckBusy(true);
      try {
        const list = await loadTodayAssignments(effTechnicianId!);

        if (list.length === 0) {
          setCheckError("Tidak ada penugasan HARI INI untuk akun teknisi ini.");
          return;
        }

        if (list.length === 1) {
          await performCheckCore(type, effTechnicianId!, list[0].id);
          setConfirmType(null);
          // ganti alert → popup sukses
          showSuccess(type === "in" ? "Check In berhasil!" : "Check Out berhasil!", type);
          return;
        }

        // >1 project → minta pilih
        setSelectedProjectId("");
        setCheckError("Pilih project terlebih dahulu, lalu lanjutkan.");
      } catch (e: any) {
        setCheckError(e?.message || "Terjadi kesalahan saat Check.");
      } finally {
        setCheckBusy(false);
      }
    },
    [canCheck, effTechnicianId, showSuccess]
  );

  const performCheckWithProject = useCallback(
    async (type: "in" | "out") => {
      if (!selectedProjectId) {
        setCheckError("Silakan pilih salah satu project.");
        return;
      }
      setCheckBusy(true);
      try {
        await performCheckCore(type, effTechnicianId!, selectedProjectId);
        setConfirmType(null);
        // ganti alert → popup sukses
        showSuccess(type === "in" ? "Check In berhasil!" : "Check Out berhasil!", type);
      } catch (e: any) {
        setCheckError(e?.message || "Gagal mengirim dengan project terpilih.");
      } finally {
        setCheckBusy(false);
      }
    },
    [selectedProjectId, effTechnicianId, showSuccess]
  );

  return (
    <header className="bg-white shadow-sm border-b relative">
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="p-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="text-[15px] font-bold text-gray-900">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {showFilter && (
            <div className="flex items-center gap-1">
              <Button
                variant={filterValue === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange?.("all")}
                className="h-7 px-2 text-xs font-sans"
              >
                All
              </Button>
              <Button
                variant={filterValue === "survey" ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange?.("survey")}
                className="h-7 px-2 text-xs font-sans"
              >
                Survey
              </Button>
              <Button
                variant={filterValue === "instalasi" ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange?.("instalasi")}
                className="h-7 px-2 text-xs font-sans"
              >
                Instalasi
              </Button>
            </div>
          )}

          {isClient ? (
            <NotifButton />
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled
            >
              <Loader2 className="h-4 w-4 mr-1" /> Memuat…
            </Button>
          )}

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuTriggerRef}
                variant="ghost"
                size="sm"
                className="p-2"
              >
                <Menu className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={handleProfileClick}>
                <UserCircle className="h-4 w-4 mr-2 text-black-500" /> Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDamageComplainClick}>
                <AlertTriangle className="h-4 w-4 mr-2 text-black-500" /> Lapor Kerusakan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleComplaintClick}>
                <AlertCircle className="h-4 w-4 mr-2 text-black-500" /> Ajukan Komplain
              </DropdownMenuItem>
                            <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmType("in");
                }}
              >
                <CircleCheck className="h-4 w-4 mr-2 text-black-500" /> Check
                In
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmType("out");
                }}
              >
                <CircleX className="h-4 w-4 mr-2 text-black-500" /> Check
                Out
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="h-4 w-4 mr-2" /> Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Dialog Check In */}
      <Dialog
        open={confirmType === "in"}
        onOpenChange={(v) => {
          if (!v) closeDialogAndRestore();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Konfirmasi Check In</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Apakah anda yakin ingin{" "}
            <span className="font-semibold">Check In</span> sekarang? Lokasi/GPS
            wajib aktif.
          </p>

          {projectChoices.length > 1 && (
            <div className="mt-3">
              <label className="text-sm font-medium">
                Pilih Project (assignment HARI INI)
              </label>
              <select
                className="mt-1 w-full border rounded-md px-2 py-1 text-sm"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">— pilih —</option>
                {projectChoices.map((p, idx) => (
                  <option key={`${p.id}-${idx}`} value={p.id}>
                    {p.name ? `${p.name} • ${p.id.slice(0, 8)}` : p.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {checkError && (
            <p className="text-sm text-red-600 mt-2">{checkError}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={closeDialogAndRestore}
              disabled={checkBusy}
            >
              Batal
            </Button>
            {projectChoices.length > 1 ? (
              <Button
                onClick={() => performCheckWithProject("in")}
                disabled={checkBusy || !selectedProjectId}
              >
                {checkBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengirim…
                  </>
                ) : (
                  "Gunakan Proyek Ini"
                )}
              </Button>
            ) : (
              <Button onClick={() => performCheck("in")} disabled={checkBusy}>
                {checkBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses…
                  </>
                ) : (
                  "Check In"
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Check Out */}
      <Dialog
        open={confirmType === "out"}
        onOpenChange={(v) => {
          if (!v) closeDialogAndRestore();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <DialogTitle>Konfirmasi Check Out</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Apakah anda yakin ingin{" "}
            <span className="font-semibold">Check Out</span> sekarang?
            Lokasi/GPS wajib aktif.
          </p>

          {projectChoices.length > 1 && (
            <div className="mt-3">
              <label className="text-sm font-medium">
                Pilih Project (assignment HARI INI)
              </label>
              <select
                className="mt-1 w-full border rounded-md px-2 py-1 text-sm"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">— pilih —</option>
                {projectChoices.map((p, idx) => (
                  <option key={`${p.id}-${idx}`} value={p.id}>
                    {p.name ? `${p.name} • ${p.id.slice(0, 8)}` : p.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {checkError && (
            <p className="text-sm text-red-600 mt-2">{checkError}</p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={closeDialogAndRestore}
              disabled={checkBusy}
            >
              Batal
            </Button>
            {projectChoices.length > 1 ? (
              <Button
                onClick={() => performCheckWithProject("out")}
                disabled={checkBusy || !selectedProjectId}
              >
                {checkBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Mengirim…
                  </>
                ) : (
                  "Gunakan Proyek Ini"
                )}
              </Button>
            ) : (
              <Button onClick={() => performCheck("out")} disabled={checkBusy}>
                {checkBusy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Memproses…
                  </>
                ) : (
                  "Check Out"
                )}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Popup sukses (auto hide) ===== */}
      {success && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center"
        >
          <div
            className="
              pointer-events-auto bg-white border border-green-200 shadow-xl rounded-2xl
              px-5 py-4 flex items-center gap-3
              animate-in fade-in zoom-in-95
            "
            style={{ transition: "transform 200ms ease, opacity 200ms ease" }}
          >
            <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900">
                {success.type === "in" ? "Check In Berhasil" : "Check Out Berhasil"}
              </span>
              <span className="text-xs text-gray-600">{success.text}</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
