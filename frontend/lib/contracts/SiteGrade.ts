import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Grade, Site, TransactionReceipt } from "./types";
import {
  estimateWriteFeePreset,
  feePresetToTransactionFees,
  type FeePresetEstimate,
  type FeePresetLevel,
} from "../genlayer/fees";

/**
 * SiteGrade contract class: on-chain frontend hygiene grades (security
 * headers + accessibility) decided by validator consensus.
 */
class SiteGrade {
  private contractAddress: `0x${string}`;
  private client: any;
  private studioUrl?: string;

  constructor(contractAddress: string, address?: string | null, studioUrl?: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.studioUrl = studioUrl;

    const config: any = { chain: studionet };
    if (address) config.account = address as `0x${string}`;
    if (studioUrl) config.endpoint = studioUrl;

    this.client = createClient(config);
  }

  updateAccount(address: string): void {
    const config: any = { chain: studionet, account: address as `0x${string}` };
    if (this.studioUrl) config.endpoint = this.studioUrl;
    this.client = createClient(config);
  }

  async estimateRegisterSiteFees(url: string, level: FeePresetLevel = "standard"): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      { address: this.contractAddress, functionName: "register_site", args: [url] },
      level
    );
  }

  async estimateAuditSiteFees(siteId: string, level: FeePresetLevel = "standard"): Promise<FeePresetEstimate | undefined> {
    return estimateWriteFeePreset(
      this.client,
      { address: this.contractAddress, functionName: "audit_site", args: [siteId] },
      level
    );
  }

  /** Every registered site id. */
  async listSites(): Promise<string[]> {
    try {
      const ids: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "list_sites",
        args: [],
      });
      return Array.isArray(ids) ? (ids as string[]) : [];
    } catch (err) {
      console.error("Error fetching sites:", err);
      throw new Error("Failed to fetch sites from contract");
    }
  }

  /** Site ids registered by a given address. */
  async listSitesByOwner(owner: string): Promise<string[]> {
    try {
      const ids: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "list_sites_by_owner",
        args: [owner],
      });
      return Array.isArray(ids) ? (ids as string[]) : [];
    } catch (err) {
      console.error("Error fetching sites for owner:", err);
      throw new Error("Failed to fetch sites for this owner");
    }
  }

  /** One site's full report. */
  async getSite(siteId: string): Promise<Site> {
    const site = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_site",
      args: [siteId],
    });
    return site as Site;
  }

  /** The gate a grant program, directory or wallet would apply. */
  async meetsGrade(siteId: string, minGrade: Grade): Promise<boolean> {
    const ok = await this.client.readContract({
      address: this.contractAddress,
      functionName: "meets_grade",
      args: [siteId, minGrade],
    });
    return Boolean(ok);
  }

  async getGrade(siteId: string): Promise<Grade> {
    const grade: any = await this.client.readContract({
      address: this.contractAddress,
      functionName: "get_grade",
      args: [siteId],
    });
    return String(grade) as Grade;
  }

  /** Register a page. Validators load it once; pages that do not answer HTTP 200 with HTML are rejected. */
  async registerSite(url: string, feePreset?: FeePresetEstimate): Promise<TransactionReceipt> {
    try {
      const fees = feePresetToTransactionFees(feePreset);
      const txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName: "register_site",
        args: [url],
        value: BigInt(0),
        ...(fees ? { fees } : {}),
      });

      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      return receipt as TransactionReceipt;
    } catch (err) {
      console.error("Error registering site:", err);
      throw new Error("Failed to register site");
    }
  }

  /** Re-audit a site. Anyone can call this. */
  async auditSite(siteId: string): Promise<TransactionReceipt> {
    try {
      const feePreset = await this.estimateAuditSiteFees(siteId);
      const fees = feePresetToTransactionFees(feePreset);
      const txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName: "audit_site",
        args: [siteId],
        value: BigInt(0),
        ...(fees ? { fees } : {}),
      });

      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      return receipt as TransactionReceipt;
    } catch (err) {
      console.error("Error auditing site:", err);
      throw new Error("Failed to audit site");
    }
  }
}

export default SiteGrade;
