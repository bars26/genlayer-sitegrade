"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useSiteGradeContract } from "@/lib/hooks/useSiteGrade";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GradeBadge } from "./GradeBadge";
import type { Grade } from "@/lib/contracts/types";

const MIN_GRADES: Grade[] = ["A", "B", "C", "D"];

/** The call a grant programme, directory or wallet makes before it lists or links a site. */
export function GateLookup() {
  const contract = useSiteGradeContract();
  const [siteId, setSiteId] = useState("");
  const [minGrade, setMinGrade] = useState<Grade>("C");
  const [result, setResult] = useState<{ grade: Grade; passes: boolean; min: Grade } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract || !siteId.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const id = siteId.trim();
      const [grade, passes] = await Promise.all([contract.getGrade(id), contract.meetsGrade(id, minGrade)]);
      setResult({ grade, passes, min: minGrade });
    } catch {
      setError("No site with that id. Try site_0.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brand-card p-6 space-y-3">
      <div>
        <h3 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-accent" />
          Integrator gate
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Reads <code className="text-xs">get_grade</code> / <code className="text-xs">meets_grade</code> straight from
          the contract, the call a directory, grant programme or wallet makes before it links a dApp frontend.
        </p>
      </div>
      <form onSubmit={lookup} className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="site_0"
            className="font-mono"
            aria-label="Site id to look up"
          />
          <select
            value={minGrade}
            onChange={(e) => setMinGrade(e.target.value as Grade)}
            aria-label="Minimum grade required"
            className="rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {MIN_GRADES.map((g) => (
              <option key={g} value={g} className="bg-background">
                min {g}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="gradient" className="w-full" disabled={loading || !siteId.trim()}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check gate"}
        </Button>
      </form>
      {result && (
        <div className="flex items-center gap-3 text-sm">
          <GradeBadge grade={result.grade} />
          <span className={result.passes ? "text-green-400" : "text-red-400"}>
            meets_grade(&quot;{result.min}&quot;) → {result.passes ? "true. Clears the bar." : "false. Below the bar."}
          </span>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
