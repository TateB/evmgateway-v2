import { ethers } from 'ethers';
import type {
  EncodedProof,
  HexAddress,
  HexString,
  HexString32,
  ProviderPair,
} from '../types.js';
import { LineaProver } from './LineaProver.js';
import { ROLLUP_ABI } from './types.js';
import {
  CHAIN_LINEA,
  CHAIN_LINEA_SEPOLIA,
  CHAIN_MAINNET,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { CachedMap } from '../cached.js';
import {
  type RollupDeployment,
  type RollupCommit,
  AbstractRollup,
} from '../rollup.js';
import { ABI_CODER } from '../utils.js';

// https://docs.linea.build/developers/quickstart/ethereum-differences
// https://github.com/Consensys/linea-contracts
// https://consensys.io/diligence/audits/2024/06/linea-ens/
// https://github.com/Consensys/linea-monorepo/blob/main/contracts/test/SparseMerkleProof.ts
// https://github.com/Consensys/linea-ens/blob/main/packages/linea-state-verifier/contracts/LineaSparseProofVerifier.sol

export type LineaCommit = RollupCommit<LineaProver> & {
  readonly stateRoot: HexString32;
};

export type LineaConfig = {
  L1MessageService: HexAddress;
  SparseMerkleProof: HexAddress;
};

export class LineaRollup extends AbstractRollup<LineaCommit> {
  // https://docs.linea.build/developers/quickstart/info-contracts
  static readonly mainnetConfig: RollupDeployment<LineaConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_LINEA,
    L1MessageService: '0xd19d4B5d358258f05D7B411E21A1460D11B0876F',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/mainnet/SparseMerkleProof.json
    SparseMerkleProof: '0xBf8C454Af2f08fDD90bB7B029b0C2c07c2a7b4A3',
  } as const;
  static readonly testnetConfig: RollupDeployment<LineaConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_LINEA_SEPOLIA,
    L1MessageService: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
    // https://github.com/Consensys/linea-ens/blob/main/packages/linea-ens-resolver/deployments/sepolia/SparseMerkleProof.json
    SparseMerkleProof: '0x718D20736A637CDB15b6B586D8f1BF081080837f',
  } as const;

  readonly L1MessageService: ethers.Contract;
  constructor(providers: ProviderPair, config: LineaConfig) {
    super(providers);
    this.L1MessageService = new ethers.Contract(
      config.L1MessageService,
      ROLLUP_ABI,
      this.provider1
    );
  }

  async fetchLatestCommitIndex(): Promise<bigint> {
    return this.L1MessageService.currentL2BlockNumber({
      blockTag: 'finalized',
    });
  }
  async fetchParentCommitIndex(commit: LineaCommit): Promise<bigint> {
    // find the starting state root
    const [log] = await this.L1MessageService.queryFilter(
      this.L1MessageService.filters.DataFinalized(
        commit.index,
        null,
        commit.stateRoot
      )
    );
    if (log) {
      // find the block that finalized this root
      const prevStateRoot = log.topics[2];
      const [prevLog] = await this.L1MessageService.queryFilter(
        this.L1MessageService.filters.DataFinalized(null, null, prevStateRoot)
      );
      if (prevLog) return BigInt(prevLog.topics[1]); // l2BlockNumber
    }
    return -1n;
  }
  async fetchCommit(index: bigint): Promise<LineaCommit> {
    const stateRoot: HexString32 =
      await this.L1MessageService.stateRootHashes(index);
    if (stateRoot === ethers.ZeroHash) {
      throw new Error('not finalized');
    }
    return {
      index,
      stateRoot,
      prover: new LineaProver(
        this.provider2,
        '0x' + index.toString(16),
        new CachedMap(Infinity, this.commitCacheSize)
      ),
    };
  }
  encodeWitness(
    commit: LineaCommit,
    proofs: EncodedProof[],
    order: Uint8Array
  ): HexString {
    return ABI_CODER.encode(
      ['uint256', 'bytes[]', 'bytes'],
      [commit.index, proofs, order]
    );
  }

  override windowFromSec(sec: number): number {
    // finalization time is not on-chain
    // https://docs.linea.build/developers/guides/bridge/how-to-bridge-eth#bridge-eth-from-linea-mainnet-l2-to-ethereum-mainnet-l1
    // "Reminder: It takes at least 8 hours for the transaction to go through from L2 to L1."
    // 20240815: heuristic based on mainnet data
    // https://etherscan.io/advanced-filter?tadd=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c&ps=25&eladd=0xd19d4B5d358258f05D7B411E21A1460D11B0876F&eltpc=0x1335f1a2b3ff25f07f5fef07dd35d8fb4312c3c73b138e2fad9347b3319ab53c
    const blocksPerCommit = 5000; // every 2000-8000+ L2 blocks
    const secPerCommit = 2 * 3600; // every ~2 hours
    return blocksPerCommit * Math.ceil(sec / secPerCommit); // units of commit
  }
}
