import { describe } from 'bun:test';
import { NitroRollup } from '../../../src/nitro/NitroRollup.js';
import { testNitro } from '../common.js';
import { getEndpoint } from './common.js';

testNitro(NitroRollup.arb1MainnetConfig, {
  // https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
  slotDataContract: '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1',
  endpoint: getEndpoint('arbitrum'),
  desc: (...t) => describe(...t),
});
