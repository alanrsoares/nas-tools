import { compact } from "@onrails/maybe";

export {
  andThen,
  compactMap,
  fromNullable,
  getOrElse,
  isNone,
  isSome,
  type Maybe,
  map,
  match,
  matchMaybe,
  none,
  of,
  some,
} from "@onrails/maybe";

/** Collect present values from a list of {@link Maybe}s. */
export const compactMaybes = compact;
