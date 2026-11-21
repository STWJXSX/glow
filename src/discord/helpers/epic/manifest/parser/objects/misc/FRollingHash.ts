// @ts-nocheck
export class FRollingHash {
  static readonly HashPoly64 = 0xC96C5795D7870F42n;
  static HashTable: bigint[] | null = null;

  static Init(): void {
    if (FRollingHash.HashTable != null) return;

    const table: bigint[] = [];
    for (let tableIndex = 0; tableIndex < 256; tableIndex += 1) {
      let crc = BigInt(tableIndex);
      for (let shiftCount = 0; shiftCount < 8; shiftCount += 1) {
        if ((crc & 1n) === 1n) {
          crc = (crc >> 1n) ^ FRollingHash.HashPoly64;
        } else {
          crc >>= 1n;
        }
      }
      table[tableIndex] = crc;
    }

    FRollingHash.HashTable = table;
  }

  static GetHashForDataSet(data: Buffer): bigint {
    FRollingHash.Init();
    const table = FRollingHash.HashTable!;

    let hashState = 0n;
    for (let i = 0; i < data.length; i += 1) {
      hashState = FRollingHash.ROTLEFT_64B(hashState, 1) ^ table[data[i]!]!;
    }
    return hashState;
  }

  private static ROTLEFT_64B(value: bigint, shifts: number): bigint {
    const s = BigInt(shifts % 64);
    const width = 64n;
    return ((value << s) | (value >> ((width - s) % width))) & ((1n << width) - 1n);
  }
}
