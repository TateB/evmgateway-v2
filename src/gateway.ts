import { type AbiParametersToPrimitiveTypes, type ParseAbiItem } from 'abitype';
import {
  encodeAbiParameters,
  encodePacked,
  keccak256,
  toHex,
  type AbiFunction,
  type Address,
  type Hex,
} from 'viem';

import { CachedMap, CachedValue, LRU } from './cached.js';
import {
  AbstractRollupV1,
  type Rollup,
  type RollupCommitType,
} from './rollup.js';
import { DataRequestV1 } from './v1.js';

type ParseAbiFunction<signature extends string> =
  ParseAbiItem<signature> extends AbiFunction ? ParseAbiItem<signature> : never;

type AddAbiHandlerParameters<signature extends string> = {
  type: signature;
  handle: AbiFunctionHandler<ParseAbiFunction<signature>>;
};

type RpcRequest = {
  to: Address;
  data: Hex;
};
export type AbiFunctionHandler<
  abiFunc extends AbiFunction,
  returnType extends AbiParametersToPrimitiveTypes<abiFunc['outputs']> | Hex =
    | AbiParametersToPrimitiveTypes<abiFunc['outputs']>
    | Hex,
> = (
  args: AbiParametersToPrimitiveTypes<abiFunc['inputs']>,
  req: RpcRequest
) => Promise<returnType> | returnType;
export type GenericRouter = {
  add: <signature extends string>(
    params: AddAbiHandlerParameters<signature>
  ) => void;
};

const proveRequestAbiSnippet =
  'function proveRequest(bytes context, (bytes ops, bytes[] inputs)) returns (bytes)' as const;
const getStorageSlotsAbiSnippet =
  'function getStorageSlots(address target, bytes32[] commands, bytes[] constants) returns (bytes)' as const;

export const GATEWAY_ABI = [proveRequestAbiSnippet, getStorageSlotsAbiSnippet];

export class Gateway<R extends Rollup> {
  // the max number of non-latest commitments to keep in memory
  commitDepth = 2;
  // if true, requests beyond the commit depth are still supported
  allowHistorical = false;
  private readonly latestCache = new CachedValue(() =>
    this.rollup.fetchLatestCommitIndex()
  );
  private readonly commitCacheMap = new CachedMap<bigint, RollupCommitType<R>>(
    Infinity
  );
  private readonly parentCacheMap = new CachedMap<bigint, bigint>(Infinity);
  readonly callLRU = new LRU<string, Hex>(1000);
  constructor(readonly rollup: R) {}

  register<router extends GenericRouter>(router: router) {
    router.add({
      type: proveRequestAbiSnippet,
      handle: async ([ctx, { ops, inputs }]) => {
        // given the requested commitment, we answer: min(requested, latest)
        const commit = await this.getRecentCommit(BigInt(ctx.slice(0, 66)));
        // we cannot hash the context.calldata directly because the requested
        // commit might be different, so we hash using the determined commit
        const hash = keccak256(
          encodePacked(
            ['uint256', 'bytes', 'bytes[]'],
            [commit.index, ops, inputs]
          )
        );
        // NOTE: for a given commit + request, calls are pure
        return this.callLRU.cache(hash, async () => {
          const state = await commit.prover.evalDecoded(ops, inputs);
          const proofSeq = await commit.prover.prove(state.needs);
          return this.rollup.encodeWitness(commit, proofSeq);
        });
      },
    });

    const rollup = this.rollup;
    if (rollup instanceof AbstractRollupV1) {
      router.add({
        type: getStorageSlotsAbiSnippet,
        handle: async ([target, commands, constants], context) => {
          const commit = await this.getLatestCommit();
          const hash = keccak256(toHex(`${commit.index}:${context.data}`));
          return this.callLRU.cache(hash, async () => {
            const req = new DataRequestV1(
              target,
              [...commands],
              [...constants]
            ).v2(); // upgrade v1 to v2
            const state = await commit.prover.evalRequest(req);
            const proofSeq = await commit.prover.proveV1(state.needs);
            const witness = rollup.encodeWitnessV1(commit, proofSeq);
            return encodeAbiParameters([{ type: 'bytes' }], [witness]);
          });
        },
      });
    }
  }

  async getLatestCommit() {
    // check if the commit changed
    const prev = await this.latestCache.value;
    const next = await this.latestCache.get();
    const commit = await this.cachedCommit(next);
    const max = this.commitDepth + 1;
    if (prev !== next && this.commitCacheMap.cachedSize > max) {
      // purge the oldest if we have too many
      const old = [...this.commitCacheMap.cachedKeys()].sort().slice(0, -max);
      for (const key of old) {
        this.commitCacheMap.delete(key);
      }
    }
    return commit;
  }
  async getRecentCommit(index: bigint) {
    let commit = await this.getLatestCommit();
    for (let depth = 0; ; ) {
      if (index >= commit.index) return commit;
      if (++depth >= this.commitDepth) break;
      const prevIndex = await this.cachedParentCommitIndex(commit);
      commit = await this.cachedCommit(prevIndex);
    }
    if (this.allowHistorical) {
      return this.commitCacheMap.get(
        index,
        (i) => this.rollup.fetchCommit(i),
        0 // dont cache it
      );
    }
    throw new Error(`too old: ${index}`);
  }
  private async cachedParentCommitIndex(
    commit: RollupCommitType<R>
  ): Promise<bigint> {
    return this.parentCacheMap.get(commit.index, async () => {
      const index = await this.rollup.fetchParentCommitIndex(commit);
      if (index < 0) throw new Error(`no parent commit: ${commit.index}`);
      return index;
    });
  }
  private async cachedCommit(index: bigint) {
    return this.commitCacheMap.get(index, (i) => this.rollup.fetchCommit(i));
  }
}

// assumption: serves latest finalized commit
export abstract class GatewayV1<R extends Rollup> {
  private latestCommit: RollupCommitType<R> | undefined;
  private readonly latestCache = new CachedValue(() =>
    this.rollup.fetchLatestCommitIndex()
  );
  readonly callLRU = new LRU<string, Hex>();

  constructor(readonly rollup: R) {}

  register<router extends GenericRouter>(router: router) {
    router.add({
      type: getStorageSlotsAbiSnippet,
      handle: async ([target, commands, constants], context) => {
        const commit = await this.getLatestCommit();
        const hash = keccak256(toHex(`${commit.index}:${context.data}`));
        return this.callLRU.cache(hash, async () => {
          const req = new DataRequestV1(target, [...commands], [...constants]);
          return await this.handleRequest(commit, req);
        });
      },
    });
  }

  async getLatestCommit() {
    const index = await this.latestCache.get();
    if (!this.latestCommit || index != this.latestCommit.index) {
      this.latestCommit = await this.rollup.fetchCommit(index);
    }
    return this.latestCommit;
  }
  // since every legacy gateway does "its own thing"
  // we forward the responsibility of generating a response
  abstract handleRequest(
    commit: RollupCommitType<R>,
    request: DataRequestV1
  ): Promise<Hex>;
}
