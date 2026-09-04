'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import Modal, { ConfirmModal } from '../../components/Modal';
import { getCurrentUser, setCurrentUser } from '../../lib/auth';

export default function SettingsPage() {
  const [services, setServices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [currency, setCurrency] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyLogoBase64, setCompanyLogoBase64] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [dailySummaryEmail, setDailySummaryEmail] = useState('');
  const [teamUsers, setTeamUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [rates, setRates] = useState([]);
  const [editingRate, setEditingRate] = useState(null);
  const [deletingRate, setDeletingRate] = useState(null);
  const [checkingOverdue, setCheckingOverdue] = useState(false);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [consultantRates, setConsultantRates] = useState([]);
  const [editingConsultantRate, setEditingConsultantRate] = useState(null);
  const [deletingConsultantRate, setDeletingConsultantRate] = useState(null);
  const [docTypes, setDocTypes] = useState([]);
  const [editingDocType, setEditingDocType] = useState(null);
  const [boardTypes, setBoardTypes] = useState([]);

  function load() {
    api.getServices().then(setServices).catch((e) => toast.error(e.message));
    api.getConsultantRates().then(setConsultantRates).catch(() => {});
    api.getDocumentTypes().then(setDocTypes).catch(() => {});
    api.getBoardTypes().then((o) => setBoardTypes(o.boards || [])).catch(() => {});
    api.getSettings().then((s) => {
      setSettings(s);
      setCompanyName(s.company_name || '');
      setCurrency(s.currency || '');
      setFrontendUrl(s.frontend_url || '');
      setCompanyAddress(s.company_address || '');
      setCompanyPhone(s.company_phone || '');
      setCompanyEmail(s.company_email || '');
      setCompanyLogoBase64(s.company_logo_base64 || '');
      setDailySummaryEmail(s.daily_summary_email || '');
    }).catch((e) => toast.error(e.message));
    api.getUsers().then(setTeamUsers).catch(() => {});
    api.getServiceRates().then(setRates).catch(() => {});
    setMe(getCurrentUser());
  }
  useEffect(load, []);

  async function sendSummaryNow() {
    setSendingSummary(true);
    try {
      const r = await api.sendDailySummaryNow();
      if (r.sent) toast.success(`Sent to ${r.to} (${r.count} entries today)`);
      else toast.error(r.reason || 'Could not send — set an email first');
    } catch (e) { toast.error(e.message); } finally { setSendingSummary(false); }
  }

  async function runOverdueCheck() {
    setCheckingOverdue(true);
    try {
      const r = await api.runOverdueCheck();
      toast.success(`${r.overdueCount} overdue case(s) found — reminders sent to: ${r.remindersSentTo.join(', ') || 'no one (no email on file)'}`);
    } catch (e) { toast.error(e.message); } finally { setCheckingOverdue(false); }
  }

  async function doDeleteRate() {
    try { await api.deleteServiceRate(deletingRate.Rate_ID); toast.success('Rate removed'); setDeletingRate(null); load(); }
    catch (e) { toast.error(e.message); }
  }

  async function doDeleteConsultantRate() {
    try { await api.deleteConsultantRate(deletingConsultantRate.Rate_ID); toast.success('Rate removed'); setDeletingConsultantRate(null); load(); }
    catch (e) { toast.error(e.message); }
  }

  async function saveSettings() {
    try {
      await api.updateSettings({ company_name: companyName, currency, frontend_url: frontendUrl, company_address: companyAddress, company_phone: companyPhone, company_email: companyEmail, daily_summary_email: dailySummaryEmail });
      toast.success('Settings saved');
    }
    catch (e) { toast.error(e.message); }
  }

  function onLogoFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result; // data:image/png;base64,....
        await api.updateSettings({ company_logo_base64: dataUrl });
        setCompanyLogoBase64(dataUrl);
        toast.success('Logo saved — it will now appear on invoices');
      } catch (err) { toast.error(err.message); } finally { setUploadingLogo(false); }
    };
    reader.onerror = () => { toast.error('Could not read that image'); setUploadingLogo(false); };
    reader.readAsDataURL(file);
  }

  async function removeLogo() {
    try { await api.updateSettings({ company_logo_base64: '' }); setCompanyLogoBase64(''); toast.success('Logo removed'); }
    catch (e) { toast.error(e.message); }
  }

  async function doDelete() {
    try { await api.deleteService(deleting.Service_ID); toast.success('Service removed'); setDeleting(null); load(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Manage services, statuses and organization details</p>
      </div>

      <div className="card space-y-4">
        <h3 className="font-semibold text-slate-700">Organization</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Company Name</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="label">Currency</label>
            <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Public CRM URL (for invoice QR codes)</label>
          <input className="input" placeholder="https://your-crm.vercel.app" value={frontendUrl} onChange={(e) => setFrontendUrl(e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">This is your deployed Vercel link. It's used to build the QR code/status link printed on client invoices — e.g. {frontendUrl || 'https://your-crm.vercel.app'}/status/CS-0001</p>
        </div>
        <div>
          <label className="label">Company Address</label>
          <input className="input" placeholder="Head Office - Islamabad | Office No. ..." value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Company Phone</label>
            <input className="input" placeholder="+92 3XX XXXXXXX" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">Company Email</label>
            <input className="input" placeholder="info@avenzaconsultancy.pk" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-400">These appear on every invoice, next to your logo.</p>
        <div className="border-t border-slate-100 pt-4">
          <label className="label">Invoice Logo</label>
          <p className="text-xs text-slate-400 mb-2">Uploaded here directly, so the invoice PDF always shows your logo (not just your company name). Use a small PNG/JPG (under ~30KB).</p>
          <div className="flex items-center gap-4">
            {companyLogoBase64 ? (
              <img src={companyLogoBase64} alt="Company logo" className="h-12 max-w-[160px] object-contain border border-slate-200 rounded bg-white p-1" />
            ) : (
              <div className="h-12 w-32 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-300 rounded">No logo yet</div>
            )}
            <input type="file" accept="image/png,image/jpeg" onChange={onLogoFileChosen} disabled={uploadingLogo} className="text-sm" />
            {companyLogoBase64 && <button type="button" className="btn-secondary" onClick={removeLogo}>Remove</button>}
          </div>
        </div>
        <button className="btn-primary" onClick={saveSettings}>Save</button>
      </div>

      <div className="card space-y-4">
        <div>
          <h3 className="font-semibold text-slate-700">Daily Summary Email (Day-End Report)</h3>
          <p className="text-xs text-slate-400 mt-1">Once a day (~10pm, after the one-time trigger setup below), this email gets ONE report of everything added that day — no client emails, no per-case reminders.</p>
        </div>
        <div>
          <label className="label">Send Daily Summary To</label>
          <input type="email" className="input max-w-sm" placeholder="admin@example.com" value={dailySummaryEmail} onChange={(e) => setDailySummaryEmail(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={saveSettings}>Save Email</button>
          <button className="btn-secondary" disabled={sendingSummary} onClick={sendSummaryNow}>{sendingSummary ? 'Sending…' : 'Send Test Summary Now'}</button>
        </div>
        <p className="text-xs text-slate-400">One-time setup for the automatic daily send: open the Apps Script editor → select <code>createDailySummaryTrigger</code> from the function dropdown → Run. See README for details.</p>
      </div>

      <div className="card space-y-4">
        <h3 className="font-semibold text-slate-700">Team & Login</h3>
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {['Username', 'Full Name', 'Role', 'Email (for overdue reminders)'].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {teamUsers.map((u) => (
              <tr key={u.Username} className="border-b border-slate-50">
                <td className="td font-mono text-xs">{u.Username}</td>
                <td className="td font-medium">{u.Full_Name}</td>
                <td className="td capitalize">{u.Role}</td>
                <td className="td">{u.Email || <span className="text-slate-400">not set</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {me && <ChangePasswordForm me={me} onDone={(u) => { setCurrentUser(u); toast.success('Saved'); load(); }} />}
        <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
          <p className="text-xs text-slate-500 max-w-md">Overdue case reminders are emailed daily to whoever added the case (set the daily trigger once from the Apps Script editor — see README). You can also run a check right now:</p>
          <button className="btn-secondary" disabled={checkingOverdue} onClick={runOverdueCheck}>{checkingOverdue ? 'Checking…' : 'Run Overdue Check Now'}</button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-700">Services</h3>
          <button className="btn-primary" onClick={() => setEditing('new')}>➕ Add Service</button>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {['Service Name', 'Default Price', 'Mode', 'Steps', 'Status', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.Service_ID} className="border-b border-slate-50">
                <td className="td font-medium">{s.Service_Name}</td>
                <td className="td">{s.Default_Price || '-'}</td>
                <td className="td capitalize">{s.Mode || 'simultaneous'}</td>
                <td className="td text-xs">{s.Mode === 'process' ? (s.Steps || '-') : '-'}</td>
                <td className="td">{s.Status}</td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setEditing(s)}>Edit</button>
                    <button className="btn-danger" onClick={() => setDeleting(s)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!services.length && <tr><td colSpan={6} className="td text-center text-slate-400 py-6">No services yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-700">Service Rates (Vendor Pricing per Service)</h3>
            <p className="text-xs text-slate-400 mt-1">The Case form auto-fetches the matching rate when a Service + Vendor is chosen.</p>
          </div>
          <button className="btn-primary" onClick={() => setEditingRate('new')}>➕ Add Rate</button>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {['Service', 'Vendor', 'Rate', 'Turnaround (days)', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.Rate_ID} className="border-b border-slate-50">
                <td className="td font-medium">{r.Service_Name}</td>
                <td className="td">{r.Vendor_Name}</td>
                <td className="td">{r.Rate}</td>
                <td className="td">{r.Turnaround_Days || '-'}</td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setEditingRate(r)}>Edit</button>
                    <button className="btn-danger" onClick={() => setDeletingRate(r)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!rates.length && <tr><td colSpan={5} className="td text-center text-slate-400 py-6">No rates yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-700">Consultant Rates (What We Charge Each Consultant)</h3>
            <p className="text-xs text-slate-400 mt-1">The Case form auto-fetches this rate when a Consultant + Board/Service is chosen — still editable per case.</p>
          </div>
          <button className="btn-primary" onClick={() => setEditingConsultantRate('new')}>➕ Add Rate</button>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-slate-100">
            {['Consultant', 'Board / Service', 'Rate', 'Actions'].map((h) => <th key={h} className="th">{h}</th>)}
          </tr></thead>
          <tbody>
            {consultantRates.map((r) => (
              <tr key={r.Rate_ID} className="border-b border-slate-50">
                <td className="td font-medium">{r.Consultant_Name}</td>
                <td className="td">{r.Board_Name}</td>
                <td className="td">{r.Rate}</td>
                <td className="td">
                  <div className="flex gap-2">
                    <button className="btn-ghost" onClick={() => setEditingConsultantRate(r)}>Edit</button>
                    <button className="btn-danger" onClick={() => setDeletingConsultantRate(r)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {!consultantRates.length && <tr><td colSpan={4} className="td text-center text-slate-400 py-6">No consultant rates yet</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-700">Document Types</h3>
            <p className="text-xs text-slate-400 mt-1">Educational, Personal, Experience Letter — plus your own "Other" entries.</p>
          </div>
          <button className="btn-primary" onClick={() => setEditingDocType('new')}>➕ Add Document Type</button>
        </div>
        {['Educational', 'Personal', 'Experience', 'Other'].map((cat) => (
          <div key={cat} className="mb-3">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">{cat}</div>
            <div className="flex flex-wrap gap-2">
              {docTypes.filter((d) => d.Category === cat).map((d) => (
                <span key={d.Type_ID} className="badge bg-slate-100 text-slate-700 flex items-center gap-1">
                  {d.Name}
                  <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => setEditingDocType(d)}>✎</button>
                </span>
              ))}
              {!docTypes.filter((d) => d.Category === cat).length && <span className="text-xs text-slate-400">None yet</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="font-semibold text-slate-700 mb-2">Document Status Options</h3>
        <div className="flex flex-wrap gap-2">
          {(settings?.statuses || []).map((s) => <span key={s} className="badge bg-slate-100 text-slate-700">{s}</span>)}
        </div>
        <p className="text-xs text-slate-400 mt-3">Edit the "statuses" row directly in the Settings sheet to change these globally.</p>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add Service' : 'Edit Service'} onClose={() => setEditing(null)}>
          <ServiceForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}
      {deleting && <ConfirmModal message={`Remove service "${deleting.Service_Name}"?`} onCancel={() => setDeleting(null)} onConfirm={doDelete} />}

      {editingRate && (
        <Modal title={editingRate === 'new' ? 'Add Service Rate' : 'Edit Service Rate'} onClose={() => setEditingRate(null)}>
          <ServiceRateForm initial={editingRate === 'new' ? undefined : editingRate} services={services} onSaved={() => { setEditingRate(null); load(); }} onCancel={() => setEditingRate(null)} />
        </Modal>
      )}
      {deletingRate && <ConfirmModal message={`Remove rate for "${deletingRate.Service_Name}" / "${deletingRate.Vendor_Name}"?`} onCancel={() => setDeletingRate(null)} onConfirm={doDeleteRate} />}

      {editingConsultantRate && (
        <Modal title={editingConsultantRate === 'new' ? 'Add Consultant Rate' : 'Edit Consultant Rate'} onClose={() => setEditingConsultantRate(null)}>
          <ConsultantRateForm initial={editingConsultantRate === 'new' ? undefined : editingConsultantRate} boardTypes={boardTypes} services={services} onSaved={() => { setEditingConsultantRate(null); load(); }} onCancel={() => setEditingConsultantRate(null)} />
        </Modal>
      )}
      {deletingConsultantRate && <ConfirmModal message={`Remove rate for "${deletingConsultantRate.Consultant_Name}" / "${deletingConsultantRate.Board_Name}"?`} onCancel={() => setDeletingConsultantRate(null)} onConfirm={doDeleteConsultantRate} />}

      {editingDocType && (
        <Modal title={editingDocType === 'new' ? 'Add Document Type' : 'Edit Document Type'} onClose={() => setEditingDocType(null)}>
          <DocumentTypeForm initial={editingDocType === 'new' ? undefined : editingDocType} onSaved={() => { setEditingDocType(null); load(); }} onCancel={() => setEditingDocType(null)} />
        </Modal>
      )}
    </div>
  );
}

function ChangePasswordForm({ me, onDone }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [email, setEmail] = useState(me.email || '');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!newPassword && email === (me.email || '')) return toast.error('Enter a new password or change your email first');
    setSaving(true);
    try {
      const updated = await api.updateUser({ username: me.username, currentPassword, newPassword: newPassword || undefined, Email: email });
      onDone({ ...updated, email: updated.email });
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="border-t border-slate-100 pt-4">
      <h4 className="text-sm font-semibold text-slate-700 mb-3">My Profile ({me.fullName})</h4>
      <div className="grid grid-cols-4 gap-3 items-end">
        <div>
          <label className="label">My Email (for overdue reminders)</label>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label className="label">Current Password</label>
          <input type="password" className="input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div>
          <label className="label">New Password (optional)</label>
          <input type="password" className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <button disabled={saving} className="btn-primary h-fit">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

function ServiceForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({ Service_Name: '', Default_Price: '', Status: 'Active', Mode: 'simultaneous', Steps: '', ...initial });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.Service_Name) return toast.error('Service name is required');
    if (form.Mode === 'process' && !String(form.Steps || '').trim()) return toast.error('List the process steps, e.g. IBCC, MOFA, UAE Embassy');
    setSaving(true);
    try {
      if (initial?.Service_ID) await api.updateService(form);
      else await api.addService(form);
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Service Name</label>
        <input className="input" value={form.Service_Name} onChange={(e) => set('Service_Name', e.target.value)} required />
      </div>
      <div>
        <label className="label">Mode</label>
        <select className="input" value={form.Mode} onChange={(e) => set('Mode', e.target.value)}>
          <option value="simultaneous">Simultaneous (single vendor, single step)</option>
          <option value="process">Process (multiple sequential stages)</option>
        </select>
      </div>
      {form.Mode === 'process' && (
        <div>
          <label className="label">Steps (comma-separated, in order)</label>
          <input className="input" placeholder="e.g. IBCC, HEC, MOFA, UAE Embassy" value={form.Steps} onChange={(e) => set('Steps', e.target.value)} />
          <p className="text-xs text-slate-400 mt-1">Each case using this service moves through these stages one at a time, via "Advance Stage" on the Cases page.</p>
        </div>
      )}
      <div>
        <label className="label">Default Price (optional)</label>
        <input type="number" className="input" value={form.Default_Price} onChange={(e) => set('Default_Price', e.target.value)} />
      </div>
      <div>
        <label className="label">Status</label>
        <select className="input" value={form.Status} onChange={(e) => set('Status', e.target.value)}>
          <option>Active</option><option>Inactive</option>
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

function ConsultantRateForm({ initial, boardTypes, services, onSaved, onCancel }) {
  const [consultants, setConsultants] = useState([]);
  const [form, setForm] = useState({ Consultant_Name: '', Board_Name: '', Rate: '', ...initial });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  const options = [...(boardTypes || []), ...services.map((s) => s.Service_Name)];

  useEffect(() => { api.getClients(undefined, 'Consultant').then(setConsultants).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.Consultant_Name || !form.Board_Name) return toast.error('Consultant and Board/Service are required');
    setSaving(true);
    try {
      if (initial?.Rate_ID) await api.updateConsultantRate(form);
      else await api.addConsultantRate(form);
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Consultant</label>
          <select className="input" value={form.Consultant_Name} onChange={(e) => set('Consultant_Name', e.target.value)} required>
            <option value="">Select consultant</option>
            {consultants.map((c) => <option key={c.Client_ID} value={c.Client_Name}>{c.Client_Name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Board / Service</label>
          <select className="input" value={form.Board_Name} onChange={(e) => set('Board_Name', e.target.value)} required>
            <option value="">Select board / service</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label">Rate</label>
        <input type="number" className="input" value={form.Rate} onChange={(e) => set('Rate', e.target.value)} required />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

function DocumentTypeForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({ Category: 'Educational', Name: '', Status: 'Active', ...initial });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.Name) return toast.error('Name is required');
    setSaving(true);
    try {
      if (initial?.Type_ID) await api.updateDocumentType(form);
      else await api.addDocumentType(form);
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Category</label>
        <select className="input" value={form.Category} onChange={(e) => set('Category', e.target.value)}>
          <option>Educational</option>
          <option>Personal</option>
          <option>Experience</option>
          <option>Other</option>
        </select>
      </div>
      <div>
        <label className="label">Name</label>
        <input className="input" value={form.Name} onChange={(e) => set('Name', e.target.value)} required placeholder="e.g. Matric Certificate" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

function ServiceRateForm({ initial, services, onSaved, onCancel }) {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ Service_Name: '', Vendor_Name: '', Rate: '', Turnaround_Days: '', ...initial });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  useEffect(() => { api.getVendors().then(setVendors).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!form.Service_Name || !form.Vendor_Name) return toast.error('Service and Vendor are required');
    setSaving(true);
    try {
      if (initial?.Rate_ID) await api.updateServiceRate(form);
      else await api.addServiceRate(form);
      toast.success('Saved');
      onSaved();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Service</label>
          <select className="input" value={form.Service_Name} onChange={(e) => set('Service_Name', e.target.value)} required>
            <option value="">Select service</option>
            {services.map((s) => <option key={s.Service_ID} value={s.Service_Name}>{s.Service_Name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Vendor</label>
          <select className="input" value={form.Vendor_Name} onChange={(e) => set('Vendor_Name', e.target.value)} required>
            <option value="">Select vendor</option>
            {vendors.map((v) => <option key={v.Vendor_ID} value={v.Vendor_Name}>{v.Vendor_Name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Rate</label>
          <input type="number" className="input" value={form.Rate} onChange={(e) => set('Rate', e.target.value)} required />
        </div>
        <div>
          <label className="label">Turnaround (days)</label>
          <input type="number" className="input" value={form.Turnaround_Days} onChange={(e) => set('Turnaround_Days', e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
