// Service interface dùng chung cho mock và API thật. Đường dẫn khớp docs/api/openapi.yaml.
// Trang/component chỉ gọi các hàm ở đây, không hardcode endpoint.
import { http } from './client.js';

const id = encodeURIComponent;
const withKey = (idempotencyKey) => (idempotencyKey ? { idempotencyKey } : {});

export const authApi = {
  login: (email, password) => http.post('/api/v1/auth/login', { email, password }),
  register: (body) => http.post('/api/v1/auth/register', body),
  logout: () => http.post('/api/v1/auth/logout', {}),
  forgotPassword: (email) => http.post('/api/v1/auth/forgot-password', { email }),
  resetPassword: (token, newPassword) => http.post('/api/v1/auth/reset-password', { token, newPassword }),
  me: () => http.get('/api/v1/me', undefined, { organization: false }),
  changePassword: (body) => http.post('/api/v1/me/change-password', body),
  updateProfile: (body) => http.put('/api/v1/me/profile', body),
  sessions: () => http.get('/api/v1/me/sessions'),
  revokeSession: (sessionId) => http.delete(`/api/v1/me/sessions/${id(sessionId)}`),
};

export const publicApi = {
  addressUnits: () => http.get('/api/v1/public/administrative-units'),
  filters: () => http.get('/api/v1/public/filters'),
  rooms: (query, options) => http.get('/api/v1/public/rooms', query, options),
  room: (slug) => http.get(`/api/v1/public/rooms/${id(slug)}`),
  contactInfo: () => http.get('/api/v1/public/contact-info'),
};

// Trợ lý AI chỉ đọc. Một câu hỏi có thể mất vài chục giây vì máy chủ gọi dịch vụ AI và tra cứu dữ liệu nhiều lần.
const AI_TIMEOUT_MS = 170000;
export const aiApi = {
  conversations: () => http.get('/api/v1/ai/conversations'),
  create: (body = {}) => http.post('/api/v1/ai/conversations', body),
  conversation: (conversationId) => http.get(`/api/v1/ai/conversations/${id(conversationId)}`),
  send: (conversationId, content, options = {}) => http.post(`/api/v1/ai/conversations/${id(conversationId)}/messages`, { content }, { timeoutMs: AI_TIMEOUT_MS, ...options }),
  remove: (conversationId) => http.delete(`/api/v1/ai/conversations/${id(conversationId)}`),
};
export const portalAiApi = {
  conversations: () => http.get('/api/v1/portal/ai/conversations'),
  create: (body = {}) => http.post('/api/v1/portal/ai/conversations', body),
  conversation: (conversationId) => http.get(`/api/v1/portal/ai/conversations/${id(conversationId)}`),
  send: (conversationId, content, options = {}) => http.post(`/api/v1/portal/ai/conversations/${id(conversationId)}/messages`, { content }, { timeoutMs: AI_TIMEOUT_MS, ...options }),
  remove: (conversationId) => http.delete(`/api/v1/portal/ai/conversations/${id(conversationId)}`),
};

export const dashboardApi = {
  get: (query, options) => http.get('/api/v1/dashboard', query, options),
};

export const catalogApi = {
  get: () => http.get('/api/v1/catalog'),
  create: (kind, body) => http.post(`/api/v1/catalog/${kind}`, body),
  update: (kind, itemId, body) => http.put(`/api/v1/catalog/${kind}/${id(itemId)}`, body),
};

export const propertiesApi = {
  list: (query, options) => http.get('/api/v1/properties', query, options),
  get: (propertyId) => http.get(`/api/v1/properties/${id(propertyId)}`),
  create: (body) => http.post('/api/v1/properties', body),
  update: (propertyId, body) => http.put(`/api/v1/properties/${id(propertyId)}`, body),
  deactivate: (propertyId, reason) => http.post(`/api/v1/properties/${id(propertyId)}/deactivate`, { reason }),
  activate: (propertyId) => http.post(`/api/v1/properties/${id(propertyId)}/activate`, {}),
  remove: (propertyId) => http.delete(`/api/v1/properties/${id(propertyId)}`),
  changeRate: (propertyId, body) => http.post(`/api/v1/properties/${id(propertyId)}/rates`, body),
  previewRate: (propertyId, body) => http.post(`/api/v1/properties/${id(propertyId)}/rates/preview`, body),
};

