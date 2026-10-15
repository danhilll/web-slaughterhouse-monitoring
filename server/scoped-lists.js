import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

const collections = { vendors:'vendors', 'slaughter-records':'slaughter_records', invoices:'invoices', notifications:'notifications' };
const id = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 1500 && !/[\u0000/]/.test(value);
const invalid = () => Object.assign(new Error('Invalid or expired list cursor. Refresh the list.'), { status:400, code:'invalid_cursor' });

// Mount after web administrator authentication. Scope and key come from the
// validated release configuration, never a query parameter or request body.
export function createScopedListRouter({ store, scope, cursorSecret, now=Date.now }) {
  if (!id(scope) || !cursorSecret) throw new Error('Scoped list configuration and a stable cursor key are required.');
  const router=Router();
  const sign=value=>createHmac('sha256',cursorSecret).update(value).digest('base64url');
  for (const [path,name] of Object.entries(collections)) router.get(`/${path}`,async(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const principal=req.webUser;
    if (!principal || principal.role!=='admin' || !id(principal.uid)) return res.status(403).json({message:'Web administrator access is required.'});
    try {
      if (Object.keys(req.query).some(key=>!['pageSize','limit','cursor'].includes(key)) || req.query.pageSize!==undefined&&req.query.limit!==undefined) return res.status(400).json({message:'Unsupported list filter.'});
      const size=req.query.pageSize??req.query.limit??'100';
      if (typeof size!=='string' || !/^[1-9]\d{0,2}$/.test(size) || Number(size)>500) return res.status(400).json({message:'Page size must be an integer between 1 and 500.'});
      const limit=Number(size), binding=JSON.stringify([1,principal.uid,principal.role,scope,name,limit]);
      let after;
      if (req.query.cursor!==undefined) {
        const cursor=req.query.cursor;
        if (typeof cursor!=='string' || cursor.length>8192) throw invalid();
        const [data,signature,...extra]=cursor.split('.');
        const expected=Buffer.from(sign(data||'')),actual=Buffer.from(signature||'');
        if (extra.length || actual.length!==expected.length || !timingSafeEqual(actual,expected)) throw invalid();
        let parsed;try { parsed=JSON.parse(Buffer.from(data,'base64url').toString()); } catch { throw invalid(); }
        if (parsed.binding!==binding || !id(parsed.after) || !Number.isFinite(parsed.expires) || parsed.expires<=now()) throw invalid();
        after=parsed.after;
      }
      const rows=await store.page(name,{after,limit});
      if (rows.length>limit+1 || rows.some((row,i)=>row.municipalScopeId!==scope || !id(row.id) ||
          ((i?rows[i-1].id:after)&&Buffer.compare(Buffer.from(i?rows[i-1].id:after),Buffer.from(row.id))>=0))) throw new Error('Invalid scoped page.');
      let items=rows.slice(0,limit);
      const last=items.at(-1)?.id;
      const nextCursor=rows.length>limit?(()=>{const data=Buffer.from(JSON.stringify({binding,after:last,expires:now()+3600000})).toString('base64url');return `${data}.${sign(data)}`;})():null;
      if (name==='invoices' || name==='slaughter_records') {
        const vendors=new Map(await Promise.all([...new Set(items.map(row=>row.vendor_id).filter(id))].map(async vendorId=>[vendorId,await store.get('vendors',vendorId)])));
        items=items.map(row=>({...row,vendor_name:vendors.get(row.vendor_id)?.name||'Unknown Vendor'}));
      }
      res.json({items,nextCursor});
    } catch(error) {
      if (error.status===400) return res.status(400).json({message:error.message,code:error.code});
      next(error);
    }
  });
  return router;
}
