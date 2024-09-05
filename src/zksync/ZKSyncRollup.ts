import { decodeFunctionData, encodeAbiParameters, toHex, zeroHash } from 'viem';
import { getContractEvents, getTransaction, readContract } from 'viem/actions';
import { mainnet, sepolia, zksync, zksyncSepoliaTestnet } from 'viem/chains';

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
import { ZKSyncProver } from './ZKSyncProver.js';
import { commitBatchesAbiSnippet, diamondProxyAbi } from './abi.js';
import { type ZKSyncClient } from './types.js';

// https://docs.zksync.io/zk-stack/concepts/finality
// https://github.com/matter-labs/era-contracts/tree/main/
// https://github.com/getclave/zksync-storage-proofs
// https://uptime.com/statuspage/era
export type ZKSyncConfig = {
  diamondProxyAddress: HexAddress;
};

export type ZKSyncCommit = RollupCommit<ZKSyncProver> & {
  readonly stateRoot: HexString32;
  readonly abiEncodedBatch: HexString;
};

export class ZKSyncRollup extends AbstractRollup<ZKSyncCommit, ZKSyncClient> {
  // https://docs.zksync.io/build/developer-reference/era-contracts/l1-contracts
  static readonly mainnetConfig = {
    chain1: mainnet.id,
    chain2: zksync.id,
    diamondProxyAddress: '0x32400084c286cf3e17e7b677ea9583e60a000324',
  } as const satisfies RollupDeployment<ZKSyncConfig>;
  static readonly testnetConfig = {
    chain1: sepolia.id,
    chain2: zksyncSepoliaTestnet.id,
    diamondProxyAddress: '0x9a6de0f62Aa270A8bCB1e2610078650D539B1Ef9',
  } as const satisfies RollupDeployment<ZKSyncConfig>;

  readonly diamondProxy: { address: HexAddress; abi: typeof diamondProxyAbi };

  constructor(clients: ClientPair<ZKSyncClient>, config: ZKSyncConfig) {
    super(clients);
    this.diamondProxy = {
      address: config.diamondProxyAddress,
      abi: diamondProxyAbi,
    };
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    const count = await readContract(this.client1, {
      ...this.diamondProxy,
      functionName: 'getTotalBatchesExecuted',
      blockTag: this.latestBlockTag,
    });
    return count - 1n;
  }
  protected override async _fetchParentCommitIndex(
    commit: ZKSyncCommit
  ): Promise<bigint> {
    return commit.index - 1n;
  }
  protected override async _fetchCommit(index: bigint): Promise<ZKSyncCommit> {
    const batchIndex = Number(index);
    const details = await this.client2.request({
      method: 'zks_getL1BatchDetails',
      params: [batchIndex], // rpc requires number
    });
    if (!details) throw new Error('no batch details');
    // 20240810: this check randomly fails even though the block is finalized
    // if (details.status !== 'verified') {
    //   throw new Error(`not verified: ${details.status}`);
    // }
    const { rootHash, commitTxHash } = details;
    if (!rootHash || !commitTxHash) {
      throw new Error(`Batch(${index}) not finalized`);
    }

    const [tx, [log], l2LogsTreeRoot] = await Promise.all([
      getTransaction(this.client1, { hash: commitTxHash }),
      getContractEvents(this.client1, {
        ...this.diamondProxy,
        eventName: 'BlockCommit',
        args: {
          batchNumber: index,
          batchHash: rootHash,
        },
        fromBlock: 0n,
        toBlock: 'latest',
      }),
      readContract(this.client1, {
        ...this.diamondProxy,
        functionName: 'l2LogsRootHash',
        args: [index],
      }),
    ]);
    if (!tx || !log) {
      throw new Error(`unable to find commit tx: ${commitTxHash}`);
    }
    if (l2LogsTreeRoot === zeroHash) throw new Error('not finalized');
    const {
      args: [, , commits],
    } = decodeFunctionData({
      abi: commitBatchesAbiSnippet,
      data: tx.input,
    });
    const batchInfo = commits.find((x) => x.batchNumber == index);
    if (!batchInfo) {
      throw new Error(`expected batch in commit`);
    }
    const abiEncodedBatch = encodeAbiParameters(
      // StoredBatchInfo struct
      commitBatchesAbiSnippet[0].inputs[1].components,
      [
        batchInfo.batchNumber, // == index
        batchInfo.newStateRoot, // == details.rootHash
        batchInfo.indexRepeatedStorageChanges,
        batchInfo.numberOfLayer1Txs,
        batchInfo.priorityOperationsHash,
        l2LogsTreeRoot,
        batchInfo.timestamp,
        log.args.commitment!,
      ]
    );
    const prover = new ZKSyncProver(this.client2, batchIndex);
    return {
      index,
      prover,
      stateRoot: rootHash,
      abiEncodedBatch,
    };
  }
  override encodeWitness(
    commit: ZKSyncCommit,
    proofSeq: ProofSequence
  ): HexString {
    return encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }, { type: 'bytes' }],
      [commit.abiEncodedBatch, proofSeq.proofs, toHex(proofSeq.order)]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time not on-chain
    // approximately 1 batch every hour, sequential
    // https://explorer.zksync.io/batches/
    return Math.ceil(sec / 3600); // units of commit index
  }
}
