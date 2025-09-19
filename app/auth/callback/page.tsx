import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-700">Menyelesaikan login…</p>
    </div>}>
      <CallbackClient />
    </Suspense>
  );
}
