/**
 * Explorer links helper for real on-chain transaction & address navigation.
 */
export function getExplorerTxUrl(chain = "ethereum", txHash: string): string {
  const c = chain.toLowerCase();
  if (c.includes("polygon")) return `https://polygonscan.com/tx/${txHash}`;
  if (c.includes("arbitrum")) return `https://arbiscan.io/tx/${txHash}`;
  if (c.includes("base")) return `https://basescan.org/tx/${txHash}`;
  if (c.includes("bsc") || c.includes("binance")) return `https://bscscan.com/tx/${txHash}`;
  return `https://eth.blockscout.com/tx/${txHash}`;
}

export function getExplorerAddressUrl(chain = "ethereum", address: string): string {
  const c = chain.toLowerCase();
  if (c.includes("polygon")) return `https://polygonscan.com/address/${address}`;
  if (c.includes("arbitrum")) return `https://arbiscan.io/address/${address}`;
  if (c.includes("base")) return `https://basescan.org/address/${address}`;
  if (c.includes("bsc") || c.includes("binance")) return `https://bscscan.com/address/${address}`;
  return `https://eth.blockscout.com/address/${address}`;
}
