// The launch: generate faces and pick one, file the persona (the service's
// firewall checks it, pins the face and returns its fingerprint), then one
// wallet transaction to the factory, which deploys the coin's vault and has the
// vault launch the coin on Pons. The face is the coin's logo.
//
// Icon runs on Robinhood Chain only. The Solana path below (pump.fun launches
// through the service) is kept but unreachable: `chain` is never "solana".

import { CONFIG } from "./config.js";
import { $, esc, chrome, api, eth, weiToEth, tx as txUrl } from "./ui.js";
import { factoryAbi, curveAbi } from "./abi.js";
import { encodeFunctionData, decodeFunctionResult, parseEventLogs, parseEther, keccak256, toBytes, toHex } from "./vendor/viem.js";
import * as wallet from "./wallet.js";
import * as solwallet from "./solwallet.js";

chrome("launch");

const LOOKS = {
  "Silver-haired strategist": "A woman in her thirties with short silver hair, sharp green eyes, a black turtleneck and a calm, knowing smile.",
  "Street artist": "A young man with paint-flecked curly hair, a denim jacket covered in patches and an easy grin.",
  "Retro robot": "A friendly chrome robot with round glowing eyes, scuffed 1970s styling and a little antenna.",
  "Desert wanderer": "A weathered traveller with sun-browned skin, a wrapped scarf, goggles pushed up on the forehead and kind eyes.",
  "Neon cat": "An anthropomorphic black cat with bright yellow eyes, a tiny gold chain and a smug expression, lit in neon pink.",
};
const PERSONALITIES = {
  "Stoic guardian": "Calm, sparing with words and protective of the treasury. Speaks in short, plain sentences, distrusts hype, and prefers slow, steady moves to big swings.",
  "Meme lord": "Loud, funny and permanently online. Talks in jokes and running bits, adores its holders, and treats every buyback like a party.",
  "Value investor": "Patient and analytical, an old-school value investor at heart. Explains its reasoning with numbers and thinks in years, not hours.",
  "Mad scientist": "Curious and experimental. Treats the treasury as a lab, prefers small careful bets, and writes up every result like a lab notebook.",
  "Mysterious oracle": "Speaks rarely and in riddles, as if it already knows how the story ends. Every move it makes is framed as a sign.",
};
const OBJECTIVES = {
  "Shrink the supply": "Buy back and burn this coin steadily whenever fees allow, favouring many small burns over a few large ones.",
  "Stock portfolio": "Build a diversified treasury of tokenized stocks, adding a little at a time across several companies and rarely selling.",
  "Reward holders": "Reward the people who hold this coin, especially those who have held longest, with regular payouts.",
  "Balanced": "Balance burns, a small stock portfolio and holder rewards, and keep holders entertained along the way.",
};

let terms = null;
let evmTerms = null;
let solTerms = null;
let chain = "robinhood";
let face = null; // { id, url }
let account = null;
let launched = null;

const status = (msg, kind = "") => {
  const el = $("status");
  el.textContent = msg;
  el.className = "lstatus" + (kind ? " " + kind : "");
};
const tokens = (wei) => Math.floor(weiToEth(wei)).toLocaleString("en-US");

/* ---------------- terms ---------------- */

async function loadTerms() {
  const e = await api("/api/terms");
  evmTerms = e && !e.error ? e : null;
  renderTerms();
}

// The launch page's words that depend on where the coin launches.
const CHAIN_COPY = {
  solana: { venue: "pump.fun", bound: "the coin's launch metadata", how: "One transaction from your Solana wallet.", wait: "Send it to Solana" },
  robinhood: { venue: "Pons", bound: "the coin's vault", how: "One transaction from your wallet on Robinhood Chain.", wait: "Wait for Robinhood Chain" },
};

