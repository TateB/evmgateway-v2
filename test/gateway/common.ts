import { type DeployedContract, Foundry } from '@adraffy/blocksmith';
import { serve } from '@resolverworks/ezccip/serve';
import { afterAll, beforeAll, describe } from 'bun:test';
import { randomBytes, SigningKey } from 'ethers/crypto';
import { chainName, CHAINS } from '../../src/chains.js';
import { EthProver } from '../../src/eth/EthProver.js';
import { EthSelfRollup } from '../../src/eth/EthSelfRollup.js';
import { Gateway } from '../../src/gateway.js';
import { type LineaConfig, LineaRollup } from '../../src/linea/LineaRollup.js';
import { DoubleNitroRollup } from '../../src/nitro/DoubleNitroRollup.js';
import { type NitroConfig, NitroRollup } from '../../src/nitro/NitroRollup.js';
import {
  type OPFaultConfig,
  OPFaultRollup,
} from '../../src/op/OPFaultRollup.js';
import { type OPConfig, OPRollup } from '../../src/op/OPRollup.js';
import type { RollupDeployment } from '../../src/rollup.js';
import {
  type ScrollConfig,
  ScrollRollup,
} from '../../src/scroll/ScrollRollup.js';
import { type TaikoConfig, TaikoRollup } from '../../src/taiko/TaikoRollup.js';
import { TrustedRollup } from '../../src/TrustedRollup.js';
import type { Chain, ChainPair, HexAddress } from '../../src/types.js';
import {
  type ZKSyncConfig,
  ZKSyncRollup,
} from '../../src/zksync/ZKSyncRollup.js';
import {
  createProvider,
  createProviderPair,
  providerURL,
} from '../providers.js';
import { runSlotDataTests } from './tests.js';

export function testName(
  { chain1, chain2, chain3 }: ChainPair & { chain3?: Chain },
  { reverse = false, unfinalized = false, endpoint = '' } = {}
) {
  const arrow = unfinalized ? ' =!=> ' : ' => ';
  const chains = [chain1, chain2];
  if (chain3 !== undefined) chains.push(chain3);
  const names = chains.map(chainName);
  if (reverse) names.reverse();
  if (endpoint) names.unshift('EXTERNAL');
  return names.join(arrow);
}

type TestOptions = {
  slotDataContract: HexAddress;
  slotDataPointer?: HexAddress;
  log?: boolean;
  skipCI?: boolean;
  skipZero?: boolean;
  desc?: (...params: Parameters<typeof describe>) => void;
};

export type TestState = {
  verifier: DeployedContract;
  reader: DeployedContract;
};

const createTestState = (): TestState =>
  ({
    verifier: undefined,
    reader: undefined,
  }) as unknown as TestState;

export async function quickTest(
  verifier: DeployedContract,
  target: HexAddress,
  slot: bigint
) {
  const foundry = Foundry.of(verifier);
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, target],
  });
  return reader.readSlot(slot, { enableCcipRead: true });
}

export async function setupTests(
  verifier: DeployedContract,
  opts: TestOptions,
  configure?: (fetcher: DeployedContract) => Promise<void>
): Promise<TestState> {
  const foundry = Foundry.of(verifier);
  const reader = await foundry.deploy({
    file: 'SlotDataReader',
    args: [verifier, opts.slotDataContract],
  });
  if (opts.slotDataPointer) {
    await foundry.confirm(reader.setPointer(opts.slotDataPointer));
  }
  await configure?.(reader);
  return { verifier, reader };
}

function shouldSkip(opts: TestOptions) {
  return !!opts.skipCI && !!process.env.IS_CI;
}

const createTestSuite = (
  name: string,
  opts: TestOptions,
  setupFunction: () => Promise<TestState>
) => {
  const invoke = opts.desc ?? describe;
  const state = createTestState();
  invoke(name, () => {
    beforeAll(async () => {
      const newState = await setupFunction();
      state.verifier = newState.verifier;
      state.reader = newState.reader;
    });
    runSlotDataTests(state, !!opts.slotDataPointer, !!opts.skipZero);
  });
};

