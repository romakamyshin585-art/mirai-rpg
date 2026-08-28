/**
 * Thin abstraction over expo-sqlite so repos can be unit-tested
 * with an in-memory fake that implements the same minimal interface.
 *
 * Only what we actually need. No query builder, no ORM.
 */

export interface Row {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [column: string]: any;
}

export interface DbExecutor {
  /** One-shot run (CREATE, INSERT, UPDATE). */
  exec(sql: string, params?: ReadonlyArray<unknown>): Promise<void>;

  /** Single row or null. */
  one<T extends Row = Row>(sql: string, params?: ReadonlyArray<unknown>): Promise<T | null>;

  /** All matching rows. */
  all<T extends Row = Row>(sql: string, params?: ReadonlyArray<unknown>): Promise<T[]>;

  /** Wraps `exec` calls in a transaction. Rolls back on throw. */
  withTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
}
