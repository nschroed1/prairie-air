import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRiverMaterial } from '../lib/fx/water-shader';

test('createRiverMaterial creates MeshStandardMaterial with correct properties and cache key', () => {
  const windTime = { value: 2.5 };
  const sunDir = new T.Vector3(0.5, 0.8, 0.3);
  const material = createRiverMaterial(windTime, sunDir);

  // Material instance checks
  assert.ok(material instanceof T.MeshStandardMaterial);
  assert.equal(material.color.getHexString(), '1d70d8');
  assert.equal(material.metalness, 0.35);
  assert.equal(material.roughness, 0.18);

  // Cache key check
  assert.equal(typeof material.customProgramCacheKey, 'function');
  assert.equal(material.customProgramCacheKey(), 'prairie-river-v3');

  // Simulate onBeforeCompile
  const mockShader: any = {
    uniforms: {},
    vertexShader: `
      #include <common>
      void main() {
        #include <begin_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      void main() {
        vec4 diffuseColor = vec4(1.0);
        #include <color_fragment>
        #include <normal_fragment_begin>
        #include <lights_fragment_begin>
        vec3 outgoingLight = diffuseColor.rgb;
        #include <opaque_fragment>
      }
    `,
  };

  material.onBeforeCompile(mockShader, {} as any);

  // Uniform checks
  assert.equal(mockShader.uniforms.waterTime, windTime);
  assert.ok(mockShader.uniforms.sunDirection);
  assert.ok(mockShader.uniforms.sunDirection.value instanceof T.Vector3);

  // Vertex shader checks
  assert.ok(mockShader.vertexShader.includes('varying vec3 vWater;'));
  assert.ok(mockShader.vertexShader.includes('varying vec2 vRiverUv;'));
  assert.ok(mockShader.vertexShader.includes('uniform float waterTime;'));
  assert.ok(
    mockShader.vertexShader.includes(
      'transformed.y += sin(position.z * 0.08 + waterTime * 1.1) * 0.16 + sin(position.x * 0.15 + position.z * 0.04 + waterTime * 1.8) * 0.08;',
    ),
  );
  assert.ok(mockShader.vertexShader.includes('vWater = position;'));

  // Fragment shader checks
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWater;'));
  assert.ok(mockShader.fragmentShader.includes('varying vec2 vRiverUv;'));
  assert.ok(mockShader.fragmentShader.includes('uniform float waterTime;'));

  // Color absorption & depth: vibrant river blue
  assert.ok(mockShader.fragmentShader.includes('vec3(0.08, 0.38, 0.82)'));
  assert.ok(mockShader.fragmentShader.includes('vec3(0.24, 0.62, 0.90)'));

  // Dual-layer caustic ripples
  assert.ok(mockShader.fragmentShader.includes('ripple1'));
  assert.ok(mockShader.fragmentShader.includes('ripple2'));
  assert.ok(mockShader.fragmentShader.includes('caustics'));

  // Specular sun glint normal perturbation
  assert.ok(mockShader.fragmentShader.includes('glintNormal'));
  assert.ok(mockShader.fragmentShader.includes('mat3(viewMatrix) * glintNormal'));

  // Fresnel reflection factor
  assert.ok(
    mockShader.fragmentShader.includes(
      'pow(1.0 - max(0.0, dot(geometryNormal, viewDir)), 3.0)',
    ),
  );
  assert.ok(mockShader.fragmentShader.includes('outgoingLight = mix(outgoingLight, skyReflection, fresnel * 0.65);'));
});

test('createRiverMaterial handles optional sunDirection', () => {
  const windTime = { value: 0 };
  const material = createRiverMaterial(windTime);
  const mockShader: any = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>\n#include <normal_fragment_begin>\n#include <lights_fragment_begin>\n#include <opaque_fragment>',
  };

  material.onBeforeCompile(mockShader, {} as any);
  assert.ok(mockShader.uniforms.sunDirection.value instanceof T.Vector3);
});
