/** HomebaseRating curve — stat×16 axis → lobby PL (matches in-game lobby UI). */
const HOMEBASE_RATING_KEYS: [number, number][] = [
  [0, 1], [236, 2], [364, 3], [432, 4], [512, 5],
  [704, 7], [932, 8], [1196, 9], [1876, 13], [2740, 16],
  [3824, 19], [4692, 22], [5460, 24], [6260, 25], [7172, 26],
  [8084, 29], [9552, 32], [10912, 36], [13104, 41], [14844, 46],
  [17180, 49], [19008, 53], [20928, 54], [22708, 55], [24588, 57],
  [26324, 60], [28804, 63], [31312, 68], [35008, 73], [37660, 78],
  [40380, 81], [42308, 84], [44316, 86], [46448, 87], [48592, 89],
  [50852, 93], [54480, 96], [58064, 102], [62528, 107], [65472, 113],
  [68320, 116], [70400, 120], [72384, 121], [74464, 123], [76448, 124],
  [78528, 126], [80512, 127], [82592, 128], [84576, 130], [86124, 131],
  [87040, 133], [87520, 134], [87904, 136], [88384, 137], [88768, 139],
  [89248, 140], [89632, 142], [90112, 143], [90304, 144], [180608, 288],
];

export function interpolateHomebaseCurve(curveKey: number): number {
  if (!(curveKey > 0)) return 0;
  const points = HOMEBASE_RATING_KEYS;
  if (curveKey <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (curveKey >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (curveKey > x2) continue;
    const t = (x1 === x2) ? 1 : (curveKey - x1) / (x2 - x1);
    return Math.round((y1 * (1 - t) + y2 * t) * 100) / 100;
  }
  return last[1];
}

/** Lobby PL from total FORT stats — game uses min(FORT)×16 on HomebaseRating curve. */
export function evalLobbyPowerFromFort(input: {
  fortitude: number;
  offense: number;
  resistance: number;
  technology: number;
}): number {
  const minStat = Math.min(
    input.fortitude,
    input.offense,
    input.resistance,
    input.technology,
  );
  if (!(minStat > 0)) return 0;
  return Math.floor(interpolateHomebaseCurve(minStat * 16));
}

/** Calibrated lobby estimate from loadout + backpack sub-ratings (party meta or profile-derived). */
export function evalLobbyBlendPower(input: {
  loadoutRating: number;
  backpackRating: number;
  backpackWeight?: number;
}): number {
  const wBp = Math.max(0, Math.min(1, input.backpackWeight ?? 0.77));
  const wLo = 1 - wBp;
  const blended = input.backpackRating * wBp + input.loadoutRating * wLo;
  return Math.floor(blended);
}
