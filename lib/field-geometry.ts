/** Shared local-space boundaries: renderer, coverage, maps and server replay. */
export type FieldPoint = { x: number; z: number };
export type NoSprayZone = {
  x: number;
  z: number;
  width: number;
  depth: number;
};
export type FieldShape = {
  width?: number;
  depth?: number;
  boundary?: readonly FieldPoint[];
  noSprayZones?: readonly NoSprayZone[];
};
export const fieldSize = (shape: FieldShape) => ({
  width: shape.width ?? 456,
  depth: shape.depth ?? 452,
});
export function fieldOutline(shape: FieldShape): readonly FieldPoint[] {
  if (shape.boundary) return shape.boundary;
  const { width, depth } = fieldSize(shape);
  return [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ];
}
export function polygonArea(points: readonly FieldPoint[]) {
  return (
    Math.abs(
      points.reduce((sum, a, i) => {
        const b = points[(i + 1) % points.length];
        return sum + a.x * b.z - b.x * a.z;
      }, 0),
    ) / 2
  );
}
export function containsPoint(
  points: readonly FieldPoint[],
  x: number,
  z: number,
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a.z > z !== b.z > z &&
      x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function insideField(
  shape: FieldShape & { x: number; z: number },
  x: number,
  z: number,
) {
  if (inNoSprayZone(shape, x - shape.x, z - shape.z)) return false;
  if (shape.boundary)
    return containsPoint(shape.boundary, x - shape.x, z - shape.z);
  const { width, depth } = fieldSize(shape);
  return Math.abs(x - shape.x) < width / 2 && Math.abs(z - shape.z) < depth / 2;
}
export const inNoSprayZone = (shape: FieldShape, x: number, z: number) =>
  Boolean(
    shape.noSprayZones?.some(
      (zone) =>
        Math.abs(x - zone.x) <= zone.width / 2 &&
        Math.abs(z - zone.z) <= zone.depth / 2,
    ),
  );
export function clipField(
  points: readonly FieldPoint[],
  left: number,
  top: number,
  right: number,
  bottom: number,
): FieldPoint[] {
  let result = [...points];
  for (const [axis, edge, sign] of [
    ['x', left, 1],
    ['x', right, -1],
    ['z', top, 1],
    ['z', bottom, -1],
  ] as const) {
    const input = result;
    result = [];
    if (!input.length) break;
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const ina = (a[axis] - edge) * sign >= 0,
        inb = (b[axis] - edge) * sign >= 0;
      if (ina) result.push(a);
      if (ina !== inb) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
    }
  }
  return result;
}
const cellsCache = new WeakMap<FieldShape, Map<number, FieldPoint[]>>();
const sharedCells = new Map<string, Map<number, FieldPoint[]>>();
export function fieldCells(shape: FieldShape) {
  const cached = cellsCache.get(shape);
  if (cached) return cached;
  const key = JSON.stringify([
    shape.width ?? 456,
    shape.depth ?? 452,
    shape.boundary,
    shape.noSprayZones,
  ]);
  const shared = sharedCells.get(key);
  if (shared) {
    cellsCache.set(shape, shared);
    return shared;
  }
  const cells = new Map<number, FieldPoint[]>(),
    outline = fieldOutline(shape);
  for (let row = 0; row < 38; row++)
    for (let col = 0; col < 38; col++) {
      const x = -228 + col * 12,
        z = -228 + row * 12;
      if (inNoSprayZone(shape, x + 6, z + 6)) continue;
      const polygon = clipField(outline, x, z, x + 12, z + 12);
      if (polygonArea(polygon) > 1e-7) cells.set(row * 38 + col, polygon);
    }
  cellsCache.set(shape, cells);
  if (sharedCells.size >= 64)
    sharedCells.delete(sharedCells.keys().next().value!);
  sharedCells.set(key, cells);
  return cells;
}
export const fieldCellCount = (shape: FieldShape) => fieldCells(shape).size;

/** Stable convex parcels keep edges readable and safe-footprint checks exact. */
export function parcelShape(
  gx: number,
  gz: number,
): Required<Pick<FieldShape, 'width' | 'depth' | 'boundary'>> {
  const hash =
    (Math.imul(gx + 57, 73856093) ^ Math.imul(gz + 71, 19349663)) >>> 0;
  const width = 336 + (hash % 11) * 12,
    depth = 332 + ((hash >>> 8) % 11) * 12;
  const templates = [
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ],
    [
      [-0.55, -1],
      [0.62, -1],
      [1, 1],
      [-1, 1],
    ],
    [
      [-1, -1],
      [0.35, -1],
      [1, -0.28],
      [1, 1],
      [-1, 1],
    ],
    [
      [-0.55, -1],
      [1, -1],
      [0.55, 1],
      [-1, 1],
    ],
    [
      [-0.55, -1],
      [0.65, -1],
      [1, -0.5],
      [1, 0.55],
      [0.55, 1],
      [-0.7, 1],
      [-1, 0.4],
      [-1, -0.55],
    ],
    [
      [-1, -0.5],
      [-0.1, -1],
      [1, -0.65],
      [0.75, 1],
      [-1, 0.7],
    ],
  ];
  const shape = templates[(hash >>> 16) % templates.length];
  const flipX = hash & 1 ? -1 : 1,
    flipZ = hash & 2 ? -1 : 1;
  let boundary = shape.map(([x, z]) => ({
    x: ((x * width) / 2) * flipX,
    z: ((z * depth) / 2) * flipZ,
  }));
  if (flipX * flipZ < 0) boundary = boundary.reverse();
  return { width, depth, boundary };
}

/** Intersections of a north/south pass with a convex field. */
export function passExtent(shape: FieldShape, localX: number) {
  const p = fieldOutline(shape),
    hits: number[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    if (Math.abs(a.x - b.x) < 1e-8) continue;
    const t = (localX - a.x) / (b.x - a.x);
    if (t >= 0 && t <= 1) hits.push(a.z + (b.z - a.z) * t);
  }
  return hits.length >= 2
    ? { min: Math.min(...hits), max: Math.max(...hits) }
    : null;
}
