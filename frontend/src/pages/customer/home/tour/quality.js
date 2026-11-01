// Chọn mức chất lượng theo thiết bị rồi tiếp tục theo dõi tốc độ khung hình thật lúc chạy,
// vì cấu hình máy không nói hết được máy đó đang bận tới đâu.
const TIERS = {
  high: { name: 'high', maxDpr: 1.75, msaa: 4, shadow: 4096, ao: 'Low', bloom: true, reflection: 1024, foliage: 1, grass: 1, wind: true, textureSize: 1024, cityDetail: 1 },
  medium: { name: 'medium', maxDpr: 1.5, msaa: 2, shadow: 2048, ao: 'Performance', bloom: true, reflection: 512, foliage: 0.7, grass: 0.5, wind: true, textureSize: 1024, cityDetail: 0.7 },
  low: { name: 'low', maxDpr: 1.25, msaa: 2, shadow: 2048, ao: null, bloom: false, reflection: 0, foliage: 0.4, grass: 0, wind: false, textureSize: 512, cityDetail: 0.4 },
};

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/i;
const INTEGRATED_GPU = /intel|uhd|iris|mali|adreno|powervr|apple/i;

function gpuName(renderer) {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
}

export function pickTier(renderer) {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const phone = coarse && Math.min(window.screen.width, window.screen.height) < 820;
  const lowMemory = (navigator.deviceMemory ?? 8) <= 4;
  const gpu = gpuName(renderer);
  if (phone || lowMemory || SOFTWARE_GPU.test(gpu)) return TIERS.low;
  if (coarse || INTEGRATED_GPU.test(gpu)) return TIERS.medium;
  return TIERS.high;
}

const SAMPLE_FRAMES = 50;
const SLOW_FRAME_MS = 21; // dưới khoảng 48 khung hình mỗi giây

/**
 * Hạ chất lượng từng nấc khi máy không theo kịp và không nâng lại, để hình không nhảy qua nhảy lại giữa chừng.
 * Bỏ qua khung quá dài: đó là lúc đổi tab hoặc trình duyệt đang bận việc khác, không phải do cảnh nặng.
 */
export class FrameGovernor {
  constructor(steps) {
    this.steps = steps;
    this.total = 0;
    this.count = 0;
  }

  sample(frameMs) {
    if (!this.steps.length || frameMs > 120) return;
    this.total += frameMs;
    this.count += 1;
    if (this.count < SAMPLE_FRAMES) return;
    const average = this.total / this.count;
    this.total = 0;
    this.count = 0;
    if (average > SLOW_FRAME_MS) this.steps.shift()();
  }
}
