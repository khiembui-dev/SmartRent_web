// Tầng trệt: sảnh thông tầng nhận hoa nắng từ lõi gạch bông gió, hành lang phòng và một căn studio mẫu nhìn ra vườn.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { composeMatrix, instances } from './kit.js';
import { PLAN } from './plan.js';

const rounded = (kit, material, size, position, radius = 0.05, options = {}) => {
  kit.add(material, new RoundedBoxGeometry(...size, 3, radius), { ...options, position });
};

function buildLobby(group, kit, M, foliage) {
  const { lobby, corridor } = PLAN;
  const { x0, x1, z0, z1 } = lobby;
  const ceiling = lobby.height - 0.33;
  const floorTop = 0.016;

  kit.span(M.terrazzo, [x0, -0.1, z0], [x1, floorTop, z1], { shadow: false });
  kit.span(M.terrazzo, [corridor.x0, -0.1, corridor.z0], [x0, floorTop, corridor.z1], { shadow: false });
  kit.span(M.plasterIn, [x0, ceiling, z0], [x1, ceiling + 0.04, z1], { shadow: false });

  // Tường sảnh; ô mở hành lang ở bên trái
  kit.span(M.plasterIn, [x0, 0, z0 - 0.2], [x1, ceiling, z0]);
  kit.span(M.plasterIn, [x1, 0, z0], [x1 + 0.2, ceiling, z1]);
  kit.span(M.plasterIn, [x0 - 0.2, 0, corridor.z1], [x0, ceiling, z1]);
  kit.span(M.plasterIn, [x0 - 0.2, corridor.height, z0], [x0, ceiling, corridor.z1]);

  // Tường gỗ nan chạy hết chiều cao bên phải: nền ấm cho khu tiếp khách
  const slats = [];
  for (let z = z0 + 0.1; z < z1 - 0.02; z += 0.135) slats.push(composeMatrix({ position: [x1 - 0.05, ceiling / 2, z] }));
  group.add(instances(new THREE.BoxGeometry(0.09, ceiling, 0.075), M.oak, slats));
  kit.span(M.dark, [x1 - 0.002, 0, z0], [x1, ceiling, z1], { shadow: false });
  kit.span(M.lampStrip, [x1 - 0.17, 0.02, z0 + 0.1], [x1 - 0.13, 0.05, z1 - 0.1], { shadow: false });

  // Hành lang tầng lửng bên trái: hạ trần lại cho vừa tầm người ở dưới
  const galleryY = 3.6;
  kit.span(M.plasterIn, [x0, galleryY, z0], [x0 + 3.1, galleryY + 0.28, z1], {});
  kit.span(M.slabEdge, [x0 + 3.1, galleryY, z0], [x0 + 3.14, galleryY + 0.28, z1], { shadow: false });
  kit.span(M.lampStrip, [x0 + 2.9, galleryY - 0.015, z0 + 0.3], [x0 + 2.96, galleryY, z1 - 0.3], { shadow: false });
  kit.span(M.glass, [x0 + 3.07, galleryY + 0.28, z0], [x0 + 3.09, galleryY + 1.34, z1], { shadow: false });
  kit.span(M.brass, [x0 + 3.05, galleryY + 1.34, z0], [x0 + 3.11, galleryY + 1.37, z1], { shadow: false });

  // Tường tủ thư và công tơ: mỗi phòng một công tơ riêng, đèn báo nhỏ màu ngọc
  const wallX = x0 + 0.03;
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 12; column += 1) {
      const y = 0.62 + row * 0.46;
      const z = -8.6 + column * 0.46;
      kit.box(M.lacquer, [0.04, 0.42, 0.42], [wallX, y, z], { shadow: false });
      kit.box(M.brass, [0.02, 0.012, 0.13], [wallX + 0.03, y + 0.12, z], { shadow: false });
      if ((row + column * 3) % 4 === 0) kit.box(M.ledTeal, [0.01, 0.018, 0.018], [wallX + 0.03, y - 0.14, z + 0.14], { shadow: false });
    }
  }

  // Quầy lễ tân: mặt trước sóng tròn, mặt bàn terrazzo, chỉ đồng dưới chân
  const deskX0 = 1.6;
  const deskX1 = 7.6;
  const deskZ = -9.75;
  for (let x = deskX0; x < deskX1; x += 0.062) kit.cylinder(M.white, 0.034, 0.034, 1.04, [x, 0.54, deskZ + 0.4], { segments: 8, shadow: false });
  kit.span(M.white, [deskX0 - 0.03, 0.02, deskZ - 0.4], [deskX1, 1.06, deskZ + 0.38]);
  kit.span(M.terrazzo, [deskX0 - 0.08, 1.06, deskZ - 0.46], [deskX1 + 0.08, 1.12, deskZ + 0.5]);
  kit.span(M.brass, [deskX0 - 0.02, 0.016, deskZ + 0.34], [deskX1, 0.06, deskZ + 0.46], { shadow: false });

  // Cửa thang máy đồng
  kit.span(M.brass, [-3.7, 0, z0], [-1.1, 2.75, z0 + 0.04]);
  kit.span(M.lacquer, [-3.62, 0.02, z0 + 0.04], [-1.18, 2.67, z0 + 0.052], { shadow: false });
  kit.span(M.brass, [-2.405, 0.02, z0 + 0.052], [-2.395, 2.67, z0 + 0.056], { shadow: false });
  kit.box(M.ledTeal, [0.05, 0.05, 0.02], [-0.8, 1.25, z0 + 0.03], { shadow: false });

  // Khu tiếp khách
  rounded(kit, M.fabric, [2.6, 0.42, 0.95], [4.2, 0.36, -7.1]);
  rounded(kit, M.fabric, [2.6, 0.5, 0.26], [4.2, 0.72, -7.5], 0.1);
  rounded(kit, M.fabricTeal, [0.5, 0.36, 0.16], [3.2, 0.72, -7.2], 0.07);
  rounded(kit, M.fabric, [0.5, 0.36, 0.16], [4.9, 0.72, -7.25], 0.07);
  kit.cylinder(M.terrazzo, 0.62, 0.62, 0.05, [4.2, 0.42, -5.5], { segments: 40 });
  kit.cylinder(M.brass, 0.025, 0.025, 0.42, [4.2, 0.21, -5.5], { segments: 12 });
  kit.cylinder(M.fabric, 2.2, 2.2, 0.012, [4.2, 0.022, -5.9], { segments: 48, shadow: false });

  // Chùm đèn vòng đồng thả từ trần
  [[2.6, 4.4, -5.8, 0.42], [3.5, 3.7, -6.5, 0.34], [4.6, 4.8, -5.4, 0.5], [5.5, 3.9, -6.2, 0.36], [4.1, 5.5, -6.6, 0.28]].forEach(([x, y, z, radius]) => {
    kit.add(M.lampStrip, new THREE.TorusGeometry(radius, 0.012, 8, 48), { position: [x, y, z], rotation: [Math.PI / 2, 0, 0], shadow: false });
    kit.add(M.brass, new THREE.TorusGeometry(radius + 0.014, 0.01, 8, 48), { position: [x, y + 0.02, z], rotation: [Math.PI / 2, 0, 0], shadow: false });
    kit.cylinder(M.brass, 0.004, 0.004, ceiling - y, [x, (ceiling + y) / 2, z], { segments: 5, shadow: false });
  });

  // Cây trong nhà đón sáng ở đầu sảnh
  [[7.8, -3.7], [-6.6, -3.5]].forEach(([x, z]) => {
    kit.cylinder(M.white, 0.55, 0.42, 0.68, [x, 0.36, z], { segments: 32 });
    kit.cylinder(M.soil, 0.5, 0.5, 0.02, [x, 0.7, z], { segments: 24, shadow: false });
    foliage.indoorTree(kit, x, z);
  });

}

