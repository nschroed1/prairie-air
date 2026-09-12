import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fields, ground, riverX, insideField } from './simulation';

import { FARMSTEADS } from './landmark-data';
export { FARMSTEADS } from './landmark-data';
export const PADDOCKS = FARMSTEADS.map(([x, z]) => ({
  x: x + 85,
  z: z + 70,
  width: 70,
  depth: 50,
})).filter((pen) => Math.abs(pen.x - riverX(pen.z)) > 160);
export const FARM_CLEARINGS = [
  ...FARMSTEADS.map(([x, z]) => ({
    x: x - 10,
    z: z + 10,
    width: 130,
    depth: 95,
  })),
  ...PADDOCKS,
];
export const inFarmClearing = (x: number, z: number) =>
  FARM_CLEARINGS.some(
    (area) =>
      Math.abs(x - area.x) < area.width / 2 + 2 &&
      Math.abs(z - area.z) < area.depth / 2 + 2,
  );

export type RuralKind = 'cow' | 'sheep' | 'goat' | 'person';
export type RuralResident = {
  kind: RuralKind;
  x: number;
  z: number;
  angle: number;
  scale: number;
  phase: number;
  walking: boolean;
};
const kinds: RuralKind[] = ['cow', 'sheep', 'goat', 'person'];
const CAPACITY = 96;
const RADIUS = 420;

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function ruralResidents(): RuralResident[] {
  const roll = seeded(77219),
    residents: RuralResident[] = [];
  const add = (kind: RuralKind, x: number, z: number, walking = false) =>
    residents.push({
      kind,
      x,
      z,
      angle: roll() * Math.PI * 2,
      scale: kind === 'person' ? 0.93 + roll() * 0.16 : 0.78 + roll() * 0.3,
      phase: roll() * Math.PI * 2,
      walking,
    });
  for (const field of fields.filter((f) => f.crop === 'pasture')) {
    const herds = [
      { kind: 'cow' as const, dx: -75, dz: -55, count: 14 },
      { kind: 'sheep' as const, dx: 65, dz: 70, count: 12 },
      { kind: 'goat' as const, dx: -60, dz: 100, count: 8 },
    ];
    for (const herd of herds)
      for (let i = 0; i < herd.count; i++) {
        const x = field.x + herd.dx + (roll() - 0.5) * 70;
        const z = field.z + herd.dz + (roll() - 0.5) * 55;
        if (!inFarmClearing(x, z) && insideField(field, x, z))
          add(herd.kind, x, z);
      }
  }
  // Farmyard pens put animals near the first low approach as well as out in pasture.
  for (const pen of PADDOCKS)
    for (let i = 0; i < 14; i++) {
      const kind = i < 4 ? 'cow' : i < 9 ? 'sheep' : 'goat';
      add(kind, pen.x + (roll() - 0.5) * 51, pen.z + (roll() - 0.5) * 31);
    }
  for (const [x, z] of FARMSTEADS) {
    for (let i = 0; i < 3; i++)
      add('person', x - 14 + i * 13, z + 39 + roll() * 12, i !== 0);
    const roadX = Math.round((x - 255) / 510) * 510 + 264;
    if (Math.abs(roadX - riverX(z + 105)) > 150)
      add('person', roadX, z + 105, true);
  }
  return residents;
}

