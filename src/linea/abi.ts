import { parseAbi } from 'viem';

export const rollupAbi = parseAbi([
  // ZkEvmV2.sol
  'function currentL2BlockNumber() view returns (uint256)',
  'function stateRootHashes(uint256 l2BlockNumber) view returns (bytes32)',
  // ILineaRollup.sol
  'event DataFinalized(uint256 indexed lastBlockFinalized, bytes32 indexed startingRootHash, bytes32 indexed finalRootHash, bool withProof)',
  // IZkEvmV2.sol
  'event BlocksVerificationDone(uint256 indexed lastBlockFinalized, bytes32 startingRootHash, bytes32 finalRootHash)',
]);
