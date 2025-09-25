// lib/milestone.ts
export type Milestone = 25 | 50 | 75 | 100;

export const MILESTONES: Milestone[] = [25, 50, 75, 100];

export function getReachedMilestone(progressPct: number): Milestone | null {
  if (progressPct === 100) return 100;        // 100% harus pas 100
  if (progressPct >= 75) return 75;           // >= 75
  if (progressPct >= 50) return 50;           // >= 50
  if (progressPct >= 25) return 25;           // >= 25
  return null;
}

export function milestoneMessage(ms: Milestone): string {
  switch (ms) {
    case 25:
      return "Selamat anda sudah menyentuh 25% dari 100%, Push terus masbroo!";
    case 50:
      return "Cieee udah setengah nih, ayoo semangat terus sampe 100%";
    case 75:
      return "wahh udah hampir di penghujung nihh, ayoo ayoo gass terus dikit lagi bisaa nih";
    case 100:
      return "akhirnya selesai! selamat yaa dan terimakasih atas kerja kerasnya masbroo!";
  }
}
