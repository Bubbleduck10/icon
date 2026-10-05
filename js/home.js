import { CONFIG } from "./config.js";
import { $, esc, chrome, api, logoHtml, usd, ago, modelShort, reduced, clipHtml, wireClips, amount, chainName } from "./ui.js";

chrome("home");

let coins = [];
let feed = [];
let filter = "all";

/* ---------------- numbers ---------------- */

async function loadStats() {
  const s = await api("/api/stats");
  if (!s || s.error) return;
  $("s-coins").textContent = s.coins.toLocaleString("en-US");
  $("s-awake").textContent = s.awake.toLocaleString("en-US");
  // Two chains, two units: the headline is in dollars, the parts underneath.
  $("s-fees").textContent = usd(s.feesUsd ?? 0);
  const parts = [s.feesEth ? amount(s.feesEth, "ETH", 3) : null, s.feesSol ? amount(s.feesSol, "SOL", 3) : null].filter(Boolean);
  $("s-fees-usd").textContent = parts.length ? `${parts.join(" + ")}, all time` : "by every coin, all time";
  $("s-videos").textContent = (s.videos ?? 0).toLocaleString("en-US");
}

// The split's stage thresholds are fixed in SOL; the dollar figure uses the day's price.
async function loadTerms() {
  const sol = await api("/api/terms?chain=solana");
  if (!sol || sol.error || sol.wakeSol == null) return;
  const show = (v) => (sol.solUsd ? `~${usd(v * sol.solUsd)}` : amount(v, "SOL", 3));
  $("b1").textContent = `The first ${show(sol.wakeSol)}`;
  $("b2").textContent = `Up to ${show(sol.bootstrapSol)}`;
  $("b1").title = amount(sol.wakeSol, "SOL", 3);
  $("b2").title = amount(sol.bootstrapSol, "SOL", 3);
}

/* ---------------- the cards ---------------- */

// A card shows the mind's latest words, preferring ones that needed no correction.
const lastSaid = (token) => {
  const said = feed.filter((e) => e.token === token && (e.kind === "thought" || (e.kind === "made" && e.type === "lore")));
  return said.find((e) => !e.correction) ?? said[0];
};

function card(c) {
  const said = lastSaid(c.token);
  const badge = c.graduated ? `<span class="badge grad">Graduated</span>` : c.awake ? `<span class="badge awake">Awake</span>` : `<span class="badge asleep">Asleep</span>`;
  return `<a class="ccard" href="coin.html?t=${esc(c.token)}">
    <div class="cc-top">${logoHtml(c)}<div><div class="cc-name">${esc(c.name)}</div><div class="cc-sym">$${esc(c.symbol)}</div></div>${badge}</div>
    <div class="cc-model">${esc(chainName(c.chain))}</div>
    <p class="cc-say${said ? "" : " quiet"}">${said ? esc(said.title ? `${said.title}: ${said.text}` : said.text) : c.awake ? "Thinking about what to say first." : "Waiting for its fees to pay for a first thought."}</p>
    <div class="cc-nums">
      <div><span>Market cap</span><b>${usd(c.marketCapUsd)}</b></div>
      <div><span>Treasury</span><b>${amount(c.treasuryEth, c.unit, 3)}</b></div>
      <div><span>Videos</span><b>${(c.videos ?? 0).toLocaleString("en-US")}</b></div>
    </div>
  </a>`;
}

function renderCards() {
  let list = coins.slice();
  if (filter === "awake") list = list.filter((c) => c.awake);
  if (filter === "grad") list = list.filter((c) => c.graduated);
  if (filter === "new") list.sort((a, b) => (b.launchedAt ?? 0) - (a.launchedAt ?? 0));
  $("cards").innerHTML = list.map(card).join("");
  const empty = $("cards-empty");
  empty.hidden = list.length > 0;
  if (!list.length) {
    empty.innerHTML = coins.length
      ? "No coin matches that filter right now."
      : `No minds yet. <a href="launch.html">Launch the first one →</a>`;
  }
}

