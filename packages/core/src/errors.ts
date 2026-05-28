import { ResultAsync } from "@onrails/result";

import type { FieldIssue } from "./schemas.js";

export type CoreError = {
  type: "CORE_ERROR";
  message: string;
  cause?: unknown;
};

export type ValidationError = {
  type: "VALIDATION_ERROR";
  issues: FieldIssue[];
};

export type MovePlanError =
  | CoreError
  | ValidationError
  | { type: "STAGING_AREA_MISSING"; path: string }
  | { type: "SOURCE_MISSING"; itemId: string; path: string }
  | { type: "ARTIST_REQUIRED"; itemId: string };

export const toCoreError = (message: string, cause?: unknown): CoreError => ({
  type: "CORE_ERROR",
  message,
  cause,
});

export const safeAsync = <T>(fn: () => Promise<T>, message: string) =>
  ResultAsync.fromPromise(fn(), (cause) => toCoreError(message, cause));
