// Bộ dựng hình: gom mọi khối tĩnh dùng chung chất liệu thành một mesh để giữ số lệnh vẽ thấp,
// và trải UV theo mét để vân tường, sàn, gỗ đúng tỉ lệ dù khối to hay nhỏ.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEPT_ATTRIBUTES = new Set(['position', 'normal', 'uv']);
const ZERO = [0, 0, 0];
const ONE = [1, 1, 1];
const transform = new THREE.Object3D();

function prepare(geometry) {
  Object.keys(geometry.attributes).forEach((name) => {
    if (!KEPT_ATTRIBUTES.has(name)) geometry.deleteAttribute(name);
  });
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
  return geometry;
}

function mapBoxUv(geometry, [w, h, d], [x, y, z], metersPerRepeat) {
  const uv = geometry.attributes.uv;
  const faces = [[d, h, z, y], [d, h, z, y], [w, d, x, z], [w, d, x, z], [w, h, x, y], [w, h, x, y]];
  faces.forEach(([spanU, spanV, offsetU, offsetV], face) => {
    for (let i = face * 4; i < face * 4 + 4; i += 1) {
      uv.setXY(i, (uv.getX(i) * spanU + offsetU) / metersPerRepeat, (uv.getY(i) * spanV + offsetV) / metersPerRepeat);
    }
  });
}

export function composeMatrix({ position = ZERO, rotation = ZERO, scale = ONE } = {}) {
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.scale.set(...scale);
  transform.updateMatrix();
  return transform.matrix.clone();
}

export class Kit {
  constructor() {
    this.parts = new Map();
  }

  add(material, geometry, { shadow = true, ...placement } = {}) {
    geometry.applyMatrix4(composeMatrix(placement));
    const key = `${material.uuid}:${shadow}`;
    if (!this.parts.has(key)) this.parts.set(key, { material, shadow, geometries: [] });
    this.parts.get(key).geometries.push(prepare(geometry));
    return this;
  }

  /** Khối hộp, `position` là tâm khối. */
  box(material, size, position, options = {}) {
    const geometry = new THREE.BoxGeometry(...size);
    mapBoxUv(geometry, size, position, material.userData.uvSize ?? 1);
    return this.add(material, geometry, { ...options, position });
  }

  /** Khối hộp theo hai góc đối diện, tiện khi đọc từ bản vẽ. */
  span(material, [x0, y0, z0], [x1, y1, z1], options = {}) {
    return this.box(material, [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], options);
  }

  cylinder(material, radiusTop, radiusBottom, height, position, { segments = 20, ...options } = {}) {
    return this.add(material, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), { ...options, position });
  }

  commit(parent) {
    this.parts.forEach(({ material, shadow, geometries }) => {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((piece) => piece.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = !material.transparent;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    });
    this.parts.clear();
  }
}

export function instances(geometry, material, matrices, { shadow = true, colors = null } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
  if (colors) colors.forEach((color, index) => mesh.setColorAt(index, color));
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}

/** Bộ sinh số giả ngẫu nhiên có hạt: lần tải nào cảnh cũng giống hệt nhau. */
export function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
