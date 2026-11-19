// Growth over time: the shape of public/data/history.json, built at build time
// from the data repo's git history (scripts/build-history.mjs).

export interface HistoryMonth {
  /** YYYY-MM */
  month: string;
  total: number;
  /** Companies per capability group slug. */
  groups: Record<string, number>;
}

export interface History {
  generated: string;
  groups: Array<{ slug: string; label: string }>;
  months: HistoryMonth[];
}

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-06" to "June 2026". */
export function monthLabel(month: string): string {
  if (!MONTH.test(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return `${NAMES[m - 1]} ${y}`;
}