/** A single colored geometry per species keeps hundreds of residents to four draws. */
export function ruralGeometry(kind: RuralKind): T.BufferGeometry {
  const pieces: T.BufferGeometry[] = [];
  const part = (
    shape: T.BufferGeometry,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string,
    motion = 0,
    rz = 0,
  ) => {
    const g = shape.index ? shape.toNonIndexed() : shape;
    if (g !== shape) shape.dispose();
    g.deleteAttribute('uv');
    g.scale(sx, sy, sz);
    g.rotateZ(rz);
    g.translate(x, y, z);
    const count = g.attributes.position.count,
      tint = new T.Color(color),
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new T.BufferAttribute(colors, 3));
    g.setAttribute(
      'lifePart',
      new T.BufferAttribute(new Float32Array(count).fill(motion), 1),
    );
    pieces.push(g);
  };
  const box = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string,
    motion = 0,
    rz = 0,
  ) => part(new T.BoxGeometry(1, 1, 1), x, y, z, sx, sy, sz, color, motion, rz);
  const round = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: string,
    motion = 0,
  ) =>
    part(new T.IcosahedronGeometry(1, 1), x, y, z, sx, sy, sz, color, motion);
  const horn = (x: number, y: number, z: number, height: number, rz: number) =>
    part(
      new T.ConeGeometry(0.08, height, 5),
      x,
      y,
      z,
      1,
      1,
      1,
      '#d3c6a0',
      1,
      rz,
    );
  if (kind === 'person') {
    box(0, 1.13, 0, 0.62, 0.66, 0.35, '#c86736');
    box(0, 0.91, 0.035, 0.53, 0.32, 0.36, '#385c79');
    box(-0.18, 1.2, 0.2, 0.07, 0.52, 0.035, '#385c79');
    box(0.18, 1.2, 0.2, 0.07, 0.52, 0.035, '#385c79');
    for (const side of [-1, 1]) {
      box(
        side * 0.16,
        0.44,
        0,
        0.23,
        0.76,
        0.25,
        '#354d69',
        side === -1 ? 2 : 3,
      );
      box(
        side * 0.16,
        0.09,
        0.07,
        0.25,
        0.18,
        0.38,
        '#3b332b',
        side === -1 ? 2 : 3,
      );
      box(side * 0.4, 1.15, 0, 0.19, 0.58, 0.22, '#c86736', side === 1 ? 4 : 0);
      round(
        side * 0.4,
        0.82,
        0,
        0.105,
        0.14,
        0.11,
        '#d3a275',
        side === 1 ? 4 : 0,
      );
    }
    round(0, 1.7, 0.02, 0.23, 0.27, 0.21, '#d3a275');
    round(0, 1.84, -0.035, 0.23, 0.13, 0.2, '#514335');
    part(
      new T.CylinderGeometry(0.39, 0.4, 0.065, 10),
      0,
      1.91,
      0,
      1,
      1,
      1,
      '#d9bd72',
    );
    part(
      new T.CylinderGeometry(0.24, 0.28, 0.2, 8),
      0,
      2.035,
      0,
      1,
      1,
      1,
      '#d9bd72',
    );
    box(0, 1.69, 0.215, 0.1, 0.08, 0.07, '#c68d62');
  } else {
    const cow = kind === 'cow',
      sheep = kind === 'sheep';
    const bodyY = cow ? 1.38 : sheep ? 0.98 : 1.0;
    const coat = cow ? '#f5edda' : sheep ? '#e4ddc8' : '#b39064';
    const legHeight = cow ? 0.92 : 0.64;
    const bodyLength = cow ? 1.5 : sheep ? 1.02 : 0.85;
    round(
      0,
      bodyY,
      0,
      cow ? 0.78 : sheep ? 0.62 : 0.45,
      cow ? 0.68 : sheep ? 0.57 : 0.42,
      bodyLength,
      coat,
    );
    for (const side of [-1, 1])
      for (const end of [-1, 1]) {
        const legX = side * (cow ? 0.48 : sheep ? 0.34 : 0.27),
          legZ = end * (cow ? 0.93 : 0.58);
        box(
          legX,
          legHeight / 2,
          legZ,
          cow ? 0.2 : 0.13,
          legHeight,
          cow ? 0.22 : 0.14,
          sheep ? '#4b4238' : coat,
          side * end === 1 ? 2 : 3,
        );
        box(
          legX,
          0.09,
          legZ + 0.035,
          cow ? 0.24 : 0.16,
          0.18,
          cow ? 0.28 : 0.2,
          '#433e34',
          side * end === 1 ? 2 : 3,
        );
      }
    if (cow) {
      for (const side of [-1, 1]) {
        round(side * 0.695, 1.56, -0.42, 0.13, 0.32, 0.53, '#373e38');
        round(side * 0.65, 1.42, 0.52, 0.14, 0.3, 0.3, '#373e38');
      }
      round(0, 1.3, 1.45, 0.36, 0.47, 0.5, '#f5edda', 1);
      round(0, 1.0, 1.79, 0.35, 0.23, 0.28, '#a97765', 1);
      for (const side of [-1, 1]) {
        round(side * 0.4, 1.58, 1.37, 0.28, 0.105, 0.15, '#373e38', 1);
        round(side * 0.29, 1.43, 1.72, 0.045, 0.055, 0.035, '#292e29', 1);
      }
      box(0.12, 1.01, -1.51, 0.085, 0.86, 0.09, '#ded2b8');
      round(0.12, 0.55, -1.53, 0.13, 0.17, 0.12, '#373e38');
    } else if (sheep) {
      for (let puff = 0; puff < 8; puff++) {
        const angle = (puff * Math.PI) / 4;
        round(
          Math.sin(angle) * 0.36,
          1.09 + (puff % 2) * 0.1,
          Math.cos(angle) * 0.69,
          0.38,
          0.43,
          0.4,
          puff % 2 ? '#f0e8d5' : '#dcd6c6',
        );
      }
      round(0, 1.03, 1.02, 0.23, 0.3, 0.4, '#574d40', 1);
      for (const side of [-1, 1])
        round(side * 0.27, 1.24, 0.99, 0.24, 0.095, 0.12, '#574d40', 1);
      round(0, 1.13, -1.0, 0.18, 0.22, 0.24, '#f0e8d5');
    } else {
      round(0, 1.13, 0.83, 0.25, 0.42, 0.28, '#b39064', 1);
      round(0, 1.12, 1.05, 0.21, 0.27, 0.32, '#ded0ab', 1);
      for (const side of [-1, 1]) {
        horn(side * 0.14, 1.63, 0.81, 0.48, side * -0.32);
        round(side * 0.26, 1.37, 0.88, 0.23, 0.09, 0.13, '#ae885d', 1);
      }
      part(
        new T.ConeGeometry(0.1, 0.31, 5),
        0,
        0.79,
        1.19,
        1,
        1,
        1,
        '#66533d',
        1,
        Math.PI,
      );
      box(0, 1.25, -0.88, 0.12, 0.38, 0.13, '#ded0ab', 0, -0.35);
    }
  }
  const geometry = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}

