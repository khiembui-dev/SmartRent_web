// Mặt tiền nhiệt đới hiện đại: khung trắng, ban công sâu đổ bóng, lõi thang phủ gạch bông gió men ngọc.
// Mỗi viên gạch xoay theo vị trí để bốn viên ghép thành một bông hoa, đúng cách lát gạch bông gió ngoài đời.
import * as THREE from 'three';
import { composeMatrix, instances } from './kit.js';
import { PLAN } from './plan.js';

const BLOCK = 0.32;
const BLOCK_DEPTH = 0.13;

/** Viên gạch: khung vuông khoét một cánh hoa chạy chéo góc. */
function breezeBlockGeometry() {
  const half = BLOCK / 2 - 0.004;
  const inset = 0.03;
  const a = -half + inset;
  const b = half - inset;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -half);
  shape.lineTo(half, -half);
  shape.lineTo(half, half);
  shape.lineTo(-half, half);
  shape.closePath();
  const petal = new THREE.Path();
  petal.moveTo(a, a);
  petal.quadraticCurveTo(b * 0.86, a * 0.86, b, b);
  petal.quadraticCurveTo(a * 0.86, b * 0.86, a, a);
  shape.holes.push(petal);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: BLOCK_DEPTH, bevelEnabled: false, curveSegments: 7 });
  geometry.translate(0, 0, -BLOCK_DEPTH / 2);
  return geometry;
}

export class BreezeWall {
  constructor() {
    this.matrices = [];
  }

  /** Mảng tường gạch trên mặt phẳng z cố định. */
  addFront(x0, x1, y0, y1, z) {
    const columns = Math.round((x1 - x0) / BLOCK);
    const rows = Math.round((y1 - y0) / BLOCK);
    const stepX = (x1 - x0) / columns;
    const stepY = (y1 - y0) / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const turn = (column % 2) + (row % 2) * 3 - ((column % 2) * (row % 2)) * 2;
        this.matrices.push(composeMatrix({ position: [x0 + (column + 0.5) * stepX, y0 + (row + 0.5) * stepY, z], rotation: [0, 0, (turn * Math.PI) / 2] }));
      }
    }
  }

  /** Mảng tường gạch trên mặt phẳng x cố định, dùng cho hồi nhà. */
  addSide(z0, z1, y0, y1, x) {
    const columns = Math.round((z1 - z0) / BLOCK);
    const rows = Math.round((y1 - y0) / BLOCK);
    const stepZ = (z1 - z0) / columns;
    const stepY = (y1 - y0) / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const turn = (column % 2) + (row % 2) * 3 - ((column % 2) * (row % 2)) * 2;
        this.matrices.push(composeMatrix({ position: [x, y0 + (row + 0.5) * stepY, z0 + (column + 0.5) * stepZ], rotation: [(turn * Math.PI) / 2, Math.PI / 2, 0] }));
      }
    }
  }

  commit(parent, material) {
    parent.add(instances(breezeBlockGeometry(), material, this.matrices));
  }
}

// Mặt đứng đọc từ tầng trên cùng xuống, trái sang phải, mỗi ký tự là một gian rộng 4 m.
// B ban công, V ban công có bồn cây rủ, F lam gỗ đứng, S che gạch bông gió, T lõi thang.
const ELEVATION = [
  'FBVBTTBSBF',
  'BSBVTTVBFB',
  'VBFBTTBBSV',
  'BFBSTTFVBB',
];
const LIT_ROOMS = new Set(['0:1', '0:8', '1:3', '1:7', '2:0', '2:6', '3:2', '3:9', '3:6']);

