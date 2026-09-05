import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ground,
  riverX,
  fields,
  Simulation,
  type Controls,
} from './simulation';

function random(seed = 1701) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const rng = random();
const mat = (
  color: T.ColorRepresentation,
  extra: T.MeshStandardMaterialParameters = {},
) => new T.MeshStandardMaterial({ color, roughness: 0.86, ...extra });
const dummy = new T.Object3D();
const Y = new T.Vector3(0, 1, 0);

export class World {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(55, 1, 1, 14000);
  renderer: T.WebGLRenderer;
  plane = new T.Group();
  prop = new T.Group();
  marker = new T.Group();
  coverageMesh: T.InstancedMesh;
  particles: T.Points;
  particlePositions = new Float32Array(2100);
  particleLife = new Float32Array(700);
  particleIndex = 0;
  sun: T.DirectionalLight;
  cloudGroup = new T.Group();
  frame = 0;
  last = 0;
  time = 0;
  lastCoverage = -1;
  currentJob = -1;
  cameraMode = 0;
  resizeObserver: ResizeObserver;
  onFrame: (() => void) | null = null;
  disposed = false;
  constructor(
    public host: HTMLElement,
    public sim: Simulation,
    public input: Controls,
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Three-dimensional flight over Iowa farmland',
    );
    this.scene.fog = new T.FogExp2('#b6d8d4', 0.00019);
    this.scene.add(new T.HemisphereLight('#d3eaff', '#687b35', 2.0));
    this.sun = new T.DirectionalLight('#fff1c6', 3.4);
    this.sun.position.set(-500, 700, -400);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -170;
    this.sun.shadow.camera.right = 170;
    this.sun.shadow.camera.top = 170;
    this.sun.shadow.camera.bottom = -170;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 1600;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.createSky();
    this.createLand();
    this.createFarms();
    this.createPlane();
    this.scene.add(this.plane, this.marker);
    this.coverageMesh = new T.InstancedMesh(
      new T.PlaneGeometry(11.8, 11.8),
      new T.MeshBasicMaterial({
        color: '#b5ef72',
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        side: T.DoubleSide,
      }),
      1444,
    );
    this.coverageMesh.count = 0;
    this.coverageMesh.frustumCulled = false;
    this.scene.add(this.coverageMesh);
    const pg = new T.BufferGeometry();
    pg.setAttribute(
      'position',
      new T.BufferAttribute(this.particlePositions, 3),
    );
    this.particles = new T.Points(
      pg,
      new T.PointsMaterial({
        color: '#eefff0',
        size: 3.6,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        map: this.particleTexture(),
        sizeAttenuation: true,
      }),
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.updatePlane();
    this.camera.position
      .copy(this.plane.position)
      .add(new T.Vector3(27, 16, 39));
    this.frame = requestAnimationFrame(this.animate);
  }
  particleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,.7)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    return new T.CanvasTexture(canvas);
  }
  addMesh(
    geo: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
    parent: T.Object3D = this.scene,
  ) {
    const mesh = new T.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  box(
    w: number,
    h: number,
    d: number,
    material: T.Material,
    x: number,
    y: number,
    z: number,
    parent: T.Object3D = this.scene,
  ) {
    return this.addMesh(new T.BoxGeometry(w, h, d), material, x, y, z, parent);
  }
  createSky() {
    const sky = new T.Mesh(
      new T.SphereGeometry(11000, 32, 16),
      new T.ShaderMaterial({
        side: T.BackSide,
        depthWrite: false,
        vertexShader:
          'varying vec3 vWorld; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
        fragmentShader:
          'varying vec3 vWorld; void main(){ vec3 d=normalize(vWorld); float h=max(d.y,0.0); vec3 c=mix(vec3(.76,.89,.87),vec3(.12,.48,.72),pow(h,.55)); vec3 sunDir=normalize(vec3(-.5,.38,-.55)); float s=max(dot(d,sunDir),0.0); c+=vec3(1.,.79,.42)*pow(s,140.)*.32; c+=vec3(1.,.9,.63)*pow(s,2600.)*2.; gl_FragColor=vec4(c,1.); }',
      }),
    );
    this.scene.add(sky);
    const cg = new T.SphereGeometry(1, 9, 7),
      cm = mat('#fffdf0', { roughness: 1, flatShading: false });
    const clouds = new T.InstancedMesh(cg, cm, 360);
    let i = 0;
    for (let n = 0; n < 60; n++) {
      const x = (rng() - 0.5) * 13000,
        z = (rng() - 0.5) * 13000,
        y = 650 + rng() * 650;
      for (let p = 0; p < 6; p++) {
        dummy.position.set(
          x + (rng() - 0.5) * 280,
          y + (rng() - 0.5) * 50,
          z + (rng() - 0.5) * 120,
        );
        const scale = 35 + rng() * 65;
        dummy.scale.set(scale * 1.7, scale * 0.65, scale);
        dummy.rotation.set(0, rng(), 0);
        dummy.updateMatrix();
        clouds.setMatrixAt(i++, dummy.matrix);
      }
    }
    clouds.frustumCulled = false;
    this.cloudGroup.add(clouds);
    this.scene.add(this.cloudGroup);
  }
  landPatch(
    w: number,
    d: number,
    x: number,
    z: number,
    material: T.Material,
    offset = 0,
    segments = 12,
  ) {
    const g = new T.PlaneGeometry(
      w,
      d,
      w < 20 ? 1 : segments,
      d < 20 ? 1 : segments,
    );
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++)
      p.setY(i, ground(p.getX(i) + x, p.getZ(i) + z) + offset);
    g.computeVertexNormals();
    const m = this.addMesh(g, material, x, 0, z);
    m.castShadow = false;
    return m;
  }
  createLand() {
    this.landPatch(18000, 18000, 0, 0, mat('#69833b'), -0.4, 170);
    const palettes = {
      corn: ['#8c9c34', '#a8aa3f', '#92a143'],
      soybeans: ['#4f813c', '#598d45', '#719740'],
      pasture: ['#759e4b', '#87a850', '#669048'],
    };
    fields.forEach((f) => {
      const base = palettes[f.crop][Math.floor(rng() * 3)];
      const material = mat(base);
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = 'varying vec3 vLocal;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvLocal=position;',
        );
        shader.fragmentShader =
          'varying vec3 vLocal;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>\nfloat stripes = smoothstep(.3,.55,sin(vLocal.x*2.1)); float farFade=1.-smoothstep(250.,1700.,length(vViewPosition)); diffuseColor.rgb *= mix(.92,1.08,stripes*farFade); diffuseColor.rgb *= .96 + .04*sin(vLocal.z*.11)*sin(vLocal.x*.09);`,
        );
      };
      material.customProgramCacheKey = () => 'crop-stripes';
      this.landPatch(f.w, f.d, f.x, f.z, material, 0.08);
    });
    const roadMat = mat('#c5b794');
    for (let n = -6; n <= 6; n++) {
      this.landPatch(6500, 11, 0, n * 510 + 255, roadMat, 0.17, 120);
      this.landPatch(11, 6500, n * 510 + 255, 0, roadMat, 0.18, 120);
    }
    // A sinuous ribbon sits above a broad riparian grass strip.
    const ribbon = (width: number, y: number, material: T.Material) => {
      const vertices: number[] = [];
      const indices: number[] = [];
      for (let i = 0; i <= 220; i++) {
        const z = -8000 + (i / 220) * 16000,
          x = riverX(z);
        vertices.push(
          x - width,
          ground(x - width, z) + y,
          z,
          x + width,
          ground(x + width, z) + y,
          z,
        );
        if (i < 220) {
          const j = i * 2;
          indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      const m = this.addMesh(g, material, 0, 0, 0);
      m.castShadow = false;
    };
    ribbon(108, 0.6, mat('#6c9250'));
    ribbon(53, 1.1, mat('#53a4b3', { metalness: 0.4, roughness: 0.24 }));
    // Trees are instanced, including dense lines along the river and field edges.
    const trunks = new T.InstancedMesh(
      new T.CylinderGeometry(0.8, 1.25, 8, 5),
      mat('#706344'),
      1800,
    );
    const crowns = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 1),
      mat('#457443', { flatShading: true }),
      1800,
    );
    for (let i = 0; i < 1800; i++) {
      let x: number, z: number;
      if (i < 650) {
        z = (rng() - 0.5) * 6800;
        x = riverX(z) + (rng() > 0.5 ? 1 : -1) * (70 + rng() * 75);
      } else {
        const field = fields[Math.floor(rng() * fields.length)];
        x = field.x + (rng() - 0.5) * 470;
        z = field.z + (rng() > 0.5 ? 239 : -239) + (rng() - 0.5) * 10;
      }
      const h = 9 + rng() * 13;
      dummy.position.set(x, ground(x, z) + h * 0.3, z);
      dummy.rotation.set(0, rng() * 6, 0);
      dummy.scale.set(1, h / 12, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = ground(x, z) + h * 0.75;
      dummy.scale.set(h * 0.43, h * 0.53, h * 0.4);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(
        i,
        new T.Color().setHSL(
          0.22 + rng() * 0.07,
          0.35 + rng() * 0.16,
          0.22 + rng() * 0.11,
        ),
      );
    }
    trunks.castShadow = true;
    crowns.castShadow = true;
    this.scene.add(trunks, crowns);
    // Nearby crop geometry gives low passes a sense of speed without thousands of draw calls.
    const blades = [];
    for (let i = 0; i < 3; i++) {
      const g = new T.PlaneGeometry(1.6, 2.4);
      g.translate(0, 1.2, 0);
      g.rotateY((i * Math.PI) / 3);
      blades.push(g);
    }
    const cropGeo = mergeGeometries(blades),
      cropMat = mat('#99ad42', { side: T.DoubleSide });
    const stalks = new T.InstancedMesh(cropGeo, cropMat, 15000);
    let c = 0;
    for (let z = -222; z < 224; z += 5.6)
      for (let x = -224; x < 226; x += 2.5) {
        if (c >= 15000) break;
        dummy.position.set(x + (rng() - 0.5) * 0.6, ground(x, z), z);
        dummy.scale.setScalar(0.8 + rng() * 0.45);
        dummy.rotation.set(0, rng() * 0.5, 0);
        dummy.updateMatrix();
        stalks.setMatrixAt(c++, dummy.matrix);
      }
    stalks.count = c;
    stalks.receiveShadow = true;
    this.scene.add(stalks);
  }
  createFarms() {
    const red = mat('#a7402b'),
      roof = mat('#e3dfc4'),
      white = mat('#e6e6cd'),
      dark = mat('#35473c'),
      silo = mat('#b3bdba', { metalness: 0.35, roughness: 0.5 });
    const farms = [
      [-315, -195],
      [-680, 140],
      [-370, -735],
      [500, -720],
      [-1200, 780],
      [1680, 220],
      [-1730, -700],
      [1920, -1300],
      [30, -1640],
    ];
    for (const [x, z] of farms) {
      const p = new T.Group();
      p.position.set(x, ground(x, z), z);
      p.rotation.y = rng() * 0.5;
      this.scene.add(p);
      this.box(28, 15, 44, red, 0, 7.5, 0, p);
      const top = new T.CylinderGeometry(20, 20, 45, 3);
      top.rotateY(Math.PI / 2);
      top.rotateX(Math.PI / 2);
      this.addMesh(top, roof, 0, 18, 0, p);
      this.box(10, 11, 0.4, dark, 0, 5.5, 22.3, p);
      this.box(0.6, 12, 0.8, white, 0, 6, 22.6, p);
      this.box(11, 0.6, 0.8, white, 0, 11.7, 22.6, p);
      for (let q = -1; q <= 1; q += 2) {
        const beam = this.box(0.5, 13, 0.6, white, q * 2.8, 5.7, 22.8, p);
        beam.rotation.z = q * 0.45;
      }
      this.addMesh(new T.CylinderGeometry(8, 8, 27, 18), silo, 32, 13.5, -8, p);
      this.addMesh(
        new T.SphereGeometry(8, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        silo,
        32,
        27,
        -8,
        p,
      );
      this.box(18, 10, 16, white, -36, 5, 10, p);
      const r1 = this.box(12, 1, 20, dark, -40, 12, 10, p);
      r1.rotation.z = 0.6;
      const r2 = this.box(12, 1, 20, dark, -31, 12, 10, p);
      r2.rotation.z = -0.6;
      for (let f = -2; f <= 2; f++)
        this.box(1, 4, 1, white, -70 + f * 14, 2, 48, p);
      this.box(57, 0.7, 0.6, white, -70, 2.8, 48, p);
    }
    // Pasture cattle, hay bales, and a familiar rural water tower.
    const cows = new T.InstancedMesh(
      new T.BoxGeometry(3, 2, 1.7),
      mat('#eee8d3'),
      90,
    );
    for (let i = 0; i < 90; i++) {
      const x = -1020 + (rng() - 0.5) * 400,
        z = 510 + (rng() - 0.5) * 400;
      dummy.position.set(x, ground(x, z) + 1.4, z);
      dummy.rotation.set(0, rng() * 6, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cows.setMatrixAt(i, dummy.matrix);
      if (i % 3 === 0) cows.setColorAt(i, new T.Color('#48473b'));
    }
    this.scene.add(cows);
    const tx = -500,
      tz = -1100,
      ty = ground(tx, tz);
    for (const dx of [-9, 9])
      for (const dz of [-9, 9])
        this.box(1.4, 58, 1.4, white, tx + dx, ty + 29, tz + dz);
    this.addMesh(new T.SphereGeometry(19, 16, 12), white, tx, ty + 62, tz);
  }
  createPlane() {
    const yellow = mat('#ffc32b', { metalness: 0.22, roughness: 0.36 }),
      gold = mat('#db8c0b', { metalness: 0.15, roughness: 0.38 }),
      dark = mat('#273b38', { metalness: 0.3, roughness: 0.3 }),
      glass = mat('#356572', { metalness: 0.8, roughness: 0.12 }),
      black = mat('#202a25');
    const fuselage = new T.CylinderGeometry(0.65, 1.05, 8.4, 12);
    fuselage.rotateX(Math.PI / 2);
    this.addMesh(fuselage, yellow, 0, 0, 0, this.plane);
    this.addMesh(
      new T.SphereGeometry(1.03, 16, 12),
      yellow,
      0,
      0,
      -4,
      this.plane,
    );
    const tail = new T.ConeGeometry(0.66, 5, 12);
    tail.rotateX(-Math.PI / 2);
    this.addMesh(tail, yellow, 0, 0.1, 5.5, this.plane);
    const canopy = this.addMesh(
      new T.SphereGeometry(1, 12, 8),
      glass,
      0,
      0.95,
      0.2,
      this.plane,
    );
    canopy.scale.set(0.77, 1.05, 1.55);
    for (const z of [-0.5, 0.65])
      this.box(1.5, 0.1, 0.09, yellow, 0, 1.78, z, this.plane);
    const shape = new T.Shape();
    shape.moveTo(-10, -1);
    shape.lineTo(-9.6, 1);
    shape.lineTo(-1.2, 1.5);
    shape.lineTo(1.2, 1.5);
    shape.lineTo(9.6, 1);
    shape.lineTo(10, -1);
    shape.lineTo(1.2, -1.6);
    shape.lineTo(-1.2, -1.6);
    shape.closePath();
    const wingG = new T.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSize: 0.12,
      bevelThickness: 0.09,
      bevelSegments: 1,
      steps: 1,
    });
    wingG.rotateX(Math.PI / 2);
    this.addMesh(wingG, yellow, 0, -0.25, -0.3, this.plane);
    for (const side of [-1, 1]) {
      this.box(0.5, 0.14, 2, gold, side * 8.8, -0.2, -0.3, this.plane);
      this.box(5.8, 0.08, 0.07, gold, side * 5.7, -0.31, 1.03, this.plane);
      const strut = this.box(
        0.12,
        2.05,
        0.12,
        dark,
        side * 1.25,
        -1.4,
        0.2,
        this.plane,
      );
      strut.rotation.z = side * 0.4;
      const tire = this.addMesh(
        new T.CylinderGeometry(0.53, 0.53, 0.36, 14),
        black,
        side * 1.7,
        -2.2,
        0.25,
        this.plane,
      );
      tire.rotation.z = Math.PI / 2;
      this.box(8, 0.07, 0.09, dark, side * 4.5, -0.65, 1.15, this.plane);
      for (let i = 1; i < 9; i++)
        this.addMesh(
          new T.ConeGeometry(0.08, 0.22, 5),
          dark,
          side * i,
          -0.75,
          1.15,
          this.plane,
        );
      const stabilizer = this.box(
        2.5,
        0.12,
        1.1,
        yellow,
        side * 1.35,
        0.3,
        6.5,
        this.plane,
      );
      stabilizer.rotation.y = side * -0.13;
    }
    const fin = this.box(0.15, 2, 1.9, yellow, 0, 1.1, 6.55, this.plane);
    fin.rotation.x = -0.17;
    this.box(0.17, 0.35, 1.6, gold, 0, 1.95, 6.65, this.plane);
    this.addMesh(
      new T.CylinderGeometry(0.29, 0.29, 0.3, 10),
      black,
      0,
      -0.55,
      7.1,
      this.plane,
    ).rotation.z = Math.PI / 2;
    this.prop.position.set(0, 0, -5);
    this.plane.add(this.prop);
    for (let i = 0; i < 3; i++) {
      const blade = this.box(0.2, 3.8, 0.08, dark, 0, 0, 0, this.prop);
      blade.rotation.z = (i * Math.PI) / 3;
    }
    const disc = this.addMesh(
      new T.CircleGeometry(2.0, 40),
      new T.MeshBasicMaterial({
        color: '#e5e8cb',
        transparent: true,
        opacity: 0.09,
        side: T.DoubleSide,
        depthWrite: false,
      }),
      0,
      0,
      -0.05,
      this.prop,
    );
    disc.castShadow = false;
  }
  updateMarker() {
    if (this.currentJob === this.sim.job.id) return;
    this.currentJob = this.sim.job.id;
    while (this.marker.children.length) {
      const child = this.marker.children[0];
      this.marker.remove(child);
      if (child instanceof T.Mesh || child instanceof T.Line) {
        child.geometry.dispose();
        (child.material as T.Material).dispose();
      }
    }
    const { x, z } = this.sim.job;
    const points: T.Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * 4;
      let px: number, pz: number;
      if (t < 1) {
        px = -228 + 456 * t;
        pz = 226;
      } else if (t < 2) {
        px = 228;
        pz = 226 - 452 * (t - 1);
      } else if (t < 3) {
        px = 228 - 456 * (t - 2);
        pz = -226;
      } else {
        px = -228;
        pz = -226 + 452 * (t - 3);
      }
      points.push(new T.Vector3(x + px, ground(x + px, z + pz) + 2, z + pz));
    }
    this.marker.add(
      new T.Line(
        new T.BufferGeometry().setFromPoints(points),
        new T.LineBasicMaterial({
          color: '#edffc1',
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );
    for (const dx of [-228, 228])
      for (const dz of [-226, 226]) {
        const h = ground(x + dx, z + dz);
        const pole = this.addMesh(
          new T.CylinderGeometry(0.28, 0.28, 12, 6),
          mat('#e5edbb'),
          x + dx,
          h + 6,
          z + dz,
          this.marker,
        );
        pole.castShadow = false;
        const flag = this.addMesh(
          new T.PlaneGeometry(5, 2.5),
          new T.MeshBasicMaterial({ color: '#e6f999', side: T.DoubleSide }),
          x + dx + 2.5,
          h + 11,
          z + dz,
          this.marker,
        );
        flag.castShadow = false;
      }
    this.lastCoverage = -1;
  }
  updatePlane() {
    this.plane.position.set(this.sim.x, this.sim.y, this.sim.z);
    this.plane.rotation.order = 'YXZ';
    this.plane.rotation.set(this.sim.pitch, -this.sim.heading, this.sim.roll);
  }
  updateCoverage() {
    if (this.lastCoverage === this.sim.coverageVersion) return;
    this.lastCoverage = this.sim.coverageVersion;
    let i = 0;
    this.sim.covered.forEach((n) => {
      const x = this.sim.job.x - 228 + (n % 38) * 12 + 6,
        z = this.sim.job.z - 228 + Math.floor(n / 38) * 12 + 6;
      dummy.position.set(x, ground(x, z) + 2.65, z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.coverageMesh.setMatrixAt(i++, dummy.matrix);
    });
    this.coverageMesh.count = i;
    this.coverageMesh.instanceMatrix.needsUpdate = true;
  }
  updateParticles(dt: number) {
    if (this.sim.spraying) {
      for (let p = 0; p < 16; p++) {
        const i = this.particleIndex++ % 700;
        const side = (rng() - 0.5) * 18;
        const v = new T.Vector3(side, -0.8, 1.2).applyMatrix4(
          this.plane.matrixWorld,
        );
        this.particlePositions[i * 3] = v.x;
        this.particlePositions[i * 3 + 1] = v.y;
        this.particlePositions[i * 3 + 2] = v.z;
        this.particleLife[i] = 2.5 + rng();
      }
    }
    for (let i = 0; i < 700; i++) {
      if (this.particleLife[i] > 0) {
        this.particleLife[i] -= dt;
        this.particlePositions[i * 3] += 0.8 * dt;
        this.particlePositions[i * 3 + 1] -= dt * 6;
      } else this.particlePositions[i * 3 + 1] = -1000;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }
  resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  animate = (ms: number) => {
    if (this.disposed) return;
    const dt = this.last ? Math.min((ms - this.last) / 1000, 0.05) : 0.016;
    this.last = ms;
    this.time += dt;
    this.sim.step(dt, this.input);
    this.updatePlane();
    this.updateMarker();
    this.updateCoverage();
    this.prop.rotation.z += dt * 70;
    const preview = this.sim.phase === 'ready';
    const offset =
      this.cameraMode === 1
        ? new T.Vector3(0, 3.4, 1)
        : preview
          ? new T.Vector3(24 + Math.sin(this.time * 0.07) * 5, 12, 33)
          : new T.Vector3(0, 8.5, 30);
    offset.applyAxisAngle(Y, -this.sim.heading);
    const desired = this.plane.position.clone().add(offset);
    const smoothing = preview ? 0.7 : 3.0;
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * smoothing));
    const look = new T.Vector3(
      Math.sin(this.sim.heading) * 50,
      this.cameraMode === 1 ? 2 : -5,
      -Math.cos(this.sim.heading) * 50,
    ).add(this.plane.position);
    if (preview)
      look.copy(this.plane.position).add(new T.Vector3(-70, -12, -80));
    this.camera.lookAt(look);
    this.plane.visible = this.cameraMode !== 1;
    this.sun.position
      .copy(this.plane.position)
      .add(new T.Vector3(-500, 700, -400));
    this.sun.target.position.copy(this.plane.position);
    this.cloudGroup.position.x = Math.sin(this.time * 0.003) * 140;
    this.plane.updateMatrixWorld();
    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
    this.frame = requestAnimationFrame(this.animate);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    const materials = new Set<T.Material>();
    const geometries = new Set<T.BufferGeometry>();
    this.scene.traverse((object) => {
      if (
        object instanceof T.Mesh ||
        object instanceof T.Points ||
        object instanceof T.Line
      ) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((m: T.Material) => materials.add(m));
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => {
      const mm = m as T.MeshStandardMaterial;
      mm.map?.dispose();
      m.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
