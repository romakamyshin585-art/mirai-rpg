/**
 * In-memory SQLite-like fake for tests.
 * Implements just enough SQL to make our repos work.
 *
 * Supports: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE IF NOT EXISTS, PRAGMA.
 * No joins, no subqueries, no GROUP BY beyond what we use.
 *
 * Each value can be: number, string, null, Uint8Array (BLOB).
 */

import type { DbExecutor, Row } from './executor';

interface Table {
  cols: string[];
  rows: Row[];
}

/**
 * Convert a SQL literal token (e.g. `'1'`, `'foo'`, `42`, `NULL`) into
 * its JS value, for the in-memory test fake. Only the shapes the
 * production code emits are supported.
 */
function sqlLiteralToValue(token: string): string | number | null {
  const t = token.trim();
  if (t === 'NULL' || t === 'null') return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  // String literal in single quotes; support '' as empty string and
  // doubled '' as an escaped quote.
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  // Unquoted identifier-looking token: treat as the literal string.
  return t;
}

class MemoryDb {
  tables = new Map<string, Table>();

  private ensure(table: string): Table {
    let t = this.tables.get(table);
    if (!t) {
      t = { cols: [], rows: [] };
      this.tables.set(table, t);
    }
    return t;
  }

  exec(sql: string, params: ReadonlyArray<unknown> = []): { rows: Row[]; changes: number } {
    const s = sql.trim();
    const upper = s.toUpperCase();

    if (upper.startsWith('PRAGMA')) {
      return { rows: [], changes: 0 };
    }

    if (upper.startsWith('CREATE TABLE')) {
      // CREATE TABLE [IF NOT EXISTS] table_name (col TYPE, ...)
      const m = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]+)\)\s*;?$/i);
      if (!m) throw new Error('Bad CREATE: ' + sql);
      const tname = m[1];
      if (this.tables.has(tname)) return { rows: [], changes: 0 };
      const cols = m[2].split(',').map((c) => c.trim().split(/\s+/)[0]);
      this.tables.set(tname, { cols, rows: [] });
      return { rows: [], changes: 0 };
    }

    if (upper.startsWith('CREATE INDEX')) {
      return { rows: [], changes: 0 };
    }

    if (upper.startsWith('INSERT INTO') || upper.startsWith('INSERT OR IGNORE INTO')) {
      // INSERT [OR IGNORE] INTO t (cols) VALUES (?, ?, ?) or literal VALUES
      const m = s.match(/INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]+?)\)\s*;?$/i);
      if (!m) throw new Error('Bad INSERT: ' + sql);
      const tname = m[1];
      const cols = m[2].split(',').map((c) => c.trim());
      // Either placeholders are all '?' and params is non-empty,
      // or all placeholders are SQL literals and params is empty.
      const placeholderList = m[3].split(',').map((c) => c.trim());
      const isLiteral = placeholderList.every((p) => p !== '?');
      if (isLiteral) {
        if (cols.length !== placeholderList.length) {
          throw new Error(`INSERT literal mismatch: cols=${cols.length} vals=${placeholderList.length}`);
        }
        const t = this.ensure(tname);
        const row: Row = {};
        cols.forEach((c, i) => { row[c] = sqlLiteralToValue(placeholderList[i]); });
        t.rows.push(row);
        return { rows: [], changes: 1 };
      }
      if (cols.length !== placeholderList.length || placeholderList.length !== params.length) {
        throw new Error(`INSERT param mismatch: cols=${cols.length} ph=${placeholderList.length} params=${params.length}`);
      }
      const t = this.ensure(tname);
      const row: Row = {};
      cols.forEach((c, i) => (row[c] = params[i]));
      t.rows.push(row);
      return { rows: [], changes: 1 };
    }

    if (upper.startsWith('UPDATE')) {
      // UPDATE t SET col=?, col=? WHERE ...
      // Also: SET col = col + ?, SET col = col - ?
      const m = s.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+?))?\s*;?$/i);
      if (!m) throw new Error('Bad UPDATE: ' + sql);
      const tname = m[1];
      const sets = m[2].split(',').map((s) => s.trim());
      const where = m[3]?.trim();
      const t = this.ensure(tname);
      let changed = 0;
      for (const row of t.rows) {
        if (where && !matchWhere(row, where, params, sets.length)) continue;
        sets.forEach((s, i) => {
          const rel = s.match(/^(\w+)\s*=\s*\w+\s*([+\-])\s*\?$/);
          if (rel) {
            const col = rel[1];
            const op = rel[2];
            const cur = Number(row[col] || 0);
            const inc = Number(params[i]);
            row[col] = op === '+' ? cur + inc : cur - inc;
            return;
          }
          const eq = s.match(/^(\w+)\s*=\s*\?$/);
          if (eq) { row[eq[1]] = params[i]; return; }
          const litEq = s.match(/^(\w+)\s*=\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?|NULL|null)$/);
          if (litEq) { row[litEq[1]] = sqlLiteralToValue(litEq[2]); return; }
          throw new Error('Bad SET: ' + s);
        });
        changed += 1;
      }
      return { rows: [], changes: changed };
    }

    if (upper.startsWith('DELETE FROM')) {
      const m = s.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?\s*;?$/i);
      if (!m) throw new Error('Bad DELETE: ' + sql);
      const tname = m[1];
      const t = this.tables.get(tname);
      if (!t) return { rows: [], changes: 0 };
      const before = t.rows.length;
      if (!m[2]) {
        t.rows = [];
      } else {
        t.rows = t.rows.filter((r) => !matchWhere(r, m[2], params, 0));
      }
      return { rows: [], changes: before - t.rows.length };
    }

    if (upper.startsWith('SELECT')) {
      // Wrap COUNT(*) etc. — handle aggregates by recognising simple patterns
      // and returning a single aggregate row. We only support COUNT(*) and
      // SUM(col) / MAX(col) for now.
      const agg = s.match(/SELECT\s+(COUNT\(\*\)|SUM\(\w+\)|MAX\(\w+\))\s+(?:AS\s+(\w+)\s+)?FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?\s*;?$/i);
      if (agg) {
        const fn = agg[1].toUpperCase();
        const alias = agg[2] || (fn.startsWith('COUNT') ? 'count' : fn.startsWith('SUM') ? 'sum' : 'max');
        const tname = agg[3];
        const where = agg[4]?.trim();
        const t = this.tables.get(tname);
        if (!t) return { rows: [{ [alias]: 0 }], changes: 0 };
        let rows = t.rows.slice();
        if (where) rows = applyWhere(rows, where, params);
        if (fn === 'COUNT(*)') return { rows: [{ [alias]: rows.length }], changes: 0 };
        const colMatch = fn.match(/\((\w+)\)/);
        const col = colMatch![1];
        if (fn.startsWith('SUM')) {
          const v = rows.reduce((s, r) => s + Number(r[col] || 0), 0);
          return { rows: [{ [alias]: v }], changes: 0 };
        }
        if (fn.startsWith('MAX')) {
          const v = rows.reduce((m, r) => Math.max(m, Number(r[col] || 0)), 0);
          return { rows: [{ [alias]: v }], changes: 0 };
        }
      }
      return runSelect(this, s, params);
    }

    throw new Error('Unsupported SQL: ' + sql);
  }
}

