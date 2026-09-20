import { sendPushNotification } from '@mmmike/web-push/send';
import { checkPickupInventory, InventoryError } from './inventory.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const normalizePart = v => String(v || '').trim().toUpperCase();
const normalizeLocation = v => String(v || '').trim();
const parseStores = value => { try { return JSON.parse(value || '[]'); } catch { return []; } };

function safeWatch(w) {
  return { id:w.id, deviceId:w.device_id, label:w.label, part:w.part, location:w.location, radius:w.radius, productUrl:w.product_url, status:w.status, stores:parseStores(w.stores_json), lastCheckedAt:w.last_checked_at, lastError:w.last_error, createdAt:w.created_at };
}
async function body(request) { try { return await request.json(); } catch { return {}; } }
async function getWatch(env, id, deviceId) { return env.DB.prepare('SELECT * FROM watches WHERE id=? AND device_id=?').bind(id, deviceId).first(); }

async function saveSubscription(env, deviceId, subscription) {
  await env.DB.prepare(`INSERT INTO subscriptions(device_id,subscription_json,updated_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET subscription_json=excluded.subscription_json, updated_at=excluded.updated_at`)
    .bind(deviceId, JSON.stringify(subscription), new Date().toISOString()).run();
}
async function sendPush(env, deviceId, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error('Push is not configured.');
  const row = await env.DB.prepare('SELECT subscription_json FROM subscriptions WHERE device_id=?').bind(deviceId).first();
  if (!row) return false;
  let subscription; try { subscription = JSON.parse(row.subscription_json); } catch { return false; }
  const delivered = await sendPushNotification(subscription, payload, { publicKey:env.VAPID_PUBLIC_KEY, privateKey:env.VAPID_PRIVATE_KEY, subject:env.VAPID_SUBJECT || 'mailto:admin@example.com' }, { ttl:300, urgency:'high', timeoutMs:15000 });
  if (!delivered) await env.DB.prepare('DELETE FROM subscriptions WHERE device_id=?').bind(deviceId).run();
  return delivered;
}

async function runChecksForLocation(env, location, force=false) {
  const loc = normalizeLocation(location); if (!loc) return;
  if (!force) {
    const backoff = await env.DB.prepare('SELECT until_ms FROM location_backoff WHERE location=?').bind(loc).first();
    if (backoff && Number(backoff.until_ms) > Date.now()) return;
  }
  const result = await env.DB.prepare('SELECT * FROM watches WHERE location=? ORDER BY created_at').bind(loc).all();
  const watches = result.results || []; if (!watches.length) return;
  const parts = [...new Set(watches.map(w => w.part))].slice(0,20);
  try {
    const inventory = await checkPickupInventory({ parts, location:loc });
    for (const watch of watches) {
      const returned = inventory.byPart[watch.part] || [];
      if (!returned.length) {
        await env.DB.prepare(`UPDATE watches SET status='unknown',stores_json='[]',last_checked_at=?,last_error=? WHERE id=?`).bind(inventory.checkedAt,'Apple returned no inventory data for this part number. Check the SKU and try again.',watch.id).run();
        continue;
      }
      const available = returned.filter(s => (s.distance == null || s.distance <= Number(watch.radius)) && s.available);
      const nowAvailable = available.length > 0;
      let notified = Number(watch.notified_available || 0);
      if (nowAvailable && watch.status !== 'available' && !notified) {
        const names = available.slice(0,3).map(s=>s.storeName).join(', ');
        const more = available.length > 3 ? ` +${available.length-3} more` : '';
        try {
          await sendPush(env, watch.device_id, { title:`${watch.label} is in stock`, body:`${names}${more}. Tap to open Apple.`, url:watch.product_url || 'https://www.apple.com/store', tag:`stock-${watch.id}` });
          notified = 1;
        } catch (e) { console.log('Push failed', e?.message || String(e)); }
      } else if (!nowAvailable) notified = 0;
      await env.DB.prepare(`UPDATE watches SET status=?,stores_json=?,last_checked_at=?,last_error=NULL,notified_available=? WHERE id=?`).bind(nowAvailable?'available':'unavailable',JSON.stringify(available),inventory.checkedAt,notified,watch.id).run();
    }
    await env.DB.prepare('DELETE FROM location_backoff WHERE location=?').bind(loc).run();
  } catch (error) {
    const status = error instanceof InventoryError ? error.status : 0;
    const message = error?.message || 'Inventory check failed.';
    if (status === 429 || status === 541) await env.DB.prepare(`INSERT INTO location_backoff(location,until_ms) VALUES(?,?) ON CONFLICT(location) DO UPDATE SET until_ms=excluded.until_ms`).bind(loc,Date.now()+10*60*1000).run();
    await env.DB.prepare(`UPDATE watches SET status='unknown',last_checked_at=?,last_error=? WHERE location=?`).bind(new Date().toISOString(),message,loc).run();
  }
}
async function checkAll(env) {
  const rows = await env.DB.prepare('SELECT DISTINCT location FROM watches ORDER BY location LIMIT 25').all();
  for (const row of rows.results || []) await runChecksForLocation(env,row.location,false);
}

