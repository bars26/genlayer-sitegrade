# Reproducing SiteGrade from the live UI

Everything below can be checked without trusting this document: the transaction hashes are on the public
Studio explorer, and the contract views can be called from the CLI.

- **Live UI:** https://sitegrade-bars26.vercel.app
- **Contract:** [`0x95BF6dc4Ef493eacC002fEA5E792bf9b925525bB`](https://explorer-studio.genlayer.com/address/0x95BF6dc4Ef493eacC002fEA5E792bf9b925525bB) on GenLayer Studio (chain id 61999, RPC `https://studio.genlayer.com/api`)

## 1. The production build points at the submitted contract and network

The address and chain id are inlined into the production JavaScript at build time, so this can be verified from the outside:

```shell
curl -s https://sitegrade-bars26.vercel.app/ -o index.html
grep -o '/_next/static/[^"]*\.js' index.html | sort -u | while read p; do curl -s "https://sitegrade-bars26.vercel.app$p"; done \
  | grep -o '0x95BF6dc4Ef493eacC002fEA5E792bf9b925525bB\|61999\|studio.genlayer.com/api' | sort | uniq -c
```

Checked on 2026-09-25: the bundle contains the exact contract address, chain id `61999` and the Studio RPC URL.

## 2. Register, re-audit, `get_grade`, `meets_grade` from the live UI

Needs MetaMask on GenLayer Studio (chain id 61999). The read-only steps 3 and 4 need no wallet.

| # | In the UI | What happens | How to check it independently |
|---|---|---|---|
| 1 | Connect the wallet, click **Grade a Site**, paste an https URL, **Register & Grade** | Fee dry-run, MetaMask prompt, validators each load the page. The **Your transactions** card shows the tx hash and status; on success a toast names the new `site_N`. | `genlayer call <contract> get_site --args site_N` |
| 2 | Click **Re-audit** on any row | A second consensus audit runs; the row's grade and the 10-entry history update. | `genlayer call <contract> get_history --args site_N` |
| 3 | **Integrator gate**, enter `site_4`, min grade `A`, **Check gate** | Shows the grade and `meets_grade("A") → true` (SiteGrade's own dashboard grades A/A). | `genlayer call <contract> get_grade --args site_4` then `genlayer call <contract> meets_grade --args site_4 A` |
| 4 | Expand any row | Per-check results and fix hints. | The row is `get_site` rendered. |

## 3. Evidence: transactions sent from the production UI

These 23 `register_site` transactions were sent by the project owner's MetaMask wallet
(`0x4f80b5c475fced34fc9a07ffccf39e1adc1406bf`) from the production frontend on 2026-09-22. All are FINALIZED.
19 succeeded (a site was created); 4 were rejected by the contract.

| Time (UTC) | Call | Target | Tx | Consensus | Contract result |
|---|---|---|---|---|---|
| 2026-09-22 06:19 | `register_site` | https://portal.genlayer.foundation | [`0x6f55f629...7180da`](https://explorer-studio.genlayer.com/tx/0x6f55f6296858a8cda3596ffe947166be2dd11d20e2603c8fc6fd9919e37180da) | FINALIZED | SUCCESS |
| 2026-09-22 06:22 | `register_site` | https://skynet.certik.com | [`0x546fc269...f17174`](https://explorer-studio.genlayer.com/tx/0x546fc269062486c8f0d1c5160667833e803123c8adad1a7414bc317283f17174) | FINALIZED | SUCCESS |
| 2026-09-22 06:25 | `register_site` | https://app.uniswap.org | [`0xf87404fa...92ebef`](https://explorer-studio.genlayer.com/tx/0xf87404fab50d8ae96a25d2fb4999e222325f9c01d67d1b811e2ece599e92ebef) | FINALIZED | SUCCESS |
| 2026-09-22 06:26 | `register_site` | https://www.coinbase.com | [`0xe9e68346...02c92d`](https://explorer-studio.genlayer.com/tx/0xe9e683467bfbedd7dd0dc15606f4c060e4d702ab332ae8362da502ea3e02c92d) | FINALIZED | ERROR |
| 2026-09-22 06:28 | `register_site` | https://www.coinbase.com | [`0x8ae8b319...f775a3`](https://explorer-studio.genlayer.com/tx/0x8ae8b319991a144faeb6aa4f0719c0d4eed4c64df3e6b5ac4105256851f775a3) | FINALIZED | ERROR |
| 2026-09-22 07:01 | `register_site` | https://www.coinbase.com | [`0x5b50836e...405be9`](https://explorer-studio.genlayer.com/tx/0x5b50836eab3e2ad35923a0f17af8edba7b1e67c22eff0f8a6fe10992b9405be9) | FINALIZED | ERROR |
| 2026-09-22 07:02 | `register_site` | https://opensea.io | [`0xe6a8de6b...569563`](https://explorer-studio.genlayer.com/tx/0xe6a8de6b1dba194486ff38f7361f82c6894bcf206e2ecd0a44ea1b2a78569563) | FINALIZED | SUCCESS |
| 2026-09-22 07:03 | `register_site` | https://optimism.io | [`0x43e208f6...2135f1`](https://explorer-studio.genlayer.com/tx/0x43e208f62eee15f6c3eca16f9f56323126726d7329cf691867367ab05a2135f1) | FINALIZED | SUCCESS |
| 2026-09-22 07:05 | `register_site` | https://www.circle.com | [`0x17bf125d...7e31a3`](https://explorer-studio.genlayer.com/tx/0x17bf125d57b0e9fc413066beb96209524096c36557f6a930f37ba89c6a7e31a3) | FINALIZED | SUCCESS |
| 2026-09-22 07:06 | `register_site` | https://www.arc.io | [`0x950f701d...b1c077`](https://explorer-studio.genlayer.com/tx/0x950f701d57d5847fdcfd8828b39513d7bd3786b0f18845ef6d8c436ce4b1c077) | FINALIZED | SUCCESS |
| 2026-09-22 07:07 | `register_site` | https://www.nvidia.com | [`0xa997f523...851fa6`](https://explorer-studio.genlayer.com/tx/0xa997f5232b8362ee2ade88699995bf49a4578a5247cb3c52057c649014851fa6) | FINALIZED | SUCCESS |
| 2026-09-22 07:08 | `register_site` | https://www.spacex.com | [`0x48bac898...0d38fb`](https://explorer-studio.genlayer.com/tx/0x48bac898f2ae2e4ffe157f5027d90c4810f85f1d78b3a953405218d9a30d38fb) | FINALIZED | SUCCESS |
| 2026-09-22 07:10 | `register_site` | https://omni.variational.io | [`0x7303cb90...6eaf55`](https://explorer-studio.genlayer.com/tx/0x7303cb904a1562ce5f46af656af4ec55bd80c4d10dcc3e8c3c6b925e9d6eaf55) | FINALIZED | SUCCESS |
| 2026-09-22 07:12 | `register_site` | https://www.bittensor.com | [`0x1a827a04...aca4ef`](https://explorer-studio.genlayer.com/tx/0x1a827a04d41b9e6c305eab4ea21659b5c0479c5dfa35ce73c93a5579c7aca4ef) | FINALIZED | SUCCESS |
| 2026-09-22 07:15 | `register_site` | https://www.google.com | [`0x9a4719fe...8cd110`](https://explorer-studio.genlayer.com/tx/0x9a4719fe82d3931a98dd045144f9c1a732822d56fb3d0523339391dc158cd110) | FINALIZED | SUCCESS |
| 2026-09-22 07:15 | `register_site` | https://app.arcus.xyz | [`0x3fa1e6dd...1441a9`](https://explorer-studio.genlayer.com/tx/0x3fa1e6dd0268de10f4d5df603266f35bb4151d7a66591edd4e48f725961441a9) | FINALIZED | SUCCESS |
| 2026-09-22 07:16 | `register_site` | https://x.com | [`0x3341787c...04fff1`](https://explorer-studio.genlayer.com/tx/0x3341787ce79e1401e224bd336115645c3c62f274932d0d51a5f914d09f04fff1) | FINALIZED | SUCCESS |
| 2026-09-22 07:18 | `register_site` | https://app.virtuals.io | [`0x46523bad...582f45`](https://explorer-studio.genlayer.com/tx/0x46523badfb83bae656fad0bbccec75ebdc008c3a514b28e4e07662a1a0582f45) | FINALIZED | SUCCESS |
| 2026-09-22 07:20 | `register_site` | https://eth.blockscout.com | [`0xf8df6b46...2367fe`](https://explorer-studio.genlayer.com/tx/0xf8df6b463f1be3c72fcf42c0e2cf217ef94fc5e775b25b5fedffdd6b092367fe) | FINALIZED | SUCCESS |
| 2026-09-22 07:24 | `register_site` | https://timecapsule-base.vercel.app | [`0xe15f93f1...e8c2a0`](https://explorer-studio.genlayer.com/tx/0xe15f93f1610cb35b193dd398c5d96d47a6e19f739839af4fc92e2d429ce8c2a0) | FINALIZED | SUCCESS |
| 2026-09-22 07:26 | `register_site` | https://dexscreener.com | [`0x3e1517b3...b96245`](https://explorer-studio.genlayer.com/tx/0x3e1517b33c6932c8d71982fd01ce7aef5a810fd9bc86f8d28b95f39586b96245) | FINALIZED | ERROR |
| 2026-09-22 07:30 | `register_site` | https://bitcoin.org | [`0x0944aa49...348762`](https://explorer-studio.genlayer.com/tx/0x0944aa496953ca32f9470ba7a268f189f690d5bd524a782f6c0d1e2676348762) | FINALIZED | SUCCESS |
| 2026-09-22 07:31 | `register_site` | https://ethereum.org | [`0x350af274...3de0b9`](https://explorer-studio.genlayer.com/tx/0x350af274138edbfcdd4fc91825bbe7f87f1c17edb3581b5697b37a0b363de0b9) | FINALIZED | SUCCESS |

A re-audit transaction (`audit_site`) on this contract, FINALIZED with a SUCCESS result:

| Time (UTC) | Call | Target | Tx | Consensus | Contract result |
|---|---|---|---|---|---|
| 2026-09-22 06:08 | `audit_site` | site_3 | [`0x469f4a2d...6c75ec`](https://explorer-studio.genlayer.com/tx/0x469f4a2d1d64a123a8fadd52b1173841177ff7836102b87842c4b7e9ba6c75ec) | FINALIZED | SUCCESS |

## 4. "Accepted" is not the same as "it worked"

The 4 rows above with contract result `ERROR` are real examples of a transaction that consensus processed
(and even finalized) but whose contract call reverted, so **no site was created**:

- `https://www.coinbase.com`: [`0xe9e68346...`](https://explorer-studio.genlayer.com/tx/0xe9e683467bfbedd7dd0dc15606f4c060e4d702ab332ae8362da502ea3e02c92d)
- `https://www.coinbase.com`: [`0x8ae8b319...`](https://explorer-studio.genlayer.com/tx/0x8ae8b319991a144faeb6aa4f0719c0d4eed4c64df3e6b5ac4105256851f775a3)
- `https://www.coinbase.com`: [`0x5b50836e...`](https://explorer-studio.genlayer.com/tx/0x5b50836eab3e2ad35923a0f17af8edba7b1e67c22eff0f8a6fe10992b9405be9)
- `https://dexscreener.com`: [`0x3e1517b3...`](https://explorer-studio.genlayer.com/tx/0x3e1517b33c6932c8d71982fd01ce7aef5a810fd9bc86f8d28b95f39586b96245)

`register_site` deliberately reverts when validators cannot load the page (it must answer HTTP 200 with HTML over
https). Large sites such as Coinbase and DexScreener block automated requests, so validators cannot load them.

The frontend used to report success for these. It now:

1. Dry-runs the call before sending. If the contract already rejects the dry-run, nothing is sent and the UI says the page could not be loaded.
2. Reads `execution_result` from the consensus receipt. If it is `ERROR` the UI says the transaction was ACCEPTED but the
   contract rejected the call, shows the hash, and preserves the underlying error text.
3. Still checks `list_sites_by_owner` afterwards as a second line of defence, and explains the case where the count did not grow.

## 5. The "Request is being rate limited" error

A reviewer saw `eth_sendRawTransaction` fail with *Request is being rate limited* in the browser console while the UI only
said "Failed to register site".

- **What it is.** A rate-limit response from the shared, public GenLayer Studio RPC. The RPC returns it *before* a transaction
  exists, so it leaves nothing on chain, and it cannot be reproduced on demand. All 23 sends from the live UI on 2026-09-22 got through.
  It is a transient throttle on the shared endpoint, not a problem with the contract address or the network configuration (section 1).
- **A contributing factor on our side, now fixed.** The previous build read every site with its own request, all fired at the same time
  (24 RPC calls on each page load). Since the wallet's RPC and the page's reads share the same throttle, a burst of reads makes
  a rate limit on the next write more likely. Reads now go through one query that runs at most 4 requests at a time
  (24 requests spread over about 7 seconds), with a 30 second cache and no refetch on window focus.
- **Retry policy.** Reads, fee estimation and receipt polling retry with exponential backoff and jitter (up to 4 attempts) on
  rate limits and unreachable-RPC responses, and the UI says when it is retrying. **Sending is never auto-retried**: each attempt would
  prompt the wallet again. A rate-limited send shows the guidance to wait about 30 seconds and click again.

## 6. Distinct, readable errors

Every failure names the phase it happened in and keeps the raw underlying error behind an "Underlying error" disclosure.

| Kind | Shown when | Retried automatically |
|---|---|---|
| `wallet_missing` | No wallet connected | no |
| `wallet_rejected` | You dismissed the MetaMask prompt (code 4001) | no |
| `wrong_network` | Wallet is not on GenLayer Studio | no |
| `rate_limited` | RPC answers with a rate-limit error | reads, estimates and polling: yes |
| `rpc_unreachable` | RPC returns an HTML error page or nothing | reads, estimates and polling: yes |
| `fee_estimation` | The fee dry-run fails for another reason | no |
| `contract_revert` | The dry-run is rejected by the contract (page could not be loaded) | no |
| `accepted_no_effect` | Tx ACCEPTED but the contract result is `ERROR`, or no site appeared | no |
| `timeout` | No consensus within about 2 minutes; the tx hash is kept so it can be checked later | polling: yes |
| `unknown` | Anything else, with the raw error shown | no |

After every write, **Your transactions** shows the hash (copy and explorer link), the consensus status, the contract result
(`SUCCESS` or `ERROR`), and a **Check finality** button. `ACCEPTED` already means reads reflect the change;
it becomes `FINALIZED` once the appeal window closes.
