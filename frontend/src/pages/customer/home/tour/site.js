// Khu đất: lối đi trục chính, hồ phản chiếu, bãi cỏ, hàng cây và thành phố mờ trong sương phía xa.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { PLAN } from './plan.js';

const FAR = 700;

const waterShader = {
  name: 'TourWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uFogDensity: { value: 0 },
    uFogColor: { value: new THREE.Color() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vReflect;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vReflect = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 color;
    uniform float uTime;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    varying vec4 vReflect;
    varying vec3 vWorld;
    void main() {
      vec2 p = vWorld.xz;
      vec2 ripple = vec2(
        sin(p.x * 1.2 + uTime * 0.55) + 0.6 * sin(p.y * 2.3 - uTime * 0.4) + 0.3 * sin((p.x + p.y) * 4.1 + uTime * 0.9),
        cos(p.y * 1.6 + uTime * 0.5) + 0.6 * cos(p.x * 2.5 + uTime * 0.33) + 0.3 * cos((p.x - p.y) * 4.6 - uTime * 0.8)
      );
      vec4 uv = vReflect;
      uv.xy += ripple * 0.0028 * uv.w;
      vec3 reflection = texture2DProj(tDiffuse, uv).rgb;
      vec3 view = cameraPosition - vWorld;
      float distanceToCamera = length(view);
      float facing = max(normalize(view).y, 0.0);
      float fresnel = 0.28 + 0.72 * pow(1.0 - facing, 3.0);
      vec3 result = mix(color, reflection, fresnel);
      float fog = 1.0 - exp(-uFogDensity * uFogDensity * distanceToCamera * distanceToCamera);
      gl_FragColor = vec4(mix(result, uFogColor, fog), 1.0);
    }
  `,
};

function buildWater(tier, materials) {
  const { x0, x1, z0, z1, y } = PLAN.pool;
  const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const place = (mesh) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    return mesh;
  };
  if (!tier.reflection) {
    const material = new THREE.MeshStandardMaterial({ color: '#3f7f86', roughness: 0.08, envMap: materials.environment, envMapIntensity: 1.3 });
    return { mesh: place(new THREE.Mesh(geometry, material)), update() {}, dispose: () => material.dispose() };
  }
  const reflector = new Reflector(geometry, {
    textureWidth: tier.reflection,
    textureHeight: Math.round(tier.reflection * 0.6),
    clipBias: 0.002,
    multisample: 0,
    color: new THREE.Color('#2f6f76'),
    shader: waterShader,
  });
  const { uniforms } = reflector.material;
  return {
    mesh: place(reflector),
    update(time, fog) {
      uniforms.uTime.value = time;
      uniforms.uFogDensity.value = fog.density;
      uniforms.uFogColor.value.copy(fog.color);
    },
    dispose: () => reflector.dispose(),
  };
}

function buildCity(kit, material, detail, random) {
  const blocks = Math.round(46 * detail);
  for (let i = 0; i < blocks; i += 1) {
    const side = i % 2 ? 1 : -1;
    const x = side * (120 + random() * 260);
    const z = -110 - random() * 280 + Math.abs(x) * 0.2;
    const height = 14 + random() ** 1.7 * 46;
    const width = 10 + random() * 16;
    const depth = 10 + random() * 16;
    kit.box(material, [width, height, depth], [x, height / 2, z], { shadow: false });
  }
}

export function buildSite(group, { kit, materials: M, foliage, tier, random }) {
  const { x0, x1, z0, z1 } = PLAN.pool;
  const ground = (a, b) => kit.span(M.lawn, [a[0], -0.22, a[1]], [b[0], -0.02, b[1]], { shadow: false });
  ground([-FAR, -FAR], [x0 - 0.5, FAR]);
  ground([x1 + 0.5, -FAR], [FAR, FAR]);
  ground([x0 - 0.5, z1 + 0.5], [x1 + 0.5, FAR]);
  ground([x0 - 0.5, -FAR], [x1 + 0.5, z0 - 0.5]);

  // Sân trước và lối đi trục chính
  kit.span(M.pavers, [-24, -0.2, -2], [24, 0.012, 5.4], { shadow: false });
  kit.span(M.pavers, [-3.3, -0.2, 5.4], [3.3, 0.012, 74], { shadow: false });

  // Bờ hồ bằng đá
  const coping = 0.5;
  kit.span(M.stone, [x0 - coping, -0.3, z0 - coping], [x1 + coping, 0.05, z0], { shadow: true });
  kit.span(M.stone, [x0 - coping, -0.3, z1], [x1 + coping, 0.05, z1 + coping], { shadow: true });
  kit.span(M.stone, [x0 - coping, -0.3, z0], [x0, 0.05, z1], { shadow: true });
  kit.span(M.stone, [x1, -0.3, z0], [x1 + coping, 0.05, z1], { shadow: true });

  // Bồn cây thấp chạy dọc lối đi, đèn sân vườn dẫn tới cửa
  kit.span(M.planter, [3.5, -0.1, 7], [4.5, 0.42, 36]);
  kit.span(M.soil, [3.58, 0.42, 7.08], [4.42, 0.44, 35.92], { shadow: false });
  for (let z = 8; z < 36; z += 1.3) foliage.shrub(4 + (random() - 0.5) * 0.28, 0.42, z, 0.62, 0.72);
  for (let z = 8; z <= 62; z += 7) {
    kit.cylinder(M.bronze, 0.05, 0.05, 0.72, [-3.05, 0.36, z], { segments: 12 });
    kit.cylinder(M.lampStrip, 0.052, 0.052, 0.06, [-3.05, 0.64, z], { segments: 12, shadow: false });
    kit.cylinder(M.bronze, 0.05, 0.05, 0.72, [3.05, 0.36, z], { segments: 12 });
    kit.cylinder(M.lampStrip, 0.052, 0.052, 0.06, [3.05, 0.64, z], { segments: 12, shadow: false });
  }

  for (let z = 9; z < 35; z += 2.2) foliage.shrub(x0 - 1.5 - random() * 0.6, -0.02, z, 0.8 + random() * 0.5, 0.62);
  for (let x = x0; x < x1; x += 2.4) foliage.shrub(x, -0.02, z1 + 1.4 + random() * 0.5, 0.8 + random() * 0.4, 0.55);
  for (let x = 5.6; x < 44; x += 1.9) foliage.shrub(x, -0.02, 62 + Math.sin(x * 0.4) * 1.2, 0.95, 0.8);

  [[13, 9, 7.4], [26, 22, 9.2], [33, 44, 10], [44, 30, 9.4], [-27, 13, 9.8], [-31, 34, 8.8], [-13, 46, 8.2], [50, 62, 10]]
    .forEach(([x, z, height]) => foliage.terminalia(kit, x, z, height));
  [[23.5, -3, 24], [25, -9.5, 22], [26, 3, 18], [-23.5, -2.5, 24], [-25, -9, 22], [-26.5, 3, 16]]
    .forEach(([x, z, culms]) => foliage.bamboo(kit, x, z, culms));

  buildCity(kit, M.city, tier.cityDetail, random);

  const water = buildWater(tier, M);
  group.add(water.mesh);
  return water;
}
