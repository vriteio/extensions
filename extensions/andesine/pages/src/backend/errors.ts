import * as z from "zod";

/** A request the panel can correct; its message reaches the member. */
class BadRequestError extends Error {}

const parseInput = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);

  if (!result.success) throw new BadRequestError(z.prettifyError(result.error));

  return result.data;
};

export { BadRequestError, parseInput };
