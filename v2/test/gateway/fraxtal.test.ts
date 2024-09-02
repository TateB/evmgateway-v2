import { OPRollup } from '../../src/op/OPRollup.js';
import { testOP } from './common.js';

if (!process.env.IS_CI) {
  testOP(
    OPRollup.fraxtalMainnetConfig,
    // https://fraxscan.com/address/0xa5aDB66771314293b2e93BC5492584889c7eeC72
    '0xa5aDB66771314293b2e93BC5492584889c7eeC72'
  );
}
