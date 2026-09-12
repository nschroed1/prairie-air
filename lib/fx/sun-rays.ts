import * as T from 'three';

/**
 * Palette colors for volumetric atmospheric sunlight:
 * - High-altitude daytime: warm honey / golden amber sunlight (significantly less white, rich sunlit warmth)
 * - Low-angle sunset/golden hour: deeper rich warm amber / terracotta sunlight
 */
export const SUN_RAYS_DAY_COLOR = '#dfa543';
export const SUN_RAYS_SUNSET_COLOR = '#cf7320';

export const DEFAULT_SHAFT_COUNT = 20;

/**
 * Predefined cumulus cloud cluster anchors.
 * Cumulus cloud bases across the prairie range from 650m to 900m altitude.
 * Shafts angle down from these cloud positions towards the farmland.
 */
interface ShaftClusterConfig {
  x: number;
  z: number;
  cloudAlt: number;
  radius: number;
  phaseOffset: number;
}

const CLUSTER_CONFIGS: ShaftClusterConfig[] = [
  { x: -1400, z: -1100, cloudAlt: 740, radius: 130, phaseOffset: 0.0 },
  { x: -950, z: -1500, cloudAlt: 790, radius: 150, phaseOffset: 0.7 },
  { x: -450, z: -1800, cloudAlt: 830, radius: 120, phaseOffset: 1.4 },
  { x: 120, z: -2100, cloudAlt: 870, radius: 160, phaseOffset: 2.1 },
  { x: 650, z: -1750, cloudAlt: 810, radius: 140, phaseOffset: 2.8 },
  { x: 1200, z: -1300, cloudAlt: 760, radius: 125, phaseOffset: 3.5 },
  { x: 1650, z: -900, cloudAlt: 710, radius: 110, phaseOffset: 4.2 },
  { x: -1800, z: -600, cloudAlt: 690, radius: 145, phaseOffset: 4.9 },
  { x: -1250, z: -350, cloudAlt: 770, radius: 135, phaseOffset: 5.6 },
  { x: -700, z: -850, cloudAlt: 850, radius: 170, phaseOffset: 0.4 },
  { x: -150, z: -1250, cloudAlt: 820, radius: 155, phaseOffset: 1.1 },
  { x: 420, z: -1100, cloudAlt: 780, radius: 140, phaseOffset: 1.8 },
  { x: 980, z: -750, cloudAlt: 730, radius: 130, phaseOffset: 2.5 },
  { x: 1450, z: -300, cloudAlt: 680, radius: 115, phaseOffset: 3.2 },
  { x: -2100, z: -100, cloudAlt: 720, radius: 150, phaseOffset: 3.9 },
  { x: -1600, z: 250, cloudAlt: 760, radius: 135, phaseOffset: 4.6 },
  { x: -900, z: 150, cloudAlt: 840, radius: 160, phaseOffset: 5.3 },
  { x: 300, z: -400, cloudAlt: 800, radius: 145, phaseOffset: 6.0 },
  { x: 800, z: 100, cloudAlt: 750, radius: 125, phaseOffset: 0.9 },
  { x: 1350, z: 350, cloudAlt: 700, radius: 120, phaseOffset: 1.6 },
];

/**
 * Computes the god ray volumetric intensity based on weather cloud cover.
 *
 * Rules:
 * - Clear sky (weatherCover < 0.05): rays are invisible or very faint (<= 0.05).
 * - Scattered / broken cumulus clouds (0.12 <= weatherCover <= 0.65): dramatic rays beaming down (0.25 - 0.45).
 * - Thick overcast / storm (weatherCover > 0.8): rays diffuse away (< 0.08).
 */
export function computeRayIntensity(weatherCover: number): number {
  const cover = Math.max(0, Math.min(1, weatherCover));

  if (cover < 0.05) {
    // In clear sky, sun rays are invisible or very faint (<= 0.05)
    return cover;
  }

  if (cover < 0.12) {
    // Smooth ramp-up from faint to broken cloud threshold
    const t = (cover - 0.05) / (0.12 - 0.05);
    return 0.05 + t * (0.25 - 0.05);
  }

  if (cover <= 0.65) {
    // Scattered / broken cumulus: dramatic shafts beaming down (0.25 - 0.45)
    const mid = 0.385;
    const halfWidth = (0.65 - 0.12) * 0.5; // 0.265
    const normDist = (cover - mid) / halfWidth; // in [-1, 1]
    const base = 0.25;
    const peak = 0.44;
    return base + (peak - base) * Math.max(0, 1.0 - normDist * normDist);
  }

  if (cover <= 0.8) {
    // Transition from broken cumulus down toward thick overcast
    const t = (cover - 0.65) / (0.8 - 0.65);
    return 0.25 + t * (0.075 - 0.25);
  }

  // Thick overcast / storm (> 0.8): diffuse away (< 0.08)
  const t = Math.min(1.0, (cover - 0.8) / 0.2);
  return 0.075 * (1.0 - t);
}

/**
 * Volumetric Atmospheric Sun Rays (Crepuscular God Rays)
 *
 * Generates majestic shafts of light beaming down through cumulus clouds
 * toward the prairie farmland, dynamically reacting to sun position, time,
 * and weather conditions.
 */
