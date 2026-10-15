import { AggregateField, FieldPath } from 'firebase-admin/firestore';

const unavailable = message => Object.assign(new Error(message), { status: 503, publicMessage: true });
// Legacy array endpoints cannot communicate a continuation. Refuse incomplete
// results rather than reporting a bounded page as the complete register.
export function createScopedReads(getDb, scope) {
  const collection = name => getDb().collection(name).where('municipalScopeId', '==', scope);
  const row = doc => ({ ...doc.data(), id: doc.id });
  const aggregate = async (query, fields) => (await query.aggregate(fields).get()).data();
  const count = async query => (await aggregate(query, { value: AggregateField.count() })).value;
  const sum = async (query, field) => (await aggregate(query, { value: AggregateField.sum(field) })).value;
  const recent = async (name, field) => (await collection(name).orderBy(field, 'desc').limit(10).get()).docs.map(row);
  return {
    async list(name) {
      const snapshot = await collection(name).orderBy(FieldPath.documentId()).limit(501).get();
      if (snapshot.docs.length > 500) throw unavailable('This legacy view exceeds 500 scoped records. Use the paginated workflow history; a complete legacy export requires review.');
      return snapshot.docs.map(row);
    },
    async get(name, id) {
      const snapshot = await getDb().collection(name).doc(id).get();
      return snapshot.exists && snapshot.data().municipalScopeId === scope ? row(snapshot) : null;
    },
    async dashboard({ today, month, months, municipality }) {
      const vendors = collection('vendors'), records = collection('slaughter_records'), invoices = collection('invoices');
      const monthStart = `${month}-01`, nextMonth = `${months.at(-1).next}-01`;
      const [totalVendors,totalRecordsToday,totalRecordsThisMonth,totalRevenueThisMonth,unpaidInvoicesCount,recentSlaughterRecords,recentInvoices,monthlySlaughterVolume,feeBreakdown] = await Promise.all([
        count(vendors.where('status','==','Active')),
        count(records.where('date','==',today)),
        count(records.where('date','>=',monthStart).where('date','<',nextMonth)),
        sum(invoices.where('date_issued','>=',monthStart).where('date_issued','<',nextMonth),'total_amount'),
        count(invoices.where('payment_status','in',['Unpaid','Overdue'])),
        recent('slaughter_records','date'), recent('invoices','date_issued'),
        Promise.all(months.map(async ({key,next,label}) => {
          const q=records.where('date','>=',`${key}-01`).where('date','<',`${next}-01`);
          const both=q.where('animal_type','==','Both');
          const [cow,pig,split,mixedCount]=await Promise.all([
            sum(q.where('animal_type','==','Cow'),'number_of_heads'),
            sum(q.where('animal_type','==','Pig'),'number_of_heads'),
            aggregate(both,{count:AggregateField.count(),heads:AggregateField.sum('number_of_heads'),cow:AggregateField.sum('number_of_heads_cow'),pig:AggregateField.sum('number_of_heads_pig')}), count(both)
          ]);
          if(split.count!==mixedCount||split.heads!==split.cow+split.pig)throw unavailable('Historical mixed-species head counts require reconciliation.');
          return {month:label,Cow:cow+split.cow,Pig:pig+split.pig};
        })),
        Promise.all([['Corral / casket','corral_fee'],['Delivery','delivery_fee'],['Inspection','anti_mortem_fee'],['Facility','facility_fee']].map(async ([name,field])=>({name,value:await sum(invoices,field)})))
      ]);
      const ids=[...new Set([...recentSlaughterRecords,...recentInvoices].map(item=>item.vendor_id).filter(Boolean))];
      const names=new Map(await Promise.all(ids.map(async id=>{const doc=await getDb().collection('vendors').doc(id).get();return [id,doc.exists&&doc.data().municipalScopeId===scope?doc.data().name:'Unknown Vendor'];})));
      return {
        summary:{totalVendors,totalRecordsToday,totalRecordsThisMonth,totalRevenueThisMonth,unpaidInvoicesCount},
        recentSlaughterRecords:recentSlaughterRecords.map(item=>({...item,vendor_name:names.get(item.vendor_id)||'Unknown Vendor'})),
        recentInvoices:recentInvoices.map(item=>({...item,vendor_name:names.get(item.vendor_id)||'Unknown Vendor'})),
        monthlySlaughterVolume,feeBreakdown,municipality,
        recordBasis:'Legacy slaughter register only; individual animal register is available separately. Invoice totals include each scoped invoice document once.'
      };
    }
  };
}
