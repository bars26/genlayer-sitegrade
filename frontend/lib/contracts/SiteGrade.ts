import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Grade, Site, TransactionReceipt } from "./types";
import {
  estimateWriteFeePreset,
  feePresetToTransactionFees,
  type FeePresetEstimate,
  type FeePresetLevel,
} from "../genlayer/fees";
import { SiteGradeError, classifyError, rawMessage } from "../utils/errors";
import { withBackoff } from "../utils/retry";

export type TxStep = "estimating" | "awaiting_wallet" | "submitted" | "confirming" | "retrying" | "accepted";

export interface TxProgress {
  step: TxStep;
  txHash?: string;
  message?: string;
}

export interface TxResult {
  txHash: string;
  /** Consensus status of the transaction, e.g. ACCEPTED. */
  status: string;
  /** What the contract itself did: SUCCESS or ERROR (a revert can still leave the tx ACCEPTED). */
  executionResult: string;
  receipt: TransactionReceipt;
}

/** Pull the contract-execution outcome out of a consensus receipt. */
export function executionOutcome(receipt: any): { result: string; message: string } {
  const lr = receipt?.consensus_data?.leader_receipt;
  const first = Array.isArray(lr) ? lr[0] : lr;
  const result = String(first?.execution_result ?? receipt?.execution_result ?? "UNKNOWN");
  const g = first?.genvm_result ?? {};
  const message = [g.error_description, g.stderr, Array.isArray(g.raw_error?.causes) ? g.raw_error.causes.join(",") : ""]
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .join(" | ");
  return { result, message };
}

