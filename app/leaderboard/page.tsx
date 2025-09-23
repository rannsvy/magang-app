import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import LeaderboardClient from "./ui";

const ALLOWED = new Set(["supervisor", "gm", "manager"]);

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Page() {
  const sb = supabaseServer();

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/auth/login?next=/leaderboard");

  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = String(me?.role || "").toLowerCase();
  if (!ALLOWED.has(role)) redirect("/user/dashboard");

  return <LeaderboardClient />;
}
