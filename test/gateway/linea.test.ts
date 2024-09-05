import { describe } from 'bun:test';
import { LineaRollup } from '../../src/linea/LineaRollup.js';
import { setup } from '../setup.js';

describe('linea', () => {
  const config = LineaRollup.mainnetConfig;
  setup({
    Rollup: LineaRollup,
    config,
    deployReader: async ({ foundry, endpoint, rollup }) => {
      const verifier = await foundry.deploy({
        file: 'LineaVerifier',
        args: [
          [endpoint],
          rollup.defaultWindow,
          rollup.l1MessageService.address,
        ],
        libs: {
          SparseMerkleProof: config.sparseMerkleProofAddress,
        },
      });
      // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
      const reader = await foundry.deploy({
        file: 'SlotDataReader',
        args: [verifier, '0x48F5931C5Dbc2cD9218ba085ce87740157326F59'],
      });
      return reader;
    },
  });
});
