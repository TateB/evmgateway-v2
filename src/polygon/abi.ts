import { parseAbi, parseAbiItem, parseAbiParameter } from 'viem';

export const rootChainAbi = parseAbi([
  'function currentHeaderBlock() view returns (uint256)',
  'function getLastChildBlock() view returns (uint256)',
  'function headerBlocks(uint256) view returns (bytes32 rootHash, uint256 l2BlockNumberStart, uint256 l2BlockNumberEnd, uint256 createdAt, address proposer)',
]);

export const abiHeaderTuple = parseAbiParameter(
  '(bytes32 rootHash, uint256 l2BlockNumberStart, uint256 l2BlockNumberEnd)'
);

// https://polygonscan.com/tx/0xff88715030e2a7332586df92bf77477ae6f989029017fcfd82d01f38c45ff70e#eventlog
export const posterEventAbi = parseAbiItem(
  'event NewRoot(bytes32 indexed prevBlockHash)'
);
