import * as T from 'three';

/**
 * Creates a weathered barnwood siding material featuring:
 * - Rich traditional barn red (or customizable clapboard tone)
 * - Orientation-aware vertical wood plank seams (fract(vWorldPos.x * 0.85) or fract(vWorldPos.z * 0.85))
 * - Deep plank edge shadows
 * - Fine vertical wood grain striations
 * - Weathered edging and height-dependent wood wear
 *
 * @param colorHex - Base wood paint color (defaults to traditional barn red '#9e2b1b')
 */
export function createBarnwoodMaterial(
  colorHex = '#9e2b1b',
): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.88,
    metalness: 0.05,
  });

  material.onBeforeCompile = (shader) => {
    // Vertex Shader: pass world position
    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Pass varying vec3 vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );

    // Fragment Shader: procedural vertical planks, grain, edge shadows, weathered wear
    shader.fragmentShader = 'varying vec3 vWorldPos;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Vertical wood plank seams depending on wall orientation
      #ifdef USE_NORMAL
        bool isZOrientedWall = abs(vNormal.z) >= abs(vNormal.x);
      #else
        bool isZOrientedWall = true;
      #endif

      // Compute vertical wood plank seams: fract(vWorldPos.x * 0.85) or fract(vWorldPos.z * 0.85)
      float plankU = isZOrientedWall ? fract(vWorldPos.x * 0.85) : fract(vWorldPos.z * 0.85);
      float plankWorldCoord = isZOrientedWall ? vWorldPos.x : vWorldPos.z;

      // Plank edge shadows
      float seamDist = min(plankU, 1.0 - plankU);
      float seamShadow = smoothstep(0.0, 0.05, seamDist);
      float edgeShadow = 0.74 + 0.26 * seamShadow;

      // Subtle grain striations
      float grain = sin(vWorldPos.y * 38.0 + sin(plankWorldCoord * 14.0) * 2.0) * 0.035
                  + sin(vWorldPos.y * 92.0 + plankWorldCoord * 24.0) * 0.015;

      // Weathered edging: tone variations across individual planks and height wear
      float plankIndex = floor(isZOrientedWall ? vWorldPos.x * 0.85 : vWorldPos.z * 0.85);
      float plankHash = fract(sin(plankIndex * 12.9898) * 43758.5453);
      float plankTone = (plankHash - 0.5) * 0.10;
      float weatheredEdging = (1.0 - smoothstep(0.02, 0.11, seamDist)) * 0.08;
      float heightWeather = sin(vWorldPos.y * 0.35 + plankHash * 6.28) * 0.04;

      diffuseColor.rgb *= (edgeShadow - weatheredEdging) * (1.0 + grain + plankTone + heightWeather);`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-barnwood-' + colorHex;

  return material;
}

/**
 * Creates a corrugated galvanized metal roof material featuring:
 * - Sinusoidal corrugated ridges with normal perturbation for authentic ridge specular highlights
 * - Seam overlaps spaced every 3.0m
 * - Zinc spangle flakes for authentic farm tin roofing
 *
 * @param tint - Galvanized metal tint (defaults to aged tin '#d5d2be')
 */
export function createCorrugatedRoofMaterial(
  tint = '#d5d2be',
): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color: tint,
    metalness: 0.55,
    roughness: 0.38,
  });

  material.onBeforeCompile = (shader) => {
    // Vertex Shader: pass world roof position
    shader.vertexShader = 'varying vec3 vRoofPos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Pass varying vec3 vRoofPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vRoofPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );

    // Fragment Shader: sinusoidal ridges, overlaps, and zinc spangles
    shader.fragmentShader = 'varying vec3 vRoofPos;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Sinusoidal corrugated ridges: sin(vRoofPos.x * 8.0)
      float corrugatedRidge = sin(vRoofPos.x * 8.0);
      float ridgeHighlight = 0.92 + 0.12 * (corrugatedRidge * 0.5 + 0.5);

      // Seam overlaps every 3.0m
      float seamOverlapCoord = fract(vRoofPos.z / 3.0);
      float seamOverlap = 0.82 + 0.18 * smoothstep(0.0, 0.04, seamOverlapCoord);

      // Zinc spangle flakes for authentic farm tin roofing
      vec2 spangleCell = floor(vRoofPos.xz * 14.0);
      float spangleHash = fract(sin(dot(spangleCell, vec2(127.1, 311.7))) * 43758.5453);
      float zincSpangle = (spangleHash - 0.5) * 0.12;

      diffuseColor.rgb *= ridgeHighlight * seamOverlap;
      diffuseColor.rgb += vec3(zincSpangle);`,
    );

    // Fragment Shader: Perturb normal in #include <normal_fragment_begin> for realistic ridge specular highlights!
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      // Perturb normal for realistic corrugated ridge specular highlights
      float ridgeNormalSlope = cos(vRoofPos.x * 8.0) * 0.35;
      vec3 ridgeNormalPerturbation = vec3(ridgeNormalSlope, 0.0, 0.0);
      normal = normalize(normal + mat3(viewMatrix) * ridgeNormalPerturbation);`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-corrugated-' + tint;

  return material;
}

/**
 * Creates a galvanized grain silo material featuring:
 * - Horizontal rolled sheet metal panel seams
 * - Periodically spaced rivet dot accents along panel boundaries
 * - Industrial galvanized metal roughness and specular reflection
 */
export function createSiloMaterial(): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color: '#b8c4c2',
    metalness: 0.65,
    roughness: 0.32,
  });

  material.onBeforeCompile = (shader) => {
    // Vertex Shader: pass world position
    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Pass varying vec3 vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );

    // Fragment Shader: horizontal rolled sheet seams and rivet accents
    shader.fragmentShader = 'varying vec3 vWorldPos;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Horizontal rolled sheet metal panel seams: fract(vWorldPos.y * 0.38)
      float panelY = fract(vWorldPos.y * 0.38);
      float seamDist = min(panelY, 1.0 - panelY);
      float panelSeam = 0.83 + 0.17 * smoothstep(0.0, 0.045, seamDist);

      // Rivet dot accents along horizontal seams
      float angleAroundSilo = atan(vWorldPos.z, vWorldPos.x);
      float rivetCircumferenceU = fract(angleAroundSilo * 5.72957795); // ~36 rivets per circle
      float rivetDist = length(vec2((rivetCircumferenceU - 0.5) * 0.28, panelY - 0.05));
      float rivetDots = (1.0 - smoothstep(0.012, 0.035, rivetDist)) * 0.16;

      diffuseColor.rgb *= panelSeam;
      diffuseColor.rgb += vec3(rivetDots);`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-silo-v1';

  return material;
}

