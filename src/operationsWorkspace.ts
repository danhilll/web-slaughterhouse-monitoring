// Full-payment balances use validated integer centavos, never guessed decimal totals.
export function validateBillingAmounts(value: unknown): void {
 const v=value as Record<string,unknown>;
 if(!v||!['totalCents','paidCents','balanceCents'].every(k=>typeof v[k]==='number'&&Number.isSafeInteger(v[k])&&(v[k] as number)>=0&&(v[k] as number)<=100_000_000_000)||
  (v.totalCents as number)<=0||(v.paidCents as number)+(v.balanceCents as number)!==v.totalCents||
  !(v.payment_status==='Paid'&&v.paidCents===v.totalCents&&v.balanceCents===0||v.payment_status==='Unpaid'&&v.paidCents===0&&v.balanceCents===v.totalCents))throw Error('Invoice balance requires review; no payment status has been inferred.');
 validateRecordedFeeSnapshot(v);
}
export function validateWorkspaceSettings(value: unknown): void {
 const v=value as Record<string,unknown>;
 if(!v||v.workspaceContract!=='billing_delivery_v1')throw Error('This workspace requires the coordinated server update. Existing account access is unchanged.');
 if(!['enabled','canReadBilling','canReadDelivery','canReadEligible','canReadTracking','canBill','canDeliver','canRecordPayment','canPublishTracking'].every(k=>typeof v[k]==='boolean'))throw Error('Workspace permissions require review.');
 const f=v.feeSchedule as Record<string,unknown>|null;
 if(f!=null&&(!Number.isSafeInteger(f.version)||(f.version as number)<1||f.basis!=='perAnimal'||f.currency!=='PHP'||!['corralCents','deliveryCents','inspectionCents','facilityCents'].every(k=>typeof f[k]==='number'&&Number.isSafeInteger(f[k])&&(f[k] as number)>=0)))throw Error('Approved fee details require review; no fees have been substituted.');
}

export type InvoicePreview={projection:'invoice_preview_v1';animal:{id:string;identifier:string;species:string;weightGrams:number;revision:number;vendorBusinessId:string;municipalScopeId:string};vendor:{id:string;name:string};feeSchedule:{version:number;basis:string;currency:string;corralCents:number;deliveryCents:number;inspectionCents:number;facilityCents:number;syntheticOnly?:boolean;approvalReference?:string};totalCents:number;currency:'PHP'};
export function validateInvoicePreview(value:unknown,selected:{id:string;vendorBusinessId:string;revision:number;identifier:string;species:string;weightGrams:number;municipalScopeId:string}):asserts value is InvoicePreview {
 const p=value as InvoicePreview,f=p?.feeSchedule,a=p?.animal;
 if(!p||p.projection!=='invoice_preview_v1'||p.currency!=='PHP'||!a||!p.vendor||!f||a.id!==selected.id||a.vendorBusinessId!==selected.vendorBusinessId||p.vendor.id!==a.vendorBusinessId||a.revision!==selected.revision||a.identifier!==selected.identifier||a.species!==selected.species||a.weightGrams!==selected.weightGrams||a.municipalScopeId!==selected.municipalScopeId||typeof p.vendor.name!=='string'||!p.vendor.name.trim()||p.vendor.name.length>200||!Number.isSafeInteger(f.version)||f.version<1||f.basis!=='perAnimal'||f.currency!=='PHP'||!['corralCents','deliveryCents','inspectionCents','facilityCents'].every(k=>{const v=f[k as keyof typeof f];return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=100_000_000_000;})||!Number.isSafeInteger(p.totalCents)||p.totalCents<=0||p.totalCents>100_000_000_000||p.totalCents!==f.corralCents+f.deliveryCents+f.inspectionCents+f.facilityCents)throw Error('Invoice preview changed or requires review. Refresh the selected animal before issuing.');
}

export type RecordedFeeSnapshot={version:number;basis:string;currency:string;corralCents:number;deliveryCents:number;inspectionCents:number;facilityCents:number};
export function validateRecordedFeeSnapshot(v:Record<string,unknown>):void{
 const f=v.feeScheduleSnapshot as RecordedFeeSnapshot|undefined;if(f===undefined)return;
 if(!f||!Number.isSafeInteger(f.version)||f.version<1||f.basis!=='perAnimal'||f.currency!=='PHP'||!['corralCents','deliveryCents','inspectionCents','facilityCents'].every(k=>{const x=f[k as keyof RecordedFeeSnapshot];return typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=100_000_000_000;})||f.corralCents+f.deliveryCents+f.inspectionCents+f.facilityCents!==v.totalCents||(v.feeScheduleVersion!==undefined&&v.feeScheduleVersion!==f.version)||[['corral_fee','corralCents'],['delivery_fee','deliveryCents'],['anti_mortem_fee','inspectionCents'],['facility_fee','facilityCents']].some(([a,b])=>typeof v[a]!=='number'||Math.round((v[a] as number)*100)!==f[b as keyof RecordedFeeSnapshot]))throw Error('Recorded fee snapshot requires review; historical charges have not been recalculated.');
}
