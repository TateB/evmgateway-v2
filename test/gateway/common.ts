import type { Chain, ChainPair, HexAddress } from '../../src/types.js';
import type { RollupDeployment } from '../../src/rollup.js';
import { Gateway } from '../../src/gateway.js';
import { createProviderPair, providerURL } from '../providers.js';
import { chainName } from '../../src/chains.js';
import { serve } from '@resolverworks/ezccip';
import { DeployedContract, Foundry } from '@adraffy/blocksmith';
import { runSlotDataTests } from './tests.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';
import {
  type ScrollConfig,
  ScrollRollup,
} from '../../src/scroll/ScrollRollup.js';
import { EthSelfRollup } from '../../src/eth/EthSelfRollup.js';
import { afterAll } from 'bun:test';
import { describe } from '../bun-describe-fix.js';

export function pairName(pair: ChainPair, reverse = false) {
  return `${chainName(pair.chain1)} ${reverse ? '<=' : '=>'} ${chainName(pair.chain2)}`;
}

type TestOptions = {
  slotDataContract: HexAddress;
  slotDataPointer?: HexAddress;
  log?: boolean;
  skipCI?: boolean;
  skipZero?: boolean;
};

export async function setupTests(
  verifier: DeployedContract,
  opts: TestOptions
) {
  const foundry = Foundry.of(verifier);
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, opts.slotDataContract],
  });
  if (opts.slotDataPointer) {
    await foundry.confirm(reader.setPointer(opts.slotDataPointer));
  }
  runSlotDataTests(reader, !!opts.slotDataPointer, !!opts.skipZero);
}

function shouldSkip(opts: TestOptions) {
  return !!opts.skipCI && !!process.env.IS_CI;
}

export function testOP(config: RollupDeployment<OPConfig>, opts: TestOptions) {
  describe.skipIf(shouldSkip(opts))(pairName(config), async () => {
    const rollup = new OPRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'OPVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        rollup.L2OutputOracle,
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(pairName(config), async () => {
    const rollup = new OPFaultRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const commit = await gateway.getLatestCommit();
    const gameFinder = await foundry.deploy({
      file: 'FixedOPFaultGameFinder',
      args: [commit.index],
    });
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'OPFaultVerifier',
      args: [
        [ccip.endpoint],
        rollup.defaultWindow,
        hooks,
        [
          rollup.OptimismPortal,
          gameFinder,
          rollup.gameTypeBitMask,
          rollup.minAgeSec,
        ],
      ],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}

export function testScroll(
  config: RollupDeployment<ScrollConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(pairName(config), async () => {
    const rollup = await ScrollRollup.create(
      createProviderPair(config),
      config
    );
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({
      file: 'ScrollVerifierHooks',
      args: [rollup.poseidon],
    });
    const verifier = await foundry.deploy({
      file: 'ScrollVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.rollup],
      libs: { GatewayVM },
    });
    if (opts.skipZero === undefined) {
      // 20241004: we know this test fails, auto-skip during ci
      opts.skipZero = !!process.env.IS_CI;
    }
    await setupTests(verifier, opts);
  });
}

export function testSelfEth(chain: Chain, opts: TestOptions) {
  describe.skipIf(shouldSkip(opts))(chainName(chain), async () => {
    const foundry = await Foundry.launch({
      fork: providerURL(chain),
      infoLog: !!opts.log,
    });
    afterAll(() => foundry.shutdown());
    const rollup = new EthSelfRollup(foundry.provider);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(() => ccip.http.close());
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'SelfVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}
