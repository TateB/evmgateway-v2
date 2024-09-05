import { ethers, type BytesLike } from 'ethers';
import type { HexString } from '../src/types.js';

// convenience to decode a single ABI type
// export function decodeType(type: string, data: BytesLike) {
// 	return ethers.AbiCoder.defaultAbiCoder().decode([type], data)[0];
// }

export function decodeStorageArray(step: number, data: BytesLike): HexString[] {
  if (!Number.isInteger(step) || step < 1)
    throw new Error(`invalid step: ${step}`);
  const v = ethers.getBytes(data);
  const n = Number(ethers.toBigInt(v.subarray(0, 32)));
  if (step < 32) {
    const per = (32 / step) | 0;
    return Array.from({ length: n }, (_, i) => {
      const x = 64 + ((i / per) << 5) - (i % per) * step;
      return ethers.hexlify(v.subarray(x - step, x)) as HexString;
    });
  } else {
    const per = (step + 31) >> 5; // number of slots spanned
    return Array.from({ length: n }, (_, i) => {
      const x = (1 + i * per) << 5;
      return ethers.hexlify(v.subarray(x, x + step)) as HexString;
    });
  }
}

export function encodeShortString(s: string): HexString {
  const v = ethers.toUtf8Bytes(s);
  if (v.length > 31) throw new Error('too big');
  const u = new Uint8Array(32);
  u.set(v);
  u[31] = v.length << 1;
  return ethers.hexlify(u) as HexString;
}

export const createEndpoint = (server: ReturnType<typeof Bun.serve>) =>
  `http://${server.hostname}:${server.port}`;

export const randomPort = () =>
  Math.floor(Math.random() * (65535 - 3000 + 1)) + 3000;
