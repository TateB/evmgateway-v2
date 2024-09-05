import { encodeAbiParameters, parseAbiParameters, toHex, zeroHash } from 'viem';
import { getBlock, getContractEvents, readContract } from 'viem/actions';
import {
  arbitrum,
  arbitrumNova,
  arbitrumSepolia,
  mainnet,
  sepolia,
} from 'viem/chains';

import { EthProver } from '../eth/EthProver.js';
import { encodeRlpBlock } from '../rlp.js';
import {
  AbstractRollupV1,
  type RollupCommit,
  type RollupDeployment,
} from '../rollup.js';
import type { ClientPair, HexAddress, HexString } from '../types.js';
import type { ProofSequence, ProofSequenceV1 } from '../vm.js';
import { rollupAbi } from './abi.js';

// https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro#the-rollup-chain

export type NitroConfig = {
  l2RollupAddress: HexAddress;
};

export type NitroCommit = RollupCommit<EthProver> & {
  readonly sendRoot: HexString;
  readonly rlpEncodedBlock: HexString;
};

export class NitroRollup extends AbstractRollupV1<NitroCommit> {
  // https://docs.arbitrum.io/build-decentralized-apps/reference/useful-addresses
  static readonly arb1MainnetConfig = {
    chain1: mainnet.id,
    chain2: arbitrum.id,
    l2RollupAddress: '0x5eF0D09d1E6204141B4d37530808eD19f60FBa35',
  } as const satisfies RollupDeployment<NitroConfig>;
  static readonly arbTestnetConfig = {
    chain1: sepolia.id,
    chain2: arbitrumSepolia.id,
    l2RollupAddress: '0xd80810638dbDF9081b72C1B33c65375e807281C8',
  } as const satisfies RollupDeployment<NitroConfig>;
  static readonly arbNovaMainnetConfig = {
    chain1: mainnet.id,
    chain2: arbitrumNova.id,
    l2RollupAddress: '0xFb209827c58283535b744575e11953DCC4bEAD88',
  } as const satisfies RollupDeployment<NitroConfig>;

  readonly l2Rollup: { address: HexAddress; abi: typeof rollupAbi };
  constructor(clients: ClientPair, config: NitroConfig) {
    super(clients);
    this.l2Rollup = { address: config.l2RollupAddress, abi: rollupAbi };
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    return readContract(this.client1, {
      ...this.l2Rollup,
      functionName: 'latestConfirmed',
      blockTag: this.latestBlockTag,
    });
  }
  protected override async _fetchParentCommitIndex(
    commit: NitroCommit
  ): Promise<bigint> {
    const node = await readContract(this.client1, {
      ...this.l2Rollup,
      functionName: 'getNode',
      args: [commit.index],
    });
    return node.prevNum;
  }
  protected override async _fetchCommit(index: bigint): Promise<NitroCommit> {
    const { createdAtBlock } = await readContract(this.client1, {
      ...this.l2Rollup,
      functionName: 'getNode',
      args: [index],
    });
    if (!createdAtBlock) throw new Error('unknown node');
    const [event] = await getContractEvents(this.client1, {
      ...this.l2Rollup,
      eventName: 'NodeCreated',
      args: { nodeNum: index },
      fromBlock: createdAtBlock,
      toBlock: createdAtBlock,
    });
    if (!event) {
      throw new Error('no NodeCreated event');
    }
    // ethers bug: named abi parsing doesn't propagate through event tuples
    // [4][1][0][0] == event.args.afterState.globalState.bytes32Vals[0];
    const [blockHash, sendRoot] =
      event.args.assertion!.afterState.globalState.bytes32Vals;
    const block = await getBlock(this.client2, {
      blockHash,
      includeTransactions: false,
    });
    const rlpEncodedBlock = encodeRlpBlock(block);
    const prover = new EthProver(this.client2, block.number);
    return {
      index,
      prover,
      sendRoot,
      rlpEncodedBlock,
    };
  }
  override encodeWitness(
    commit: NitroCommit,
    proofSeq: ProofSequence
  ): HexString {
    return encodeAbiParameters(
      parseAbiParameters('uint256, bytes32, bytes, bytes[], bytes'),
      [
        commit.index,
        commit.sendRoot,
        commit.rlpEncodedBlock,
        proofSeq.proofs,
        toHex(proofSeq.order),
      ]
    );
  }
  override encodeWitnessV1(
    commit: NitroCommit,
    proofSeq: ProofSequenceV1
  ): HexString {
    return encodeAbiParameters(
      parseAbiParameters(
        '(bytes32 version, bytes32 sendRoot, uint64 nodeIndex, bytes rlpEncodedBlock), (bytes, bytes[])'
      ),
      [
        {
          version: zeroHash,
          sendRoot: commit.sendRoot,
          nodeIndex: commit.index,
          rlpEncodedBlock: commit.rlpEncodedBlock,
        },
        [proofSeq.accountProof, proofSeq.storageProofs],
      ]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // the delta between createdAtBlock is a sufficient proxy
    return Math.ceil(sec / 12); // units of L1 blocks
  }
}