function renderTerms() {
  terms = chain === "solana" ? solTerms : evmTerms;
  document.querySelectorAll("[data-chain]").forEach((el) => (el.textContent = CHAIN_COPY[chain][el.dataset.chain]));
  $("go").disabled = false;
  $("gen").disabled = false;
  status("");
  if (!terms || terms.enabled === false) {
    for (const id of ["tm-fee", "tm-tax", "tm-video"]) $(id).textContent = terms ? "set when launches open" : "unavailable";
    // Until the factory is deployed nothing can launch, so nothing is generated either.
    status(terms ? "Launches open soon, once Icon's factory is deployed on Robinhood Chain." : "The service is not answering, so a launch cannot be prepared right now. Try again in a minute.", "err");
    $("go").disabled = true;
    $("gen").disabled = !!terms;
    return;
  }
  if (chain === "solana") {
    const f = terms.curveFees;
    $("tm-fee").textContent = "No launch fee; about 0.012 SOL of account rent and network fees (measured)";
    $("tm-tax").textContent = f ? `pump.fun's: ${(f.protocol + f.creator) / 100}% on the curve, of which ${f.creator / 100}% reaches the coin's treasury` : "pump.fun's own fee schedule";
  } else {
    $("tm-fee").textContent = `${eth(weiToEth(terms.launchFeeWei), 6)} + gas`;
    $("tm-tax").textContent = `${(100 + terms.creatorTaxBps) / 100}%, of which ${(terms.creatorTaxBps + 70) / 100}% reaches the coin's vault`;
  }
  $("tm-video").textContent = `You burn ${tokens(terms.videoBurn)} of your own coin; its fees pay the rest`;
  if (terms.paused) {
    status("Launches are paused right now.", "err");
    $("go").disabled = true;
  }
  if (!terms.faces) {
    $("look-hint").textContent = "Face generation is not switched on yet, so launches cannot go through.";
    $("gen").disabled = true;
  }
}

document.querySelectorAll('input[name="chain"]').forEach((r) =>
  r.addEventListener("change", async () => {
    if (!r.checked || launched) return;
    chain = r.value;
    $("sol-firstbuy").hidden = chain !== "solana";
    renderTerms();
    account = chain === "solana" ? await solwallet.current() : await wallet.current();
    showAccount();
  }),
);

/* ---------------- presets and counters ---------------- */

function presets(boxId, fieldId, map) {
  const box = $(boxId);
  box.innerHTML = Object.keys(map).map((k) => `<button type="button" class="chip" aria-pressed="false">${esc(k)}</button>`).join("");
  box.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      $(fieldId).value = map[b.textContent];
      $(fieldId).dispatchEvent(new Event("input"));
      box.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }),
  );
}
presets("pp-look", "f-look", LOOKS);
presets("pp-pers", "f-pers", PERSONALITIES);
presets("pp-obj", "f-obj", OBJECTIVES);

for (const [field, counter, max] of [["f-desc", "c-desc", 600], ["f-look", "c-look", 600], ["f-pers", "c-pers", 1200], ["f-obj", "c-obj", 1200]]) {
  $(field).addEventListener("input", () => ($(counter).textContent = `${$(field).value.length} / ${max}`));
}

/* ---------------- faces ---------------- */

let generating = false;
$("gen").addEventListener("click", async () => {
  if (generating) return;
  const look = $("f-look").value.trim();
  if (look.length < 10) {
    $("gen-note").textContent = "Describe the look in a sentence first.";
    return;
  }
  generating = true;
  $("gen").disabled = true;
  $("gen-note").textContent = "Two safety models read the description, then four faces are made. Up to a minute…";
  const r = await api("/api/faces", { method: "POST", body: JSON.stringify({ description: look }) });
  generating = false;
  $("gen").disabled = false;
  if (!r || r.error) {
    $("gen-note").textContent = r?.error ? cap(r.error) + "." : "The service did not answer; try again.";
    return;
  }
  $("gen-note").textContent = "Pick one, or change the description and generate again.";
  $("gen").textContent = "Generate again";
  renderFaces(r.faces);
});

const cap = (s) => String(s)[0].toUpperCase() + String(s).slice(1);