export const roomsApi = {
  list: (query, options) => http.get('/api/v1/rooms', query, options),
  get: (roomId) => http.get(`/api/v1/rooms/${id(roomId)}`),
  create: (body) => http.post('/api/v1/rooms', body),
  update: (roomId, body) => http.put(`/api/v1/rooms/${id(roomId)}`, body),
  remove: (roomId) => http.delete(`/api/v1/rooms/${id(roomId)}`),
  setStatus: (roomId, status, reason) => http.post(`/api/v1/rooms/${id(roomId)}/status`, { status, reason }),
  saveListing: (roomId, body) => http.put(`/api/v1/rooms/${id(roomId)}/listing`, body),
  addImage: (roomId, fileId, caption) => http.post(`/api/v1/rooms/${id(roomId)}/images`, { fileId, caption }),
  arrangeImages: (roomId, body) => http.patch(`/api/v1/rooms/${id(roomId)}/images`, body),
  removeImage: (roomId, imageId) => http.delete(`/api/v1/rooms/${id(roomId)}/images/${id(imageId)}`),
  addAsset: (roomId, body) => http.post(`/api/v1/rooms/${id(roomId)}/assets`, body),
  updateAsset: (roomId, assetId, body) => http.put(`/api/v1/rooms/${id(roomId)}/assets/${id(assetId)}`, body),
  changeRate: (roomId, body) => http.post(`/api/v1/rooms/${id(roomId)}/rates`, body),
  endRate: (roomId, rateId, effectiveTo) => http.post(`/api/v1/rooms/${id(roomId)}/rates/${id(rateId)}/end`, { effectiveTo }),
  availability: (roomId, query) => http.get(`/api/v1/rooms/${id(roomId)}/availability`, query),
};

export const inquiriesApi = {
  decide: (inquiryId, body) => http.post(`/api/v1/inquiries/${id(inquiryId)}/decision`, body),
  list: (query, options) => http.get('/api/v1/inquiries', query, options),
  get: (inquiryId) => http.get(`/api/v1/inquiries/${id(inquiryId)}`),
  create: (body) => http.post('/api/v1/inquiries', body),
  transition: (inquiryId, body) => http.post(`/api/v1/inquiries/${id(inquiryId)}/transitions`, body),
  addEvent: (inquiryId, body) => http.post(`/api/v1/inquiries/${id(inquiryId)}/events`, body),
  assign: (inquiryId, userId) => http.put(`/api/v1/inquiries/${id(inquiryId)}/assign`, { userId }),
  scheduleViewing: (inquiryId, body) => http.post(`/api/v1/inquiries/${id(inquiryId)}/viewings`, body),
  linkTenant: (inquiryId, body) => http.post(`/api/v1/inquiries/${id(inquiryId)}/tenant`, body),
};

export const viewingsApi = {
  list: (query, options) => http.get('/api/v1/viewings', query, options),
  result: (viewingId, body) => http.post(`/api/v1/viewings/${id(viewingId)}/result`, body),
};

export const reservationsApi = {
  list: (query, options) => http.get('/api/v1/reservations', query, options),
  get: (reservationId) => http.get(`/api/v1/reservations/${id(reservationId)}`),
  create: (body, key) => http.post('/api/v1/reservations', body, withKey(key)),
  cancel: (reservationId, reason) => http.post(`/api/v1/reservations/${id(reservationId)}/cancel`, { reason }),
  extend: (reservationId, body) => http.post(`/api/v1/reservations/${id(reservationId)}/extend`, body),
};

