import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { birdFlock, locustSwarm, tornadoState } from './challenge';
import { ground, type Simulation } from './simulation';
import {
  createBarnwoodMaterial,
  createCorrugatedRoofMaterial,
  createSiloMaterial,
} from './fx/building-materials';

const material = (color: string) =>
  new T.MeshStandardMaterial({ color, roughness: 0.82 });
/** Bounded, reusable geometry. All motion comes from the same functions as server collisions. */
export class HazardWorld {
  root = new T.Group();
  yards = new T.Group();
  key = '';
  birds = new T.InstancedMesh(
    new T.SphereGeometry(1, 6, 4),
    material('#eee5c9'),
    12,
  );
  wings = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    material('#333a3c'),
    24,
  );
  insects = new T.InstancedMesh(
    new T.BoxGeometry(0.48, 0.14, 0.9),
    material('#bac047'),
    360,
  );
  funnel = new T.Group();
  funnelMesh: T.Mesh;
  debris = new T.InstancedMesh(
    new T.BoxGeometry(1.8, 0.6, 2.8),
    material('#968367'),
    80,
  );
  dummy = new T.Object3D();
  constructor(scene: T.Scene) {
    this.root.name = 'Contract hazards';
    this.root.add(
      this.yards,
      this.birds,
      this.wings,
      this.insects,
      this.funnel,
      this.debris,
    );
    const profile = Array.from(
      { length: 25 },
      (_, i) => new T.Vector2(9 + Math.pow(i / 24, 1.7) * 84, i * 10),
    );
    this.funnelMesh = new T.Mesh(
      new T.LatheGeometry(profile, 28),
      new T.MeshStandardMaterial({
        color: '#4d5351',
        transparent: true,
        opacity: 0.83,
        roughness: 1,
        side: T.DoubleSide,
      }),
    );
    this.funnel.add(this.funnelMesh);
    for (let i = 0; i < 12; i++) {
      const ring = new T.Mesh(
        new T.TorusGeometry(
          14 + Math.pow(i / 12, 1.7) * 77,
          3 + i * 0.6,
          5,
          28,
        ),
        new T.MeshStandardMaterial({
          color: i % 2 ? '#73766c' : '#5c625e',
          transparent: true,
          opacity: 0.42,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = i * 20;
      this.funnel.add(ring);
    }
    for (const mesh of [this.birds, this.wings, this.insects, this.debris]) {
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
    }
    scene.add(this.root);
  }
  clearYards() {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    this.yards.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Line) {
        geometries.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.yards.clear();
  }
  rebuild(sim: Simulation) {
    this.clearYards();
    for (const o of sim.job.challenge?.obstacles ?? []) {
      const x = sim.job.x + o.x,
        z = sim.job.z + o.z;
      const group = new T.Group();
      group.position.set(x, ground(x, z), z);
      this.yards.add(group);
      const red = createBarnwoodMaterial('#bd4d34'),
        roof = createCorrugatedRoofMaterial('#dad6ba'),
        dark = material('#273e39'),
        white = material('#f5e4bd'),
        steel = createSiloMaterial(),
        hay = material('#d8b858');
      const box = (
        w: number,
        h: number,
        d: number,
        m: T.Material,
        xx: number,
        yy: number,
        zz: number,
      ) => {
        const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), m);
        mesh.position.set(xx, yy, zz);
        mesh.castShadow = mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      // A draped gravel yard keeps crops and spray visibly outside the protected footprint.
      const vertices: number[] = [];
      for (let xx = -o.width / 2; xx < o.width / 2; xx += 12)
        for (let zz = -o.depth / 2; zz < o.depth / 2; zz += 12) {
          for (const [a, b] of [
            [xx, zz],
            [xx, zz + 12],
            [xx + 12, zz],
            [xx + 12, zz],
            [xx, zz + 12],
            [xx + 12, zz + 12],
          ])
            vertices.push(a, ground(x + a, z + b) - group.position.y + 0.5, b);
        }
      const yard = new T.BufferGeometry();
      yard.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      yard.computeVertexNormals();
      group.add(new T.Mesh(yard, material('#8e8164')));
      for (let edge = 0; edge < 4; edge++) {
        const length = edge % 2 ? o.depth : o.width;
        for (let n = 0; n <= length; n += 6) {
          const xx =
            edge % 2 ? ((edge === 1 ? 1 : -1) * o.width) / 2 : n - o.width / 2;
          const zz =
            edge % 2 ? n - o.depth / 2 : ((edge === 0 ? -1 : 1) * o.depth) / 2;
          box(
            edge % 2 ? 1 : 5,
            0.45,
            edge % 2 ? 5 : 1,
            n % 12 ? dark : white,
            xx,
            ground(x + xx, z + zz) - group.position.y + 0.9,
            zz,
          );
        }
      }
      if (o.kind === 'barn') {
        const bw = o.bodyWidth;
        const bd = o.bodyDepth;
        const bh = o.height;
        const wallThick = 2.1;
        const wallX = bw / 2 - wallThick / 2;
        const breezewayHeight = Math.min(9.6, bh * 0.53);
        const loftHeight = bh - breezewayHeight;
        const roofLength = bd + 2.0;

        // Hollow drive-through breezeway: left and right side walls with central opening
        box(wallThick, breezewayHeight, bd, red, -wallX, breezewayHeight / 2, 0);
        box(wallThick, breezewayHeight, bd, red, wallX, breezewayHeight / 2, 0);

        // Solid upper hayloft floor spanning above the breezeway
        box(bw, loftHeight * 0.45, bd, red, 0, breezewayHeight + loftHeight * 0.22, 0);

        const roofSpan = bw * 0.56;
        for (const sign of [-1, 1]) {
          const panel = box(roofSpan, 0.65, roofLength, roof, sign * (bw * 0.25), bh - loftHeight * 0.22, 0);
          panel.rotation.z = -sign * Math.atan2(loftHeight * 0.75, bw * 0.5);

          // White door frame trim on open North and South gable ends
          box(0.8, breezewayHeight, 0.6, white, -wallX + wallThick * 0.35, breezewayHeight / 2, sign * (bd / 2 + 0.1));
          box(0.8, breezewayHeight, 0.6, white, wallX - wallThick * 0.35, breezewayHeight / 2, sign * (bd / 2 + 0.1));
          box(bw, 0.8, 0.6, white, 0, breezewayHeight, sign * (bd / 2 + 0.1));

          // Hayloft window above opening
          box(3.2, 3.4, 0.4, dark, 0, bh - loftHeight * 0.4, sign * (bd / 2 + 0.2));
          box(0.5, 3.8, 0.6, white, 0, bh - loftHeight * 0.4, sign * (bd / 2 + 0.3));
          box(3.6, 0.5, 0.6, white, 0, bh - loftHeight * 0.1, sign * (bd / 2 + 0.3));
        }

        // Interior hay bales stacked along the inner walls, keeping the central corridor open
        const baleX = wallX - wallThick / 2 - 1.2;
        box(2.0, 1.8, bd * 0.25, hay, -baleX, 0.9, -bd * 0.2);
        box(2.0, 1.8, bd * 0.25, hay, -baleX, 0.9, bd * 0.2);
        box(2.0, 1.8, bd * 0.25, hay, baleX, 0.9, -bd * 0.15);
        box(2.0, 1.8, bd * 0.25, hay, baleX, 0.9, bd * 0.25);
      } else if (o.kind === 'silo') {
        const silo = new T.Mesh(
          new T.CylinderGeometry(6.5, 6.5, 24, 16),
          steel,
        );
        silo.position.y = 12;
        silo.castShadow = true;
        group.add(silo);
        const cap = new T.Mesh(new T.ConeGeometry(6.5, 3, 16), roof);
        cap.position.y = 25.5;
        group.add(cap);
        for (let y = 2; y < 24; y += 4) {
          const band = new T.Mesh(new T.TorusGeometry(6.6, 0.14, 4, 20), dark);
          band.rotation.x = Math.PI / 2;
          band.position.y = y;
          group.add(band);
        }
        box(0.6, 23, 0.6, white, 0, 11.5, 6.9);
      } else {
        for (let row = 0; row < 2; row++)
          for (let col = 0; col < 3 - row; col++) {
            const bale = box(
              6,
              3,
              12,
              hay,
              (col - (2 - row) / 2) * 6.5,
              1.5 + row * 3,
              0,
            );
            bale.rotation.y = row ? 0.04 : 0;
          }
      }
      // A bright obstruction beacon remains readable as the front darkens.
      const beacon = new T.Mesh(
        new T.SphereGeometry(0.8, 8, 5),
        new T.MeshBasicMaterial({ color: '#ffb63f' }),
      );
      beacon.position.y = o.height + 1;
      group.add(beacon);
      // Dispose unused palette materials too; each yard owns its resources.
      const used = new Set<T.Material>();
      group.traverse((m) => {
        if (m instanceof T.Mesh)
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((v) =>
            used.add(v),
          );
      });
      [red, roof, dark, white, steel, hay]
        .filter((m) => !used.has(m))
        .forEach((m) => m.dispose());
    }
    // Batch the yard markings and building parts rather than adding a draw call
    // for every stripe, door and silo band during low flight.
    this.yards.updateMatrixWorld(true);
    const batches = new Map<T.Material, T.BufferGeometry[]>();
    this.yards.traverse((o) => {
      if (!(o instanceof T.Mesh) || Array.isArray(o.material)) return;
      const geometry = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      geometry.applyMatrix4(o.matrixWorld);
      const batch = batches.get(o.material) ?? [];
      batch.push(geometry);
      batches.set(o.material, batch);
      o.geometry.dispose();
    });
    this.yards.clear();
    for (const [m, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!geometry) {
        m.dispose();
        continue;
      }
      const mesh = new T.Mesh(geometry, m);
      mesh.castShadow = mesh.receiveShadow = true;
      this.yards.add(mesh);
    }
  }
  update(sim: Simulation, enabled = true) {
    this.root.visible = enabled && Boolean(sim.job.challenge);
    if (!this.root.visible) return;
    const key = `${sim.job.id}:${sim.job.challenge?.seed}`;
    if (this.key !== key) {
      this.key = key;
      this.rebuild(sim);
    }
    const time = sim.elapsed,
      d = this.dummy;
    const birds = birdFlock(sim.job, time);
    this.birds.visible = this.wings.visible = Boolean(birds);
    if (birds) {
      const y = ground(birds.x, birds.z) + birds.altitude;
      for (let i = 0; i < 12; i++) {
        const x = birds.x + Math.sin(i * 2.4) * (3 + i),
          z = birds.z + Math.cos(i * 2.4) * (3 + i);
        const yy = y + Math.sin(i * 1.7) * 3;
        d.position.set(x, yy, z);
        d.rotation.set(0, Math.PI / 2, 0);
        d.scale.set(0.5, 0.45, 1.35);
        d.updateMatrix();
        this.birds.setMatrixAt(i, d.matrix);
        for (const sign of [-1, 1]) {
          d.position.set(x, yy + Math.sin(time * 8 + i) * 0.6, z + sign * 1.4);
          d.rotation.set(Math.sin(time * 8 + i) * sign * 0.5, 0, 0);
          d.scale.set(1.3, 0.1, 2);
          d.updateMatrix();
          this.wings.setMatrixAt(i * 2 + (sign === 1 ? 1 : 0), d.matrix);
        }
      }
      this.birds.instanceMatrix.needsUpdate =
        this.wings.instanceMatrix.needsUpdate = true;
    }
    const swarm = locustSwarm(sim.job, time);
    this.insects.visible = Boolean(swarm);
    if (swarm) {
      const y = ground(swarm.x, swarm.z) + swarm.altitude;
      for (let i = 0; i < 360; i++) {
        const a = i * 2.399 + time * 0.26,
          r = Math.sqrt((i + 0.5) / 360) * 58;
        d.position.set(
          swarm.x + Math.sin(a) * r,
          y + Math.sin(i * 7.1 + time * 1.6) * 15,
          swarm.z + Math.cos(a) * r,
        );
        d.rotation.set(Math.sin(time * 12 + i) * 0.5, a, 0);
        d.scale.setScalar(1);
        d.updateMatrix();
        this.insects.setMatrixAt(i, d.matrix);
      }
      this.insects.instanceMatrix.needsUpdate = true;
    }
    const tornado = tornadoState(sim.job, time);
    this.funnel.visible = this.debris.visible = Boolean(tornado);
    if (tornado) {
      const y = ground(tornado.x, tornado.z),
        emerging = tornado.active ? 1 : 1 - tornado.seconds / 35;
      this.funnel.position.set(tornado.x, y + (1 - emerging) * 170, tornado.z);
      this.funnel.scale.y = Math.max(0.2, emerging);
      this.funnel.rotation.y = time * 0.8;
      for (let i = 0; i < this.funnel.children.length; i++)
        this.funnel.children[i].position.x =
          Math.sin(time * 1.2 + i * 0.35) * i * 0.5;
      for (let i = 0; i < 80; i++) {
        const a = time * (1.1 + (i % 3) * 0.2) + i * 1.7,
          h = (time * 9 + i * 2.3) % 150,
          r = 15 + h * 0.36;
        d.position.set(
          tornado.x + Math.sin(a) * r,
          y + h + 1,
          tornado.z + Math.cos(a) * r,
        );
        d.rotation.set(a, a * 0.7, a * 0.4);
        d.scale.setScalar(tornado.active ? 1 : 0.3);
        d.updateMatrix();
        this.debris.setMatrixAt(i, d.matrix);
      }
      this.debris.instanceMatrix.needsUpdate = true;
    }
  }
}
