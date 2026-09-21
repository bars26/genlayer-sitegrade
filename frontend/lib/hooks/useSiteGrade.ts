"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import SiteGrade from "../contracts/SiteGrade";
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

/** Every site's full report. */
export function useAllSites() {
  const contract = useSiteGradeContract();

  const idsQuery = useQuery<string[], Error>({
    queryKey: ["siteIds"],
    queryFn: () => (contract ? contract.listSites() : Promise.resolve([])),
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });

  const siteQueries = useQueries({
    queries: (idsQuery.data ?? []).map((id) => ({
      queryKey: ["site", id],
      queryFn: () => contract!.getSite(id),
      enabled: !!contract,
      staleTime: 2000,
    })),
  });

  const sites: Site[] = siteQueries.map((q) => q.data).filter((s): s is Site => !!s);

  return {
    sites,
    isLoading: idsQuery.isLoading || siteQueries.some((q) => q.isLoading),
    isError: idsQuery.isError || siteQueries.some((q) => q.isError),
  };
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

/** Register a page to grade. */
export function useRegisterSite() {
  const contract = useSiteGradeContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isRegistering, setIsRegistering] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ url, feePresetLevel }: { url: string; feePresetLevel?: FeePresetLevel }) => {
      if (!contract) {
        throw new Error("Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.");
      }
      if (!address) {
        throw new Error("Wallet not connected. Please connect your wallet to register a site.");
      }
      setIsRegistering(true);
      const feePreset = await contract.estimateRegisterSiteFees(url, feePresetLevel ?? "standard");
      return contract.registerSite(url, feePreset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["siteIds"] });
      queryClient.invalidateQueries({ queryKey: ["sitesByOwner"] });
      setIsRegistering(false);
      success("Site registered!", { description: "Validators graded it once; the report appears below." });
    },
    onError: (err: any) => {
      console.error("Error registering site:", err);
      setIsRegistering(false);
      error("Failed to register site", {
        description: err?.message || "The page must answer HTTP 200 with HTML over https.",
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
      if (!contract) {
        throw new Error("Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file.");
      }
      if (!address) {
        throw new Error("Wallet not connected. Please connect your wallet to run an audit.");
      }
      setIsAuditing(true);
      setAuditingSiteId(siteId);
      return contract.auditSite(siteId);
    },
    onSuccess: (_data, siteId) => {
      queryClient.invalidateQueries({ queryKey: ["site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["siteIds"] });
      setIsAuditing(false);
      setAuditingSiteId(null);
      success("Audit complete!", { description: "Validators independently reloaded the page and reached consensus." });
    },
    onError: (err: any) => {
      console.error("Error auditing site:", err);
      setIsAuditing(false);
      setAuditingSiteId(null);
      error("Failed to audit site", { description: err?.message || "Please try again." });
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
