import { describe } from 'bun:test';
import { OPFaultRollup } from '../../../src/index.js';
import { testOPFault } from '../common.js';
import { getEndpoint } from './common.js';

testOPFault(OPFaultRollup.mainnetConfig, {
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  slotDataContract: '0xf9d79d8c09d24e0C47E32778c830C545e78512CF',
  endpoint: getEndpoint('optimism'),
  desc: (...t) => describe(...t),
});
