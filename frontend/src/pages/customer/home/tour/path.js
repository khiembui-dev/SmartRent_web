// Đường camera: một cú máy liền mạch. Mỗi section của trang gắn với một đoạn đường, vị trí tính từ bố cục thật
// của trang nên đổi nội dung hay cỡ màn hình camera vẫn đi đúng nhịp, và cuộn nhanh tới đâu cũng không nhảy cảnh.
import * as THREE from 'three';

const SECTIONS = ['#hero', '#rooms-section', '#pricing-section', '#features-section', '#process-section'];
const SCALARS = ['yaw', 'pitch', 'fov', 'shift', 'mist', 'veil', 'exposure', 'sway', 'mainDoor', 'studioDoor', 'terraceDoor'];

const START = { fov: 24, shift: 0, mist: 0.004, veil: 0, exposure: 1, sway: 1, mainDoor: 0, studioDoor: 0, terraceDoor: 0 };

// `at` là vị trí trong section (0 đầu, 1 cuối). Giá trị bỏ trống giữ nguyên như cảnh trước.
// Ngoài trời camera đặt ngang tầm và dùng `shift` như ống kính shift của ảnh kiến trúc: tường luôn thẳng đứng.
const SHOTS = [
  // Toàn cảnh
  { section: 0, at: 0, pos: [36, 6, 104], look: [3, 6, 0], fov: 22, shift: -0.41, mist: 0.0056 },
  { section: 0, at: 0.6, pos: [28, 2.8, 84], look: [1, 2.8, 0], fov: 25, shift: -0.27, mist: 0.0032 },
  // Tiến lại gần
  { section: 1, at: 0, pos: [15, 1.9, 66], look: [-1, 1.9, 0], fov: 27, shift: -0.25, mist: 0.0024 },
  { section: 1, at: 0.5, pos: [0.4, 1.7, 44], look: [-2, 1.7, 0], fov: 30, shift: -0.24 },
  // Lối vào
  { section: 2, at: 0, pos: [-0.8, 1.65, 24], look: [-0.4, 1.8, 0], fov: 34, shift: -0.2, mist: 0.0018 },
  { section: 2, at: 0.34, pos: [0, 1.62, 7.5], look: [0, 1.9, -6], fov: 46, shift: -0.08, mainDoor: 0.12, sway: 0.8 },
  { section: 2, at: 0.62, pos: [0.1, 1.6, -1.2], look: [1.6, 2.1, -11], fov: 58, shift: 0, mainDoor: 1, mist: 0.0006, veil: 0.1, sway: 0.5 },
  { section: 2, at: 0.9, pos: [-2.6, 1.6, -6.2], look: [5, 1.7, -11.4], fov: 60 },
  { section: 3, at: 0.06, pos: [-4.8, 1.6, -8.3], look: [-4.8, 1.7, -11.4], fov: 62 },
  // Bên trong: hành lang, cận cảnh khóa vân tay, vào phòng
  { section: 3, at: 0.24, pos: [-6.7, 1.58, -9.95], look: [-12, 1.5, -10.1], fov: 62, sway: 0.3 },
  { section: 3, at: 0.44, pos: [-10.05, 1.42, -10.45], look: [-10.78, 1.26, -9.18], fov: 36, sway: 0.1 },
  { section: 3, at: 0.6, pos: [-11.1, 1.55, -10.05], look: [-11.3, 1.45, -5], fov: 60, studioDoor: 1, sway: 0.2 },
  { section: 3, at: 0.74, pos: [-11.1, 1.5, -7.3], look: [-14.2, 1, -4.6], fov: 62, sway: 0.25 },
  // Ra sân hiên, ngoảnh về phía công trình rồi bay lên sân thượng
  { section: 3, at: 0.9, pos: [-10.6, 1.55, -3.9], look: [-9.6, 2, 8], fov: 58, terraceDoor: 1 },
  { section: 4, at: 0.06, pos: [-10.2, 1.8, 1.6], look: [-2, 3, 24], fov: 58, mist: 0.0012, veil: 0.14 },
  { section: 4, at: 0.3, pos: [-10.6, 5, 8.4], look: [14, 6, 10], fov: 54, sway: 0.5 },
  { section: 4, at: 0.56, pos: [-12, 13, 10], look: [2, 13, -2], fov: 50 },
  { section: 4, at: 0.8, pos: [-9, 20.2, 3], look: [-11, 19, -10], fov: 52, mist: 0.0024 },
  { section: 4, at: 1, pos: [-7.6, 19.5, -3.4], look: [-14.5, 18.8, -12], fov: 54, sway: 0.4 },
];

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Đổi điểm nhìn thành góc quay. Nếu nội suy điểm nhìn, khi điểm đó lướt ngang gần camera hướng nhìn sẽ quật rất nhanh;
 * nội suy trực tiếp góc quay thì tốc độ xoay luôn đều. Mỗi cảnh quay theo chiều ngắn nhất so với cảnh trước.
 */