function renderFaces(list) {
  const box = $("faces");
  box.hidden = false;
  box.innerHTML = list
    .map((f, i) => `<label class="face"><input type="radio" name="face" value="${esc(f.id)}"><img src="${esc(CONFIG.api + f.url)}" alt="Face option ${i + 1}" loading="lazy"></label>`)
    .join("");
  box.querySelectorAll("input").forEach((r) =>
    r.addEventListener("change", () => {
      face = list.find((f) => f.id === r.value);
      box.querySelectorAll(".face").forEach((el) => el.classList.toggle("on", el.contains(r)));
      $("face-picked").hidden = false;
      $("face-picked").innerHTML = "<b>This face</b> becomes the persona's look in every video, and the coin's logo.";
    }),
  );
  face = null;
  $("face-picked").hidden = true;
}

/* ---------------- wallet ---------------- */

const showAccount = () => {
  $("who").textContent = account ? `${account.slice(0, 6)}…${account.slice(-4)} on ${chain === "solana" ? "Solana" : CONFIG.chainName}` : "";
  $("go").textContent = !account ? "Connect wallet" : chain === "solana" ? "Launch on pump.fun" : terms ? `Launch for ${eth(weiToEth(terms.launchFeeWei), 6)}` : "Launch";
};
wallet.onAccounts((a) => chain !== "solana" && ((account = a), showAccount()));

/* ---------------- the launch ---------------- */

function step(s, state, why = "") {
  const el = $("steps").querySelector(`[data-s="${s}"]`);
  el.className = state;
  el.querySelector(".ic").textContent = state === "done" ? "✓" : state === "fail" ? "!" : "";
  el.querySelector(".why").textContent = why;
}

const isUrl = (v) => !v || /^https:\/\/[^\s]+$/.test(v);

function validate() {
  if (!$("f-name").value.trim()) return "Give the coin a name.";
  if (!/^[A-Z0-9]{1,10}$/.test($("f-symbol").value.trim().toUpperCase())) return "The ticker should be 1 to 10 letters or digits.";
  if (!face) return "Generate faces and pick one. It becomes the persona's look and the coin's logo.";
  if ($("f-pers").value.trim().length < 20) return "Write a personality of at least a sentence, or pick a starting point above it.";
  if ($("f-obj").value.trim().length < 20) return "Write an objective of at least a sentence, or pick a starting point above it.";
  for (const id of ["f-x", "f-tg", "f-web"]) if (!isUrl($(id).value.trim())) return "Links must start with https://";
  if (!$("ack-perm").checked || !$("ack-risk").checked) return "Tick both boxes above the button to confirm you have read them.";
  return null;
}

/** The same canonical text the service hashes (mind/src/api.js profileHash). */
const profileHash = (f) => keccak256(toBytes(JSON.stringify({ personality: f.personality, objective: f.objective, description: f.description, face: f.face })));

