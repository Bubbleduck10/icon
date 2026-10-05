// Shared by every page: the header and footer (so the name lives in
// config.js alone), API access, and formatting.

import { BRAND, CONFIG } from "./config.js";

export const $ = (id) => document.getElementById(id);

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const MARK = `<img src="brand/icon-64.png" alt="" width="32" height="32">`;

export function chrome(page) {
  const head = document.querySelector("header.bar");
  if (head) {
    const cur = (p) => (p === page ? ' aria-current="page"' : "");
    head.innerHTML = `<div class="wrap bar-in">
      <a class="mark" href="./">${MARK}<span>${esc(BRAND.name)}</span></a>
      <nav class="nav">
        <a href="feed.html"${cur("feed")}>For you</a>
        <a href="./#minds"${cur("explore")}>Personas</a>
        <a href="docs.html"${cur("docs")}>How it works</a>
        ${BRAND.token ? `<a href="${esc(tradeUrl(BRAND.token))}" target="_blank" rel="noopener">$${esc(BRAND.ticker)}</a>` : ""}
        ${BRAND.x ? `<a href="${esc(BRAND.x)}" target="_blank" rel="noopener">X</a>` : ""}
        <a class="btn sm${page === "launch" ? " go" : ""}" href="launch.html">Launch a persona</a>
      </nav></div>`;
  }
  const foot = document.querySelector("footer");
  if (foot) {
    foot.innerHTML = `<div class="wrap">
      <div>
        <p class="fine"><strong>${esc(BRAND.name)}</strong> launches coins on pump.fun, each with an AI persona of its launcher's making: a face, a character, and short videos it stars in when the launcher burns the coin. Its fees pay for its videos and fill a treasury it spends in public, inside fixed limits. Robinhood Chain is coming soon.</p>
        <p class="fine">Nothing here is investment advice. A persona is an AI model: it can be wrong, it can be dull, and it can only do what its limits allow. Read <a href="docs.html#trust">what you are trusting</a> before you buy.</p>
      </div>
      <nav><a href="./">Home</a><a href="feed.html">For you</a><a href="launch.html">Launch</a><a href="docs.html">Docs</a><a href="docs.html#contracts">Contracts</a>${BRAND.x ? `<a href="${esc(BRAND.x)}" target="_blank" rel="noopener">X</a>` : ""}</nav>
    </div>`;
  }
  document.querySelectorAll("[data-brand]").forEach((el) => (el.textContent = BRAND.name));
  if (document.title.includes("{name}")) document.title = document.title.replace("{name}", BRAND.name);
}

