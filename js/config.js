// Everything a deploy changes lives here.
//
// The name is set in this one place and every page reads it from here.

export const BRAND = {
  name: "Icon",
  // The platform's own token, $ICON, on Robinhood Chain. Once its address is set
  // here, the header links it and the home hero and every footer show the address
  // with a copy button.
  ticker: "ICON",
  token: "",
  tagline: "Every coin gets a face.",
  x: "https://x.com/iconagi", // the project's X profile
};

export const CONFIG = {
  // The mind service (mind/src/api.js). Every number on the site comes from
  // here or from chain; the site keeps no data of its own.
  api: "https://icon-service.onrender.com",

  chainId: 4663,
  chainName: "Robinhood Chain",
  rpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  // Where people trade a coin, given its address. Unset until Pons' own token
  // page URL is confirmed; until then the trade link goes to the explorer.
  tradeUrl: null,
  // Solana: a browser-friendly public RPC, used only to wait for confirmations.
  solRpc: "https://solana-rpc.publicnode.com",
  solExplorer: "https://solscan.io",
  // pump.fun's page for a coin, where Solana coins trade.
  pumpUrl: (mint) => `https://pump.fun/coin/${mint}`,
  // Where an ipfs:// logo is fetched from for display.
  ipfsGateway: "https://ipfs.io/ipfs/",

  // Pons charges a buy in the launch block a 99% tax that falls to zero over
  // three seconds, so the dev-buy button waits this long after the launch block.
  devBuyWaitSec: 6,
};

// Run locally, the site talks to a local service (or ?api=...), never the live one.
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  CONFIG.api = new URLSearchParams(location.search).get("api") || "http://127.0.0.1:8787";
}
