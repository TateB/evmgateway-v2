import { afterAll, describe, expect, test } from 'bun:test';
import { ethers, type BigNumberish } from 'ethers';
import { toHex, zeroAddress } from 'viem';
import { EthProver } from '../../src/eth/EthProver.js';
import type { HexAddress, HexString } from '../../src/types.js';
import { DataRequest, EVMProgram, solidityFollowSlot } from '../../src/vm.js';
import { Foundry } from '../foundry.js';

function hexStr(s: string) {
  return ethers.hexlify(ethers.toUtf8Bytes(s));
}
function uint256(x: BigNumberish) {
  return ethers.toBeHex(x, 32) as HexString;
}

describe('ops', async () => {
  const foundry = await Foundry.launch({ infoLog: false });
  afterAll(() => foundry.shutdown());
  const verifier = await foundry.deploy({
    file: 'EthSelfVerifier',
  });
  const contract = await foundry.deploy({
    sol: `
      contract X {
        uint256 value1 = 1;
        uint256 value2 = 2;
        string small = "abc";
        string big = "${'abc'.repeat(20)}";
        uint96[] array = [1, 2, 3];
      }
    `,
  });

  async function verify(req: DataRequest) {
    const prover = await EthProver.latest(foundry.client);
    const stateRoot = await prover.fetchStateRoot();
    const vm = await prover.evalRequest(req);
    const { proofs, order } = await prover.prove(vm.needs);
    const values = await vm.resolveOutputs();
    const res = await verifier.verify(
      [Uint8Array.from(req.ops), req.inputs],
      stateRoot,
      proofs,
      order
    );
    expect(res.outputs.toArray()).toEqual(values);
    expect(res.exitCode).toBe(BigInt(vm.exitCode));
    return { values, ...vm };
  }

  test('setOutput', async () => {
    const req = new DataRequest(1);
    req.push(1).setOutput(0);
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
  });

  test('addOutput', async () => {
    const req = new DataRequest(0);
    req.push(1).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
  });

  test('setOutput overflow', async () => {
    const req = new DataRequest();
    req.push(1).setOutput(0);
    expect(verify(req)).rejects.toThrow(/invalid output index: \d+/);
  });

  test('keccak', async () => {
    const req = new DataRequest();
    req.pushStr('').keccak().addOutput();
    req.pushStr('chonk').keccak().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(ethers.id('') as HexString);
    expect(values[1]).toBe(ethers.id('chonk') as HexString);
  });

  test('slice', async () => {
    const small = '0x112233445566778899';
    const big = Uint8Array.from({ length: 500 }, (_, i) => i);
    const req = new DataRequest();
    req.pushBytes(small).slice(4, 3).addOutput();
    req.pushBytes(toHex(big)).slice(300, 5).addOutput();
    req.pushBytes('0x').slice(0, 0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(ethers.dataSlice(small, 4, 4 + 3) as HexString);
    expect(values[1]).toBe(
      ethers.hexlify(big.slice(300, 300 + 5)) as HexString
    );
    expect(values[2]).toBe('0x');
  });

  test('slice overflow', async () => {
    const req = new DataRequest();
    req.pushBytes('0x1234').slice(5, 1);
    expect(verify(req)).rejects.toThrow('slice overflow');
  });

  test('concat ints', async () => {
    const req = new DataRequest();
    req.push(1).push(2).concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(
      ethers.concat([uint256(1), uint256(2)]) as HexString
    );
  });

  test('concat string x2', async () => {
    const req = new DataRequest();
    req.pushStr('r').pushStr('af').pushStr('fy').concat().concat().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(hexStr('raffy') as HexString);
  });

  test('concat nothing', async () => {
    const req = new DataRequest();
    req.concat();
    expect(verify(req)).rejects.toThrow('stack underflow');
  });

  test('dup last', async () => {
    const req = new DataRequest();
    req.push(1).dup().addOutput().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
    expect(values[1]).toBe(uint256(1));
  });

  test('dup deep', async () => {
    const req = new DataRequest();
    req.push(1).push(2).push(3).dup(2).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
  });

  test('dup nothing', async () => {
    const req = new DataRequest();
    req.dup().addOutput();
    expect(verify(req)).rejects.toThrow('stack underflow');
  });

  test('swap', async () => {
    const req = new DataRequest();
    req.push(1).push(2).swap().addOutput().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
    expect(values[1]).toBe(uint256(2));
  });

  test('pop', async () => {
    const req = new DataRequest();
    req.push(1).push(2).pop().addOutput();
    const { values } = await verify(req);
    expect(values.length).toBe(1);
    expect(values[0]).toBe(uint256(1));
  });

  test('pop underflow is allowed', async () => {
    const req = new DataRequest();
    req.pop().pop().pop();
    expect(verify(req)).resolves;
    //expect(verify(req)).rejects.toThrow('stack underflow');
  });

  test('pushSlot', async () => {
    const req = new DataRequest();
    req.setSlot(1337).pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1337));
  });

  test('pushTarget', async () => {
    const req = new DataRequest();
    req.setTarget(contract.target).pushTarget().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(contract.target.toLowerCase() as HexAddress);
  });

  test('pushOutput', async () => {
    const req = new DataRequest(2);
    req.push(5).setOutput(0).pushOutput(0).setOutput(1);
    const { values } = await verify(req);
    expect(values[1]).toBe(uint256(5));
  });

  test('follow', async () => {
    const req = new DataRequest();
    req.setSlot(1337).pushStr('raffy').follow().pushSlot().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(
      uint256(
        solidityFollowSlot(1337, hexStr('raffy') as HexString)
      ) as HexString
    );
  });

  test('read', async () => {
    const req = new DataRequest();
    req
      .setTarget(contract.target)
      .setSlot(0)
      .read()
      .addOutput()
      .setSlot(1)
      .read()
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(1));
    expect(values[1]).toBe(uint256(2));
  });

  test('read no target', async () => {
    const req = new DataRequest();
    req.read().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(uint256(0));
  });

  test('read(0)', async () => {
    const req = new DataRequest();
    req.read(0).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe('0x');
  });

  test('read(2)', async () => {
    const req = new DataRequest();
    req.setTarget(contract.target).setSlot(0).read(2).addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(
      ethers.concat([uint256(1), uint256(2)]) as HexString
    );
  });

  test('readBytes small', async () => {
    const req = new DataRequest();
    req.setTarget(contract.target).setSlot(2).readBytes().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(hexStr('abc') as HexString);
  });

  test('readBytes big', async () => {
    const req = new DataRequest();
    req.setTarget(contract.target).setSlot(3).readBytes().addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(hexStr('abc'.repeat(20)) as HexString);
  });

  test('readArray', async () => {
    const req = new DataRequest();
    req
      .setTarget(contract.target)
      .setSlot(4)
      .readArray(96 >> 3)
      .addOutput();
    const { values } = await verify(req);
    expect(values[0]).toBe(
      '0x000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000020000000000000000000000010000000000000000000000000000000000000000000000000000000000000003'
    );
  });

  test('requireNonzero on zero', async () => {
    const req = new DataRequest();
    req.push(0).requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(1);
  });

  test('requireNonzero on non-zero', async () => {
    const req = new DataRequest();
    req.push(1).requireNonzero();
    req.push('0x0001').requireNonzero();
    req.pushStr('abc').requireNonzero();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(0);
  });

  test('requireContract on contract', async () => {
    const req = new DataRequest();
    req.setTarget(contract.target).requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(0);
  });

  test('requireContract on null', async () => {
    const req = new DataRequest();
    req.setTarget(zeroAddress).requireContract();
    const { exitCode } = await verify(req);
    expect(exitCode).toBe(1);
  });

  test('evalLoop requireContract', async () => {
    const req = new DataRequest();
    req.push(1);
    req.push(contract.target);
    req.push('0x51050ec063d393217B436747617aD1C2285Aeeee');
    req.push(uint256(0));
    req.begin().target().requireContract().end();
    req.evalLoop({ success: true, acquire: true });
    const { target, stack } = await verify(req);
    expect(target).toBe(contract.target.toLowerCase() as HexAddress);
    expect(stack).toHaveLength(0);
  });

  test('evalLoop requireNonzero', async () => {
    const req = new DataRequest(1);
    req.push(123);
    req.push(1337);
    req.push(0);
    req.pushStr('');
    req.pushProgram(new EVMProgram().requireNonzero().setOutput(0));
    req.evalLoop({ success: true });
    const { values, stack } = await verify(req);
    expect(values[0]).toBe(uint256(1337));
    expect(stack).toHaveLength(0);
  });

  test('evalLoop empty', async () => {
    const req = new DataRequest(1);
    req.pushProgram(new EVMProgram().concat()); // this will throw if executed
    req.evalLoop();
    await verify(req);
  });

  // TODO: need more eval tests
  test('eval', async () => {
    const req = new DataRequest();
    req.pushProgram(new EVMProgram().push(1337));
    req.eval();
    req.addOutput();
    const { values } = await verify(req);
    expect(values[0]).toStrictEqual(uint256(1337));
  });
});
