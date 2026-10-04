import { CONFIG } from "./config.js";
import { $, esc, chrome, api, logoHtml, usd, weiToEth, ago, short, clipHtml, wireClips, amount, baseToUnit, txLink, addrLink, tradeLink, chainName } from "./ui.js";
import { vaultAbi, erc20Abi } from "./abi.js";
import { encodeFunctionData, decodeFunctionResult } from "./vendor/viem.js";
import * as wallet from "./wallet.js";
import * as solwallet from "./solwallet.js";

chrome("explore");

const token = new URLSearchParams(location.search).get("t") ?? "";
let entries = [];
let lastAt = 0;
let show = "all";
let coin = null;

const KIND_LABEL = {
  thought: "Thought", made: "Made", action: "Move", blocked: "Blocked", fees: "Fees", wake: "Woke",
  born: "Born", mission: "Mission", memory: "Memory", sleep: "Sleep", halted: "Halted", resumed: "Resumed",
  x: "On X", advice: "Advice", request: "Request", video: "Video", video_wait: "Waiting", video_failed: "Not made",
};
const SAYS = new Set(["thought", "made", "mission", "memory", "x", "advice", "video"]);
const ACTS = new Set(["action", "blocked", "fees", "wake", "halted", "resumed", "born", "request", "video_wait", "video_failed"]);

function statusPill(st) {
  if (!st) return "";
  const cls = st === "on chain" ? "ok" : st === "refused" ? "bad" : "wait";
  return `<span class="st ${cls}">${esc(st)}</span>`;
}

function item(e) {
  const when = `<span class="t">${ago(e.at)}</span>`;
  const head = `<div class="k ${esc(e.kind)}">${esc(KIND_LABEL[e.kind] ?? e.kind)}${when}</div>`;
  let body = "";
  const corr = e.correction ? `<p class="corr">${esc(e.correction)}</p>` : "";
  switch (e.kind) {
    case "thought":
    case "memory":
      body = `<p class="say">${esc(e.text)}</p>${corr}`;
      break;
    case "mission":
      body = `<p class="say">${esc(e.text)}</p>`;
      break;
    case "made":
      if (e.type === "image") {
        const src = e.url?.startsWith("/media/") ? CONFIG.api + e.url : "";
        body = `${src ? `<img class="made" src="${esc(src)}" alt="${esc(e.caption ?? "")}" loading="lazy">` : ""}${e.caption ? `<p class="say" style="margin-top:8px">${esc(e.caption)}</p>` : ""}`;
      } else {
        body = `<p class="lore-t">${esc(e.title ?? "Lore")}</p><p class="say">${esc(e.text)}</p>${corr}`;
      }
      break;
    case "x":
      if (e.status === "posted") body = `<p class="say">${esc(e.text)}</p>${e.url ? `<a class="tx" href="${esc(e.url)}" target="_blank" rel="noopener">View on X →</a>` : ""}`;
      else if (e.status === "queued") body = `<p class="say">${esc(e.text)}</p><p class="why">Waiting to post to X.</p>`;
      else body = `<p class="sys">${esc(cap(e.text))}</p>`;
      break;
    case "advice":
      body = `<p class="sys">Asked: ${esc(e.question)}</p><p class="say" style="margin-top:6px">${esc(e.answer)}</p>`;
      break;
    case "action":
      body = `<p class="sys">${esc(cap(e.summary))}${statusPill(e.status)}</p>${e.reason ? `<p class="why">${esc(e.reason)}</p>` : ""}${e.hash ? `<a class="tx" href="${esc(txLink(coin?.chain, e.hash))}" target="_blank" rel="noopener">View on the explorer →</a>` : ""}`;
      break;
    case "blocked":
      body = `<p class="sys">Wanted to ${esc(String(e.tool ?? "act").replace(/_/g, " "))}; not allowed.</p><p class="why">${esc(e.reason)}</p>`;
      break;
    case "video":
      body = `<p class="lore-t">${esc(e.title)}</p><p class="say">“${esc(e.line)}”</p>${e.url ? `<video class="made" src="${esc(CONFIG.api + e.url)}" controls playsinline preload="metadata"></video>` : ""}${e.topic ? `<p class="why">asked: ${esc(e.topic)}</p>` : ""}`;
      break;
    case "request":
      body = `<p class="sys">${esc(cap(e.text))}</p>${e.hash ? `<a class="tx" href="${esc(txLink(coin?.chain, e.hash))}" target="_blank" rel="noopener">View the burn →</a>` : ""}`;
      break;
    case "video_failed":
      body = `<p class="sys">${esc(cap(e.text))}</p>`;
      break;
    case "fees":
      body = `<p class="sys">${esc(cap(e.text))}${statusPill(e.status)}</p>${e.reason ? `<p class="why">${esc(e.reason)}</p>` : ""}${e.hash ? `<a class="tx" href="${esc(txLink(coin?.chain, e.hash))}" target="_blank" rel="noopener">View on the explorer →</a>` : ""}`;
      break;
    default:
      body = `<p class="sys">${esc(cap(e.text ?? ""))}</p>`;
  }
  return `<li>${head}<div>${body}</div></li>`;
}

