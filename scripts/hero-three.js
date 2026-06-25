import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const canvas = document.querySelector("[data-hero-three]");
const heroScreen = canvas?.closest(".hero-screen");
const downControl = document.querySelector(".scroll-cue");
const nextSection = document.querySelector("#flag-story");

if (!canvas || !heroScreen) {
  throw new Error("Hero Three canvas was not found.");
}

function getHeroSize() {
  const rect = heroScreen.getBoundingClientRect();

  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

const initialSize = getHeroSize();

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const isSmallScreen = window.matchMedia("(max-width: 720px)").matches;
const forceLite = new URLSearchParams(window.location.search).has("lite");
const lowMemory =
  navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4;
const fewCores =
  navigator.hardwareConcurrency !== undefined &&
  navigator.hardwareConcurrency <= 4;
const lowPower =
  forceLite || prefersReducedMotion || isSmallScreen || lowMemory || fewCores;

const quality = {
  terrainCount: lowPower ? 42000 : 98000,
  dustCount: lowPower ? 1800 : 4200,
  traceCount: lowPower ? 360 : 820,
  pixelRatio: Math.min(window.devicePixelRatio || 1, lowPower ? 1.35 : 1.8),
  depth: lowPower ? 148 : 186,
  width: lowPower ? 72 : 96,
};

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120b08, lowPower ? 0.018 : 0.014);

const camera = new THREE.PerspectiveCamera(
  isSmallScreen ? 70 : 64,
  initialSize.width / initialSize.height,
  0.1,
  260,
);
camera.position.set(0, 3.1, 8);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(quality.pixelRatio);
renderer.setSize(initialSize.width, initialSize.height, false);
renderer.setClearColor(0x100a08, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const clock = new THREE.Clock();
const pointer = new THREE.Vector2();
const smoothPointer = new THREE.Vector2();
let scrollBoost = 0;
let flight = 0;
let composer = null;
let bloom = null;
let grainPass = null;
let terrain = null;
let dust = null;
let traces = null;
let speedEnergy = 0;
let cameraGroundY = 3.18;
let smoothSpeedMultiplier = 1.45;
let smoothTurn = 0;

function bindEvents() {
  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", (event) => {
    const rect = heroScreen.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - 0.5) * 2;
    pointer.y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - 0.5) * 2;
  });
  window.addEventListener(
    "wheel",
    (event) => {
      scrollBoost = Math.min(3.4, scrollBoost + Math.abs(event.deltaY) * 0.0018);
    },
    { passive: true },
  );
  downControl?.addEventListener("click", () => {
    nextSection?.scrollIntoView({ behavior: "smooth" });
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      clock.getDelta();
    }
  });
}

