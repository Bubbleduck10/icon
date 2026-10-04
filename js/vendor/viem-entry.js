// The few viem functions the site uses, bundled to one local file by
// mind/build-site-vendor.mjs so the pages load no third-party script at runtime.
export { encodeFunctionData, decodeFunctionResult, decodeEventLog, parseEventLogs, formatEther, parseEther, keccak256, toBytes, toHex, isAddress, getAddress } from "viem";
