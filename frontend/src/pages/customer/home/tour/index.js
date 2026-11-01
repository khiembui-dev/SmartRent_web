// Nền 3D trang chủ: chuyến tham quan công trình theo thanh cuộn. Trang chỉ nạp module này khi cần,
// nên nội dung vẫn dùng được khi trình duyệt không có WebGL hoặc người dùng bật giảm chuyển động.
import * as THREE from 'three';
import Lenis from 'lenis';
import { buildFacade } from './facade.js';
import { createFoliage } from './foliage.js';
import { Kit, seeded } from './kit.js';
import { createMaterials } from './materials.js';
import { TourPath } from './path.js';
import { PLAN, SUN_DIRECTION } from './plan.js';
import { createPost } from './post.js';
import { FrameGovernor, pickTier } from './quality.js';
import { buildRoof } from './roof.js';
import { buildInterior } from './interior.js';
import { buildSite } from './site.js';
import { createSky, FOG_COLOR } from './sky.js';
import { createTextures } from './textures.js';

const noopScene = {
  scrollTo: (target) => target?.scrollIntoView?.({ block: 'start' }),
  refresh() {},
  destroy() {},
};

const SCROLL_DAMPING = 5.5;
const POINTER_DAMPING = 2.2;
const POINTER_REACH = 0.42;
const INTRO_SECONDS = 2.6;
const INTRO_PUSH = 9;
const nextFrame = () => new Promise((resolve) => { requestAnimationFrame(resolve); });
const damp = (current, target, rate, delta) => current + (target - current) * (1 - Math.exp(-rate * delta));
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

export function createHomeScene({ canvas, reduceMotion = false }) {
  if (!canvas) return noopScene;
  try {
    return startTour(canvas, reduceMotion);
  } catch (error) {
    // Máy không dựng được WebGL: trang vẫn dùng được, chỉ mất lớp nền 3D.
    console.warn('Không dựng được cảnh 3D:', error);
    canvas.hidden = true;
    return noopScene;
  }
}

