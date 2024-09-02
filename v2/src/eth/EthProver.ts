import type { EncodedProof, HexString, Provider } from '../types.js';
import type {
  EthAccountProof,
  EthProof,
  EthStorageProof,
  RPCEthGetBlock,
  RPCEthGetProof,
} from './types.js';
import { AbstractProver, makeStorageKey, type Need } from '../vm.js';
import { ZeroHash, toBeHex } from 'ethers';
import {
  ABI_CODER,
  NULL_CODE_HASH,
  sendRetry,
  toString16,
  withResolvers,
} from '../utils.js';

function isContract(proof: EthAccountProof) {
  return (
    proof.codeHash !== NULL_CODE_HASH && proof.keccakCodeHash !== NULL_CODE_HASH
  );
}

function encodeProof(proof: EthProof): EncodedProof {
  return ABI_CODER.encode(['bytes[]'], [proof]);
}

export class EthProver extends AbstractProver {
  static async latest(provider: Provider) {
    return new this(provider, toString16(await provider.getBlockNumber()));
  }
  proofRetryCount = 0;
  constructor(
    readonly provider: Provider,
    readonly block: HexString
  ) {
    super();
  }
  async fetchStateRoot() {
    // this is just a convenience
    const blockInfo: RPCEthGetBlock = await this.provider.send(
      'eth_getBlockByNumber',
      [this.block, false]
    );
    return blockInfo.stateRoot;
  }
  async fetchProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    const ps = [];
    for (let i = 0; ; ) {
      ps.push(
        sendRetry<RPCEthGetProof>(
          this.provider,
          'eth_getProof',
          [
            target,
            slots
              .slice(i, (i += this.proofBatchSize))
              .map((slot) => toBeHex(slot, 32)),
            this.block,
          ],
          this.proofRetryCount
        )
      );
      if (i >= slots.length) break;
    }
    const vs = await Promise.all(ps);
    for (let i = 1; i < vs.length; i++) {
      vs[0].storageProof.push(...vs[i].storageProof);
    }
    return vs[0];
  }
  async getProofs(
    target: HexString,
    slots: bigint[] = []
  ): Promise<RPCEthGetProof> {
    target = target.toLowerCase();
    const missing: number[] = []; // indices of slots we dont have proofs for
    const { promise, resolve, reject } = withResolvers(); // create a blocker
    // 20240708: must setup blocks before await
    let accountProof: Promise<EthAccountProof> | EthAccountProof | undefined =
      this.proofLRU.touch(target);
    if (!accountProof) {
      // missing account proof, so block it
      this.proofLRU.setPending(
        target,
        promise.then(() => accountProof)
      );
    }
    // check if we're missing any slots
    const storageProofs: (
      | Promise<EthStorageProof>
      | EthStorageProof
      | undefined
    )[] = slots.map((slot, i) => {
      const key = makeStorageKey(target, slot);
      const p = this.proofLRU.touch(key);
      if (!p) {
        // missing storage proof, so block it
        this.proofLRU.setPending(
          key,
          promise.then(() => storageProofs[i])
        );
        missing.push(i);
      }
      return p;
    });
    // check if we need something
    if (!accountProof || missing.length) {
      try {
        const { storageProof: v, ...a } = await this.fetchProofs(
          target,
          missing.map((x) => slots[x])
        );
        // update cache
        accountProof = a;
        missing.forEach((x, i) => (storageProofs[x] = v[i]));
        resolve(); // unblock
      } catch (err) {
        reject(err);
        throw err;
      }
    }
    // reassemble
    const [a, v] = await Promise.all([
      accountProof,
      Promise.all(storageProofs),
    ]);
    return { storageProof: v as EthStorageProof[], ...a };
  }
  override async getStorage(
    target: HexString,
    slot: bigint
  ): Promise<HexString> {
    target = target.toLowerCase();
    // check to see if we know this target isn't a contract without invoking provider
    // this is almost equivalent to: await isContract(target)
    const accountProof: EthAccountProof | undefined =
      await this.proofLRU.touch(target);
    if (accountProof && !isContract(accountProof)) {
      return ZeroHash;
    }
    // check to see if we've already have a proof for this value
    const storageKey = makeStorageKey(target, slot);
    const storageProof: EthStorageProof | undefined =
      await this.proofLRU.touch(storageKey);
    if (storageProof) {
      return toBeHex(storageProof.value, 32);
    }
    if (this.fastCache) {
      return this.fastCache.get(storageKey, () =>
        this.provider.getStorage(target, slot, this.block)
      );
    }
    const proofs = await this.getProofs(target, [slot]);
    return proofs.storageProof[0].value;
  }
  override async isContract(target: HexString) {
    target = target.toLowerCase();
    if (this.fastCache) {
      return this.fastCache.get(target, async () => {
        const code = await this.provider.getCode(target, this.block);
        return code.length > 2;
      });
    } else {
      return isContract(await this.getProofs(target, []));
    }
  }
  override async prove(needs: Need[]) {
    // reduce an ordered list of needs into a deduplicated list of proofs
    // provide empty proofs for non-contract slots
    type Ref = { id: number; proof: EncodedProof };
    type RefMap = Ref & { map: Map<bigint, Ref> };
    const targets = new Map<HexString, RefMap>();
    const refs: Ref[] = [];
    const order = needs.map(([target, slot]) => {
      let bucket = targets.get(target);
      if (typeof slot === 'boolean') {
        // accountProof
        // we must prove this value since it leads to a stateRoot
        if (!bucket) {
          bucket = { id: refs.length, proof: '0x', map: new Map() };
          refs.push(bucket);
          targets.set(target, bucket);
        }
        return bucket.id;
      } else {
        // storageProof (for targeted account)
        // bucket can be undefined if a slot is read without a target
        // this is okay because the initial machine state is NOT_A_CONTRACT
        let ref = bucket?.map.get(slot);
        if (!ref) {
          ref = { id: refs.length, proof: '0x' };
          refs.push(ref);
          bucket?.map.set(slot, ref);
        }
        return ref.id;
      }
    });
    if (refs.length > this.maxUniqueProofs) {
      throw new Error(
        `too many proofs: ${refs.length} > ${this.maxUniqueProofs}`
      );
    }
    await Promise.all(
      Array.from(targets, async ([target, bucket]) => {
        let m = [...bucket.map];
        try {
          const accountProof: EthAccountProof | undefined =
            await this.proofLRU.touch(target);
          if (accountProof && !isContract(accountProof)) {
            m = []; // if we know target isn't a contract, we only need accountProof
          }
        } catch (err) {
          /*empty*/
        }
        const proofs = await this.getProofs(
          target,
          m.map(([slot]) => slot)
        );
        bucket.proof = encodeProof(proofs.accountProof);
        if (isContract(proofs)) {
          m.forEach(
            ([, ref], i) =>
              (ref.proof = encodeProof(proofs.storageProof[i].proof))
          );
        }
      })
    );
    return {
      proofs: refs.map((x) => x.proof),
      order: Uint8Array.from(order),
    };
  }
}
