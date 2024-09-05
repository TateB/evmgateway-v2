import { describe } from 'bun:test';
import { TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { setup } from '../setup.js';

describe('taiko', async () => {
  setup({
    Rollup: TaikoRollup,
    config: TaikoRollup.mainnetConfig,
    deployReader: async ({ foundry, endpoint, rollup }) => {
      const verifier = await foundry.deploy({
        file: 'TaikoVerifier',
        args: [[endpoint], rollup.defaultWindow, rollup.taikoL1.address],
      });
      // https://taikoscan.io/address/0xAF7f1Fa8D5DF0D9316394433E841321160408565#code
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [verifier, '0xAF7f1Fa8D5DF0D9316394433E841321160408565'],
      });
      return reader;
    },
  });
});
