"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import SiteGrade from "../contracts/SiteGrade";
import { SiteGradeError, classifyError } from "../utils/errors";
import { mapWithConcurrency } from "../utils/retry";
import { startTx, updateTx } from "./useTxLog";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import type { FeePresetLevel } from "../genlayer/fees";
import { useWallet } from "../genlayer/wallet";
import { success, error, configError } from "../utils/toast";
import type { Site } from "../contracts/types";

/**
 * Hook to get the SiteGrade contract instance. Returns null if the
 * contract address is not configured. Reads work without a wallet;
 * writes (registerSite, auditSite) need one.
 */
export function useSiteGradeContract(): SiteGrade | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  return useMemo(() => {
    if (!contractAddress) {
      configError(
        "Setup Required",
        "Contract address not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.",
        { label: "Setup Guide", onClick: () => window.open("/docs/setup", "_blank") }
      );
      return null;
    }
    return new SiteGrade(contractAddress, address, studioUrl);
  }, [contractAddress, address, studioUrl]);
}

/**
 * Every site's full report.
 *
 * One query, not one per site: reads run at most 4 at a time with backoff, so loading the
 * page never bursts the shared Studio RPC (which is what triggers "Request is being rate
 * limited" on the very next write).
 */
export function useAllSites() {
  const contract = useSiteGradeContract();

  const query = useQuery<{ sites: Site[]; failedIds: string[] }, Error>({
    queryKey: ["sites"],
    queryFn: async () => {
      // Served from a CDN-cached server snapshot (app/api/sites) so page loads spend none of
      // the visitor's Studio rate-limit budget, which is shared with their transactions.
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25_000);
        const res = await fetch("/api/sites", { signal: ctrl.signal }).finally(() => clearTimeout(timer));
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(body.sites)) throw new Error(body?.error || `HTTP ${res.status}`);
        return { sites: body.sites as Site[], failedIds: (body.failedIds ?? []) as string[] };
      } catch (snapshotErr) {
        // Fallback: read the chain directly, slowly (2 at a time), tolerating individual failures.
        if (!contract) throw classifyError(snapshotErr, "read");
        const ids = await contract.listSites();
        const results = await mapWithConcurrency(ids, 2, async (id) => {
          try {
            return { id, site: await contract.getSite(id) };
          } catch {
            return { id, site: null as Site | null };
          }
        });
        return {
          sites: results.filter((r) => r.site).map((r) => r.site as Site),
          failedIds: results.filter((r) => !r.site).map((r) => r.id),
        };
      }
    },
    staleTime: 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
    enabled: !!contract,
  });

  return {
    sites: query.data?.sites ?? [],
    failedIds: query.data?.failedIds ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** After a write, read just the affected site from the chain and merge it into the cached list. */
async function mergeFreshSite(queryClient: ReturnType<typeof useQueryClient>, contract: SiteGrade, siteId: string) {
  try {
    const site = await contract.getSite(siteId);
    queryClient.setQueryData<{ sites: Site[]; failedIds: string[] }>(["sites"], (prev) => {
      const sites = prev?.sites ?? [];
      const i = sites.findIndex((s) => s.id === siteId);
      const next = i >= 0 ? sites.map((s) => (s.id === siteId ? site : s)) : [...sites, site];
      return { sites: next, failedIds: (prev?.failedIds ?? []).filter((id) => id !== siteId) };
    });
  } catch {
    // The tx is already confirmed; the next snapshot refresh will pick the change up.
  }
}

/** Site ids registered by a given address. */
export function useSitesByOwner(owner: string | null) {
  const contract = useSiteGradeContract();

  return useQuery<string[], Error>({
    queryKey: ["sitesByOwner", owner],
    queryFn: () => (contract && owner ? contract.listSitesByOwner(owner) : Promise.resolve([])),
    enabled: !!contract && !!owner,
    staleTime: 2000,
  });
}

function reportFailure(id: string, err: unknown, phase: "send" | "confirm" | "estimate" | "verify" | "read", title: string) {
  const e = classifyError(err, phase);
  updateTx(id, {
    state: "failed",
    txHash: e.txHash,
    error: { kind: e.kind, message: e.message, hint: e.hint, detail: e.detail, phase: e.phase },
  });
  error(title, {
    description: [e.message, e.hint, e.txHash ? `Tx: ${e.txHash}` : ""].filter(Boolean).join(" "),
    duration: 12000,
  });
  return e;
}

/** Register a page to grade. */
export function useRegisterSite() {
  const contract = useSiteGradeContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isRegistering, setIsRegistering] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ url, feePresetLevel }: { url: string; feePresetLevel?: FeePresetLevel }) => {
      const logId = startTx("register", url);
      setIsRegistering(true);
      try {
        if (!contract) {
          throw new SiteGradeError({
            kind: "unknown",
            phase: "send",
            message: "The contract address is not configured.",
            hint: "Set NEXT_PUBLIC_CONTRACT_ADDRESS.",
          });
        }
        if (!address) {
          throw new SiteGradeError({ kind: "wallet_missing", phase: "send", message: "No wallet is connected." });
        }

        // Keep the owner-scoped count check as a second line of defence after the receipt check.
        const before = await contract.listSitesByOwner(address);

        updateTx(logId, { state: "estimating", progress: "Dry-running the call to estimate fees..." });
        let feePreset;
        try {
          feePreset = await contract.estimateRegisterSiteFees(url, feePresetLevel ?? "standard", (m) =>
            updateTx(logId, { progress: m })
          );
        } catch (err) {
          throw classifyError(err, "estimate");
        }

        const result = await contract.registerSite(url, feePreset, (p) =>
          updateTx(logId, {
            state: p.step === "awaiting_wallet" ? "awaiting_wallet" : p.step === "accepted" ? "accepted" : "confirming",
            txHash: p.txHash,
            progress: p.message,
          })
        );
        updateTx(logId, {
          state: "confirming",
          txHash: result.txHash,
          status: result.status,
          executionResult: result.executionResult,
          progress: "Checking that the site was created...",
        });

        const after = await contract.listSitesByOwner(address);
        const created = after.find((id) => !before.includes(id));
        if (!created) {
          throw new SiteGradeError({
            kind: "accepted_no_effect",
            phase: "verify",
            txHash: result.txHash,
            message: "The transaction was ACCEPTED but no site appeared for your address.",
            hint:
              "Consensus processed the transaction but the contract stored nothing. If the list was just read from a lagging RPC node, refresh in a few seconds; otherwise the page could not be loaded by validators.",
          });
        }

        updateTx(logId, { state: "accepted", siteId: created, progress: `Site ${created} created.` });
        return { siteId: created, txHash: result.txHash };
      } catch (err) {
        reportFailure(logId, err, "verify", "Could not register site");
        throw err;
      } finally {
        setIsRegistering(false);
      }
    },
    onSuccess: ({ siteId, txHash }) => {
      if (contract) mergeFreshSite(queryClient, contract, siteId);
      queryClient.invalidateQueries({ queryKey: ["sitesByOwner"] });
      success(`Site registered as ${siteId}`, {
        description: `Validators graded it once. Tx ${txHash.slice(0, 10)}... is ACCEPTED (it finalizes after the appeal window).`,
        duration: 8000,
      });
    },
  });

  return {
    ...mutation,
    isRegistering,
    registerSite: mutation.mutate,
    registerSiteAsync: mutation.mutateAsync,
  };
}

