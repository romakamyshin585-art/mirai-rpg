/**
 * SQL string-literal helpers.
 *
 * Why this exists:
 * expo-sqlite 15.x `NativeDatabase.execAsync` silently drops bound
 * parameters for single-statement INSERT/UPDATE in Android release
 * builds. The symptom is a NOT NULL violation, e.g.
 *   "NOT NULL constraint failed: config.value"
 * `db/migrate.ts` already worked around it for `schema_version` by
 * inlining the value as a literal; this module generalises that fix so
 * `ui/app_context.ts` can use the same safe path for `user_id`.
 *
 * Only ever use this for values the app generates itself (uuids, keys,
 * schema versions). Never for user input — if user input ever needs to
 * reach SQL, bind it as a parameter and use `runAsync` instead.
 */

export function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlInt(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`sqlInt: not a finite number (${value})`);
  return String(Math.trunc(value));
}
