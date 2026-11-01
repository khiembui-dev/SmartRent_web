// Cây xanh dựng bằng hàng nghìn tấm lá thay vì khối cầu: bàng Đài Loan tán tầng và tre, hai loại cây quen thuộc
// của sân vườn nhà phố Sài Gòn. Pháp tuyến hướng ra khỏi tán nên ánh sáng trên lá mềm như một khối.
import * as THREE from 'three';
import { composeMatrix, instances } from './kit.js';

function leafMaterial(map, { environment, tier, time }) {
  const material = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.3,
    alphaToCoverage: tier.msaa > 0,
    side: THREE.DoubleSide,
    roughness: 0.62,
    envMap: environment,
    envMapIntensity: 0.85,
  });
  const sway = tier.wind ? /* glsl */ `
    float windPhase = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.5 + instanceMatrix[3].y * 0.3;
    float windOffset = sin(uTime * 1.1 + windPhase) * 0.05 + sin(uTime * 2.4 + windPhase * 1.7) * 0.022;
    transformed.x += windOffset * (position.y + 0.5);
    transformed.z += windOffset * 0.6;
  ` : '';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCrown;\nuniform float uTime;')
      .replace('#include <defaultnormal_vertex>', /* glsl */ `#include <defaultnormal_vertex>
        transformedNormal = normalize(normalMatrix * normalize(instanceMatrix[3].xyz - aCrown));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${sway}`);
    // Hai mặt tấm lá dùng chung một pháp tuyến, không thì mặt sau tối đen.
    // Càng xa càng tăng độ phủ của lá: tán cây giữ được khối thay vì tan thành chấm nhiễu.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'))
      .replace('#include <alphatest_fragment>', `diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + length(vViewPosition) * 0.024));\n#include <alphatest_fragment>`);
  };
  return material;
}

class LeafField {
  constructor(material) {
    this.material = material;
    this.matrices = [];
    this.crowns = [];
  }

  add(matrix, crown) {
    this.matrices.push(matrix);
    this.crowns.push(...crown);
  }

  commit(parent) {
    if (!this.matrices.length) return;
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('aCrown', new THREE.InstancedBufferAttribute(new Float32Array(this.crowns), 3));
    parent.add(instances(geometry, this.material, this.matrices));
  }
}

const branchAxis = new THREE.Vector3(0, 1, 0);
const branchDirection = new THREE.Vector3();
const branchQuaternion = new THREE.Quaternion();