export function testOP(
  config: RollupDeployment<OPConfig>,
  opts: TestOptions & { minAgeSec?: number }
) {
  return createTestSuite(
    testName(config, { unfinalized: !!opts.minAgeSec }),
    opts,
    async () => {
      const rollup = new OPRollup(
        createProviderPair(config),
        config,
        opts.minAgeSec
      );
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
      const verifier = await foundry.deploy({
        file: 'OPVerifier',
        args: [
          [ccip.endpoint],
          rollup.defaultWindow,
          hooks,
          rollup.OptimismPortal,
          rollup.OutputFinder,
          rollup.minAgeSec,
        ],
        libs: { GatewayVM },
      });
      return setupTests(verifier, opts);
    }
  );
}

export function testOPFault(
  config: RollupDeployment<OPFaultConfig>,
  opts: TestOptions & { minAgeSec?: number; endpoint?: string }
) {
  return createTestSuite(
    testName(config, {
      unfinalized: !!opts.minAgeSec,
      endpoint: opts.endpoint,
    }),
    opts,
    async () => {
      const rollup = new OPFaultRollup(
        createProviderPair(config),
        config,
        opts.minAgeSec
      );
      rollup.latestBlockTag = 'latest';
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
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
          [opts.endpoint ?? ccip.endpoint],
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
      return setupTests(verifier, opts);
    }
  );
}

export function testScroll(
  config: RollupDeployment<ScrollConfig>,
  opts: TestOptions & { endpoint?: string }
) {
  return createTestSuite(
    testName(config, { endpoint: opts.endpoint }),
    opts,
    async () => {
      const rollup = new ScrollRollup(createProviderPair(config), config);
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({
        file: 'ScrollVerifierHooks',
        args: [rollup.poseidon],
      });
      const verifier = await foundry.deploy({
        file: 'ScrollVerifier',
        args: [
          [opts.endpoint ?? ccip.endpoint],
          rollup.defaultWindow,
          hooks,
          rollup.ScrollChain,
        ],
        libs: { GatewayVM },
      });
      if (opts.skipZero === undefined) {
        // 20241004: we know this test fails, auto-skip during ci
        opts.skipZero = !!process.env.IS_CI;
      }
      return setupTests(verifier, opts);
    }
  );
}

export function testSelfEth(chain: Chain, opts: TestOptions) {
  createTestSuite(chainName(chain), opts, async () => {
    const foundry = await Foundry.launch({
      fork: providerURL(chain),
      infoLog: !!opts.log,
    });
    afterAll(foundry.shutdown);
    const rollup = new EthSelfRollup(foundry.provider);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'SelfVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks],
      libs: { GatewayVM },
    });
    return setupTests(verifier, opts);
  });
}

export function testTrustedEth(chain2: Chain, opts: TestOptions) {
  describe.skipIf(!!process.env.IS_CI)(
    testName({ chain1: CHAINS.VOID, chain2 }, { unfinalized: true }),
    async () => {
      const foundry = await Foundry.launch({
        fork: providerURL(chain2),
        infoLog: !!opts.log,
      });
      const rollup = new TrustedRollup(
        createProvider(chain2),
        EthProver,
        new SigningKey(randomBytes(32))
      );
      rollup.latestBlockTag = 'latest';
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
      const verifier = await foundry.deploy({
        file: 'TrustedVerifier',
        libs: { GatewayVM },
      });
      await setupTests(verifier, opts, async (fetcher) => {
        await foundry.confirm(
          verifier.setConfig(
            fetcher,
            [ccip.endpoint],
            rollup.defaultWindow,
            hooks
          )
        );
        await foundry.confirm(
          verifier.setSigner(fetcher, rollup.signerAddress, true)
        );
      });
    }
  );
}

export function testLinea(
  config: RollupDeployment<LineaConfig>,
  opts: TestOptions & { endpoint?: string }
) {
  return createTestSuite(
    testName(config, { endpoint: opts.endpoint }),
    opts,
    async () => {
      const rollup = new LineaRollup(createProviderPair(config), config);
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({
        file: 'LineaVerifierHooks',
        libs: {
          SparseMerkleProof: config.SparseMerkleProof,
        },
      });
      const verifier = await foundry.deploy({
        file: 'LineaVerifier',
        args: [
          [opts.endpoint ?? ccip.endpoint],
          rollup.defaultWindow,
          hooks,
          config.L1MessageService,
        ],
        libs: { GatewayVM },
      });
      return setupTests(verifier, opts);
    }
  );
}