/** Cánh cửa hành lang đóng sẵn, kèm khóa và biển phòng. */
function hallDoor(kit, M, x, wallZ, side) {
  kit.span(M.oak, [x - 0.5, 0, wallZ], [x + 0.5, 2.34, wallZ + side * 0.03], { shadow: false });
  kit.span(M.brass, [x - 0.53, 0, wallZ], [x - 0.5, 2.37, wallZ + side * 0.035], { shadow: false });
  kit.span(M.brass, [x + 0.5, 0, wallZ], [x + 0.53, 2.37, wallZ + side * 0.035], { shadow: false });
  kit.span(M.brass, [x - 0.53, 2.34, wallZ], [x + 0.53, 2.37, wallZ + side * 0.035], { shadow: false });
  kit.box(M.dark, [0.07, 0.2, 0.025], [x + 0.36, 1.14, wallZ + side * 0.045], { shadow: false });
}

function buildCorridor(kit, M) {
  const { corridor, studio } = PLAN;
  const { x0, x1, z0, z1, height } = corridor;
  kit.span(M.plasterIn, [x0, height, z0], [x1, height + 0.04, z1], { shadow: false });
  kit.span(M.plasterIn, [x0, 0, z0 - 0.15], [x1, height, z0]);
  kit.span(M.plasterIn, [x0 - 0.15, 0, z0], [x0, height, z1]);

  // Tường chung với căn studio, có ô cửa
  kit.span(M.plasterIn, [x0, 0, z1], [studio.doorX0, height + 0.3, z1 + 0.14]);
  kit.span(M.plasterIn, [studio.doorX1, 0, z1], [x1, height + 0.3, z1 + 0.14]);
  kit.span(M.plasterIn, [studio.doorX0, 2.34, z1], [studio.doorX1, height + 0.3, z1 + 0.14]);

  // Khe đèn trần, chỉ sàn
  kit.span(M.lampStrip, [x0 + 0.3, height - 0.012, z0 + 0.98], [x1 - 0.2, height, z0 + 1.04], { shadow: false });
  kit.span(M.white, [x0, 0.016, z0], [x1, 0.1, z0 + 0.012], { shadow: false });
  kit.span(M.white, [x0, 0.016, z1 - 0.012], [studio.doorX0 - 0.03, 0.1, z1], { shadow: false });
  kit.span(M.white, [studio.doorX1 + 0.03, 0.016, z1 - 0.012], [x1, 0.1, z1], { shadow: false });

  hallDoor(kit, M, -14.2, z1, -1);
  hallDoor(kit, M, -13.4, z0, 1);
  hallDoor(kit, M, -10.1, z0, 1);

  // Thiết bị an toàn trên trần và tường: báo khói, camera, tủ chữa cháy
  kit.cylinder(M.white, 0.055, 0.065, 0.03, [-9.4, height - 0.015, -10.7], { segments: 18, shadow: false });
  kit.cylinder(M.ledTeal, 0.006, 0.006, 0.006, [-9.4, height - 0.034, -10.7], { segments: 6, shadow: false });
  kit.add(M.dark, new THREE.SphereGeometry(0.07, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), { position: [-12.5, height, -10.1], shadow: false });
  kit.span(M.white, [-16.3, 0.7, z0], [-15.5, 1.7, z0 + 0.06], { shadow: false });
  kit.span(M.glass, [-16.26, 0.74, z0 + 0.06], [-15.54, 1.66, z0 + 0.07], { shadow: false });
  kit.cylinder(new THREE.MeshStandardMaterial({ color: '#b5413a', roughness: 0.4 }), 0.075, 0.075, 0.5, [-15.9, 1.03, z0 + 0.05], { segments: 14, shadow: false });
}

