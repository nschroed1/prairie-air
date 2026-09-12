import * as T from 'three';
import { ground, riverX, type Simulation } from '../simulation';
import {
  StuntTracker,
  roadConfigs,
  windmillLocations,
  type WireSpan,
  type StuntEvent,
  WIRE_POLE_HEIGHT,
  WIRE_DIP_AGL,
} from '../stunts';
export * from '../stunts';

/**
 * Procedural Environmental Stunt Props & Near-Miss Adrenaline System
 */
export class StuntWorldProps extends StuntTracker {
  scene: T.Scene;
  group: T.Group;

  declare wireSpans: WireSpan<T.Vector3>[];

  private windmillRotors: T.Group[] = [];
  private geometries: T.BufferGeometry[] = [];
  private materials: T.Material[] = [];

  constructor(scene: T.Scene, group: T.Group) {
    super(false);
    this.scene = scene;
    this.group = group;

    this.buildTelephoneWires();
    this.buildTrestleBridge();
    this.buildWindmills();
    this.registerFarmsteadObstacles();
  }

  /**
   * Helper to register geometry for clean disposal
   */
  private trackGeo<G extends T.BufferGeometry>(g: G): G {
    this.geometries.push(g);
    return g;
  }

  /**
   * Helper to register material for clean disposal
   */
  private trackMat<M extends T.Material>(m: M): M {
    this.materials.push(m);
    return m;
  }

