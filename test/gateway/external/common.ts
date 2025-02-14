const baseEndpoint = 'https://lb.drpc.org/gateway/unruggable?network=';

export const getEndpoint = (chainName: string) => `${baseEndpoint}${chainName}`;