function buildBay(kit, M, foliage, fins, wall, type, column, floor) {
  const { bay, windowZ, floorHeight: F, groundHeight: G } = PLAN;
  const x0 = -PLAN.halfWidth + column * bay;
  const x1 = x0 + bay;
  const y0 = G + floor * F;
  const y1 = y0 + F - 0.32;
  const mid = (x0 + x1) / 2;
  const rowFromTop = PLAN.floors - 1 - floor;

  kit.span(M.window, [x0, y0, windowZ - 0.05], [x1, y1, windowZ]);
  [x0 + bay / 3, x0 + (2 * bay) / 3].forEach((x) => kit.span(M.bronze, [x - 0.03, y0, windowZ], [x + 0.03, y1, windowZ + 0.05], { shadow: false }));
  kit.span(M.bronze, [x0, y1 - 0.05, windowZ], [x1, y1, windowZ + 0.05], { shadow: false });

  if (LIT_ROOMS.has(`${rowFromTop}:${column}`)) kit.span(M.roomGlow, [x0 + bay / 3 + 0.03, y0, windowZ], [x1 - 0.1, y1 - 0.05, windowZ + 0.02], { shadow: false });
  const curtainWidth = 0.7 + ((column * 7 + floor * 3) % 5) * 0.16;
  kit.span(M.curtain, [x0 + 0.1, y0 + 0.02, windowZ + 0.03], [x0 + curtainWidth, y1 - 0.06, windowZ + 0.06], { shadow: false });

  if (type === 'S') {
    wall.addFront(x0 + 0.09, x1 - 0.09, y0, y1, -0.08);
    return;
  }

  // Lan can kính, tay vịn đồng
  kit.span(M.glass, [x0 + 0.09, y0 + 0.04, -0.09], [x1 - 0.09, y0 + 1.1, -0.07], { shadow: false });
  kit.span(M.brass, [x0 + 0.09, y0 + 1.1, -0.1], [x1 - 0.09, y0 + 1.135, -0.06], { shadow: false });

  if (type === 'F') {
    for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.36) fins.push(composeMatrix({ position: [x, (y0 + y1) / 2, 0.02], scale: [1, y1 - y0, 1] }));
  }
  if (type === 'V') {
    kit.span(M.planter, [x0 + 0.1, y0, -0.56], [x1 - 0.1, y0 + 0.5, -0.1]);
    kit.span(M.soil, [x0 + 0.14, y0 + 0.5, -0.52], [x1 - 0.14, y0 + 0.52, -0.14], { shadow: false });
    foliage.vines(x0 + 0.2, x1 - 0.2, y0 + 0.62, 0.02, 2.6);
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 0.75) foliage.shrub(x, y0 + 0.5, -0.34, 0.42, 0.4);
  }
  if (type === 'B' && column % 3 === 0) {
    kit.cylinder(M.planter, 0.2, 0.15, 0.46, [mid + 1.2, y0 + 0.23, -1.2], { segments: 16 });
    foliage.shrub(mid + 1.2, y0 + 0.46, -1.2, 0.42, 0.8);
  }
}

function buildEntrance(group, kit, M, textures) {
  const { halfWidth, doorHeight, canopyY, canopyFront } = PLAN.entrance;
  const { glassZ } = PLAN;

  // Mái đón: tấm mỏng trắng, mặt dưới ốp gỗ, viền đồng
  kit.span(M.slabEdge, [-halfWidth - 1.3, canopyY, glassZ], [halfWidth + 0.7, canopyY + 0.2, canopyFront]);
  kit.span(M.oakOut, [-halfWidth - 1.3, canopyY - 0.03, glassZ], [halfWidth + 0.7, canopyY, canopyFront], { shadow: false });
  kit.span(M.brass, [-halfWidth - 1.3, canopyY + 0.2, canopyFront - 0.01], [halfWidth + 0.7, canopyY + 0.24, canopyFront + 0.01], { shadow: false });

  // Vách đá dẫn hướng bên trái, hai cột mảnh bên phải
  kit.span(M.stone, [-halfWidth - 1, 0, glassZ], [-halfWidth - 0.55, canopyY, canopyFront + 2.4]);
  [canopyFront - 0.3, 0.6].forEach((z) => kit.cylinder(M.brass, 0.05, 0.05, canopyY, [halfWidth + 0.45, canopyY / 2, z], { segments: 14 }));

  // Khung cửa đồng và chữ thương hiệu đứng trên mái đón
  kit.span(M.brass, [-halfWidth - 0.1, 0, glassZ - 0.06], [-halfWidth, canopyY, glassZ + 0.06]);
  kit.span(M.brass, [halfWidth, 0, glassZ - 0.06], [halfWidth + 0.1, canopyY, glassZ + 0.06]);
  kit.span(M.brass, [-halfWidth, doorHeight, glassZ - 0.06], [halfWidth, doorHeight + 0.1, glassZ + 0.06]);
  kit.span(M.glass, [-halfWidth, doorHeight + 0.1, glassZ - 0.01], [halfWidth, canopyY - 0.03, glassZ + 0.01], { shadow: false });

  const signMaterial = new THREE.MeshStandardMaterial({ color: '#c9a35b', metalness: 0.85, roughness: 0.32, alphaMap: textures.sign, alphaTest: 0.5, envMap: M.environment, side: THREE.DoubleSide });
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.79), signMaterial);
  signMesh.position.set(0.1, canopyY + 0.56, canopyFront - 0.22);
  signMesh.castShadow = true;
  group.add(signMesh);

  // Hai cánh cửa lùa: khung đồng mảnh, kính lớn, tay nắm dài
  const leaf = (side) => {
    const door = new THREE.Group();
    const width = 1.5;
    const parts = [
      [M.brass, [width, 0.05, 0.05], [0, doorHeight - 0.03, 0]],
      [M.brass, [width, 0.05, 0.05], [0, 0.03, 0]],
      [M.brass, [0.05, doorHeight, 0.05], [-width / 2 + 0.025, doorHeight / 2, 0]],
      [M.brass, [0.05, doorHeight, 0.05], [width / 2 - 0.025, doorHeight / 2, 0]],
      [M.brass, [0.022, 1.4, 0.022], [-side * (width / 2 - 0.14), 1.2, 0.07]],
    ];
    parts.forEach(([material, size, position]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      door.add(mesh);
    });
    const pane = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, doorHeight - 0.1, 0.02), M.glass);
    pane.position.y = doorHeight / 2;
    door.add(pane);
    door.position.set(side * 0.76, 0, glassZ + 0.08);
    group.add(door);
    return door;
  };
  return { left: leaf(-1), right: leaf(1) };
}

