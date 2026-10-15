// Read-only interpretation of recorded values. Never coerce null/blank/string
// values to zero, distribute unclassified heads, or repair historical records.
export const readHeadcount = value => typeof value==='number' && Number.isSafeInteger(value) && value>=0 ? value : null;
export const readAmount = value => typeof value==='number' && Number.isFinite(value) && value>=0 ? value : null;
export const headcountText = value => readHeadcount(value)===null ? 'Unavailable (missing/invalid)' : String(value);
export const speciesText = value => ['Cow','Pig','Both'].includes(value) ? value : 'Unavailable (unknown/missing species)';
export const validDay = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export function recordedHeads(row) {
  const total=readHeadcount(row.number_of_heads);
  let Cow=null,Pig=null;
  if(row.animal_type==='Cow' && total!==null){Cow=total;Pig=0;}
  if(row.animal_type==='Pig' && total!==null){Cow=0;Pig=total;}
  if(row.animal_type==='Both'){
    const cow=readHeadcount(row.number_of_heads_cow),pig=readHeadcount(row.number_of_heads_pig);
    if(total!==null && cow!==null && pig!==null && cow+pig===total){Cow=cow;Pig=pig;}
  }
  return {total,Cow,Pig,complete:Cow!==null&&Pig!==null};
}
export const emptyHeadcounts = () => ({records:0,totalCovered:0,speciesCovered:0,knownHeads:0,knownCow:0,knownPig:0,unknownSpecies:0,invalidTotals:0,invalidSplits:0});
export function includeHeadcounts(coverage,row) {
  const value=recordedHeads(row);coverage.records++;
  if(value.total!==null){coverage.totalCovered++;coverage.knownHeads+=value.total;}else coverage.invalidTotals++;
  if(!['Cow','Pig','Both'].includes(row.animal_type))coverage.unknownSpecies++;
  if(row.animal_type==='Both'&&!value.complete)coverage.invalidSplits++;
  if(value.complete){coverage.speciesCovered++;coverage.knownCow+=value.Cow;coverage.knownPig+=value.Pig;}
}
export function finishHeadcounts(coverage,undatedRecords=0) {
  const records=coverage.records+undatedRecords;
  const totalComplete=coverage.totalCovered===records&&Number.isSafeInteger(coverage.knownHeads);
  const speciesComplete=coverage.speciesCovered===records&&Number.isSafeInteger(coverage.knownCow)&&Number.isSafeInteger(coverage.knownPig);
  return {...coverage,records,undatedRecords,totalComplete,speciesComplete,
    knownHeads:(coverage.totalCovered>0||records===0)&&Number.isSafeInteger(coverage.knownHeads)?coverage.knownHeads:null,
    knownCow:(coverage.speciesCovered>0||records===0)&&Number.isSafeInteger(coverage.knownCow)?coverage.knownCow:null,
    knownPig:(coverage.speciesCovered>0||records===0)&&Number.isSafeInteger(coverage.knownPig)?coverage.knownPig:null,
    totalHeads:totalComplete?coverage.knownHeads:null,Cow:speciesComplete?coverage.knownCow:null,Pig:speciesComplete?coverage.knownPig:null};
}
export function summarizeHeadcounts(rows,undatedRecords=0) {
  const coverage=emptyHeadcounts();for(const row of rows)includeHeadcounts(coverage,row);return finishHeadcounts(coverage,undatedRecords);
}
export function headcountCoverageText(report) {
  return `${report.speciesComplete?'Species breakdown complete':'Species breakdown unavailable/incomplete'}: ${report.speciesCovered}/${report.records} records classified. Recorded headcount coverage ${report.totalCovered}/${report.records}; known recorded subtotal ${headcountText(report.knownHeads)} heads${report.totalComplete?'': ' (incomplete)'}. Unknown/missing species: ${report.unknownSpecies}; missing/invalid totals: ${report.invalidTotals}; missing/inconsistent splits: ${report.invalidSplits}; undated records: ${report.undatedRecords}.`;
}
export function invoiceHeadcounts(row) {
  const Cow=readHeadcount(row.number_of_heads_cow),Pig=readHeadcount(row.number_of_heads_pig),covered=Number(Cow!==null)+Number(Pig!==null);
  const total=Cow!==null&&Pig!==null&&Number.isSafeInteger(Cow+Pig)?Cow+Pig:null;
  return {Cow,Pig,total,coverage:`Recorded species counts: ${covered}/2. ${total===null?'Headcount total unavailable/incomplete.':'Headcount total complete.'}`};
}
export function invoiceHeadcountLines(row) {
  const heads=invoiceHeadcounts(row);
  return [`Heads - Cow: ${headcountText(heads.Cow)}   Pig: ${headcountText(heads.Pig)}`,`Total heads: ${headcountText(heads.total)}`,heads.coverage];
}
export function summarizeAmounts(rows,field,unplaced=0) {
  const values=rows.map(row=>readAmount(row[field]));
  const covered=values.filter(value=>value!==null).length,knownValue=values.reduce((sum,value)=>sum+(value??0),0);
  const records=rows.length+unplaced,complete=covered===records&&Number.isFinite(knownValue);
  return {value:complete?knownValue:null,knownValue:(covered>0||records===0)&&Number.isFinite(knownValue)?knownValue:null,covered,records,complete,undatedRecords:unplaced};
}
export const emptyAmounts = () => ({records:0,covered:0,knownValue:0});
export function includeAmount(coverage,value) { coverage.records++;const known=readAmount(value);if(known!==null){coverage.covered++;coverage.knownValue+=known;} }
export function finishAmounts(coverage,undatedRecords=0) {
  const records=coverage.records+undatedRecords,complete=coverage.covered===records&&Number.isFinite(coverage.knownValue);
  return {...coverage,records,complete,knownValue:(coverage.covered>0||records===0)&&Number.isFinite(coverage.knownValue)?coverage.knownValue:null,value:complete?coverage.knownValue:null,undatedRecords};
}
export const amountCoverageText = report => `${report.complete?'Amount complete':'Amount unavailable/incomplete'}: ${report.covered}/${report.records} records; known recorded subtotal ${Number.isFinite(report.knownValue)?report.knownValue:'unavailable'}${report.complete?'':' (incomplete)'}; undated records ${report.undatedRecords}.`;