function setupPostProcessing() {
  const size = getHeroSize();

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  bloom = new UnrealBloomPass(
    new THREE.Vector2(size.width, size.height),
    lowPower ? 0.42 : 0.68,
    lowPower ? 0.42 : 0.56,
    lowPower ? 0.22 : 0.16,
  );
  composer.addPass(bloom);

  grainPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uResolution: {
        value: new THREE.Vector2(size.width, size.height),
      },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform vec2 uResolution;
      varying vec2 vUv;

      float random(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      void main() {
        vec2 center = vUv - 0.5;
        float edge = length(center);
        vec2 offset = center * edge * 0.0018;

        vec4 base = texture2D(tDiffuse, vUv);
        float red = texture2D(tDiffuse, vUv + offset).r;
        float blue = texture2D(tDiffuse, vUv - offset).b;
        vec3 color = vec3(red, base.g, blue);

        float vignette = smoothstep(0.92, 0.18, edge);
        float grain = random(vUv * uResolution + uTime * 38.0) - 0.5;
        color += grain * 0.028;
        color *= mix(0.64, 1.08, vignette);
        color += vec3(0.045, 0.025, 0.008) * smoothstep(0.7, 0.05, edge);

        gl_FragColor = vec4(color, base.a);
      }
    `,
  });
  composer.addPass(grainPass);
}

function createTerrainPoints() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(quality.terrainCount * 3);
  const seeds = new Float32Array(quality.terrainCount);
  const bands = new Float32Array(quality.terrainCount);

  for (let i = 0; i < quality.terrainCount; i += 1) {
    const i3 = i * 3;
    const depth = Math.random() * quality.depth;
    const normalizedDepth = depth / quality.depth;
    const centerBias = Math.pow(Math.random(), 0.62);
    const side = Math.random() < 0.5 ? -1 : 1;
    const width = quality.width * (0.26 + normalizedDepth * 0.74);

    positions[i3] = side * centerBias * width + (Math.random() - 0.5) * 1.8;
    positions[i3 + 1] = 0;
    positions[i3 + 2] = depth;
    seeds[i] = Math.random();
    bands[i] = Math.random();
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aBand", new THREE.BufferAttribute(bands, 1));

  return new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: sharedUniforms({
        uDepth: quality.depth,
        uWidth: quality.width,
        uPointScale: lowPower ? 2.4 : 2.8,
      }),
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function createDustLayer() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(quality.dustCount * 3);
  const seeds = new Float32Array(quality.dustCount);

  for (let i = 0; i < quality.dustCount; i += 1) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * quality.width * 1.55;
    positions[i3 + 1] = Math.random() * 15 - 2.5;
    positions[i3 + 2] = Math.random() * quality.depth;
    seeds[i] = Math.random();
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

  return new THREE.Points(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: sharedUniforms({
        uDepth: quality.depth,
        uWidth: quality.width,
        uPointScale: lowPower ? 1.7 : 2.1,
      }),
      vertexShader: dustVertexShader,
      fragmentShader: dustFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function createTraceLayer() {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = quality.traceCount * 2;
  const positions = new Float32Array(vertexCount * 3);
  const seeds = new Float32Array(vertexCount);
  const traceInfo = new Float32Array(vertexCount * 2);

  for (let i = 0; i < quality.traceCount; i += 1) {
    const depth = Math.random() * quality.depth;
    const widthAtDepth = quality.width * (0.16 + (depth / quality.depth) * 0.68);
    const center = (Math.random() - 0.5) * widthAtDepth * 1.5;
    const length = 0.8 + Math.random() * 7.5;
    const seed = Math.random();

    for (let p = 0; p < 2; p += 1) {
      const index = i * 2 + p;
      const i3 = index * 3;
      const side = p === 0 ? -0.5 : 0.5;

      positions[i3] = center + side * length;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = depth;
      seeds[index] = seed;
      traceInfo[index * 2] = p;
      traceInfo[index * 2 + 1] = length;
    }
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aTrace", new THREE.BufferAttribute(traceInfo, 2));

  return new THREE.LineSegments(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: sharedUniforms({
        uDepth: quality.depth,
        uWidth: quality.width,
        uPointScale: 1,
      }),
      vertexShader: traceVertexShader,
      fragmentShader: traceFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function sharedUniforms(overrides = {}) {
  return {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uDepth: { value: overrides.uDepth ?? quality.depth },
    uWidth: { value: overrides.uWidth ?? quality.width },
    uPointScale: { value: overrides.uPointScale ?? 4 },
    uPixelRatio: { value: quality.pixelRatio },
  };
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  const baseSpeed = prefersReducedMotion ? 1.9 : 7.6;
  const speedProfile = getFlightSpeed(elapsed, flight);
  smoothSpeedMultiplier = THREE.MathUtils.damp(
    smoothSpeedMultiplier,
    speedProfile.multiplier,
    1.55,
    delta,
  );
  speedEnergy = THREE.MathUtils.damp(
    speedEnergy,
    speedProfile.energy,
    2.15,
    delta,
  );

  scrollBoost = THREE.MathUtils.damp(scrollBoost, 0, 2.85, delta);
  flight += delta * (baseSpeed * smoothSpeedMultiplier + scrollBoost * 9.4);

  smoothPointer.x = THREE.MathUtils.damp(smoothPointer.x, pointer.x, 3.2, delta);
  smoothPointer.y = THREE.MathUtils.damp(smoothPointer.y, pointer.y, 3.2, delta);

  smoothTurn = THREE.MathUtils.damp(
    smoothTurn,
    getFlightTurn(elapsed, flight),
    1.25,
    delta,
  );
  const turn = smoothTurn;
  const lateral = turn * (isSmallScreen ? 4.6 : 7.4);
  const lookLateral =
    turn * (isSmallScreen ? 11.5 : 18.5) +
    Math.sin(flight * 0.036 + elapsed * 0.08) * (isSmallScreen ? 1.8 : 3.6);
  const sampledGround =
    duneHeight2D(lateral + smoothPointer.x * 1.8, flight * 0.96 + 25) - 6.75;
  const targetGroundY = sampledGround + 4.15 + speedEnergy * 0.68;
  cameraGroundY = THREE.MathUtils.damp(cameraGroundY, targetGroundY, 1.28, delta);

  camera.position.x = lateral + smoothPointer.x * 0.78;
  camera.position.y =
    cameraGroundY +
    smoothPointer.y * -0.26 +
    Math.sin(elapsed * 0.42) * 0.12;
  camera.position.z = 8 - speedEnergy * 1.25 + Math.sin(elapsed * 0.24) * 0.28;
  camera.lookAt(
    lookLateral + smoothPointer.x * 2.1,
    -0.96 + smoothPointer.y * -0.44,
    -58,
  );
  camera.rotation.z += turn * -0.085 + smoothPointer.x * -0.018;

  updateUniforms(terrain, elapsed, flight);
  updateUniforms(dust, elapsed, flight);
  updateUniforms(traces, elapsed, flight);

  if (bloom) {
    bloom.strength =
      (lowPower ? 0.42 : 0.68) + Math.sin(elapsed * 0.36) * 0.035;
  }
  if (grainPass) {
    grainPass.uniforms.uTime.value = elapsed;
  }

  if (composer) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}

function getFlightSpeed(time, distance) {
  const longPulse = Math.pow(Math.sin(time * 0.24 + 0.6) * 0.5 + 0.5, 1.55);
  const secondPulse = Math.pow(
    Math.sin(time * 0.48 + distance * 0.016) * 0.5 + 0.5,
    2.2,
  );
  const broadSurge = Math.pow(
    Math.sin(time * 0.92 + distance * 0.026 + 1.7) * 0.5 + 0.5,
    3.4,
  );
  const slowPocket = Math.pow(Math.sin(time * 0.16 + 2.1) * 0.5 + 0.5, 6.0);
  const multiplier = THREE.MathUtils.clamp(
    0.98 + longPulse * 0.92 + secondPulse * 0.68 + broadSurge * 0.48 - slowPocket * 0.1,
    0.92,
    2.72,
  );

  return {
    multiplier,
    energy: THREE.MathUtils.clamp((multiplier - 0.78) / 2.12, 0, 1),
  };
}

function getFlightTurn(time, distance) {
  const wideTurn = Math.sin(distance * 0.0085 + Math.sin(time * 0.055) * 1.35);
  const counterTurn = Math.sin(distance * 0.018 + 2.4) * 0.34;
  const wandering = Math.sin(time * 0.11 + Math.sin(time * 0.034) * 2.0) * 0.18;

  return THREE.MathUtils.clamp(wideTurn * 0.72 + counterTurn + wandering, -1, 1);
}

function hash2D(x, y) {
  let px = x * 123.34;
  let py = y * 456.21;
  px = px - Math.floor(px);
  py = py - Math.floor(py);
  const dot = px * (px + 45.32) + py * (py + 45.32);
  px += dot;
  py += dot;
  return px * py - Math.floor(px * py);
}

function noise2D(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  const x1 = THREE.MathUtils.lerp(a, b, fx);
  const x2 = THREE.MathUtils.lerp(c, d, fx);
  return THREE.MathUtils.lerp(x1, x2, fy);
}

function fbm2D(x, y) {
  let value = 0;
  let amplitude = 0.5;
  let px = x;
  let py = y;

  for (let i = 0; i < 5; i += 1) {
    value += amplitude * noise2D(px, py);
    const rx = px * 0.82 - py * 0.57;
    const ry = px * 0.57 + py * 0.82;
    px = rx * 2.02 + 11.7;
    py = ry * 2.02 + 11.7;
    amplitude *= 0.5;
  }

  return value;
}

function smoothstep(edge0, edge1, value) {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function duneHeight2D(x, y) {
  const broad = fbm2D(x * 0.018, y * 0.026);
  const wind = Math.sin(y * 0.112 + broad * 6.4 + Math.sin(x * 0.035) * 1.7);
  const dune = Math.pow(Math.max(0, wind * 0.5 + 0.5), 2.2) * 8.4;
  const ridgeA =
    Math.pow(1 - Math.abs(Math.sin(y * 0.078 + x * 0.042 + broad * 4.0)), 4.2) *
    5.4;
  const ridgeB =
    Math.pow(1 - Math.abs(Math.sin(y * 0.142 - x * 0.031 + broad * 5.8)), 6.0) *
    2.7;
  const rough = fbm2D(x * 0.095, y * 0.075) * 2.4;
  const centerValley = 1 - smoothstep(10.0, 42.0, Math.abs(x));
  const sideMass = smoothstep(2.0, 18.0, Math.abs(x));
  const mountainWindow = smoothstep(0.4, 0.72, fbm2D(y * 0.013, 6.7));
  const serration = Math.pow(
    1 - Math.abs(Math.sin(x * 0.058 + y * 0.036 + broad * 6.2)),
    2.8,
  );
  const brokenPeak = Math.pow(fbm2D(x * 0.03 + 19.0, y * 0.046 + 19.0), 2.25);
  const centralRange =
    centerValley *
    smoothstep(0.52, 0.82, fbm2D(y * 0.017 + 4.3, x * 0.012)) *
    Math.pow(1 - Math.abs(Math.sin(x * 0.072 - y * 0.023 + broad * 4.8)), 3.1);
  const distantSpine = smoothstep(0.5, 0.82, fbm2D(y * 0.008 + 11.0, x * 0.004));
  const spinePeak = Math.pow(
    1 - Math.abs(Math.sin(x * 0.034 + y * 0.016 + broad * 5.0)),
    2.25,
  );
  const mountains =
    sideMass * mountainWindow * (serration * 24.0 + brokenPeak * 18.0) +
    centralRange * 13.5 +
    distantSpine * spinePeak * 12.5;

  return dune + ridgeA + ridgeB + rough + mountains;
}

function updateUniforms(object, elapsed, currentFlight) {
  const uniforms = object.material.uniforms;
  uniforms.uTime.value = elapsed;
  uniforms.uTravel.value = currentFlight;
}

function onResize() {
  const size = getHeroSize();

  camera.aspect = size.width / size.height;
  camera.fov = window.matchMedia("(max-width: 720px)").matches ? 72 : 64;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(size.width, size.height, false);

  composer?.setSize(size.width, size.height);
  if (bloom) {
    bloom.setSize(size.width, size.height);
  }
  if (grainPass) {
    grainPass.uniforms.uResolution.value.set(
      size.width,
      size.height,
    );
  }
}

const noiseFns = `
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotate = mat2(0.82, -0.57, 0.57, 0.82);

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotate * p * 2.02 + 11.7;
      amplitude *= 0.5;
    }

    return value;
  }

  float duneHeight(vec2 p) {
    float broad = fbm(p * vec2(0.018, 0.026));
    float wind = sin(p.y * 0.112 + broad * 6.4 + sin(p.x * 0.035) * 1.7);
    float dune = pow(max(0.0, wind * 0.5 + 0.5), 2.2) * 8.4;
    float ridgeA = pow(1.0 - abs(sin(p.y * 0.078 + p.x * 0.042 + broad * 4.0)), 4.2);
    float ridgeB = pow(1.0 - abs(sin(p.y * 0.142 - p.x * 0.031 + broad * 5.8)), 6.0);
    float rough = fbm(p * vec2(0.095, 0.075)) * 2.4;
    float centerValley = 1.0 - smoothstep(10.0, 42.0, abs(p.x));
    float sideMass = smoothstep(2.0, 18.0, abs(p.x));
    float mountainWindow = smoothstep(0.4, 0.72, fbm(vec2(p.y * 0.013, 6.7)));
    float serration = pow(
      1.0 - abs(sin(p.x * 0.058 + p.y * 0.036 + broad * 6.2)),
      2.8
    );
    float brokenPeak = pow(fbm(p * vec2(0.03, 0.046) + 19.0), 2.25);
    float centralRange =
      centerValley *
      smoothstep(0.52, 0.82, fbm(vec2(p.y * 0.017 + 4.3, p.x * 0.012))) *
      pow(1.0 - abs(sin(p.x * 0.072 - p.y * 0.023 + broad * 4.8)), 3.1);
    float distantSpine = smoothstep(0.5, 0.82, fbm(vec2(p.y * 0.008 + 11.0, p.x * 0.004)));
    float spinePeak = pow(
      1.0 - abs(sin(p.x * 0.034 + p.y * 0.016 + broad * 5.0)),
      2.25
    );
    float mountains =
      sideMass * mountainWindow * (serration * 24.0 + brokenPeak * 18.0) +
      centralRange * 13.5 +
      distantSpine * spinePeak * 12.5;

    return dune + ridgeA * 5.4 + ridgeB * 2.7 + rough + mountains;
  }

  float fieldDissolve(vec2 p, float seed, float time) {
    float veil = fbm(p * 0.035 + vec2(time * 0.045, seed * 9.0));
    float shimmer = noise(vec2(seed * 41.0, time * 0.9 + p.y * 0.025));
    return smoothstep(0.22, 0.86, veil * 0.78 + shimmer * 0.22);
  }
