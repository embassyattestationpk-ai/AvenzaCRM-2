import { statusColor } from '../lib/utils';

export default function StatusBadge({ status }) {
  return <span className={`badge ${statusColor(status)}`}>{status}</span>;
}
