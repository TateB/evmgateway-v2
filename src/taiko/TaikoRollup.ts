import { encodeAbiParameters, toHex } from 'viem';
import { getBlock, readContract } from 'viem/actions';
import { mainnet, taiko } from 'viem/chains';

import { EthProver } from '../eth/EthProver.js';
import {
  AbstractRollup,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type {
  ClientPair,
  HexAddress,
  HexString,
  HexString32,
} from '../types.js';
import type { ProofSequence } from '../vm.js';
import { taikoL1Abi } from './abi.js';

// https://github.com/taikoxyz/taiko-mono/tree/main/packages/protocol/contracts
// https://docs.taiko.xyz/network-reference/differences-from-ethereum
// https://status.taiko.xyz/

export type TaikoConfig = {
  taikoL1Address: HexAddress;
  // some multiple of the stateRootSyncInternal
  // use 0 to step by 1
  commitBatchSpan: number;
};

export type TaikoCommit = RollupCommit<EthProver> & {
  readonly parentHash: HexString32;
};

export class TaikoRollup extends AbstractRollup<TaikoCommit> {
  static readonly mainnetConfig = {
    chain1: mainnet.id,
    chain2: taiko.id,
    taikoL1Address: '0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a', // based.taiko.eth
    commitBatchSpan: 1,
  } as const satisfies RollupDeployment<TaikoConfig>;

  static async create(clients: ClientPair, config: TaikoConfig) {
    const taikoL1 = {
      address: config.taikoL1Address,
      abi: taikoL1Abi,
    } as const;
    if (config.commitBatchSpan <= 0) return new this(clients, taikoL1, 1n);

    const onchainConfig = await readContract(clients.client1, {
      ...taikoL1,
      functionName: 'getConfig',
    });
    const commitStep = BigInt(
      onchainConfig.stateRootSyncInternal * config.commitBatchSpan
    );
    return new this(clients, taikoL1, commitStep);
  }
  private constructor(
    clients: ClientPair,
    readonly taikoL1: { address: HexAddress; abi: typeof taikoL1Abi },
    readonly commitStep: bigint
  ) {
    super(clients);
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    // https://github.com/taikoxyz/taiko-mono/blob/main/packages/protocol/contracts/L1/libs/LibUtils.sol
    // by definition this is shouldSyncStateRoot()
    // eg. (block % 16) == 15
    const [blockId] = await readContract(this.client1, {
      ...this.taikoL1,
      functionName: 'getLastSyncedBlock',
      blockTag: this.latestBlockTag,
    });
    return blockId;
  }
  protected override async _fetchParentCommitIndex(
    commit: TaikoCommit
  ): Promise<bigint> {
    if (this.commitStep > 1) {
      // remove any unaligned remainder (see above)
      const rem = (commit.index + 1n) % this.commitStep;
      if (rem) return commit.index - rem;
    }
    return commit.index - this.commitStep;
  }
  protected override async _fetchCommit(index: bigint): Promise<TaikoCommit> {
    const block = await getBlock(this.client2, {
      blockNumber: index,
      includeTransactions: false,
    });
    const prover = new EthProver(this.client2, block.number);
    return {
      index,
      prover,
      parentHash: block.parentHash,
    };
  }
  override encodeWitness(
    commit: TaikoCommit,
    proofSeq: ProofSequence
  ): HexString {
    return encodeAbiParameters(
      [
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes[]' },
        { type: 'bytes' },
      ],
      [commit.index, commit.parentHash, proofSeq.proofs, toHex(proofSeq.order)]
    );
  }

  override windowFromSec(sec: number): number {
    // taiko is a based rollup
    const avgBlockSec = 16; // block every block 12-20 sec
    const avgCommitSec = avgBlockSec * Number(this.commitStep); // time between syncs
    return Math.ceil(sec / avgCommitSec);
  }
}
