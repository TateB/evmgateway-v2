import {
  createClient,
  http,
  type Chain,
  type Client,
  type TransportConfig,
} from 'viem';
import {
  arbitrum,
  arbitrumNova,
  arbitrumSepolia,
  base,
  baseSepolia,
  blast,
  fraxtal,
  linea,
  lineaSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  polygonZkEvm,
  polygonZkEvmCardona,
  scroll,
  scrollSepolia,
  sepolia,
  taiko,
  taikoHekla,
  zksync,
  zksyncSepoliaTestnet,
  zora,
} from 'viem/chains';
import type { RollupDeployment } from '../src/rollup.js';
import type { ChainId, ClientPair } from '../src/types.js';

export type ChainInfo = Chain & {
  rpc: {
    url: string;
    ankr?: string;
    infura?: string;
    alchemy?: string;
  };
};

const supportedChains = [
  {
    ...mainnet,
    rpc: {
      url: 'https://rpc.ankr.com/eth/',
      ankr: 'eth',
      infura: 'mainnet',
      alchemy: 'eth-mainnet',
    },
  },
  {
    ...sepolia,
    rpc: {
      url: 'https://rpc.ankr.com/eth_sepolia/',
      ankr: 'eth_sepolia',
      infura: 'sepolia',
      alchemy: 'eth-sepolia',
    },
  },
  {
    // https://docs.optimism.io/chain/networks#op-mainnet
    ...optimism,
    rpc: {
      url: 'https://mainnet.optimism.io',
      ankr: 'optimism',
      infura: 'optimism',
      alchemy: 'opt-mainnet',
    },
  },
  {
    // https://docs.optimism.io/chain/networks#op-sepolia
    ...optimismSepolia,
    rpc: {
      url: 'https://sepolia.optimism.io',
      ankr: 'optimism_sepolia',
      infura: 'optimism-sepolia',
      alchemy: 'opt-sepolia',
    },
  },
  {
    // https://docs.base.org/docs/network-information#base-mainnet
    ...base,
    rpc: {
      url: 'https://mainnet.base.org',
      ankr: 'base',
      infura: 'base-mainnet',
      alchemy: 'base-mainnet',
    },
  },
  {
    // https://docs.base.org/docs/network-information#base-testnet-sepolia
    ...baseSepolia,
    rpc: {
      url: 'https://sepolia.base.org',
      ankr: 'base_sepolia',
      infura: 'base-sepolia',
      alchemy: 'base-sepolia',
    },
  },
  {
    // https://docs.arbitrum.io/build-decentralized-apps/reference/node-providers#arbitrum-public-rpc-endpoints
    ...arbitrum,
    rpc: {
      url: 'https://arb1.arbitrum.io/rpc',
      ankr: 'arbitrum',
      infura: 'arbitrum-mainnet',
      alchemy: 'arb-mainnet',
    },
  },
  {
    ...arbitrumNova,
    rpc: {
      url: 'https://nova.arbitrum.io/rpc',
      ankr: 'arbitrumnova',
      alchemy: 'arbnova-mainnet',
    },
  },
  {
    ...arbitrumSepolia,
    rpc: {
      url: 'https://sepolia-rollup.arbitrum.io/rpc',
      ankr: 'arbitrum_sepolia',
      infura: 'arbitrum-sepolia',
      alchemy: 'arb-sepolia',
    },
  },
  {
    // https://docs.scroll.io/en/developers/developer-quickstart/#scroll-mainnet
    ...scroll,
    rpc: {
      url: 'https://rpc.scroll.io',
      ankr: 'scroll',
    },
  },
  {
    ...scrollSepolia,
    rpc: {
      url: 'https://sepolia-rpc.scroll.io',
      ankr: 'scroll_sepolia_testnet',
    },
  },
  {
    // https://docs.taiko.xyz/network-reference/rpc-configuration#taiko-mainnet
    ...taiko,
    rpc: {
      url: 'https://rpc.mainnet.taiko.xyz',
      ankr: 'taiko',
    },
  },
  {
    ...taikoHekla,
    rpc: {
      url: 'https://rpc.hekla.taiko.xyz',
      ankr: 'taiko_hekla',
    },
  },
  {
    ...zksync,
    rpc: {
      url: 'https://mainnet.era.zksync.io',
      ankr: 'zksync_era',
      infura: 'zksync-mainnet',
      alchemy: 'zksync-mainnet',
    },
  },
  {
    ...zksyncSepoliaTestnet,
    rpc: {
      url: 'https://sepolia.era.zksync.dev',
      ankr: 'zksync_era_sepolia',
      infura: 'zksync-sepolia',
      alchemy: 'zksync-sepolia',
    },
  },
  {
    // https://docs.polygon.technology/pos/reference/rpc-endpoints/#mainnet
    ...polygon,
    rpc: {
      url: 'https://polygon-rpc.com/',
      ankr: 'polygon',
      infura: 'polygon-mainnet',
      alchemy: 'polygon-mainnet',
    },
  },
  {
    ...polygonAmoy,
    rpc: {
      url: 'https://rpc-amoy.polygon.technology/',
      ankr: 'polygon_amoy',
      infura: 'polygon-amoy',
      alchemy: 'polygon-amoy',
    },
  },
  {
    // https://docs.polygon.technology/zkEVM/get-started/quick-start/#manually-add-network-to-wallet
    ...polygonZkEvm,
    rpc: {
      url: 'https://zkevm-rpc.com',
      ankr: 'polygon_zkevm',
      alchemy: 'polygonzkevm-mainnet',
    },
  },
  {
    ...polygonZkEvmCardona,
    rpc: {
      url: 'https://rpc.cardona.zkevm-rpc.com',
      ankr: 'polygon_zkevm_cardona',
      alchemy: 'polygonzkevm-cardona',
    },
  },
  {
    // https://docs.linea.build/developers/quickstart/info-contracts
    ...linea,
    rpc: {
      url: 'https://rpc.linea.build',
      infura: 'linea-mainnet',
      //alchemy: 'linea-mainnet', // 20240901: eth_getProof doesn't work
    },
  },
  {
    ...lineaSepolia,
    rpc: {
      url: 'https://rpc.sepolia.linea.build',
      infura: 'linea-sepolia',
      alchemy: 'linea-sepolia',
    },
  },
  {
    // https://docs.frax.com/fraxtal/network/network-information#fraxtal-mainnet
    ...fraxtal,
    rpc: {
      url: 'https://rpc.frax.com',
      //alchemy: 'frax-mainnet', // 20240901: eth_getProof doesn't work
    },
  },
  {
    // https://docs.zora.co/zora-network/network#zora-network-mainnet
    ...zora,
    rpc: {
      url: 'https://rpc.zora.energy',
      alchemy: 'zora-mainnet',
    },
  },
  {
    // https://docs.blast.io/building/network-information#blast-mainnet
    ...blast,
    rpc: {
      url: 'https://rpc.blast.io',
      ankr: 'blast',
      infura: 'blast-mainnet',
      alchemy: 'blast-mainnet',
    },
  },
] as const satisfies ChainInfo[];

