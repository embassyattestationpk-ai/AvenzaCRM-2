// Thin client for the Google Apps Script backend.
// All CRUD + reads flow through here so the rest of the app never touches
// fetch() details directly.

const BASE = process.env.NEXT_PUBLIC_API_URL || '';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

async function get(action, params = {}) {
  const url = new URL(BASE);
  url.searchParams.set('action', action);
  url.searchParams.set('apiKey', API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

async function post(action, body = {}) {
  const res = await fetch(BASE, {
    method: 'POST',
    // text/plain avoids a CORS preflight against the Apps Script endpoint
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, apiKey: API_KEY, ...body }),
    redirect: 'follow',
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Request failed');
  return json.data;
}

export const api = {
  ping: () => get('ping'),

  getClients: (q, clientType, addedBy) => get('getClients', { q, clientType, addedBy }),
  getClient: (id) => get('getClient', { id }),
  addClient: (data) => post('addClient', data),
  updateClient: (data) => post('updateClient', data),
  deleteClient: (id) => post('deleteClient', { id }),

  getCases: (params) => get('getCases', params),
  getCase: (id) => get('getCase', { id }),
  addCase: (data) => post('addCase', data),
  updateCase: (data) => post('updateCase', data),
  deleteCase: (id) => post('deleteCase', { id }),

  getVendors: (q) => get('getVendors', { q }),
  getVendor: (id) => get('getVendor', { id }),
  addVendor: (data) => post('addVendor', data),
  updateVendor: (data) => post('updateVendor', data),
  deleteVendor: (id) => post('deleteVendor', { id }),

  getPayments: (params) => get('getPayments', params),
  addPayment: (data) => post('addPayment', data),
  updatePayment: (data) => post('updatePayment', data),
  deletePayment: (id) => post('deletePayment', { id }),

  getServices: () => get('getServices'),
  addService: (data) => post('addService', data),
  updateService: (data) => post('updateService', data),
  deleteService: (id) => post('deleteService', { id }),

  getSettings: () => get('getSettings'),
  updateSettings: (data) => post('updateSettings', data),

  getDashboard: (params) => get('getDashboard', params),
  getReport: (params) => get('getReport', params),
  globalSearch: (q) => get('globalSearch', { q }),

  login: (username, password) => post('login', { username, password }),
  getUsers: () => get('getUsers'),
  updateUser: (data) => post('updateUser', data),

  getInvoicePdf: (caseId) => get('getInvoicePdf', { caseId }),
  sendInvoice: (caseId) => post('sendInvoice', { caseId }),
  getCaseStatus: (id) => get('getCaseStatusPublic', { id }),

  getServiceRates: (params) => get('getServiceRates', params),
  addServiceRate: (data) => post('addServiceRate', data),
  updateServiceRate: (data) => post('updateServiceRate', data),
  deleteServiceRate: (id) => post('deleteServiceRate', { id }),

  getCaseStages: (id) => get('getCaseStages', { id }),
  advanceCaseStage: (data) => post('advanceCaseStage', data),

  getLedger: (params) => get('getLedger', params),

  runOverdueCheck: () => post('runOverdueCheck', {}),
  sendDailySummaryNow: () => post('sendDailySummaryNow', {}),

  // Multiple-board cases
  getCaseBoards: (id) => get('getCaseBoards', { id }),
  updateBoardStatus: (data) => post('updateBoardStatus', data),
  addBoardVendorPayment: (data) => post('addBoardVendorPayment', data),

  // Consultant rates
  getConsultantRates: (params) => get('getConsultantRates', params),
  addConsultantRate: (data) => post('addConsultantRate', data),
  updateConsultantRate: (data) => post('updateConsultantRate', data),
  deleteConsultantRate: (id) => post('deleteConsultantRate', { id }),

  // Document types
  getDocumentTypes: (params) => get('getDocumentTypes', params),
  addDocumentType: (data) => post('addDocumentType', data),
  updateDocumentType: (data) => post('updateDocumentType', data),
  deleteDocumentType: (id) => post('deleteDocumentType', { id }),

  // Static option lists (boards, board statuses, payment methods)
  getBoardTypes: () => get('getBoardTypes'),

  upsertConsultantRate: (data) => post('upsertConsultantRate', data),
  upsertServiceRate: (data) => post('upsertServiceRate', data),
};
