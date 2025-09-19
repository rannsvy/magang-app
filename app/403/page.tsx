export default function ForbiddenPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">403 — Akses Ditolak</h1>
        <p className="text-gray-600">
          Anda tidak memiliki izin untuk mengakses halaman ini.
        </p>
      </div>
    </main>
  );
}