async function api(request, env, url) {
  const path=url.pathname;
  if (path==='/api/health' && request.method==='GET') return json({ok:true,service:'StockPing',platform:'Cloudflare Workers'});
  if (path==='/api/config' && request.method==='GET') return json({pushConfigured:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),vapidPublicKey:env.VAPID_PUBLIC_KEY||'',checkIntervalMs:Number(env.CHECK_INTERVAL_MS||300000)});
  if (path==='/api/watches' && request.method==='GET') {
    const deviceId=url.searchParams.get('deviceId')||''; if(!deviceId)return json({error:'deviceId is required'},400);
    const rows=await env.DB.prepare('SELECT * FROM watches WHERE device_id=? ORDER BY created_at DESC').bind(deviceId).all(); return json((rows.results||[]).map(safeWatch));
  }
  if (path==='/api/subscriptions' && request.method==='POST') {
    const b=await body(request); if(!b.deviceId||!b.subscription?.endpoint)return json({error:'deviceId and a valid push subscription are required.'},400);
    await saveSubscription(env,String(b.deviceId),b.subscription); return json({ok:true});
  }
  if (path==='/api/watches' && request.method==='POST') {
    const b=await body(request), deviceId=String(b.deviceId||'').trim(), part=normalizePart(b.part), location=normalizeLocation(b.location), label=String(b.label||part).trim().slice(0,120), productUrl=String(b.productUrl||'').trim().slice(0,500), radius=Math.min(250,Math.max(1,Number(b.radius||25)));
    if(!deviceId||!part||!location)return json({error:'deviceId, Apple part number, and ZIP/postal code are required.'},400);
    if(!/^[A-Z0-9-]+(?:\/[A-Z])?$/.test(part))return json({error:'That does not look like an Apple part number/SKU.'},400);
    const id=crypto.randomUUID(), created=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO watches(id,device_id,label,part,location,radius,product_url,status,stores_json,created_at) VALUES(?,?,?,?,?,?,?,'pending','[]',?)`).bind(id,deviceId,label,part,location,radius,productUrl,created).run();
    const w=await getWatch(env,id,deviceId); return json(safeWatch(w),201);
  }
  const match=path.match(/^\/api\/watches\/([^/]+)$/);
  if(match && request.method==='DELETE') { const deviceId=url.searchParams.get('deviceId')||''; const r=await env.DB.prepare('DELETE FROM watches WHERE id=? AND device_id=?').bind(decodeURIComponent(match[1]),deviceId).run(); return json({ok:(r.meta?.changes||0)>0},(r.meta?.changes||0)>0?200:404); }
  const check=path.match(/^\/api\/check\/([^/]+)$/);
  if(check && request.method==='POST') { const b=await body(request); const w=await getWatch(env,decodeURIComponent(check[1]),String(b.deviceId||'')); if(!w)return json({error:'Watch not found.'},404); await runChecksForLocation(env,w.location,true); return json(safeWatch(await getWatch(env,w.id,w.device_id))); }
  if(path==='/api/test-push' && request.method==='POST') { const b=await body(request); try { const ok=await sendPush(env,String(b.deviceId||''),{title:'StockPing is ready',body:'You will get an alert here when a watched Apple product becomes available.',url:'/',tag:'stockping-test'}); return ok?json({ok:true}):json({error:'No active push subscription saved for this device.'},404); } catch(e){ return json({error:`Push test failed: ${e.message}`},502); } }
  return json({error:'Not found'},404);
}

export default {
  async fetch(request, env) { const url=new URL(request.url); if(url.pathname.startsWith('/api/')) return api(request,env,url); return env.ASSETS.fetch(request); },
  async scheduled(_controller, env, ctx) { ctx.waitUntil(checkAll(env)); }
};
