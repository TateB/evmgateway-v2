import { describe } from 'bun:test';
import { OPFaultRollup } from '../../../src/index.js';
import { testOPFault } from '../common.js';
import { getEndpoint } from './common.js';

testOPFault(OPFaultRollup.baseMainnetConfig, {
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  slotDataContract: '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6',
  endpoint: getEndpoint('base'),
  desc: (...t) => describe(...t),
});
