// Mọi vân bề mặt được vẽ ngay trên trình duyệt: không phải tải ảnh, không phụ thuộc nguồn ảnh có bản quyền.
import * as THREE from 'three';
import { seeded } from './kit.js';

function surface(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }) };
}

function tileNoise(size, random, octaves) {
  const field = new Float32Array(size * size);
  octaves.forEach(([cells, amplitude]) => {
    const grid = Float32Array.from({ length: cells * cells }, () => random());
    const step = cells / size;
    for (let y = 0; y < size; y += 1) {
      const gy = y * step;
      const y0 = Math.floor(gy);
      const ty = gy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x += 1) {
        const gx = x * step;
        const x0 = Math.floor(gx);
        const tx = gx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;
        const top = grid[y0 * cells + x0] * (1 - sx) + grid[y0 * cells + x1] * sx;
        const bottom = grid[y1 * cells + x0] * (1 - sx) + grid[y1 * cells + x1] * sx;
        field[y * size + x] += (top * (1 - sy) + bottom * sy) * amplitude;
      }
    }
  });
  return field;
}

function paintField(size, field, shade) {
  const { canvas, ctx } = surface(size);
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < field.length; i += 1) {
    const [r, g, b] = shade(field[i]);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function normalFromField(size, field, strength) {
  const { canvas, ctx } = surface(size);
  const image = ctx.createImageData(size, size);
  const at = (x, y) => field[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const scale = 127 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = 128 + dx * scale;
      image.data[i + 1] = 128 + dy * scale;
      image.data[i + 2] = 128 + scale;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function toTexture(canvas, { color = true, anisotropy = 8 } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function plaster(size) {
  const random = seeded(11);
  const field = tileNoise(size, random, [[6, 0.34], [24, 0.22], [96, 0.24], [192, 0.2]]);
  const map = paintField(size, field, (v) => {
    const shade = 244 + (v - 0.5) * 12;
    return [shade, shade - 0.5, shade - 3];
  });
  return { map: toTexture(map), normal: toTexture(normalFromField(size, field, 1.4), { color: false }) };
}

function terrazzo(size) {
  const random = seeded(23);
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = '#e6eae7';
  ctx.fillRect(0, 0, size, size);
  const chips = [
    ['#f7f8f4', 42], ['#d3dcdc', 30], ['#b3c3c6', 16], ['#8fa6ae', 6], ['#7fb6b4', 5], ['#d6bb82', 1],
  ];
  const pick = () => {
    let roll = random() * 100;
    return chips.find(([, weight]) => (roll -= weight) < 0)?.[0] ?? chips[0][0];
  };
  const count = Math.round(size * 9);
  for (let i = 0; i < count; i += 1) {
    const cx = random() * size;
    const cy = random() * size;
    const radius = (1.6 + random() ** 2.6 * 9) * (size / 1024);
    const sides = 4 + Math.floor(random() * 4);
    ctx.fillStyle = pick();
    [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]].forEach(([ox, oy]) => {
      if (cx + ox < -20 || cx + ox > size + 20 || cy + oy < -20 || cy + oy > size + 20) return;
      ctx.beginPath();
      for (let s = 0; s < sides; s += 1) {
        const angle = (s / sides) * Math.PI * 2 + random() * 0.5;
        const reach = radius * (0.6 + random() * 0.6);
        ctx.lineTo(cx + ox + Math.cos(angle) * reach, cy + oy + Math.sin(angle) * reach);
      }
      ctx.fill();
    });
  }
  return { map: toTexture(canvas, { anisotropy: 12 }) };
}

function oak(size) {
  const random = seeded(37);
  const { canvas, ctx } = surface(size);
  const planks = 6;
  const width = size / planks;
  for (let p = 0; p < planks; p += 1) {
    const lightness = 73 + random() * 6;
    ctx.fillStyle = `hsl(${31 + random() * 4} 27% ${lightness}%)`;
    ctx.fillRect(p * width, 0, width, size);
    const strokes = Math.round(size * 0.12);
    for (let s = 0; s < strokes; s += 1) {
      const x = p * width + random() * width;
      const sway = (random() - 0.5) * 22;
      ctx.strokeStyle = `hsla(${28 + random() * 8} 40% ${random() > 0.5 ? 46 : 84}% / ${0.05 + random() * 0.12})`;
      ctx.lineWidth = 0.5 + random() * 1.6;
      ctx.beginPath();
      const y = random() * size;
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + sway, y + 160, x + sway * 0.4, y + 300 + random() * 300);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70, 48, 26, .28)';
    ctx.fillRect(p * width, 0, 1.2, size);
  }
  return { map: toTexture(canvas, { anisotropy: 12 }) };
}

function pavers(size) {
  const random = seeded(41);
  const { canvas: heightCanvas, ctx: heightCtx } = surface(size);
  const { canvas, ctx } = surface(size);
  const columns = 4;
  const rows = 2;
  const cellW = size / columns;
  const cellH = size / rows;
  const joint = Math.max(2, size / 340);
  ctx.fillStyle = '#87949a';
  ctx.fillRect(0, 0, size, size);
  heightCtx.fillStyle = '#000';
  heightCtx.fillRect(0, 0, size, size);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const shade = 188 + random() * 15;
      ctx.fillStyle = `rgb(${shade - 3} ${shade + 2} ${shade + 2})`;
      ctx.fillRect(column * cellW + joint, row * cellH + joint, cellW - joint * 2, cellH - joint * 2);
      heightCtx.fillStyle = '#fff';
      heightCtx.fillRect(column * cellW + joint, row * cellH + joint, cellW - joint * 2, cellH - joint * 2);
    }
  }
  const speckles = Math.round(size * 12);
  for (let i = 0; i < speckles; i += 1) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(70,86,90,.08)';
    ctx.fillRect(random() * size, random() * size, 1.6, 1.6);
  }
  const data = heightCtx.getImageData(0, 0, size, size).data;
  const field = new Float32Array(size * size);
  for (let i = 0; i < field.length; i += 1) field[i] = data[i * 4] / 255;
  return { map: toTexture(canvas, { anisotropy: 12 }), normal: toTexture(normalFromField(size, field, 2.4), { color: false, anisotropy: 12 }) };
}

