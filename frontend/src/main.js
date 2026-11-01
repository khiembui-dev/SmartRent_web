// Điểm vào ứng dụng. Thư viện nặng (DataTables, Chart.js, Flatpickr, Tom Select, FilePond, GSAP) chỉ nạp ở trang cần.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import 'animate.css';
import './styles/main.scss';

import { startApp } from './app.js';

startApp().catch((error) => {
  console.error(error);
  const root = document.getElementById('app');
  root.innerHTML = '<div class="boot-screen" role="alert"><span class="boot-plate">SR</span><span>Không khởi động được SmartRent. Tải lại trang hoặc kiểm tra cấu hình môi trường.</span></div>';
});
