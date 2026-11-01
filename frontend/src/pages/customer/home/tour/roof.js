// Sân thượng: khu giặt sấy chung dưới giàn gỗ, sàn gỗ, bồn cây và tấm pin mặt trời. Điểm dừng cuối của chuyến đi.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PLAN } from './plan.js';

function washer(kit, M, x, y, z) {
  kit.add(M.white, new RoundedBoxGeometry(0.62, 0.88, 0.62, 3, 0.03), { position: [x, y + 0.44, z] });
  kit.add(M.brass, new THREE.TorusGeometry(0.2, 0.018, 10, 40), { position: [x, y + 0.42, z + 0.315], shadow: false });
  kit.add(M.window, new THREE.CircleGeometry(0.19, 32), { position: [x, y + 0.42, z + 0.312], shadow: false });
  kit.box(M.dark, [0.32, 0.05, 0.01], [x + 0.08, y + 0.78, z + 0.312], { shadow: false });
  kit.box(M.ledTeal, [0.05, 0.016, 0.006], [x + 0.14, y + 0.78, z + 0.32], { shadow: false });
}

export function buildRoof({ kit, materials: M, foliage }) {
  const { halfWidth: W, back, roofY: Y, tower } = PLAN;
  const top = Y + 0.04;

  kit.span(M.slabEdge, [-W, Y - 0.32, back], [W, Y, 0.14]);
  kit.span(M.oakOut, [-W + 0.3, Y, back + 0.3], [W - 0.3, top, -0.2], { shadow: false });

  // Lan can: gờ thấp, kính, tay vịn đồng
  const rail = (a, b) => {
    kit.span(M.slabEdge, [a[0], Y, a[1]], [b[0], Y + 0.32, b[1]]);
    kit.span(M.glass, [a[0], Y + 0.32, a[1]], [b[0], Y + 1.12, b[1]], { shadow: false });
  };
  rail([-W, -0.05], [tower.x0, 0.14]);
  rail([tower.x1, -0.05], [W, 0.14]);
  rail([-W, back], [W, back + 0.2]);
  rail([-W, back], [-W + 0.19, 0.14]);
  rail([W - 0.19, back], [W, 0.14]);
  kit.span(M.brass, [-W, Y + 1.12, 0.02], [tower.x0, Y + 1.15, 0.06], { shadow: false });
  kit.span(M.brass, [tower.x1, Y + 1.12, 0.02], [W, Y + 1.15, 0.06], { shadow: false });
  kit.span(M.brass, [-W, Y + 1.12, back + 0.08], [W, Y + 1.15, back + 0.12], { shadow: false });
  kit.span(M.brass, [-W + 0.08, Y + 1.12, back], [-W + 0.12, Y + 1.15, 0.14], { shadow: false });

  // Khu giặt sấy: bốn máy dưới mái nhẹ, tường sau ốp men ngọc
  const x0 = -18.6;
  const x1 = -10.2;
  const z0 = -13.4;
  const z1 = -10;
  kit.span(M.plaster, [x0, top, z0], [x1, top + 2.75, z0 + 0.2]);
  kit.span(M.plaster, [x0, top, z0], [x0 + 0.2, top + 2.75, z1]);
  kit.span(M.slabEdge, [x0 - 0.3, top + 2.75, z0 - 0.1], [x1 + 0.4, top + 2.95, z1 + 0.4]);
  kit.span(M.oakOut, [x0 - 0.3, top + 2.72, z0 - 0.1], [x1 + 0.4, top + 2.75, z1 + 0.4], { shadow: false });
  kit.span(M.glaze, [x0 + 0.2, top + 1.05, z0 + 0.2], [x1, top + 1.9, z0 + 0.22], { shadow: false });
  [-17.5, -16.7, -15.9, -15.1].forEach((x) => washer(kit, M, x, top, z0 + 0.62));
  kit.span(M.oakOut, [-14.5, top + 0.84, z0 + 0.25], [-11, top + 0.9, z0 + 0.9]);
  kit.span(M.bronze, [-14.4, top, z0 + 0.3], [-14.36, top + 0.84, z0 + 0.34]);
  kit.span(M.bronze, [-11.14, top, z0 + 0.3], [-11.1, top + 0.84, z0 + 0.34]);
  kit.span(M.oakOut, [-18.2, top + 1.98, z0 + 0.2], [-11, top + 2.02, z0 + 0.5]);
  [-17, -15, -13].forEach((x) => kit.cylinder(M.fabric, 0.15, 0.13, 0.18, [x, top + 2.11, z0 + 0.36], { segments: 14 }));
  kit.span(M.lampStrip, [x0 + 0.5, top + 2.7, z0 + 1.2], [x1 - 0.3, top + 2.72, z0 + 1.26], { shadow: false });

  // Giàn gỗ che nắng nối ra khu giặt
  const pergolaTop = top + 2.85;
  for (let x = -18.5; x <= -5.5; x += 3.25) {
    kit.span(M.slabEdge, [x - 0.06, top, -2.2], [x + 0.06, pergolaTop, -2.08]);
    kit.span(M.slabEdge, [x - 0.06, top, -9.6], [x + 0.06, pergolaTop, -9.48]);
    kit.span(M.slabEdge, [x - 0.06, pergolaTop, -9.9], [x + 0.06, pergolaTop + 0.16, -1.6]);
  }
  for (let z = -9.6; z <= -2; z += 0.42) kit.span(M.oakOut, [-18.8, pergolaTop + 0.16, z - 0.03], [-5.2, pergolaTop + 0.25, z + 0.03]);

  // Bàn ghế ngoài trời và bồn cây quanh sàn
  kit.span(M.oakOut, [-13.6, top + 0.72, -6.4], [-11.2, top + 0.77, -5.5]);
  [[-13.45, -6.3], [-11.35, -6.3], [-13.45, -5.6], [-11.35, -5.6]].forEach(([x, z]) => kit.span(M.bronze, [x - 0.02, top, z - 0.02], [x + 0.02, top + 0.72, z + 0.02]));
  [-14, -12.4, -10.9].forEach((x) => kit.add(M.fabric, new RoundedBoxGeometry(0.62, 0.1, 0.5, 2, 0.04), { position: [x, top + 0.44, -7.1] }));
  [[-19.3, -8, 1.2, 8], [-19.3, -3.2, 1.2, 3.6], [-7, -0.7, 5.6, 0.9]].forEach(([x, z, w, d]) => {
    kit.span(M.planter, [x - w / 2 + 0.3, top, z - d / 2], [x + w / 2 - 0.3, top + 0.55, z + d / 2]);
    for (let i = 0; i < Math.max(w, d) * 1.5; i += 1) {
      const t = (i + 0.5) / (Math.max(w, d) * 1.5);
      foliage.shrub(x + (w > d ? (t - 0.5) * (w - 0.8) : 0), top + 0.55, z + (d > w ? (t - 0.5) * (d - 0.4) : 0), 0.46, 0.62);
    }
  });

  // Pin mặt trời cánh phải
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      kit.box(M.window, [1.7, 0.05, 1.05], [7 + column * 1.86, top + 0.5, -12 + row * 3], { rotation: [0.42, 0, 0] });
      kit.span(M.bronze, [6.6 + column * 1.86, top, -12.1 + row * 3], [6.66 + column * 1.86, top + 0.4, -12.04 + row * 3]);
    }
  }

}