const cap = (s) => (s ? String(s)[0].toUpperCase() + String(s).slice(1) : "");

function renderFeed() {
  // A move is logged once as pending and again with its outcome (ref = the
  // pending entry's id); only the outcome is shown.
  const settled = new Set(entries.filter((e) => e.ref).map((e) => e.ref));
  let list = entries.filter((e) => !settled.has(e.id));
  if (show === "say") list = list.filter((e) => SAYS.has(e.kind));
  if (show === "act") list = list.filter((e) => ACTS.has(e.kind));
  list = list.slice().reverse();
  $("feed").innerHTML = list.map(item).join("");
  $("feed-empty").hidden = list.length > 0;
}

document.querySelectorAll(".chips .chip").forEach((b) =>
  b.addEventListener("click", () => {
    show = b.dataset.f;
    document.querySelectorAll(".chips .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderFeed();
  }),
);

async function loadFeed() {
  const f = await api(`/api/coins/${token}/feed?after=${lastAt}`);
  if (!Array.isArray(f) || !f.length) return;
  entries.push(...f);
  lastAt = f[f.length - 1].at;
  renderFeed();
}

async function loadCoin() {
  const c = await api(`/api/coins/${token}`);
  if (!c || c.error) {
    $("id").innerHTML = `<div><h1>${c?.status === 404 ? "No such mind" : "Unavailable"}</h1><p class="sub">${c?.status === 404 ? "There is no coin launched here at that address." : "The minds' service is not answering. The coin and its vault are unaffected; try again in a minute."}</p></div>`;
    return false;
  }
  coin = c;
  document.title = `$${c.symbol} — ${c.name}`;
  const badge = c.graduated ? `<span class="badge grad">Graduated</span>` : c.awake ? `<span class="badge awake">Awake</span>` : `<span class="badge asleep">Asleep</span>`;
  $("id").innerHTML = `${logoHtml(c)}<div>
      <h1>$${esc(c.symbol)}</h1>
      <div class="meta"><span style="font-size:18px;color:var(--grey)">${esc(c.name)}</span>${badge}<span class="mono">${esc(c.model)}</span></div>
    </div>`;
  $("links").innerHTML = `
    <a class="btn sm go" href="${esc(tradeLink(c))}" target="_blank" rel="noopener">Trade $${esc(c.symbol)}${c.chain === "solana" ? " on pump.fun" : ""}</a>
    <a class="btn sm ghost" href="${esc(addrLink(c.chain, c.vault))}" target="_blank" rel="noopener">${c.chain === "solana" ? "Treasury" : "Vault"} ${esc(short(c.vault))}</a>
    <a class="btn sm ghost" href="${esc(addrLink(c.chain, c.token))}" target="_blank" rel="noopener">Token ${esc(short(c.token))}</a>
    <span class="badge chain">${esc(chainName(c.chain))}</span>`;

  const b = c.books;
  const ethUsd = b?.ethUsd ?? null;
  $("st-mc").textContent = usd(c.marketCapUsd);
  $("st-px").textContent = c.priceUsd ? `$${c.priceUsd.toPrecision(3)} a token` : "";
  $("st-tr").textContent = amount(c.treasuryEth, c.unit, 4);
  $("st-tr-n").textContent = ethUsd ? `about ${usd(c.treasuryEth * ethUsd)}` : "";
  $("st-fe").textContent = amount(c.feesEth, c.unit, 4);
  $("st-fe-n").textContent = c.feesLastHourEth != null ? `${amount(c.feesLastHourEth, c.unit, 5)} in the last hour` : "";
  $("st-cr").textContent = usd(c.creditsUsd, { compact: false });
  $("st-cr-n").textContent = `${(c.thoughts ?? 0).toLocaleString("en-US")} thoughts · ${usd(c.spentUsd ?? 0, { compact: false })} spent`;

  if (c.mission) {
    $("mission").textContent = c.mission;
    $("mission").classList.remove("quiet");
  }
  if (c.character) {
    $("pers").textContent = c.character.personality || "—";
    $("pers").classList.remove("quiet");
    $("obj").textContent = c.character.objective || "—";
    $("bound").textContent = "This text's fingerprint matches the one written into the vault at launch.";
  } else {
    $("pers").textContent = "No character is bound to this coin. It runs on its model's defaults.";
    $("obj").textContent = "—";
    $("bound").textContent = "";
  }

  const hold = [`<li><span>${esc(c.unit)} (treasury)</span><b>${amount(c.treasuryEth, c.unit, 5)}</b></li>`];
  if (b?.heldTokens && BigInt(b.heldTokens) > 0n) hold.push(`<li><span>$${esc(c.symbol)} held</span><b>${Math.floor(Number(BigInt(b.heldTokens)) / 10 ** (c.decimals ?? 18)).toLocaleString("en-US")}</b></li>`);
  // xStocks on Solana have 8 decimals; Robinhood stock tokens have 18
  const stockDec = c.chain === "solana" ? 1e8 : 1e18;
  for (const [sym, w] of Object.entries(b?.stocks ?? {})) if (BigInt(w) > 0n) hold.push(`<li><span>${esc(sym)}</span><b>${(Number(BigInt(w)) / stockDec).toFixed(6)}</b></li>`);
  if (c.holders) hold.push(`<li><span>Holders</span><b>${c.holders.count.toLocaleString("en-US")} · top 10 hold ${c.holders.top10Share}%</b></li>`);
  $("hold").innerHTML = hold.join("");

  const pct = Math.round((c.progress ?? 0) * 1000) / 10;
  $("grad").style.width = `${c.graduated ? 100 : pct}%`;
  const venue = c.chain === "solana" ? ["PumpSwap pool", "pump.fun curve"] : ["Uniswap v4 pool", "Pons curve"];
  $("grad-t").textContent = c.graduated ? `Graduated: it trades in its ${venue[0]} now, and buybacks go there.` : `${pct}% of the way to graduating from its ${venue[1]}.`;

  const lim = [];
  if (b) {
    lim.push(`<li><span>It may spend now</span><b>${amount(baseToUnit(b.spendable, c.chain), c.unit, 5)}</b></li>`);
    const wait = b.readyAt && b.chainNow ? b.readyAt - b.chainNow : 0;
    lim.push(`<li><span>Next move allowed</span><b>${wait > 0 ? `in ${Math.ceil(wait / 60)} min` : "now"}</b></li>`);
  }
  lim.push(`<li><span>Per move</span><b>10% of treasury</b></li><li><span>Per day</span><b>25% of treasury</b></li>`);
  if (c.pendingDraws?.length) lim.push(`<li><span>Random draws scheduled</span><b>${c.pendingDraws.length}</b></li>`);
  $("limits").innerHTML = lim.join("");
  return true;
}

/* ---------------- videos ---------------- */

const shownVideos = new Set();
const STATUS_WORDS = { queued: "queued", waiting: "waiting", scripted: "written, starting", generating: "being made" };

async function loadVideos() {
  const list = await api(`/api/coins/${token}/videos`);
  if (!Array.isArray(list) || !coin) return;
  const ready = list.filter((v) => v.status === "ready");
  const fresh = ready.filter((v) => !shownVideos.has(v.id));
  if (fresh.length) {
    const html = fresh.map((v) => clipHtml({ ...v, token: coin.token, symbol: coin.symbol, name: coin.name, logo: coin.logo }, { who: false })).join("");
    $("videos").insertAdjacentHTML("afterbegin", html);
    fresh.forEach((v) => shownVideos.add(v.id));
    wireClips($("videos"));
  }
  $("videos-empty").hidden = shownVideos.size > 0;
  const open = list.filter((v) => !["ready", "failed", "refused"].includes(v.status));
  $("queue").innerHTML = open
    .map((v) => `<li><b>Video ${v.id + 1}</b> ${esc(STATUS_WORDS[v.status] ?? v.status)}${v.reason ? `: ${esc(v.reason)}` : ""}${v.topic ? `<br>about “${esc(v.topic)}”` : ""}</li>`)
    .join("");
}

/* ---------------- the coin's X account: the launcher connects it ---------------- */

async function renderX() {
  if (!coin) return;
  const box = $("xbox");
  box.hidden = !coin.xAvailable && !coin.x;
  if (box.hidden) return;
  const x = coin.x;
  const mine = isLauncher();
  $("x-state").innerHTML = x
    ? `<b>@${esc(x.username)}</b>. Each new video posts there automatically${x.postUpdates ? ", and so do the persona's short updates" : ""}.${x.broken ? ` <span style="color:var(--down)">X stopped accepting its posts; the launcher can reconnect it.</span>` : ""}`
    : mine
      ? "Connect this coin's X account and each new video posts there automatically. X asks accounts that post automatically to label themselves in their settings."
      : "Not connected. Its launcher can connect an X account for the videos.";
  $("x-go").hidden = !mine || (x && !x.broken);
  $("x-go").textContent = x?.broken ? "Reconnect X" : "Connect X";
  $("x-updates-row").hidden = !mine || (x && !x.broken);
  $("x-off").hidden = !mine || !x;
}

/** The launcher's wallet signs the service's one-time message: that is the proof. */
async function proveLauncher(action) {
  const ch = await api(`/api/x/challenge?token=${coin.token}&action=${action}`);
  if (!ch || ch.error) throw new Error(ch?.error ?? "the service did not answer");
  const signature = isSolCoin() ? await solwallet.signMessage(ch.message) : await wallet.signMessage(account, ch.message);
  return { message: ch.message, signature };
}

$("x-go").addEventListener("click", async () => {
  const s = $("x-status");
  s.className = "lstatus";
  try {
    if (!account) account = isSolCoin() ? await solwallet.connect() : await wallet.connect();
    if (!isLauncher()) throw new Error("only the wallet that launched this coin can connect its X account");
    s.textContent = "Sign the message in your wallet. It proves you launched this coin; it costs nothing.";
    const proof = await proveLauncher("connect");
    const r = await api("/api/x/start", { method: "POST", body: JSON.stringify({ token: coin.token, ...proof, postUpdates: $("x-updates").checked }) });
    if (!r || r.error) throw new Error(r?.error ?? "the service did not answer");
    s.textContent = "Taking you to X to sign in…";
    location.href = r.url;
  } catch (err) {
    s.className = "lstatus err";
    s.textContent = cap(isSolCoin() ? solwallet.why(err) : wallet.why(err)) + ".";
  }
});

$("x-off").addEventListener("click", async () => {
  const s = $("x-status");
  s.className = "lstatus";
  try {
    if (!account) account = isSolCoin() ? await solwallet.connect() : await wallet.connect();
    if (!isLauncher()) throw new Error("only the wallet that launched this coin can disconnect its X account");
    const proof = await proveLauncher("disconnect");
    const r = await api("/api/x/disconnect", { method: "POST", body: JSON.stringify({ token: coin.token, ...proof }) });
    if (!r || r.error) throw new Error(r?.error ?? "the service did not answer");
    s.className = "lstatus ok";
    s.textContent = "Disconnected. Nothing more will post there.";
    await loadCoin();
    await renderX();
  } catch (err) {
    s.className = "lstatus err";
    s.textContent = cap(isSolCoin() ? solwallet.why(err) : wallet.why(err)) + ".";
  }
});

/* ---------------- asking for a video: the launcher only ---------------- */

let terms = null;
let account = null;

const fmt = (wei) => Math.floor(weiToEth(wei)).toLocaleString("en-US");
const isSolCoin = () => coin?.chain === "solana";
// EVM addresses compare case-insensitively; Solana addresses are case-sensitive
const isLauncher = () => account && coin && (isSolCoin() ? account === coin.launcher : account.toLowerCase() === coin.launcher.toLowerCase());

async function balanceOf(a) {
  if (isSolCoin()) return null; // Solana: pump.fun shows it; the burn itself refuses a short balance
  const res = await wallet.call(coin.token, encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [a] }));
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: res });
}
async function allowance(a) {
  const res = await wallet.call(coin.token, encodeFunctionData({ abi: erc20Abi, functionName: "allowance", args: [a, coin.vault] }));
  return decodeFunctionResult({ abi: erc20Abi, functionName: "allowance", data: res });
}

