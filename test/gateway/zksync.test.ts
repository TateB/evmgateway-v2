import { describe } from 'bun:test';
import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { setup } from '../setup.js';

describe('zksync', async () => {
  setup({
    Rollup: ZKSyncRollup,
    config: ZKSyncRollup.mainnetConfig,
    foundryConfig: {
      infiniteCallGas: true, // Blake2s is ~12m gas per proof!
    },
    deployReader: async ({ foundry, endpoint, rollup }) => {
      const smt = await foundry.deploy({
        file: 'ZKSyncSMT',
      });
      const verifier = await foundry.deploy({
        file: 'ZKSyncVerifier',
        args: [
          [endpoint],
          rollup.defaultWindow,
          rollup.diamondProxy.address,
          smt,
        ],
      });
      // https://explorer.zksync.io/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [verifier, '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc'],
      });
      return reader;
    },
  });
});
