import { describe } from 'bun:test';
import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { setup } from '../setup.js';

describe('arb1', () => {
  setup({
    Rollup: NitroRollup,
    config: NitroRollup.arb1MainnetConfig,
    deployReader: async ({ foundry, endpoint, rollup }) => {
      const verifier = await foundry.deploy({
        file: 'NitroVerifier',
        args: [[endpoint], rollup.defaultWindow, rollup.l2Rollup.address],
      });
      // https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [verifier, '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1'],
      });
      return reader;
    },
  });
});