/** Re-audit a site. Permissionless. */
export function useAuditSite() {
  const contract = useSiteGradeContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditingSiteId, setAuditingSiteId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (siteId: string) => {
      const logId = startTx("audit", siteId);
      setIsAuditing(true);
      setAuditingSiteId(siteId);
      try {
        if (!contract) {
          throw new SiteGradeError({
            kind: "unknown",
            phase: "send",
            message: "The contract address is not configured.",
            hint: "Set NEXT_PUBLIC_CONTRACT_ADDRESS.",
          });
        }
        if (!address) {
          throw new SiteGradeError({ kind: "wallet_missing", phase: "send", message: "No wallet is connected." });
        }
        const result = await contract.auditSite(siteId, (p) =>
          updateTx(logId, {
            state: p.step === "awaiting_wallet" ? "awaiting_wallet" : p.step === "accepted" ? "accepted" : p.step === "estimating" ? "estimating" : "confirming",
            txHash: p.txHash,
            progress: p.message,
          })
        );
        updateTx(logId, {
          state: "accepted",
          txHash: result.txHash,
          status: result.status,
          executionResult: result.executionResult,
          progress: "Audit stored on-chain.",
        });
        return { siteId, txHash: result.txHash };
      } catch (err) {
        reportFailure(logId, err, "send", "Could not re-audit site");
        throw err;
      } finally {
        setIsAuditing(false);
        setAuditingSiteId(null);
      }
    },
    onSuccess: ({ siteId, txHash }) => {
      if (contract) mergeFreshSite(queryClient, contract, siteId);
      success("Audit complete", {
        description: `Validators independently reloaded the page and agreed. Tx ${txHash.slice(0, 10)}... is ACCEPTED.`,
        duration: 8000,
      });
    },
  });

  return {
    ...mutation,
    isAuditing,
    auditingSiteId,
    auditSite: mutation.mutate,
    auditSiteAsync: mutation.mutateAsync,
  };
}
