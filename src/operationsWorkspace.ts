// Full-payment balances use validated integer centavos, never guessed decimal totals.
export function validateBillingAmounts(value: unknown): void {
 const v=value as Record<string,unknown>;
 if(!v||!['totalCents','paidCents','balanceCents'].every(k=>typeof v[k]==='number'&&Number.isSafeInteger(v[k])&&(v[k] as number)>=0&&(v[k] as number)<=100_000_000_000)||
  (v.totalCents as number)<=0||(v.paidCents as number)+(v.balanceCents as number)!==v.totalCents||
  !(v.payment_status==='Paid'&&v.paidCents===v.totalCents&&v.balanceCents===0||v.payment_status==='Unpaid'&&v.paidCents===0&&v.balanceCents===v.totalCents))throw Error('Invoice balance requires review; no payment status has been inferred.');
}
export function validateWorkspaceSettings(value: unknown): void {
 const v=value as Record<string,unknown>;
 if(!v||v.workspaceContract!=='billing_delivery_v1')throw Error('This workspace requires the coordinated server update. Existing account access is unchanged.');
 if(!['enabled','canReadBilling','canReadDelivery','canReadEligible','canReadTracking','canBill','canDeliver','canRecordPayment','canPublishTracking'].every(k=>typeof v[k]==='boolean'))throw Error('Workspace permissions require review.');
 const f=v.feeSchedule as Record<string,unknown>|null;
 if(f!=null&&(!Number.isSafeInteger(f.version)||(f.version as number)<1||f.basis!=='perAnimal'||f.currency!=='PHP'||!['corralCents','deliveryCents','inspectionCents','facilityCents'].every(k=>typeof f[k]==='number'&&Number.isSafeInteger(f[k])&&(f[k] as number)>=0)))throw Error('Approved fee details require review; no fees have been substituted.');
}