export const tenantsApi = {
  list: (query, options) => http.get('/api/v1/tenants', query, options),
  get: (tenantId) => http.get(`/api/v1/tenants/${id(tenantId)}`),
  create: (body) => http.post('/api/v1/tenants', body),
  update: (tenantId, body) => http.put(`/api/v1/tenants/${id(tenantId)}`, body),
  duplicates: (query) => http.get('/api/v1/tenants/duplicates', query),
  addIdentityDocument: (tenantId, body) => http.post(`/api/v1/tenants/${id(tenantId)}/identity-documents`, body),
  verifyIdentityDocument: (tenantId, docId) => http.post(`/api/v1/tenants/${id(tenantId)}/identity-documents/${id(docId)}/verify`, {}),
  invitePortal: (tenantId) => http.post(`/api/v1/tenants/${id(tenantId)}/portal-invitation`, {}),
  sendPasswordReset: (tenantId) => http.post(`/api/v1/tenants/${id(tenantId)}/password-reset-link`, {}),
  setPassword: (tenantId, newPassword) => http.post(`/api/v1/tenants/${id(tenantId)}/password`, { newPassword }),
};

export const profileRequestsApi = {
  list: (query, options) => http.get('/api/v1/profile-change-requests', query, options),
  approve: (requestId, reviewNotes) => http.post(`/api/v1/profile-change-requests/${id(requestId)}/approve`, { reviewNotes }),
  reject: (requestId, reviewNotes) => http.post(`/api/v1/profile-change-requests/${id(requestId)}/reject`, { reviewNotes }),
};

export const tenanciesApi = {
  list: (query, options) => http.get('/api/v1/tenancies', query, options),
  get: (tenancyId) => http.get(`/api/v1/tenancies/${id(tenancyId)}`),
  checkIn: (body, key) => http.post('/api/v1/tenancies/check-in', body, withKey(key)),
  addResident: (tenancyId, body) => http.post(`/api/v1/tenancies/${id(tenancyId)}/residents`, body),
  residentLeave: (tenancyId, residentId, leftOn) => http.post(`/api/v1/tenancies/${id(tenancyId)}/residents/${id(residentId)}/leave`, { leftOn }),
  resolveGap: (tenancyId, gapId, notes) => http.post(`/api/v1/tenancies/${id(tenancyId)}/onboarding-gaps/${id(gapId)}/resolve`, { notes }),
  importContract: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/contracts`, body, withKey(key)),
  cancelImport: (tenancyId, reason) => http.post(`/api/v1/tenancies/${id(tenancyId)}/cancel-import`, { reason }),
  transfer: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/transfer`, body, withKey(key)),
  checkoutPreview: (tenancyId, body) => http.post(`/api/v1/tenancies/${id(tenancyId)}/checkout/preview`, body),
  checkout: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/checkout`, body, withKey(key)),
  deposit: (tenancyId) => http.get(`/api/v1/tenancies/${id(tenancyId)}/deposit`),
  depositReceipt: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/deposit/receipts`, body, withKey(key)),
  depositRefund: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/deposit/refunds`, body, withKey(key)),
  depositOffset: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/deposit/offsets`, body, withKey(key)),
  depositTransfer: (tenancyId, body, key) => http.post(`/api/v1/tenancies/${id(tenancyId)}/deposit/transfers`, body, withKey(key)),
};

export const tenancyRequestsApi = {
  list: (query, options) => http.get('/api/v1/tenancy-requests', query, options),
  approve: (requestId, decisionNotes) => http.post(`/api/v1/tenancy-requests/${id(requestId)}/approve`, { decisionNotes }),
  reject: (requestId, decisionNotes) => http.post(`/api/v1/tenancy-requests/${id(requestId)}/reject`, { decisionNotes }),
};

