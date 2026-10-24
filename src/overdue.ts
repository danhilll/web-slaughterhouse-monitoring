import {manilaDay,validDay} from './monitoringMetrics.ts';
// Owner rule (2026-10-24): flag only. An invoice is Overdue while it is Unpaid after its due date (Asia/Manila day).
// It never blocks payment recording or dispatch. Android applies the same rule.
export type PaymentState='Paid'|'Unpaid'|'Overdue';
export function paymentState(row:{payment_status?:string;due_date?:string},now=new Date()):PaymentState|null{
 if(row.payment_status==='Paid'||row.payment_status==='Overdue')return row.payment_status;
 if(row.payment_status!=='Unpaid')return null;
 return validDay(row.due_date)&&row.due_date<manilaDay(now)!?'Overdue':'Unpaid';
}
export const paymentText=(row:{payment_status?:string;due_date?:string},now=new Date())=>{const s=paymentState(row,now);return s==='Overdue'?'Overdue (unpaid after due date)':s??'Payment status unavailable';};
