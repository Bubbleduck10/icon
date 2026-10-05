// The docs are static text; this fills in the numbers that come from chain, so
// the page cannot drift from what the factory actually enforces.

import { $, esc, chrome, api, usd, eth, weiToEth, addrUrl } from "./ui.js";

chrome("docs");

const [t, stocks, stats] = await Promise.all([api("/api/terms"), api("/api/stocks"), api("/api/stats")]);

// Until the factory is deployed the terms carry no numbers; the page's defaults stand.
if (t && !t.error && t.enabled !== false) {
  if (t.factory) $("c-factory").innerHTML = `<a href="${esc(addrUrl(t.factory))}" target="_blank" rel="noopener">${esc(t.factory)}</a>`;
  $("d-tax").textContent = `${(100 + t.creatorTaxBps) / 100}%`;
  $("d-ctax").textContent = `${t.creatorTaxBps / 100}%`;
  $("d-vault").textContent = `${(t.creatorTaxBps + 70) / 100}%`;
  const px = stats?.ethUsd;
  const wake = weiToEth(t.wakeWei);
  const boot = weiToEth(t.bootstrapWei);
  $("d-b1").textContent = `The first ${eth(wake, 4)}${px ? ` (~${usd(wake * px)})` : ""}`;
  $("d-b2").textContent = `From there up to ${eth(boot, 4)}${px ? ` (~${usd(boot * px)})` : ""}`;
  $("d-tmax").textContent = `$${t.thoughtMaxUsd}`;
  $("d-pace").textContent = `${t.paceHours} hours`;
  $("d-live").textContent = `${t.livenessEthPerHour} ETH`;
  $("d-burn").textContent = Math.floor(weiToEth(t.videoBurn)).toLocaleString("en-US");
  $("d-vcost").textContent = `$${Number(t.videoCostUsd).toFixed(2)}`;
  $("d-model").textContent = t.mindModel;
}

$("c-stocks").textContent = Array.isArray(stocks) && stocks.length ? stocks.map((s) => s.symbol).join(", ") + "." : "shown here once the factory is deployed.";