export const contractsApi = {
  list: (query, options) => http.get('/api/v1/contracts', query, options),
  get: (contractId) => http.get(`/api/v1/contracts/${id(contractId)}`),
  createVersion: (contractId, body) => http.post(`/api/v1/contracts/${id(contractId)}/versions`, body),
  updateVersion: (contractId, versionId, body) => http.put(`/api/v1/contracts/${id(contractId)}/versions/${id(versionId)}`, body),
  deleteVersion: (contractId, versionId) => http.delete(`/api/v1/contracts/${id(contractId)}/versions/${id(versionId)}`),
  addVersionFile: (contractId, versionId, body) => http.post(`/api/v1/contracts/${id(contractId)}/versions/${id(versionId)}/files`, body),
  signVersion: (contractId, versionId, body, key) => http.post(`/api/v1/contracts/${id(contractId)}/versions/${id(versionId)}/sign`, body, withKey(key)),
  terminate: (contractId, body) => http.post(`/api/v1/contracts/${id(contractId)}/terminate`, body),
  archive: (contractId) => http.post(`/api/v1/contracts/${id(contractId)}/archive`, {}),
  remove: (contractId) => http.delete(`/api/v1/contracts/${id(contractId)}`),
  successor: (contractId, body) => http.post(`/api/v1/contracts/${id(contractId)}/successor`, body),
  addAttachment: (contractId, body) => http.post(`/api/v1/contracts/${id(contractId)}/attachments`, body),
  removeAttachment: (contractId, attachmentId) => http.delete(`/api/v1/contracts/${id(contractId)}/attachments/${id(attachmentId)}`),
};

export const periodsApi = {
  list: (query, options) => http.get('/api/v1/billing-periods', query, options),
  get: (periodId) => http.get(`/api/v1/billing-periods/${id(periodId)}`),
  create: (body) => http.post('/api/v1/billing-periods', body),
  worksheet: (periodId, query, options) => http.get(`/api/v1/billing-periods/${id(periodId)}/worksheet`, query, options),
  lock: (periodId, body) => http.post(`/api/v1/billing-periods/${id(periodId)}/lock`, body),
  unlock: (periodId, reason) => http.post(`/api/v1/billing-periods/${id(periodId)}/unlock`, { reason }),
};

export const metersApi = {
  list: (query, options) => http.get('/api/v1/meters', query, options),
  readings: (meterId) => http.get(`/api/v1/meters/${id(meterId)}/readings`),
  record: (body) => http.post('/api/v1/meter-readings', body),
  recordBatch: (body, key) => http.post('/api/v1/meter-readings/batch', body, withKey(key)),
  correct: (readingId, body) => http.post(`/api/v1/meter-readings/${id(readingId)}/correct`, body),
  replace: (meterId, body, key) => http.post(`/api/v1/meters/${id(meterId)}/replace`, body, withKey(key)),
};

export const invoicesApi = {
  bankEvents: (page = 1) => http.get('/api/v1/admin/apipay/events', { page }),
  retryBankEvent: (transactionId) => http.post(`/api/v1/admin/apipay/events/${id(transactionId)}/retry`, {}),
  reconcileBankEvent: (transactionId, paymentId) => http.post(`/api/v1/admin/apipay/events/${id(transactionId)}/reconcile`, { paymentId }),
  ignoreBankEvent: (transactionId, reason) => http.post(`/api/v1/admin/apipay/events/${id(transactionId)}/ignore`, { reason }),
  list: (query, options) => http.get('/api/v1/invoices', query, options),
  get: (invoiceId) => http.get(`/api/v1/invoices/${id(invoiceId)}`),
  createDraft: (body, key) => http.post('/api/v1/invoices/drafts', body, withKey(key)),
  recompute: (invoiceId) => http.post(`/api/v1/invoices/${id(invoiceId)}/recompute`, {}),
  updateDraft: (invoiceId, body) => http.put(`/api/v1/invoices/${id(invoiceId)}`, body),
  removeDraft: (invoiceId) => http.delete(`/api/v1/invoices/${id(invoiceId)}`),
  issue: (invoiceId, body, key) => http.post(`/api/v1/invoices/${id(invoiceId)}/issue`, body, withKey(key)),
  void: (invoiceId, reason) => http.post(`/api/v1/invoices/${id(invoiceId)}/void`, { reason }),
  adjust: (invoiceId, body, key) => http.post(`/api/v1/invoices/${id(invoiceId)}/adjustments`, body, withKey(key)),
  replacement: (invoiceId) => http.post(`/api/v1/invoices/${id(invoiceId)}/replacement`, {}),
  send: (invoiceId, body) => http.post(`/api/v1/invoices/${id(invoiceId)}/send`, body || {}),
  createBatch: (body, key) => http.post('/api/v1/invoice-batches', body, withKey(key)),
  getBatch: (batchId) => http.get(`/api/v1/invoice-batches/${id(batchId)}`),
  retryBatch: (batchId) => http.post(`/api/v1/invoice-batches/${id(batchId)}/retry`, {}),
};

