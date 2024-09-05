import type { AbiParameterToPrimitiveType } from 'abitype';
import { encodeAbiParameters, parseAbiParameter, toHex, zeroHash } from 'viem';
import { getBlock } from 'viem/actions';

import { EthProver } from '../eth/EthProver.js';
import { AbstractRollupV1, type RollupCommit } from '../rollup.js';
import type { HexAddress, HexString } from '../types.js';
import type { ProofSequence, ProofSequenceV1 } from '../vm.js';

const OutputRootProofType = parseAbiParameter(
  '(bytes32 version, bytes32 stateRoot, bytes32 messagePasserStorageRoot, bytes32 latestBlockhash)'
);

export type OPCommit = RollupCommit<EthProver> & {
  readonly blockHash: HexString;
  readonly stateRoot: HexString;
  readonly passerRoot: HexString;
};

function outputRootProofTuple(
  commit: OPCommit
): AbiParameterToPrimitiveType<typeof OutputRootProofType> {
  return {
    version: zeroHash,
    stateRoot: commit.stateRoot,
    messagePasserStorageRoot: commit.passerRoot,
    latestBlockhash: commit.blockHash,
  };
}

export abstract class AbstractOPRollup extends AbstractRollupV1<OPCommit> {
  l2ToL1MessagePasserAddress: HexAddress =
    '0x4200000000000000000000000000000000000016';
  async createCommit(index: bigint, blockNumber: bigint): Promise<OPCommit> {
    const prover = new EthProver(this.client2, blockNumber);
    const [{ storageHash: passerRoot }, block] = await Promise.all([
      prover.fetchProofs(this.l2ToL1MessagePasserAddress),
      getBlock(this.client2, { blockNumber, includeTransactions: false }),
    ]);
    return {
      index,
      blockHash: block.hash,
      stateRoot: block.stateRoot,
      passerRoot,
      prover,
    };
  }
  override encodeWitness(commit: OPCommit, proofSeq: ProofSequence): HexString {
    return encodeAbiParameters(
      [
        { type: 'uint256' },
        OutputRootProofType,
        { type: 'bytes[]' },
        { type: 'bytes' },
      ],
      [
        commit.index,
        outputRootProofTuple(commit),
        proofSeq.proofs,
        toHex(proofSeq.order),
      ]
    );
  }
  override encodeWitnessV1(
    commit: OPCommit,
    proofSeq: ProofSequenceV1
  ): HexString {
    return encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [{ type: 'uint256' }, OutputRootProofType],
        },
        { type: 'tuple', components: [{ type: 'bytes' }, { type: 'bytes[]' }] },
      ],
      [
        [commit.index, outputRootProofTuple(commit)],
        [proofSeq.accountProof, proofSeq.storageProofs],
      ]
    );
  }
}
