// arbitrum
// arbitrum-sepolia
// base
// base-sepolia
// optimism
// optimism-sepolia
// scroll
// scroll-sepolia
// linea
// linea-sepolia

import { OPFaultRollup, ScrollRollup } from '../../src/index.js';
import { NitroRollup } from '../../src/nitro/NitroRollup.js';
import { testNitro, testOPFault, testScroll } from './common.js';

const baseEndpoint = 'https://lb.drpc.org/gateway/unruggable?network=';

testNitro(NitroRollup.arb1MainnetConfig, {
  // https://arbiscan.io/address/0xCC344B12fcc8512cc5639CeD6556064a8907c8a1#code
  slotDataContract: '0xCC344B12fcc8512cc5639CeD6556064a8907c8a1',
  endpoint: `${baseEndpoint}arbitrum`,
});

testNitro(NitroRollup.arb1SepoliaConfig, {
  // https://sepolia.arbiscan.io/address/0x09d2233d3d109683ea95da4546e7e9fc17a6dfaf#code
  slotDataContract: '0x09d2233d3d109683ea95da4546e7e9fc17a6dfaf',
  endpoint: `${baseEndpoint}arbitrum-sepolia`,
});

testOPFault(OPFaultRollup.baseMainnetConfig, {
  // https://basescan.org/address/0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6
  slotDataContract: '0x0C49361E151BC79899A9DD31B8B0CCdE4F6fd2f6',
  endpoint: `${baseEndpoint}base`,
});

testOPFault(OPFaultRollup.baseSepoliaConfig, {
  // https://sepolia.basescan.org/address/0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411
  slotDataContract: '0x7AE933cf265B9C7E7Fd43F0D6966E34aaa776411',
  endpoint: `${baseEndpoint}base-sepolia`,
});

testOPFault(OPFaultRollup.mainnetConfig, {
  // https://optimistic.etherscan.io/address/0xf9d79d8c09d24e0C47E32778c830C545e78512CF
  slotDataContract: '0xf9d79d8c09d24e0C47E32778c830C545e78512CF',
  endpoint: `${baseEndpoint}optimism`,
});

testOPFault(OPFaultRollup.sepoliaConfig, {
  // https://sepolia-optimism.etherscan.io/address/0xc695404735e0f1587a5398a06cab34d7d7b009da
  slotDataContract: '0xc695404735e0f1587a5398a06cab34d7d7b009da',
  endpoint: `${baseEndpoint}optimism-sepolia`,
});

testScroll(ScrollRollup.mainnetConfig, {
  // https://scrollscan.com/address/0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF#code
  slotDataContract: '0x09D2233D3d109683ea95Da4546e7E9Fc17a6dfAF',
  // https://scrollscan.com/address/0x28507d851729c12F193019c7b05D916D53e9Cf57#code
  slotDataPointer: '0x28507d851729c12F193019c7b05D916D53e9Cf57',
  endpoint: `${baseEndpoint}scroll`,
});

testScroll(ScrollRollup.sepoliaConfig, {
  // https://sepolia.scrollscan.com/address/0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05#code
  slotDataContract: '0x57C2F437E0a5E155ced91a7A17bfc372C0aF7B05',
  // https://sepolia.scrollscan.com/address/0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8#code
  slotDataPointer: '0xA2e3c1b0a43336A21E2fA56928bc7B7848c156A8',
  endpoint: `${baseEndpoint}scroll-sepolia`,
});
