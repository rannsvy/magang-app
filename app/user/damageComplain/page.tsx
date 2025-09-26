"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabaseBrowser";
import { apiFetch } from "@/lib/apiFetch";
import { TechnicianHeader } from "@/components/technician-header";

/* ================== Types ================== */
type VehicleInput =
  | {
      id?: string | number | null;
      projectId?: string | number | null;
      projectIds?: Array<string | number | null> | null;
      brand?: string;
      type?: string;
      plate?: string;
      name?: string; // e.g. "TOYOTA AVANZA L 1992 KK"
    }
  | string;

type Vehicle = {
  id?: string;
  projectId?: string;
  projectIds?: string[];
  brand: string;
  type: string;
  plate: string;
};

type ProjectApiRow = {
  id?: string | number | null;
  job_id?: string | number | null;
  name?: string | null;
};

type ProjectOption = {
  id: string;
  job_id: string | null;
  name: string;
};

/* ================== Helpers ================== */
function parseVehicleName(name: string): Vehicle {
  const tokens = name.trim().split(/\s+/);
  const brand = (tokens[0] || "").toUpperCase();
  const platePattern = /^[A-Z]{1,2}\s\d{1,4}\s[A-Z]{1,3}$/;

  let plate = "";
  if (tokens.length >= 3) {
    const maybePlateRaw = `${tokens[tokens.length - 3]} ${
      tokens[tokens.length - 2]
    } ${tokens[tokens.length - 1]}`;
    const maybePlate = maybePlateRaw.toUpperCase();
    if (platePattern.test(maybePlate)) {
      plate = maybePlate;
    }
  }
  const type = plate
    ? tokens.slice(1, tokens.length - 3).join(" ")
    : tokens.slice(1).join(" ");

  return {
    brand,
    type: type.trim(),
    plate,
  };
}

function normalizeVehicles(raw: VehicleInput[]): Vehicle[] {
  const list: Vehicle[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      list.push(parseVehicleName(item));
    } else {
      if (item.brand && item.type && item.plate) {
        const rawId = (item as any).id;
        const itemId =
          rawId === undefined || rawId === null ? undefined : String(rawId);

        const projectIdSet = new Set<string>();
        const rawProjectId = (item as any).projectId;
        if (rawProjectId !== undefined && rawProjectId !== null) {
          const pid = String(rawProjectId).trim();
          if (pid) projectIdSet.add(pid);
        }
        const rawProjectIds = Array.isArray((item as any).projectIds)
          ? (item as any).projectIds
          : null;
        if (rawProjectIds) {
          for (const entry of rawProjectIds) {
            if (entry === undefined || entry === null) continue;
            const pid = String(entry).trim();
            if (pid) projectIdSet.add(pid);
          }
        }
        const projectIds = projectIdSet.size
          ? Array.from(projectIdSet)
          : undefined;
        const primaryProjectId = projectIds ? projectIds[0] : undefined;

        list.push({
          id: itemId,
          projectId: primaryProjectId,
          projectIds,
          brand: item.brand.toUpperCase(),
          type: item.type,
          plate: item.plate.toUpperCase(),
        });
      } else if (item.name) {
        list.push(parseVehicleName(item.name));
      }
    }
  }

  const merged = new Map<string, Vehicle>();
  for (const vehicle of list) {
    const projectSet = new Set<string>();
    if (vehicle.projectId) projectSet.add(String(vehicle.projectId));
    if (Array.isArray(vehicle.projectIds)) {
      vehicle.projectIds.forEach((pid) => {
        if (pid) projectSet.add(String(pid));
      });
    }
    const projectArray = projectSet.size ? Array.from(projectSet) : undefined;
    const normalizedVehicle: Vehicle = {
      ...vehicle,
      projectId:
        projectArray && projectArray.length
          ? projectArray[0]
          : vehicle.projectId,
      projectIds: projectArray,
    };

    const keyCandidate = normalizedVehicle.id
      ? String(normalizedVehicle.id).trim()
      : normalizedVehicle.plate
      ? normalizedVehicle.plate.toUpperCase()
      : `${normalizedVehicle.brand}-${normalizedVehicle.type}`.toUpperCase();
    const key = keyCandidate || JSON.stringify(normalizedVehicle);

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalizedVehicle);
      continue;
    }

    const mergedProjects = new Set<string>();
    if (existing.projectId) mergedProjects.add(String(existing.projectId));
    if (Array.isArray(existing.projectIds)) {
      existing.projectIds.forEach((pid) => {
        if (pid) mergedProjects.add(String(pid));
      });
    }
    if (normalizedVehicle.projectId)
      mergedProjects.add(String(normalizedVehicle.projectId));
    if (Array.isArray(normalizedVehicle.projectIds)) {
      normalizedVehicle.projectIds.forEach((pid) => {
        if (pid) mergedProjects.add(String(pid));
      });
    }

    const mergedArray = mergedProjects.size
      ? Array.from(mergedProjects)
      : undefined;

    merged.set(key, {
      ...existing,
      brand: existing.brand || normalizedVehicle.brand,
      type: existing.type || normalizedVehicle.type,
      plate: existing.plate || normalizedVehicle.plate,
      id: existing.id || normalizedVehicle.id,
      projectId:
        mergedArray && mergedArray.length
          ? mergedArray[0]
          : existing.projectId ?? normalizedVehicle.projectId,
      projectIds: mergedArray,
    });
  }

  return Array.from(merged.values());
}

function todayISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildHeaderMessage(params: {
  technicianName: string;
  jobId: string;
  projectName: string;
  brand: string;
  type: string;
  plate: string;
  locationType: "External" | "Internal";
  reportDate: string; // YYYY-MM-DD
}) {
  const {
    technicianName,
    jobId,
    projectName,
    brand,
    type,
    plate,
    locationType,
    reportDate,
  } = params;
  return (
    `Halo Admin, saya ${technicianName} melaporkan adanya kerusakan pada kendaraan untuk project ${projectName} (ID ${jobId}).\n\n` +
    `Detail Kendaraan:\n` +
    `- Merk: ${brand}\n` +
    `- Tipe: ${type}\n` +
    `- No Polisi: ${plate}\n\n` +
    `Informasi Kerusakan:\n` +
    `- Letak Kerusakan: ${locationType} \n` +
    `- Tanggal Lapor: ${reportDate}\n\n` +
    `Keterangan Kerusakan:`
  );
}

/** Hapus bagian template/header jika tanpa sengaja ikut tertulis di notes */
function stripTemplateFromText(text: string, header: string) {
  if (!text) return "";
  const marker = "Keterangan Kerusakan:";
  const idx = text.indexOf(marker);
  if (idx >= 0) {
    // Ambil hanya isi setelah marker
    const after = text.slice(idx + marker.length);
    return after.replace(/^\s*\n?/, "");
  }
  // Jika notes kebetulan diawali oleh header yang sama, potong
  const headerEsc = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + headerEsc + "\\s*", "m");
  if (re.test(text)) {
    return text.replace(re, "");
  }
  return text;
}

/** Compose final message (header + cleaned notes) */
function composeFinalMessage(header: string, notes: string) {
  const cleaned = stripTemplateFromText(notes, header).trim();
  return cleaned ? `${header}\n\n${cleaned}` : header;
}

function compactForWhatsApp(text: string) {
  return text
    .replace(/\r\n/g, "\n") // normalisasi EOL
    .replace(/\n{2,}/g, "\n") // lipat >1 newline jadi 1
    .replace(/[ \t]+\n/g, "\n") // hilangkan spasi sebelum newline
    .trim();
}