export class SunRays {
  public readonly scene: T.Scene;
  public readonly cloudGroup: T.Group;
  public readonly sun: T.DirectionalLight;

  public readonly group: T.Group;
  public readonly shafts: T.Mesh[] = [];
  public readonly geometry: T.CylinderGeometry;
  public readonly material: T.ShaderMaterial;

  public intensity = 0;
  public readonly clusters: ShaftClusterConfig[] = [];

  // Temporary math vectors to avoid runtime heap allocation during updates
  private readonly _sunDir = new T.Vector3(0, 1, 0);
  private readonly _shaftQuat = new T.Quaternion();
  private readonly _up = new T.Vector3(0, 1, 0);
  private readonly _colorDay = new T.Color(SUN_RAYS_DAY_COLOR);
  private readonly _colorSunset = new T.Color(SUN_RAYS_SUNSET_COLOR);
  private readonly _currentColor = new T.Color(SUN_RAYS_DAY_COLOR);

  constructor(scene: T.Scene, cloudGroup: T.Group, sun: T.DirectionalLight) {
    this.scene = scene;
    this.cloudGroup = cloudGroup;
    this.sun = sun;

    this.group = new T.Group();
    this.group.name = 'sun-rays';

    // Base unit truncated cone / cylinder:
    // - Top radius: 0.28 (cloud ceiling aperture)
    // - Bottom radius: 1.0 (farmland ground spread)
    // - Height: 1.0 (normalized, scaled per shaft in update)
    this.geometry = new T.CylinderGeometry(0.28, 1.0, 1.0, 16, 8, true);

    // Custom volumetric shader material
    this.material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      side: T.DoubleSide,
      uniforms: {
        rayTime: { value: 0 },
        sunDir: { value: new T.Vector3(0, 1, 0) },
        rayIntensity: { value: 0.35 },
        cloudDensity: { value: 0.5 },
        rayColor: { value: new T.Color(SUN_RAYS_DAY_COLOR) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;
        varying vec3 vNormalVec;
        varying vec2 vUv;
        varying float vHeightNorm;

        uniform float rayTime;
        uniform vec3 sunDir;
        uniform float rayIntensity;
        uniform float cloudDensity;

        void main() {
          vUv = uv;
          vLocalPos = position;
          vNormalVec = normalMatrix * normal;

          // Normalized height along cone: 0.0 at farmland bottom, 1.0 at cloud ceiling top
          float hNorm = clamp(position.y + 0.5, 0.0, 1.0);
          vHeightNorm = hNorm;

          // Vertex: Extrudes along light vector with soft lateral spreading
          vec3 transformed = position;
          float lateralSpread = mix(1.25, 0.88, hNorm);
          transformed.x *= lateralSpread;
          transformed.z *= lateralSpread;

          // Extrude along sunDir light vector
          transformed += sunDir * (sin(position.y * 6.28 + rayTime * 0.4) * 0.03);

          vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
          vWorldPos = worldPos.xyz;

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;
        varying vec3 vNormalVec;
        varying vec2 vUv;
        varying float vHeightNorm;

        uniform float rayTime;
        uniform vec3 sunDir;
        uniform float rayIntensity;
        uniform float cloudDensity;
        uniform vec3 rayColor;

        void main() {
          if (rayIntensity <= 0.001) {
            discard;
          }

          // 1. Soft radial Gaussian falloff from cone center
          // Shaft edges grazing view direction fall off to zero, center facing camera is radiant
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float facing = abs(dot(normalize(vNormalVec), viewDir));
          float radialGaussian = exp(-3.5 * pow(1.0 - facing, 2.0));

          // Cross-cone Gaussian falloff from UV horizontal center (softer feathered edges)
          float uvDist = abs(vUv.x - 0.5) * 2.0;
          float uvGaussian = exp(-3.6 * uvDist * uvDist);
          float radialFalloff = radialGaussian * 0.55 + uvGaussian * 0.45;

          // 2. Distance fade near ground and cloud ceiling
          // Smooth blend at ground level (farmland) and cloud ceiling (cumulus base)
          float groundFade = smoothstep(0.03, 0.26, vHeightNorm);
          float ceilingFade = smoothstep(0.97, 0.74, vHeightNorm);
          float worldGroundFade = smoothstep(20.0, 150.0, vWorldPos.y);
          float worldCeilingFade = smoothstep(1050.0, 800.0, vWorldPos.y);
          float distanceFade = groundFade * ceilingFade * worldGroundFade * worldCeilingFade;

          // 3. Subtle traveling atmospheric noise: sin(pos.x * 0.01 + rayTime * 0.5)
          vec3 pos = vWorldPos;
          float travelingNoise = sin(pos.x * 0.01 + rayTime * 0.5);
          float secondaryNoise = cos(pos.z * 0.009 - rayTime * 0.35 + pos.y * 0.003);
          float atmosphericNoise = 0.82 + 0.18 * (travelingNoise * 0.6 + secondaryNoise * 0.4);

          // Combine radial falloff, boundary fades, atmospheric dust noise, and intensity
          // 0.36 factor ensures god rays provide delicate, atmospheric golden depth without overpowering
          float alpha = radialFalloff * distanceFade * atmosphericNoise * rayIntensity * cloudDensity * 0.36;

          // Color: Warm radiant golden sunlight
          gl_FragColor = vec4(rayColor, alpha);
        }
      `,
    });

    // Copy cluster configurations (20 shafts positioned under key cloud clusters)
    for (const cfg of CLUSTER_CONFIGS) {
      this.clusters.push({ ...cfg });
    }

    // Preallocate shafts and attach to group
    for (let i = 0; i < this.clusters.length; i++) {
      const shaft = new T.Mesh(this.geometry, this.material);
      shaft.name = `sun-shaft-${i}`;
      shaft.frustumCulled = false;
      this.shafts.push(shaft);
      this.group.add(shaft);
    }

    // Attach group to scene
    this.scene.add(this.group);
  }

  /**
   * Static helper for weather cover intensity computation.
   */
  public static computeRayIntensity(weatherCover: number): number {
    return computeRayIntensity(weatherCover);
  }

  /**
   * Updates sun ray orientation, weather cover modulation, traveling noise time,
   * color temperature, and shaft positions framing the horizon.
   *
   * @param dt - Delta time in seconds
   * @param time - Cumulative simulation time
   * @param weatherCover - Cloud cover fraction [0, 1]
   * @param simY - Aircraft simulation altitude
   * @param sunPos - Optional sun position override
   */
  public update(
    _dt: number,
    time: number,
    weatherCover: number,
    _simY: number,
    sunPos?: T.Vector3,
  ): void {
    // 1. Weather Cover Intensity Modulation
    const intensity = computeRayIntensity(weatherCover);
    this.intensity = intensity;
    this.material.uniforms.rayIntensity.value = intensity;
    this.material.uniforms.cloudDensity.value = Math.min(
      1.0,
      Math.max(0.1, weatherCover * 1.5),
    );

    // 2. Traveling atmospheric noise time
    this.material.uniforms.rayTime.value = time;

    // 3. Sun Direction Alignment
    const rawSun = sunPos ?? this.sun.position;
    if (rawSun.lengthSq() > 0.0001) {
      this._sunDir.copy(rawSun).normalize();
    } else {
      this._sunDir.set(-0.5, 0.7, -0.5).normalize();
    }

    // Ensure sunDir has positive upward altitude so shafts angle down to ground
    if (this._sunDir.y <= 0.08) {
      this._sunDir.y = 0.08;
      this._sunDir.normalize();
    }
    this.material.uniforms.sunDir.value.copy(this._sunDir);

    // 4. Color shift: warm radiant golden sunlight (#fff1cc daytime, shifting deeper golden #ffd28a when low)
    const elevation = Math.max(0, Math.min(1, this._sunDir.y));
    const colorFactor = Math.min(1, Math.max(0, (elevation - 0.15) / 0.35));
    this._currentColor.copy(this._colorSunset).lerp(this._colorDay, colorFactor);
    (this.material.uniforms.rayColor.value as T.Color).copy(this._currentColor);

    // 5. Orientation: Aligned with the directional sun vector, angled down to ground
    this._shaftQuat.setFromUnitVectors(this._up, this._sunDir);

    const isFaint = intensity <= 0.001;

    // 6. Update individual shaft positions and scales
    for (let i = 0; i < this.shafts.length; i++) {
      const shaft = this.shafts[i];
      if (isFaint) {
        shaft.visible = false;
        continue;
      }
      shaft.visible = true;

      const cluster = this.clusters[i];

      // Anchor top of shaft under cumulus cloud base, tracking drifting cloudGroup
      const cloudX = cluster.x + this.cloudGroup.position.x;
      const cloudZ = cluster.z + this.cloudGroup.position.z;
      const cloudY = cluster.cloudAlt;

      // Project shaft along -sunDir light path from cloud altitude down to farmland ground (y ~ 0)
      const downY = Math.max(0.12, this._sunDir.y);
      const rayLength = Math.min(3200, cloudY / downY);

      // Midpoint along the shaft center line
      const midX = cloudX - this._sunDir.x * (rayLength * 0.5);
      const midY = cloudY - this._sunDir.y * (rayLength * 0.5);
      const midZ = cloudZ - this._sunDir.z * (rayLength * 0.5);

      shaft.position.set(midX, midY, midZ);
      shaft.quaternion.copy(this._shaftQuat);

      // Subtle atmospheric breathing pulse with refined shaft radius
      const radiusPulse =
        1.0 + Math.sin(time * 0.25 + cluster.phaseOffset) * 0.06;
      const radius = cluster.radius * 0.72 * radiusPulse;
      shaft.scale.set(radius, rayLength, radius);
    }
  }

  /**
   * Cleans up geometries, materials, and removes meshes from the scene.
   */
  public dispose(): void {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }

    for (const shaft of this.shafts) {
      this.group.remove(shaft);
    }
    this.shafts.length = 0;

    this.geometry.dispose();
    this.material.dispose();
  }
}
