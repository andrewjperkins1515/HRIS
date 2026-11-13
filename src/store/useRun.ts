import { useCallback } from 'react';
import { usePoise, type ActionResult } from './store';

/**
 * Run a store action and show consistent feedback.
 *   const run = useRun();
 *   run(() => assignShift(id, emp), { success: 'Shift assigned' });
 */
export function useRun() {
  const toast = usePoise((s) => s.toast);
  return useCallback(
    <T,>(fn: () => ActionResult<T>, msg: { success?: string; successBody?: string | ((v: T | undefined) => string | undefined); errorTitle?: string } = {}): ActionResult<T> => {
      const r = fn();
      if (!r.ok) toast({ tone: 'error', title: msg.errorTitle ?? 'Action not completed', body: r.error });
      else if (msg.success) {
        const body = typeof msg.successBody === 'function' ? msg.successBody(r.value) : msg.successBody;
        toast({ tone: 'success', title: msg.success, body });
      }
      return r;
    },
    [toast],
  );
}
