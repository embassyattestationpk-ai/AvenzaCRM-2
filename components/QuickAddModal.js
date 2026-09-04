'use client';

import { useRouter } from 'next/navigation';
import Modal from './Modal';
import CaseForm from './CaseForm';
import ClientForm from './ClientForm';
import VendorForm from './VendorForm';
import PaymentForm from './PaymentForm';

const TITLES = { client: 'New Client', case: 'New Case', payment: 'New Payment', vendor: 'New Vendor' };

export default function QuickAddModal({ type, onClose }) {
  const router = useRouter();
  function saved() { onClose(); router.refresh(); }

  return (
    <Modal title={TITLES[type]} onClose={onClose} width="max-w-xl">
      {type === 'client' && <ClientForm onSaved={saved} onCancel={onClose} />}
      {type === 'case' && <CaseForm onSaved={saved} onCancel={onClose} />}
      {type === 'vendor' && <VendorForm onSaved={saved} onCancel={onClose} />}
      {type === 'payment' && <PaymentForm onSaved={saved} onCancel={onClose} />}
    </Modal>
  );
}
