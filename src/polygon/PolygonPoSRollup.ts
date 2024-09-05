import {
  type AbiParameterToPrimitiveType,
  encodeAbiParameters,
  hexToBytes,
  keccak256,
  type Log,
  parseAbiParameters,
  toHex,
  zeroHash,
} from 'viem';
import { getBlock, getLogs, readContract } from 'viem/actions';
import { mainnet, polygon } from 'viem/chains';
import { EthProver } from '../eth/EthProver.js';
import { encodeRlpBlock } from '../rlp.js';
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
import { type abiHeaderTuple, posterEventAbi, rootChainAbi } from './abi.js';

export type PolygonPoSPoster = {
  readonly address: HexAddress;
  readonly topicHash: HexString32;
  readonly blockNumberStart: bigint;
};

export type PolygonPoSConfig = {
  rootChainAddress: HexAddress;
  apiURL: string;
  poster: PolygonPoSPoster;
};

export type PolygonPoSCommit = RollupCommit<EthProver> &
  AbiParameterToPrimitiveType<typeof abiHeaderTuple> & {
    readonly rlpEncodedProof: Uint8Array;
    readonly rlpEncodedBlock: Uint8Array;
  };

function extractPrevBlockHash(event: Log): HexString32 {
  return event.topics[1]!;
}

export class PolygonPoSRollup extends AbstractRollup<PolygonPoSCommit> {
  // // https://docs.polygon.technology/pos/reference/contracts/genesis-contracts/
  static readonly mainnetConfig = {
    chain1: mainnet.id,
    chain2: polygon.id,
    rootChainAddress: '0x86E4Dc95c7FBdBf52e33D563BbDB00823894C287',
    apiURL: 'https://proof-generator.polygon.technology/api/v1/matic/',
    poster: {
      // https://polygonscan.com/tx/0x092f9929973fee6a4fa101e9ed45c2b6ce072ac6e2f338f49cac70b41cacbc73
      address: '0x591663413423Dcf7c7806930E642951E0dDdf10B',
      blockNumberStart: 61150865n,
      topicHash: keccak256(toHex('NewRoot(bytes32)')),
    },
    transportConfig2: {
      retryCount: 5, // hack for failing eth_getProof
    },
  } as const satisfies RollupDeployment<PolygonPoSConfig>;

  readonly apiURL: string;
  readonly rootChain: { address: HexAddress; abi: typeof rootChainAbi };
  readonly poster: PolygonPoSPoster;

  constructor(clients: ClientPair, config: PolygonPoSConfig) {
    super(clients);
    this.apiURL = config.apiURL;
    this.poster = config.poster;
    this.rootChain = {
      address: config.rootChainAddress,
      abi: rootChainAbi,
    };
  }

