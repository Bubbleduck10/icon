// The Solana wallet (Phantom, or any wallet that injects the same provider).
// Transactions are built by the service and arrive base64-encoded; the wallet
// signs and sends them. The transaction types are loaded only when needed.

import { CONFIG } from "./config.js";

export const provider = () => window.phantom?.solana ?? window.solana ?? null;

export async function connect() {
  const p = provider();
  if (!p) throw new Error("No Solana wallet found in this browser. Install Phantom, then reload this page.");
  const r = await p.connect();
  return r.publicKey.toString();
}

/** The connected account without prompting, or null. */
export async function current() {
  const p = provider();
  if (!p) return null;
  try {
    const r = await p.connect({ onlyIfTrusted: true });
    return r.publicKey.toString();
  } catch {
    return null;
  }
}

const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Signs and sends a base64 transaction the service built. Resolves to its signature. */
export async function signAndSend(b64) {
  const { VersionedTransaction } = await import("./vendor/solana.js");
  const tx = VersionedTransaction.deserialize(fromB64(b64));
  const { signature } = await provider().signAndSendTransaction(tx);
  return signature;
}

/**
 * Signs WITHOUT sending, for the launch: the service adds the new mint's
 * signature after checking the bytes are exactly what it built. Resolves to the
 * signed transaction, base64.
 */
export async function signOnly(b64) {
  const { VersionedTransaction } = await import("./vendor/solana.js");
  const tx = VersionedTransaction.deserialize(fromB64(b64));
  const signed = await provider().signTransaction(tx);
  let bin = "";
  for (const b of signed.serialize()) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Waits until the transaction is confirmed, or fails if it errored. */
export async function confirm(signature, { timeoutMs = 90_000 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await fetch(CONFIG.solRpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignatureStatuses", params: [[signature], { searchTransactionHistory: true }] }),
    })
      .then((x) => x.json())
      .catch(() => null);
    const s = r?.result?.value?.[0];
    if (s?.err) throw new Error("the transaction failed on chain");
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return s;
    await new Promise((res) => setTimeout(res, 1500));
  }
  throw new Error("the transaction has not confirmed after 90 seconds; check it in your wallet");
}

export const why = (err) => (err?.code === 4001 ? "you declined it in your wallet" : err?.message || "the wallet refused it");

/** Signs a plain-text message, to prove which wallet is asking. Resolves to the signature, base64. */
export async function signMessage(message) {
  const { signature } = await provider().signMessage(new TextEncoder().encode(message), "utf8");
  let bin = "";
  for (const b of signature) bin += String.fromCharCode(b);
  return btoa(bin);
}
