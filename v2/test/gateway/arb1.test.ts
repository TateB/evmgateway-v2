import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { providerURL, createProviderPair } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('arb1', async () => {
  const config = NitroRollup.arb1MainnetConfig;
  const rollup = new NitroRollup(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());
  const verifier = await foundry.deploy({
    file: 'NitroVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.L2Rollup],
  });
  // https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1'],
  });
  runSlotDataTests(reader);
});