function placeSun(sun, renderer, tier) {
  const direction = new THREE.Vector3(...SUN_DIRECTION).normalize();
  const center = new THREE.Vector3(2, 6, 14);
  sun.position.copy(center).addScaledVector(direction, 120);
  sun.target.position.copy(center);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();

  // Khung bóng ôm sát công trình và hàng cây trước sân: cùng độ phân giải nhưng nét hơn nhiều.
  const view = new THREE.Matrix4().lookAt(sun.position, center, new THREE.Vector3(0, 1, 0));
  const toLight = view.clone().setPosition(sun.position).invert();
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  [-40, 44].forEach((x) => [-18, 60].forEach((z) => [0, 22].forEach((y) => bounds.expandByPoint(corner.set(x, y, z).applyMatrix4(toLight)))));
  Object.assign(sun.shadow.camera, { left: bounds.min.x, right: bounds.max.x, top: bounds.max.y, bottom: bounds.min.y, near: Math.max(1, -bounds.max.z - 6), far: -bounds.min.z + 6 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(tier.shadow, tier.shadow);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.022;
  sun.shadow.radius = 2.2;
  renderer.shadowMap.needsUpdate = true;
}

function startTour(canvas, reduceMotion) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, depth: false, powerPreference: 'high-performance' });
  const tier = pickTier(renderer);
  const dprLimit = { value: tier.maxDpr };
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, dprLimit.value);
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const lenis = reduceMotion ? null : new Lenis({
    lerp: 0.095,
    smoothWheel: true,
    wheelMultiplier: 1,
    anchors: { offset: -60 },
  });

  const root = canvas.parentElement;
  const veilHost = root.querySelector('.vignette-overlay');
  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.08, 1100);
  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0 };
  const shot = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const path = new TourPath();
  path.measure(root);

  let world = null;
  let frameId = 0;
  let destroyed = false;
  let lastTime = 0;
  let introStart = 0;
  let smoothScroll = window.scrollY;
  let lastVeil = -1;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let stillScrollTimer = 0;

  const frameCamera = (delta, time) => {
    smoothScroll = damp(smoothScroll, window.scrollY, SCROLL_DAMPING, delta);
    path.sample(smoothScroll, shot);

    pointer.smoothX = damp(pointer.smoothX, pointer.x, POINTER_DAMPING, delta);
    pointer.smoothY = damp(pointer.smoothY, pointer.y, POINTER_DAMPING, delta);

    camera.position.copy(shot.position);
    camera.lookAt(shot.look);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);

    const reach = POINTER_REACH * shot.sway;
    camera.position.addScaledVector(right, pointer.smoothX * reach + Math.sin(time * 0.31) * 0.05 * shot.sway);
    camera.position.addScaledVector(up, pointer.smoothY * reach * 0.5 + Math.sin(time * 0.23) * 0.03 * shot.sway);

    if (introStart) {
      const progress = Math.min(1, (performance.now() - introStart) / (INTRO_SECONDS * 1000));
      camera.position.addScaledVector(forward, -INTRO_PUSH * (1 - easeOutCubic(progress)));
      if (progress >= 1) introStart = 0;
    }

    // Màn hình dọc: mở góc nhìn để công trình vẫn nằm gọn trong khung.
    const fit = Math.max(1, 1.45 / camera.aspect);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.min(0.95, Math.tan(THREE.MathUtils.degToRad(shot.fov) / 2) * fit)));
    camera.setViewOffset(width, height, 0, shot.shift * height, width, height);
  };

  /** Tắt phần chắc chắn khuất tầm nhìn: máy yếu đỡ phải vẽ cả triệu tam giác không ai thấy. */
  const cullZones = () => {
    const { x, y, z } = camera.position;
    world.zones.interior.visible = z < 40 && y < 13;
    world.zones.site.visible = !(z < -9 && x < -8);
  };

  const frameWorld = (time) => {
    cullZones();
    world.scene.fog.density = shot.mist;
    world.time.value = time;
    world.water.update(time, world.scene.fog);
    world.post.grade.exposure = shot.exposure;
    world.scene.backgroundRotation.y = time * 0.0035;
    world.doors.left.position.x = -0.76 - shot.mainDoor * 1.46;
    world.doors.right.position.x = 0.76 + shot.mainDoor * 1.46;
    world.interior.studioDoor.rotation.y = shot.studioDoor * 1.75;
    world.interior.terraceDoor.position.x = -12 - shot.terraceDoor * 2.75;
    if (veilHost && Math.abs(shot.veil - lastVeil) > 0.004) {
      lastVeil = shot.veil;
      veilHost.style.setProperty('--tour-veil', shot.veil.toFixed(3));
    }
  };

  const render = (time, delta) => {
    frameCamera(delta, time);
    frameWorld(time);
    world.post.render(delta);
  };

  const loop = (now) => {
    frameId = requestAnimationFrame(loop);
    lenis?.raf(now);
    if (!world) return;
    const elapsed = lastTime ? now - lastTime : 16;
    lastTime = now;
    world.governor.sample(elapsed);
    render(now / 1000, Math.min(elapsed / 1000, 0.1));
  };

  const resize = () => {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    // Thanh địa chỉ điện thoại thu vào khi cuộn đổi chiều cao vài chục điểm ảnh: không dựng lại khung hình vì việc đó.
    if (nextWidth === width && Math.abs(nextHeight - height) < 120) return;
    width = nextWidth;
    height = nextHeight;
    camera.aspect = width / height;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(width, height, false);
    world?.post.setSize(width, height);
    path.measure(root);
    if (world && reduceMotion) render(0, 0);
  };

  const onPointerMove = (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  };

  // Giảm chuyển động: không có camera bay, nhưng dừng cuộn ở đâu thì nền đổi đúng cảnh ở đó.
  const onStillScroll = () => {
    window.clearTimeout(stillScrollTimer);
    stillScrollTimer = window.setTimeout(() => {
      if (!world) return;
      smoothScroll = window.scrollY;
      render(0, 0);
    }, 160);
  };

  const onContextLost = (event) => {
    event.preventDefault();
    canvas.classList.remove('is-ready');
  };

  const layoutWatcher = new ResizeObserver(() => path.measure(root));
  layoutWatcher.observe(document.documentElement);
  window.addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', onContextLost);
  if (reduceMotion) window.addEventListener('scroll', onStillScroll, { passive: true });
  else window.addEventListener('pointermove', onPointerMove, { passive: true });

  const build = async () => {
    const pause = async () => {
      await nextFrame();
      if (destroyed) throw new Error('aborted');
    };
    const sunDirection = new THREE.Vector3(...SUN_DIRECTION).normalize();
    const textures = await createTextures(tier, pause);
    const sky = createSky(renderer, sunDirection);
    const materials = createMaterials(textures, sky.environment);
    await pause();

    const scene = new THREE.Scene();
    scene.background = sky.background;
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.004);

    const sun = new THREE.DirectionalLight('#fff0de', 5.2);
    sun.castShadow = true;
    scene.add(sun, sun.target);
    placeSun(sun, renderer, tier);

    const random = seeded(2026);
    const time = { value: 0 };
    const foliage = createFoliage({ materials, textures, tier, time, random });
    const zones = { site: new THREE.Group(), building: new THREE.Group(), interior: new THREE.Group() };
    scene.add(zones.site, zones.building, zones.interior);
    const shared = { materials, textures, foliage, tier, random };

    const siteKit = new Kit();
    const water = buildSite(zones.site, { ...shared, kit: siteKit });
    await pause();
    const buildingKit = new Kit();
    const { wall, doors } = buildFacade(zones.building, { ...shared, kit: buildingKit });
    buildRoof({ ...shared, kit: buildingKit });
    await pause();
    const interiorKit = new Kit();
    const interior = buildInterior(zones.interior, { ...shared, kit: interiorKit, wall, lightParent: scene });
    wall.commit(zones.building, materials.glaze);
    await pause();
    foliage.commit(zones.site);
    siteKit.commit(zones.site);
    buildingKit.commit(zones.building);
    interiorKit.commit(zones.interior);
    await pause();

    const post = createPost(renderer, scene, camera, tier);
    post.setSize(width, height);
    const governor = new FrameGovernor([
      () => {
        dprLimit.value = Math.max(1, dprLimit.value * 0.85);
        renderer.setPixelRatio(pixelRatio());
        post.setSize(width, height);
      },
      () => post.disableAo(),
      () => {
        dprLimit.value = Math.max(0.8, dprLimit.value * 0.85);
        renderer.setPixelRatio(pixelRatio());
        post.setSize(width, height);
      },
      () => post.removeBloom(),
    ]);

    // Đẩy sẵn texture lên GPU và biên dịch shader đúng cho bộ đệm hậu kỳ, ngoài luồng chính nếu trình duyệt hỗ trợ:
    // khung hình đầu tiên không phải gánh hết việc này một lúc nên trang không khựng khi cảnh sắp hiện.
    for (const texture of textures.list()) {
      renderer.initTexture(texture);
      await pause();
    }
    renderer.setRenderTarget(post.composer.inputBuffer);
    await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    await pause();
    world = { scene, post, time, water, doors, interior, zones, governor, textures, sky, materials, foliage };
    render(0, 0);
    canvas.classList.add('is-ready');
    if (!reduceMotion && window.scrollY < 40) introStart = performance.now();
  };

  build().catch((error) => {
    if (destroyed) return;
    console.warn('Không dựng được cảnh 3D:', error);
    canvas.hidden = true;
  });

  if (!reduceMotion) frameId = requestAnimationFrame(loop);

  return {
    scrollTo(target) {
      if (lenis) lenis.scrollTo(target, { offset: -60, duration: 1.2 });
      else target?.scrollIntoView?.({ block: 'start' });
    },
    refresh() {
      path.measure(root);
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('scroll', onStillScroll);
      window.clearTimeout(stillScrollTimer);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      layoutWatcher.disconnect();
      lenis?.destroy();
      if (world) {
        // Trả lại bộ nhớ đồ họa: quay lại trang chủ nhiều lần không làm cạn ngữ cảnh WebGL.
        world.scene.traverse((node) => {
          node.geometry?.dispose?.();
          if (node.isInstancedMesh) node.dispose();
        });
        world.water.dispose();
        world.interior.dispose();
        world.foliage.dispose();
        world.post.dispose();
        world.materials.dispose();
        world.textures.dispose();
        world.sky.dispose();
      }
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
