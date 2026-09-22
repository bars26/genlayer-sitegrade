"use client";

import { useMemo, useState, Fragment } from "react";
import { Loader2, AlertCircle, Globe, Search, ChevronRight, ChevronDown, Check, Minus, X } from "lucide-react";
import { useAllSites, useAuditSite, useSiteGradeContract } from "@/lib/hooks/useSiteGrade";
import { useWallet } from "@/lib/genlayer/wallet";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GradeBadge } from "./GradeBadge";
import {
  ACCESSIBILITY_CHECKS,
  CHECK_INFO,
  SECURITY_CHECKS,
  parseChecks,
  parseHistory,
  pathOf,
  type CheckKey,
  type Checks,
  type Grade,
  type Site,
} from "@/lib/contracts/types";

const GRADE_FILTERS: (Grade | "any")[] = ["any", "A", "B", "C", "D", "F"];

export function SitesTable() {
  const contract = useSiteGradeContract();
  const { sites, isLoading, isError } = useAllSites();
  const { isConnected } = useWallet();
  const { auditSite, isAuditing, auditingSiteId } = useAuditSite();
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<Grade | "any">("any");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sites.filter((s) => {
      const matchesQuery = !q || s.domain.toLowerCase().includes(q) || s.url.toLowerCase().includes(q) || s.id === q;
      const matchesGrade = gradeFilter === "any" || s.grade === gradeFilter;
      return matchesQuery && matchesGrade;
    });
  }, [sites, query, gradeFilter]);

  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading graded sites...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-400 opacity-60" />
          <h3 className="text-xl font-bold">Setup Required</h3>
          <p className="text-muted-foreground">
            Please set <code className="bg-muted px-1 py-0.5 rounded text-xs">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in
            your .env file.
          </p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="brand-card p-8">
        <p className="text-center text-destructive">Failed to load sites. Please try again.</p>
      </div>
    );
  }

  if (!sites || sites.length === 0) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-3">
          <Globe className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-xl font-bold">No Sites Graded Yet</h3>
          <p className="text-muted-foreground">Be the first to register a page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="brand-card p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by domain, URL or site id..."
            className="pl-9"
            aria-label="Search graded sites"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value as Grade | "any")}
          aria-label="Filter by grade"
          className="rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {GRADE_FILTERS.map((g) => (
            <option key={g} value={g} className="bg-background">
              {g === "any" ? "Any grade" : `Grade ${g}`}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <Search className="w-10 h-10 mx-auto text-muted-foreground opacity-30" />
          <p className="text-muted-foreground text-sm">
            No sites match &quot;{query}&quot;{gradeFilter !== "any" ? ` with grade ${gradeFilter}` : ""}.
          </p>
        </div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {["Site", "Grade", "Security", "Accessibility", "Last Audited", "Actions"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((site) => (
              <SiteRow
                key={site.id}
                site={site}
                isConnected={isConnected}
                onAudit={(id) => auditSite(id)}
                isAuditing={isAuditing && auditingSiteId === site.id}
              />
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function CheckCell({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <Check className="w-4 h-4 text-green-400" aria-label="passed" />;
  if (value === false) return <X className="w-4 h-4 text-red-400" aria-label="failed" />;
  return <Minus className="w-4 h-4 text-muted-foreground" aria-label="not applicable" />;
}

function ScoreCell({ score, grade }: { score: number | bigint; grade: Site["grade"] }) {
  return (
    <div className="flex items-center gap-2">
      <GradeBadge grade={grade} size="sm" />
      <span className="text-sm text-muted-foreground tabular-nums">{Number(score)}%</span>
    </div>
  );
}

function Checklist({ title, keys, checks }: { title: string; keys: readonly CheckKey[]; checks: Partial<Checks> }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      <ul className="space-y-1.5">
        {keys.map((key) => (
          <li key={key} className="text-sm">
            <div className="flex items-center gap-3">
              <CheckCell value={checks[key]} />
              <span>{CHECK_INFO[key].label}</span>
            </div>
            {checks[key] === false && (
              <p className="ml-7 text-xs text-muted-foreground mt-0.5">Fix: {CHECK_INFO[key].fix}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface SiteRowProps {
  site: Site;
  isConnected: boolean;
  onAudit: (siteId: string) => void;
  isAuditing: boolean;
}

function SiteRow({ site, isConnected, onAudit, isAuditing }: SiteRowProps) {
  const [open, setOpen] = useState(false);
  const checks = parseChecks(site.checks_json);
  const history = parseHistory(site.history_json);
  const audited = !!site.last_audited_at;
  const unreachable = audited && checks.reachable === false;

  return (
    <Fragment>
      <tr className="group hover:bg-white/5 transition-colors animate-fade-in">
        <td className="px-4 py-4">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? "Hide report" : "Show report"}
              className="mt-0.5 text-muted-foreground hover:text-accent"
            >
              {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{site.domain}</p>
              <p className="text-xs font-mono text-muted-foreground mt-1 truncate max-w-[16rem]">
                {pathOf(site.url) || site.id}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-4">
          <GradeBadge grade={site.grade} />
        </td>
        <td className="px-4 py-4">
          <ScoreCell score={site.security_score} grade={site.security_grade} />
        </td>
        <td className="px-4 py-4">
          <ScoreCell score={site.accessibility_score} grade={site.accessibility_grade} />
        </td>
        <td className="px-4 py-4">
          <span className="text-sm text-muted-foreground">{site.last_audited_at || "never"}</span>
        </td>
        <td className="px-4 py-4">
          {isConnected && (
            <Button onClick={() => onAudit(site.id)} disabled={isAuditing} size="sm" variant="gradient">
              {isAuditing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Auditing...
                </>
              ) : (
                "Re-audit"
              )}
            </Button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-white/[0.02]">
          <td colSpan={6} className="px-4 pb-5 pt-1">
            <div className="ml-6 space-y-5">
              {unreachable && (
                <p className="text-sm text-red-400">
                  Validators could not load this page on the last audit, so it scores 0 until it answers again.
                </p>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Checklist title="Security headers" keys={SECURITY_CHECKS} checks={checks} />
                <Checklist title="Accessibility" keys={ACCESSIBILITY_CHECKS} checks={checks} />
                <div className="space-y-4">
                  <div className="space-y-1 text-xs text-muted-foreground font-mono break-all">
                    <p className="uppercase tracking-wider font-sans">Page ({site.id})</p>
                    <a href={site.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent underline">
                      {site.url}
                    </a>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Last {history.length} audit{history.length === 1 ? "" : "s"} recorded on-chain
                    </p>
                    <ul className="space-y-1">
                      {[...history].reverse().map((h, idx) => (
                        <li key={idx} className="flex items-center gap-3 text-sm">
                          <span className="font-mono text-xs text-muted-foreground w-24">{h.date}</span>
                          <GradeBadge grade={h.grade} size="sm" />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            sec {h.security}% · a11y {h.accessibility}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A dash means the check does not apply to this page (for example no forms, images or links to inspect).
                The overall grade is the weaker of security and accessibility.
              </p>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
