import type { RollupDeployment } from '../rollup.js';
import { ethers } from 'ethers';
import type { HexAddress, ProviderPair } from '../types.js';
import { PORTAL_ABI, GAME_FINDER_ABI } from './types.js';
import {
  CHAIN_BASE_SEPOLIA,
  CHAIN_MAINNET,
  CHAIN_OP,
  CHAIN_SEPOLIA,
} from '../chains.js';
import { AbstractOPRollup, type OPCommit } from './AbstractOPRollup.js';

// https://docs.optimism.io/chain/differences
// https://specs.optimism.io/fault-proof/stage-one/bridge-integration.html

export type OPFaultConfig = {
  OptimismPortal: HexAddress;
  GameFinder: HexAddress;
  gameTypes?: number[]; // if empty, dynamically uses respectedGameType()
};

type ABIFinalizedGame = {
  gameType: bigint;
  gameProxy: HexAddress;
  l2BlockNumber: bigint;
};

const callOptions = { blockTag: 'finalized' };

export class OPFaultRollup extends AbstractOPRollup {
  static readonly mainnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAIN_MAINNET,
    chain2: CHAIN_OP,
    // https://docs.optimism.io/chain/addresses
    OptimismPortal: '0xbEb5Fc579115071764c7423A4f12eDde41f106Ed',
    GameFinder: '0x5A8E83f0E728bEb821b91bB82cFAE7F67bD36f7e',
  } as const;
  static readonly baseTestnetConfig: RollupDeployment<OPFaultConfig> = {
    chain1: CHAIN_SEPOLIA,
    chain2: CHAIN_BASE_SEPOLIA,
    // https://docs.base.org/docs/base-contracts/#ethereum-testnet-sepolia
    OptimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
    GameFinder: '0x0f1449C980253b576aba379B11D453Ac20832a89',
  } as const;

  static async create(providers: ProviderPair, config: OPFaultConfig) {
    const optimismPortal = new ethers.Contract(
      config.OptimismPortal,
      PORTAL_ABI,
      providers.provider1
    );
    const gameFinder = new ethers.Contract(
      config.GameFinder,
      GAME_FINDER_ABI,
      providers.provider1
    );
    const bitMask = (config.gameTypes ?? []).reduce((a, x) => a | (1 << x), 0);
    return new this(providers, optimismPortal, gameFinder, bitMask);
  }
  private constructor(
    providers: ProviderPair,
    readonly OptimismPortal: ethers.Contract,
    readonly GameFinder: ethers.Contract,
    readonly gameTypeBitMask: number
  ) {
    super(providers);
  }

  async fetchRespectedGameType(): Promise<bigint> {
    return this.OptimismPortal.respectedGameType(callOptions);
  }

  override async fetchLatestCommitIndex(): Promise<bigint> {
    // the primary assumption is that the anchor root is the finalized state
    // however, this is strangely conditional on the gameType
    // (apparently because the anchor state registry is *not* intended for finalization)
    // after a gameType switch, the finalized state "rewinds" to the latest game of the new type
    // to solve this, we use the latest finalized game of *any* supported gameType
    // 20240820: correctly handles the aug 16 respectedGameType change
    // TODO: this should be simplified in the future once there is a better policy
    // 20240822: once again uses a helper contract to reduce rpc burden
    return this.GameFinder.findFinalizedGameIndex(
      this.OptimismPortal.target,
      this.gameTypeBitMask,
      0,
      callOptions
    );
  }
  override async fetchParentCommitIndex(commit: OPCommit) {
    return this.GameFinder.findFinalizedGameIndex(
      this.OptimismPortal.target,
      this.gameTypeBitMask,
      commit.index,
      callOptions
    );
  }
  override async fetchCommit(index: bigint) {
    const game: ABIFinalizedGame = await this.GameFinder.getFinalizedGame(
      this.OptimismPortal.target,
      this.gameTypeBitMask,
      index,
      callOptions
    );
    if (!game.l2BlockNumber) {
      throw new Error(`Game(${index}) not finalized`);
    }
    return this.createCommit(index, '0x' + game.l2BlockNumber.toString(16));
  }

  override windowFromSec(sec: number): number {
    // finalization time is on-chain
    // https://github.com/ethereum-optimism/optimism/blob/a81de910dc2fd9b2f67ee946466f2de70d62611a/packages/contracts-bedrock/src/dispute/FaultDisputeGame.sol#L590
    return sec;
  }
}
