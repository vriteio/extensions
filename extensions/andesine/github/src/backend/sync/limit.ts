/** Requests at once per run; Workers also limit the subrequests of one invocation. */
const REQUEST_LIMIT = 6;

/** Runs `run` for each item, at most `limit` at once; the results keep the items' order. */
const mapLimit = async <T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
  limit = REQUEST_LIMIT
): Promise<R[]> => {
  const results = new Array<R>(items.length);

  let next = 0;

  const work = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;

      results[index] = await run(items[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));

  return results;
};

export { mapLimit };