async function renderAsk() {
  if (!coin || !terms) return;
  const btn = $("ask-go");
  $("ask-form").hidden = false;
  $("ask-rule").textContent = `Only this coin's launcher can ask, by burning ${fmt(terms.videoBurn)} $${coin.symbol} of their own. The coin's fees pay for the video.`;
  if (!terms.videos) {
    btn.disabled = true;
    btn.textContent = "Videos are not switched on yet";
    return;
  }
  if (!account) {
    btn.disabled = false;
    btn.textContent = "Connect wallet";
    return;
  }
  if (!isLauncher()) {
    btn.disabled = true;
    btn.textContent = "Only the launcher can ask";
    return;
  }
  btn.disabled = false;
  btn.textContent = `Burn ${fmt(terms.videoBurn)} $${coin.symbol} for a video`;
  try {
    const bal = await balanceOf(account);
    if (bal !== null && bal < BigInt(terms.videoBurn)) {
      btn.disabled = true;
      $("ask-status").className = "lstatus";
      $("ask-status").textContent = `You hold ${fmt(bal)} $${coin.symbol}. Buy at least ${fmt(BigInt(terms.videoBurn) - bal)} more to ask for a video.`;
    }
  } catch {
    /* the wallet may be on another network; the request flow switches it */
  }
}

