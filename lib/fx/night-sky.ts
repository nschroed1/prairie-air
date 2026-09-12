import * as T from 'three';

export const MOON_DIRECTION = new T.Vector3(-0.45, 0.72, -0.52).normalize();
export const MOON_LIGHT_COLOR = '#c6dcff';
export const MOON_LIGHT_INTENSITY = 0.52;
export const NIGHT_FOG_COLOR = '#070e1a';
export const NIGHT_HEMI_SKY = '#1a263e';
export const NIGHT_HEMI_GROUND = '#08100c';

export interface StarfieldOptions {
  count?: number;
  radius?: number;
  minElevation?: number;
}

/**
 * Creates a celestial starfield geometry containing thousands of stars
 * distributed across the upper hemisphere with astronomical color grading.
 */
export function createStarfieldGeometry(options: StarfieldOptions | number = {}): T.BufferGeometry {
  const count = typeof options === 'number' ? options : (options.count ?? 2600);
  const radius = typeof options === 'number' ? 9800 : (options.radius ?? 9800);
  const minElevation = typeof options === 'number' ? 0.04 : (options.minElevation ?? 0.04); // Keep slightly above horizon

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  // Stellar color palettes (sRGB)
  const palette = [
    new T.Color('#d4e6ff'), // Class B/A: Ice blue
    new T.Color('#ffffff'), // Class A: Brilliant white
    new T.Color('#fff2cc'), // Class F/G: Warm solar yellow
    new T.Color('#ffe1ad'), // Class K: Amber orange
    new T.Color('#ffb899'), // Class M: Red giant
  ];

  // Pseudo-random generator with fixed seed for determinism
  let seed = 421981;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    // Generate uniform point on upper sphere
    const theta = rnd() * Math.PI * 2;
    // phi: elevation above horizon
    const sinPhi = minElevation + rnd() * (1.0 - minElevation);
    const cosPhi = Math.sqrt(Math.max(0, 1.0 - sinPhi * sinPhi));

    const x = radius * cosPhi * Math.cos(theta);
    const y = radius * sinPhi;
    const z = radius * cosPhi * Math.sin(theta);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Magnitude & color distribution:
    // Most stars are dim white/blue; few are bright giants
    const magRoll = rnd();
    let col: T.Color;
    let size: number;

    if (magRoll > 0.95) {
      // 1st magnitude bright stars
      col = palette[Math.floor(rnd() * palette.length)];
      size = 3.2 + rnd() * 1.5;
    } else if (magRoll > 0.75) {
      // 2nd/3rd magnitude stars
      col = palette[Math.floor(rnd() * 3)];
      size = 2.0 + rnd() * 1.0;
    } else {
      // Faint background field
      col = palette[rnd() < 0.6 ? 1 : 0];
      size = 1.0 + rnd() * 0.9;
    }

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    sizes[i] = size;
    phases[i] = rnd() * Math.PI * 2;
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new T.BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new T.BufferAttribute(phases, 1));

  return geometry;
}

/**
 * Creates custom twinkling starfield shader material.
 */
