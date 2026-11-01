// Bầu trời sương sáng buổi sớm. Vẽ một lần vào cube map rồi dùng lại nên gần như không tốn gì mỗi khung hình,
// đồng thời cấp luôn ánh sáng môi trường và phản chiếu cho kính, nước, đồng thau.
import * as THREE from 'three';

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  varying vec3 vDirection;
  uniform vec3 sunDirection;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 d = normalize(vDirection);
    float h = max(d.y, 0.0);

    vec3 horizon = vec3(0.86, 0.90, 0.90);
    vec3 middle = vec3(0.70, 0.82, 0.86);
    vec3 zenith = vec3(0.42, 0.62, 0.72);
    vec3 color = mix(horizon, middle, smoothstep(0.0, 0.26, h));
    color = mix(color, zenith, smoothstep(0.2, 0.95, h));

    // Mây cao mỏng, kéo dài theo phương ngang.
    vec3 cloudPoint = vec3(d.x * 2.4, d.y * 7.0, d.z * 2.4) / (0.22 + h);
    float clouds = smoothstep(0.5, 0.82, fbm(cloudPoint + vec3(2.0, 0.0, 5.0)));
    clouds *= smoothstep(0.015, 0.2, h);
    color = mix(color, vec3(0.97, 0.975, 0.97), clouds * 0.62);

    float sun = max(dot(d, sunDirection), 0.0);
    color += vec3(1.0, 0.86, 0.66) * (pow(sun, 7.0) * 0.14 + pow(sun, 90.0) * 0.5 + pow(sun, 900.0) * 3.5);

    // Dưới đường chân trời hòa vào mặt đất mờ sương.
    color = mix(color, vec3(0.80, 0.85, 0.84), smoothstep(0.0, -0.05, d.y));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const FOG_COLOR = new THREE.Color(0.86, 0.9, 0.9);

export function createSky(renderer, sunDirection, size = 512) {
  const scene = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
      uniforms: { sunDirection: { value: sunDirection } },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
    }),
  );
  scene.add(dome);

  const cube = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter });
  new THREE.CubeCamera(0.1, 100, cube).update(renderer, scene);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(scene, 0.015, 0.1, 100);
  pmrem.dispose();
  dome.geometry.dispose();
  dome.material.dispose();

  return {
    background: cube.texture,
    environment: environment.texture,
    dispose() {
      cube.dispose();
      environment.dispose();
    },
  };
}