function askStep(s, state, why = "") {
  const el = $("ask-steps").querySelector(`[data-s="${s}"]`);
  el.className = state;
  el.querySelector(".ic").textContent = state === "done" ? "✓" : state === "fail" ? "!" : "";
  el.querySelector(".why").textContent = why;
}

$("topic").addEventListener("input", () => ($("c-topic").textContent = `${$("topic").value.length} / 280`));

let asking = false;
$("ask-go").addEventListener("click", async () => {
  if (asking) return;
  const status = $("ask-status");
  status.className = "lstatus";
  status.textContent = "";
  asking = true;
  $("ask-go").disabled = true;
  try {
    if (!account) {
      account = isSolCoin() ? await solwallet.connect() : await wallet.connect();
      return;
    }
    if (!isLauncher()) return;
    if (isSolCoin()) return await solanaRequest(status);
    const topic = $("topic").value.trim();
    if (topic.length < 3) {
      status.className = "lstatus err";
      status.textContent = "Write a topic first. The persona decides how to take it.";
      return;
    }
    await wallet.ensureChain();
    const burn = BigInt(terms.videoBurn);
    $("ask-steps").hidden = false;
    ["topic", "approve", "burn"].forEach((s) => askStep(s, ""));

    askStep("topic", "now", "Two safety models read it.");
    const filed = await api("/api/topic", { method: "POST", body: JSON.stringify({ token: coin.token, topic }) });
    if (!filed || filed.error) throw Object.assign(new Error(filed?.error ?? "the service did not answer"), { step: "topic" });
    askStep("topic", "done", "Passed. Nothing has burned yet.");

    askStep("approve", "now");
    if ((await allowance(account)) < burn) {
      let h;
      try {
        h = await wallet.send(account, { to: coin.token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [coin.vault, burn] }) });
      } catch (err) {
        throw Object.assign(new Error(wallet.why(err)), { step: "approve" });
      }
      const rc = await wallet.waitReceipt(h);
      if (rc.status !== "0x1") throw Object.assign(new Error("the approval reverted"), { step: "approve" });
      askStep("approve", "done", `The vault may burn exactly ${fmt(burn)}.`);
    } else askStep("approve", "done", "Already allowed.");

    askStep("burn", "now", "Confirm in your wallet.");
    let h;
    try {
      h = await wallet.send(account, { to: coin.vault, data: encodeFunctionData({ abi: vaultAbi, functionName: "requestVideo", args: [burn, filed.topicHash] }) });
    } catch (err) {
      throw Object.assign(new Error(wallet.why(err)), { step: "burn" });
    }
    const rc = await wallet.waitReceipt(h);
    if (rc.status !== "0x1") throw Object.assign(new Error("the request reverted; nothing burned"), { step: "burn" });
    askStep("burn", "done", "Burned.");
    status.className = "lstatus ok";
    status.innerHTML = `Requested. It joins the queue below within a minute. <a href="${esc(txLink(coin.chain, h))}" target="_blank" rel="noopener" style="color:inherit">View the burn</a>`;
    $("topic").value = "";
  } catch (err) {
    if (err.step) askStep(err.step, "fail", err.message);
    status.className = "lstatus err";
    status.textContent = err.step ? "Stopped. Nothing burned unless the last step confirmed." : wallet.why(err);
  } finally {
    asking = false;
    await renderAsk();
  }
});
wallet.onAccounts((a) => !isSolCoin() && ((account = a), renderAsk(), renderX()));

