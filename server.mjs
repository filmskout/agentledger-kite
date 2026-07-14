/**
 * AgentLedger — agent 支付额度管理与审计看板(Kite track A3)
 * 面向"养了一堆 agent 的所有者":统一查看名下 agent、授权额度、消耗、每笔流水,可调额/冻结。
 *
 * 数据源(同机聚合,真实流水):
 *   - QuantScout  http://127.0.0.1:4021/api/state   (买家 agent:身份/session/流水)
 *   - PayGen      http://127.0.0.1:4030/ledger      (商户侧:收款流水)
 *   - Kite dev testnet(可选,LIVE_KITE=1 且已 kpass 登录时):user agents / sessions
 *
 * 控制面:调额/冻结写在本服务的 policy 覆盖层(对 QuantScout 的下一次研究生效需其读取;
 * 演示级 — 真实链路上这两个操作对应 kpass session 的重建/过期,README 已说明)。
 * 用法: PORT=4040 node server.mjs
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4040;
const QS = process.env.QS_URL || "http://127.0.0.1:4021";
const PG = process.env.PG_URL || "http://127.0.0.1:4030";
const LIVE_KITE = process.env.LIVE_KITE === "1";

const policy = { // 所有者控制面(覆盖层)
  "quant-research-agent": { frozen: false, extraBudget: 0 },
  "paygen-merchant": { frozen: false, extraBudget: 0 },
};

function kpass(args) {
  return new Promise((resolve) => {
    execFile("kpass", [...args, "--output", "json", "--no-interactive"],
      { env: { ...process.env, KITE_PASSPORT_BASE_URL: "https://passport.dev.gokite.ai", PATH: process.env.PATH + ":" + process.env.HOME + "/.kpass/bin" }, cwd: process.env.HOME, timeout: 60_000 },
      (err, stdout) => { try { resolve(JSON.parse(stdout)); } catch { resolve(null); } });
  });
}
async function jfetch(url) { try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return await r.json(); } catch { return null; } }

async function aggregate() {
  const [qs, pgLedger, pgHealth] = await Promise.all([jfetch(QS + "/api/state"), jfetch(PG + "/ledger"), jfetch(PG + "/health")]);
  const kite = LIVE_KITE ? { me: await kpass(["me"]), sessions: await kpass(["user", "sessions"]) } : null;

  const agents = [];
  if (qs) {
    const spent = qs.budget.spent, total = qs.budget.total + (policy["quant-research-agent"].extraBudget || 0);
    agents.push({
      key: "quant-research-agent", name: "QuantScout", role: "buyer(研究 agent)",
      agentId: qs.identity?.agents?.[0]?.id || "-", owner: qs.identity?.user?.email || "-",
      sessionId: qs.session?.id || "-", sessionStatus: policy["quant-research-agent"].frozen ? "FROZEN(owner)" : (qs.session?.status || "-"),
      budgetTotal: total, spent, todaySpend: spent,
      ledger: (qs.ledger || []).map((l) => ({ ...l, agent: "QuantScout", dir: "out" })),
      url: "/quantscout/",
    });
  }
  if (pgLedger) {
    const income = (pgLedger.ledger || []).reduce((a, l) => a + parseFloat(l.amount), 0);
    agents.push({
      key: "paygen-merchant", name: "PayGen", role: "merchant(创作商户)",
      agentId: "merchant:" + (pgHealth?.service || "paygen"), owner: "ken.y.law@gmail.com",
      sessionId: "x402 " + (pgHealth?.network || ""), sessionStatus: policy["paygen-merchant"].frozen ? "FROZEN(owner)" : "active",
      budgetTotal: null, spent: null, income: +income.toFixed(2), todaySpend: 0,
      ledger: (pgLedger.ledger || []).map((l) => ({ ts: l.ts, seq: l.seq, purpose: `${l.tool} ← ${(l.payer||"").slice(0,10)}`, amount: l.amount, tx: l.tx, simulated: l.simulated, status: l.status, agent: "PayGen", dir: "in" })),
      url: "/paygen/",
    });
  }
  // 合并流水,时间序
  const all = agents.flatMap((a) => a.ledger).sort((x, y) => x.ts - y.ts);
  // 异常规则(纯前端逻辑级):单笔 ≥ $0.5 标红;60s 内同 agent ≥ 3 笔标频次异常
  const flagged = all.map((l, i) => {
    const win = all.filter((x) => x.agent === l.agent && x.ts >= l.ts - 60_000 && x.ts <= l.ts);
    return { ...l, flags: [ ...(parseFloat(l.amount) >= 0.5 ? ["large-tx"] : []), ...(win.length >= 3 ? ["high-freq"] : []) ] };
  });
  return { agents, ledger: flagged, policy, kite: kite?.me ? { user: kite.me.email, sessions: (kite.sessions?.sessions || []).length } : null, ts: Date.now() };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (u.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(readFileSync(path.join(__dirname, "public", "index.html"))); }
  if (u.pathname === "/hero.jpg") { res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public,max-age=86400" }); return res.end(readFileSync(path.join(__dirname, "public", "hero.jpg"))); }
  if (u.pathname === "/health") return send(200, { ok: true, service: "agentledger" });
  if (u.pathname === "/api/overview") return send(200, await aggregate());
  if (u.pathname === "/api/control" && req.method === "POST") {
    const agent = u.searchParams.get("agent"), action = u.searchParams.get("action");
    if (!policy[agent]) return send(404, { error: "unknown agent" });
    if (action === "freeze") policy[agent].frozen = true;
    else if (action === "unfreeze") policy[agent].frozen = false;
    else if (action === "raise") policy[agent].extraBudget = (policy[agent].extraBudget || 0) + 1;
    else return send(400, { error: "unknown action" });
    return send(200, { ok: true, policy: policy[agent] });
  }
  send(404, { error: "not found" });
});
server.listen(PORT, () => console.log(`AgentLedger on :${PORT}`));
