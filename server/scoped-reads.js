import { emptyHeadcounts, includeHeadcounts, finishHeadcounts, emptyAmounts, includeAmount, finishAmounts, validDay } from '../shared/reporting.js';
import { AggregateField, FieldPath } from 'firebase-admin/firestore';

const unavailable = message => Object.assign(new Error(message), { status: 503, publicMessage: true });
// Public production lists use page(). The older complete-array helper remains
// defensive for legacy internal callers; it never returns a truncated register.
export function createScopedReads(getDb, scope) {
  const collection = name => getDb().collection(name).where('municipalScopeId', '==', scope);
  const row = doc => ({ ...doc.data(), id: doc.id });
  const aggregate = async (query, fields) => (await query.aggregate(fields).get()).data();
  const count = async query => (await aggregate(query, { value: AggregateField.count() })).value;
  const sum = async (query, field) => (await aggregate(query, { value: AggregateField.sum(field) })).value;
  const recent = async (name, field) => (await collection(name).orderBy(field, 'desc').limit(10).get()).docs.map(row);
  const recordCoverage = async (months,today,currentMonth) => {
    const overall=emptyHeadcounts(),byMonth=new Map(months.map(({key})=>[key,emptyHeadcounts()]));
    let after,undated=0,knownToday=0;
    for (;;) {
      let query=collection('slaughter_records').orderBy(FieldPath.documentId()).select('animal_type','number_of_heads','number_of_heads_cow','number_of_heads_pig','date');
      if(after!==undefined)query=query.startAfter(after);
      const page=(await query.limit(500).get()).docs;
      for(const doc of page){const row=doc.data();includeHeadcounts(overall,row);if(!validDay(row.date))undated++;else {if(row.date===today)knownToday++;const bucket=byMonth.get(row.date.slice(0,7));if(bucket)includeHeadcounts(bucket,row);}}
      if(page.length<500)break;after=page.at(-1).id;
    }
    return {overall:{...finishHeadcounts(overall),undatedRecords:undated},undated,byMonth,knownToday,knownMonth:byMonth.get(currentMonth)?.records??0};
  };
  const invoiceCoverage = async month => {
    const revenue=emptyAmounts(),fees=Object.fromEntries(['corral_fee','delivery_fee','anti_mortem_fee','facility_fee'].map(field=>[field,emptyAmounts()]));
    let after,undated=0;
    for (;;) {
      let query=collection('invoices').orderBy(FieldPath.documentId()).select('date_issued','total_amount',...Object.keys(fees));
      if(after!==undefined)query=query.startAfter(after);
      const page=(await query.limit(500).get()).docs;
      for(const doc of page){const row=doc.data();for(const [field,coverage] of Object.entries(fees))includeAmount(coverage,row[field]);if(!validDay(row.date_issued))undated++;else if(row.date_issued.slice(0,7)===month)includeAmount(revenue,row.total_amount);}
      if(page.length<500)break;after=page.at(-1).id;
    }
    return {revenue:finishAmounts(revenue,undated),fees:Object.fromEntries(Object.entries(fees).map(([field,coverage])=>[field,finishAmounts(coverage)]))};
  };
  return {
    async page(name, {after, limit}) {
      let query=collection(name).orderBy(FieldPath.documentId());
      if (after!==undefined) query=query.startAfter(after);
      return (await query.limit(limit+1).get()).docs.map(row);
    },
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
      const [totalVendors,totalRecordsToday,totalRecordsThisMonth,totalRevenueThisMonth,unpaidInvoicesCount,recentSlaughterRecords,recentInvoices,volumeReport,feeBreakdown,invoiceReport] = await Promise.all([
        count(vendors.where('status','==','Active')),
        count(records.where('date','==',today)),
        count(records.where('date','>=',monthStart).where('date','<',nextMonth)),
        sum(invoices.where('date_issued','>=',monthStart).where('date_issued','<',nextMonth),'total_amount'),
        count(invoices.where('payment_status','in',['Unpaid','Overdue'])),
        recent('slaughter_records','date'), recent('invoices','date_issued'),
        recordCoverage(months,today,month).then(({overall,undated,byMonth,knownToday,knownMonth})=>({overall,knownToday,knownMonth,months:months.map(({key,label})=>{
          const coverage=finishHeadcounts(byMonth.get(key),undated);
          return {month:label,Cow:coverage.Cow,Pig:coverage.Pig,coverage};
        })})),
        Promise.all([['Corral / casket','corral_fee'],['Delivery','delivery_fee'],['Inspection','anti_mortem_fee'],['Facility','facility_fee']].map(async ([name,field])=>({name,value:await sum(invoices,field),field}))),
        invoiceCoverage(month)
      ]);
      const ids=[...new Set([...recentSlaughterRecords,...recentInvoices].map(item=>item.vendor_id).filter(Boolean))];
      const names=new Map(await Promise.all(ids.map(async id=>{const doc=await getDb().collection('vendors').doc(id).get();return [id,doc.exists&&doc.data().municipalScopeId===scope?doc.data().name:'Unknown Vendor'];})));
      return {
        summary:{totalVendors,totalRecordsToday:volumeReport.overall.undatedRecords?null:totalRecordsToday,totalRecordsThisMonth:volumeReport.overall.undatedRecords?null:totalRecordsThisMonth,totalRevenueThisMonth:invoiceReport.revenue.complete?totalRevenueThisMonth:null,unpaidInvoicesCount},
        recentSlaughterRecords:recentSlaughterRecords.map(item=>({...item,vendor_name:names.get(item.vendor_id)||'Unknown Vendor'})),
        recentInvoices:recentInvoices.map(item=>({...item,vendor_name:names.get(item.vendor_id)||'Unknown Vendor'})),
        monthlySlaughterVolume:volumeReport.months,headcountCoverage:volumeReport.overall,
        recordDateCoverage:{undatedRecords:volumeReport.overall.undatedRecords,knownRecordsToday:volumeReport.knownToday,knownRecordsThisMonth:volumeReport.knownMonth},
        revenueCoverage:invoiceReport.revenue,
        feeBreakdown:feeBreakdown.map(({name,value,field})=>({name,value:invoiceReport.fees[field].complete?value:null,coverage:invoiceReport.fees[field]})),municipality,
        recordBasis:'Legacy slaughter register only; individual animal register is available separately. Invoice totals include each scoped invoice document once.'
      };
    }
  };
}
