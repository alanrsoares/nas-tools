import {
  fromPromise,
  fromResult as onrailsFromResult,
  type Result,
  type ResultAsync,
} from "@onrails/result";

export function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

export function tryAsync<T>(promise: Promise<T>): ResultAsync<T, Error> {
  return fromPromise(promise, toError);
}

export const fromResult = onrailsFromResult;

export const asyncAfter = <T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => ResultAsync<U, F>,
): ResultAsync<U, E | F> => fromResult(result).flatMap(fn);
