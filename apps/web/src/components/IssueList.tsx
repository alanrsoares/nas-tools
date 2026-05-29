import { AlertTriangle } from "lucide-react";
import {
  IssueList as IssueListRoot,
  IssueRow,
  Summary,
  SummaryCell,
  SummaryCellLabel,
  SummaryCellValue,
} from "@/components/styled";
import type { Issue } from "../types";

type IssueListProps = { issues: Issue[] };

export function IssueList({ issues }: IssueListProps) {
  return (
    <IssueListRoot>
      {issues.map((issue) => (
        <IssueRow key={`${issue.code}:${issue.message}`}>
          <AlertTriangle size={16} />
          <span>{issue.message}</span>
        </IssueRow>
      ))}
    </IssueListRoot>
  );
}

type SummaryCellProps = {
  label: string;
  value: number;
  tone?: "default" | "warn" | "";
};

export function SummaryCellBlock({ label, value, tone = "default" }: SummaryCellProps) {
  return (
    <SummaryCell $tone={tone === "warn" ? "warn" : "default"}>
      <SummaryCellLabel>{label}</SummaryCellLabel>
      <SummaryCellValue>{value}</SummaryCellValue>
    </SummaryCell>
  );
}

// Back-compat export name used across features
export { Summary, SummaryCellBlock as SummaryCell };
