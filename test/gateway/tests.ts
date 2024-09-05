import { expect, test } from 'bun:test';
import { Contract } from 'ethers';

export function runSlotDataTests(reader: Contract) {
  test('latest = 49', () => {
    return expect(
      reader.readLatest({ enableCcipRead: true })
    ).resolves.toStrictEqual(49n);
  });
  test('name = "Satoshi"', () => {
    return expect(
      reader.readName({ enableCcipRead: true })
    ).resolves.toStrictEqual('Satoshi');
  });
  test('highscores[0] = 1', () => {
    return expect(
      reader.readHighscore(0, { enableCcipRead: true })
    ).resolves.toStrictEqual(1n);
  });
  test('highscores[latest] = 12345', () => {
    return expect(
      reader.readLatestHighscore({ enableCcipRead: true })
    ).resolves.toStrictEqual(12345n);
  });
  test('highscorers[latest] = name', () => {
    return expect(
      reader.readLatestHighscorer({ enableCcipRead: true })
    ).resolves.toStrictEqual('Satoshi');
  });
  test('realnames["Money Skeleton"] = "Vitalik Buterin"', () => {
    return expect(
      reader.readRealName('Money Skeleton', { enableCcipRead: true })
    ).resolves.toStrictEqual('Vitalik Buterin');
  });
  test('realnames[highscorers[latest]] = "Hal Finney"', () => {
    return expect(
      reader.readLatestHighscorerRealName({ enableCcipRead: true })
    ).resolves.toStrictEqual('Hal Finney');
  });
  if (!process.env.IS_CI) {
    test('zero = 0', () => {
      return expect(
        reader.readZero({ enableCcipRead: true })
      ).resolves.toStrictEqual(0n);
    });
  }
  test('root.str = "raffy"', () => {
    return expect(
      reader.readRootStr([], { enableCcipRead: true })
    ).resolves.toStrictEqual('raffy');
  });
  test('root.map["a"].str = "chonk"', () => {
    return expect(
      reader.readRootStr(['a'], { enableCcipRead: true })
    ).resolves.toStrictEqual('chonk');
  });
  test('root.map["a"].map["b"].str = "eth"', () => {
    return expect(
      reader.readRootStr(['a', 'b'], { enableCcipRead: true })
    ).resolves.toStrictEqual('eth');
  });
  test('highscorers[keccak(...)] = "chonk"', () => {
    return expect(
      reader.readSlicedKeccak({ enableCcipRead: true })
    ).resolves.toStrictEqual('chonk');
  });
}