let busy = false;
$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || launched) return;
  busy = true;
  $("go").disabled = true;
  try {
    if (!account) {
      status("Connecting your wallet…");
      account = chain === "solana" ? await solwallet.connect() : await wallet.connect();
      showAccount();
      status("");
      return;
    }
    const bad = validate();
    if (bad) return status(bad, "err");
    if (chain === "solana") return await solanaLaunch();
    await wallet.ensureChain();
    status("");
    $("steps").hidden = false;
    ["file", "sign", "mine"].forEach((s) => step(s, ""));

    // 1. the persona, through the firewall; the service pins the chosen face
    step("file", "now", "Two safety models read it, and the face is pinned to IPFS.");
    const salt = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const filed = await api("/api/profile", {
      method: "POST",
      body: JSON.stringify({ launcher: account, salt, face: face.id, description: $("f-desc").value.trim(), personality: $("f-pers").value.trim(), objective: $("f-obj").value.trim() }),
    });
    if (!filed) throw Object.assign(new Error("the service did not answer"), { step: "file" });
    if (filed.error) throw Object.assign(new Error(filed.error), { step: "file" });
    if (profileHash(filed) !== filed.profileHash) throw Object.assign(new Error("the fingerprint the service returned does not match; not launching"), { step: "file" });
    step("file", "done", "Passed. Its fingerprint goes into the vault.");

    // 2. the transaction
    step("sign", "now", "Check the amount: it should be exactly the launch fee.");
    const data = encodeFunctionData({
      abi: factoryAbi,
      functionName: "launch",
      args: [{
        name: $("f-name").value.trim(),
        symbol: $("f-symbol").value.trim().toUpperCase(),
        logo: filed.logo,
        description: filed.description,
        socials: { twitter: $("f-x").value.trim(), telegram: $("f-tg").value.trim(), discord: "", website: $("f-web").value.trim(), farcaster: "" },
        model: terms.mindModel,
        profileHash: filed.profileHash,
        salt,
      }],
    });
    let hash;
    try {
      hash = await wallet.send(account, { to: terms.factory, data, value: BigInt(terms.launchFeeWei) });
    } catch (err) {
      throw Object.assign(new Error(wallet.why(err)), { step: "sign" });
    }
    step("sign", "done", "Sent.");

    // 3. confirmation
    step("mine", "now", "Usually a few seconds.");
    const rc = await wallet.waitReceipt(hash);
    if (rc.status !== "0x1") throw Object.assign(new Error("the launch transaction reverted"), { step: "mine" });
    const [ev] = parseEventLogs({ abi: factoryAbi, logs: rc.logs, eventName: "MindLaunched" });
    if (!ev) throw Object.assign(new Error("confirmed, but no launch event was found"), { step: "mine" });
    if (ev.args.vault.toLowerCase() !== filed.vault.toLowerCase()) {
      status("Launched, but its vault is not the one the persona was filed for, so the persona will not bind.", "err");
    }
    step("mine", "done", `Block ${parseInt(rc.blockNumber, 16).toLocaleString("en-US")}`);
    launched = { token: ev.args.token, curve: ev.args.curve, vault: ev.args.vault, hash, at: Date.now() };
    showDone();
  } catch (err) {
    if (err.step) step(err.step, "fail", err.message);
    status(err.step ? "The launch stopped. Nothing was charged unless a transaction confirmed." : err.message, "err");
  } finally {
    busy = false;
    $("go").disabled = !!launched;
  }
});

/* ---------------- Solana: built by the service, signed here, sent by the service ---------------- */

async function solanaLaunch() {
  const firstBuy = Number($("f-firstbuy").value.trim() || 0);
  if (!(firstBuy >= 0 && firstBuy <= 50)) return status("A first buy is between 0 and 50 SOL.", "err");
  status("");
  $("steps").hidden = false;
  $("steps").querySelector('[data-s="build"]').hidden = false;
  ["file", "build", "sign", "mine"].forEach((s) => step(s, ""));

  step("file", "now", "Two safety models read it, and the face is pinned to IPFS.");
  const prepared = await api("/api/sol/prepare", {
    method: "POST",
    body: JSON.stringify({
      launcher: account, face: face.id, name: $("f-name").value.trim(), symbol: $("f-symbol").value.trim().toUpperCase(),
      description: $("f-desc").value.trim(), personality: $("f-pers").value.trim(), objective: $("f-obj").value.trim(),
      socials: { twitter: $("f-x").value.trim(), telegram: $("f-tg").value.trim(), website: $("f-web").value.trim() },
      devBuySol: firstBuy,
    }),
  });
  if (!prepared) throw Object.assign(new Error("the service did not answer"), { step: "file" });
  if (prepared.error) throw Object.assign(new Error(prepared.error), { step: "file" });
  step("file", "done", "Passed. Its fingerprint is written into the coin's metadata.");
  step("build", "done", "Creator fees go 100% to the coin's own treasury, locked.");

  step("sign", "now", firstBuy > 0 ? `Your wallet shows the launch and a first buy of ${firstBuy} SOL.` : "Your wallet shows the launch.");
  let signed;
  try {
    signed = await solwallet.signOnly(prepared.tx);
  } catch (err) {
    throw Object.assign(new Error(solwallet.why(err)), { step: "sign" });
  }
  step("sign", "done", "Signed.");

  step("mine", "now", "The service checks it is unchanged, adds the coin's own signature, sends it and checks the fee routing.");
  const sent = await api("/api/sol/submit", { method: "POST", body: JSON.stringify({ mint: prepared.mint, signedTx: signed }) });
  if (!sent || sent.error) throw Object.assign(new Error(sent?.error ?? "the service did not answer"), { step: "mine" });
  step("mine", "done", "Launched, and its fee routing verified on chain.");
  launched = { token: prepared.mint, vault: prepared.treasury, hash: sent.signature, at: Date.now(), chain: "solana" };
  showDone();
}

