"use client";

import { BarChart3, Loader2 } from "lucide-react";
import { useAllSites } from "@/lib/hooks/useSiteGrade";
import { GradeBadge } from "./GradeBadge";
import type { Grade } from "@/lib/contracts/types";

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export function GradePanel() {
  const { sites, isLoading } = useAllSites();
  const audited = sites.filter((s) => s.last_audited_at);
  const counts = GRADES.map((g) => audited.filter((s) => s.grade === g).length);
  const max = Math.max(1, ...counts);

  // Most common failing checks across all audited sites.
  const failTally = new Map<string, number>();
  for (const s of audited) {
    for (const key of (s.failed || "").split(",").filter(Boolean)) {
      failTally.set(key, (failTally.get(key) ?? 0) + 1);
    }
  }
  const topFails = [...failTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="brand-card p-6 space-y-4">
      <div>
        <h3 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" />
          Grade Distribution
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Overall grade is the weaker of security headers and accessibility, so a site can&apos;t hide a hole behind a
          strong half.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {GRADES.map((g, i) => (
              <li key={g} className="flex items-center gap-3">
                <GradeBadge grade={g} size="sm" />
                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent/70"
                    style={{ width: `${(counts[i] / max) * 100}%` }}
                  />
                </div>
                <span className="text-sm tabular-nums w-5 text-right">{counts[i]}</span>
              </li>
            ))}
          </ul>
          {topFails.length > 0 && (
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Most common misses</p>
              {topFails.map(([key, n]) => (
                <p key={key} className="text-sm flex justify-between">
                  <span className="font-mono text-xs">{key}</span>
                  <span className="text-muted-foreground">
                    {n} site{n === 1 ? "" : "s"}
                  </span>
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
