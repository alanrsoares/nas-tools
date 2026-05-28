import type { FieldIssue, MovePlanError } from "@nas-tools/core";

export const toIssues = (error: MovePlanError): FieldIssue[] => {
  if (error.type === "VALIDATION_ERROR") return error.issues;
  return [
    {
      path: [],
      code: error.type,
      message: "message" in error ? error.message : error.type,
    },
  ];
};
