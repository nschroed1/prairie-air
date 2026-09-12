export const FARMSTEADS = [
  [-315, -195],
  [-680, 140],
  [-370, -735],
  [500, -720],
  [-1200, 780],
  [1680, 220],
  [-1730, -700],
  [1920, -1300],
  [30, -1640],
] as const;

export const farmRotation = (index: number) =>
  ((Math.imul(index + 11, 2654435761) >>> 0) % 1000) / 2000;
