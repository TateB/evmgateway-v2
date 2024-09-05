import type { DeployedContract } from '@adraffy/blocksmith';
import { CcipReadRouter } from '@ensdomains/ccip-read-router';
import type { Server } from 'bun';
import { afterAll, beforeAll } from 'bun:test';
import { Gateway } from '../src/gateway.js';
import type {
  LineaRollup,
  NitroRollup,
  OPFaultRollup,
  OPRollup,
  PolygonPoSRollup,
  RollupDeployment,
  ScrollRollup,
  TaikoRollup,
  ZKSyncRollup,
} from '../src/index.js';
import { Foundry } from './foundry.js';
import { runSlotDataTests } from './gateway/tests.js';
import { createClientPair, transportUrl } from './providers.js';
import { createEndpoint, randomPort } from './utils.js';

type ConstructableRollup =
  | typeof LineaRollup
  | typeof NitroRollup
  | typeof OPRollup
  | typeof PolygonPoSRollup
  | typeof ZKSyncRollup;
type CreatableRollup =
  | typeof OPFaultRollup
  | typeof ScrollRollup
  | typeof TaikoRollup;

type GetRollupInstance<RollupClass> = RollupClass extends ConstructableRollup
  ? InstanceType<RollupClass>
  : RollupClass extends CreatableRollup
    ? Awaited<ReturnType<RollupClass['create']>>
    : never;

type GetConfig<RollupClass> = RollupClass extends ConstructableRollup
  ? ConstructorParameters<RollupClass>[1]
  : RollupClass extends CreatableRollup
    ? Parameters<RollupClass['create']>[1]
    : never;

export const setup = <
  RollupClass extends CreatableRollup | ConstructableRollup,
  rollupInstance extends GetRollupInstance<RollupClass>,
>({
  Rollup,
  config,
  deployReader,
  foundryConfig,
}: {
  Rollup: RollupClass;
  foundryConfig?: Parameters<typeof Foundry.launch>[0];
  config: RollupDeployment<GetConfig<RollupClass>>;
  deployReader: ({
    foundry,
    endpoint,
    rollup,
  }: {
    foundry: Foundry;
    endpoint: string;
    gateway: Gateway<rollupInstance>;
    rollup: rollupInstance;
  }) => Promise<DeployedContract>;
}) => {
  let foundry: Foundry;
  let server: Server;
  let reader: DeployedContract;
  const readerProxy = new Proxy(
    {},
    {
      get(_, prop) {
        return reader[prop as keyof typeof reader];
      },
    }
  ) as unknown as DeployedContract;
  beforeAll(async () => {
    const clients = createClientPair(config);
    const rollup = (
      'create' in Rollup
        ? await Rollup.create(clients, config as never)
        : new Rollup(clients as never, config as never)
    ) as rollupInstance;
    foundry = await Foundry.launch({
      fork: transportUrl(config.chain1),
      infoLog: false,
      ...foundryConfig,
    });
    const gateway = new Gateway(rollup);
    const router = CcipReadRouter({
      port: randomPort(),
    });
    gateway.register(router);

    server = Bun.serve(router);
    reader = await deployReader({
      foundry,
      endpoint: createEndpoint(server),
      gateway,
      rollup,
    });
  });
  afterAll(() => Promise.all([foundry.shutdown(), server.stop(true)]));

  runSlotDataTests(readerProxy);
};