`;

const terrainVertexShader = `
  uniform float uTime;
  uniform float uTravel;
  uniform float uDepth;
  uniform float uWidth;
  uniform float uPointScale;
  uniform float uPixelRatio;
  attribute float aSeed;
  attribute float aBand;
  varying float vAlpha;
  varying float vGlow;
  varying float vHeight;
  varying float vDepth;
  ${noiseFns}

  void main() {
    float movedDepth = mod(position.z - uTravel + aSeed * 19.0, uDepth);
    float depth = movedDepth + 7.0;
    float worldZ = uTravel * 0.92 + depth + aSeed * 5.0;
    float spread = 0.45 + depth / uDepth * 0.88;
    float drift = sin(worldZ * 0.036 + aSeed * 19.0 + uTime * 0.18) * 0.68;
    float x = position.x * spread + drift;

    float height = duneHeight(vec2(x, worldZ));
    float breathe = sin(uTime * 0.82 + aSeed * 44.0 + height) * 0.055;
    float y = height - 6.75 + breathe;

    float farFade = 1.0 - smoothstep(uDepth * 0.66, uDepth, depth);
    float nearFade = smoothstep(2.0, 17.5, depth);
    float dissolve = fieldDissolve(vec2(x, worldZ), aSeed, uTime);
    float scanWave = smoothstep(
      0.22,
      1.0,
      sin(depth * 0.115 - uTime * 1.15 + aSeed * 8.0) * 0.5 + 0.5
    );
    float crest = smoothstep(5.8, 18.0, height);

    vAlpha = nearFade * farFade * (0.34 + dissolve * 0.72) * (0.7 + scanWave * 0.3);
    vGlow = crest * (0.42 + 0.58 * dissolve) + pow(aBand, 18.0) * 0.65;
    vHeight = clamp(height / 24.0, 0.0, 1.0);
    vDepth = depth / uDepth;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, -depth, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float perspective = 42.0 / max(11.0, -mvPosition.z);
    float sparkle = 0.74 + noise(vec2(aSeed * 91.0, uTime * 0.8)) * 0.58;
    gl_PointSize = uPointScale * uPixelRatio * perspective * (1.0 + vGlow * 1.7) * sparkle;
  }
