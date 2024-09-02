import type { Chain } from './types.js';

export const CHAINS = {
  MAINNET: 1n,
  SEPOLIA: 11155111n,
  OP: 10n,
  OP_SEPOLIA: 11155420n,
  ZKSYNC: 324n,
  ZKSYNC_SEPOLIA: 300n,
  BASE: 8453n,
  BASE_SEPOLIA: 84532n,
  ARB1: 42161n,
  ARB_NOVA: 42170n,
  ARB_SEPOLIA: 421614n,
  TAIKO: 167000n,
  TAIKO_HEKLA: 167009n,
  SCROLL: 534352n,
  SCROLL_SEPOLIA: 534351n,
  POLYGON_ZKEVM: 1101n,
  POLYGON_ZKEVM_CARDONA: 2442n,
  POLYGON_POS: 137n,
  POLYGON_AMOY: 80002n,
  LINEA: 59144n,
  LINEA_SEPOLIA: 59141n,
  FRAXTAL: 252n,
  ZORA: 7777777n,
  BLAST: 81457n,
} as const satisfies Record<string, Chain>;
