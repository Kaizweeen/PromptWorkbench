/**
 * A small concurrency pool.
 *
 * Test suites fan out across cases, but a local workbench should not open
 * twenty simultaneous API calls — that earns a 429 and makes the cost of a
 * typo enormous.
 */

export const DEFAULT_CONCURRENCY = 4;

export interface PoolProgress {
  completed: number;
  total: number;
}

/**
 * Map over items with at most `limit` in flight.
 *
 * Results come back in input order regardless of completion order, so a
 * pass/fail matrix lines up with the case list. `fn` is expected to capture
 * its own failures; a rejection here aborts the whole pool.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (progress: PoolProgress) => void,
): Promise<R[]> {
  const total = items.length;
  const results = new Array<R>(total);
  if (total === 0) return results;

  const effective = Math.max(1, Math.min(Math.floor(limit) || 1, total));
  let next = 0;
  let completed = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= total) return;

      results[index] = await fn(items[index], index);
      completed++;
      onProgress?.({ completed, total });
    }
  }

  await Promise.all(Array.from({ length: effective }, worker));
  return results;
}
