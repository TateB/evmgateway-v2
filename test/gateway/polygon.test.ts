import { describe } from 'bun:test';
import { PolygonPoSRollup } from '../../src/polygon/PolygonPoSRollup.js';
import { setup } from '../setup.js';

describe('polygon', () => {
  setup({
    Rollup: PolygonPoSRollup,
    config: PolygonPoSRollup.mainnetConfig,
    deployReader: async ({ foundry, endpoint, rollup }) => {
      const verifier = await foundry.deploy({
        file: 'PolygonPoSVerifier',
        args: [[endpoint], rollup.defaultWindow, rollup.rootChain.address],
      });
      await foundry.confirm(verifier.togglePoster(rollup.poster.address, true));
      // https://polygonscan.com/address/0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361#code
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [verifier, '0x5BBf0fD3Dd8252Ee03bA9C03cF92F33551584361'],
      });
      return reader;
    },
  });
});