function runSelect(db: MemoryDb, sql: string, params: ReadonlyArray<unknown>): { rows: Row[]; changes: number } {
  // SELECT [DISTINCT] col, col FROM t [WHERE ...] [ORDER BY ...] [LIMIT ?] [OFFSET ?]
  const m = sql.match(/SELECT\s+(DISTINCT\s+)?([\s\S]+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+\?)?(?:\s+OFFSET\s+\?)?\s*;?$/i);
  if (!m) throw new Error('Bad SELECT: ' + sql);
  const distinct = !!m[1];
  const cols = m[2].trim();
  const tname = m[3];
  const where = m[4]?.trim();
  const order = m[5]?.trim();
  const t = db.tables.get(tname);
  if (!t) return { rows: [], changes: 0 };

  let rows = t.rows.slice();
  if (where) {
    rows = applyWhere(rows, where, params);
  }
  if (order) {
    const om = order.match(/^(\w+)(?:\s+(ASC|DESC))?$/i);
    if (om) {
      const col = om[1];
      const dir = (om[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
      rows.sort((a, b) => (a[col] < b[col] ? -dir : a[col] > b[col] ? dir : 0));
    }
  }
  // LIMIT / OFFSET come from end of params after WHERE
  if (sql.toUpperCase().includes('LIMIT ?')) {
    const lim = params[params.length - (sql.toUpperCase().includes('OFFSET ?') ? 2 : 1)];
    rows = rows.slice(0, Number(lim));
  }
  if (sql.toUpperCase().includes('OFFSET ?')) {
    const off = params[params.length - 1];
    rows = rows.slice(Number(off));
  }

  if (cols === '*') {
    let out = rows.map((r) => ({ ...r }));
    if (distinct) out = uniqBy(out);
    return { rows: out, changes: 0 };
  }
  const colList = splitCols(cols);
  let out = rows.map((r) => {
    const o: Row = {};
    for (const c of colList) {
      // Support simple SQL functions like substr(col, 1, 10) AS d
      const sub = c.match(/^substr\(\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*(?:AS\s+(\w+))?$/i);
      if (sub) {
        const [, col, start, len, alias] = sub;
        const v = r[col];
        o[alias || `substr(${col},${start},${len})`] = v != null ? String(v).slice(Number(start) - 1, Number(start) - 1 + Number(len)) : null;
        continue;
      }
      // Handle "expr AS alias" for simple column references
      const as = c.match(/^(\w+)\s+AS\s+(\w+)$/i);
      if (as) {
        o[as[2]!] = r[as[1]!];
        continue;
      }
      o[c] = r[c];
    }
    return o;
  });
  if (distinct) out = uniqBy(out);
  return { rows: out, changes: 0 };
}

function splitCols(cols: string): string[] {
  // Split on top-level commas only (skip those inside parens)
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < cols.length; i += 1) {
    const c = cols[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function uniqBy<T extends Row>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function splitAnd(where: string): string[] {
  // naive split on " AND " / " OR " (case-insensitive), preserving the space pattern.
  // Handles parenthesised sub-expressions: e.g. "(a = 1 OR b = ?)" stays as one part.
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < where.length; i += 1) {
    const c = where[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    if (depth === 0) {
      const tail = where.slice(i, i + 5);
      if ((tail.toUpperCase() === ' AND ' || tail.toUpperCase() === ' OR ') && buf.trim()) {
        out.push(buf.trim());
        buf = '';
        i += tail.length - 1;
        continue;
      }
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function applyWhere<T extends Row>(rows: T[], where: string, params: ReadonlyArray<unknown>): T[] {
  // Build a list of (operator, matcher) pairs split on AND/OR.
  const tokens: Array<{ op: 'AND' | 'OR'; match: (r: Row) => boolean; consumed: number }> = [];
  const parts = splitAnd(where);
  let p = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    // strip outer parens
    const stripped = part.replace(/^\(([\s\S]*)\)$/, '$1');
    // detect if this is an OR-part by re-checking original text
    const isOr = /\s+OR\s+/i.test(stripped);
    if (isOr) {
      // group the OR sub-parts; the simplest correct thing is to evaluate
      // the whole OR-expression as a positive match using the same primitives.
      const orParts = stripped.split(/\s+OR\s+/i);
      const matchers = orParts.map((op) => buildMatcher(op, params, p));
      const orMatcher = (r: Row) => matchers.some((m) => m(r));
      tokens.push({ op: 'OR', match: orMatcher, consumed: orParts.length });
      // consumed params across orParts
      p += countParamsIn(orParts);
      continue;
    }
    const matcher = buildMatcher(stripped, params, p);
    const consumed = countParamsIn([stripped]);
    p += consumed;
    tokens.push({ op: 'AND', match: matcher, consumed });
  }
  return rows.filter((r) => {
    // Evaluate AND-of-ORs: result is true if every AND group's any-of-OR matches.
    for (const t of tokens) {
      if (!t.match(r)) return false;
    }
    return true;
  });
}

function countParamsIn(parts: string[]): number {
  let n = 0;
  for (const part of parts) {
    if (/\?$/.test(part.trim())) n += 1;
  }
  return n;
}

function buildMatcher(part: string, params: ReadonlyArray<unknown>, pStart: number): (r: Row) => boolean {
  // Supports: col = ?, col = 'literal', col = 1, col IS NULL, col IS NOT NULL
  if (/\s+IS\s+NOT\s+NULL\s*$/i.test(part)) {
    const col = part.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i)![1]!;
    return (r: Row) => r[col] != null;
  }
  if (/\s+IS\s+NULL\s*$/i.test(part)) {
    const col = part.match(/^(\w+)\s+IS\s+NULL$/i)![1]!;
    return (r: Row) => r[col] == null;
  }
  const lit = part.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*'([^']*)'$/);
  if (lit) return (r: Row) => cmp(r[lit[1]!], lit[2]!, lit[3]!);
  const litNum = part.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (litNum) return (r: Row) => cmp(r[litNum[1]!], litNum[2]!, Number(litNum[3]!));
  const ph = part.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*\?$/);
  if (!ph) {
    // Try function call on LHS: substr(col, 1, 10) op ?
    const fn = part.match(/^(\w+)\s*\(([\s\S]+)\)\s*(=|!=|<=|>=|<|>)\s*(\?|'([^']*)'|(-?\d+(?:\.\d+)?))$/);
    if (fn) {
      const fname = fn[1]!;
      const fargs = fn[2]!;
      const op = fn[3]!;
      const val: unknown = fn[4] === '?' ? params[pStart] : (fn[5] !== undefined ? fn[5]! : Number(fn[6]!));
      return (r: Row) => {
        const v = evalFn(fname, fargs, r);
        return cmp(v, op, val);
      };
    }
    throw new Error('Bad WHERE part: ' + part);
  }
  const val = params[pStart];
  return (r: Row) => cmp(r[ph[1]!], ph[2]!, val);
}

function evalFn(fname: string, fargs: string, r: Row): unknown {
  if (fname === 'substr') {
    const [col, startRaw, lenRaw] = fargs.split(',').map((s) => s.trim());
    const src = r[col!];
    if (src == null) return null;
    const start = Number(startRaw);
    const len = Number(lenRaw);
    return String(src).slice(start - 1, start - 1 + len);
  }
  throw new Error('Unknown SQL fn: ' + fname);
}

function cmp(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case '=': return a === b || (a == null && b == null);
    case '!=': return a !== b;
    case '<': return Number(a) < Number(b);
    case '>': return Number(a) > Number(b);
    case '<=': return Number(a) <= Number(b);
    case '>=': return Number(a) >= Number(b);
    default: return false;
  }
}

function matchWhere(row: Row, where: string, params: ReadonlyArray<unknown>, skipFirst: number): boolean {
  const parts = splitAnd(where);
  let p = skipFirst;
  for (const part of parts) {
    // Either 'col = ?' (bound) or 'col = <literal>' (e.g. 'foo', 42, NULL).
    const bound = part.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*\?$/);
    if (bound) {
      if (!cmp(row[bound[1]], bound[2], params[p++])) return false;
      continue;
    }
    const lit = part.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?|NULL|null)$/);
    if (lit) {
      const rhs = lit[3] === 'NULL' || lit[3] === 'null' ? null : sqlLiteralToValue(lit[3]);
      if (!cmp(row[lit[1]], lit[2], rhs)) return false;
      continue;
    }
    throw new Error('Bad WHERE: ' + part);
  }
  return true;
}

export function createMemoryDb(): DbExecutor {
  const mem = new MemoryDb();
  const exec_ = (sql: string, params?: ReadonlyArray<unknown>): Promise<void> => {
    mem.exec(sql, params);
    return Promise.resolve();
  };
  const one_ = <T extends Row = Row>(sql: string, params?: ReadonlyArray<unknown>): Promise<T | null> =>
    Promise.resolve(mem.exec(sql, params).rows[0] as T | null ?? null);
  const all_ = <T extends Row = Row>(sql: string, params?: ReadonlyArray<unknown>): Promise<T[]> =>
    Promise.resolve(mem.exec(sql, params).rows as T[]);

  const base: DbExecutor = {
    exec: exec_,
    one: one_,
    all: all_,
    withTransaction: async <T,>(fn: (tx: DbExecutor) => Promise<T>) => {
      // Naive: no real rollback (for our test purposes this is fine)
      return fn({
        exec: exec_,
        one: one_,
        all: all_,
        withTransaction: async <U,>(f: (tx: DbExecutor) => Promise<U>) => f(base),
      });
    },
  };
  return base;
}
