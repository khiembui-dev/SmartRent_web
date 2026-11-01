// Hậu kỳ: chỉ giữ thứ làm hình đẹp lên rõ rệt. AO cho các góc khuất có khối, bloom nhẹ cho đèn và kim loại,
// tone mapping giữ đúng màu thương hiệu. Vignette đã có sẵn ở lớp CSS nên không tính lại ở đây.
import * as THREE from 'three';
import { BloomEffect, Effect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const gradeFragment = /* glsl */ `
  uniform float exposure;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 color = inputColor.rgb * exposure;
    // Kéo nhẹ độ tương phản quanh trung tính để khối tường và bóng đổ có chiều sâu.
    color = pow(max(color, vec3(0.0)) / 0.5, vec3(1.1)) * 0.5;
    outputColor = vec4(color, inputColor.a);
  }
`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', gradeFragment, { uniforms: new Map([['exposure', new THREE.Uniform(1)]]) });
  }

  set exposure(value) {
    this.uniforms.get('exposure').value = value;
  }
}

export function createPost(renderer, scene, camera, tier) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: tier.msaa });
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getSize(new THREE.Vector2());
  let ao = null;
  if (tier.ao) {
    ao = new N8AOPostPass(scene, camera, size.x, size.y);
    ao.setQualityMode(tier.ao);
    Object.assign(ao.configuration, {
      aoRadius: 1.35,
      distanceFalloff: 1,
      intensity: 3.1,
      halfRes: true,
      depthAwareUpsampling: true,
      gammaCorrection: false,
      transparencyAware: false,
      accumulate: false,
    });
    ao.configuration.color = new THREE.Color('#123036');
    composer.addPass(ao);
  }

  const grade = new GradeEffect();
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
  const bloom = tier.bloom ? new BloomEffect({ mipmapBlur: true, intensity: 0.42, luminanceThreshold: 1.05, luminanceSmoothing: 0.25, radius: 0.72 }) : null;
  const effects = [bloom, grade, tone].filter(Boolean);
  const pass = new EffectPass(camera, ...effects);
  pass.dithering = true;
  composer.addPass(pass);

  return {
    composer,
    grade,
    render: (delta) => composer.render(delta),
    setSize: (width, height) => composer.setSize(width, height),
    disableAo() {
      if (ao) ao.enabled = false;
    },
    removeBloom() {
      if (bloom) pass.setEffects([grade, tone]);
    },
    dispose: () => composer.dispose(),
  };
}