`;

const terrainFragmentShader = `
  precision highp float;
  varying float vAlpha;
  varying float vGlow;
  varying float vHeight;
  varying float vDepth;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float core = smoothstep(0.48, 0.08, dist);
    float halo = smoothstep(0.52, 0.0, dist) * 0.42;
    if (core <= 0.001 && halo <= 0.001) discard;

    vec3 shadow = vec3(0.25, 0.12, 0.045);
    vec3 ochre = vec3(0.95, 0.48, 0.16);
    vec3 amber = vec3(1.0, 0.72, 0.32);
    vec3 ash = vec3(0.68, 0.52, 0.39);

    vec3 color = mix(shadow, ochre, vHeight);
    color = mix(color, amber, vGlow * 0.55);
    color = mix(color, ash, smoothstep(0.52, 1.0, vDepth) * 0.42);
    color += vec3(1.0, 0.55, 0.2) * vGlow * 0.34;

    float alpha = vAlpha * (core * 0.72 + halo * 0.82) * (1.0 - smoothstep(0.78, 1.0, vDepth) * 0.5);
    gl_FragColor = vec4(color, alpha);
  }
`;

const dustVertexShader = `
  uniform float uTime;
  uniform float uTravel;
  uniform float uDepth;
  uniform float uPointScale;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vAlpha;
  varying float vWarmth;
  ${noiseFns}

  void main() {
    float depth = mod(position.z - uTravel * 0.64 + aSeed * 37.0, uDepth) + 5.0;
    float worldZ = uTravel * 0.5 + depth + aSeed * 13.0;
    float gust = sin(uTime * 0.22 + aSeed * 20.0 + worldZ * 0.028);
    float x = position.x + gust * 2.1 + sin(uTime * 0.11 + aSeed * 31.0) * 1.2;
    float y = position.y + sin(uTime * 0.28 + aSeed * 15.0) * 0.42;

    float farFade = 1.0 - smoothstep(uDepth * 0.7, uDepth, depth);
    float nearFade = smoothstep(0.5, 11.0, depth);
    float pocket = fbm(vec2(x, worldZ) * 0.025 + uTime * 0.025);
    vAlpha = nearFade * farFade * smoothstep(0.1, 1.0, pocket) * 0.42;
    vWarmth = pocket;

    vec4 mvPosition = modelViewMatrix * vec4(x, y, -depth, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uPointScale * uPixelRatio * (38.0 / max(10.0, -mvPosition.z)) * (0.6 + aSeed);
  }
`;

const dustFragmentShader = `
  precision highp float;
  varying float vAlpha;
  varying float vWarmth;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float dist = length(uv);
    float mote = smoothstep(0.5, 0.02, dist);
    vec3 color = mix(vec3(0.55, 0.36, 0.18), vec3(1.0, 0.76, 0.44), vWarmth);
    gl_FragColor = vec4(color, mote * vAlpha);
  }
