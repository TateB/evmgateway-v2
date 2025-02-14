import { describe } from 'bun:test';
import { OPFaultRollup } from '../../../src/index.js';
import { testOPFault } from '../common.js';
import { getEndpoint } from './common.js';

testOPFault(OPFaultRollup.baseSepoliaConfig, {
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411
  slotDataContract: '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411',
  endpoint: getEndpoint('base-sepolia'),
  desc: (...t) => describe(...t),
});
