// Trang thanh toán riêng; tạo/tái sử dụng QR từ backend và chờ số dư đã đối soát qua webhook.
import InvoicePage from './invoice-page.js';

export default function InvoicePaymentPage(ctx) {
  return InvoicePage(ctx, { paymentPage: true });
}
