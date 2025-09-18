// app/user/dashboard/page.tsx
import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic"; // boleh di Server file
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Memuat dashboard…</div>}>
      <DashboardClient />
    </Suspense>
  );
}