export const paymentsApi = {
  list: (query, options) => http.get('/api/v1/payments', query, options),
  get: (paymentId) => http.get(`/api/v1/payments/${id(paymentId)}`),
  create: (body, key) => http.post('/api/v1/payments', body, withKey(key)),
  confirm: (paymentId, body, key) => http.post(`/api/v1/payments/${id(paymentId)}/confirm`, body, withKey(key)),
  reject: (paymentId, reason) => http.post(`/api/v1/payments/${id(paymentId)}/reject`, { reason }),
  allocate: (paymentId, allocations, key) => http.post(`/api/v1/payments/${id(paymentId)}/allocations`, { allocations }, withKey(key)),
  reverseAllocation: (allocationId, body, key) => http.post(`/api/v1/payment-allocations/${id(allocationId)}/reverse`, body, withKey(key)),
  reverse: (paymentId, body, key) => http.post(`/api/v1/payments/${id(paymentId)}/reversals`, body, withKey(key)),
};

export const exportsApi = {
  list: (query, options) => http.get('/api/v1/exports', query, options),
  create: (body) => http.post('/api/v1/exports', body),
};

export const ticketsApi = {
  list: (query, options) => http.get('/api/v1/tickets', query, options),
  get: (ticketId) => http.get(`/api/v1/tickets/${id(ticketId)}`),
  create: (body, key) => http.post('/api/v1/tickets', body, withKey(key)),
  message: (ticketId, body) => http.post(`/api/v1/tickets/${id(ticketId)}/messages`, body),
  assign: (ticketId, body) => http.post(`/api/v1/tickets/${id(ticketId)}/assign`, body),
  transition: (ticketId, body) => http.post(`/api/v1/tickets/${id(ticketId)}/transitions`, body),
};

export const notificationsApi = {
  list: (query, options) => http.get('/api/v1/notifications', query, { ...options, organization: false }),
  unreadCount: () => http.get('/api/v1/notifications/unread-count', undefined, { organization: false }),
  read: (notificationId) => http.post(`/api/v1/notifications/${id(notificationId)}/read`, {}, { organization: false }),
  readAll: () => http.post('/api/v1/notifications/read-all', {}, { organization: false }),
};

export const settingsApi = {
  organization: () => http.get('/api/v1/settings/organization'),
  saveOrganization: (body) => http.put('/api/v1/settings/organization', body),
  billingSchedule: () => http.get('/api/v1/settings/billing-schedule'),
  saveBillingSchedule: (body) => http.put('/api/v1/settings/billing-schedule', body),
  email: () => http.get('/api/v1/settings/email'),
  saveEmail: (body) => http.put('/api/v1/settings/email', body),
  testEmail: (toEmail) => http.post('/api/v1/settings/email/test', { toEmail }),
  templates: () => http.get('/api/v1/settings/templates'),
  saveTemplate: (templateId, body) => http.put(`/api/v1/settings/templates/${id(templateId)}`, body),
  reminderRules: () => http.get('/api/v1/settings/reminder-rules'),
  createReminderRule: (body) => http.post('/api/v1/settings/reminder-rules', body),
  updateReminderRule: (ruleId, body) => http.put(`/api/v1/settings/reminder-rules/${id(ruleId)}`, body),
  jobs: (query) => http.get('/api/v1/jobs', query),
  runJob: (kind, body) => http.post(`/api/v1/jobs/${id(kind)}/run`, body || {}),
  deliveries: (query, options) => http.get('/api/v1/deliveries', query, options),
  retryDelivery: (deliveryId) => http.post(`/api/v1/deliveries/${id(deliveryId)}/retry`, {}),
  integrations: () => http.get('/api/v1/integrations'),
  saveIntegration: (integrationId, body) => http.put(`/api/v1/integrations/${id(integrationId)}`, body),
  testIntegration: (integrationId) => http.post(`/api/v1/integrations/${id(integrationId)}/test`, {}),
};