function lawn(size) {
  const random = seeded(53);
  const field = tileNoise(size, random, [[5, 0.4], [18, 0.28], [80, 0.18], [220, 0.14]]);
  const map = paintField(size, field, (v) => {
    const t = Math.min(1, Math.max(0, (v - 0.32) * 2.8));
    return [96 + t * 30, 126 + t * 28, 112 + t * 24];
  });
  return { map: toTexture(map, { anisotropy: 12 }) };
}

function stone(size) {
  const random = seeded(61);
  const { canvas, ctx } = surface(size);
  const courses = 9;
  const height = size / courses;
  for (let row = 0; row < courses; row += 1) {
    let x = -random() * height * 3;
    while (x < size) {
      const length = height * (2 + random() * 3.4);
      const light = 58 + random() * 11;
      ctx.fillStyle = `hsl(${197 + random() * 6} 12% ${light}%)`;
      ctx.fillRect(x, row * height, length - 2, height - 2);
      x += length;
    }
  }
  return { map: toTexture(canvas) };
}

function linen(size) {
  const random = seeded(71);
  const { canvas, ctx } = surface(size);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 2) {
    ctx.fillStyle = `rgba(90, 100, 100, ${0.012 + random() * 0.03})`;
    ctx.fillRect(0, i, size, 1);
    ctx.fillRect(i, 0, 1, size);
  }
  return { map: toTexture(canvas) };
}