export function createStarfieldMaterial(): T.ShaderMaterial {
  const opacityUniform = { value: 0 };
  return new T.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      opacity: opacityUniform,
      starOpacity: opacityUniform,
      scintillation: { value: 1.0 },
      pixelRatio: { value: 1.0 },
    },
    vertexShader: `
      attribute vec3 color;
      attribute float size;
      attribute float phase;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float time;
      uniform float opacity;
      uniform float pixelRatio;

      void main() {
        vColor = color;
        // Calm, authentic celestial scintillation (no rapid buzzing or jumping points)
        float twinkle = 0.88 + 0.12 * sin(time * 0.7 + phase * 2.5);
        vAlpha = opacity * twinkle;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio * 1.1;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        // Soft circular particle disc with Gaussian falloff
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        if (dist > 0.5) discard;
        float core = smoothstep(0.5, 0.05, dist);
        gl_FragColor = vec4(vColor, vAlpha * core);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
  });
}

/**
 * Creates 3D celestial Moon disc with luminous halo glow.
 */
export function createMoonMesh(): T.Group {
  const moonGroup = new T.Group();

  // 1. Moon spherical body
  const moonRadius = 260;
  const moonGeo = new T.SphereGeometry(moonRadius, 32, 16);
  const moonMat = new T.MeshBasicMaterial({
    color: '#eef5ff',
    depthWrite: false,
  });
  const moonSphere = new T.Mesh(moonGeo, moonMat);
  moonGroup.add(moonSphere);

  // 2. Soft luminous lunar halo ring
  const haloRadius = moonRadius * 2.8;
  const haloGeo = new T.PlaneGeometry(haloRadius * 2, haloRadius * 2);
  const haloMat = new T.ShaderMaterial({
    uniforms: {
      haloColor: { value: new T.Color('#94b8e6') },
      opacity: { value: 0.55 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 haloColor;
      uniform float opacity;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        if (d > 1.0) discard;
        float glow = pow(1.0 - d, 2.4) * opacity;
        gl_FragColor = vec4(haloColor, glow);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });

  const haloMesh = new T.Mesh(haloGeo, haloMat);
  moonGroup.add(haloMesh);

  return moonGroup;
}

/**
 * NightSkySystem coordinates celestial objects, starfields, moonlight,
 * and day-to-night lighting transitions.
 */
export class NightSkySystem {
  group = new T.Group();
  moonGroup: T.Group;
  moonLight: T.DirectionalLight;
  starfield: T.Points;
  starMaterial: T.ShaderMaterial;
  nightFactor = 0.0; // 0.0 = daytime, 1.0 = midnight
  targetNightFactor = 0.0;
  moonDistance = 9200;

  constructor(public scene: T.Scene) {
    this.group.name = 'night-sky-system';

    // 1. Directional Moonlight (soft non-conflicting nocturnal fill light)
    this.moonLight = new T.DirectionalLight(MOON_LIGHT_COLOR, 0.0);
    this.moonLight.castShadow = false;
    this.scene.add(this.moonLight, this.moonLight.target);

    // 2. Celestial Starfield
    const starGeo = createStarfieldGeometry();
    this.starMaterial = createStarfieldMaterial();
    this.starfield = new T.Points(starGeo, this.starMaterial);
    this.starfield.renderOrder = -1;
    this.group.add(this.starfield);

    // 3. Moon Mesh & Halo
    this.moonGroup = createMoonMesh();
    const moonPos = MOON_DIRECTION.clone().multiplyScalar(this.moonDistance);
    this.moonGroup.position.copy(moonPos);
    this.moonGroup.lookAt(0, 0, 0);
    this.group.add(this.moonGroup);

    this.scene.add(this.group);
  }

  get starMat(): T.ShaderMaterial {
    return this.starMaterial;
  }

  /**
   * Updates star twinkling, moonlight position, and day-to-night blending.
   */
  update(dt: number, time: number, cameraPos?: T.Vector3, directNightFactor?: number): void {
    if (directNightFactor !== undefined) {
      this.nightFactor = directNightFactor;
      this.targetNightFactor = directNightFactor;
    } else {
      const blendRate = 2.4;
      const blend = 1.0 - Math.exp(-dt * blendRate);
      this.nightFactor += (this.targetNightFactor - this.nightFactor) * blend;
    }

    // Anchor starfield and moon relative to camera so they remain celestial
    if (cameraPos) {
      this.starfield.position.copy(cameraPos);
      const moonPos = cameraPos.clone().addScaledVector(MOON_DIRECTION, this.moonDistance);
      this.moonGroup.position.copy(moonPos);
      this.moonGroup.lookAt(cameraPos);

      // Keep moonlight source tracking the aircraft's position on the ground
      this.moonLight.position.copy(cameraPos).addScaledVector(MOON_DIRECTION, 800);
      this.moonLight.target.position.copy(cameraPos);
    }

    // Update starfield shader
    const starOpacity = Math.max(0, Math.min(1, (this.nightFactor - 0.15) / 0.85));
    this.starMaterial.uniforms.time.value = time;
    this.starMaterial.uniforms.opacity.value = starOpacity;
    if (this.starMaterial.uniforms.starOpacity) {
      this.starMaterial.uniforms.starOpacity.value = starOpacity;
    }

    // Update moonlight intensity
    this.moonLight.intensity = MOON_LIGHT_INTENSITY * Math.max(0, (this.nightFactor - 0.2) / 0.8);

    // Visibility toggles
    const isVisible = this.nightFactor > 0.01;
    this.group.visible = isVisible;
    this.moonLight.visible = isVisible && this.moonLight.intensity > 0.01;
  }

  setNightMode(enabled: boolean, immediate = false): void {
    this.targetNightFactor = enabled ? 1.0 : 0.0;
    if (immediate) {
      this.nightFactor = this.targetNightFactor;
    }
  }

  get isNight(): boolean {
    return this.nightFactor > 0.5;
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.scene.remove(this.moonLight);
    this.scene.remove(this.moonLight.target);

    this.starfield.geometry.dispose();
    this.starMaterial.dispose();

    this.moonGroup.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
