// lib/resolveSupervisor.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedSupervisor = {
  supervisorId: string | null;
  supRow: {
    id: string;
    role: string;
    nickname: string | null;
    full_name: string | null;
    email: string | null;
  } | null;
  isManagerOrGM: boolean;
  isSupervisor: boolean;
};

export async function resolveCurrentSupervisor(
  supabase: SupabaseClient
): Promise<ResolvedSupervisor> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user)
    return {
      supervisorId: null,
      supRow: null,
      isManagerOrGM: false,
      isSupervisor: false,
    };

  // 1) ambil profile (supervisor_id + email)
  const { data: prof } = await supabase
    .from("profiles")
    .select("supervisor_id, email")
    .eq("id", user.id)
    .maybeSingle();

  let supRow: ResolvedSupervisor["supRow"] = null;
  let supervisorId: string | null = prof?.supervisor_id ?? null;

  // 2) kalau supervisor_id kosong -> fallback ke email
  if (!supervisorId && prof?.email) {
    const { data: s } = await supabase
      .from("supervisors")
      .select("id, role, nickname, full_name, email")
      .eq("email", prof.email)
      .maybeSingle();

    if (s?.id) {
      supervisorId = s.id;
      supRow = {
        id: s.id,
        role: s.role,
        nickname: (s.nickname ?? null) as any,
        full_name: (s.full_name ?? null) as any,
        email: (s.email ?? null) as any,
      };
    }
  } else if (supervisorId) {
    const { data: s } = await supabase
      .from("supervisors")
      .select("id, role, nickname, full_name, email")
      .eq("id", supervisorId)
      .maybeSingle();
    if (s?.id) {
      supRow = {
        id: s.id,
        role: s.role,
        nickname: (s.nickname ?? null) as any,
        full_name: (s.full_name ?? null) as any,
        email: (s.email ?? null) as any,
      };
    }
  }

  const role = (supRow?.role ?? "").toLowerCase();
  const isManagerOrGM =
    role === "manager" || role === "gm" || role === "general manager";
  const isSupervisor = role === "supervisor";

  return { supervisorId, supRow, isManagerOrGM, isSupervisor };
}
