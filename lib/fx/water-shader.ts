import * as T from 'three';

/**
 * Creates a configured MeshStandardMaterial for the winding river featuring:
 * - Multi-frequency animated vertex displacement
 * - Channel-depth color absorption (deep navy/cyan to sandy emerald banks)
 * - Dual-layer intersecting caustic ripples flowing along the river
 * - Specular sun glint normal perturbation
 * - Glancing Fresnel sky reflection factor
 *
 * @param windTime - Animated time reference uniform { value: number }
 * @param sunDirection - Optional directional light vector for sun glints and reflections
 */
export function createRiverMaterial(
  windTime: { value: number },
  sunDirection?: T.Vector3,
): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color: '#1d70d8',
    metalness: 0.35,
    roughness: 0.18,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterTime = windTime;
    shader.uniforms.sunDirection = {
      value: sunDirection
        ? sunDirection.clone().normalize()
        : new T.Vector3(-640, 620, -880).normalize(),
    };

    // Vertex Shader: declare varying outputs and uniform time
    shader.vertexShader =
      `varying vec3 vWater;
varying vec2 vRiverUv;
uniform float waterTime;
` + shader.vertexShader;

    // Vertex Shader: apply animated multi-frequency surface displacement
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
transformed.y += sin(position.z * 0.08 + waterTime * 1.1) * 0.16 + sin(position.x * 0.15 + position.z * 0.04 + waterTime * 1.8) * 0.08;
vWater = position;
#ifdef USE_UV
  vRiverUv = uv;
#else
  float riverCenterX = 980.0 + sin(position.z * 0.0017) * 260.0 + sin(position.z * 0.0033) * 65.0;
  vRiverUv = vec2(clamp((position.x - riverCenterX) / 108.0 + 0.5, 0.0, 1.0), position.z * 0.01);
#endif`,
    );

    // Fragment Shader: declare varying inputs and uniforms
    shader.fragmentShader =
      `varying vec3 vWater;
varying vec2 vRiverUv;
uniform float waterTime;
uniform vec3 sunDirection;
` + shader.fragmentShader;

    // Fragment Shader: color absorption/depth + downstream caustic ripples
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Color absorption & depth: vibrant river blue across the channel
      float bankDist = clamp(abs(vRiverUv.x - 0.5) * 2.0, 0.0, 1.0);
      vec3 deepChannel = vec3(0.08, 0.38, 0.82); // Rich vibrant sapphire/cobalt blue
      vec3 shallowBank = vec3(0.24, 0.62, 0.90); // Clear bright sky-blue banks
      vec3 depthColor = mix(deepChannel, shallowBank, smoothstep(0.0, 1.0, bankDist));

      // Curvilinear downstream flow coordinates along the river channel
      float downriver = vWater.z * 0.08 - waterTime * 1.8;
      float crossriver = vWater.x * 0.14;
      float ripple1 = sin(crossriver + downriver * 1.2) * cos(downriver * 1.8 - crossriver * 0.5);
      float ripple2 = cos(crossriver * 1.3 - downriver * 1.5) * sin(crossriver * 0.7 + downriver * 0.9);
      float caustics = (ripple1 + ripple2) * 0.5;
      float causticHighlight = pow(max(0.0, caustics + 0.35), 2.8) * 0.28;
      float riverFlow = sin(crossriver * 0.2 + downriver * 0.4) * 0.06;

      diffuseColor.rgb = depthColor * (0.94 + riverFlow) + vec3(0.38, 0.76, 0.98) * causticHighlight;`,
    );

    // Fragment Shader: specular sun glint normal perturbation
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      // Downstream specular sun glint normal perturbation
      float flowZ = vWater.z * 0.12 - waterTime * 2.0;
      vec3 glintNormal = vec3(
        cos(vWater.x * 0.18 + flowZ * 0.5) * 0.06 + cos(vWater.x * 0.45 - flowZ * 1.2) * 0.03,
        0.0,
        sin(flowZ) * 0.08 + sin(flowZ * 2.1) * 0.04
      );
      normal = normalize(normal + mat3(viewMatrix) * glintNormal);`,
    );

    // Fragment Shader: setup viewDir for lighting and Fresnel calculation
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_begin>',
      `#include <lights_fragment_begin>
      vec3 viewDir = geometryViewDir;
      float fresnel = pow(1.0 - max(0.0, dot(geometryNormal, viewDir)), 3.0);`,
    );

    // Fragment Shader: Fresnel sky reflection at glancing angles
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `// Fresnel reflection factor: glancing angles reflect luminous sky gradient
      vec3 skyReflection = mix(vec3(0.55, 0.74, 0.92), vec3(0.85, 0.92, 0.98), max(0.0, dot(geometryNormal, sunDirection)));
      outgoingLight = mix(outgoingLight, skyReflection, fresnel * 0.65);
      #include <opaque_fragment>`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-river-v3';

  return material;
}
