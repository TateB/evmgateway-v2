import type { BlockTag, Client, TransportConfig } from 'viem';

import type { ChainPair, ClientPair, HexString } from './types.js';
import type { AbstractProver, ProofSequence, ProofSequenceV1 } from './vm.js';

export type RollupDeployment<Config> = Readonly<
  ChainPair &
    Config & {
      transportConfig1?: Partial<TransportConfig>;
      transportConfig2?: Partial<TransportConfig>;
    }
>;

export type RollupCommit<P extends AbstractProver> = {
  readonly index: bigint;
  readonly prover: P;
};

export type Rollup = AbstractRollup<RollupCommit<AbstractProver>>;

export type RollupCommitType<R extends Rollup> = Parameters<
  R['fetchParentCommitIndex']
>[0];

export abstract class AbstractRollup<
  commit extends RollupCommit<AbstractProver>,
  client2 extends Client = Client,
  client1 extends Client = Client,
> {
  // allows configuration of commit and prover
  // "expand LRU cache" => prover.proofLRU.maxCached = 1_000_000
  // "disable fast cache" => prover.fastCache = undefined
  // "keep fast cache around longer" => prover.fastCache?.cacheMs = Infinity
  // "limit targets" => prover.maxUniqueTargets = 1
  configure: (<T extends commit>(commit: T) => void) | undefined;
  latestBlockTag: BlockTag = 'finalized';
  getLogsStepSize = 1000n;
  readonly client1: client1;
  readonly client2: client2;
  constructor({ client1, client2 }: ClientPair<client2, client1>) {
    this.client1 = client1;
    this.client2 = client2;
  }
  abstract fetchLatestCommitIndex(): Promise<bigint>;
  protected abstract _fetchParentCommitIndex(commit: commit): Promise<bigint>;
  protected abstract _fetchCommit(index: bigint): Promise<commit>;
  abstract encodeWitness(commit: commit, proofSeq: ProofSequence): HexString;
  abstract windowFromSec(sec: number): number;

  // abstract wrappers
  async fetchParentCommitIndex(commit: commit) {
    try {
      if (!commit.index) throw undefined;
      const index = await this._fetchParentCommitIndex(commit);
      if (index >= commit.index) throw new Error('bug');
      if (index < 0) throw undefined;
      return index;
    } catch (cause) {
      throw new Error(`no parent commit: ${commit.index}`, { cause });
    }
  }
  async fetchCommit(index: bigint) {
    try {
      const commit = await this._fetchCommit(index);
      this.configure?.(commit);
      return commit;
    } catch (cause) {
      throw new Error(`invalid commit: ${index}`, { cause });
    }
  }

  // convenience
  async fetchLatestCommit() {
    return this.fetchCommit(await this.fetchLatestCommitIndex());
  }
  async fetchParentCommit(commit: commit) {
    return this.fetchCommit(await this.fetchParentCommitIndex(commit));
  }
  async fetchRecentCommits(count: number): Promise<commit[]> {
    if (count < 1) return [];
    let commit = await this.fetchLatestCommit();
    const v = [commit];
    while (v.length < count && commit.index > 0) {
      commit = await this.fetchParentCommit(commit);
      v.push(commit);
    }
    return v;
  }
  get defaultWindow() {
    return this.windowFromSec(86400);
  }
}

export abstract class AbstractRollupV1<
  commit extends RollupCommit<AbstractProver>,
> extends AbstractRollup<commit> {
  abstract encodeWitnessV1(
    commit: commit,
    proofSeq: ProofSequenceV1
  ): HexString;
}
