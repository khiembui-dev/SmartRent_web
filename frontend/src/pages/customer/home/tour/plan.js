// Bản vẽ của công trình, đơn vị mét. x sang phải, y lên trên, z hướng về phía người xem; mặt tiền nằm ở z = 0.
// Mọi module dựng cảnh và đường camera đọc chung các số này, sửa ở đây là cả công trình đổi theo.
export const PLAN = {
  halfWidth: 20,
  back: -14,
  groundHeight: 4.4,
  floorHeight: 3.3,
  floors: 4,
  roofY: 17.6,
  bay: 4,
  glassZ: -2,
  windowZ: -1.6,

  // Lõi thang phủ gạch bông gió, nằm trên lối vào.
  tower: { x0: -4, x1: 4, z: 0.55, top: 19.8 },

  entrance: { halfWidth: 3, doorHeight: 2.9, canopyY: 4, canopyFront: 3.4 },

  lobby: { x0: -8.5, x1: 10, z0: -11.4, z1: -2, height: 7.7 },
  corridor: { x0: -18, x1: -8.5, z0: -11.4, z1: -9.2, height: 2.9 },
  studio: { x0: -15.5, x1: -8.5, z0: -9.2, z1: -2, height: 3.2, doorX0: -11.6, doorX1: -10.6 },

  pool: { x0: -19, x1: -3.8, z0: 7, z1: 36, y: -0.1 },
};

// Nắng sớm thấp, xiên từ phía trước bên trái: bóng dài trên mặt đứng, ánh nắng vào sâu tới sảnh và phòng.
export const SUN_DIRECTION = [-0.5, 0.46, 0.73];

export const PALETTE = {
  plaster: '#f4f3ee',
  haze: '#e4edf0',
  glaze: '#4c9a9c',
  door: '#1f5662',
  doorDeep: '#143a42',
  blueGrey: '#8fa6ae',
  brass: '#c9a35b',
  lamp: '#ffd9a6',
};