`;

const traceVertexShader = `
  uniform float uTime;
  uniform float uTravel;
  uniform float uDepth;
  attribute float aSeed;
  attribute vec2 aTrace;
  varying float vAlpha;
  varying float vPulse;
  ${noiseFns}

  void main() {
    float depth = mod(position.z - uTravel * 0.84 + aSeed * 29.0, uDepth) + 10.0;
    float worldZ = uTravel * 0.76 + depth + aSeed * 7.0;
    float x = position.x + sin(worldZ * 0.026 + aSeed * 17.0 + uTime * 0.17) * 1.2;
    float height = duneHeight(vec2(x, worldZ)) - 6.55;
    float y = height + 0.08 + sin(aSeed * 18.0 + uTime * 0.4) * 0.04;

    float farFade = 1.0 - smoothstep(uDepth * 0.58, uDepth, depth);
    float nearFade = smoothstep(8.0, 28.0, depth);
    float pulse = smoothstep(
      0.1,
      0.88,
      sin(uTime * 0.72 + aSeed * 24.0 + depth * 0.07) * 0.5 + 0.5
    );

    vAlpha = nearFade * farFade * (0.08 + pulse * 0.34);
    vPulse = pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, -depth, 1.0);
  }
`;

const traceFragmentShader = `
  precision highp float;
  varying float vAlpha;
  varying float vPulse;

  void main() {
    vec3 bronze = vec3(0.93, 0.48, 0.16);
    vec3 hot = vec3(1.0, 0.78, 0.42);
    vec3 color = mix(bronze, hot, vPulse);
    gl_FragColor = vec4(color, vAlpha);
  }
`;

init();

function init() {
  terrain = createTerrainPoints();
  dust = createDustLayer();
  traces = createTraceLayer();

  scene.add(terrain);
  scene.add(dust);
  scene.add(traces);

  setupPostProcessing();
  bindEvents();
  heroScreen.classList.add("is-three-ready");
  animate();
}
