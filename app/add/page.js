'use client';

import { useRouter } from 'next/navigation';
import CaseForm from '../../components/CaseForm';

export default function AddEntryPage() {
  const router = useRouter();
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Add New Entry</h1>
        <p className="text-sm text-slate-500">Profit is calculated automatically from Client Payment − Vendor Payment.</p>
      </div>
      <div className="card">
        <CaseForm onSaved={() => router.push('/cases')} onCancel={() => router.push('/cases')} />
      </div>
    </div>
  );
}
