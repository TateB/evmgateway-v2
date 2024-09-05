import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { GatewayV1 } from '../gateway.js';
import { DataRequestV1 } from '../v1.js';
import { requireV1Needs } from '../vm.js';
import { LineaCommit, LineaRollup } from './LineaRollup.js';
import { isExistanceProof, LineaProof, LineaProofExistance } from './types.js';

// https://github.com/Consensys/linea-ens/blob/main/packages/linea-ccip-gateway/src/L2ProofService.ts

// the deployed linea verifier is not compatible with the current gateway design
// due to strange proof encoding: incorrect negative proofs + unnecessary data (key)

export class LineaGatewayV1 extends GatewayV1<LineaRollup> {
  override async handleRequest(commit: LineaCommit, request: DataRequestV1) {
    const state = await commit.prover.evalRequest(request.v2());
    const { target, slots } = requireV1Needs(state.needs);
    const proofs = await commit.prover.getProofs(target, slots);
    if (!isExistanceProof(proofs.accountProof)) {
      throw new Error(`not a contract: ${request.target}`);
    }
    const witness = encodeAbiParameters(
      parseAbiParameters([
        'uint256',
        '(address, uint256, (bytes, bytes[]))',
        '(bytes32, uint256, (bytes32, bytes[]), bool)[]',
      ]),
      [
        commit.index,
        encodeAccountProof(proofs.accountProof),
        proofs.storageProofs.map(encodeStorageProof),
      ]
    );
    return encodeAbiParameters([{ type: 'bytes' }], [witness]);
  }
}

function encodeAccountProof(proof: LineaProofExistance) {
  return [
    proof.key,
    BigInt(proof.leafIndex),
    [proof.proof.value, proof.proof.proofRelatedNodes],
  ] as const;
}

function encodeStorageProof(proof: LineaProof) {
  return isExistanceProof(proof)
    ? ([
        proof.key,
        BigInt(proof.leafIndex),
        [proof.proof.value, proof.proof.proofRelatedNodes],
        true,
      ] as const)
    : ([
        proof.key,
        BigInt(proof.leftLeafIndex),
        [proof.leftProof.value, proof.leftProof.proofRelatedNodes],
        false,
      ] as const);
}