function addStick(kit, material, radiusTop, radiusBottom, from, to, segments = 6) {
  branchDirection.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = branchDirection.length();
  branchQuaternion.setFromUnitVectors(branchAxis, branchDirection.normalize());
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments, 1, true);
  geometry.applyQuaternion(branchQuaternion);
  geometry.translate((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  kit.add(material, geometry);
}

export function createFoliage({ materials, textures, tier, time, random }) {
  const shared = { environment: materials.environment, tier, time };
  const broad = new LeafField(leafMaterial(textures.leafBroad, shared));
  const slim = new LeafField(leafMaterial(textures.leafSlim, shared));
  const density = tier.foliage;
  const sizeBoost = 1 / Math.sqrt(density); // ít tấm lá hơn thì mỗi tấm to hơn, tán không bị thưa

  return {
    /** Bàng Đài Loan: thân thẳng, cành xòe ngang thành từng tầng rõ rệt. */
    terminalia(kit, x, z, height) {
      addStick(kit, materials.bark, 0.05, 0.17, [x, 0, z], [x, height, z], 10);
      const tiers = Math.round(height * 0.56);
      const start = height * 0.36;
      for (let tierIndex = 0; tierIndex < tiers; tierIndex += 1) {
        const progress = tierIndex / (tiers - 1);
        const y = start + (height - start) * progress;
        const reach = (4.3 - progress * 2.7) * (0.9 + random() * 0.25) * (height / 8.5);
        const spokes = 5;
        const twist = random() * Math.PI * 2;
        for (let spoke = 0; spoke < spokes; spoke += 1) {
          const angle = twist + (spoke / spokes) * Math.PI * 2 + (random() - 0.5) * 0.4;
          const length = reach * (0.8 + random() * 0.3);
          const end = [x + Math.cos(angle) * length, y + 0.1 + random() * 0.25, z + Math.sin(angle) * length];
          addStick(kit, materials.bark, 0.008, 0.035, [x, y, z], end, 5);
          const cards = Math.round(length * 34 * density);
          for (let card = 0; card < cards; card += 1) {
            const along = random() ** 0.55;
            const spread = (random() - 0.5) * length * 0.62 * along;
            const px = x + Math.cos(angle) * length * along - Math.sin(angle) * spread;
            const pz = z + Math.sin(angle) * length * along + Math.cos(angle) * spread;
            const py = y + along * 0.26 + (random() - 0.5) * 0.12;
            const size = (0.5 + random() * 0.34) * sizeBoost;
            broad.add(
              composeMatrix({ position: [px, py, pz], rotation: [-Math.PI / 2 + (random() - 0.5) * 1, (random() - 0.5) * 0.7, random() * Math.PI * 2], scale: [size, size, size] }),
              [x, y - 0.9, z],
            );
          }
        }
      }
    },

    /** Khóm tre: cây mảnh, nghiêng nhẹ, lá rủ ở phần ngọn. */
    bamboo(kit, cx, cz, culms) {
      for (let i = 0; i < culms; i += 1) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * 1.25;
        const x = cx + Math.cos(angle) * distance;
        const z = cz + Math.sin(angle) * distance;
        const height = 7 + random() * 4.5;
        const lean = [Math.cos(angle) * (0.7 + random()), height, Math.sin(angle) * (0.7 + random())];
        addStick(kit, materials.bamboo, 0.018, 0.045, [x, 0, z], [x + lean[0], lean[1], z + lean[2]], 6);
        const cards = Math.round(64 * density);
        for (let card = 0; card < cards; card += 1) {
          const along = 0.36 + random() * 0.64;
          const reach = (1.25 - along) * 1.3;
          const spin = random() * Math.PI * 2;
          const px = x + lean[0] * along + Math.cos(spin) * reach * random();
          const pz = z + lean[2] * along + Math.sin(spin) * reach * random();
          const py = height * along;
          const size = (0.85 + random() * 0.5) * sizeBoost;
          slim.add(
            composeMatrix({ position: [px, py, pz], rotation: [(random() - 0.5) * 1.4, spin, (random() - 0.5) * 1.4], scale: [size, size, size] }),
            [x + lean[0] * along, py - 1, z + lean[2] * along],
          );
        }
      }
    },

    /** Cây lá trong sảnh: thân mảnh, tán thưa, cao tới tầng lửng. */
    indoorTree(kit, x, z) {
      addStick(kit, materials.bark, 0.03, 0.07, [x, 0.7, z], [x + 0.2, 5.2, z - 0.15], 8);
      const cards = Math.round(260 * density);
      for (let card = 0; card < cards; card += 1) {
        const rise = random();
        const spin = random() * Math.PI * 2;
        const reach = (1 - rise * 0.8) * 1.5 * Math.sqrt(random());
        const size = (0.34 + random() * 0.24) * sizeBoost;
        broad.add(
          composeMatrix({ position: [x + Math.cos(spin) * reach + 0.1, 2.5 + rise * 3, z + Math.sin(spin) * reach], rotation: [random() * 3.14, random() * 3.14, random() * 3.14], scale: [size, size, size] }),
          [x, 2.8 + rise * 2.4, z],
        );
      }
    },

    /** Bụi cây thấp hoặc cây chậu. */
    shrub(x, y, z, radius, height = radius) {
      const cards = Math.round(radius * radius * 90 * density + 8);
      for (let card = 0; card < cards; card += 1) {
        const angle = random() * Math.PI * 2;
        const rise = random() ** 0.7;
        const ring = Math.sqrt(1 - rise * rise) * (0.65 + random() * 0.35);
        const size = (0.34 + random() * 0.22) * sizeBoost;
        broad.add(
          composeMatrix({
            position: [x + Math.cos(angle) * ring * radius, y + rise * height, z + Math.sin(angle) * ring * radius],
            rotation: [random() * 3.14, random() * 3.14, random() * 3.14],
            scale: [size, size, size],
          }),
          [x, y - height * 0.3, z],
        );
      }
    },

    /** Dây leo buông xuống từ bồn cây ban công. */
    vines(x0, x1, y, z, length) {
      const cards = Math.round(Math.abs(x1 - x0) * length * 30 * density);
      for (let card = 0; card < cards; card += 1) {
        const px = x0 + (x1 - x0) * random();
        const drop = random() ** 1.5 * length * (0.55 + 0.45 * Math.sin(px * 1.7) ** 2);
        const size = (0.3 + random() * 0.22) * sizeBoost;
        broad.add(
          composeMatrix({ position: [px, y - drop, z + random() * 0.16], rotation: [(random() - 0.5) * 1.2, (random() - 0.5) * 1.2, random() * 3.14], scale: [size, size, size] }),
          [px, y - drop, z - 1],
        );
      }
    },

    commit(parent) {
      broad.commit(parent);
      slim.commit(parent);
    },

    dispose() {
      broad.material.dispose();
      slim.material.dispose();
    },
  };
}
