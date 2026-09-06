import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CountySnapshot, PublicPilot } from './county';
import {
  ground,
  fieldSize,
  riverX,
  fields,
  Simulation,
  type Field,
  type Controls,
} from './simulation';

import { nextPass, sprayFootprint, spraySafety } from './flight-guidance';

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
const SUN_OFFSET = new T.Vector3(-640, 620, -880);
const fieldLookup = new Map(
  fields.map((f) => [`${Math.round(f.x / 510)},${Math.round(f.z / 510)}`, f]),
);

export class World {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(55, 1, 1, 14000);
  renderer: T.WebGLRenderer;
  plane = new T.Group();
  prop = new T.Group();
  marker = new T.Group();
  guidesEnabled = true;
  guidanceAvailable = true;
  guideLine = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    }),
  );
  footprintLine = new T.Line(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: '#b9ff7a', depthTest: false }),
  );
  footprintFill = new T.Mesh(
    new T.BufferGeometry(),
    new T.MeshBasicMaterial({
      color: '#b9ff7a',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
      side: T.DoubleSide,
    }),
  );
  coverageMesh: T.InstancedMesh;
  particles: T.Points;
  particlePositions = new Float32Array(2100);
  particleLife = new Float32Array(700);
  particleIndex = 0;
  particleEmission = 0;
  particleAlpha = new Float32Array(700);
  particleVector = new T.Vector3();
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
  beforeStep: ((dt: number) => void) | null = null;
  otherPilots = new Map<string, { mesh: T.Group; target: PublicPilot }>();
  cropMaterials: { material: T.MeshStandardMaterial; color: T.Color }[] = [];
  seasonalPhase = -1;
  disposed = false;
  sky: T.Mesh | null = null;
  environmentTarget: T.WebGLRenderTarget | null = null;
  windTime = { value: 0 };
  cropDetail: Partial<Record<Field['crop'], T.InstancedMesh>> = {};
  detailCell = '';
  foliageMaterials: { material: T.MeshStandardMaterial; color: T.Color }[] = [];
  cropDetailMaterials: {
    material: T.MeshStandardMaterial;
    color: T.Color;
    crop: Field['crop'];
  }[] = [];
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
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Three-dimensional flight over Iowa farmland',
    );
    this.scene.fog = new T.FogExp2('#c4d8ca', 0.00014);
    this.scene.add(new T.HemisphereLight('#b9dbff', '#596730', 1.55));
    this.sun = new T.DirectionalLight('#ffe3a8', 3.15);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -170;
    this.sun.shadow.camera.right = 170;
    this.sun.shadow.camera.top = 170;
    this.sun.shadow.camera.bottom = -170;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 2100;
    this.sun.shadow.normalBias = 0.06;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun, this.sun.target);
    this.createSky();
    this.createEnvironment();
    this.createLand();
    this.createFarms();
    this.batchStatic(this.scene);
    this.createPlane();
    this.detailPlane();
    this.batchStatic(this.plane, this.prop);
    this.scene.add(
      this.plane,
      this.marker,
      this.guideLine,
      this.footprintLine,
      this.footprintFill,
    );
    this.guideLine.geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(18), 3),
    );
    this.footprintLine.geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(15), 3),
    );
    this.footprintFill.geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(18), 3),
    );
    this.guideLine.frustumCulled =
      this.footprintLine.frustumCulled =
      this.footprintFill.frustumCulled =
        false;
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
    pg.setAttribute(
      'sprayAlpha',
      new T.BufferAttribute(this.particleAlpha, 1).setUsage(T.DynamicDrawUsage),
    );
    const sprayMaterial = new T.PointsMaterial({
      color: '#f4ffde',
      size: 3.8,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      map: this.particleTexture(),
      sizeAttenuation: true,
    });
    sprayMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'attribute float sprayAlpha; varying float vSprayAlpha;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvSprayAlpha=sprayAlpha;',
      );
      shader.fragmentShader =
        'varying float vSprayAlpha;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a*=vSprayAlpha;',
      );
    };
    sprayMaterial.customProgramCacheKey = () => 'prairie-spray-v2';
    this.particles = new T.Points(pg, sprayMaterial);
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
    const material = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      uniforms: { sunDirection: { value: SUN_OFFSET.clone().normalize() } },
      vertexShader: `varying vec3 vDirection;
        void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vDirection;
        uniform vec3 sunDirection;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        void main(){
          vec3 d=normalize(vDirection);float height=max(d.y,0.0);
          float sun=max(dot(d,sunDirection),0.0);
          vec3 horizon=mix(vec3(.56,.73,.73),vec3(.88,.75,.50),pow(sun,8.0)*.45);
          vec3 color=mix(horizon,vec3(.045,.27,.56),pow(height,.48));
          color+=vec3(1.,.57,.20)*pow(sun,20.0)*.18;
          color+=vec3(1.,.80,.48)*pow(sun,220.0)*.28;
          color+=vec3(3.8,3.0,1.8)*smoothstep(.99955,.99985,sun);
          vec2 wisps=d.xz/(height+.22)*vec2(2.2,6.5);
          float cirrus=noise(wisps)+noise(wisps*2.2)*.4;
          cirrus=smoothstep(.88,1.3,cirrus)*smoothstep(.14,.5,height)*.15;
          color=mix(color,vec3(.82,.89,.92),cirrus);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new T.Mesh(new T.SphereGeometry(11000, 32, 16), material);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    const cloudMaterial = mat('#f5f1df', { roughness: 1 });
    cloudMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying float vCloudY;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCloudY=position.y;',
      );
      shader.fragmentShader =
        'varying float vCloudY;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(.59,.69,.78),vec3(1.0),smoothstep(-.8,.45,vCloudY));',
      );
    };
    cloudMaterial.customProgramCacheKey = () => 'prairie-cumulus-v2';
    const clouds = new T.InstancedMesh(
      new T.SphereGeometry(1, 10, 7),
      cloudMaterial,
      480,
    );
    const skyRandom = random(911);
    let index = 0;
    for (let n = 0; n < 60; n++) {
      const x = (skyRandom() - 0.5) * 15000;
      const z = (skyRandom() - 0.5) * 15000;
      const y = 680 + skyRandom() * 550;
      const size = 65 + skyRandom() * 80;
      for (let puff = 0; puff < 8; puff++) {
        const radius = size * (0.45 + skyRandom() * 0.7);
        dummy.position.set(
          x + (skyRandom() - 0.5) * size * 3.6,
          y + (puff < 4 ? 0 : radius * 0.35),
          z + (skyRandom() - 0.5) * size * 1.2,
        );
        dummy.rotation.set(0, skyRandom() * 6, 0);
        dummy.scale.set(
          radius * 1.5,
          radius * (puff < 4 ? 0.42 : 0.85),
          radius,
        );
        dummy.updateMatrix();
        clouds.setMatrixAt(index++, dummy.matrix);
      }
    }
    clouds.frustumCulled = false;
    this.cloudGroup.add(clouds);
    this.scene.add(this.cloudGroup);
  }
  createEnvironment() {
    if (!this.sky) return;
    const environment = new T.Scene();
    environment.add(new T.Mesh(this.sky.geometry, this.sky.material));
    const generator = new T.PMREMGenerator(this.renderer);
    this.environmentTarget = generator.fromScene(environment, 0.05, 1, 15000);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.38;
    generator.dispose();
  }
  // Merge static opaque details by material; propellers and instanced foliage stay independent.
  batchStatic(root: T.Object3D, exclude?: T.Object3D) {
    root.updateMatrixWorld(true);
    const inverse = root.matrixWorld.clone().invert();
    const groups = new Map<
      string,
      {
        material: T.Material;
        shadow: boolean;
        receive: boolean;
        geometries: T.BufferGeometry[];
        meshes: T.Mesh[];
      }
    >();
    root.traverse((object) => {
      if (
        !(object instanceof T.Mesh) ||
        object instanceof T.InstancedMesh ||
        object === this.sky ||
        object.parent === this.cloudGroup
      )
        return;
      if (
        object === exclude ||
        object.parent === exclude ||
        Array.isArray(object.material) ||
        object.material.transparent ||
        object.material instanceof T.ShaderMaterial
      )
        return;
      const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          material: object.material,
          shadow: object.castShadow,
          receive: object.receiveShadow,
          geometries: [],
          meshes: [],
        };
        groups.set(key, group);
      }
      const geometry = object.geometry.index
        ? object.geometry.toNonIndexed()
        : object.geometry.clone();
      geometry.applyMatrix4(
        new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld),
      );
      group.geometries.push(geometry);
      group.meshes.push(object);
    });
    for (const group of groups.values()) {
      if (group.meshes.length < 2) {
        group.geometries.forEach((g) => g.dispose());
        continue;
      }
      const merged = mergeGeometries(group.geometries);
      group.geometries.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new T.Mesh(merged, group.material);
      mesh.castShadow = group.shadow;
      mesh.receiveShadow = group.receive;
      root.add(mesh);
      for (const old of group.meshes) {
        old.removeFromParent();
        old.geometry.dispose();
      }
    }
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
    this.landPatch(18000, 18000, 0, 0, mat('#668443'), -0.4, 170);
    const palettes = {
      corn: ['#879b35', '#a1a53a', '#959b3c'],
      soybeans: ['#417b37', '#518b3b', '#608e3d'],
      pasture: ['#779b44', '#87a04a', '#628c43'],
    };
    const fieldMaterials = new Map<string, T.MeshStandardMaterial>();
    const fieldMaterial = (crop: Field['crop'], shade: number) => {
      const key = `${crop}${shade}`;
      let material = fieldMaterials.get(key);
      if (material) return material;
      material = mat(palettes[crop][shade]);
      this.cropMaterials.push({ material, color: material.color.clone() });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.cropKind = {
          value: crop === 'pasture' ? 2 : crop === 'corn' ? 0 : 1,
        };
        shader.vertexShader = 'varying vec3 vField;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvField=(modelMatrix*vec4(position,1.0)).xyz;',
        );
        shader.fragmentShader =
          'varying vec3 vField; uniform float cropKind;\n' +
          shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 p=vField.xz;
          float row=p.x*2.244;
          float aa=1.0-smoothstep(.35,2.8,fwidth(row));
          float rows=(.5+.5*sin(row))*aa;
          float distanceFade=1.0-smoothstep(180.,1300.,length(vViewPosition));
          float broad=.5+.5*sin(p.x*.075+sin(p.y*.006));
          float mottling=sin(p.x*.025+sin(p.y*.017))*sin(p.y*.028)*.05;
          float colorRows=mix(.79,1.13,rows);
          float pasture=.94+.06*sin(p.x*.04+p.y*.009);
          diffuseColor.rgb *= mix(mix(1.0,colorRows,distanceFade*.7),pasture,step(1.5,cropKind));
          diffuseColor.rgb *= .93+.08*broad+mottling;
          vec2 field=mod(p+vec2(255.),510.)-vec2(255.);
          float edge=max(abs(field.x)/228.,abs(field.y)/226.);
          diffuseColor.rgb *= mix(1.0,.76,smoothstep(.92,.995,edge));`,
        );
      };
      material.customProgramCacheKey = () => 'prairie-fields-v3';
      fieldMaterials.set(key, material);
      return material;
    };
    const fieldRandom = random(37);
    fields.forEach((f) =>
      this.landPatch(
        f.w,
        f.d,
        f.x,
        f.z,
        fieldMaterial(f.crop, Math.floor(fieldRandom() * 3)),
        0.08,
      ),
    );
    // Continue the patchwork to the horizon; these distant fields are scenery, not contracts.
    for (let z = -14; z <= 14; z++)
      for (let x = -14; x <= 14; x++) {
        if (Math.abs(x) <= 6 && Math.abs(z) <= 6) continue;
        if (Math.abs(x * 510 - riverX(z * 510)) < 380) continue;
        const crop: Field['crop'] =
          (x + z) % 3 === 0
            ? 'corn'
            : (x - z) % 4 === 0
              ? 'pasture'
              : 'soybeans';
        this.landPatch(
          480,
          480,
          x * 510,
          z * 510,
          fieldMaterial(crop, Math.floor(fieldRandom() * 3)),
          0.04,
          4,
        );
      }
    const roadMat = mat('#b6aa89');
    roadMat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vRoad;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRoad=(modelMatrix*vec4(position,1.0)).xyz;',
      );
      shader.fragmentShader = 'varying vec3 vRoad;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat grain=fract(sin(dot(floor(vRoad.xz*2.0),vec2(12.9898,78.233)))*43758.5453);diffuseColor.rgb*=.90+.20*grain*(1.-smoothstep(20.,150.,length(vViewPosition)));',
      );
    };
    roadMat.customProgramCacheKey = () => 'prairie-gravel-v2';
    const verge = mat('#8d9860');
    for (let n = -6; n <= 6; n++) {
      this.landPatch(6500, 17, 0, n * 510 + 255, verge, 0.12, 120);
      this.landPatch(17, 6500, n * 510 + 255, 0, verge, 0.13, 120);
      this.landPatch(6500, 10, 0, n * 510 + 255, roadMat, 0.2, 120);
      this.landPatch(10, 6500, n * 510 + 255, 0, roadMat, 0.21, 120);
    }
    const ribbon = (width: number, elevation: number, material: T.Material) => {
      const vertices: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= 360; i++) {
        const z = -8500 + (i / 360) * 17000,
          x = riverX(z);
        const w = width * (1 + Math.sin(z * 0.008) * 0.07);
        vertices.push(
          x - w,
          ground(x - w, z) + elevation,
          z,
          x + w,
          ground(x + w, z) + elevation,
          z,
        );
        if (i < 360) {
          const j = i * 2;
          indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      const mesh = this.addMesh(g, material, 0, 0, 0);
      mesh.castShadow = false;
      return mesh;
    };
    ribbon(125, 0.6, mat('#6b8b48'));
    ribbon(67, 0.87, mat('#ada477'));
    const water = mat('#3c929b', { metalness: 0.38, roughness: 0.24 });
    water.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = this.windTime;
      shader.vertexShader =
        'varying vec3 vWater; uniform float waterTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y+=sin(position.z*.075+waterTime*.8)*.13;vWater=position;',
      );
      shader.fragmentShader =
        'varying vec3 vWater; uniform float waterTime;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float ripples=sin(vWater.x*.22+vWater.z*.11+waterTime*1.5)*sin(vWater.z*.26-waterTime*.8);
        float flow=sin(vWater.x*.013+vWater.z*.023+waterTime*.12);
        diffuseColor.rgb*=.89+.12*flow+.035*ripples;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec3 rippleNormal=vec3(cos(vWater.x*.22+waterTime)*.09,0.,sin(vWater.z*.26-waterTime*.8)*.12);
        normal=normalize(normal+mat3(viewMatrix)*rippleNormal);`,
      );
    };
    water.customProgramCacheKey = () => 'prairie-river-v2';
    ribbon(54, 1.17, water);
    this.createTrees();
    this.createCropDetail();
  }
  createTrees() {
    const trunkMaterial = mat('#65573d');
    const crownMaterial = mat('#638945', { flatShading: false });
    this.foliageMaterials.push({
      material: crownMaterial,
      color: crownMaterial.color.clone(),
    });
    const trunks = new T.InstancedMesh(
      new T.CylinderGeometry(0.65, 1.1, 8, 5),
      trunkMaterial,
      1700,
    );
    const crowns = new T.InstancedMesh(
      new T.IcosahedronGeometry(1, 1),
      crownMaterial,
      5100,
    );
    const treeRandom = random(621);
    for (let i = 0; i < 1700; i++) {
      let x: number, z: number;
      if (i < 690) {
        z = (treeRandom() - 0.5) * 7300;
        x =
          riverX(z) + (treeRandom() > 0.5 ? 1 : -1) * (83 + treeRandom() * 72);
      } else {
        const field = fields[Math.floor(treeRandom() * fields.length)];
        x = field.x + (treeRandom() - 0.5) * 450;
        z =
          field.z +
          (treeRandom() > 0.5 ? 238 : -238) +
          (treeRandom() - 0.5) * 9;
      }
      const height = 9 + treeRandom() * 14,
        base = ground(x, z),
        angle = treeRandom() * 6;
      dummy.position.set(x, base + height * 0.28, z);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(0.9, height / 12, 0.9);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      const treeColor = new T.Color().setHSL(
        0.22 + treeRandom() * 0.07,
        0.3 + treeRandom() * 0.16,
        0.64 + treeRandom() * 0.22,
      );
      for (let lobe = 0; lobe < 3; lobe++) {
        const offset = lobe === 0 ? 0 : height * 0.19;
        dummy.position.set(
          x + Math.cos(angle + lobe * 2.3) * offset,
          base + height * (lobe === 0 ? 0.77 : 0.63),
          z + Math.sin(angle + lobe * 2.3) * offset,
        );
        dummy.scale.set(
          height * (lobe === 0 ? 0.32 : 0.28),
          height * (lobe === 0 ? 0.4 : 0.3),
          height * 0.3,
        );
        dummy.updateMatrix();
        crowns.setMatrixAt(i * 3 + lobe, dummy.matrix);
        crowns.setColorAt(i * 3 + lobe, treeColor);
      }
    }
    trunks.castShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    this.scene.add(trunks, crowns);
  }
  createCropDetail() {
    for (const crop of ['corn', 'soybeans', 'pasture'] as const) {
      const pieces: T.BufferGeometry[] = [];
      const height = crop === 'corn' ? 2.1 : crop === 'soybeans' ? 0.72 : 0.58;
      const width = crop === 'corn' ? 1.2 : crop === 'soybeans' ? 1.35 : 0.55;
      for (let side = 0; side < 3; side++) {
        const shape = new T.Shape();
        shape.moveTo(-width * 0.5, 0);
        shape.lineTo(-width * 0.14, height * 0.53);
        shape.lineTo(-width * 0.48, height * 0.63);
        shape.lineTo(-width * 0.07, height * 0.72);
        shape.lineTo(0, height);
        shape.lineTo(width * 0.1, height * 0.71);
        shape.lineTo(width * 0.45, height * 0.59);
        shape.lineTo(width * 0.15, height * 0.48);
        shape.lineTo(width * 0.5, 0);
        shape.closePath();
        const blade = new T.ShapeGeometry(shape);
        blade.rotateY((side * Math.PI) / 3);
        pieces.push(blade);
      }
      const geometry = mergeGeometries(pieces)!;
      pieces.forEach((g) => g.dispose());
      const material = mat(
        crop === 'corn'
          ? '#a2b64f'
          : crop === 'soybeans'
            ? '#669744'
            : '#87a74a',
        { side: T.DoubleSide, roughness: 1 },
      );
      this.cropDetailMaterials.push({
        material,
        color: material.color.clone(),
        crop,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.windTime = this.windTime;
        shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float sway=sin(windTime*1.7+instanceMatrix[3].x*.037+instanceMatrix[3].z*.026);
            transformed.x+=sway*position.y*position.y*.065;
          #endif`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float distanceFade=1.0-smoothstep(145.,210.,length(vViewPosition));
          float screenDoor=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
          if(screenDoor>distanceFade)discard;`,
        );
      };
      material.customProgramCacheKey = () => 'prairie-wind-crops-v2';
      const mesh = new T.InstancedMesh(geometry, material, 11000);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.cropDetail[crop] = mesh;
      this.scene.add(mesh);
    }
    this.updateCropDetail(true);
  }
  updateCropDetail(force = false) {
    const cx = Math.round(this.sim.x / 70) * 70,
      cz = Math.round(this.sim.z / 70) * 70;
    const cell = `${cx},${cz}`;
    const visible = this.sim.y - ground(this.sim.x, this.sim.z) < 210;
    for (const mesh of Object.values(this.cropDetail)) mesh.visible = visible;
    if (!visible || (!force && cell === this.detailCell)) return;
    this.detailCell = cell;
    const counts = { corn: 0, soybeans: 0, pasture: 0 };
    for (let z = cz - 245; z <= cz + 245; z += 7)
      for (let x = cx - 245; x <= cx + 245; x += 3.5) {
        const field = fieldLookup.get(
          `${Math.round(x / 510)},${Math.round(z / 510)}`,
        );
        if (
          !field ||
          Math.abs(x - field.x) > 224 ||
          Math.abs(z - field.z) > 222
        )
          continue;
        // Hash absolute plant coordinates so overlapping tiles keep identical plants.
        let seed =
          (Math.imul(Math.round(x * 2), 374761393) +
            Math.imul(Math.round(z * 2), 668265263)) >>>
          0;
        seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
        const a = (seed & 255) / 255,
          b = ((seed >>> 8) & 255) / 255;
        const c = ((seed >>> 16) & 255) / 255,
          d = (seed >>> 24) / 255;
        if (field.crop === 'pasture' && a > 0.45) continue;
        const mesh = this.cropDetail[field.crop]!;
        if (counts[field.crop] >= 11000) continue;
        const px = x + (b - 0.5) * 0.5,
          pz = z + (c - 0.5) * 1.2;
        dummy.position.set(px, ground(px, pz) + 0.08, pz);
        dummy.rotation.set(0, d * 1.4, 0);
        dummy.scale.setScalar(0.78 + a * 0.28);
        dummy.updateMatrix();
        mesh.setMatrixAt(counts[field.crop]++, dummy.matrix);
      }
    for (const crop of ['corn', 'soybeans', 'pasture'] as const) {
      const mesh = this.cropDetail[crop]!;
      mesh.count = counts[crop];
      mesh.instanceMatrix.needsUpdate = true;
    }
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
    // Round hay bales and a farm lane add scale during low passes.
    const hayMaterial = mat('#c0a45b', { roughness: 1 });
    const hay = new T.InstancedMesh(
      new T.CylinderGeometry(2.1, 2.1, 3.8, 12),
      hayMaterial,
      72,
    );
    const hayRandom = random(764);
    const pastures = fields.filter((f) => f.crop === 'pasture');
    for (let i = 0; i < 72; i++) {
      const field = pastures[i % pastures.length];
      const x = field.x + (hayRandom() - 0.5) * 340,
        z = field.z + (hayRandom() - 0.5) * 340;
      dummy.position.set(x, ground(x, z) + 2.15, z);
      dummy.rotation.set(Math.PI / 2, 0, hayRandom() * 6);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      hay.setMatrixAt(i, dummy.matrix);
    }
    hay.castShadow = true;
    this.scene.add(hay);
    // Pasture cattle and a familiar rural water tower.
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
    this.prop.name = 'propeller';
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
  detailPlane() {
    const enamel = mat('#e3a919', { metalness: 0.3, roughness: 0.3 });
    const trim = mat('#193a38', { metalness: 0.4, roughness: 0.3 });
    const aluminum = mat('#cad4cd', { metalness: 0.7, roughness: 0.24 });
    const hub = mat('#72857e', { metalness: 0.6, roughness: 0.3 });
    const navRed = new T.MeshBasicMaterial({
      color: '#ff423b',
      toneMapped: false,
    });
    const navGreen = new T.MeshBasicMaterial({
      color: '#9bef9c',
      toneMapped: false,
    });
    for (const side of [-1, 1]) {
      this.box(6.6, 0.07, 0.42, trim, side * 5.1, -0.4, 0.52, this.plane);
      this.box(0.24, 0.2, 2.02, trim, side * 9.08, -0.2, -0.3, this.plane);
      this.box(0.055, 0.28, 3.2, trim, side * 0.83, -0.02, 3.1, this.plane);
      for (let i = 0; i < 6; i++)
        this.box(
          0.055,
          0.34,
          0.1,
          trim,
          side * 0.94,
          -0.05,
          -2.7 + i * 0.2,
          this.plane,
        );
      const wheelHub = this.addMesh(
        new T.CylinderGeometry(0.25, 0.25, 0.38, 12),
        hub,
        side * 1.7,
        -2.2,
        0.25,
        this.plane,
      );
      wheelHub.rotation.z = Math.PI / 2;
      const strut = this.box(
        0.08,
        0.08,
        4.9,
        aluminum,
        side * 2.6,
        -0.39,
        0.1,
        this.plane,
      );
      strut.rotation.y = side * 0.6;
      const light = this.addMesh(
        new T.SphereGeometry(0.12, 8, 6),
        side === -1 ? navRed : navGreen,
        side * 9.8,
        -0.16,
        -0.9,
        this.plane,
      );
      light.castShadow = false;
    }
    const exhaust = this.addMesh(
      new T.CylinderGeometry(0.15, 0.18, 1.5, 8),
      trim,
      0.74,
      -0.52,
      -3.8,
      this.plane,
    );
    exhaust.rotation.z = -0.55;
    this.box(0.06, 0.68, 0.06, aluminum, 0, 2.19, 0.68, this.plane);
    this.box(0.055, 0.095, 1.7, enamel, -0.48, 1.78, 0.17, this.plane);
    this.box(0.055, 0.095, 1.7, enamel, 0.48, 1.78, 0.17, this.plane);
    const spinner = this.addMesh(
      new T.ConeGeometry(0.34, 0.7, 14),
      enamel,
      0,
      0,
      -5.38,
      this.plane,
    );
    spinner.rotation.x = -Math.PI / 2;
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
    const { width, depth } = fieldSize(this.sim.job);
    const hw = width / 2,
      hd = depth / 2;
    const points: T.Vector3[] = [];
    for (let i = 0; i <= 100; i++) {
      const t = (i / 100) * 4;
      let px: number, pz: number;
      if (t < 1) {
        px = -hw + width * t;
        pz = hd;
      } else if (t < 2) {
        px = hw;
        pz = hd - depth * (t - 1);
      } else if (t < 3) {
        px = hw - width * (t - 2);
        pz = -hd;
      } else {
        px = -hw;
        pz = -hd + depth * (t - 3);
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
    for (const dx of [-hw, hw])
      for (const dz of [-hd, hd]) {
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
  updateGuides() {
    const visible =
      this.guidesEnabled &&
      this.guidanceAvailable &&
      (this.sim.phase === 'flying' || this.sim.phase === 'paused');
    this.guideLine.visible =
      this.footprintLine.visible =
      this.footprintFill.visible =
        visible;
    if (!visible) return;
    const pass = nextPass(this.sim);
    const { depth } = fieldSize(this.sim.job);
    const direction = pass.heading === 0 ? 1 : -1;
    const start = this.sim.job.z + direction * (depth / 2 + 65);
    const end = this.sim.job.z - (direction * depth) / 2;
    const lineX = pass.x - this.sim.sprayDrift;
    const route = [
      [lineX, start],
      [lineX, end],
      [lineX - 9, end + direction * 18],
      [lineX, end],
      [lineX + 9, end + direction * 18],
      [lineX, end],
    ];
    const line = this.guideLine.geometry.attributes.position;
    route.forEach(([x, z], i) => line.setXYZ(i, x, ground(x, z) + 3.2, z));
    line.needsUpdate = true;
    const points = sprayFootprint(this.sim);
    const outline = this.footprintLine.geometry.attributes.position;
    [...points, points[0]].forEach((p, i) =>
      outline.setXYZ(i, p.x, ground(p.x, p.z) + 3, p.z),
    );
    outline.needsUpdate = true;
    const fill = this.footprintFill.geometry.attributes.position;
    [0, 1, 2, 0, 2, 3].forEach((n, i) =>
      fill.setXYZ(
        i,
        points[n].x,
        ground(points[n].x, points[n].z) + 2.9,
        points[n].z,
      ),
    );
    fill.needsUpdate = true;
    const safety = spraySafety(this.sim);
    const color =
      safety === 'outside'
        ? '#ff8870'
        : safety === 'edge' || !this.sim.validSpray
          ? '#ffc75e'
          : '#b9ff7a';
    this.footprintLine.material.color.set(color);
    this.footprintFill.material.color.set(color);
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
      this.particleEmission += dt * 440;
      const emitted = Math.floor(this.particleEmission);
      this.particleEmission -= emitted;
      for (let p = 0; p < emitted; p++) {
        const i = this.particleIndex++ % 700;
        const side = (rng() - 0.5) * 18;
        const v = this.particleVector
          .set(side, -0.8, 1.2)
          .applyMatrix4(this.plane.matrixWorld);
        this.particlePositions[i * 3] = v.x;
        this.particlePositions[i * 3 + 1] = v.y;
        this.particlePositions[i * 3 + 2] = v.z;
        this.particleLife[i] = 1.35 + rng() * 0.45;
      }
    }
    for (let i = 0; i < 700; i++) {
      if (this.particleLife[i] > 0) {
        this.particleLife[i] -= dt;
        this.particlePositions[i * 3] += (1.2 + Math.sin(i * 0.7) * 0.4) * dt;
        this.particlePositions[i * 3 + 2] += 0.5 * dt;
        this.particleAlpha[i] = Math.min(1, this.particleLife[i] * 1.5);
        this.particlePositions[i * 3 + 1] -= dt * 6;
      } else {
        this.particlePositions[i * 3 + 1] = -1000;
        this.particleAlpha[i] = 0;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.sprayAlpha.needsUpdate = true;
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
    this.windTime.value = this.time;
    this.beforeStep?.(dt);
    this.sim.step(dt, this.input);
    this.updatePlane();
    this.updateCropDetail();
    this.updateMarker();
    this.updateCoverage();
    this.updateGuides();
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
    this.sky?.position.copy(this.camera.position);
    this.plane.visible = this.cameraMode !== 1;
    this.sun.position.copy(this.plane.position).add(SUN_OFFSET);
    this.sun.target.position.copy(this.plane.position);
    this.cloudGroup.position.x = Math.sin(this.time * 0.003) * 140;
    this.plane.updateMatrixWorld();
    this.updateParticles(dt);
    for (const { mesh, target } of this.otherPilots.values()) {
      mesh.position.lerp(
        new T.Vector3(target.x, target.y, target.z),
        1 - Math.exp(-dt * 8),
      );
      mesh.rotation.order = 'YXZ';
      mesh.rotation.set(target.pitch, -target.heading, target.roll);
      const remoteProp = mesh.getObjectByName('propeller');
      if (remoteProp) remoteProp.rotation.z += dt * 70;
    }
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.();
    this.frame = requestAnimationFrame(this.animate);
  };
  setCounty(county: CountySnapshot | null) {
    this.guidanceAvailable = !county || Boolean(county.player?.activeJob);
    const live =
      county?.pilots.filter(
        (p) => p.id !== county.viewerId && p.phase === 'flying',
      ) ?? [];
    for (const [id, other] of this.otherPilots) {
      if (!live.some((p) => p.id === id)) {
        this.scene.remove(other.mesh);
        other.mesh.traverse((o) => {
          if (o instanceof T.Sprite && o.name === 'pilot-label') {
            o.material.map?.dispose();
            o.material.dispose();
          }
        });
        this.otherPilots.delete(id);
      }
    }
    for (const pilot of live) {
      let other = this.otherPilots.get(pilot.id);
      if (!other) {
        const mesh = this.plane.clone(true);
        mesh.visible = true;
        mesh.position.set(pilot.x, pilot.y, pilot.z);
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 48;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#153d31cc';
        ctx.fillRect(0, 0, 256, 48);
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#edf5c8';
        ctx.fillText(pilot.callsign, 128, 31);
        const label = new T.Sprite(
          new T.SpriteMaterial({
            map: new T.CanvasTexture(canvas),
            transparent: true,
            depthTest: false,
          }),
        );
        label.name = 'pilot-label';
        label.position.set(0, 6, 0);
        label.scale.set(20, 3.75, 1);
        mesh.add(label);
        other = { mesh, target: pilot };
        this.otherPilots.set(pilot.id, other);
        this.scene.add(mesh);
      } else other.target = pilot;
    }
    const phase = county?.season.phaseIndex ?? -1;
    if (phase !== this.seasonalPhase) {
      this.seasonalPhase = phase;
      for (const { material, color } of this.cropMaterials) {
        material.color.copy(color);
        if (phase === 0) material.color.lerp(new T.Color('#76a660'), 0.22);
        if (phase === 2) material.color.lerp(new T.Color('#bd8d38'), 0.5);
      }
      for (const { material, color, crop } of this.cropDetailMaterials) {
        material.color.copy(color);
        if (phase === 0) material.color.lerp(new T.Color('#73a747'), 0.2);
        if (phase === 2)
          material.color.lerp(
            new T.Color(
              crop === 'corn'
                ? '#c3a34b'
                : crop === 'soybeans'
                  ? '#b8a654'
                  : '#9f9c52',
            ),
            0.6,
          );
      }
      for (const { material, color } of this.foliageMaterials) {
        material.color.copy(color);
        if (phase === 2) material.color.lerp(new T.Color('#a79b46'), 0.38);
      }
    }
  }
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
        object instanceof T.Line ||
        object instanceof T.Sprite
      ) {
        if ('geometry' in object) geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((m: T.Material) => materials.add(m));
      }
    });
    geometries.forEach((g) => g.dispose());
    const textures = new Set<T.Texture>();
    materials.forEach((m) => {
      const mm = m as T.MeshStandardMaterial;
      if (mm.map) textures.add(mm.map);
      m.dispose();
    });
    textures.forEach((texture) => texture.dispose());
    this.environmentTarget?.dispose();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
