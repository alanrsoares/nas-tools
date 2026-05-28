import { Maybe } from "true-myth";

/** Collect present values from a list of {@link Maybe}s. */
export const compactMaybes = <T extends object>(values: readonly Maybe<T>[]): T[] =>
  values.flatMap((value) => (value.isJust ? [value.value] : []));

export { Maybe };
