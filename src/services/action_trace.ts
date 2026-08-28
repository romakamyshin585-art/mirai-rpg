/**
 * Action tracer — обёртка для автоматического логирования нажатий.
 * Используй в экранах вместо голого <Pressable onPress={...}>:
 *
 *   const onPress = useAction('complete-quest', () => { ... });
 *   return <Pressable onPress={onPress}>...</Pressable>;
 *
 * Каждое нажатие пишется в лог с пометкой ACTION, включая timing.
 */

import { useCallback, useRef } from 'react';
import { log } from './logger';

export function useAction<TArgs extends unknown[]>(
  tag: string,
  fn: (...args: TArgs) => void | Promise<void>,
  meta?: () => Record<string, unknown>,
): (...args: TArgs) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback((...args: TArgs) => {
    const t0 = Date.now();
    const baseMeta = meta ? safeMeta(meta) : undefined;
    log('ACTION', tag, 'tap', { args: shortArgs(args), ...(baseMeta ?? {}) });
    let result: void | Promise<void>;
    try {
      result = fnRef.current(...args);
    } catch (e) {
      log('ERROR', tag, 'sync throw: ' + (e as Error).message, { stack: (e as Error).stack });
      throw e;
    }
    if (result && typeof (result as Promise<void>).then === 'function') {
      (result as Promise<void>)
        .then(() => log('DEBUG', tag, `done in ${Date.now() - t0}ms`))
        .catch((e) => log('ERROR', tag, 'async throw: ' + (e as Error)?.message, { stack: (e as Error)?.stack }));
    }
  }, [tag]);
}

function shortArgs(args: unknown[]): unknown {
  if (args.length === 0) return undefined;
  if (args.length === 1) return truncate(args[0]);
  return args.map(truncate);
}

function truncate(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === 'string') return v.length > 100 ? v.slice(0, 100) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return '<' + typeof v + '>';
}

function safeMeta(fn: () => Record<string, unknown>): Record<string, unknown> | undefined {
  try { return fn(); } catch { return { metaError: true }; }
}
