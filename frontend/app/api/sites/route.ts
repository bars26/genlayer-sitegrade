import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

/**
 * Server-side snapshot of every site, cached at the CDN.
 *
 * GenLayer Studio rate-limits per IP, and contract reads (`gen_call`) share the
 * 30-per-minute "standard" bucket with `eth_sendRawTransaction`. Reading 24+ sites
 * from the visitor's browser on every page load used most of that budget, so the
 * visitor's next write was rejected with "Request is being rate limited". Reading
 * here instead leaves the whole browser budget for the visitor's own transactions.
 */

export const dynamic = "force-dynamic";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
const RPC = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://studio.genlayer.com/api";

type Snapshot = { sites: unknown[]; failedIds: string[]; fetchedAt: string };
let memo: { at: number; data: Snapshot } | null = null;
const MEMO_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function read<T>(client: any, functionName: string, args: unknown[]): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return (await client.readContract({ address: CONTRACT, functionName, args })) as T;
    } catch (err) {
      last = err;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw last;
}

function toJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? Number(v) : v instanceof Map ? Object.fromEntries(v) : v)));
}

async function load(): Promise<Snapshot> {
  const client: any = createClient({ chain: studionet, endpoint: RPC } as any);
  const ids = await read<string[]>(client, "list_sites", []);
  const sites: unknown[] = [];
  const failedIds: string[] = [];
  let next = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          sites.push(toJson(await read(client, "get_site", [id])));
        } catch {
          failedIds.push(id);
        }
      }
    })
  );
  const order = (s: any) => ids.indexOf(s?.id);
  sites.sort((a, b) => order(a) - order(b));
  return { sites, failedIds, fetchedAt: new Date().toISOString() };
}

export async function GET() {
  try {
    if (!memo || Date.now() - memo.at > MEMO_MS || memo.data.failedIds.length > 0) {
      const data = await load();
      if (!memo || data.sites.length >= memo.data.sites.length) memo = { at: Date.now(), data };
    }
    const partial = memo.data.failedIds.length > 0;
    return Response.json(memo.data, {
      headers: {
        "Cache-Control": partial
          ? "public, s-maxage=20, stale-while-revalidate=60"
          : "public, s-maxage=120, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    if (memo) {
      return Response.json(memo.data, { headers: { "Cache-Control": "public, s-maxage=20" } });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