/** Cửa phòng mở được, đúng chỗ dừng cận cảnh khóa vân tay. */
function buildStudioDoor(group, M, textures) {
  const { studio, corridor } = PLAN;
  const width = studio.doorX1 - studio.doorX0;
  const pivot = new THREE.Group();
  pivot.position.set(studio.doorX0, 0, corridor.z1 + 0.02);
  group.add(pivot);
  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    pivot.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(width, 2.32, 0.05), M.oak, width / 2, 1.16, 0);
  const lockX = width - 0.14;
  add(new THREE.BoxGeometry(0.075, 0.26, 0.022), M.dark, lockX, 1.14, -0.036);
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 24), M.ledTeal, lockX, 1.2, -0.05).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 24), M.bronze, lockX, 1.2, -0.052).rotation.x = Math.PI / 2;
  add(new THREE.BoxGeometry(0.05, 0.008, 0.004), M.ledTeal, lockX, 1.1, -0.048);
  add(new THREE.BoxGeometry(0.15, 0.022, 0.03), M.brass, lockX - 0.05, 1.03, -0.055);
  const plateMaterial = new THREE.MeshStandardMaterial({ map: textures.plate, roughness: 0.5, envMap: M.environment, envMapIntensity: 0.3 });
  add(new THREE.PlaneGeometry(0.2, 0.1), plateMaterial, width / 2, 1.62, -0.027).rotation.y = Math.PI;
  return { pivot, plateMaterial };
}

