/**
 * Diminishing returns for repeat quest completions in same category.
 *
 * Rules (config-driven, sensible defaults for solo play):
 *   - First `threshold` completions in a category: 100% XP.
 *   - After threshold, each next completion: -step_pct %.
 *   - Floor: never go below floor_pct %.
 *   - Minimum 1 XP awarded (a quest always gives *something*).
 *
 * All values are percentages as integers (0-100).
 */

export interface DrConfig {
  threshold: number;   // completions before DR kicks in
  step_pct: number;    // -% per step beyond threshold
  floor_pct: number;   // min multiplier (as %, e.g. 25 = 0.25x)
}

export const DEFAULT_DR_CONFIG: DrConfig = {
  threshold: 5,
  step_pct: 15,
  floor_pct: 25,
};

export function drMultiplier(
  completionCount: number,
  cfg: DrConfig = DEFAULT_DR_CONFIG,
): number {
  if (completionCount < cfg.threshold) return 1.0;
  const steps = completionCount - cfg.threshold + 1;
  const mult = 1.0 - (cfg.step_pct / 100) * steps;
  const floor = cfg.floor_pct / 100;
  return Math.max(floor, mult);
}

export function applyDr(
  baseXp: number,
  completionCount: number,
  cfg: DrConfig = DEFAULT_DR_CONFIG,
): { awarded: number; multiplier: number } {
  const mult = drMultiplier(completionCount, cfg);
  const awarded = Math.max(1, Math.round(baseXp * mult));
  return { awarded, multiplier: mult };
}
