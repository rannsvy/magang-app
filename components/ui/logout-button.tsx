// components/ui/logout-button.tsx
"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const onClick = async () => {
    await supabase.auth.signOut();
    await fetch("/api/auth/clear", { method: "POST", credentials: "include" });
    router.replace("/auth/login");
  };
  return <Button className="bg-red-500 h-full w-full" onClick={onClick}>Logout</Button>;
}