function leaves(size, { seedValue, count, shape, colors }) {
  const random = seeded(seedValue);
  const { canvas, ctx } = surface(size);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    const inset = size * 0.14;
    const x = inset + random() * (size - inset * 2);
    const y = inset + random() * (size - inset * 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(random() * Math.PI * 2);
    const scale = (0.75 + random() * 0.5) * (size / 512);
    ctx.scale(scale, scale);
    ctx.fillStyle = colors[Math.floor(random() * colors.length)];
    shape(ctx);
    ctx.restore();
  }
  return leafTexture(ctx, size);
}

/**
 * Canvas lưu màu vùng trong suốt là đen, khi trình duyệt thu nhỏ ảnh lá màu đen đó lẫn vào viền lá
 * và tán cây ở xa thành các chấm lấm tấm. Điền màu lá trung bình vào vùng trong suốt để tránh việc này.
 */
function leafTexture(ctx, size) {
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const sum = [0, 0, 0];
  let solid = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 200) {
      sum[0] += pixels[i];
      sum[1] += pixels[i + 1];
      sum[2] += pixels[i + 2];
      solid += 1;
    }
  }
  const average = sum.map((value) => value / Math.max(1, solid));
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 10) {
      pixels[i] = average[0];
      pixels[i + 1] = average[1];
      pixels[i + 2] = average[2];
    }
  }
  const texture = new THREE.DataTexture(new Uint8Array(pixels.buffer), size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const broadLeaf = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0, -34);
  ctx.bezierCurveTo(24, -26, 24, 16, 0, 40);
  ctx.bezierCurveTo(-24, 16, -24, -26, 0, -34);
  ctx.fill();
};

const slimLeaf = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(0, -74);
  ctx.bezierCurveTo(10, -34, 9, 28, 0, 76);
  ctx.bezierCurveTo(-9, 28, -10, -34, 0, -74);
  ctx.fill();
};

const LEAF_GREENS = ['#4f7d62', '#3f6d57', '#5d8a6c', '#35604d', '#6b9674'];

/** Biển chữ thương hiệu trên mái sảnh; dùng font của trang nếu đã tải xong. */
function sign(fontReady) {
  const { canvas, ctx } = surface(1024, 192);
  ctx.clearRect(0, 0, 1024, 192);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 132px ${fontReady ? "'Be Vietnam Pro'" : 'system-ui'}, sans-serif`;
  ctx.fillText('SmartRent', 512, 100);
  const texture = toTexture(canvas, { anisotropy: 8 });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Biển số phòng tráng men: đúng hình ảnh biển phòng của thương hiệu. */
function roomPlate(text) {
  const { canvas, ctx } = surface(512, 256);
  ctx.fillStyle = '#143a42';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#c9a35b';
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 484, 228);
  ctx.fillStyle = '#f4f3ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "700 128px 'Be Vietnam Pro', system-ui, sans-serif";
  ctx.fillText(text, 256, 134);
  const texture = toTexture(canvas, { anisotropy: 8 });
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export async function createTextures(tier, pause) {
  const size = tier.textureSize;
  const noiseSize = Math.min(size, 512);
  const fontReady = await document.fonts?.load("700 132px 'Be Vietnam Pro'").then((faces) => faces.length > 0).catch(() => false);
  const set = {};
  set.plaster = plaster(noiseSize);
  await pause();
  set.terrazzo = terrazzo(size);
  set.oak = oak(size);
  await pause();
  set.pavers = pavers(size);
  set.lawn = lawn(noiseSize);
  await pause();
  set.stone = stone(size);
  set.linen = linen(256);
  set.leafBroad = leaves(size / 2, { seedValue: 83, count: 120, shape: broadLeaf, colors: LEAF_GREENS });
  set.leafSlim = leaves(size / 2, { seedValue: 89, count: 54, shape: slimLeaf, colors: LEAF_GREENS });
  set.sign = sign(fontReady);
  set.plate = roomPlate('A102');
  await pause();
  const list = () => Object.values(set).flatMap((entry) => (entry.isTexture ? [entry] : Object.values(entry)));
  return {
    ...set,
    list,
    dispose: () => list().forEach((texture) => texture.dispose()),
  };
}
