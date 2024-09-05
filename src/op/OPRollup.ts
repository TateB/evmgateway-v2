import { readContract } from 'viem/actions';
import { base, blast, fraxtal, mainnet, zora } from 'viem/chains';

import type { RollupDeployment } from '../rollup.js';
import type { ClientPair, HexAddress } from '../types.js';
import { oracleAbi } from './abi.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';

export type OPConfig = {
  l2OutputOracleAddress: HexAddress;
};

export class OPRollup extends AbstractOPRollup {
  // https://docs.base.org/docs/base-contracts#base-mainnet
  static readonly baseMainnetConfig = {
    chain1: mainnet.id,
    chain2: base.id,
    l2OutputOracleAddress: '0x56315b90c40730925ec5485cf004d835058518A0',
  } as const satisfies RollupDeployment<OPConfig>;

  // https://docs.blast.io/building/contracts#mainnet
  static readonly blastMainnnetConfig = {
    chain1: mainnet.id,
    chain2: blast.id,
    l2OutputOracleAddress: '0x826D1B0D4111Ad9146Eb8941D7Ca2B6a44215c76',
  } as const satisfies RollupDeployment<OPConfig>;

  // https://docs.frax.com/fraxtal/addresses/fraxtal-contracts#mainnet
  static readonly fraxtalMainnetConfig = {
    chain1: mainnet.id,
    chain2: fraxtal.id,
    l2OutputOracleAddress: '0x66CC916Ed5C6C2FA97014f7D1cD141528Ae171e4',
  } as const satisfies RollupDeployment<OPConfig>;

  // https://docs.zora.co/zora-network/network#zora-network-mainnet-1
  static readonly zoraMainnetConfig = {
    chain1: mainnet.id,
    chain2: zora.id,
    l2OutputOracleAddress: '0x9E6204F750cD866b299594e2aC9eA824E2e5f95c',
  } as const satisfies RollupDeployment<OPConfig>;

  readonly l2OutputOracle: { address: HexAddress; abi: typeof oracleAbi };
  constructor(clients: ClientPair, config: OPConfig) {
    super(clients);
    this.l2OutputOracle = {
      address: config.l2OutputOracleAddress,
      abi: oracleAbi,
    };
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return readContract(this.client1, {
      ...this.l2OutputOracle,
      functionName: 'latestOutputIndex',
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: OPCommit
  ): Promise<bigint> {
    return commit.index - 1n;
  }
  protected override async _fetchCommit(index: bigint): Promise<OPCommit> {
    // this fails with ARRAY_RANGE_ERROR when invalid
    const output = await readContract(this.client1, {
      ...this.l2OutputOracle,
      functionName: 'getL2Output',
      args: [index],
    });
    return this.createCommit(index, output.l2BlockNumber);
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/L1/L2OutputOracle.sol#L231
    return sec;
  }
}
