import { describe } from 'bun:test';
import { NitroRollup } from '../../../src/nitro/NitroRollup.js';
import { testNitro } from '../common.js';
import { getEndpoint } from './common.js';

testNitro(NitroRollup.arb1SepoliaConfig, {
  // https://sepolia.arbiscan.io/address/0x09d2233d3d109683ea95da4546e7e9fc17a6dfaf#code
  slotDataContract: '0x09d2233d3d109683ea95da4546e7e9fc17a6dfaf',
  endpoint: getEndpoint('arbitrum-sepolia'),
  desc: (...t) => describe(...t),
});