function buildGroundFloor(kit, M) {
  const { halfWidth: W, glassZ, groundHeight: G, entrance, lobby, studio } = PLAN;
  // Trần hiên ốp gỗ chạy suốt mặt tiền
  kit.span(M.oakOut, [-W, G - 0.35, glassZ], [-entrance.halfWidth - 1, G - 0.32, 0.1], { shadow: false });
  kit.span(M.oakOut, [entrance.halfWidth + 1, G - 0.35, glassZ], [W, G - 0.32, 0.1], { shadow: false });

  [-16, -8, 8, 16].forEach((x) => kit.cylinder(M.slabEdge, 0.17, 0.17, G - 0.3, [x, (G - 0.3) / 2, -0.25], { segments: 24 }));

  // Vách kính tầng trệt
  const head = G - 0.32;
  const clear = (x0, x1) => kit.span(M.glass, [x0, 0.04, glassZ - 0.012], [x1, head, glassZ + 0.012], { shadow: false });
  clear(lobby.x0, -entrance.halfWidth - 0.1);
  clear(entrance.halfWidth + 0.1, lobby.x1);
  kit.span(M.frosted, [-W, 0, glassZ - 0.02], [studio.x0, head, glassZ + 0.02]);
  kit.span(M.frosted, [lobby.x1, 0, glassZ - 0.02], [W, head, glassZ + 0.02]);
  kit.span(M.bronze, [-W, head - 1.2, glassZ], [W, head - 1.16, glassZ + 0.06], { shadow: false });
  for (let x = -W; x <= W; x += 1.6) {
    if (Math.abs(x) < entrance.halfWidth + 0.1 || (x > studio.x0 && x < studio.x1)) continue;
    kit.span(M.bronze, [x - 0.03, 0, glassZ - 0.03], [x + 0.03, head, glassZ + 0.06], { shadow: false });
  }
}

