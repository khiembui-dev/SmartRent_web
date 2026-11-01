// Bảng chất liệu của công trình. Vật liệu trong nhà nhận ít ánh sáng bầu trời hơn hẳn ngoài trời,
// nhờ vậy ánh nắng và đèn mới tạo được khối thay vì một màu phẳng.
import * as THREE from 'three';
import { PALETTE } from './plan.js';

const OUTDOOR_ENV = 0.56;
const INDOOR_ENV = 0.4;

export function createMaterials(textures, environment) {
  const made = [];
  const standard = (options, { uvSize = 1, env = OUTDOOR_ENV } = {}) => {
    const material = new THREE.MeshStandardMaterial({ envMap: environment, envMapIntensity: env, ...options });
    material.userData.uvSize = uvSize;
    made.push(material);
    return material;
  };

  const plasterOptions = { map: textures.plaster.map, normalMap: textures.plaster.normal, normalScale: new THREE.Vector2(0.24, 0.24), roughness: 0.92 };
  const paintOptions = { ...plasterOptions, normalScale: new THREE.Vector2(0.06, 0.06), roughness: 0.78 };

  const glass = new THREE.MeshPhysicalMaterial({
    color: '#cfe3e2', transparent: true, opacity: 0.15, roughness: 0.04, metalness: 0, envMap: environment, envMapIntensity: 1.15, depthWrite: false, side: THREE.DoubleSide,
  });
  made.push(glass);

  const materials = {
    plaster: standard(plasterOptions, { uvSize: 3 }),
    plasterIn: standard(paintOptions, { uvSize: 3, env: INDOOR_ENV }),
    slabEdge: standard({ ...plasterOptions, color: '#fbfaf6' }, { uvSize: 3 }),
    pavers: standard({ map: textures.pavers.map, normalMap: textures.pavers.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.78 }, { uvSize: 2.4 }),
    lawn: standard({ map: textures.lawn.map, roughness: 0.96 }, { uvSize: 7, env: 0.34 }),
    terrazzo: standard({ map: textures.terrazzo.map, roughness: 0.36 }, { uvSize: 1.5, env: 0.46 }),
    oak: standard({ map: textures.oak.map, roughness: 0.48 }, { uvSize: 1.6, env: INDOOR_ENV }),
    oakOut: standard({ map: textures.oak.map, roughness: 0.55 }, { uvSize: 1.6 }),
    stone: standard({ map: textures.stone.map, roughness: 0.74 }, { uvSize: 2.8 }),
    glaze: standard({ color: PALETTE.glaze, roughness: 0.3 }, {}),
    lacquer: standard({ color: PALETTE.door, roughness: 0.38 }, { env: 0.6 }),
    brass: standard({ color: '#b89a60', metalness: 1, roughness: 0.38 }, { env: 1 }),
    bronze: standard({ color: '#2b3a3c', metalness: 0.75, roughness: 0.42 }, {}),
    window: standard({ color: '#3f6f78', metalness: 0.9, roughness: 0.06 }, { env: 1.1 }),
    frosted: standard({ color: '#eef2ef', roughness: 0.5, emissive: PALETTE.lamp, emissiveIntensity: 0.2 }, {}),
    curtain: standard({ map: textures.linen.map, color: '#f3f1ea', roughness: 0.96 }, { uvSize: 0.4 }),
    sheer: new THREE.MeshStandardMaterial({ color: '#f6f4ee', roughness: 1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, envMap: environment, envMapIntensity: 0.3, depthWrite: false }),
    roomGlow: standard({ color: '#55574f', emissive: '#fff0dc', emissiveIntensity: 0.42, roughness: 0.6 }, {}),
    fabric: standard({ map: textures.linen.map, color: '#dfe4e2', roughness: 0.94 }, { uvSize: 0.3, env: INDOOR_ENV }),
    fabricTeal: standard({ map: textures.linen.map, color: '#3f7c82', roughness: 0.92 }, { uvSize: 0.3, env: INDOOR_ENV }),
    white: standard({ color: '#f4f4f0', roughness: 0.5 }, { env: 0.6 }),
    dark: standard({ color: '#1d2a2e', roughness: 0.42 }, { env: 0.6 }),
    planter: standard({ color: '#d7dbd6', roughness: 0.85 }, {}),
    soil: standard({ color: '#3b3a31', roughness: 1 }, { env: 0.2 }),
    bark: standard({ color: '#7d7264', roughness: 0.9 }, {}),
    bamboo: standard({ color: '#a7b38a', roughness: 0.55 }, {}),
    city: standard({ color: '#dbe4e6', roughness: 0.9 }, {}),
    ledTeal: new THREE.MeshBasicMaterial({ color: new THREE.Color('#58e3df').multiplyScalar(2.2), toneMapped: false }),
    lampStrip: new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.lamp).multiplyScalar(2.6), toneMapped: false }),
    glass,
    environment,
  };
  made.push(materials.ledTeal, materials.lampStrip, materials.sheer);

  return {
    ...materials,
    dispose: () => made.forEach((material) => material.dispose()),
  };
}