/**
 * Creates a farmhouse clapboard material featuring:
 * - Horizontal drop-lap siding shadows (fract(vWorldPos.y * 1.8))
 * - Crisp painted siding aesthetic
 *
 * @param color - Siding color (defaults to off-white '#f2efe9')
 */
export function createFarmhouseClapboardMaterial(
  color = '#f2efe9',
): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05,
  });

  material.onBeforeCompile = (shader) => {
    // Vertex Shader: pass world position
    shader.vertexShader = 'varying vec3 vWorldPos;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      // Pass varying vec3 vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`,
    );

    // Fragment Shader: horizontal drop-lap siding shadows
    shader.fragmentShader = 'varying vec3 vWorldPos;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Horizontal drop-lap siding shadows: fract(vWorldPos.y * 1.8)
      float dropLap = fract(vWorldPos.y * 1.8);
      float lapShadow = 0.82 + 0.18 * smoothstep(0.0, 0.08, dropLap);
      diffuseColor.rgb *= lapShadow;`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-clapboard-' + color;

  return material;
}

/**
 * Creates a deep reflective blue architectural glass material.
 */
export function createGlassMaterial(): T.MeshStandardMaterial {
  return new T.MeshStandardMaterial({
    color: '#1b3246',
    metalness: 0.85,
    roughness: 0.12,
  });
}

/**
 * Helper to construct and add an aligned box mesh.
 */
function addBoxMesh(
  width: number,
  height: number,
  depth: number,
  material: T.Material,
  x: number,
  y: number,
  z: number,
  parent: T.Object3D,
): T.Mesh {
  const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/**
 * Helper to construct a multi-pane window assembly complete with outer frame,
 * reflective glass pane, and divided mullion / muntin grid bars.
 */
function addMultiPaneWindow(
  width: number,
  height: number,
  panesX: number,
  panesY: number,
  frameMat: T.Material,
  glassMat: T.Material,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  parent: T.Object3D,
): T.Group {
  const windowGroup = new T.Group();
  windowGroup.position.set(x, y, z);
  windowGroup.rotation.y = rotationY;
  parent.add(windowGroup);

  const frameThickness = 0.18;
  const frameBorder = 0.22;

  // Outer casing border
  // Top & Bottom
  addBoxMesh(
    width,
    frameBorder,
    frameThickness,
    frameMat,
    0,
    height / 2 - frameBorder / 2,
    0,
    windowGroup,
  );
  addBoxMesh(
    width,
    frameBorder,
    frameThickness,
    frameMat,
    0,
    -height / 2 + frameBorder / 2,
    0,
    windowGroup,
  );
  // Left & Right
  addBoxMesh(
    frameBorder,
    height - frameBorder * 2,
    frameThickness,
    frameMat,
    -width / 2 + frameBorder / 2,
    0,
    0,
    windowGroup,
  );
  addBoxMesh(
    frameBorder,
    height - frameBorder * 2,
    frameThickness,
    frameMat,
    width / 2 - frameBorder / 2,
    0,
    0,
    windowGroup,
  );

  // Glass pane inset
  const glassW = width - frameBorder * 2;
  const glassH = height - frameBorder * 2;
  addBoxMesh(glassW, glassH, 0.08, glassMat, 0, 0, 0, windowGroup);

  // Multi-pane vertical mullions
  const barThickness = 0.09;
  const colStep = glassW / panesX;
  for (let c = 1; c < panesX; c++) {
    const barX = -glassW / 2 + c * colStep;
    addBoxMesh(
      barThickness,
      glassH,
      frameThickness * 0.9,
      frameMat,
      barX,
      0,
      0.04,
      windowGroup,
    );
  }

  // Multi-pane horizontal muntins
  const rowStep = glassH / panesY;
  for (let r = 1; r < panesY; r++) {
    const barY = -glassH / 2 + r * rowStep;
    addBoxMesh(
      glassW,
      barThickness,
      frameThickness * 0.9,
      frameMat,
      0,
      barY,
      0.04,
      windowGroup,
    );
  }

  return windowGroup;
}

/**
 * Builds an architecturally enhanced traditional prairie barn featuring:
 * - Red barnwood siding with foundation water-table skirting
 * - Traditional peaked roof with deep eaves, fascia boards, and rafter overhangs
 * - Cross-braced double barn sliding doors and upper hayloft loading door
 * - Hayloft hoist beam hood at the roof ridge
 * - Multi-pane gable and side window assemblies
 * - Roof ridge ventilator cupola with louvers and overhanging cap
 */
export function buildEnhancedBarn(
  parent: T.Group,
  redMat: T.Material,
  roofMat: T.Material,
  whiteTrim: T.Material,
  darkMat: T.Material,
): void {
  const barnGroup = new T.Group();
  parent.add(barnGroup);

  // 1. Hollow Drive-Through Barn Body (28 wide, 15 high, 44 deep with 18.5m open breezeway)
  // Left side wall
  addBoxMesh(4.8, 15, 44, redMat, -11.6, 7.5, 0, barnGroup);
  // Right side wall
  addBoxMesh(4.8, 15, 44, redMat, 11.6, 7.5, 0, barnGroup);
  // Upper hayloft floor spanning over the central breezeway corridor
  addBoxMesh(28, 4.5, 44, redMat, 0, 12.75, 0, barnGroup);

  // Foundation skirting / water-table trim along side walls
  addBoxMesh(5.0, 0.8, 44.6, darkMat, -11.6, 0.4, 0, barnGroup);
  addBoxMesh(5.0, 0.8, 44.6, darkMat, 11.6, 0.4, 0, barnGroup);

  // 2. Roof with Rafter Overhangs and Eaves
  // A gable profile extruded along the barn keeps the roof above the loft.
  const roofLength = 46.6;
  const profile = new T.Shape();
  profile.moveTo(-15.4, 15);
  profile.lineTo(0, 21);
  profile.lineTo(15.4, 15);
  profile.closePath();
  const roofGeo = new T.ExtrudeGeometry(profile, {
    depth: roofLength,
    bevelEnabled: false,
    steps: 1,
  });
  roofGeo.translate(0, 0, -roofLength / 2);
  const roofMesh = new T.Mesh(roofGeo, [redMat, roofMat]);
  roofMesh.name = 'barn-gable-roof';
  barnGroup.add(roofMesh);

  // Eave fascia boards and rafter overhang trim along sides
  addBoxMesh(0.6, 0.6, roofLength, whiteTrim, -15.1, 14.7, 0, barnGroup);
  addBoxMesh(0.6, 0.6, roofLength, whiteTrim, 15.1, 14.7, 0, barnGroup);

  // Gable end rake trim boards framing roof edge (front & back)
  for (const zGable of [-roofLength / 2, roofLength / 2]) {
    const length = Math.hypot(15.4, 6);
    const left = addBoxMesh(
      length,
      0.5,
      0.6,
      whiteTrim,
      -7.7,
      18,
      zGable,
      barnGroup,
    );
    left.rotation.z = Math.atan2(6, 15.4);
    const right = addBoxMesh(
      length,
      0.5,
      0.6,
      whiteTrim,
      7.7,
      18,
      zGable,
      barnGroup,
    );
    right.rotation.z = -Math.atan2(6, 15.4);
  }

  // 3. Open Drive-Through Breezeway Portals & Parked Sliding Barn Doors with Cross Bracing
  // Front Portal (Z = 22.4)
  // Overhead sliding door track
  addBoxMesh(28.0, 0.45, 0.6, whiteTrim, 0, 11.0, 22.5, barnGroup);
  // Header lintel over opening
  addBoxMesh(19.2, 0.6, 0.8, whiteTrim, 0, 10.6, 22.4, barnGroup);
  // Side jamb posts
  addBoxMesh(0.6, 10.6, 0.8, whiteTrim, -9.3, 5.3, 22.4, barnGroup);
  addBoxMesh(0.6, 10.6, 0.8, whiteTrim, 9.3, 5.3, 22.4, barnGroup);

  // Sliding barn doors rolled open to the sides
  // Left door
  addBoxMesh(4.6, 10.2, 0.4, darkMat, -11.7, 5.3, 22.3, barnGroup);
  const leftX1 = addBoxMesh(
    0.45,
    11.0,
    0.6,
    whiteTrim,
    -11.7,
    5.3,
    22.5,
    barnGroup,
  );
  leftX1.rotation.z = 0.45;
  const leftX2 = addBoxMesh(
    0.45,
    11.0,
    0.6,
    whiteTrim,
    -11.7,
    5.3,
    22.5,
    barnGroup,
  );
  leftX2.rotation.z = -0.45;

  // Right door
  addBoxMesh(4.6, 10.2, 0.4, darkMat, 11.7, 5.3, 22.3, barnGroup);
  const rightX1 = addBoxMesh(
    0.45,
    11.0,
    0.6,
    whiteTrim,
    11.7,
    5.3,
    22.5,
    barnGroup,
  );
  rightX1.rotation.z = 0.45;
  const rightX2 = addBoxMesh(
    0.45,
    11.0,
    0.6,
    whiteTrim,
    11.7,
    5.3,
    22.5,
    barnGroup,
  );
  rightX2.rotation.z = -0.45;

  // Rear Portal (Z = -22.4) - open breezeway portal framing
  addBoxMesh(28.0, 0.45, 0.6, whiteTrim, 0, 11.0, -22.5, barnGroup);
  addBoxMesh(19.2, 0.6, 0.8, whiteTrim, 0, 10.6, -22.4, barnGroup);
  addBoxMesh(0.6, 10.6, 0.8, whiteTrim, -9.3, 5.3, -22.4, barnGroup);
  addBoxMesh(0.6, 10.6, 0.8, whiteTrim, 9.3, 5.3, -22.4, barnGroup);

  // 4. Upper Hayloft Door & Hoist Beam Hood
  // Loft door
  addBoxMesh(4.2, 4.8, 0.4, darkMat, 0, 16.5, 22.2, barnGroup);
  addBoxMesh(4.8, 0.4, 0.6, whiteTrim, 0, 19.0, 22.4, barnGroup);
  addBoxMesh(0.4, 5.0, 0.6, whiteTrim, -2.2, 16.5, 22.4, barnGroup);
  addBoxMesh(0.4, 5.0, 0.6, whiteTrim, 2.2, 16.5, 22.4, barnGroup);
  // Loft door cross brace
  const loftX = addBoxMesh(0.35, 5.8, 0.5, whiteTrim, 0, 16.5, 22.5, barnGroup);
  loftX.rotation.z = 0.52;

  // Hayloft hoist beam projecting past roof peak
  addBoxMesh(0.6, 0.6, 4.2, whiteTrim, 0, 21.6, 24.2, barnGroup);

  // 5. Multi-pane Windows on Rear Gable and Side Walls
  // Rear gable window (6-pane: 2x3)
  addMultiPaneWindow(
    4.2,
    4.8,
    2,
    3,
    whiteTrim,
    darkMat,
    0,
    16.5,
    -22.2,
    Math.PI,
    barnGroup,
  );
  // Side wall multi-pane windows (4-pane: 2x2)
  addMultiPaneWindow(
    3.2,
    3.2,
    2,
    2,
    whiteTrim,
    darkMat,
    -14.15,
    8.0,
    -8.0,
    -Math.PI / 2,
    barnGroup,
  );
  addMultiPaneWindow(
    3.2,
    3.2,
    2,
    2,
    whiteTrim,
    darkMat,
    -14.15,
    8.0,
    8.0,
    -Math.PI / 2,
    barnGroup,
  );
  addMultiPaneWindow(
    3.2,
    3.2,
    2,
    2,
    whiteTrim,
    darkMat,
    14.15,
    8.0,
    -8.0,
    Math.PI / 2,
    barnGroup,
  );
  addMultiPaneWindow(
    3.2,
    3.2,
    2,
    2,
    whiteTrim,
    darkMat,
    14.15,
    8.0,
    8.0,
    Math.PI / 2,
    barnGroup,
  );

  // 6. Roof Ridge Ventilator Cupola
  addBoxMesh(3.8, 3.0, 3.8, whiteTrim, 0, 22.4, 0, barnGroup);
  // Louver slats inset
  addBoxMesh(2.6, 1.8, 4.0, darkMat, 0, 22.4, 0, barnGroup);
  // Overhanging cupola roof cap
  const cupolaRoofGeo = new T.ConeGeometry(3.0, 1.8, 4);
  const cupolaRoof = new T.Mesh(cupolaRoofGeo, roofMat);
  cupolaRoof.position.set(0, 24.8, 0);
  cupolaRoof.rotation.y = Math.PI / 4;
  barnGroup.add(cupolaRoof);
}

/**
 * Builds an architecturally enhanced galvanized grain silo featuring:
 * - Galvanized steel cylinder body and hemispherical dome roof
 * - Foundation anchor base ring and structural retention hoops
 * - Exterior vertical service ladder with safety cage rings and rungs
 * - Roof discharge cupola / ventilator cap
 * - Pneumatic fill chute pipe running to dome hatch
 *
 * @param parent - Target group to attach silo assembly
 * @param siloMat - Galvanized silo sheet metal material
 * @param metalTrim - Accent metal material for trim, hoops, and ladder
 * @param x - World X position
 * @param z - World Z position
 */
export function buildEnhancedSilo(
  parent: T.Group,
  siloMat: T.Material,
  metalTrim: T.Material,
  x: number,
  z: number,
): void {
  const siloGroup = new T.Group();
  siloGroup.position.set(x, 0, z);
  parent.add(siloGroup);

  const radius = 8.0;
  const cylinderHeight = 27.0;

  // 1. Concrete / Heavy Steel Foundation Ring Base
  const baseMesh = new T.Mesh(
    new T.CylinderGeometry(radius + 0.4, radius + 0.4, 1.2, 24),
    metalTrim,
  );
  baseMesh.position.set(0, 0.6, 0);
  siloGroup.add(baseMesh);

  // 2. Main Galvanized Cylinder Body
  const cylinderMesh = new T.Mesh(
    new T.CylinderGeometry(radius, radius, cylinderHeight, 24),
    siloMat,
  );
  cylinderMesh.position.set(0, cylinderHeight / 2, 0);
  siloGroup.add(cylinderMesh);

  // 3. Galvanized Dome Roof
  const domeMesh = new T.Mesh(
    new T.SphereGeometry(radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    siloMat,
  );
  domeMesh.position.set(0, cylinderHeight, 0);
  siloGroup.add(domeMesh);

  // 4. Silo Cupola / Ventilator Cap at Top of Dome
  const cupolaBase = new T.Mesh(
    new T.CylinderGeometry(1.6, 1.8, 1.4, 16),
    metalTrim,
  );
  cupolaBase.position.set(0, cylinderHeight + radius + 0.7, 0);
  siloGroup.add(cupolaBase);

  const cupolaCap = new T.Mesh(new T.ConeGeometry(2.1, 1.1, 16), metalTrim);
  cupolaCap.position.set(0, cylinderHeight + radius + 1.8, 0);
  siloGroup.add(cupolaCap);

  // 5. Structural Steel Retention Hoops
  const hoopHeights = [5.5, 11.0, 16.5, 22.0];
  for (const h of hoopHeights) {
    const hoop = new T.Mesh(
      new T.CylinderGeometry(radius + 0.08, radius + 0.08, 0.28, 24),
      metalTrim,
    );
    hoop.position.set(0, h, 0);
    siloGroup.add(hoop);
  }

  // 6. Silo Exterior Access Ladder & Safety Cage
  const ladderZ = radius + 0.35;
  const ladderWidth = 1.1;
  const ladderHeight = cylinderHeight + 1.5;

  // Left & Right Ladder Rails
  addBoxMesh(
    0.12,
    ladderHeight,
    0.12,
    metalTrim,
    -ladderWidth / 2,
    ladderHeight / 2,
    ladderZ,
    siloGroup,
  );
  addBoxMesh(
    0.12,
    ladderHeight,
    0.12,
    metalTrim,
    ladderWidth / 2,
    ladderHeight / 2,
    ladderZ,
    siloGroup,
  );

  // Ladder Rungs spaced every 0.9m
  for (let rungY = 1.0; rungY <= ladderHeight; rungY += 0.9) {
    addBoxMesh(
      ladderWidth,
      0.08,
      0.08,
      metalTrim,
      0,
      rungY,
      ladderZ,
      siloGroup,
    );
  }

  // Ladder Safety Cage Arches (from y=12 to y=27)
  for (let cageY = 12.0; cageY <= cylinderHeight; cageY += 3.5) {
    const arch = new T.Mesh(
      new T.CylinderGeometry(1.0, 1.0, 0.14, 12, 1, true, 0, Math.PI),
      metalTrim,
    );
    arch.position.set(0, cageY, ladderZ + 0.45);
    arch.rotation.y = -Math.PI / 2;
    siloGroup.add(arch);
  }

  // 7. Blower / Fill Pipe running along side into dome
  const pipeMesh = new T.Mesh(
    new T.CylinderGeometry(0.32, 0.32, cylinderHeight + 2.5, 12),
    metalTrim,
  );
  pipeMesh.position.set(
    radius * 0.4,
    (cylinderHeight + 2.5) / 2,
    radius * 0.94,
  );
  siloGroup.add(pipeMesh);
}

/**
 * Builds an architecturally enhanced traditional farmhouse featuring:
 * - Painted drop-lap clapboard walls with corner trim boards and foundation
 * - Overhanging pitched roof with eave overhangs, rafter soffits, and fascia trim
 * - Front covered porch with raised deck platform, support posts, and porch roof
 * - Multi-pane window frames with reflective glass panes and muntin grid sashes
 * - Front entry door with casing
 * - Roof ridge chimney
 *
 * @param parent - Target group to attach farmhouse
 * @param wallMat - Clapboard siding material
 * @param roofMat - Corrugated / shingle roof material
 * @param glassMat - Reflective window glass material
 * @param whiteTrim - Trim board material
 */
export function buildEnhancedHouse(
  parent: T.Group,
  wallMat: T.Material,
  roofMat: T.Material,
  glassMat: T.Material,
  whiteTrim: T.Material,
): void {
  const houseGroup = new T.Group();
  houseGroup.position.set(-36, 0, 10);
  parent.add(houseGroup);

  const houseWidth = 18.0;
  const houseHeight = 10.0;
  const houseDepth = 16.0;

  // 1. Foundation Base Skirting
  addBoxMesh(
    houseWidth + 0.6,
    0.8,
    houseDepth + 0.6,
    whiteTrim,
    0,
    0.4,
    0,
    houseGroup,
  );

  // 2. Main Clapboard House Body
  addBoxMesh(
    houseWidth,
    houseHeight,
    houseDepth,
    wallMat,
    0,
    houseHeight / 2,
    0,
    houseGroup,
  );

  // 3. Corner Board Trim Posts on all 4 corners
  const halfW = houseWidth / 2;
  const halfD = houseDepth / 2;
  const cornerSize = 0.55;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBoxMesh(
        cornerSize,
        houseHeight,
        cornerSize,
        whiteTrim,
        sx * (halfW - cornerSize / 2),
        houseHeight / 2,
        sz * (halfD - cornerSize / 2),
        houseGroup,
      );
    }
  }

  // 4. Overhanging Pitched Roof with Rafter Overhangs and Fascia
  const roofPitch = 0.62;
  const roofPlaneW = 12.8;
  const roofPlaneL = houseDepth + 3.2; // 1.6m eave overhang on gable ends

  // Left roof plane
  const leftRoof = addBoxMesh(
    roofPlaneW,
    0.6,
    roofPlaneL,
    roofMat,
    -4.3,
    12.2,
    0,
    houseGroup,
  );
  leftRoof.rotation.z = roofPitch;

  // Right roof plane
  const rightRoof = addBoxMesh(
    roofPlaneW,
    0.6,
    roofPlaneL,
    roofMat,
    4.3,
    12.2,
    0,
    houseGroup,
  );
  rightRoof.rotation.z = -roofPitch;

  // Eave fascia trim boards
  addBoxMesh(0.45, 0.45, roofPlaneL, whiteTrim, -9.6, 9.4, 0, houseGroup);
  addBoxMesh(0.45, 0.45, roofPlaneL, whiteTrim, 9.6, 9.4, 0, houseGroup);

  // Gable rake trims (front & back)
  for (const zGable of [-roofPlaneL / 2, roofPlaneL / 2]) {
    const rkLeft = addBoxMesh(
      0.45,
      12.5,
      0.45,
      whiteTrim,
      -4.6,
      12.4,
      zGable,
      houseGroup,
    );
    rkLeft.rotation.z = roofPitch;
    const rkRight = addBoxMesh(
      0.45,
      12.5,
      0.45,
      whiteTrim,
      4.6,
      12.4,
      zGable,
      houseGroup,
    );
    rkRight.rotation.z = -roofPitch;
  }

  // 5. Covered Front Porch
  const porchWidth = 12.0;
  const porchDepth = 4.0;
  const porchZ = halfD + porchDepth / 2;

  // Porch raised deck platform
  addBoxMesh(
    porchWidth,
    0.5,
    porchDepth,
    whiteTrim,
    0,
    0.45,
    porchZ,
    houseGroup,
  );

  // Porch vertical support posts
  const postSpacing = 3.6;
  const postHeight = 4.8;
  for (let i = -1.5; i <= 1.5; i += 1.0) {
    addBoxMesh(
      0.36,
      postHeight,
      0.36,
      whiteTrim,
      i * postSpacing,
      postHeight / 2 + 0.45,
      halfD + porchDepth - 0.25,
      houseGroup,
    );
  }

  // Porch roof overhang
  const porchRoof = addBoxMesh(
    porchWidth + 0.8,
    0.35,
    porchDepth + 0.6,
    roofMat,
    0,
    postHeight + 0.6,
    porchZ,
    houseGroup,
  );
  porchRoof.rotation.x = 0.08;

  // 6. Multi-pane Windows (Frames, Muntins, Reflective Glass)
  // Front lower windows (left and right of front door, 4-pane: 2x2)
  addMultiPaneWindow(
    2.6,
    3.2,
    2,
    2,
    whiteTrim,
    glassMat,
    -4.8,
    3.8,
    halfD + 0.05,
    0,
    houseGroup,
  );
  addMultiPaneWindow(
    2.6,
    3.2,
    2,
    2,
    whiteTrim,
    glassMat,
    4.8,
    3.8,
    halfD + 0.05,
    0,
    houseGroup,
  );

  // Front upper windows (second story dormers/sashes, 6-pane: 2x3)
  addMultiPaneWindow(
    2.4,
    3.0,
    2,
    3,
    whiteTrim,
    glassMat,
    -4.8,
    8.0,
    halfD + 0.05,
    0,
    houseGroup,
  );
  addMultiPaneWindow(
    2.4,
    3.0,
    2,
    3,
    whiteTrim,
    glassMat,
    4.8,
    8.0,
    halfD + 0.05,
    0,
    houseGroup,
  );

  // Side multi-pane windows
  addMultiPaneWindow(
    2.6,
    3.2,
    2,
    2,
    whiteTrim,
    glassMat,
    -halfW - 0.05,
    4.0,
    0,
    -Math.PI / 2,
    houseGroup,
  );
  addMultiPaneWindow(
    2.6,
    3.2,
    2,
    2,
    whiteTrim,
    glassMat,
    halfW + 0.05,
    4.0,
    0,
    Math.PI / 2,
    houseGroup,
  );

  // 7. Front Entry Door
  addBoxMesh(2.2, 4.2, 0.15, wallMat, 0, 2.3, halfD + 0.02, houseGroup);
  // Door casing trim
  addBoxMesh(2.5, 0.25, 0.25, whiteTrim, 0, 4.45, halfD + 0.08, houseGroup);
  addBoxMesh(0.25, 4.4, 0.25, whiteTrim, -1.2, 2.3, halfD + 0.08, houseGroup);
  addBoxMesh(0.25, 4.4, 0.25, whiteTrim, 1.2, 2.3, halfD + 0.08, houseGroup);

  // 8. Chimney on Roof Ridge
  addBoxMesh(1.8, 5.0, 1.8, whiteTrim, 4.0, 13.5, -2.0, houseGroup);
  addBoxMesh(2.2, 0.4, 2.2, roofMat, 4.0, 16.1, -2.0, houseGroup);
}