function buildShell(kit, M, wall) {
  const { halfWidth: W, back, groundHeight: G, floorHeight: F, floors, roofY, windowZ, bay, tower, lobby, glassZ } = PLAN;

  // Sàn tầng 2: chừa khoảng thông tầng của sảnh
  const slabTop = G;
  const edge = 0.14;
  kit.span(M.slabEdge, [-W - 0.14, slabTop - 0.32, back], [lobby.x0, slabTop, edge]);
  kit.span(M.slabEdge, [lobby.x1, slabTop - 0.32, back], [W + 0.14, slabTop, edge]);
  kit.span(M.slabEdge, [lobby.x0, slabTop - 0.32, back], [lobby.x1, slabTop, lobby.z0]);
  kit.span(M.slabEdge, [lobby.x0, slabTop - 0.32, glassZ], [tower.x0, slabTop, edge]);
  kit.span(M.slabEdge, [tower.x1, slabTop - 0.32, glassZ], [lobby.x1, slabTop, edge]);

  // Các sàn trên: phần lõi thang lùi vào để nắng rơi xuống sau lớp gạch
  for (let floor = 1; floor <= floors; floor += 1) {
    const top = G + floor * F;
    kit.span(M.slabEdge, [-W - 0.14, top - 0.32, back], [tower.x0, top, edge]);
    kit.span(M.slabEdge, [tower.x1, top - 0.32, back], [W + 0.14, top, edge]);
    kit.span(M.slabEdge, [tower.x0, top - 0.32, back], [tower.x1, top, glassZ]);
  }

  // Tường bao và các vách ngăn ban công
  kit.span(M.plaster, [-W - 0.14, 0, back - 0.3], [W + 0.14, roofY, back]);
  kit.span(M.plaster, [W, 0, back], [W + 0.14, roofY, glassZ]);
  kit.span(M.plaster, [-W - 0.14, 0, back], [-W, roofY, glassZ]);
  kit.span(M.plaster, [W, G, glassZ], [W + 0.14, roofY, edge]);
  kit.span(M.plaster, [-W - 0.14, G, glassZ], [-W, roofY, edge]);
  for (let line = 1; line < 10; line += 1) {
    const x = -W + line * bay;
    if (x === tower.x0 + bay) continue;
    kit.span(M.plaster, [x - 0.09, G, windowZ], [x + 0.09, roofY, edge]);
  }

  // Tường sau lớp gạch của lõi thang, chỗ hoa nắng đổ lên
  kit.span(M.plaster, [tower.x0, lobby.height, glassZ - 0.2], [tower.x1, tower.top, glassZ]);
  kit.span(M.plaster, [tower.x0 - 0.2, roofY, glassZ], [tower.x0, tower.top, tower.z + 0.1]);
  kit.span(M.plaster, [tower.x1, roofY, glassZ], [tower.x1 + 0.2, tower.top, tower.z + 0.1]);
  kit.span(M.slabEdge, [tower.x0 - 0.3, tower.top, glassZ - 0.3], [tower.x1 + 0.3, tower.top + 0.28, tower.z + 0.3]);
  kit.span(M.glass, [tower.x0, G, glassZ - 0.01], [tower.x1, lobby.height, glassZ + 0.01], { shadow: false });
  wall.addFront(tower.x0, tower.x1, G + 0.1, tower.top, tower.z);

  // Khung cửa sổ đua trên hồi nhà: tạo khối và bóng đổ cho mặt tường phẳng
  for (let floor = 0; floor < floors; floor += 1) {
    const y0 = G + floor * F + 0.25;
    const y1 = y0 + 2.45;
    [-11.5, -8.2, -4.9].forEach((z) => {
      const x = W + 0.14;
      const depth = 0.5;
      kit.span(M.window, [x, y0, z - 0.75], [x + 0.03, y1, z + 0.75], { shadow: false });
      kit.span(M.slabEdge, [x, y1, z - 0.87], [x + depth, y1 + 0.12, z + 0.87]);
      kit.span(M.slabEdge, [x, y0 - 0.12, z - 0.87], [x + depth, y0, z + 0.87]);
      kit.span(M.slabEdge, [x, y0, z - 0.87], [x + depth, y1, z - 0.75]);
      kit.span(M.slabEdge, [x, y0, z + 0.75], [x + depth, y1, z + 0.87]);
    });
  }
}

export function buildFacade(group, { kit, materials: M, textures, foliage }) {
  const wall = new BreezeWall();
  const fins = [];
  buildShell(kit, M, wall);
  buildGroundFloor(kit, M);
  ELEVATION.forEach((row, rowFromTop) => {
    const floor = PLAN.floors - 1 - rowFromTop;
    [...row].forEach((type, column) => {
      if (type !== 'T') buildBay(kit, M, foliage, fins, wall, type, column, floor);
    });
  });
  const doors = buildEntrance(group, kit, M, textures);

  if (fins.length) group.add(instances(new THREE.BoxGeometry(0.07, 1, 0.24), M.oakOut, fins));
  return { wall, doors };
}