/* ================== Page ================== */
export default function DamageComplainPage() {
  const searchParams = useSearchParams();

  const jobParam = useMemo(() => searchParams.get("job") || "", [searchParams]);
  const [technicianName, setTechnicianName] = useState<string>("");
  const [technicianEmail, setTechnicianEmail] = useState<string | null>(null);
  const [technicianId, setTechnicianId] = useState<string | null>(null);
  const [technicianLookupDone, setTechnicianLookupDone] = useState(false);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const selectedProjectIdRef = useRef<string>("");

  // Vehicles
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(false);
  const [brand, setBrand] = useState("");
  const [type, setType] = useState("");
  const [plate, setPlate] = useState("");
  const [supervisorEmailByProject, setSupervisorEmailByProject] = useState<
    Record<string, string>
  >({});
  const autoFilledProjectIdRef = useRef<string | null>(null);

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const projectName = selectedProject?.name ?? "";
  const jobId =
    (selectedProject?.job_id ?? selectedProject?.id ?? jobParam) || "-";
  const selectedProjectLabel = selectedProject
    ? `${selectedProject.name}${
        selectedProject.job_id ? ` (ID ${selectedProject.job_id})` : ""
      }`
    : "";
  const supervisorEmail = selectedProject
    ? supervisorEmailByProject[selectedProject.id] ?? null
    : null;
  const technicianDisplayName = (technicianName || "").trim() || "Teknisi";
  const vehiclesForSelectedProject = useMemo(() => {
    if (!selectedProject) return vehicles;
    const keys = [selectedProject.id, selectedProject.job_id, jobParam]
      .filter((key): key is string => !!key)
      .map((key) => String(key));
    if (!keys.length) return vehicles;
    const scoped = vehicles.filter((v) => {
      const ids = new Set<string>();
      if (v.projectId) ids.add(String(v.projectId));
      if (Array.isArray(v.projectIds)) {
        v.projectIds.forEach((pid) => {
          if (pid) ids.add(String(pid));
        });
      }
      if (!ids.size) return false;
      for (const key of keys) {
        if (ids.has(key)) return true;
      }
      return false;
    });
    return scoped.length ? scoped : vehicles;
  }, [vehicles, selectedProject, jobParam]);

  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  useEffect(() => {
    if (
      selectedProjectId &&
      !projects.some((p) => p.id === selectedProjectId)
    ) {
      selectedProjectIdRef.current = "";
      setSelectedProjectId("");
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) {
      autoFilledProjectIdRef.current = null;
      return;
    }

    const projectKey = String(selectedProject.id);
    const jobKey = selectedProject.job_id
      ? String(selectedProject.job_id)
      : null;
    const jobParamKey = jobParam ? String(jobParam) : null;

    const candidateVehicles =
      vehiclesForSelectedProject.length > 0
        ? vehiclesForSelectedProject
        : vehicles;

    const match =
      candidateVehicles.find((v) => {
        const ids = new Set<string>();
        if (v.projectId) ids.add(String(v.projectId));
        if (Array.isArray(v.projectIds)) {
          v.projectIds.forEach((pid) => {
            if (pid) ids.add(String(pid));
          });
        }
        if (!ids.size) return false;
        if (ids.has(projectKey)) return true;
        if (jobKey && ids.has(jobKey)) return true;
        if (jobParamKey && ids.has(jobParamKey)) return true;
        return false;
      }) ?? null;

    if (!match) {
      autoFilledProjectIdRef.current = null;
      return;
    }

    if (autoFilledProjectIdRef.current === projectKey) {
      return;
    }

    setBrand(match.brand);
    setType(match.type);
    setPlate(match.plate);
    autoFilledProjectIdRef.current = projectKey;
  }, [selectedProject, vehiclesForSelectedProject, vehicles, jobParam]);

  // Damage info
  const [locationType, setLocationType] = useState<
    "" | "External" | "Internal"
  >("");
  const [reportDate, setReportDate] = useState(todayISO());

  // Reason text handling (user-only)
  const [notes, setNotes] = useState("");
  const [forceShowTemplate, setForceShowTemplate] = useState(false);

  // ================== Load technician profile (FIXED) ==================
  useEffect(() => {
    let active = true;
    (async () => {
      let fallbackEmail: string | null = null;
      try {
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user ?? null;

        if (!user) {
          if (typeof window !== "undefined") {
            const stored = localStorage.getItem("technicianName");
            if (stored && active) setTechnicianName(stored);
          }
          if (active) {
            setTechnicianId(null);
            setTechnicianEmail(null);
            setTechnicianLookupDone(true);
          }
          return;
        }

        const uid = String(user.id);
        const rawEmail = String(user.email ?? "");
        const userEmailTrimmed = rawEmail.trim();
        fallbackEmail = userEmailTrimmed.length ? userEmailTrimmed : null;
        const normalizedUserEmail = userEmailTrimmed.length
          ? userEmailTrimmed.toLowerCase()
          : null;

        // ambil profile
        let profile: any = null;
        if (uid) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("nama_lengkap, nama_panggilan, technician_id, email")
            .eq("id", uid)
            .maybeSingle();
          profile = profileData ?? null;
        }

        let techId: string | null = profile?.technician_id
          ? String(profile.technician_id)
          : null;

        const profileEmailRaw = profile?.email
          ? String(profile.email).trim()
          : null;
        const profileEmailLower =
          profileEmailRaw && profileEmailRaw.length
            ? profileEmailRaw.toLowerCase()
            : null;

        let resolvedName = String(
          profile?.nama_lengkap ?? profile?.nama_panggilan ?? ""
        ).trim();

        const lookupEmail = profileEmailLower || normalizedUserEmail || null;

        // kalau belum tahu technician_id, coba cari dari tabel technicians by email
        let technicianRecord: any = null;
        if (!techId && lookupEmail) {
          const { data: techByEmail } = await supabase
            .from("technicians")
            .select("id, nama_lengkap, nama_panggilan")
            .eq("email", lookupEmail)
            .maybeSingle();
          if (techByEmail) {
            techId = techByEmail.id ? String(techByEmail.id) : techId;
            technicianRecord = techByEmail ?? null;
          }
        }

        // fallback ambil nama dari technicians by id
        if (techId && !technicianRecord) {
          const { data: techData } = await supabase
            .from("technicians")
            .select("nama_lengkap, nama_panggilan")
            .eq("id", techId)
            .maybeSingle();
          technicianRecord = techData ?? null;
        }

        if ((!resolvedName || !resolvedName.length) && technicianRecord) {
          resolvedName = String(
            technicianRecord?.nama_panggilan ??
              technicianRecord?.nama_lengkap ??
              ""
          ).trim();
        }

        if (!resolvedName || !resolvedName.length) {
          resolvedName = String(
            user.user_metadata?.full_name ??
              user.user_metadata?.name ??
              rawEmail ??
              ""
          ).trim();
        }

        if (!techId && uid) techId = uid;

        const finalName = resolvedName || userEmailTrimmed || "Teknisi";
        const resolvedEmailCandidate =
          profileEmailRaw ??
          (userEmailTrimmed.length ? userEmailTrimmed : null);
        const emailToStore = resolvedEmailCandidate ?? fallbackEmail;

        if (!active) return;

        setTechnicianName(finalName);
        setTechnicianEmail(emailToStore ?? null);
        setTechnicianId(techId);
        setTechnicianLookupDone(true);

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("technicianName", finalName);
          } catch {}
        }
      } catch (error) {
        console.warn("[damageComplain] failed to load user", error);
        if (!active) return;

        let fallbackName = "Teknisi";
        if (typeof window !== "undefined") {
          const stored = localStorage.getItem("technicianName");
          if (stored) fallbackName = stored;
        }
        setTechnicianName(fallbackName);
        setTechnicianEmail(fallbackEmail);
        setTechnicianId(null);
        setTechnicianLookupDone(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ================== Load project options yang ditugaskan ==================
  useEffect(() => {
    if (!technicianLookupDone) return;

    let active = true;

    (async () => {
      setProjectsLoading(true);
      try {
        const isoDate = todayISO();
        const url = `/api/technicians/jobs?date=${encodeURIComponent(isoDate)}`;
        const res = await apiFetch<{ items?: any[]; data?: any[] }>(url);
        const rawItems = Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res?.data)
          ? res.data
          : [];

        const seenIds = new Set<string>();
        const mapped: ProjectOption[] = [];
        for (const item of rawItems) {
          const rawId = (item as any)?.id ?? (item as any)?.project_id ?? null;
          const id =
            rawId === undefined || rawId === null ? "" : String(rawId).trim();
          if (!id || seenIds.has(id)) continue;

          const rawJob = (item as any)?.job_id ?? (item as any)?.jobId ?? null;
          const job_id =
            rawJob === undefined || rawJob === null
              ? null
              : (() => {
                  const value = String(rawJob).trim();
                  return value.length ? value : null;
                })();

          const rawName =
            (item as any)?.name ?? (item as any)?.project_name ?? null;
          const nameCandidate = rawName ? String(rawName).trim() : "";
          const name = nameCandidate || job_id || id;

          mapped.push({ id, job_id, name });
          seenIds.add(id);
        }

        if (!active) return;

        setProjects(mapped);
        setAssignedProjectIds(mapped.map((p) => p.id));

        const currentSelected = selectedProjectIdRef.current;
        if (!currentSelected) {
          let initial = "";
          if (jobParam) {
            const matchJob = mapped.find(
              (p) => p.job_id && p.job_id === jobParam
            );
            initial =
              matchJob?.id ?? mapped.find((p) => p.id === jobParam)?.id ?? "";
          }
          if (!initial && mapped.length === 1) {
            initial = mapped[0].id;
          }
          if (initial) {
            selectedProjectIdRef.current = initial;
            setSelectedProjectId(initial);
          }
        } else if (!mapped.some((p) => p.id === currentSelected)) {
          selectedProjectIdRef.current = "";
          setSelectedProjectId("");
        }
      } catch (error) {
        console.warn("[damageComplain] failed to load projects", error);
        if (!active) return;
        setProjects([]);
        setAssignedProjectIds([]);
        setSupervisorEmailByProject({});
        selectedProjectIdRef.current = "";
        setSelectedProjectId("");
      } finally {
        if (active) setProjectsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [technicianLookupDone, technicianId, jobParam]);

  // ================== Load vehicles untuk teknisi ==================
  useEffect(() => {
    if (!technicianLookupDone) return;

    let active = true;

    (async () => {
      if (!technicianId) {
        let fallback: Vehicle[] = [];
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem("technicianVehicles");
          if (raw) {
            try {
              fallback = normalizeVehicles(JSON.parse(raw) as VehicleInput[]);
            } catch {
              /* noop */
            }
          }
        }
        if (active) {
          setVehicles(fallback);
          setVehiclesLoading(false);
          setSupervisorEmailByProject({});
        }
        return;
      }

      const projectFilters = Array.from(
        new Set(
          assignedProjectIds
            .map((id) => (id ? id.trim() : ""))
            .filter((id) => id.length)
        )
      );
      if (!projectFilters.length) {
        if (active) {
          setVehicles([]);
          setVehiclesLoading(false);
          setSupervisorEmailByProject({});
          if (typeof window !== "undefined") {
            try {
              localStorage.removeItem("technicianVehicles");
            } catch {
              /* noop */
            }
          }
        }
        return;
      }

      setVehiclesLoading(true);
      try {
        const workDate = todayISO();

        // Query assignments hari ini, difilter project & teknisi aktif
        let query = supabase
          .from("project_assignments")
          .select(
            `
            project_id,
            vehicle_id,
            vehicles:vehicle_id (id, brand, model, plate, name, vehicle_code),
            supervisors:supervisor_id (email)
          `
          )
          .in("project_id", projectFilters)
          .eq("work_date", workDate)
          .is("removed_at", null)
          .not("vehicle_id", "is", null);

        if (technicianId) {
          query = query.eq("technician_id", technicianId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const supervisorMap: Record<string, string> = {};
        const inputs: VehicleInput[] = rows
          .map((row: any) => {
            const projectId = row?.project_id ? String(row.project_id) : null;
            const rawVehicle = Array.isArray(row?.vehicles)
              ? row.vehicles[0]
              : row?.vehicles;
            if (!rawVehicle) return null;

            const supervisorRaw = Array.isArray(row?.supervisors)
              ? row.supervisors[0]
              : row?.supervisors;
            if (projectId && supervisorRaw?.email) {
              const email = String(supervisorRaw.email).trim();
              if (email) supervisorMap[projectId] = email;
            }

            const vehicleId =
              rawVehicle?.id ??
              rawVehicle?.vehicle_code ??
              rawVehicle?.plate ??
              null;

            const brand = (rawVehicle?.brand ?? "").toString();
            const type = (rawVehicle?.model ?? "").toString();
            const plate = (rawVehicle?.plate ?? "").toString();
            const nameFallback = (
              rawVehicle?.name ??
              rawVehicle?.vehicle_code ??
              ""
            ).toString();
            const nameParts = [
              rawVehicle?.brand,
              rawVehicle?.model,
              rawVehicle?.name,
              rawVehicle?.vehicle_code,
            ]
              .map((part) => (part ? String(part).trim() : ""))
              .filter((part) => part.length);
            const name = nameParts.join(" ").trim() || nameFallback;

            return {
              id: vehicleId,
              projectId,
              projectIds: projectId ? [projectId] : undefined,
              brand,
              type,
              plate,
              name,
            } as VehicleInput;
          })
          .filter(Boolean) as VehicleInput[];

        let normalized = normalizeVehicles(inputs);

        if (!normalized.length && typeof window !== "undefined") {
          const raw = localStorage.getItem("technicianVehicles");
          if (raw) {
            try {
              normalized = normalizeVehicles(JSON.parse(raw) as VehicleInput[]);
            } catch {
              /* noop */
            }
          }
        }

        if (!active) return;

        setSupervisorEmailByProject(supervisorMap);
        setVehicles(normalized);
        if (typeof window !== "undefined") {
          try {
            if (normalized.length) {
              localStorage.setItem(
                "technicianVehicles",
                JSON.stringify(normalized)
              );
            } else {
              localStorage.removeItem("technicianVehicles");
            }
          } catch {
            /* noop */
          }
        }
      } catch (error) {
        console.warn("[damageComplain] failed to load vehicles", error);
        if (!active) return;
        let fallback: Vehicle[] = [];
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem("technicianVehicles");
          if (raw) {
            try {
              fallback = normalizeVehicles(JSON.parse(raw) as VehicleInput[]);
            } catch {
              /* noop */
            }
          }
        }
        setSupervisorEmailByProject({});
        setVehicles(fallback);
      } finally {
        if (active) setVehiclesLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [technicianLookupDone, technicianId, assignedProjectIds]);

  // Auto-selects jika hanya satu kendaraan tersedia
  useEffect(() => {
    const scoped =
      selectedProject && vehiclesForSelectedProject.length
        ? vehiclesForSelectedProject
        : vehicles;

    if (scoped.length === 1) {
      const v = scoped[0];
      setBrand(v.brand);
      setType(v.type);
      setPlate(v.plate);
    } else {
      if (brand && !scoped.some((v) => v.brand === brand)) setBrand("");
      if (type && !scoped.some((v) => v.brand === brand && v.type === type))
        setType("");
      if (
        plate &&
        !scoped.some(
          (v) => v.brand === brand && v.type === type && v.plate === plate
        )
      )
        setPlate("");
    }
  }, [vehicles, vehiclesForSelectedProject, selectedProject]); // eslint-disable-line

  // Options filtered step-by-step
  const brandOptions = useMemo(() => {
    const set = new Set(vehiclesForSelectedProject.map((v) => v.brand));
    return Array.from(set);
  }, [vehiclesForSelectedProject]);

  const typeOptions = useMemo(() => {
    const set = new Set(
      vehiclesForSelectedProject
        .filter((v) => (brand ? v.brand === brand : true))
        .map((v) => v.type)
    );
    return Array.from(set);
  }, [vehiclesForSelectedProject, brand]);

  const plateOptions = useMemo(() => {
    const set = new Set(
      vehiclesForSelectedProject
        .filter((v) => (brand ? v.brand === brand : true))
        .filter((v) => (type ? v.type === type : true))
        .map((v) => v.plate)
    );
    return Array.from(set);
  }, [vehiclesForSelectedProject, brand, type]);

  const isSingleVehicle = vehiclesForSelectedProject.length === 1;
  const readyForTemplate =
    !!selectedProject &&
    !!brand &&
    !!type &&
    !!plate &&
    !!locationType &&
    !!reportDate;

  // Build header dan text tampilan
  const header = readyForTemplate
    ? buildHeaderMessage({
        technicianName: technicianDisplayName,
        jobId,
        projectName: projectName || jobId,
        brand,
        type,
        plate,
        locationType: locationType as "External" | "Internal",
        reportDate,
      })
    : "";

  // Textarea display: header + notes (rapat) saat siap template
  const displayText = readyForTemplate
    ? `${header}${notes ? " " + notes : " "}`
    : notes;

  useEffect(() => {
    if (!readyForTemplate) {
      setForceShowTemplate(false);
      return;
    }
    setForceShowTemplate(true);
  }, [readyForTemplate]);

  useEffect(() => {
    if (brand && !typeOptions.includes(type)) setType("");
  }, [brand, typeOptions]); // eslint-disable-line

  useEffect(() => {
    if (type && !plateOptions.includes(plate)) setPlate("");
  }, [type, plateOptions]); // eslint-disable-line

  const isFormValid = readyForTemplate && displayText.trim().length > 0;

  // ===== Target pengiriman =====
  const whatsappRecipients = ["+62 813-8559-7889", "+62 821-4203-7172"];
  const primaryEmailRecipient = "hermawan@performaoptimagroup.com";
  const ccEmailBase = [
    "yoki@performaoptimagroup.com",
    "wigit@performaoptimagroup.com",
  ];

  // Utility open new tab/window
  function openInNewTab(url: string) {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    return !!w;
  }

  // ===== Single "Send": WA + Gmail + Outlook + mailto =====
  function handleSendAll() {
    if (!isFormValid) return;

    const messageForEmail = composeFinalMessage(header, notes);
    const messageForWhatsApp = compactForWhatsApp(messageForEmail);

    const subjectTitle = projectName || jobId;
    const subject = encodeURIComponent(
      `Pelaporan Kerusakan Kendaraan - ${subjectTitle}`
    );
    const body = encodeURIComponent(messageForEmail);

    const toEmails = [primaryEmailRecipient];
    const ccCandidates = [
      ...ccEmailBase,
      technicianEmail ?? "",
      supervisorEmail ?? "",
    ];
    const ccSet = new Set<string>();
    const ccEmails: string[] = [];
    for (const raw of ccCandidates) {
      const trimmed = (raw || "").trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (toEmails.some((to) => to.toLowerCase() === lower)) continue;
      if (ccSet.has(lower)) continue;
      ccSet.add(lower);
      ccEmails.push(trimmed);
    }

    const toJoined = toEmails.join(",");
    const toEncoded = encodeURIComponent(toJoined);
    const ccJoined = ccEmails.join(",");
    const ccEncoded = ccEmails.length ? encodeURIComponent(ccJoined) : "";
    const ccQuery = ccEmails.length ? `&cc=${ccEncoded}` : "";

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${toEncoded}${ccQuery}&su=${subject}&body=${body}`;
    const mailtoBase = `mailto:${encodeURIComponent(
      toJoined
    )}?subject=${subject}&body=${body}`;
    const mailtoUrl = ccEmails.length
      ? `${mailtoBase}&cc=${ccEncoded}`
      : mailtoBase;

    // WhatsApp
    const openedWhatsapp = new Set<string>();
    whatsappRecipients.forEach((rawNumber) => {
      const sanitized = rawNumber.replace(/[^0-9]/g, "");
      if (!sanitized || openedWhatsapp.has(sanitized)) return;
      openedWhatsapp.add(sanitized);
      const waUrl = `https://wa.me/${sanitized}?text=${encodeURIComponent(
        messageForWhatsApp
      )}`;
      openInNewTab(waUrl);
    });

    // Email clients
    openInNewTab(gmailUrl);
    setTimeout(() => {
      window.location.href = mailtoUrl;
    }, 350);
  }

  // Textarea onChange
  function handleTextareaChange(v: string) {
    if (!readyForTemplate) {
      setNotes(v);
      return;
    }
    const cleaned = stripTemplateFromText(v, header);
    setNotes(cleaned);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="Lapor Kerusakan"
        showBackButton={true}
        backUrl="/user/dashboard"
      />

      <main className="p-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* Project */}
              <div className="space-y-2">
                <Label>Project</Label>
                {projects.length > 1 ? (
                  <Select
                    value={selectedProjectId}
                    onValueChange={(val) => setSelectedProjectId(val)}
                    disabled={projectsLoading || projects.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          projectsLoading
                            ? "Memuat project..."
                            : "Pilih project"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.job_id ? ` (ID ${p.job_id})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={projectsLoading ? "" : selectedProjectLabel}
                    readOnly
                    placeholder={
                      projectsLoading
                        ? "Memuat project..."
                        : selectedProjectLabel || "Tidak ada project"
                    }
                  />
                )}
                {!projectsLoading && projects.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Tidak ada project tersedia.
                  </p>
                )}
              </div>

              {/* 1. Merk Kendaraan */}
              <div className="space-y-2">
                <Label>Merk Kendaraan</Label>
                {isSingleVehicle || brandOptions.length <= 1 ? (
                  <Input
                    value={brand}
                    readOnly
                    placeholder={
                      vehiclesLoading
                        ? "Memuat data kendaraan..."
                        : "Merk otomatis"
                    }
                  />
                ) : (
                  <Select
                    value={brand}
                    onValueChange={(val) => setBrand(val)}
                    disabled={vehiclesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          vehiclesLoading
                            ? "Memuat data kendaraan..."
                            : "Pilih merk kendaraan"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {brandOptions.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 2. Tipe Kendaraan */}
              <div className="space-y-2">
                <Label>Tipe Kendaraan</Label>
                {isSingleVehicle || typeOptions.length <= 1 ? (
                  <Input
                    value={type}
                    readOnly
                    placeholder={
                      vehiclesLoading
                        ? "Memuat data kendaraan..."
                        : "Tipe otomatis"
                    }
                  />
                ) : (
                  <Select
                    value={type}
                    onValueChange={(val) => setType(val)}
                    disabled={!brand || vehiclesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          vehiclesLoading
                            ? "Memuat data kendaraan..."
                            : brand
                            ? "Pilih tipe kendaraan"
                            : "Pilih merk terlebih dahulu"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 3. No Polisi */}
              <div className="space-y-2">
                <Label>No Polisi</Label>
                {isSingleVehicle || plateOptions.length <= 1 ? (
                  <Input
                    value={plate}
                    readOnly
                    placeholder={
                      vehiclesLoading
                        ? "Memuat data kendaraan..."
                        : "No Polisi otomatis"
                    }
                  />
                ) : (
                  <Select
                    value={plate}
                    onValueChange={(val) => setPlate(val)}
                    disabled={!brand || !type || vehiclesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          vehiclesLoading
                            ? "Memuat data kendaraan..."
                            : brand && type
                            ? "Pilih No Polisi"
                            : "Pilih Merk & Tipe terlebih dahulu"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {plateOptions.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 4. Letak Kerusakan */}
              <div className="space-y-2">
                <Label>Letak Kerusakan</Label>
                <Select
                  value={locationType}
                  onValueChange={(val: "External" | "Internal") =>
                    setLocationType(val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih letak (External/Internal)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="External">External</SelectItem>
                    <SelectItem value="Internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 5. Tanggal Lapor */}
              <div className="space-y-2">
                <Label>Tanggal Lapor</Label>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>

              {/* 6. Alasan / Uraian */}
              <div className="space-y-2">
                <Label>Alasan</Label>
                <Textarea
                  value={displayText}
                  onChange={(e) => handleTextareaChange(e.target.value)}
                  className="min-h-[220px] resize-none"
                  placeholder="Tulis alasan/penjelasan kerusakan..."
                />
                {!forceShowTemplate && (
                  <p className="text-xs text-gray-500">
                    Template akan muncul otomatis setelah Merk, Tipe, No Polisi,
                    Letak, dan Tanggal terisi.
                  </p>
                )}
              </div>

              {/* 7. Satu tombol: WA + Gmail + Outlook + Mailto */}
              <div className="space-y-3 pt-2">
                <Button
                  onClick={handleSendAll}
                  disabled={!isFormValid}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Kirim Laporan (WA + Email)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