function buildStudio(group, kit, M, foliage) {
  const { studio, glassZ } = PLAN;
  const { x0, x1, z0, z1, height } = studio;

  kit.span(M.oak, [x0, -0.05, z0], [x1, 0.02, z1], { shadow: false });
  kit.span(M.plasterIn, [x0, height, z0], [x1, height + 0.05, z1]);
  kit.span(M.plasterIn, [x0 - 0.15, 0, z0], [x0, height + 0.5, z1]);
  kit.span(M.plasterIn, [x1, 0, z0], [x1 + 0.15, height + 0.5, z1]);

  // Khe đèn hắt ấm quanh trần
  kit.span(M.lampStrip, [x0 + 0.08, height - 0.014, z0 + 0.3], [x0 + 0.12, height, z1 - 0.3], { shadow: false });
  kit.span(M.lampStrip, [x1 - 0.12, height - 0.014, z0 + 0.3], [x1 - 0.08, height, z1 - 0.3], { shadow: false });

  // Đầu giường: nan gỗ phủ cả mảng tường, gối tựa bọc vải
  const slats = [];
  for (let z = -7.1; z < -2.9; z += 0.11) slats.push(composeMatrix({ position: [x0 + 0.03, 1.3, z] }));
  group.add(instances(new THREE.BoxGeometry(0.05, 2.6, 0.06), M.oak, slats));
  rounded(kit, M.fabricTeal, [0.1, 0.78, 2.1], [x0 + 0.1, 0.95, -5.1], 0.04);

  // Giường
  kit.span(M.oak, [x0 + 0.05, 0.1, -6.05], [x0 + 2.25, 0.3, -4.15]);
  rounded(kit, M.fabric, [2.1, 0.24, 1.72], [x0 + 1.14, 0.42, -5.1], 0.09);
  rounded(kit, M.curtain, [1.5, 0.15, 1.8], [x0 + 1.46, 0.56, -5.1], 0.07);
  rounded(kit, M.fabricTeal, [0.62, 0.1, 1.86], [x0 + 1.74, 0.6, -5.1], 0.045);
  rounded(kit, M.curtain, [0.42, 0.17, 0.66], [x0 + 0.42, 0.62, -5.52], 0.08, { rotation: [0, 0, 0.32] });
  rounded(kit, M.curtain, [0.42, 0.17, 0.66], [x0 + 0.42, 0.62, -4.68], 0.08, { rotation: [0, 0, 0.32] });

  // Bàn đầu giường và đèn đồng
  [-6.45, -3.75].forEach((z) => {
    kit.span(M.oak, [x0 + 0.1, 0.42, z - 0.25], [x0 + 0.56, 0.47, z + 0.25]);
    kit.cylinder(M.brass, 0.012, 0.012, 0.42, [x0 + 0.33, 0.21, z], { segments: 8 });
    kit.cylinder(M.brass, 0.008, 0.008, 0.3, [x0 + 0.33, 0.62, z], { segments: 8 });
    kit.cylinder(M.lampStrip, 0.08, 0.1, 0.13, [x0 + 0.33, 0.82, z], { segments: 18, shadow: false });
  });

  // Tủ quần áo và cửa phòng tắm trên tường sau
  kit.span(M.oak, [x0, 0, z0 + 0.14], [x0 + 3.1, 2.45, z0 + 0.74]);
  [0.75, 1.55, 2.3].forEach((offset) => kit.span(M.dark, [x0 + offset, 0.02, z0 + 0.74], [x0 + offset + 0.008, 2.43, z0 + 0.745], { shadow: false }));
  [0.67, 0.87, 1.47, 1.67, 2.22, 2.42].forEach((offset) => kit.span(M.brass, [x0 + offset, 1, z0 + 0.74], [x0 + offset + 0.012, 1.3, z0 + 0.76], { shadow: false }));

  // Bếp nhỏ dọc tường phải: tủ sơn xanh cửa, mặt đá, ốp men ngọc
  const wall = x1 - 0.02;
  kit.span(M.lacquer, [wall - 0.6, 0.1, -8.9], [wall, 0.86, -5.7]);
  kit.span(M.terrazzo, [wall - 0.64, 0.86, -8.92], [wall, 0.9, -5.68]);
  kit.span(M.dark, [wall - 0.6, 0.02, -8.9], [wall - 0.04, 0.1, -5.7], { shadow: false });
  kit.span(M.glaze, [wall - 0.012, 0.9, -8.9], [wall, 1.55, -5.7], { shadow: false });
  kit.span(M.oak, [wall - 0.28, 1.72, -8.9], [wall, 1.76, -5.7]);
  kit.span(M.lacquer, [wall - 0.34, 2.05, -8.9], [wall, 2.75, -6.9]);
  kit.span(M.dark, [wall - 0.5, 0.905, -7.35], [wall - 0.1, 0.91, -6.65], { shadow: false });
  kit.cylinder(M.brass, 0.012, 0.012, 0.26, [wall - 0.1, 1.03, -8.15], { segments: 8 });
  kit.cylinder(M.brass, 0.01, 0.01, 0.2, [wall - 0.18, 1.15, -8.15], { segments: 8, rotation: [0, 0, Math.PI / 2] });
  for (let x = 0; x < 3; x += 1) kit.cylinder(M.white, 0.05, 0.04, 0.09, [wall - 0.14, 1.81, -8.6 + x * 0.22], { segments: 14 });

  // Bàn làm việc sát tường, ngay chỗ có sáng tự nhiên
  kit.span(M.oak, [wall - 0.66, 0.73, -4.7], [wall, 0.77, -3]);
  [-4.62, -3.08].forEach((z) => kit.span(M.dark, [wall - 0.63, 0, z - 0.012], [wall - 0.6, 0.73, z + 0.012]));
  kit.span(M.dark, [wall - 0.46, 0.775, -3.98], [wall - 0.14, 0.785, -3.5], { shadow: false });
  kit.span(M.dark, [wall - 0.13, 0.785, -3.98], [wall - 0.12, 1.07, -3.5], { shadow: false, rotation: [0, 0, 0] });
  rounded(kit, M.fabricTeal, [0.46, 0.06, 0.46], [wall - 1, 0.47, -3.85], 0.025);
  rounded(kit, M.fabricTeal, [0.05, 0.4, 0.44], [wall - 1.24, 0.72, -3.85], 0.02);
  kit.cylinder(M.dark, 0.012, 0.012, 0.45, [wall - 1, 0.22, -3.85], { segments: 8 });
  kit.cylinder(M.dark, 0.2, 0.22, 0.015, [wall - 1, 0.03, -3.85], { segments: 24 });

  // Góc đọc sách: thảm tròn, ghế, cây chậu
  kit.cylinder(M.fabric, 1.45, 1.45, 0.012, [-11.6, 0.03, -5.4], { segments: 48, shadow: false });
  rounded(kit, M.curtain, [0.72, 0.28, 0.72], [-11.5, 0.3, -4.1], 0.12);
  rounded(kit, M.curtain, [0.72, 0.42, 0.2], [-11.5, 0.6, -4.42], 0.09);
  kit.cylinder(M.white, 0.2, 0.15, 0.4, [-13.2, 0.21, -2.7], { segments: 18 });
  foliage.shrub(-13.2, 0.42, -2.7, 0.5, 1);

  // Rèm voan có nếp gấp thật ở hai đầu kính
  const curtain = (xa, xb) => {
    const geometry = new THREE.PlaneGeometry(xb - xa, height - 0.12, 36, 1);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) position.setZ(i, Math.sin(position.getX(i) * 15) * 0.05 + Math.sin(position.getX(i) * 6.4) * 0.03);
    geometry.computeVertexNormals();
    kit.add(M.sheer, geometry, { position: [(xa + xb) / 2, (height - 0.12) / 2 + 0.03, glassZ - 0.2], shadow: false });
  };
  curtain(x0 + 0.05, x0 + 1.5);
  curtain(x1 - 0.95, x1 - 0.05);

  // Vách kính cố định và cánh cửa lùa ra sân hiên
  const doorX0 = -12;
  kit.span(M.glass, [x0, 0.02, glassZ - 0.02], [doorX0, height, glassZ], { shadow: false });
  kit.span(M.bronze, [x0, height - 0.06, glassZ - 0.05], [x1, height, glassZ + 0.02], { shadow: false });
  kit.span(M.bronze, [x0, 0, glassZ - 0.05], [x1, 0.05, glassZ + 0.02], { shadow: false });
  kit.span(M.bronze, [doorX0 - 0.03, 0, glassZ - 0.05], [doorX0 + 0.03, height, glassZ + 0.02]);
  kit.span(M.plasterIn, [x0, height, glassZ - 0.05], [x1, 4.1, glassZ + 0.02]);

  const door = new THREE.Group();
  const paneWidth = x1 - doorX0;
  [[M.bronze, [paneWidth, 0.05, 0.05], [paneWidth / 2, 0.03, 0]], [M.bronze, [paneWidth, 0.05, 0.05], [paneWidth / 2, height - 0.08, 0]], [M.bronze, [0.05, height - 0.06, 0.05], [0.03, (height - 0.06) / 2, 0]], [M.bronze, [0.05, height - 0.06, 0.05], [paneWidth - 0.03, (height - 0.06) / 2, 0]], [M.glass, [paneWidth - 0.08, height - 0.14, 0.012], [paneWidth / 2, (height - 0.06) / 2, 0]]]
    .forEach(([material, size, position]) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      door.add(mesh);
    });
  door.position.set(doorX0, 0, glassZ - 0.09);
  group.add(door);

  // Sân hiên riêng, tấm chắn gạch bông gió để hoa nắng rơi vào giường
  kit.span(M.oakOut, [x0, -0.02, glassZ], [x1, 0.034, 0.5], { shadow: false });
  return door;
}

export function buildInterior(group, { kit, materials: M, textures, foliage, wall, lightParent }) {
  buildLobby(group, kit, M, foliage);
  buildCorridor(kit, M);
  const terraceDoor = buildStudio(group, kit, M, foliage);
  const { pivot, plateMaterial } = buildStudioDoor(group, M, textures);
  wall.addFront(-19.2, -12.4, 0.04, 3.68, 0.42);

  const light = (x, y, z, intensity, distance) => {
    const point = new THREE.PointLight('#fff0dd', intensity, distance, 1.9);
    point.position.set(x, y, z);
    lightParent.add(point);
  };
  light(4, 3.3, -6, 22, 15);
  light(-5, 2.1, -6.6, 9, 10);
  light(-15.6, 2.2, -10.3, 6, 10);
  light(-12, 1.75, -5.6, 7, 9);

  return {
    studioDoor: pivot,
    terraceDoor,
    dispose: () => plateMaterial.dispose(),
  };
}