/** Solana: the service checks the topic and builds burn + memo; the launcher's wallet signs and sends it. */
async function solanaRequest(status) {
  const topic = $("topic").value.trim();
  if (topic.length < 3) {
    status.className = "lstatus err";
    status.textContent = "Write a topic first. The persona decides how to take it.";
    return;
  }
  $("ask-steps").hidden = false;
  $("ask-steps").querySelector('[data-s="approve"]').hidden = true;
  ["topic", "burn"].forEach((s) => askStep(s, ""));
  askStep("topic", "now", "Two safety models read it.");
  const built = await api("/api/sol/request", { method: "POST", body: JSON.stringify({ mint: coin.token, launcher: account, topic }) });
  if (!built || built.error) throw Object.assign(new Error(built?.error ?? "the service did not answer"), { step: "topic" });
  askStep("topic", "done", "Passed. Nothing has burned yet.");
  askStep("burn", "now", "Confirm in your wallet: one burn and a memo.");
  let sig;
  try {
    sig = await solwallet.signAndSend(built.tx);
  } catch (err) {
    throw Object.assign(new Error(solwallet.why(err)), { step: "burn" });
  }
  await solwallet.confirm(sig).catch((err) => {
    throw Object.assign(new Error(err.message), { step: "burn" });
  });
  askStep("burn", "done", "Burned.");
  status.className = "lstatus ok";
  status.innerHTML = `Requested. It joins the queue below within a minute. <a href="${esc(txLink("solana", sig))}" target="_blank" rel="noopener" style="color:inherit">View the burn</a>`;
  $("topic").value = "";
}

if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
  $("id").innerHTML = `<div><h1>No coin chosen</h1><p class="sub"><a href="./#minds">Pick one from the list.</a></p></div>`;
} else if (await loadCoin()) {
  [terms, account] = await Promise.all([api(isSolCoin() ? "/api/terms?chain=solana" : "/api/terms"), isSolCoin() ? solwallet.current() : wallet.current()]);
  if (terms?.error) terms = null;
  await Promise.all([loadFeed(), loadVideos(), renderAsk(), renderX()]);
  // back from X's sign-in
  const back = new URLSearchParams(location.search).get("x");
  if (back) {
    const s = $("x-status");
    const words = { connected: ["ok", "Connected. New videos will post there."], cancelled: ["", "X sign-in was cancelled; nothing was connected."], failed: ["err", "X sign-in did not complete; try again."] };
    const [cls, text] = words[back] ?? ["", ""];
    s.className = "lstatus" + (cls ? " " + cls : "");
    s.textContent = text;
    history.replaceState(null, "", `coin.html?t=${coin.token}`);
  }
  setInterval(loadFeed, 5000);
  setInterval(loadVideos, 10000);
  setInterval(loadCoin, 20000);
  setInterval(renderFeed, 60000); // keep the "ago" times honest
}