/**
 * SiteGrade contract class: on-chain frontend hygiene grades (security
 * headers + accessibility) decided by validator consensus.
 *
 * Every failure is thrown as a SiteGradeError that names the phase it happened
 * in (read / estimate / send / confirm) and preserves the underlying error.
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

  /** A contract read with backoff on RPC rate limits. */
  private read<T>(functionName: string, args: unknown[]): Promise<T> {
    return withBackoff(
      () => this.client.readContract({ address: this.contractAddress, functionName, args }) as Promise<T>,
      { phase: "read", attempts: 5 }
    );
  }

  async estimateRegisterSiteFees(url: string, level: FeePresetLevel = "standard", onRetry?: (m: string) => void) {
    return this.estimate("register_site", [url], level, onRetry);
  }

  async estimateAuditSiteFees(siteId: string, level: FeePresetLevel = "standard", onRetry?: (m: string) => void) {
    return this.estimate("audit_site", [siteId], level, onRetry);
  }

  private estimate(functionName: string, args: unknown[], level: FeePresetLevel, onRetry?: (m: string) => void) {
    return withBackoff(
      () => estimateWriteFeePreset(this.client, { address: this.contractAddress, functionName, args }, level),
      {
        phase: "estimate",
        onRetry: (i) => onRetry?.(`RPC busy (${i.reason}); retrying ${i.attempt}/${i.attempts - 1} in ${Math.round(i.waitMs / 1000)}s`),
      }
    );
  }

  /** Every registered site id. */
  async listSites(): Promise<string[]> {
    const ids = await this.read<string[]>("list_sites", []);
    return Array.isArray(ids) ? ids : [];
  }

  /** Site ids registered by a given address. */
  async listSitesByOwner(owner: string): Promise<string[]> {
    const ids = await this.read<string[]>("list_sites_by_owner", [owner]);
    return Array.isArray(ids) ? ids : [];
  }

  /** One site's full report. */
  async getSite(siteId: string): Promise<Site> {
    return this.read<Site>("get_site", [siteId]);
  }

  /** The gate a grant program, directory or wallet would apply. */
  async meetsGrade(siteId: string, minGrade: Grade): Promise<boolean> {
    return Boolean(await this.read<boolean>("meets_grade", [siteId, minGrade]));
  }

  async getGrade(siteId: string): Promise<Grade> {
    return String(await this.read<string>("get_grade", [siteId])) as Grade;
  }

  /** Current consensus status of any transaction (PENDING ... ACCEPTED ... FINALIZED). */
  async getTransactionStatus(txHash: string): Promise<string> {
    const tx: any = await withBackoff(() => this.client.getTransaction({ hash: txHash as `0x${string}` }), {
      phase: "read",
    });
    return String(tx?.statusName ?? tx?.status_name ?? tx?.status ?? "UNKNOWN");
  }

  /** Register a page. Validators load it once; pages that do not answer HTTP 200 with HTML are rejected. */
  async registerSite(
    url: string,
    feePreset?: FeePresetEstimate,
    onProgress?: (p: TxProgress) => void
  ): Promise<TxResult> {
    return this.write("register_site", [url], feePreset, onProgress);
  }

  /** Re-audit a site. Anyone can call this. */
  async auditSite(siteId: string, onProgress?: (p: TxProgress) => void): Promise<TxResult> {
    const feePreset = await this.estimateAuditSiteFees(siteId, "standard", (message) =>
      onProgress?.({ step: "retrying", message })
    );
    return this.write("audit_site", [siteId], feePreset, onProgress);
  }

  /**
   * Send a write and wait for consensus. Sending is never auto-retried (each attempt would
   * re-prompt the wallet); polling for the receipt is, because the hash is already known.
   */
  private async write(
    functionName: string,
    args: unknown[],
    feePreset: FeePresetEstimate | undefined,
    onProgress?: (p: TxProgress) => void
  ): Promise<TxResult> {
    const fees = feePresetToTransactionFees(feePreset);

    onProgress?.({ step: "awaiting_wallet", message: "Approve the transaction in your wallet." });
    let txHash: string;
    try {
      txHash = (await this.client.writeContract({
        address: this.contractAddress,
        functionName,
        args,
        value: BigInt(0),
        ...(fees ? { fees } : {}),
      })) as string;
    } catch (err) {
      throw classifyError(err, "send");
    }
    onProgress?.({ step: "submitted", txHash, message: "Transaction sent. Waiting for validators." });

    let receipt: any;
    try {
      receipt = await withBackoff(
        () =>
          this.client.waitForTransactionReceipt({
            hash: txHash,
            status: "ACCEPTED" as any,
            retries: 24,
            interval: 5000,
          }),
        {
          phase: "confirm",
          onRetry: (i) =>
            onProgress?.({
              step: "retrying",
              txHash,
              message: `RPC busy while confirming; retrying ${i.attempt}/${i.attempts - 1} in ${Math.round(i.waitMs / 1000)}s`,
            }),
        }
      );
    } catch (err) {
      throw classifyError(err, "confirm", txHash);
    }

    const status = String(receipt?.statusName ?? receipt?.status_name ?? "ACCEPTED");
    const outcome = executionOutcome(receipt);
    onProgress?.({ step: "accepted", txHash, message: `Consensus status: ${status}` });

    // ACCEPTED means the network processed the transaction; it does not mean the contract call succeeded.
    if (outcome.result === "ERROR") {
      throw new SiteGradeError({
        kind: "accepted_no_effect",
        phase: "verify",
        txHash,
        message:
          functionName === "register_site"
            ? "The transaction was ACCEPTED, but the contract rejected the call, so no site was created."
            : "The transaction was ACCEPTED, but the contract rejected the call, so nothing changed.",
        hint:
          functionName === "register_site"
            ? "register_site reverts when validators cannot load the page: it must answer HTTP 200 with HTML over https and must not block automated requests (large sites often do)."
            : "The site may not exist, or validators could not reach the page.",
        detail: outcome.message || rawMessage(receipt?.result) || "execution_result: ERROR",
      });
    }

    return { txHash, status, executionResult: outcome.result, receipt: receipt as TransactionReceipt };
  }
}

export default SiteGrade;