function withAngles(shots) {
  let previousYaw = 0;
  return shots.map((shot, index) => {
    const dx = shot.look[0] - shot.pos[0];
    const dy = shot.look[1] - shot.pos[1];
    const dz = shot.look[2] - shot.pos[2];
    let yaw = Math.atan2(dx, -dz);
    if (index > 0) {
      while (yaw - previousYaw > Math.PI) yaw -= Math.PI * 2;
      while (yaw - previousYaw < -Math.PI) yaw += Math.PI * 2;
    }
    previousYaw = yaw;
    return { ...shot, yaw, pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  });
}

/** Nội suy đơn điệu: tốc độ liền mạch qua các mốc mà không vọt lố. */
class MonotoneCubic {
  constructor(xs, ys) {
    const n = xs.length;
    const slopes = [];
    const gaps = [];
    for (let i = 0; i < n - 1; i += 1) {
      gaps[i] = xs[i + 1] - xs[i];
      slopes[i] = (ys[i + 1] - ys[i]) / gaps[i];
    }
    const tangents = new Array(n);
    tangents[0] = slopes[0];
    tangents[n - 1] = slopes[n - 2];
    for (let i = 1; i < n - 1; i += 1) {
      if (slopes[i - 1] * slopes[i] <= 0) {
        tangents[i] = 0;
      } else {
        const w1 = 2 * gaps[i] + gaps[i - 1];
        const w2 = gaps[i] + 2 * gaps[i - 1];
        tangents[i] = (w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i]);
      }
    }
    Object.assign(this, { xs, ys, gaps, tangents });
  }

  at(x) {
    const { xs, ys, gaps, tangents } = this;
    const last = xs.length - 1;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[last]) return ys[last];
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (xs[middle] > x) high = middle;
      else low = middle;
    }
    const h = gaps[low];
    const t = (x - xs[low]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[low] + (t3 - 2 * t2 + t) * h * tangents[low]
      + (-2 * t3 + 3 * t2) * ys[low + 1] + (t3 - t2) * h * tangents[low + 1];
  }
}

export class TourPath {
  constructor() {
    let carried = START;
    this.shots = withAngles(SHOTS.map((shot) => {
      carried = { ...carried, ...shot };
      return carried;
    }));
    this.positions = new THREE.CatmullRomCurve3(this.shots.map((shot) => new THREE.Vector3(...shot.pos)), false, 'centripetal');
    const indices = this.shots.map((_, i) => i);
    this.tracks = Object.fromEntries(SCALARS.map((key) => [key, new MonotoneCubic(indices, this.shots.map((shot) => shot[key]))]));
    this.toIndex = null;
    this.maxScroll = 0;
  }

  /** Đo lại vị trí các section. Gọi khi đổi cỡ màn hình hoặc nội dung trang thay đổi chiều cao. */
  measure(root) {
    const viewport = window.innerHeight;
    const scrollTop = window.scrollY;
    this.maxScroll = Math.max(1, document.documentElement.scrollHeight - viewport);
    const stops = SECTIONS.map((selector, index) => {
      if (index === 0) return 0;
      const element = root.querySelector(selector);
      return element ? element.getBoundingClientRect().top + scrollTop - viewport * 0.5 : this.maxScroll;
    });
    stops.push(this.maxScroll);
    let previous = -1;
    const knots = this.shots.map((shot) => {
      const position = lerp(stops[shot.section], stops[shot.section + 1], shot.at);
      previous = Math.max(position, previous + 1);
      return previous;
    });
    this.toIndex = new MonotoneCubic(knots, this.shots.map((_, i) => i));
  }

  /** Ghi trạng thái camera tại vị trí cuộn vào `out`. */
  sample(scroll, out) {
    const index = this.toIndex.at(scroll);
    const t = index / (this.shots.length - 1);
    this.positions.getPoint(t, out.position);
    SCALARS.forEach((key) => {
      out[key] = this.tracks[key].at(index);
    });
    const flat = Math.cos(out.pitch);
    out.look.set(
      out.position.x + Math.sin(out.yaw) * flat,
      out.position.y + Math.sin(out.pitch),
      out.position.z - Math.cos(out.yaw) * flat,
    );
    return out;
  }
}
