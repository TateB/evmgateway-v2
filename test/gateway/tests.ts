import { expect, test } from 'bun:test';
import type { TestState } from './common.js';

const opts = { enableCcipRead: true };

// imo better to expect(await) than expect().resolves
export function runSlotDataTests(
  state: TestState,
  pointer = false,
  skipZero = false
) {
  test('latest = 49', async () => {
    expect(await state.reader.readLatest(opts)).toEqual(49n);
  });
  test.skipIf(!pointer)('pointer => latest = 49', async () => {
    expect(await state.reader.readLatestViaPointer(opts)).toEqual(49n);
  });
  test('name = "Satoshi"', async () => {
    expect(await state.reader.readName(opts)).toEqual('Satoshi');
  });
  test('highscores[0] = 1', async () => {
    expect(await state.reader.readHighscore(0, opts)).toEqual(1n);
  });
  test('highscores[latest] = 12345', async () => {
    expect(await state.reader.readLatestHighscore(opts)).toEqual(12345n);
  });
  test('highscorers[latest] = name', async () => {
    expect(await state.reader.readLatestHighscorer(opts)).toEqual('Satoshi');
  });
  test('realnames["Money Skeleton"] = "Vitalik Buterin"', async () => {
    expect(await state.reader.readRealName('Money Skeleton', opts)).toEqual(
      'Vitalik Buterin'
    );
  });
  test('realnames[highscorers[latest]] = "Hal Finney"', async () => {
    expect(await state.reader.readLatestHighscorerRealName(opts)).toEqual(
      'Hal Finney'
    );
  });
  test.skipIf(skipZero)('zero = 0', async () => {
    expect(await state.reader.readZero(opts)).toEqual(0n);
  });
  test('root.str = "raffy"', async () => {
    expect(await state.reader.readRootStr([], opts)).toEqual('raffy');
  });
  test('root.map["a"].str = "chonk"', async () => {
    expect(await state.reader.readRootStr(['a'], opts)).toEqual('chonk');
  });
  test('root.map["a"].map["b"].str = "eth"', async () => {
    expect(await state.reader.readRootStr(['a', 'b'], opts)).toEqual('eth');
  });
  test('highscorers[keccak(...)] = "chonk"', async () => {
    expect(await state.reader.readSlicedKeccak(opts)).toEqual('chonk');
  });
}
