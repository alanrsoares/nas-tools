import {
  err,
  fromPromise,
  fromResult,
  match as matchResult,
  ok,
  type Result,
  type ResultAsync,
  trySync,
} from "@onrails/result";
import { z } from "zod";

export interface AppError {
  message: string;
  cause?: unknown;
}

export function toAppError(cause: unknown, message = "Operation failed"): AppError {
  if (cause instanceof Error) {
    return { message: `${message}: ${cause.message}`, cause };
  }

  return { message: `${message}: ${String(cause)}`, cause };
}

export function fail(message: string, cause?: unknown): AppError {
  return { message, cause };
}

export function safe<T>(fn: () => T, message: string): Result<T, AppError> {
  return trySync(fn, (cause) => toAppError(cause, message))();
}

export function safeAsync<T>(fn: () => Promise<T>, message: string): ResultAsync<T, AppError> {
  return fromPromise(fn(), (cause) => toAppError(cause, message));
}

export function parseWith<T extends z.ZodType>(
  schema: T,
  value: unknown,
  message = "Invalid input",
): Result<z.infer<T>, AppError> {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return ok(parsed.data);
  }

  return err({
    message: `${message}: ${z.prettifyError(parsed.error)}`,
    cause: parsed.error,
  });
}

export function formatError(error: AppError): string {
  return error.message;
}

/** Lift sync {@link Result} into {@link ResultAsync} (replaces neverthrow `.asyncAndThen` on `Result`). */
export const asyncAfter = <T, U, E, F>(
  result: Result<T, E>,
  fn: (value: T) => ResultAsync<U, F>,
): ResultAsync<U, E | F> => fromResult(result).flatMap(fn);

export async function runParsedCommand<T>(
  schema: z.ZodType<T>,
  rawOptions: Record<string, unknown>,
  parseMessage: string,
  run: (parsed: T) => ResultAsync<void, AppError>,
  onFailure: (error: AppError) => void,
): Promise<void> {
  const result = await asyncAfter(parseWith(schema, rawOptions, parseMessage), run);
  matchResult(result, () => undefined, onFailure);
}