/** GET from the mind service. Resolves to null when it is unreachable, so a page can say so. */
export async function api(path, opts = {}) {
  try {
    const r = await fetch(CONFIG.api + path, { ...opts, headers: { ...(opts.body ? { "content-type": "application/json" } : {}), ...(opts.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `request failed (${r.status})`, status: r.status };
    return j;
  } catch {
    return null;
  }
}

export const logoUrl = (logo) => {
  if (!logo) return "";
  if (logo.startsWith("ipfs://")) return CONFIG.ipfsGateway + logo.slice(7).replace(/^ipfs\//, "");
  return /^https:\/\//.test(logo) ? logo : "";
};

export function logoHtml(coin, cls = "logo") {
  const u = logoUrl(coin.logo);
  const ph = `<span class="${cls} ph" aria-hidden="true">${esc((coin.symbol || "?").slice(0, 1))}</span>`;
  if (!u) return ph;
  // A dead gateway or a bad CID collapses to the initial rather than a broken image.
  return `<img class="${cls}" src="${esc(u)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.ph" data-ph="${esc(ph)}">`;
}

export const tx = (hash) => `${CONFIG.explorer}/tx/${hash}`;
export const addrUrl = (a) => `${CONFIG.explorer}/address/${a}`;
export const tradeUrl = (token) => (CONFIG.tradeUrl ? CONFIG.tradeUrl(token) : `${CONFIG.explorer}/token/${token}`);
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function usd(n, { compact = true } = {}) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (compact && Math.abs(n) >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  if (Math.abs(n) > 0 && Math.abs(n) < 0.01) return "<$0.01";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function eth(n, dp = 4) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0 ETH";
  if (n < 10 ** -dp) return `<${10 ** -dp} ETH`;
  return `${Number(n.toFixed(dp)).toLocaleString("en-US", { maximumFractionDigits: dp })} ETH`;
}

export const weiToEth = (w) => Number(BigInt(w ?? 0)) / 1e18;

export function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** "anthropic/claude-sonnet-5.5" -> "claude-sonnet-5.5" */
export const modelShort = (id) => String(id ?? "").split("/").pop();

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------- clips ---------------- */

const fmtTokens = (wei) => Math.floor(Number(BigInt(wei ?? 0) / 10n ** 18n)).toLocaleString("en-US");

/** One persona video as a card. `v` is an /api/videos row (or a coin's video plus its coin). */
export function clipHtml(v, { who = true } = {}) {
  const src = CONFIG.api + v.url;
  return `<article class="clip" data-id="${esc(v.token)}-${esc(v.id)}">
    <video src="${esc(src)}" muted loop playsinline preload="metadata" aria-label="${esc(v.title ?? "video")}"></video>
    <button class="clip-sound" type="button" aria-pressed="false">Sound off</button>
    <div class="clip-info">
      ${who ? `<a class="clip-who" href="coin.html?t=${esc(v.token)}">${logoHtml(v)}<div><b>$${esc(v.symbol)}</b><span>${esc(v.name)}</span></div></a>` : ""}
      <p class="clip-title">${esc(v.title)}</p>
      <p class="clip-line">“${esc(v.line)}”</p>
      <div class="clip-meta">${v.topic ? `<span>asked: ${esc(v.topic)}</span>` : ""}<span>${fmtTokens(v.burned)} burned</span>${v.at ? `<span>${ago(v.at)}</span>` : ""}${v.xUrl ? `<a href="${esc(v.xUrl)}" target="_blank" rel="noopener" style="text-decoration:underline">on X</a>` : ""}</div>
    </div>
  </article>`;
}

/** Clips play, muted, while mostly on screen, and pause when they leave. Sound is opt-in per clip. */
export function wireClips(root) {
  const vids = [...root.querySelectorAll(".clip video")].filter((v) => !v.dataset.watched);
  vids.forEach((v) => (v.dataset.watched = "1"));
  for (const card of root.querySelectorAll(".clip")) {
    const btn = card.querySelector(".clip-sound");
    const vid = card.querySelector("video");
    if (!btn || btn.dataset.wired) continue;
    btn.dataset.wired = "1";
    btn.addEventListener("click", () => {
      vid.muted = !vid.muted;
      btn.textContent = vid.muted ? "Sound off" : "Sound on";
      btn.setAttribute("aria-pressed", String(!vid.muted));
      if (!vid.muted) vid.play().catch(() => {});
    });
  }
  if (reduced()) {
    // No autoplay for people who asked for less motion: they get the player controls instead.
    vids.forEach((v) => (v.controls = true));
    return null;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) e.target.play().catch(() => {});
        else e.target.pause();
      }
    },
    { threshold: [0, 0.6, 1] },
  );
  vids.forEach((v) => io.observe(v));
  return io;
}

/* ---------------- chain-aware helpers ---------------- */

const isSol = (chainOrCoin) => (typeof chainOrCoin === "string" ? chainOrCoin : chainOrCoin?.chain) === "solana";

/** An amount in the coin's chain unit: ETH or SOL. */
export function amount(n, unit = "ETH", dp = 4) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return `0 ${unit}`;
  if (n < 10 ** -dp) return `<${10 ** -dp} ${unit}`;
  return `${Number(n.toFixed(dp)).toLocaleString("en-US", { maximumFractionDigits: dp })} ${unit}`;
}

/** Base units to whole units: wei (18) on Robinhood Chain, lamports (9) on Solana. */
export const baseToUnit = (v, chain) => Number(BigInt(v ?? 0)) / (isSol(chain) ? 1e9 : 1e18);

export const txLink = (chain, hash) => (isSol(chain) ? `${CONFIG.solExplorer}/tx/${hash}` : `${CONFIG.explorer}/tx/${hash}`);
export const addrLink = (chain, a) => (isSol(chain) ? `${CONFIG.solExplorer}/account/${a}` : `${CONFIG.explorer}/address/${a}`);
export const tradeLink = (coin) => (isSol(coin) ? CONFIG.pumpUrl(coin.token) : tradeUrl(coin.token));
export const chainName = (chain) => (isSol(chain) ? "Solana" : "Robinhood Chain");
