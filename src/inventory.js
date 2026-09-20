const APPLE_BASE='https://www.apple.com';
export class InventoryError extends Error { constructor(message,status=0){ super(message); this.name='InventoryError'; this.status=status; } }
const cleanPart=p=>String(p||'').trim().toUpperCase();
export async function checkPickupInventory({parts,location}){
 const unique=[...new Set(parts.map(cleanPart).filter(Boolean))].slice(0,20), loc=String(location||'').trim();
 if(!unique.length)throw new InventoryError('No Apple part numbers supplied.'); if(!loc)throw new InventoryError('No ZIP/postal code supplied.');
 const params=new URLSearchParams({pl:'true',location:loc}); unique.forEach((p,i)=>params.set(`parts.${i}`,p));
 const response=await fetch(`${APPLE_BASE}/shop/retail/pickup-message?${params}`,{headers:{accept:'application/json,text/plain,*/*','accept-language':'en-US,en;q=0.9','cache-control':'no-cache'}});
 if(!response.ok)throw new InventoryError(`Apple inventory request returned HTTP ${response.status}.`,response.status);
 let data; try{data=await response.json();}catch{throw new InventoryError('Apple returned a response that was not valid JSON.');}
 const stores=data?.body?.stores; if(!Array.isArray(stores))throw new InventoryError('Apple inventory response format changed or did not include stores.');
 const byPart=Object.fromEntries(unique.map(p=>[p,[]]));
 for(const store of stores)for(const part of unique){const item=store?.partsAvailability?.[part];if(!item)continue;const display=String(item.pickupDisplay||'').toLowerCase();const distance=Number.parseFloat(store.storedistance);byPart[part].push({storeNumber:store.storeNumber||store.storeId||'',storeName:store.storeName||'Apple Store',city:store.city||'',state:store.state||'',distance:Number.isFinite(distance)?distance:null,available:item.storeSelectionEnabled===true||display==='available',pickupDisplay:item.pickupDisplay||'',pickupQuote:item.pickupSearchQuote||item.pickupSearchQuote2_0||'',productTitle:item?.messageTypes?.regular?.storePickupProductTitle||''});}
 return {checkedAt:new Date().toISOString(),byPart};
}