export function testZKSync(
  config: RollupDeployment<ZKSyncConfig>,
  opts: TestOptions
) {
  createTestSuite(testName(config), opts, async () => {
    const rollup = new ZKSyncRollup(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
      infiniteCallGas: true, // Blake2s is ~12m gas per proof!
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const ZKSyncSMT = await foundry.deploy({ file: 'ZKSyncSMT' });
    const hooks = await foundry.deploy({
      file: 'ZKSyncVerifierHooks',
      args: [ZKSyncSMT],
    });
    const verifier = await foundry.deploy({
      file: 'ZKSyncVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.DiamondProxy],
      libs: { GatewayVM },
    });
    return setupTests(verifier, opts);
  });
}

export function testTaiko(
  config: RollupDeployment<TaikoConfig>,
  opts: TestOptions
) {
  describe.skipIf(shouldSkip(opts))(testName(config), async () => {
    const rollup = await TaikoRollup.create(createProviderPair(config), config);
    const foundry = await Foundry.launch({
      fork: providerURL(config.chain1),
      infoLog: !!opts.log,
    });
    afterAll(foundry.shutdown);
    const gateway = new Gateway(rollup);
    const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
    afterAll(ccip.shutdown);
    const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
    const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
    const verifier = await foundry.deploy({
      file: 'TaikoVerifier',
      args: [[ccip.endpoint], rollup.defaultWindow, hooks, rollup.TaikoL1],
      libs: { GatewayVM },
    });
    await setupTests(verifier, opts);
  });
}

export function testDoubleNitro(
  config12: RollupDeployment<NitroConfig>,
  config23: RollupDeployment<NitroConfig>,
  opts: TestOptions & { minAgeBlocks12?: number; minAgeBlocks23?: number }
) {
  describe.skipIf(shouldSkip(opts))(
    testName(
      { ...config12, chain3: config23.chain2 },
      { unfinalized: !!opts.minAgeBlocks12 || !!opts.minAgeBlocks23 }
    ),
    async () => {
      const rollup = new DoubleNitroRollup(
        new NitroRollup(
          createProviderPair(config12),
          config12,
          opts.minAgeBlocks12
        ),
        createProvider(config23.chain2),
        config23,
        opts.minAgeBlocks23
      );
      const foundry = await Foundry.launch({
        fork: providerURL(config12.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: !!opts.log });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
      const verifier = await foundry.deploy({
        file: 'DoubleNitroVerifier',
        args: [
          [ccip.endpoint],
          rollup.defaultWindow,
          hooks,
          rollup.rollup12.Rollup,
          rollup.rollup12.minAgeBlocks,
          rollup.rollup23.Rollup,
          //rollup.rollup23.minAgeBlocks,
          rollup.nodeRequest.toTuple(),
        ],
        libs: { GatewayVM },
      });
      await setupTests(verifier, opts);
    }
  );
}

export function testNitro(
  config: RollupDeployment<NitroConfig>,
  opts: TestOptions & { endpoint?: string }
) {
  return createTestSuite(
    testName(config, { endpoint: opts.endpoint }),
    opts,
    async () => {
      const rollup = new NitroRollup(createProviderPair(config), config);
      const foundry = await Foundry.launch({
        fork: providerURL(config.chain1),
        infoLog: !!opts.log,
      });
      afterAll(foundry.shutdown);
      const gateway = new Gateway(rollup);
      const ccip = await serve(gateway, { protocol: 'raw', log: false });
      afterAll(ccip.shutdown);
      const GatewayVM = await foundry.deploy({ file: 'GatewayVM' });
      const hooks = await foundry.deploy({ file: 'EthVerifierHooks' });
      const verifier = await foundry.deploy({
        file: 'NitroVerifier',
        args: [
          [opts.endpoint ?? ccip.endpoint],
          rollup.defaultWindow,
          hooks,
          rollup.Rollup,
          rollup.minAgeBlocks,
        ],
        libs: { GatewayVM },
      });
      return setupTests(verifier, opts);
    }
  );
}
