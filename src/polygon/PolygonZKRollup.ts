import {
  mainnet,
  polygonZkEvm,
  polygonZkEvmCardona,
  sepolia,
} from 'viem/chains';

import type { RollupDeployment } from '../rollup.js';
import type { HexAddress } from '../types.js';

export type PolygonZKConfig = {
  rollupManagerAddress: HexAddress;
};

export class PolygonZKRollup {
  static readonly mainnetConfig = {
    chain1: mainnet.id,
    chain2: polygonZkEvm.id,
    // https://docs.polygon.technology/zkEVM/architecture/high-level/smart-contracts/addresses/#mainnet-contracts
    rollupManagerAddress: '0x5132A183E9F3CB7C848b0AAC5Ae0c4f0491B7aB2',
  } as const satisfies RollupDeployment<PolygonZKConfig>;
  static readonly testnetConfig = {
    chain1: sepolia.id,
    chain2: polygonZkEvmCardona.id,
    // https://github.com/0xPolygonHermez/cdk-erigon/tree/zkevm#networks
    rollupManagerAddress: '0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff',
  } as const satisfies RollupDeployment<PolygonZKConfig>;
}
