import { err, ok, Result, ResultAsync } from "neverthrow";
import { z } from "zod";

export interface AppError {
  message: string;
  cause?: unknown;
}

export function toAppError(
  cause: unknown,
  message = "Operation failed",
): AppError {
  if (cause instanceof Error) {
    return { message: `${message}: ${cause.message}`, cause };
  }

  return { message: `${message}: ${String(cause)}`, cause };
}

export function fail(message: string, cause?: unknown): AppError {
  return { message, cause };
}

export function safe<T>(fn: () => T, message: string): Result<T, AppError> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(toAppError(cause, message));
  }
}

export function safeAsync<T>(
  fn: () => Promise<T>,
  message: string,
): ResultAsync<T, AppError> {
  return ResultAsync.fromPromise(fn(), (cause) => toAppError(cause, message));
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
