import { farmRotation } from './landmark-data';
import { HazardWorld } from './hazard-world';
import { SkywritingWorld } from './skywriting-world';
import { skyAudienceView } from './skywriting';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CountySnapshot, PublicPilot } from './county';
import { createRiverMaterial } from './fx/water-shader';
import { applyCropWindAndShadows } from './fx/crop-wind-shader';
import { AircraftFX } from './fx/aircraft-fx';
import { ArcadeFX } from './fx/arcade-fx';
import { CinematicCamera } from './fx/cinematic-camera';
import { StuntWorldProps } from './fx/stunt-props';
import { createCropGeometry, createCropMaterial } from './fx/crop-models';
import {
  createBarnwoodMaterial,
  createCorrugatedRoofMaterial,
  createFarmhouseClapboardMaterial,
  createSiloMaterial,
  createGlassMaterial,
  buildEnhancedBarn,
  buildEnhancedSilo,
  buildEnhancedHouse,
} from './fx/building-materials';
import { SunRays } from './fx/sun-rays';
import { CloudSystem } from './fx/cloud-systems';
import { SkyLifeSystem } from './fx/sky-life';
import { TreeSystem } from './fx/tree-systems';
import {
  ground,
  insideField,
  riverX,
  fields,
  Simulation,
  type Field,
  type Controls,
} from './simulation';
import {
  clipField,
  inNoSprayZone,
  fieldCells,
  fieldOutline,
  parcelShape,
  polygonArea,
  type FieldShape,
} from './field-geometry';

import { nextPass, sprayFootprint, spraySafety } from './flight-guidance';
import {
  RuralLife,
  FARMSTEADS,
  FARM_CLEARINGS,
  PADDOCKS,
  inFarmClearing,
} from './rural-life';
import { LESSON_WEATHER, windVector, type Weather } from './weather';

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

export type RemotePilotEntry = {
  mesh: T.Group;
  target: PublicPilot;
  targetPos: T.Vector3;
  targetQuat: T.Quaternion;
  labelSprite?: T.Sprite;
  labelCanvas?: HTMLCanvasElement;
  lastLabelKey?: string;
  lastDistanceUpdate?: number;
  sprayPoints?: T.Points;
  sprayPositions?: Float32Array;
  sprayLife?: Float32Array;
  sprayIndex?: number;
  lastNearMissTime?: number;
};

