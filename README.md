# AgentLedger — Owner Console for Agent Budgets & Payment Audit

> AI³ Growth Hackathon · Track: **Kite — Make It Agent-Payable** · Reference project #6: *"budget management + billing + audit tooling for agent owners"*

**AgentLedger** is the owner-side console for people who run a fleet of AI agents: one dashboard showing every agent's **Passport identity, authorized budget, live spend, merged payment timeline** — with anomaly flags and one-click **freeze / raise-budget** controls.

一句话:"养了一堆 agent 的所有者"的统一管理台 — 名下 agent 的身份/额度/消耗曲线/每笔流水,一键调额/冻结,异常标红。

## Live demo

**https://ww.storyard.ai:8443/agentledger/** — supervising two live sister agents:

- **QuantScout** (buyer) — autonomous quant-research agent spending its budget on market data
- **PayGen** (merchant) — pay-per-call AI creation service earning per request

Run a research round in QuantScout or buy an image in PayGen, then watch the ledger and spend timeline update here in real time. **The flows are real runtime data, not fixtures.**

## Features

| Feature | Detail |
|---|---|
| Agent cards | identity (agent_id/owner), session id & status, budget bar (buyer) / income (merchant) |
| Merged ledger | both agents' payments in one time-ordered table (方向: 付→ / 收←) |
| Spend timeline | cumulative spend sparkline across all agents |
| Anomaly rules | single tx ≥ $0.5 → `large-tx`; ≥3 tx within 60s per agent → `high-freq` |
| Controls | freeze / unfreeze an agent, +$1 budget raise (owner policy overlay) |

## Honest scope notes

- Data is aggregated server-side from the two live services (`/api/state`, `/ledger`) — real runtime flows.
- Freeze/raise act on AgentLedger's **owner policy overlay** (demo level). On the real Kite rails these map to session lifecycle operations (revoke / re-create with new limits via passkey approval) — Kite CLI v1.8 exposes no third-party freeze API, which is itself a finding from building on the real stack.
- With `LIVE_KITE=1` on a machine with a logged-in `kpass`, it also pulls the owner's real Kite dev-testnet identity and session count.

## Run

```bash
QS_URL=http://127.0.0.1:4021 PG_URL=http://127.0.0.1:4030 PORT=4040 node server.mjs
open http://localhost:4040
```

Zero npm dependencies. Node ≥ 20.

## Sister projects

- **QuantScout** (A1, flagship) — identity + authorization + payment + audit, end to end
- **PayGen** (A2) — MCP + x402 pay-per-call creation merchant

---
*Team BigApple · AI³ Growth Hackathon 2026 · Kite track*
