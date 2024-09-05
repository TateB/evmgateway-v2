import { describe } from 'bun:test';
import { ScrollRollup } from '../../src/scroll/ScrollRollup.js';
import { setup } from '../setup.js';

describe('scroll', () => {
  setup({
    Rollup: ScrollRollup,
    config: ScrollRollup.mainnetConfig,
    deployReader: async ({ foundry, endpoint, rollup }) => {
      const verifier = await foundry.deploy({
        file: 'ScrollVerifier',
        args: [
          [endpoint],
          rollup.defaultWindow,
          rollup.commitmentVerifier.address,
        ],
      });
      // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [verifier, '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF'],
      });
      return reader;
    },
  });
});