export class World {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(55, 1, 1, 14000);
  renderer: T.WebGLRenderer;
  plane = new T.Group();
  prop = new T.Group();
  marker = new T.Group();
  guidesEnabled = true;
  guidanceAvailable = true;
  guideLine = new T.Mesh(
    new T.BufferGeometry(),
    new T.MeshBasicMaterial({
      color: '#ffffff',
      depthTest: true,
      depthWrite: false,
      side: T.DoubleSide,
    }),
  );
  guideBorder = new T.Mesh(
    new T.BufferGeometry(),
    new T.MeshBasicMaterial({
      color: '#103e42',
      depthTest: true,
      depthWrite: false,
      side: T.DoubleSide,
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
  coverageMesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  coverageLineMesh: T.LineSegments<T.BufferGeometry, T.LineBasicMaterial>;
  coverageTiles = new Map<number, number[]>();
  coverageLineTiles = new Map<number, number[]>();
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
  currentBoundary = '';
  cameraMode = 0;
  reducedMotion = false;
  private lastCameraPlane = new T.Vector3();
  resizeObserver: ResizeObserver;
  onFrame: (() => void) | null = null;
  beforeStep: ((dt: number) => void) | null = null;
  rivalCallsign: string | null = null;
  rivalPilotId: string | null = null;
  onRemoteProximity:
    | ((dist: number, speed: number, pan: number) => void)
    | null = null;
  otherPilots = new Map<string, RemotePilotEntry>();
  cropMaterials: { material: T.MeshStandardMaterial; color: T.Color }[] = [];
  seasonalPhase = -1;
  disposed = false;
  sky: T.Mesh | null = null;
  environmentTarget: T.WebGLRenderTarget | null = null;
  windTime = { value: 0 };
  windVectorUniform = { value: new T.Vector2(0, 0) };
  aircraftFx!: AircraftFX;
  arcadeFx!: ArcadeFX;
  cinematicCamera!: CinematicCamera;
  stuntProps!: StuntWorldProps;
  stuntGroup = new T.Group();
  cameraImpulse = 0;
  sunRays!: SunRays;
  skyLife!: SkyLifeSystem;
  treeSystem?: TreeSystem;
  ruralLife: RuralLife;
  hazards: HazardWorld;
  skywriting!: SkywritingWorld;
  countyForecast: Weather | null = null;
  weatherCover = { value: 0.08 };
  cloudMaterial: T.MeshStandardMaterial | null = null;
  cloudMesh: T.InstancedMesh | null = null;
  cloudSystem!: CloudSystem;
  rainLevel = 0;
  rainPositions = new Float32Array(900 * 6);
  rain: T.LineSegments;
  weatherColor = new T.Color();
  cropDetail: Partial<Record<Field['crop'], T.InstancedMesh>> = {};
  detailCell = '';
  foliageMaterials: { material: T.MeshStandardMaterial; color: T.Color }[] = [];
  cropDetailMaterials: {
    material: T.MeshStandardMaterial;
    color: T.Color;
    crop: Field['crop'];
  }[] = [];
  collectiblesGroup = new T.Group();
  collectiblesLayout = '';
  collectibleMeshes: { mesh: T.Group; id: number }[] = [];
  private skyRevealWasActive = false;
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
    this.scene.fog = new T.FogExp2('#bdd6e0', 0.00008);
    this.scene.add(new T.HemisphereLight('#b9dbff', '#47572b', 1.25));
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
    this.sunRays = new SunRays(this.scene, this.cloudGroup, this.sun);
    this.skyLife = new SkyLifeSystem(this.scene, this.sun);
    this.createLand();
    this.createFarms();
    this.batchStatic(this.scene);
    this.ruralLife = new RuralLife(this.scene);
    const rainGeometry = new T.BufferGeometry();
    rainGeometry.setAttribute(
      'position',
      new T.BufferAttribute(this.rainPositions, 3).setUsage(T.DynamicDrawUsage),
    );
    this.rain = new T.LineSegments(
      rainGeometry,
      new T.LineBasicMaterial({
        color: '#c7dfe9',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.createPlane();
    this.detailPlane();
    this.batchStatic(this.plane, this.prop);
    this.scene.add(
      this.plane,
      this.marker,
      this.guideBorder,
      this.guideLine,
      this.footprintLine,
      this.footprintFill,
      this.collectiblesGroup,
    );
    for (const mesh of [this.guideLine, this.guideBorder]) {
      mesh.geometry.setAttribute(
        'position',
        new T.BufferAttribute(new Float32Array(5 * 100 * 6 * 3), 3).setUsage(
          T.DynamicDrawUsage,
        ),
      );
      mesh.frustumCulled = false;
    }
    this.guideBorder.renderOrder = 1;
    this.guideLine.renderOrder = 2;
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
    const coverageGeometry = new T.BufferGeometry();
    coverageGeometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(1444 * 18 * 3), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    this.coverageMesh = new T.Mesh(
      coverageGeometry,
      new T.MeshBasicMaterial({
        color: '#8fe33b',
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
    this.coverageMesh.geometry.setDrawRange(0, 0);
    this.coverageMesh.frustumCulled = false;
    this.scene.add(this.coverageMesh);

    const coverageLineGeometry = new T.BufferGeometry();
    coverageLineGeometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(1444 * 16 * 3), 3).setUsage(
        T.DynamicDrawUsage,
      ),
    );
    this.coverageLineMesh = new T.LineSegments(
      coverageLineGeometry,
      new T.LineBasicMaterial({
        color: '#f0fdf4',
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      }),
    );
    this.coverageLineMesh.geometry.setDrawRange(0, 0);
    this.coverageLineMesh.frustumCulled = false;
    this.scene.add(this.coverageLineMesh);
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
    this.aircraftFx = new AircraftFX(this.scene, this.plane);
    this.skywriting = new SkywritingWorld(this.scene);
    this.arcadeFx = new ArcadeFX(this.scene, this.plane, this.camera, false);
    this.cinematicCamera = new CinematicCamera(
      this.renderer,
      this.scene,
      this.camera,
    );
    this.stuntGroup.name = 'Stunt World Props';
    this.scene.add(this.stuntGroup);
    this.stuntProps = new StuntWorldProps(this.scene, this.stuntGroup);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.updatePlane();
    this.camera.position
      .copy(this.plane.position)
      .add(new T.Vector3(27, 16, 39));
    this.hazards = new HazardWorld(this.scene);
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
      uniforms: {
        sunDirection: { value: SUN_OFFSET.clone().normalize() },
        weatherCover: this.weatherCover,
      },
      vertexShader: `varying vec3 vDirection;
        void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec3 vDirection;
        uniform vec3 sunDirection;
        uniform float weatherCover;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        void main(){
          vec3 d=normalize(vDirection);float height=max(d.y,0.0);
          float sun=max(dot(d,sunDirection),0.0);
          vec3 horizon=mix(vec3(.42,.66,.82),vec3(.88,.75,.50),pow(sun,8.0)*.45);
          vec3 color=mix(horizon,vec3(.025,.22,.55),pow(height,.48));
          color+=vec3(1.,.57,.20)*pow(sun,20.0)*.18;
          color+=vec3(1.,.80,.48)*pow(sun,220.0)*.28;
          color+=vec3(3.8,3.0,1.8)*smoothstep(.99955,.99985,sun);
          vec2 wisps=d.xz/(height+.22)*vec2(2.2,6.5);
          float cirrus=noise(wisps)+noise(wisps*2.2)*.4;
          cirrus=smoothstep(.88,1.3,cirrus)*smoothstep(.14,.5,height)*.15;
          color=mix(color,vec3(.82,.89,.92),cirrus);
          vec3 graySky=mix(vec3(.55,.62,.64),vec3(.30,.38,.44),pow(height,.55));
          graySky+=noise(wisps*.7)*.075;
          color=mix(color,graySky,weatherCover*.94);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new T.Mesh(new T.SphereGeometry(11000, 32, 16), material);
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);
    this.cloudSystem = new CloudSystem(this.scene, this.sun);
    this.cloudMaterial = this.cloudSystem.cumulusMat;
    this.cloudMesh = this.cloudSystem.cumulusMesh;
    this.cloudGroup.add(this.cloudSystem.group);
    this.scene.add(this.cloudGroup);
  }
  createEnvironment() {
    if (!this.sky) return;
    const environment = new T.Scene();
    environment.add(new T.Mesh(this.sky.geometry, this.sky.material));
    const generator = new T.PMREMGenerator(this.renderer);
    this.environmentTarget = generator.fromScene(environment, 0, 1, 15000);
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
  fieldPatch(
    shape: FieldShape,
    x: number,
    z: number,
    material: T.Material,
    offset = 0.08,
    step = 28,
  ) {
    const polygon = fieldOutline(shape),
      vertices: number[] = [];
    for (let zz = -228; zz < 228; zz += step)
      for (let xx = -228; xx < 228; xx += step) {
        const cell = clipField(
          polygon,
          xx,
          zz,
          Math.min(228, xx + step),
          Math.min(228, zz + step),
        );
        if (polygonArea(cell) < 1e-7) continue;
        for (let i = 1; i < cell.length - 1; i++)
          for (const p of [cell[0], cell[i + 1], cell[i]])
            vertices.push(p.x, ground(x + p.x, z + p.z) + offset, p.z);
      }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(vertices, 3),
    );
    geometry.computeVertexNormals();
    const mesh = this.addMesh(geometry, material, x, 0, z);
    mesh.castShadow = false;
    return mesh;
  }
  createLand() {
    const grass = mat('#668443');
    this.landPatch(18000, 18000, 0, 0, grass, -10, 170);
    this.landPatch(7200, 7200, 0, 0, grass, -0.65, 240);
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
      applyCropWindAndShadows(
        material,
        crop,
        this.windTime,
        this.windVectorUniform,
        { value: this.cloudGroup.position },
      );
      fieldMaterials.set(key, material);
      return material;
    };
    const fieldRandom = random(37);
    fields.forEach((f) =>
      this.fieldPatch(
        f,
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
        this.fieldPatch(
          parcelShape(x, z),
          x * 510,
          z * 510,
          fieldMaterial(crop, Math.floor(fieldRandom() * 3)),
          0.04,
          90,
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
      this.landPatch(6500, 17, 0, n * 510 + 255, verge, 0.12, 320);
      this.landPatch(17, 6500, n * 510 + 255, 0, verge, 0.13, 320);
      this.landPatch(6500, 10, 0, n * 510 + 255, roadMat, 0.2, 320);
      this.landPatch(10, 6500, n * 510 + 255, 0, roadMat, 0.21, 320);
    }
    const ribbon = (width: number, elevation: number, material: T.Material) => {
      const vertices: number[] = [],
        uvs: number[] = [],
        indices: number[] = [];
      for (let i = 0; i <= 360; i++) {
        const v = i / 360;
        const z = -8500 + v * 17000,
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
        uvs.push(0, v, 1, v);
        if (i < 360) {
          const j = i * 2;
          indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      const mesh = this.addMesh(g, material, 0, 0, 0);
      mesh.castShadow = false;
      return mesh;
    };
    ribbon(125, 0.6, mat('#6b8b48'));
    ribbon(67, 0.87, mat('#ada477'));
    const water = createRiverMaterial(this.windTime, this.sun.position);
    ribbon(58, 1.17, water);
    this.createTrees();
    this.createCropDetail();
  }
  createTrees() {
    this.treeSystem = new TreeSystem(this.scene, {
      windTime: this.windTime,
      sunDir: this.sun.position,
      count: 2000,
    });
    for (const crownMat of this.treeSystem.crownMaterials) {
      this.foliageMaterials.push({
        material: crownMat,
        color: crownMat.color.clone(),
      });
    }
  }
  createCropDetail() {
    for (const crop of ['corn', 'soybeans', 'pasture'] as const) {
      const geometry = createCropGeometry(crop);
      const material = createCropMaterial(crop, this.windTime);
      this.cropDetailMaterials.push({
        material,
        color: material.color.clone(),
        crop,
      });
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
    const cell = `${cx},${cz}:${this.sim.job.challenge?.seed ?? 'none'}:${this.guidanceAvailable}`;
    const visible = this.sim.y - ground(this.sim.x, this.sim.z) < 210;
    for (const mesh of Object.values(this.cropDetail)) mesh.visible = visible;
    if (!visible || (!force && cell === this.detailCell)) return;
    this.detailCell = cell;
    // Fast spatial pre-filtering: candidate fields overlapping visible boundary
    const minGx = Math.round((cx - 245) / 510) - 1;
    const maxGx = Math.round((cx + 245) / 510) + 1;
    const minGz = Math.round((cz - 245) / 510) - 1;
    const maxGz = Math.round((cz + 245) / 510) + 1;
    const nearby: (typeof fields)[number][] = [];
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const f = fieldLookup.get(`${gx},${gz}`);
        if (f) nearby.push(f);
      }
    }

    const counts = { corn: 0, soybeans: 0, pasture: 0 };
    if (nearby.length > 0) {
      for (let z = cz - 245; z <= cz + 245; z += 7) {
        for (let x = cx - 245; x <= cx + 245; x += 3.5) {
          let field: (typeof fields)[number] | undefined;
          for (let fi = 0; fi < nearby.length; fi++) {
            const f = nearby[fi];
            if (Math.abs(x - f.x) <= 230 && Math.abs(z - f.z) <= 230) {
              if (insideField(f, x, z)) {
                field = f;
                break;
              }
            }
          }
          if (
            !field ||
            inFarmClearing(x, z) ||
            (this.guidanceAvailable &&
              inNoSprayZone(this.sim.job, x - this.sim.job.x, z - this.sim.job.z))
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
      }
    }
    for (const crop of ['corn', 'soybeans', 'pasture'] as const) {
      const mesh = this.cropDetail[crop]!;
      mesh.count = counts[crop];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  createFarms() {
    const red = createBarnwoodMaterial('#9e2b1b'),
      roof = createCorrugatedRoofMaterial('#d5d2be'),
      white = createFarmhouseClapboardMaterial('#f2efe9'),
      dark = mat('#283832', { roughness: 0.9 }),
      silo = createSiloMaterial(),
      glass = createGlassMaterial();
    let farmIndex = 0;
    for (const [x, z] of FARMSTEADS) {
      const p = new T.Group();
      p.position.set(x, ground(x, z), z);
      p.rotation.y = farmRotation(farmIndex);
      this.scene.add(p);
      const isBig = farmIndex % 2 === 0;
      const barnScale = isBig ? 1.28 : 0.88;
      const barnGroup = new T.Group();
      barnGroup.scale.set(barnScale, barnScale, barnScale);
      p.add(barnGroup);
      buildEnhancedBarn(barnGroup, red, roof, white, dark);
      buildEnhancedSilo(p, silo, white, 32 * (isBig ? 1.15 : 0.95), -8);
      buildEnhancedHouse(p, white, dark, glass, white);
      for (let f = -2; f <= 2; f++)
        this.box(1, 4, 1, white, -70 + f * 14, 2, 48, p);
      this.box(57, 0.7, 0.6, white, -70, 2.8, 48, p);
      farmIndex++;
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
      let x = field.x,
        z = field.z;
      for (let attempt = 0; attempt < 10; attempt++) {
        const px = field.x + (hayRandom() - 0.5) * field.width * 0.85;
        const pz = field.z + (hayRandom() - 0.5) * field.depth * 0.85;
        if (insideField(field, px, pz)) {
          x = px;
          z = pz;
          break;
        }
      }
      dummy.position.set(x, ground(x, z) + 2.15, z);
      dummy.rotation.set(Math.PI / 2, 0, hayRandom() * 6);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      hay.setMatrixAt(i, dummy.matrix);
    }
    hay.castShadow = true;
    this.scene.add(hay);
    const yardGrass = mat('#799257');
    for (const area of FARM_CLEARINGS)
      this.landPatch(
        area.width,
        area.depth,
        area.x,
        area.z,
        yardGrass,
        0.32,
        8,
      );
    // Low rail fences make mixed farmyard herds read as paddocks from the air.
    for (const pen of PADDOCKS) {
      const points: [number, number][] = [];
      for (let side = -1; side <= 1; side += 2) {
        for (let step = 0; step <= 7; step++)
          points.push([
            pen.x - pen.width / 2 + (step * pen.width) / 7,
            pen.z + (side * pen.depth) / 2,
          ]);
        for (let step = 1; step < 5; step++)
          points.push([
            pen.x + (side * pen.width) / 2,
            pen.z - pen.depth / 2 + (step * pen.depth) / 5,
          ]);
      }
      for (const [x, z] of points)
        this.box(0.22, 1.5, 0.22, white, x, ground(x, z) + 0.95, z);
      for (const height of [0.85, 1.35]) {
        for (const side of [-1, 1]) {
          for (let step = 0; step < 7; step++) {
            const x = pen.x - pen.width / 2 + ((step + 0.5) * pen.width) / 7,
              z = pen.z + (side * pen.depth) / 2;
            this.box(
              pen.width / 7,
              0.12,
              0.12,
              white,
              x,
              ground(x, z) + height,
              z,
            );
          }
          for (let step = 0; step < 5; step++) {
            const x = pen.x + (side * pen.width) / 2,
              z = pen.z - pen.depth / 2 + ((step + 0.5) * pen.depth) / 5;
            this.box(
              0.12,
              0.12,
              pen.depth / 5,
              white,
              x,
              ground(x, z) + height,
              z,
            );
          }
        }
      }
    }
    // A familiar rural water tower.
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
      new T.CircleGeometry(2.0, 48),
      new T.MeshBasicMaterial({
        color: '#e8eed5',
        transparent: true,
        opacity: 0.16,
        side: T.DoubleSide,
        depthWrite: false,
      }),
      0,
      0,
      -0.05,
      this.prop,
    );
    disc.castShadow = false;
    const tipArc = this.addMesh(
      new T.RingGeometry(1.82, 2.0, 48),
      new T.MeshBasicMaterial({
        color: '#eab308',
        transparent: true,
        opacity: 0.38,
        side: T.DoubleSide,
        depthWrite: false,
      }),
      0,
      0,
      -0.04,
      this.prop,
    );
    tipArc.castShadow = false;
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
    this.marker.visible = !this.sim.isSkywriting;
    if (this.sim.isSkywriting) return;
    const shapeKey = JSON.stringify([
      this.sim.job.width,
      this.sim.job.depth,
      this.sim.job.boundary,
      this.sim.job.noSprayZones,
    ]);
    if (
      this.currentJob === this.sim.job.id &&
      this.currentBoundary === shapeKey
    )
      return;
    this.currentJob = this.sim.job.id;
    this.currentBoundary = shapeKey;
    while (this.marker.children.length) {
      const child = this.marker.children[0];
      this.marker.remove(child);
      if (child instanceof T.Mesh || child instanceof T.Line) {
        child.geometry.dispose();
        (child.material as T.Material).dispose();
      }
    }
    const { x, z } = this.sim.job;
    const outline = fieldOutline(this.sim.job);
    const points: T.Vector3[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 12);
      for (let j = 0; j < steps; j++) {
        const px = x + a.x + ((b.x - a.x) * j) / steps,
          pz = z + a.z + ((b.z - a.z) * j) / steps;
        points.push(new T.Vector3(px, ground(px, pz) + 2, pz));
      }
    }
    points.push(points[0].clone());
    const boundaryPositions: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = (-(b.z - a.z) / length) * 1.5,
        nz = ((b.x - a.x) / length) * 1.5;
      const corners = [
        [a.x + nx, a.z + nz],
        [a.x - nx, a.z - nz],
        [b.x - nx, b.z - nz],
        [b.x + nx, b.z + nz],
      ];
      for (const corner of [0, 1, 2, 0, 2, 3]) {
        const [px, pz] = corners[corner];
        boundaryPositions.push(px, ground(px, pz) + 2.8, pz);
      }
    }
    const boundary = new T.BufferGeometry();
    boundary.setAttribute(
      'position',
      new T.Float32BufferAttribute(boundaryPositions, 3),
    );
    this.marker.add(
      new T.Mesh(
        boundary,
        new T.MeshBasicMaterial({ color: '#ffc84b', side: T.DoubleSide }),
      ),
    );
    for (const { x: dx, z: dz } of outline) {
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
        new T.MeshBasicMaterial({ color: '#ffd15c', side: T.DoubleSide }),
        x + dx + 2.5,
        h + 11,
        z + dz,
        this.marker,
      );
      flag.castShadow = false;
    }
    this.coverageTiles.clear();
    this.coverageLineTiles.clear();
    for (const [n, polygon] of fieldCells(this.sim.job)) {
      const vertices: number[] = [];
      for (let i = 1; i < polygon.length - 1; i++)
        for (const p of [polygon[0], polygon[i + 1], polygon[i]])
          vertices.push(x + p.x, ground(x + p.x, z + p.z) + 2.65, z + p.z);
      this.coverageTiles.set(n, vertices);

      const lineVerts: number[] = [];
      const len = polygon.length;
      for (let j = 0; j < len; j++) {
        const p1 = polygon[j];
        const p2 = polygon[(j + 1) % len];
        lineVerts.push(
          x + p1.x,
          ground(x + p1.x, z + p1.z) + 2.7,
          z + p1.z,
          x + p2.x,
          ground(x + p2.x, z + p2.z) + 2.7,
          z + p2.z,
        );
      }
      this.coverageLineTiles.set(n, lineVerts);
    }
    this.lastCoverage = -1;
  }
  updateCollectibles(dt: number) {
    const layout = JSON.stringify([
      this.sim.job.id,
      this.sim.collectibles.map(({ id, kind, x, y, z }) => [id, kind, x, y, z]),
    ]);
    if (this.collectiblesLayout !== layout) {
      this.collectiblesLayout = layout;
      while (this.collectiblesGroup.children.length) {
        const child = this.collectiblesGroup.children[0];
        this.collectiblesGroup.remove(child);
        child.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.geometry.dispose();
            if (Array.isArray(o.material))
              o.material.forEach((m) => m.dispose());
            else (o.material as T.Material).dispose();
          }
        });
      }
      this.collectibleMeshes = [];
      if (!this.sim.collectibles.length) return;
      const coinMat = new T.MeshStandardMaterial({
        color: '#ffb703',
        metalness: 0.85,
        roughness: 0.2,
        emissive: '#fb8500',
        emissiveIntensity: 0.25,
      });
      const coinRimMat = new T.MeshStandardMaterial({
        color: '#ffd166',
        metalness: 0.9,
        roughness: 0.15,
        emissive: '#ffb703',
        emissiveIntensity: 0.3,
      });
      const canisterMat = new T.MeshStandardMaterial({
        color: '#00b4d8',
        metalness: 0.5,
        roughness: 0.3,
        emissive: '#0077b6',
        emissiveIntensity: 0.35,
      });
      const canisterAccentMat = new T.MeshStandardMaterial({
        color: '#90e0ef',
        metalness: 0.7,
        roughness: 0.2,
      });

      for (const item of this.sim.collectibles) {
        const group = new T.Group();
        group.position.set(item.x, item.y, item.z);
        if (item.kind === 'cash') {
          const disc = new T.Mesh(
            new T.CylinderGeometry(1.8, 1.8, 0.4, 16),
            coinMat,
          );
          disc.rotation.x = Math.PI / 2;
          const rim = new T.Mesh(
            new T.TorusGeometry(1.8, 0.18, 8, 20),
            coinRimMat,
          );
          group.add(disc, rim);
        } else if (item.kind === 'refill') {
          const can = new T.Mesh(
            new T.CylinderGeometry(1.1, 1.1, 2.5, 14),
            canisterMat,
          );
          const cap = new T.Mesh(
            new T.CylinderGeometry(0.5, 0.5, 0.6, 12),
            canisterAccentMat,
          );
          cap.position.y = 1.4;
          const band = new T.Mesh(
            new T.TorusGeometry(1.15, 0.12, 8, 16),
            canisterAccentMat,
          );
          group.add(can, cap, band);
        }
        this.collectiblesGroup.add(group);
        this.collectibleMeshes.push({ mesh: group, id: item.id });
      }
    }

    for (const entry of this.collectibleMeshes) {
      const item = this.sim.collectibles.find((c) => c.id === entry.id);
      if (!item || item.collected) {
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.visible = true;
      entry.mesh.rotation.y += dt * 3.0;
      entry.mesh.position.y =
        item.y + Math.sin(this.time * 3.5 + item.id * 1.5) * 0.45;
    }
  }
  updateGuides() {
    const visible =
      !this.sim.isSkywriting &&
      this.guidesEnabled &&
      this.guidanceAvailable &&
      (this.sim.phase === 'flying' || this.sim.phase === 'paused');
    this.guideBorder.visible =
      this.guideLine.visible =
      this.footprintLine.visible =
      this.footprintFill.visible =
        visible;
    if (!visible) return;
    const pass = nextPass(this.sim);
    const direction = pass.heading === 0 ? 1 : -1;
    const start = pass.heading === 0 ? pass.maxZ + 65 : pass.minZ - 65;
    const end = pass.heading === 0 ? pass.minZ : pass.maxZ;
    const lineX = pass.x - this.sim.sprayDrift;
    const route = [
      [lineX, start],
      [lineX, end],
      [lineX - 9, end + direction * 18],
      [lineX, end],
      [lineX + 9, end + direction * 18],
      [lineX, end],
    ];
    // World-space ribbons stay visible at flight height; a dark keyline separates white from pale crops.
    for (const [mesh, halfWidth] of [
      [this.guideBorder, 2.6],
      [this.guideLine, 0.85],
    ] as const) {
      const line = mesh.geometry.attributes.position;
      let vertex = 0;
      for (let segment = 0; segment < route.length - 1; segment++) {
        const [ax, az] = route[segment],
          [bx, bz] = route[segment + 1];
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (-(bz - az) / length) * halfWidth,
          nz = ((bx - ax) / length) * halfWidth;
        const steps = Math.ceil(length / 14);
        for (let s = 0; s < steps; s++) {
          const x0 = ax + ((bx - ax) * s) / steps,
            z0 = az + ((bz - az) * s) / steps;
          const x1 = ax + ((bx - ax) * (s + 1)) / steps,
            z1 = az + ((bz - az) * (s + 1)) / steps;
          if (
            inNoSprayZone(
              this.sim.job,
              (x0 + x1) / 2 - this.sim.job.x,
              (z0 + z1) / 2 - this.sim.job.z,
            )
          )
            continue;
          const corners = [
            [x0 + nx, z0 + nz],
            [x0 - nx, z0 - nz],
            [x1 - nx, z1 - nz],
            [x1 + nx, z1 + nz],
          ];
          for (const corner of [0, 1, 2, 0, 2, 3]) {
            const [x, z] = corners[corner];
            line.setXYZ(vertex++, x, ground(x, z) + 3.3, z);
          }
        }
      }
      mesh.geometry.setDrawRange(0, vertex);
      line.needsUpdate = true;
    }
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
    this.coverageMesh.visible = this.coverageLineMesh.visible =
      !this.sim.isSkywriting;
    if (this.lastCoverage === this.sim.coverageVersion) return;
    this.lastCoverage = this.sim.coverageVersion;
    let i = 0;
    const positions = this.coverageMesh.geometry.attributes.position;
    let li = 0;
    const linePositions = this.coverageLineMesh.geometry.attributes.position;
    this.sim.covered.forEach((n) => {
      const tile = this.coverageTiles.get(n);
      if (tile) {
        (positions.array as Float32Array).set(tile, i);
        i += tile.length;
      }
      const lineTile = this.coverageLineTiles.get(n);
      if (lineTile) {
        (linePositions.array as Float32Array).set(lineTile, li);
        li += lineTile.length;
      }
    });
    this.coverageMesh.geometry.setDrawRange(0, i / 3);
    positions.needsUpdate = true;
    this.coverageLineMesh.geometry.setDrawRange(0, li / 3);
    linePositions.needsUpdate = true;
  }
  updateParticles(dt: number) {
    const wind = this.sim.windVector;
    if (this.sim.spraying && !this.sim.isSkywriting) {
      this.particleEmission += dt * 440;
      const emitted = Math.floor(this.particleEmission);
      this.particleEmission -= emitted;
      const emitWidth = Math.min(
        this.sim.swath * 0.45,
        18 + (this.sim.career.upgrades?.boom ?? 0) * 8,
      );
      for (let p = 0; p < emitted; p++) {
        const i = this.particleIndex++ % 700;
        const side = (rng() - 0.5) * emitWidth;
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
        this.particlePositions[i * 3] +=
          (wind.x + Math.sin(i * 0.7) * 0.18) * dt;
        this.particlePositions[i * 3 + 2] +=
          (wind.z + Math.cos(i * 0.6) * 0.12) * dt;
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
    this.cinematicCamera?.resize(w, h);
  }
  get flightWeather() {
    return (
      (this.guidanceAvailable &&
      (this.sim.job.challenge || this.sim.isSkywriting)
        ? this.sim.weather
        : (this.countyForecast ?? this.sim.weather)) ?? LESSON_WEATHER
    );
  }
  updateWeather(dt: number) {
    const forecast = this.flightWeather;
    const blend = 1 - Math.exp(-dt * 0.6);
    this.weatherCover.value +=
      (forecast.cloud - this.weatherCover.value) * blend;
    this.sun.intensity += (forecast.sunlight - this.sun.intensity) * blend;
    this.sun.color.lerp(
      this.weatherColor.set(forecast.cloud > 0.7 ? '#dce8ee' : '#ffe3a8'),
      blend,
    );
    const fog = this.scene.fog as T.FogExp2;
    fog.density += (forecast.fog - fog.density) * blend;
    fog.color.lerp(
      this.weatherColor.set(
        forecast.kind === 'haze'
          ? '#d6d2b2'
          : forecast.cloud > 0.7
            ? '#abbfc5'
            : '#bdd6e0',
      ),
      blend,
    );
    this.cloudSystem?.updateWeather(forecast, dt, this.time);
    this.cloudMaterial?.color.lerp(
      this.weatherColor.set(forecast.cloud > 0.7 ? '#a6b5bb' : '#f5f1df'),
      blend,
    );
    this.scene.environmentIntensity = 0.38 - this.weatherCover.value * 0.16;
    this.rainLevel += (forecast.rain - this.rainLevel) * blend;
    this.rain.visible = this.rainLevel > 0.01;
    if (!this.rain.visible) return;
    const count = Math.floor(900 * this.rainLevel),
      wind = windVector(forecast, this.time);
    (this.rain.material as T.LineBasicMaterial).opacity = this.rainLevel * 0.38;
    for (let i = 0; i < count; i++) {
      const x = this.camera.position.x + ((i * 73.137) % 180) - 90;
      const y =
        this.camera.position.y + 85 - ((this.time * 34 + i * 19.31) % 145);
      const z = this.camera.position.z + ((i * 31.717) % 180) - 90;
      const n = i * 6;
      this.rainPositions[n] = x;
      this.rainPositions[n + 1] = y;
      this.rainPositions[n + 2] = z;
      this.rainPositions[n + 3] = x - wind.x * 0.13;
      this.rainPositions[n + 4] = y + 1.6;
      this.rainPositions[n + 5] = z - wind.z * 0.13;
    }
    this.rain.geometry.setDrawRange(0, count * 2);
    this.rain.geometry.attributes.position.needsUpdate = true;
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
    this.treeSystem?.update(dt, this.time);
    this.ruralLife.update(this.time, this.sim.x, this.sim.z, this.sim.altitude);
    this.hazards.update(this.sim, this.guidanceAvailable);
    this.stuntProps?.animateScenery(dt);
    this.updateMarker();
    this.updateCoverage();
    this.updateGuides();
    this.updateCollectibles(dt);
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
    const teleported =
      this.skyRevealWasActive ||
      this.lastCameraPlane.distanceTo(this.plane.position) > 80;
    if (teleported) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-dt * smoothing));
    this.lastCameraPlane.copy(this.plane.position);
    // Bring the chase camera forward when scenery lies between it and the plane.
    if (this.cameraMode === 0 && !preview) {
      const from = this.plane.position.clone().add(new T.Vector3(0, 2, 0));
      const delta = this.camera.position.clone().sub(from);
      for (let t = 0.1; t <= 1; t += 0.05) {
        const point = from.clone().addScaledVector(delta, t);
        const blocked = this.sim.stunts.obstacles.some(
          (o) =>
            this.sim.stunts.calculateClearance(point.x, point.y, point.z, o) <
            2,
        );
        if (blocked) {
          this.camera.position
            .copy(from)
            .addScaledVector(delta, Math.max(0.08, t - 0.08));
          break;
        }
      }
    }
    const look = new T.Vector3(
      Math.sin(this.sim.heading) * 50,
      this.cameraMode === 1 ? 2 : -5,
      -Math.cos(this.sim.heading) * 50,
    ).add(this.plane.position);
    if (preview)
      look.copy(this.plane.position).add(new T.Vector3(-70, -12, -80));
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(look);
    const skyReveal = this.sim.isSkywriting && this.sim.phase === 'complete';
    if (skyReveal) {
      const {
        eye,
        look: audienceLook,
        fov,
      } = skyAudienceView(this.sim.job, this.camera.aspect);
      this.camera.position.set(eye.x, eye.y, eye.z);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(audienceLook.x, audienceLook.y, audienceLook.z);
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    } else if (this.skyRevealWasActive) {
      this.camera.fov = this.cinematicCamera?.baseFov ?? 50;
      this.camera.updateProjectionMatrix();
    }
    this.cloudGroup.visible = !skyReveal;
    this.skyRevealWasActive = skyReveal;
    if (
      this.cameraMode === 0 &&
      !preview &&
      !this.reducedMotion &&
      !skyReveal
    ) {
      this.camera.rotateZ(-this.sim.roll * 0.2);
    }
    if (!this.reducedMotion && !skyReveal && this.cameraImpulse > 0.001) {
      const shakeX =
        (Math.sin(this.time * 48) * 0.35 + (Math.random() - 0.5) * 0.15) *
        this.cameraImpulse;
      const shakeY =
        (Math.cos(this.time * 54) * 0.35 + (Math.random() - 0.5) * 0.15) *
        this.cameraImpulse;
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
      this.cameraImpulse = Math.max(0, this.cameraImpulse - dt * 2.8);
    }
    this.updateWeather(dt);
    this.sky?.position.copy(this.camera.position);
    this.plane.visible = this.cameraMode !== 1;
    this.sun.position.copy(this.plane.position).add(SUN_OFFSET);
    this.sun.target.position.copy(this.plane.position);
    const cloudWind = windVector(this.flightWeather, this.time);
    this.cloudGroup.position.x += cloudWind.x * dt * 0.5;
    this.cloudGroup.position.z += cloudWind.z * dt * 0.5;
    this.windVectorUniform.value.set(cloudWind.x, cloudWind.z);
    this.cloudSystem?.update(dt, this.time, cloudWind, this.camera, this.sun);
    this.plane.updateMatrixWorld();
    this.updateParticles(dt);
    this.aircraftFx?.update(dt, this.sim, this.time);
    this.arcadeFx?.update(dt, this.sim, this.time);
    this.skywriting.update(
      this.sim,
      this.time,
      this.guidesEnabled && this.guidanceAvailable,
      this.renderer.domElement.height /
        (2 * Math.tan((this.camera.fov * Math.PI) / 360)),
    );
    this.sunRays?.update(
      dt,
      this.time,
      this.weatherCover.value,
      this.sim.y,
      this.sun.position,
    );
    const skyEvents =
      this.skyLife?.update(
        dt,
        this.time,
        this.flightWeather,
        this.sim,
      ) ?? [];
    for (const ev of skyEvents) {
      if (ev.type === 'balloon_flyby') {
        this.sim.career.cash += ev.bonus;
        this.sim.message = ev.message;
        this.arcadeFx?.addFloatingBadge(ev.message, '#f59e0b', ev.pos);
      }
    }
    let nearestRemoteDist = Infinity;
    let nearestRemoteRelSpeed = 0;
    let nearestRemotePan = 0;
    const nowSec = this.time;

    for (const remote of this.otherPilots.values()) {
      remote.mesh.position.lerp(remote.targetPos, 1 - Math.exp(-dt * 8));
      remote.mesh.quaternion.slerp(remote.targetQuat, 1 - Math.exp(-dt * 9));
      const remoteProp = remote.mesh.getObjectByName('propeller');
      if (remoteProp)
        remoteProp.rotation.z += dt * (remote.target.speed * 1.8 + 45);

      const dx = remote.mesh.position.x - this.plane.position.x;
      const dy = remote.mesh.position.y - this.plane.position.y;
      const dz = remote.mesh.position.z - this.plane.position.z;
      const dist = Math.hypot(dx, dy, dz);

      const isRival =
        Boolean(this.rivalPilotId && remote.target.id === this.rivalPilotId) ||
        remote.target.callsign === this.rivalCallsign;

      // Mid-Air Formation / Dogfight Near-Miss Stunt Check (clearance < 14m at speed >= 28 m/s)
      if (dist < 14.0 && this.sim.speed >= 28.0) {
        if (!remote.lastNearMissTime || nowSec - remote.lastNearMissTime > 15.0) {
          remote.lastNearMissTime = nowSec;
          const bonus = isRival ? 150 : 75;
          const label = isRival ? '★ RIVAL BUZZ! +$150' : '★ FORMATION BUZZ! +$75';
          this.sim.career.cash += bonus;
          this.sim.message = label;
          this.arcadeFx?.addFloatingBadge(
            label,
            isRival ? '#f59e0b' : '#38bdf8',
            remote.mesh.position,
          );
          this.cameraImpulse = 0.08;
        }
      }

      if (dist < nearestRemoteDist) {
        nearestRemoteDist = dist;

        // Line-of-sight unit vector from player to remote
        const losX = dist > 0.1 ? dx / dist : 0;
        const losY = dist > 0.1 ? dy / dist : 0;
        const losZ = dist > 0.1 ? dz / dist : 0;

        // 3D vector velocity of player and remote
        const pVx = Math.sin(this.sim.heading) * Math.cos(this.sim.pitch) * this.sim.speed;
        const pVy = Math.sin(this.sim.pitch) * this.sim.speed;
        const pVz = -Math.cos(this.sim.heading) * Math.cos(this.sim.pitch) * this.sim.speed;

        const rVx = Math.sin(remote.target.heading) * Math.cos(remote.target.pitch) * remote.target.speed;
        const rVy = Math.sin(remote.target.pitch) * remote.target.speed;
        const rVz = -Math.cos(remote.target.heading) * Math.cos(remote.target.pitch) * remote.target.speed;

        // Relative velocity: vRemote - vPlayer
        const dvx = rVx - pVx;
        const dvy = rVy - pVy;
        const dvz = rVz - pVz;

        // Closing speed is the rate of distance decrease: -(v_rel . LOS)
        nearestRemoteRelSpeed = -(dvx * losX + dvy * losY + dvz * losZ);

        // 3D cockpit-relative stereo panning (works in pitch, roll, and inverted flight)
        const localPos = this.plane.worldToLocal(remote.mesh.position.clone());
        nearestRemotePan = Math.max(-0.9, Math.min(0.9, localPos.x / 35));
      }

      if (remote.labelSprite) {
        const opacity = Math.max(0, Math.min(0.9, 1 - (dist - 100) / 750));
        remote.labelSprite.material.opacity = opacity;
        remote.labelSprite.visible = opacity > 0.02;

        const distMeters = Math.round(dist);
        const quantDist =
          dist < 30
            ? Math.floor(dist)
            : dist < 100
              ? Math.floor(dist / 5) * 5
              : Math.floor(dist / 25) * 25;
        const labelKey = `${remote.target.callsign}:${isRival}:${remote.target.spraying}:${quantDist}`;
        if (
          remote.labelCanvas &&
          remote.lastLabelKey !== labelKey &&
          (remote.lastDistanceUpdate === undefined ||
            nowSec - remote.lastDistanceUpdate > 0.4)
        ) {
          remote.lastLabelKey = labelKey;
          remote.lastDistanceUpdate = nowSec;
          this.drawPilotLabel(
            remote.labelCanvas,
            remote.target.callsign,
            isRival,
            remote.target.spraying,
            distMeters,
          );
          if (remote.labelSprite.material.map) {
            remote.labelSprite.material.map.needsUpdate = true;
          }
        }
      }

      if (remote.sprayPoints && remote.sprayPositions && remote.sprayLife) {
        const count = remote.sprayLife.length;
        const emitCount = remote.target.spraying && !remote.target.skywriting
          ? Math.min(2, Math.floor(dt * 60) || 1)
          : 0;
        for (let p = 0; p < emitCount; p++) {
          const idx = (remote.sprayIndex ?? 0) % count;
          remote.sprayIndex = idx + 1;
          const spread = (Math.random() - 0.5) * 14;
          const emitPos = new T.Vector3(spread, -0.8, 1.2).applyMatrix4(
            remote.mesh.matrixWorld,
          );
          remote.sprayPositions[idx * 3] = emitPos.x;
          remote.sprayPositions[idx * 3 + 1] = emitPos.y;
          remote.sprayPositions[idx * 3 + 2] = emitPos.z;
          remote.sprayLife[idx] = 2.0 + Math.random() * 0.5;
        }

        let hasActiveParticles = false;
        for (let p = 0; p < count; p++) {
          if (remote.sprayLife[p] > 0) {
            hasActiveParticles = true;
            remote.sprayLife[p] -= dt;
            remote.sprayPositions[p * 3] += cloudWind.x * dt * 0.6;
            remote.sprayPositions[p * 3 + 1] -= dt * 4.5;
            remote.sprayPositions[p * 3 + 2] += cloudWind.z * dt * 0.6;
          } else {
            remote.sprayPositions[p * 3 + 1] = -1000;
          }
        }
        if (hasActiveParticles || emitCount > 0) {
          remote.sprayPoints.geometry.attributes.position.needsUpdate = true;
        }
      }
    }

    if (Number.isFinite(nearestRemoteDist)) {
      this.onRemoteProximity?.(
        nearestRemoteDist,
        nearestRemoteRelSpeed,
        nearestRemotePan,
      );
    } else {
      this.onRemoteProximity?.(999, 0, 0);
    }

    if (this.cinematicCamera) {
      this.cinematicCamera.reducedMotion = this.reducedMotion;
      this.cinematicCamera.render(dt, this.sim, this.time);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.onFrame?.();
    this.frame = requestAnimationFrame(this.animate);
  };
  drawPilotLabel(
    canvas: HTMLCanvasElement,
    callsign: string,
    isRival: boolean,
    spraying: boolean,
    distMeters?: number,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const radius = 16;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, radius);
    ctx.fillStyle = isRival
      ? 'rgba(40, 24, 8, 0.90)'
      : 'rgba(12, 38, 28, 0.88)';
    ctx.fill();
    ctx.strokeStyle = isRival ? '#f59e0b' : spraying ? '#84cc16' : '#6ee7b7';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font =
      'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isRival ? '#fef3c7' : '#f0fdf4';

    let text = isRival ? `★ RIVAL · ${callsign}` : callsign;
    if (distMeters !== undefined && distMeters > 0) {
      text += ` · ${distMeters < 1000 ? `${distMeters}m` : `${(distMeters / 1000).toFixed(1)}km`}`;
    }
    ctx.fillText(text, w / 2, h / 2 - (spraying ? 8 : 0));

    if (spraying) {
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#a3e635';
      ctx.fillText('● SPRAYING', w / 2, h / 2 + 18);
    }
  }
  setCounty(county: CountySnapshot | null) {
    this.skywriting.receive(
      county ? county.pilots.filter((p) => p.id !== county.viewerId) : null,
      this.time,
    );
    this.countyForecast = county?.weather ?? null;
    this.guidanceAvailable = !county || Boolean(county.player?.activeJob);
    const live =
      county?.pilots.filter(
        (p) => p.id !== county.viewerId && p.phase === 'flying',
      ) ?? [];
    for (const [id, other] of this.otherPilots) {
      if (!live.some((p) => p.id === id)) {
        this.scene.remove(other.mesh);
        if (other.sprayPoints) this.scene.remove(other.sprayPoints);
        other.mesh.traverse((o) => {
          if (o instanceof T.Sprite && o.name === 'pilot-label') {
            o.material.map?.dispose();
            o.material.dispose();
          }
        });
        if (other.sprayPoints) {
          other.sprayPoints.geometry.dispose();
          (other.sprayPoints.material as T.Material).dispose();
        }
        this.otherPilots.delete(id);
      }
    }
    for (const pilot of live) {
      let other = this.otherPilots.get(pilot.id);
      if (!other) {
        const mesh = this.plane.clone(true);
        mesh.visible = true;
        mesh.position.set(pilot.x, pilot.y, pilot.z);
        mesh.quaternion.setFromEuler(
          new T.Euler(pilot.pitch, -pilot.heading, pilot.roll, 'YXZ'),
        );

        // Remote spray particle system (240 particles, ~2.0s trail)
        const sprayPositions = new Float32Array(240 * 3);
        const sprayLife = new Float32Array(240);
        for (let i = 0; i < 240; i++) {
          sprayPositions[i * 3 + 1] = -1000;
        }
        const sprayGeom = new T.BufferGeometry();
        sprayGeom.setAttribute(
          'position',
          new T.BufferAttribute(sprayPositions, 3).setUsage(T.DynamicDrawUsage),
        );
        const sprayMat = new T.PointsMaterial({
          color: '#e4fcd6',
          size: 3.2,
          transparent: true,
          opacity: 0.38,
          depthWrite: false,
        });
        const sprayPoints = new T.Points(sprayGeom, sprayMat);
        sprayPoints.frustumCulled = false;
        this.scene.add(sprayPoints);

        const targetPos = new T.Vector3(pilot.x, pilot.y, pilot.z);
        const targetQuat = new T.Quaternion().setFromEuler(
          new T.Euler(pilot.pitch, -pilot.heading, pilot.roll, 'YXZ'),
        );

        let labelCanvas: HTMLCanvasElement | undefined;
        let labelSprite: T.Sprite | undefined;
        if (typeof document !== 'undefined') {
          labelCanvas = document.createElement('canvas');
          labelCanvas.width = 384;
          labelCanvas.height = 72;
          this.drawPilotLabel(
            labelCanvas,
            pilot.callsign,
            pilot.callsign === this.rivalCallsign,
            pilot.spraying,
          );
          labelSprite = new T.Sprite(
            new T.SpriteMaterial({
              map: new T.CanvasTexture(labelCanvas),
              transparent: true,
              depthTest: false,
            }),
          );
          labelSprite.name = 'pilot-label';
          labelSprite.position.set(0, 6, 0);
          labelSprite.scale.set(22, 4.125, 1);
          mesh.add(labelSprite);
        }

        other = {
          mesh,
          target: pilot,
          targetPos,
          targetQuat,
          labelSprite,
          labelCanvas,
          lastLabelKey: `${pilot.callsign}:${pilot.callsign === this.rivalCallsign}:${pilot.spraying}`,
          sprayPoints,
          sprayPositions,
          sprayLife,
          sprayIndex: 0,
        };
        this.otherPilots.set(pilot.id, other);
        this.scene.add(mesh);
      } else {
        other.target = pilot;
        other.targetPos.set(pilot.x, pilot.y, pilot.z);
        other.targetQuat.setFromEuler(
          new T.Euler(pilot.pitch, -pilot.heading, pilot.roll, 'YXZ'),
        );
      }
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
  triggerCameraImpulse(strength: number = 0.6): void {
    this.cameraImpulse = Math.min(1.2, this.cameraImpulse + strength);
  }
  dispose() {
    this.skywriting?.dispose();
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
    this.sunRays?.dispose();
    this.skyLife?.dispose();
    this.cloudSystem?.dispose();
    this.treeSystem?.dispose();
    this.aircraftFx?.dispose();
    this.arcadeFx?.dispose();
    this.cinematicCamera?.dispose();
    this.stuntProps?.dispose();
    this.stuntGroup.clear();
    this.sun.shadow.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