const getChain = (chainId: ChainId) => {
  const info = supportedChains.find((c) => c.id === chainId);
  if (!info) throw new Error(`unknown provider: ${chainId}`);
  return info;
};

export function transportUrl(chainId: ChainId): string {
  const info = getChain(chainId);
  // 20240830: so far, alchemy has the best support
  let apiKey = process.env.ALCHEMY_KEY;
  if (apiKey && 'alchemy' in info.rpc) {
    return `https://${info.rpc.alchemy}.g.alchemy.com/v2/${apiKey}`;
  }
  apiKey = process.env.ANKR_KEY;
  if (apiKey && 'ankr' in info.rpc) {
    return `https://rpc.ankr.com/${info.rpc.ankr}/${apiKey}`;
  }
  apiKey = process.env.INFURA_KEY;
  if (apiKey && 'infura' in info.rpc) {
    return `https://${info.rpc.infura}.infura.io/v3/${apiKey}`;
  }
  return info.rpc.url;
}

export const chainName = (chainId: ChainId) => getChain(chainId).name;

export function createClientFromId(
  chainId: ChainId,
  transportConfig?: Partial<TransportConfig>
): Client {
  return createClient({
    transport: http(transportUrl(chainId), {
      retryCount: 0,
      ...transportConfig,
    }),
    chain: getChain(chainId),
    cacheTime: 0,
  });
}

export function createClientPair<
  rollup,
  a extends ChainId | RollupDeployment<rollup>,
>(a: a, b?: ChainId): ClientPair {
  if (typeof a !== 'number') {
    return {
      client1: createClientFromId(a.chain1, a.transportConfig1),
      client2: createClientFromId(a.chain2, a.transportConfig2),
    };
  }
  if (!b) {
    return {
      client1: createClientFromId(mainnet.id),
      client2: createClientFromId(a),
    };
  }
  return {
    client1: createClientFromId(a),
    client2: createClientFromId(b),
  };
}
