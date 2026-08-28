/**
 * Time-of-day classification for hidden "context" achievements.
 * All times are local to the user's device (Date.now() / new Date()).
 *
 * Buckets:
 *   early   — 05:00 - 08:59   (early bird)
 *   morning — 09:00 - 11:59
 *   day     — 12:00 - 17:59
 *   evening — 18:00 - 21:59
 *   night   — 22:00 - 23:59
 *   late    — 00:00 - 04:59   (midnight owl)
 */

export type TimeBucket = 'early' | 'morning' | 'day' | 'evening' | 'night' | 'late';

export function timeBucket(at: Date = new Date()): TimeBucket {
  const h = at.getHours();
  if (h >= 0 && h < 5) return 'late';
  if (h >= 5 && h < 9) return 'early';
  if (h >= 9 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

export function isWeekend(at: Date = new Date()): boolean {
  const d = at.getDay();
  return d === 0 || d === 6;
}

/** YYYY-MM-DD in local timezone. Used as the day key for streak tracking. */
export function dayKey(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Days between two dayKeys (positive = b is after a). */
export function daysBetween(a: string, b: string): number {
  const ad = new Date(`${a}T00:00:00`).getTime();
  const bd = new Date(`${b}T00:00:00`).getTime();
  return Math.round((bd - ad) / (1000 * 60 * 60 * 24));
}
