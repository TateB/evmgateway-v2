import { ZKSyncRollup } from '../../src/zksync/ZKSyncRollup.js';
import { Gateway } from '../../src/gateway.js';
import { serve } from '@resolverworks/ezccip';
import { Foundry } from '@adraffy/blocksmith';
import { createProviderPair, providerURL } from '../providers.js';
import { runSlotDataTests } from './tests.js';
import { describe, afterAll } from 'bun:test';

describe('zksync', async () => {
  const config = ZKSyncRollup.mainnetConfig;
  const rollup = new ZKSyncRollup(createProviderPair(config), config);
  const foundry = await Foundry.launch({
    fork: providerURL(config.chain1),
    infoLog: false,
    infiniteCallGas: true, // Blake2s is ~12m gas per proof!
  });
  afterAll(() => foundry.shutdown());
  const gateway = new Gateway(rollup);
  const ccip = await serve(gateway, {
    protocol: 'raw',
    log: false,
  });
  afterAll(() => ccip.http.close());
  const smt = await foundry.deploy({
    file: 'ZKSyncSMT',
  });
  const verifier = await foundry.deploy({
    file: 'ZKSyncVerifier',
    args: [[ccip.endpoint], rollup.defaultWindow, rollup.DiamondProxy, smt],
  });
  // https://explorer.zksync.io/address/0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc#contract
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, '0x1Cd42904e173EA9f7BA05BbB685882Ea46969dEc'],
  });
  runSlotDataTests(reader, true);
});
