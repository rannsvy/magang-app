"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseBrowser";
import { LogoutButton } from "./ui/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Menu,
  LogOut,
  UserCircle,
  AlertCircle,
  AlertTriangle,
  Trophy,
} from "lucide-react";

const ALLOWED = new Set(["supervisor", "gm", "manager"]);

interface TechnicianHeaderProps {
  title: string;
  showBackButton?: boolean;
  backUrl?: string;
  showFilter?: boolean;
  filterValue?: "all" | "survey" | "instalasi";
  onFilterChange?: (value: "all" | "survey" | "instalasi") => void;
}

export function TechnicianHeader({
  title,
  showBackButton = false,
  backUrl = "/user/dashboard",
  showFilter = false,
  filterValue = "all",
  onFilterChange,
}: TechnicianHeaderProps) {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (!error) setRole((data?.role || "").toLowerCase());
      } catch {}
    })();
  }, []);

  const handleBack = () => router.push(backUrl);
  const handleProfileClick = () => router.push("/user/profile");
  const handleComplaintClick = () => router.push("/user/complain");
  const handleDamageComplainClick = () => router.push("/user/damageComplain");
  const canSeeLeaderboard = role ? ALLOWED.has(role) : false;

  return (
    <header className="bg-white shadow-sm border-b">
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="p-2">
                <Menu className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleProfileClick}>
                <UserCircle className="h-4 w-4 mr-2" />
                Profil
              </DropdownMenuItem>

              {/* Hanya supervisor/gm/manager */}
              {canSeeLeaderboard && (
                <DropdownMenuItem onClick={() => router.push("/leaderboard")}>
                  <Trophy className="h-4 w-4 mr-2 text-yellow-500" />
                  Leaderboard Poin
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={handleDamageComplainClick}>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Lapor Kerusakan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleComplaintClick}>
                <AlertCircle className="h-4 w-4 mr-2" />
                Ajukan Komplain
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600">
                <LogoutButton/>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