/* ---------------- after launch ---------------- */

function showDone() {
  const sym = $("f-symbol").value.trim().toUpperCase();
  $("done").hidden = false;
  $("done-title").textContent = `$${sym} is live.`;
  $("done-sub").textContent = `Buy some $${sym}, then burn ${tokens(terms.videoBurn)} of it from the coin's page to request its first video.`;
  $("done-open").href = `coin.html?t=${launched.token}`;
  $("done-tx").href = launched.chain === "solana" ? `${CONFIG.solExplorer}/tx/${launched.hash}` : txUrl(launched.hash);
  $("go").textContent = "Launched";
  $("done").scrollIntoView({ behavior: "smooth", block: "center" });
  if (launched.chain === "solana") {
    $("done-sub").textContent = `Burn ${tokens(terms.videoBurn)} $${sym} from the coin's page to request its first video.`;
    return; // the first buy, if any, was in the launch itself
  }
  $("devbuy").hidden = false;
  const unlock = launched.at + CONFIG.devBuyWaitSec * 1000;
  const tick = setInterval(() => {
    const left = Math.ceil((unlock - Date.now()) / 1000);
    if (left > 0) {
      $("db-q").textContent = `Unlocks in ${left}s.`;
      return;
    }
    clearInterval(tick);
    $("db-go").disabled = false;
    $("db-q").textContent = "";
  }, 250);
}

$("db-eth").addEventListener("input", quoteBuy);
let quoteSeq = 0;
async function quote(wei) {
  const res = await wallet.call(launched.curve, encodeFunctionData({ abi: curveAbi, functionName: "getReserves" }));
  const [r0, r1] = decodeFunctionResult({ abi: curveAbi, functionName: "getReserves", data: res });
  // Same formula the service uses (mind/src/chain.js curveQuote), verified on a fork.
  const feeBps = 100n + BigInt(terms.creatorTaxBps);
  const net = (wei * (10_000n - feeBps)) / 10_000n;
  const out = (r1 * net) / (r0 + net);
  return { out, min: (out * 95n) / 100n };
}

async function quoteBuy() {
  const seq = ++quoteSeq;
  const v = $("db-eth").value.trim();
  if (!launched || !(Number(v) > 0)) return ($("db-q").textContent = "");
  try {
    const { out, min } = await quote(parseEther(v));
    if (seq !== quoteSeq) return;
    const videos = Number(out / BigInt(terms.videoBurn));
    $("db-q").textContent = `≈ ${tokens(out)} tokens (${videos} video${videos === 1 ? "" : "s"} worth) · at least ${tokens(min)} or it fails`;
  } catch {
    $("db-q").textContent = "";
  }
}

$("db-go").addEventListener("click", async () => {
  const v = $("db-eth").value.trim();
  if (!(Number(v) > 0)) return ($("db-q").textContent = "Enter an amount of ETH.");
  $("db-go").disabled = true;
  try {
    const wei = parseEther(v);
    const { min } = await quote(wei);
    const hash = await wallet.send(account, { to: launched.curve, data: encodeFunctionData({ abi: curveAbi, functionName: "buy", args: [wei, min, account] }), value: wei });
    $("db-q").textContent = "Sent. Waiting for the chain…";
    const rc = await wallet.waitReceipt(hash);
    $("db-q").innerHTML = rc.status === "0x1" ? `Bought. <a href="${esc(txUrl(hash))}" target="_blank" rel="noopener" >View it</a>` : "That buy reverted; nothing was spent but gas.";
  } catch (err) {
    $("db-q").textContent = cap(wallet.why(err)) + ".";
  } finally {
    $("db-go").disabled = false;
  }
});

$("sol-firstbuy").hidden = chain !== "solana";
await loadTerms();
account = chain === "solana" ? await solwallet.current() : await wallet.current();
showAccount();
