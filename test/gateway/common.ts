import { describe } from 'bun:test';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import type { RollupDeployment } from '../../src/rollup.js';
import type { HexAddress } from '../../src/types.js';
import { chainName } from '../providers.js';
import { setup } from '../setup.js';

export function testOP(
  config: RollupDeployment<OPConfig>,
  slotDataReaderAddress: HexAddress
) {
  describe(chainName(config.chain2), () => {
    setup({
      Rollup: OPRollup,
      config,
      deployReader: async ({ foundry, endpoint, rollup }) => {
        const verifier = await foundry.deploy({
          file: 'OPVerifier',
          args: [
            [endpoint],
            rollup.defaultWindow,
            rollup.l2OutputOracle.address,
          ],
        });
        const reader = await foundry.deploy({
          file: 'SlotDataReader',
          args: [verifier, slotDataReaderAddress],
        });
        return reader;
      },
    });
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  slotDataReaderAddress: HexAddress
) {
  describe(chainName(config.chain2), async () => {
    setup({
      Rollup: OPFaultRollup,
      config,
      deployReader: async ({ foundry, endpoint, gateway, rollup }) => {
        const commit = await gateway.getLatestCommit();
        const gameFinder = await foundry.deploy({
          file: 'FixedOPFaultGameFinder',
          args: [commit.index],
        });
        const verifier = await foundry.deploy({
          file: 'OPFaultVerifier',
          args: [
            [endpoint],
            rollup.defaultWindow,
            rollup.optimismPortal.address,
            gameFinder, // official is too slow in fork mode (30sec+)
            rollup.gameTypeBitMask,
          ],
        });
        const reader = await foundry.deploy({
          file: 'SlotDataReader',
          args: [verifier, slotDataReaderAddress],
        });
        return reader;
      },
    });
  });
}
