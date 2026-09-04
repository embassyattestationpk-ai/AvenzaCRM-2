export default function StatCard({ label, value, icon, tone = 'brand', sub }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  return (
    <div className="card flex items-start justify-between">
      <div>
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-800 mt-1">{value}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${tones[tone]}`}>{icon}</div>
    </div>
  );
}
