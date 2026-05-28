import { AlertTriangle } from "lucide-react";
import type { Issue } from "../types";

type IssueListProps = { issues: Issue[] };

export function IssueList({ issues }: IssueListProps) {
  return (
    <div className="issue-list">
      {issues.map((issue) => (
        <div key={`${issue.code}:${issue.message}`} className="issue">
          <AlertTriangle size={16} />
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

type SummaryCellProps = {
  label: string;
  value: number;
  tone?: "" | "warn";
};

export function SummaryCell({ label, value, tone = "" }: SummaryCellProps) {
  return (
    <div className={tone ? `summary-cell ${tone}` : "summary-cell"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
