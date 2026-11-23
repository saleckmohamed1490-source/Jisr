/**
 * Coins offered at checkout. `code` is the NOWPayments ticker sent as
 * `pay_currency`. Check that each one is enabled in your NOWPayments dashboard
 * (Settings → Coins) — the list can be edited freely here.
 */
export type Coin = {
  code: string;
  symbol: string;
  network: string;
  /** Block explorer URL for a transaction hash. */
  explorer: (hash: string) => string;
};

const tronscan = (h: string) => `https://tronscan.org/#/transaction/${h}`;
const bscscan = (h: string) => `https://bscscan.com/tx/${h}`;
const etherscan = (h: string) => `https://etherscan.io/tx/${h}`;

export const COINS: Coin[] = [
  { code: "usdttrc20", symbol: "USDT", network: "TRC20 (Tron)", explorer: tronscan },
  { code: "usdtbsc", symbol: "USDT", network: "BEP20 (BNB Smart Chain)", explorer: bscscan },
  { code: "usdterc20", symbol: "USDT", network: "ERC20 (Ethereum)", explorer: etherscan },
  { code: "usdc", symbol: "USDC", network: "ERC20 (Ethereum)", explorer: etherscan },
  { code: "btc", symbol: "BTC", network: "Bitcoin", explorer: (h) => `https://mempool.space/tx/${h}` },
  { code: "eth", symbol: "ETH", network: "Ethereum", explorer: etherscan },
  { code: "bnbbsc", symbol: "BNB", network: "BEP20 (BNB Smart Chain)", explorer: bscscan },
  { code: "ltc", symbol: "LTC", network: "Litecoin", explorer: (h) => `https://blockchair.com/litecoin/transaction/${h}` },
  { code: "trx", symbol: "TRX", network: "Tron", explorer: tronscan },
];

export const DEFAULT_COIN = "usdttrc20";

export function findCoin(code: string | null | undefined): Coin | undefined {
  return COINS.find((c) => c.code === code?.toLowerCase());
}

export function explorerUrl(code: string | null | undefined, hash: string | null | undefined): string | null {
  if (!hash) return null;
  const coin = findCoin(code);
  return coin ? coin.explorer(hash) : null;
}
