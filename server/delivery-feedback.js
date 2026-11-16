// Owner decision 2026-11-16: the owning Vendor rates each completed delivery once (1-5 stars, optional
// feedback up to 500 characters). Final once submitted. Read by that Vendor and the same-municipality Web
// administrator only. A rating never changes the invoice, fees, payment, Overdue flag, delivery or tracking.
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const FEEDBACK_PROJECTION='delivery_feedback_v1';
export const FEEDBACK_COMMENT_MAX=500;
const instant=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
// Newline is the only permitted control character; text is stored and shown as plain text, never HTML.
export const validComment=value=>value===null||typeof value==='string'&&value===value.trim()&&value.length>=1&&value.length<=FEEDBACK_COMMENT_MAX&&!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(value);
export const validRating=value=>Number.isInteger(value)&&value>=1&&value<=5;

/** Exact body {rating, comment, confirmed:true}; no coercion, extra fields, client time or actor. */
export function validateFeedbackInput(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='comment,confirmed,rating'||
    !validRating(body.rating)||!validComment(body.comment)||body.confirmed!==true)
    throw fail(400,'Choose 1 to 5 stars, optional feedback of 1 to 500 characters (or null), and confirm that it cannot be changed.');
  return {rating:body.rating,comment:body.comment};
}
/** Owning Vendor or same-municipality administrator; everyone else is told the delivery does not exist. */
export const feedbackReadable=(row,p)=>Boolean(row?.delivery&&row.municipalScopeId===p.municipalScopeId&&(p.role==='admin'||p.role==='vendor'&&row.vendor_id===p.vendorBusinessId));
export function validateStoredFeedback(f,row){
  if(!f||f.invoiceId!==row.id||f.municipalScopeId!==row.municipalScopeId||f.vendorBusinessId!==row.vendor_id||!validRating(f.rating)||!validComment(f.comment)||!instant(f.submittedAt)||typeof f.submittedBy!=='string'||!f.submittedBy)
    throw fail(503,'Delivery feedback requires municipal review.');
  return f;
}
const publicFeedback=f=>f?{rating:f.rating,comment:f.comment,submittedAt:f.submittedAt}:null;
/** Exactly the fields Android accepts; canSubmit is always false once feedback exists. */
export const feedbackProjection=(row,f,p,writable)=>({projection:FEEDBACK_PROJECTION,invoiceId:row.id,
  canSubmit:Boolean(writable&&!f&&p.role==='vendor'&&row.vendor_id===p.vendorBusinessId&&row.delivery?.status==='delivered'),feedback:publicFeedback(f)});
/** Administrator monitoring row; the submitting account is never exposed. */
export const feedbackListView=f=>({id:f.invoiceId,invoiceId:f.invoiceId,vendorBusinessId:f.vendorBusinessId,rating:f.rating,comment:f.comment,submittedAt:f.submittedAt});