export const filesApi = {
  /** Tải tệp lên: API thật nhận multipart/form-data; mock tự đọc tệp trong trình duyệt. */
  upload: (file, { visibility = 'private', purpose = 'other' } = {}, options = {}) => {
    const form = new FormData();
    form.append('file', file);
    form.append('visibility', visibility);
    form.append('purpose', purpose);
    return http.post('/api/v1/files', form, options);
  },
  downloadUrl: (fileId) => http.get(`/api/v1/files/${id(fileId)}/download-url`, undefined, { organization: false }),
};

export const portalApi = {
  decideViewing: (inquiryId, body) => http.post(`/api/v1/portal/inquiries/${id(inquiryId)}/decision`, body),
  overview: () => http.get('/api/v1/portal/overview'),
  inquiries: () => http.get('/api/v1/portal/inquiries'),
  createInquiry: (body, key) => http.post('/api/v1/portal/inquiries', body, withKey(key)),
  profile: () => http.get('/api/v1/portal/profile'),
  requestProfileChange: (body) => http.post('/api/v1/portal/profile-change-requests', body),
  cancelProfileChange: (requestId) => http.post(`/api/v1/portal/profile-change-requests/${id(requestId)}/cancel`, {}),
  tenancies: () => http.get('/api/v1/portal/tenancies'),
  tenancy: (tenancyId) => http.get(`/api/v1/portal/tenancies/${id(tenancyId)}`),
  invoices: (query, options) => http.get('/api/v1/portal/invoices', query, options),
  invoice: (invoiceId, options) => http.get(`/api/v1/portal/invoices/${id(invoiceId)}`, undefined, options),
  paymentRequest: (invoiceId, options) => http.get(`/api/v1/portal/apipay/invoices/${id(invoiceId)}/payment-request`, undefined, options),
  createPaymentRequest: (invoiceId, options) => http.post(`/api/v1/portal/apipay/invoices/${id(invoiceId)}/payment-request`, {}, { timeoutMs: 25000, ...options }),
  payments: (query, options) => http.get('/api/v1/portal/payments', query, options),
  reportPayment: (body, key) => http.post('/api/v1/portal/payments', body, withKey(key)),
  tickets: (query, options) => http.get('/api/v1/portal/tickets', query, options),
  ticket: (ticketId) => http.get(`/api/v1/portal/tickets/${id(ticketId)}`),
  createTicket: (body, key) => http.post('/api/v1/portal/tickets', body, withKey(key)),
  messageTicket: (ticketId, body) => http.post(`/api/v1/portal/tickets/${id(ticketId)}/messages`, body),
  confirmTicket: (ticketId) => http.post(`/api/v1/portal/tickets/${id(ticketId)}/confirm`, {}),
  reopenTicket: (ticketId, reason) => http.post(`/api/v1/portal/tickets/${id(ticketId)}/reopen`, { reason }),
  requests: () => http.get('/api/v1/portal/requests'),
  createRequest: (body, key) => http.post('/api/v1/portal/requests', body, withKey(key)),
  cancelRequest: (requestId) => http.post(`/api/v1/portal/requests/${id(requestId)}/cancel`, {}),
  catalog: () => http.get('/api/v1/portal/catalog'),
  // Phòng yêu thích theo tài khoản (người đăng nhập là chủ danh sách).
  favorites: () => http.get('/api/v1/portal/favorites'),
  favoriteRooms: () => http.get('/api/v1/portal/favorites/rooms'),
  addFavorite: (roomId) => http.put(`/api/v1/portal/favorites/${id(roomId)}`, {}),
  removeFavorite: (roomId) => http.delete(`/api/v1/portal/favorites/${id(roomId)}`),
  mergeFavorites: (body) => http.post('/api/v1/portal/favorites/merge', body),
};
