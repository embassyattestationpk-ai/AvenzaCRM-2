'use client';

import { useRouter } from 'next/navigation';
import Modal from './Modal';
import CaseForm from './CaseForm';
import ClientForm from './ClientForm';
import VendorForm from './VendorForm';
import PaymentForm from './PaymentForm';

// PHASE 17: 'consultant' is a quick-add type of its own now — same
// ClientForm as 'client', just pre-set to Consultant mode, so adding a
// Consultant has a clear, obvious entry point wherever Quick Add is reachable.
const TITLES = { client: 'New Client', consultant: 'New Consultant', case: 'New Case', payment: 'New Payment', vendor: 'New Vendor' };

export default function QuickAddModal({ type, onClose }) {
  const router = useRouter();
  function saved() { onClose(); router.refresh(); }

  return (
    <Modal title={TITLES[type]} onClose={onClose} width="max-w-xl">
      {type === 'client' && <ClientForm onSaved={saved} onCancel={onClose} />}
      {type === 'consultant' && <ClientForm initial={{ Client_Type: 'Consultant' }} onSaved={saved} onCancel={onClose} />}
      {type === 'case' && <CaseForm onSaved={saved} onCancel={onClose} />}
      {type === 'vendor' && <VendorForm onSaved={saved} onCancel={onClose} />}
      {type === 'payment' && <PaymentForm onSaved={saved} onCancel={onClose} />}
    </Modal>
  );
}
