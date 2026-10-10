import { Check, Layers3, Warehouse } from 'lucide-react';

export function WorkspaceBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="workspace-brand">
      <span className="brand-symbol"><Warehouse size={20} strokeWidth={1.6} /></span>
      <span><strong>Slaughterhouse<span className="brand-dot">.</span></strong>
        {!compact && <small>Municipal operations</small>}
      </span>
    </span>
  );
}

// Original decorative artwork built from CSS, independent of business data.
export function LedgerArtwork() {
  return (
    <div className="ledger-art" aria-hidden="true">
      <div className="ledger-aura" />
      <div className="ledger-orbit" />
      <div className="ledger-floating-stack">
      <div className="ledger-sheet ledger-sheet-back" />
      <div className="ledger-sheet ledger-sheet-middle"><Layers3 size={30} strokeWidth={1} /></div>
      <div className="ledger-sheet ledger-sheet-front">
        <span className="ledger-sheet-label"><span className="ledger-dot" /> OPERATIONS / 01</span>
        <span className="ledger-art-heading">All in order.</span>
        <span className="ledger-art-line"><Check size={13} /><i /></span>
        <span className="ledger-art-line"><Check size={13} /><i /></span>
        <span className="ledger-art-line"><Check size={13} /><i /></span>
        <span className="ledger-art-footer">RECORDS &amp; BILLING <Layers3 size={18} strokeWidth={1.4} /></span>
      </div>
      </div>
      <span className="ledger-satellite ledger-satellite-records"><Layers3 size={12} /> Records</span>
      <span className="ledger-satellite ledger-satellite-billing"><Check size={12} /> Billing</span>
    </div>
  );
}

export function AmbientBackdrop() {
  return (
    <div className="ambient-backdrop" aria-hidden="true">
      <span className="ambient-halo ambient-halo-sage" />
      <span className="ambient-halo ambient-halo-lilac" />
      <span className="ambient-grid" />
      <span className="ambient-light-trail" />
      <span className="ambient-speck ambient-speck-one" />
      <span className="ambient-speck ambient-speck-two" />
      <span className="ambient-speck ambient-speck-three" />
    </div>
  );
}
