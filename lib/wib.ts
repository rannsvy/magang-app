// /app/lib/wib.ts
export function effectiveWIBDate(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); 
}

export function isoToWIBDate(iso: string): string {
  const dt = new Date(iso);
  return effectiveWIBDate(dt);
}
export function nowWIBIso(): string {
  const wibMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().replace("Z", "+07:00");
}

export function visibleUntilCompletedAt(
  completedAtIso: string | null | undefined,
  queryDateWib: string,
  todayWib: string = effectiveWIBDate(),
  nowUtcMs: number = Date.now()
): boolean {
  if (!completedAtIso) return true;

  const completedDateWib = isoToWIBDate(completedAtIso);
  if (queryDateWib < completedDateWib) return true;
  if (queryDateWib > completedDateWib) return false;

  if (queryDateWib !== todayWib) return true; 
  return nowUtcMs < Date.parse(completedAtIso); 
}