  async findPosterEventBefore(l2BlockNumber: bigint) {
    // find the most recent post from poster
    // stop searching when earlier than poster deployment
    // (otherwise we scan back to genesis)
    for (
      let i = l2BlockNumber;
      i > this.poster.blockNumberStart;
      i -= this.getLogsStepSize
    ) {
      const logs = await getLogs(this.client2, {
        address: this.poster.address,
        event: posterEventAbi,
        fromBlock: i < this.getLogsStepSize ? 0n : i - this.getLogsStepSize,
        toBlock: i - 1n,
      });
      if (logs.length) return logs[logs.length - 1];
    }
    throw new Error(`no earlier root: ${l2BlockNumber}`);
  }
  async findPosterHeaderBefore(l2BlockNumber: bigint) {
    // find the most recent post that occurred before this block
    const event = await this.findPosterEventBefore(l2BlockNumber);
    // find the header that contained this transaction
    // 20240830: we want the header for the transaction
    // not the header containing the logged block hash
    return this.fetchAPIFindHeader(BigInt(event.blockNumber));
  }
  async fetchJSON(url: URL) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.url}: HTTP(${res.status})`);
    return res.json();
  }
  async fetchAPIFindHeader(l2BlockNumber: bigint) {
    const url = new URL(`./block-included/${l2BlockNumber}`, this.apiURL);
    const json = await this.fetchJSON(url);
    if (json.error) throw new Error(`Block(${l2BlockNumber}): ${json.message}`);
    const number = BigInt(json.headerBlockNumber);
    const l2BlockNumberStart = BigInt(json.start);
    const l2BlockNumberEnd = BigInt(json.end);
    const rootHash: HexString32 = json.root;
    return {
      number,
      l2BlockNumberStart,
      l2BlockNumberEnd,
      rootHash,
    };
  }
  // async fetchAPIHeaderProof(
  //   l2BlockNumber: bigint,
  //   l2BlockNumberStart: bigint,
  //   l2BlockNumberEnd: bigint
  // ) {
  //   const url = new URL(`./fast-merkle-proof`, this.apiURL);
  //   url.searchParams.set('start', l2BlockNumberStart.toString());
  //   url.searchParams.set('end', l2BlockNumberEnd.toString());
  //   url.searchParams.set('number', l2BlockNumber.toString());
  //   const json = await this.fetchJSON(url);
  //   const v = ethers.getBytes(json.proof);
  //   if (!v.length || v.length & 31) throw new Error('expected bytes32xN');
  //   return Array.from({ length: v.length >> 5 }, (_, i) =>
  //     v.subarray(i << 5, (i + 1) << 5)
  //   );
  // }
  async fetchAPIReceiptProof(txHash: HexString32) {
    const url = new URL(
      `./exit-payload/${txHash}?eventSignature=${this.poster.topicHash}`,
      this.apiURL
    );
    const json = await this.fetchJSON(url);
    if (json.error) throw new Error(`receipt proof: ${json.message}`);
    return hexToBytes(json.result);
  }
  override async fetchLatestCommitIndex(): Promise<bigint> {
    // find the end range of the last header
    const l2BlockNumberEnd = await readContract(this.client1, {
      ...this.rootChain,
      functionName: 'getLastChildBlock',
      blockTag: this.latestBlockTag,
    });
    // find the header before the end of the last header with a post
    const header = await this.findPosterHeaderBefore(l2BlockNumberEnd + 1n);
    return header.number;
  }
  protected override async _fetchParentCommitIndex(
    commit: PolygonPoSCommit
  ): Promise<bigint> {
    const header = await this.findPosterHeaderBefore(commit.l2BlockNumberStart);
    return header.number;
  }
  protected override async _fetchCommit(
    index: bigint
  ): Promise<PolygonPoSCommit> {
    // ensure checkpoint was finalized
    const [rootHash, l2BlockNumberStart, l2BlockNumberEnd] = await readContract(
      this.client1,
      {
        ...this.rootChain,
        functionName: 'headerBlocks',
        args: [index],
      }
    );
    if (rootHash === zeroHash) {
      throw new Error(`null checkpoint hash`);
    }
    // ensure checkpoint contains post
    const events = await getLogs(this.client2, {
      address: this.poster.address,
      event: posterEventAbi,
      fromBlock: l2BlockNumberStart,
      toBlock: l2BlockNumberEnd,
    });
    if (!events.length) throw new Error(`no poster`);
    const event = events[events.length - 1];
    const prevBlockHash = extractPrevBlockHash(event);
    // rlpEncodedProof:
    // 1. checkpoint index
    // 2. fast-merkle-proof => block in checkpoint
    // 3. receipt merkle patricia proof => tx in block
    // 4. receipt data: topic[1] w/prevBlockHash + logIndex
    // rlpEncodedBlock:
    // 5. hash() = prevBlockHash
    // 6. usable stateRoot!
    const [rlpEncodedProof, prevBlock] = await Promise.all([
      this.fetchAPIReceiptProof(event.transactionHash),
      getBlock(this.client2, {
        blockHash: prevBlockHash,
        includeTransactions: false,
      }),
    ]);
    if (!prevBlock) throw new Error('no prevBlock');
    const rlpEncodedBlock = hexToBytes(encodeRlpBlock(prevBlock));
    // if (ethers.keccak256(rlpEncodedBlock) !== prevBlockHash) {
    //   throw new Error('block hash mismatch`);
    // }
    const prover = new EthProver(this.client2, prevBlock.number);
    return {
      index,
      prover,
      rootHash,
      l2BlockNumberStart,
      l2BlockNumberEnd,
      rlpEncodedProof,
      rlpEncodedBlock,
    };
  }
  override encodeWitness(
    commit: PolygonPoSCommit,
    proofSeq: ProofSequence
  ): HexString {
    return encodeAbiParameters(
      parseAbiParameters(['(bytes, bytes, bytes[], bytes)']),
      [
        [
          toHex(commit.rlpEncodedProof),
          toHex(commit.rlpEncodedBlock),
          proofSeq.proofs,
          toHex(proofSeq.order),
        ],
      ]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    return sec;
  }

  // experimental idea: commit serialization
  JSONFromCommit(commit: PolygonPoSCommit) {
    return {
      index: toHex(commit.index),
      l2BlockNumber: commit.prover.blockNumber,
      l2BlockNumberStart: toHex(commit.l2BlockNumberStart),
      l2BlockNumberEnd: toHex(commit.l2BlockNumberEnd),
      rlpEncodedBlock: toHex(commit.rlpEncodedBlock),
      rlpEncodedProof: toHex(commit.rlpEncodedProof),
      rootHash: commit.rootHash,
    };
  }
  commitFromJSON(json: ReturnType<this['JSONFromCommit']>) {
    const commit: PolygonPoSCommit = {
      index: BigInt(json.index),
      prover: new EthProver(this.client2, json.l2BlockNumber),
      l2BlockNumberStart: BigInt(json.l2BlockNumberStart),
      l2BlockNumberEnd: BigInt(json.l2BlockNumberEnd),
      rlpEncodedProof: hexToBytes(json.rlpEncodedProof),
      rlpEncodedBlock: hexToBytes(json.rlpEncodedBlock),
      rootHash: json.rootHash,
    };
    this.configure?.(commit);
    return commit;
  }
}
