export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export const legacyGround = (x: number, z: number) =>
  7 +
  Math.sin(x * 0.0017) * 8 +
  Math.cos(z * 0.0014) * 7 +
  Math.sin((x + z) * 0.003) * 3;

export const ground = (x: number, z: number) => {
  const base = legacyGround(x, z);
  const t = clamp((Math.hypot(x, z) - 430) / 900, 0, 1);
  const trainingBlend = t * t * (3 - 2 * t);
  const riverDistance = Math.abs(
    x - (980 + Math.sin(z * 0.0017) * 260 + Math.sin(z * 0.0033) * 65),
  );
  const valley = 1 - Math.exp(-Math.pow(riverDistance / 420, 2));
  const rolls =
    24 +
    18 * Math.sin(x * 0.0021 + z * 0.0009) +
    15 * Math.cos(z * 0.0026 - x * 0.0007);
  const ridge =
    100 *
    Math.exp(-Math.pow((x + 1600) / 1400, 2) - Math.pow((z - 1400) / 2100, 2));
  const eastHills =
    76 *
    Math.exp(-Math.pow((x - 2600) / 1100, 2) - Math.pow((z + 1700) / 1600, 2));
  return base + trainingBlend * valley * (rolls + ridge + eastHills);
};

export const riverX = (z: number) =>
  980 + Math.sin(z * 0.0017) * 260 + Math.sin(z * 0.0033) * 65;
