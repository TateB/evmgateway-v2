import { describe } from 'bun:test';
import { LineaRollup } from '../../../src/linea/LineaRollup.js';
import { testLinea } from '../common.js';
import { getEndpoint } from './common.js';

testLinea(LineaRollup.mainnetConfig, {
  // https://lineascan.build/address/0x48F5931C5Dbc2cD9218ba085ce87740157326F59#code
  slotDataContract: '0x48F5931C5Dbc2cD9218ba085ce87740157326F59',
  // https://lineascan.build/address/0xDeF531a66D7eA1d4E038acABF7F5D1Bd2b306891#code
  slotDataPointer: '0xDeF531a66D7eA1d4E038acABF7F5D1Bd2b306891',
  endpoint: getEndpoint('linea'),
  desc: (...t) => describe(...t),
});
