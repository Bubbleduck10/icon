// The browser wallet, shared by the launch page and the coin page's video
// requests: connect, make sure it is on Robinhood Chain, send, wait.

import { CONFIG } from "./config.js";
import { getAddress, toHex } from "./vendor/viem.js";

const CHAIN_HEX = "0x" + CONFIG.chainId.toString(16);
export const provider = () => window.ethereum;

export async function connect() {
  if (!provider()) throw new Error("No wallet found in this browser. Install one such as Rabby or MetaMask, then reload this page.");
  const [a] = await provider().request({ method: "eth_requestAccounts" });
  await ensureChain();
  return getAddress(a);
}

/** The connected account without prompting, or null. */
export async function current() {
  if (!provider()) return null;
  const a = await provider().request({ method: "eth_accounts" }).catch(() => []);
  return a?.[0] ? getAddress(a[0]) : null;
}

export async function ensureChain() {
  const id = await provider().request({ method: "eth_chainId" });
  if (id === CHAIN_HEX) return;
  try {
    await provider().request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (e) {
    if (e.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await provider().request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: CHAIN_HEX, chainName: CONFIG.chainName, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [CONFIG.rpc], blockExplorerUrls: [CONFIG.explorer] }],
    });
  }
}

export function onAccounts(fn) {
  provider()?.on?.("accountsChanged", (a) => fn(a[0] ? getAddress(a[0]) : null));
}

/** Sends a transaction. Pons launches are heavy and estimates have come in
 *  short before, so every estimate gets a margin rather than being trusted. */
export async function send(from, { to, data, value = 0n }) {
  const params = { from, to, data, value: toHex(value) };
  const est = await provider().request({ method: "eth_estimateGas", params: [params] });
  return provider().request({ method: "eth_sendTransaction", params: [{ ...params, gas: toHex((BigInt(est) * 13n) / 10n) }] });
}

export async function call(to, data) {
  return provider().request({ method: "eth_call", params: [{ to, data }, "latest"] });
}

export async function waitReceipt(hash) {
  for (let i = 0; i < 240; i++) {
    const r = await provider().request({ method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("The transaction has not confirmed after six minutes. Check it in your wallet.");
}

/** A wallet error as a sentence a person can act on. */
export const why = (err) => (err?.code === 4001 ? "you declined it in your wallet" : err?.message || "the wallet refused it");

/** Signs a plain-text message (EIP-191 personal_sign), to prove which wallet is asking. */
export async function signMessage(account, message) {
  const hex = "0x" + Array.from(new TextEncoder().encode(message), (b) => b.toString(16).padStart(2, "0")).join("");
  return provider().request({ method: "personal_sign", params: [hex, account] });
}