  /**
   * Procedurally builds utility poles and 3-strand sagging catenary telephone wires
   * along country section roads (Z = n * 510 + 255 and X = n * 510 + 255).
   */
  private buildTelephoneWires(): void {
    const poleWoodMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#423326',
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    const wireMat = this.trackMat(
      new T.LineBasicMaterial({
        color: '#1a1d1f',
        linewidth: 1,
      }),
    );
    const insulatorMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#a8d2d6',
        roughness: 0.2,
      }),
    );

    // Reusable pole & crossarm geometries
    const poleRadius = 0.16;
    const poleHeight = WIRE_POLE_HEIGHT;
    const poleGeo = this.trackGeo(
      new T.CylinderGeometry(poleRadius * 0.8, poleRadius, poleHeight, 8),
    );
    const crossarmGeo = this.trackGeo(new T.BoxGeometry(2.4, 0.14, 0.14));
    const insulatorGeo = this.trackGeo(
      new T.CylinderGeometry(0.04, 0.05, 0.14, 6),
    );

    const wireVertices: number[] = [];

    // Country section road alignments to place telephone wire lines along road shoulders
    let spanId = 0;

    for (const road of roadConfigs) {
      const poles: Array<{ pos: T.Vector3; groundY: number }> = [];

      for (let s = road.start; s <= road.end; s += road.step) {
        const px = road.axis === 'x' ? s : road.fixed;
        const pz = road.axis === 'x' ? road.fixed : s;

        // Skip poles directly placed inside the river channel
        if (Math.abs(px - riverX(pz)) < 55) continue;

        const gy = ground(px, pz);
        const poleGroup = new T.Group();
        poleGroup.position.set(px, gy, pz);

        // Vertical pole
        const poleMesh = new T.Mesh(poleGeo, poleWoodMat);
        poleMesh.position.y = poleHeight / 2;
        poleMesh.castShadow = true;
        poleGroup.add(poleMesh);

        // Crossarm at 9.8m
        const crossarm = new T.Mesh(crossarmGeo, poleWoodMat);
        crossarm.position.y = poleHeight - 0.2;
        if (road.axis === 'x') {
          crossarm.rotation.y = Math.PI / 2; // Perpendicular to wire span
        }
        crossarm.castShadow = true;
        poleGroup.add(crossarm);

        // 3 Glass insulators
        const offsets = [-0.9, 0, 0.9];
        for (const off of offsets) {
          const ins = new T.Mesh(insulatorGeo, insulatorMat);
          if (road.axis === 'x') {
            ins.position.set(0, poleHeight - 0.1, off);
          } else {
            ins.position.set(off, poleHeight - 0.1, 0);
          }
          poleGroup.add(ins);
        }

        this.group.add(poleGroup);
        poles.push({
          pos: new T.Vector3(px, gy + poleHeight - 0.15, pz),
          groundY: gy,
        });
      }

      // Connect consecutive poles with 3-strand sagging catenary wires
      for (let i = 0; i < poles.length - 1; i++) {
        const pA = poles[i];
        const pB = poles[i + 1];
        const dist = pA.pos.distanceTo(pB.pos);
        if (dist > road.step * 1.6) continue; // Skip gaps over river or terrain cutoffs

        // Sag calculation: at mid-span dips down to WIRE_DIP_AGL (7.5m AGL)
        const avgGround = (pA.groundY + pB.groundY) / 2;
        const poleTopAvg = (pA.pos.y + pB.pos.y) / 2;
        const targetMidY = avgGround + WIRE_DIP_AGL;
        const sag = Math.max(1.5, poleTopAvg - targetMidY); // Exactly 2.5m sag from 10m to 7.5m

        const span: WireSpan<T.Vector3> = {
          id: `wire_span_${spanId++}`,
          roadName: road.name,
          p1: pA.pos.clone(),
          p2: pB.pos.clone(),
          ground1: pA.groundY,
          ground2: pB.groundY,
          midpoint: new T.Vector3(
            (pA.pos.x + pB.pos.x) / 2,
            targetMidY,
            (pA.pos.z + pB.pos.z) / 2,
          ),
          length: dist,
          wireDipY: WIRE_DIP_AGL,
          lastTriggeredTime: -Infinity,
        };
        this.wireSpans.push(span);

        // 3 strands: left, center, right
        const strandOffsets = [-0.9, 0, 0.9];
        const numSegments = 8;

        for (const off of strandOffsets) {
          const offX = road.axis === 'x' ? 0 : off;
          const offZ = road.axis === 'x' ? off : 0;

          let prevX = pA.pos.x + offX;
          let prevY = pA.pos.y;
          let prevZ = pA.pos.z + offZ;

          for (let seg = 1; seg <= numSegments; seg++) {
            const t = seg / numSegments;
            const curX = pA.pos.x + (pB.pos.x - pA.pos.x) * t + offX;
            const curZ = pA.pos.z + (pB.pos.z - pA.pos.z) * t + offZ;
            // Catenary parabolic sag: dips maximum at t = 0.5
            const sagY = 4.0 * sag * t * (1.0 - t);
            const curY = pA.pos.y + (pB.pos.y - pA.pos.y) * t - sagY;

            wireVertices.push(prevX, prevY, prevZ, curX, curY, curZ);

            prevX = curX;
            prevY = curY;
            prevZ = curZ;
          }
        }
      }
    }

    if (wireVertices.length > 0) {
      const wireGeo = this.trackGeo(new T.BufferGeometry());
      wireGeo.setAttribute(
        'position',
        new T.Float32BufferAttribute(wireVertices, 3),
      );
      const wireLine = new T.LineSegments(wireGeo, wireMat);
      this.group.add(wireLine);
    }
  }

  /**
   * Builds the timber railroad trestle bridge spanning the Ocheyedan River at z = 150m.
   */
  private buildTrestleBridge(): void {
    const woodMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#34261b',
        roughness: 0.95,
        metalness: 0.05,
      }),
    );
    const railMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#6e7072',
        roughness: 0.4,
        metalness: 0.8,
      }),
    );
    const tieMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#261b14',
        roughness: 0.98,
      }),
    );

    const rx = this.trestleBridge.riverX;
    const z = this.trestleBridge.z;
    const deckY = this.trestleBridge.deckY;
    const spanHalf = this.trestleBridge.spanWidth / 2;

    const bridgeGroup = new T.Group();
    bridgeGroup.position.set(0, 0, 0);

    // 1. Deck stringers (longitudinal heavy timbers under deck)
    const stringerGeo = this.trackGeo(
      new T.BoxGeometry(this.trestleBridge.spanWidth, 0.8, 4.4),
    );
    const stringerMesh = new T.Mesh(stringerGeo, woodMat);
    stringerMesh.position.set(rx, deckY - 0.4, z);
    stringerMesh.castShadow = true;
    bridgeGroup.add(stringerMesh);

    // 2. Bridge ties / railroad sleepers spaced every 1.2m
    const tieGeo = this.trackGeo(new T.BoxGeometry(0.32, 0.28, 3.8));
    for (let x = rx - spanHalf; x <= rx + spanHalf; x += 1.2) {
      const tie = new T.Mesh(tieGeo, tieMat);
      tie.position.set(x, deckY + 0.14, z);
      bridgeGroup.add(tie);
    }

    // 3. Steel rails running across the bridge
    const railGeo = this.trackGeo(
      new T.BoxGeometry(this.trestleBridge.spanWidth, 0.22, 0.12),
    );
    for (const railSign of [-1, 1]) {
      const rail = new T.Mesh(railGeo, railMat);
      rail.position.set(rx, deckY + 0.35, z + railSign * 0.72);
      bridgeGroup.add(rail);
    }

    // 4. Timber Trestle Bents (vertical support pilings and cross-braced bents)
    // Placed every 16m across the river gorge, leaving wide open bent arches between them
    const bentSpacing = 16.0;
    const pilingGeo = this.trackGeo(new T.CylinderGeometry(0.3, 0.35, 1, 8));
    const capGeo = this.trackGeo(new T.BoxGeometry(0.6, 0.5, 5.0));

    for (
      let bx = rx - spanHalf + 10;
      bx <= rx + spanHalf - 10;
      bx += bentSpacing
    ) {
      const groundY = ground(bx, z);
      const bentHeight = deckY - 0.8 - groundY;
      if (bentHeight <= 2) continue;

      const bentGroup = new T.Group();
      bentGroup.position.set(bx, groundY, z);

      // Top cap timber
      const cap = new T.Mesh(capGeo, woodMat);
      cap.position.set(0, bentHeight, 0);
      bentGroup.add(cap);

      // 4 vertical / battered timber piles per bent
      const pileOffsets = [-1.8, -0.6, 0.6, 1.8];
      for (const pOff of pileOffsets) {
        const pile = new T.Mesh(pilingGeo, woodMat);
        pile.scale.set(1, bentHeight, 1);
        pile.position.set(0, bentHeight / 2, pOff);
        pile.castShadow = true;
        bentGroup.add(pile);
      }

      // Horizontal sash timbers
      const sashGeo = this.trackGeo(new T.BoxGeometry(0.3, 0.35, 4.2));
      const sash = new T.Mesh(sashGeo, woodMat);
      sash.position.set(0, bentHeight * 0.5, 0);
      bentGroup.add(sash);

      bridgeGroup.add(bentGroup);
    }

    // Guard rails on both sides of the bridge
    const guardGeo = this.trackGeo(
      new T.BoxGeometry(this.trestleBridge.spanWidth, 0.16, 0.16),
    );
    for (const gSign of [-1, 1]) {
      const guard = new T.Mesh(guardGeo, woodMat);
      guard.position.set(rx, deckY + 1.1, z + gSign * 2.1);
      bridgeGroup.add(guard);
    }

    this.group.add(bridgeGroup);
  }

  /**
   * Builds prairie windmills with rotating wind-wheels.
   */
  private buildWindmills(): void {
    const galvMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#c4cad0',
        roughness: 0.45,
        metalness: 0.65,
      }),
    );
    const vaneMat = this.trackMat(
      new T.MeshStandardMaterial({
        color: '#9e2b1b',
        roughness: 0.7,
      }),
    );

    // Reusable windmill parts
    const towerHeight = 16.0;
    const baseRadius = 2.2;
    const topRadius = 0.7;

    const legGeo = this.trackGeo(
      new T.CylinderGeometry(0.08, 0.1, towerHeight, 6),
    );
    const bladeGeo = this.trackGeo(new T.BoxGeometry(0.24, 2.4, 0.03));
    const vaneGeo = this.trackGeo(new T.BoxGeometry(0.04, 1.2, 2.2));

    // Place windmills at selected farmsteads and pastures
    let windIndex = 0;
    for (const loc of windmillLocations) {
      const gy = ground(loc.x, loc.z);
      const millGroup = new T.Group();
      millGroup.position.set(loc.x, gy, loc.z);

      // 4 lattice corner legs
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const bx = Math.cos(angle) * baseRadius;
        const bz = Math.sin(angle) * baseRadius;
        const tx = Math.cos(angle) * topRadius;
        const tz = Math.sin(angle) * topRadius;

        const leg = new T.Mesh(legGeo, galvMat);
        leg.position.set((bx + tx) / 2, towerHeight / 2, (bz + tz) / 2);
        const tiltX = (tx - bx) / towerHeight;
        const tiltZ = (tz - bz) / towerHeight;
        leg.rotation.set(-tiltZ, 0, tiltX);
        leg.castShadow = true;
        millGroup.add(leg);
      }

      // Horizontal cross girts
      for (let y = 3; y < towerHeight; y += 3) {
        const r = baseRadius + (topRadius - baseRadius) * (y / towerHeight);
        const girtGeo = this.trackGeo(new T.BoxGeometry(r * 2, 0.1, 0.1));
        const girt1 = new T.Mesh(girtGeo, galvMat);
        girt1.position.set(0, y, r);
        millGroup.add(girt1);
        const girt2 = new T.Mesh(girtGeo, galvMat);
        girt2.position.set(0, y, -r);
        millGroup.add(girt2);
      }

      // Top head assembly and rotor
      const headGroup = new T.Group();
      headGroup.position.set(0, towerHeight, 0);

      // Rotor wheel (18 blades)
      const rotorGroup = new T.Group();
      rotorGroup.position.set(0, 0, 0.6);

      const numBlades = 18;
      for (let b = 0; b < numBlades; b++) {
        const bAngle = (b * Math.PI * 2) / numBlades;
        const blade = new T.Mesh(bladeGeo, galvMat);
        blade.position.set(Math.sin(bAngle) * 1.3, Math.cos(bAngle) * 1.3, 0);
        blade.rotation.z = -bAngle;
        blade.rotation.y = 0.18; // Pitch angle
        rotorGroup.add(blade);
      }
      headGroup.add(rotorGroup);
      this.windmillRotors.push(rotorGroup);

      // Tail vane
      const vane = new T.Mesh(vaneGeo, vaneMat);
      vane.position.set(0, 0.4, -1.8);
      headGroup.add(vane);

      millGroup.add(headGroup);
      this.group.add(millGroup);

      // Register windmill for near-miss system
      this.obstacles.push({
        id: `windmill_${windIndex++}`,
        kind: 'windmill',
        x: loc.x,
        z: loc.z,
        baseY: gy,
        height: towerHeight + 3.0,
        radius: 2.6, // Effective proximity radius around tower & wheel
        lastTriggeredTime: -Infinity,
      });
    }
  }

  animateScenery(dt: number) {
    for (const rotor of this.windmillRotors) rotor.rotation.z += dt * 3.8;
  }
  update(dt: number, sim: Simulation, time: number): StuntEvent[] {
    this.animateScenery(dt);
    return super.update(dt, sim, time);
  }

  /**
   * Cleanly disposes all geometries and materials, and clears the group.
   */
  dispose(): void {
    for (const g of this.geometries) {
      g.dispose();
    }
    this.geometries = [];

    for (const m of this.materials) {
      m.dispose();
    }
    this.materials = [];

    this.group.clear();
    this.windmillRotors = [];
    this.wireSpans = [];
    this.obstacles = [];
  }
}