export class RuralLife {
  readonly residents = ruralResidents();
  readonly group = new T.Group();
  readonly meshes = new Map<RuralKind, T.InstancedMesh>();
  private nearby: RuralResident[] = [];
  private nextScan = -1;
  private scanX = Infinity;
  private scanZ = Infinity;
  private dummy = new T.Object3D();
  private clock = { value: 0 };
  private pilot = { value: new T.Vector3() };
  private altitudeFade = { value: 1 };
  constructor(scene: T.Scene) {
    this.group.name = 'rural-life';
    for (const kind of kinds) {
      const material = new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.lifeTime = this.clock;
        shader.uniforms.lifePilot = this.pilot;
        shader.uniforms.lifeFade = this.altitudeFade;
        shader.vertexShader =
          'attribute float lifePart; uniform float lifeTime; uniform vec3 lifePilot;\n' +
          shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
          float phase=instanceMatrix[3].x*.17+instanceMatrix[3].z*.13;
          if(lifePart>1.5 && lifePart<3.5) transformed.z+=sin(lifeTime*2.2+phase+(lifePart>2.5?3.14159:0.))*.095*(1.-smoothstep(0.,.85,position.y));
          if(lifePart>.5 && lifePart<1.5) transformed.y+=sin(lifeTime*.65+phase)*.065;
          if(lifePart>3.5){
            float wave=(1.-smoothstep(85.,145.,distance(instanceMatrix[3].xz,lifePilot.xz)))*(1.-smoothstep(65.,110.,lifePilot.y));
            float angle=wave*(2.2+sin(lifeTime*4.+phase)*.18);
            vec2 arm=transformed.xy-vec2(.4,1.42);
            transformed.xy=vec2(cos(angle)*arm.x-sin(angle)*arm.y,sin(angle)*arm.x+cos(angle)*arm.y)+vec2(.4,1.42);
          }
          #endif`,
        );
        shader.fragmentShader =
          'uniform float lifeFade;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float fade=(1.-smoothstep(300.,420.,length(vViewPosition)))*lifeFade;
          if(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>fade)discard;`,
        );
      };
      material.customProgramCacheKey = () => 'prairie-rural-life-v1';
      const mesh = new T.InstancedMesh(ruralGeometry(kind), material, CAPACITY);
      mesh.name = kind;
      mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.meshes.set(kind, mesh);
      this.group.add(mesh);
    }
    scene.add(this.group);
  }
  update(time: number, x: number, z: number, altitude: number) {
    this.group.visible = altitude < 175;
    if (!this.group.visible) return;
    this.clock.value = time;
    this.pilot.value.set(x, altitude, z);
    this.altitudeFade.value = 1 - T.MathUtils.smoothstep(altitude, 120, 175);
    if (
      time >= this.nextScan ||
      Math.hypot(x - this.scanX, z - this.scanZ) > 75
    ) {
      this.nextScan = time + 0.5;
      this.scanX = x;
      this.scanZ = z;
      this.nearby = this.residents
        .filter(
          (resident) =>
            (resident.x - x) ** 2 + (resident.z - z) ** 2 < (RADIUS + 15) ** 2,
        )
        .sort(
          (a, b) =>
            (a.x - x) ** 2 + (a.z - z) ** 2 - (b.x - x) ** 2 - (b.z - z) ** 2,
        );
    }
    const counts = { cow: 0, sheep: 0, goat: 0, person: 0 };
    for (const resident of this.nearby) {
      if (counts[resident.kind] >= CAPACITY) continue;
      const phase = time * (resident.walking ? 0.2 : 0.09) + resident.phase;
      const px =
        resident.x +
        (resident.walking ? Math.sin(phase) * 4 : Math.sin(phase) * 0.65);
      const pz =
        resident.z +
        (resident.walking ? Math.cos(phase) * 3 : Math.cos(phase) * 0.65);
      this.dummy.position.set(
        px,
        ground(px, pz) + (inFarmClearing(px, pz) ? 0.38 : 0.13),
        pz,
      );
      this.dummy.rotation.set(
        0,
        resident.walking
          ? -phase + Math.PI / 2
          : resident.angle + Math.sin(phase) * 0.1,
        0,
      );
      this.dummy.scale.setScalar(resident.scale);
      this.dummy.updateMatrix();
      this.meshes
        .get(resident.kind)!
        .setMatrixAt(counts[resident.kind]++, this.dummy.matrix);
    }
    for (const kind of kinds) {
      const mesh = this.meshes.get(kind)!;
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
