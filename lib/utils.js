export function money(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-PK', { maximumFractionDigits: 0 });
}

export function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d).slice(0, 10);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const STATUS_COLORS = {
  New: 'bg-slate-100 text-slate-700',
  'Documents Received': 'bg-sky-100 text-sky-700',
  Processing: 'bg-amber-100 text-amber-700',
  'Sent to Vendor': 'bg-purple-100 text-purple-700',
  Pending: 'bg-orange-100 text-orange-700',
  Completed: 'bg-emerald-100 text-emerald-700',
  'Returned to Client': 'bg-teal-100 text-teal-700',
  Cancelled: 'bg-red-100 text-red-700',
};

export function statusColor(s) {
  return STATUS_COLORS[s] || 'bg-slate-100 text-slate-700';
}

export function exportCSV(filename, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(',')].concat(
    rows.map((r) => headers.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))
  ).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export function downloadBase64File(filename, base64, mime = 'application/pdf') {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mime });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export async function exportExcel(filename, rows) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}