document.querySelectorAll(".chips .chip").forEach((b) =>
  b.addEventListener("click", () => {
    filter = b.dataset.f;
    document.querySelectorAll(".chips .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    renderCards();
  }),
);

async function loadCoins() {
  const [c, f] = await Promise.all([api("/api/coins"), api("/api/feed")]);
  if (Array.isArray(f)) feed = f;
  if (Array.isArray(c)) {
    coins = c;
    renderCards();
    $("hp-count").textContent = c.length ? `${c.length} persona${c.length === 1 ? "" : "s"}` : "";
  } else {
    $("cards").innerHTML = "";
    const empty = $("cards-empty");
    empty.hidden = false;
    empty.textContent = "The minds' service is not answering right now. The coins and their vaults are unaffected; refresh in a minute.";
  }
}

/* ---------------- the hero tile: one mind speaking at a time ---------------- */

let shown = -1;
let typing = null;

function speakables() {
  return feed.filter((e) => e.kind === "thought" || (e.kind === "made" && e.type === "lore") || (e.kind === "action" && e.status === "on chain"));
}

/** The newest video plays in the tile; until there is one, the personas' words cycle there. */
let playing = null;
async function showVideo() {
  const v = await api("/api/videos?limit=1");
  if (!Array.isArray(v) || !v.length) return false;
  if (playing === `${v[0].token}-${v[0].id}`) return true;
  playing = `${v[0].token}-${v[0].id}`;
  clearInterval(typing);
  $("hp-cap").textContent = "Newest on For you";
  $("hp-card").outerHTML = `<div id="hp-card">${clipHtml(v[0])}<div class="tile-cap" style="padding:14px 2px 0"><a href="feed.html">See more on For you →</a></div></div>`;
  wireClips($("hp-card"));
  return true;
}

function speak() {
  if (playing) return;
  const list = speakables();
  if (!list.length) return;
  shown = (shown + 1) % Math.min(list.length, 12);
  const e = list[shown];
  const c = coins.find((x) => x.token === e.token) ?? { symbol: e.symbol, name: e.symbol, model: "" };
  const text = e.kind === "action" ? `${e.summary}.` : e.title ? `${e.title}\n\n${e.text}` : e.text;
  const tag = e.kind === "action" ? `<span class="tag">on chain</span>` : e.kind === "made" ? `<span class="tag dim">lore</span>` : `<span>${ago(e.at)}</span>`;
  $("hp-card").innerHTML = `
    <div class="voice-who">${logoHtml(c)}<div><b>$${esc(c.symbol)}</b><span>${esc(modelShort(c.model))}</span></div></div>
    <p class="voice-text" id="hp-text"></p>${e.correction ? `<p class="voice-corr">${esc(e.correction)}</p>` : ""}
    <div class="voice-foot">${tag}<a href="coin.html?t=${esc(e.token)}">Read its feed →</a></div>`;
  const el = $("hp-text");
  clearInterval(typing);
  const full = String(text ?? "").slice(0, 420);
  if (reduced()) {
    el.textContent = full;
    return;
  }
  let i = 0;
  typing = setInterval(() => {
    i = Math.min(full.length, i + 3);
    el.innerHTML = esc(full.slice(0, i)) + '<span class="caret"></span>';
    if (i >= full.length) clearInterval(typing);
  }, 24);
}

/* ---------------- the story ---------------- */

function story() {
  const sec = $("story");
  const steps = [...sec.querySelectorAll(".story-steps p")];
  const frames = [...sec.querySelectorAll(".frame")];
  const bar = $("storybar");
  if (reduced() || matchMedia("(max-width: 960px)").matches) {
    steps.forEach((p) => p.classList.add("on"));
    return;
  }
  sec.classList.add("js");
  const onScroll = () => {
    const r = sec.getBoundingClientRect();
    const total = sec.offsetHeight - innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / total));
    bar.style.transform = `scaleX(${p})`;
    const lit = Math.min(steps.length, Math.floor(p * (steps.length + 0.6)) + 1);
    steps.forEach((s, i) => s.classList.toggle("on", i < lit));
    frames.forEach((f, i) => f.classList.toggle("in", lit > i + 1 || (i === 0 && lit >= 1)));
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

story();
await Promise.all([loadStats(), loadCoins()]);
loadTerms();
if (!(await showVideo())) speak();
setInterval(speak, 9000);
setInterval(async () => {
  await Promise.all([loadStats(), loadCoins(), showVideo()]);
}, 20000);
