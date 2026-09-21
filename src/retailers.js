export const RETAIL_PRODUCT={
  id:"asus-tuf-rtx5090-oc",
  name:"ASUS TUF Gaming GeForce RTX 5090 OC Edition",
  part:"RETAIL:ASUS-TUF-RTX5090-O32G",
  model:"TUF-RTX5090-O32G-GAMING",
  bestBuySku:"6614122",
  microCenterSku:"800078",
  bhSku:"ASTX5090O32G",
  productUrl:"https://www.asus.com/us/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx5090-o32g-gaming/"
};
const URLS={
  bestBuy:"https://www.bestbuy.com/product/asus-tuf-gaming-nvidia-geforce-rtx-5090-32gb-gddr7-pci-express-5-0-graphics-card-black/6614122",
  microCenter:"https://www.microcenter.com/product/690033/asus-nvidia-geforce-rtx-5090-tuf-gaming-overclocked-triple-fan-32gb-gddr7-pcie-50-graphics-card_hatchfeed?storeid=029",
  bh:"https://www.bhphotovideo.com/c/product/1875902-REG/asus_tuf_rtx5090_o32g_gaming_geforce_rtx_5090_tuf.html"
};
const headers={"user-agent":"Mozilla/5.0 (compatible; StockPing/2.0)","accept":"text/html,application/xhtml+xml"};
const clean=s=>String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
async function html(url){const r=await fetch(url,{headers});if(!r.ok)throw Error("HTTP "+r.status);return clean(await r.text())}
async function postalState(postal){const z=String(postal||"").trim().slice(0,5);if(!/^\d{5}$/.test(z))return"";try{const r=await fetch("https://api.zippopotam.us/us/"+z);if(!r.ok)return"";const d=await r.json();return String(d?.places?.[0]?.["state abbreviation"]||"").toUpperCase()}catch{return""}}
async function bestBuy(env,postal){
  const out=[];
  if(env.BESTBUY_API_KEY){
    try{
      const key=encodeURIComponent(env.BESTBUY_API_KEY),sku=RETAIL_PRODUCT.bestBuySku;
      const [pr,sr]=await Promise.all([
        fetch("https://api.bestbuy.com/v1/products/"+sku+".json?show=onlineAvailability,salePrice,url&apiKey="+key),
        fetch("https://api.bestbuy.com/v1/products/"+sku+"/stores.json?postalCode="+encodeURIComponent(postal)+"&apiKey="+key)
      ]);
      if(pr.ok){const p=await pr.json();out.push({storeNumber:"bestbuy-online",storeName:"Best Buy Online",city:"Online",state:"",distance:null,available:p.onlineAvailability===true,pickupDisplay:p.onlineAvailability===true?"Online":"Sold out",url:p.url||URLS.bestBuy,channel:"online",retailer:"Best Buy"})}
      if(sr.ok){const d=await sr.json();for(const s of d.stores||[])out.push({storeNumber:"bestbuy-"+s.storeID,storeName:"Best Buy - "+s.name,city:s.city||"",state:s.state||"",distance:Number.isFinite(+s.distance)?+s.distance:null,available:true,pickupDisplay:s.lowStock?"Low stock pickup":"Pickup available",url:URLS.bestBuy,channel:"pickup",retailer:"Best Buy"})}
      if(out.length)return out;
    }catch{}
  }
  try{const t=(await html(URLS.bestBuy)).toLowerCase(),sold=t.includes("sold out"),available=!sold&&(t.includes("add to cart")||t.includes("add to bag"));out.push({storeNumber:"bestbuy-online",storeName:"Best Buy Online",city:"Online",state:"",distance:null,available,pickupDisplay:available?"Online":"Sold out",url:URLS.bestBuy,channel:"online",retailer:"Best Buy"})}catch{}
  return out
}
async function bh(){
  try{const t=(await html(URLS.bh)).toLowerCase(),unavailable=t.includes("temporarily out of stock")||t.includes("discontinued"),available=!unavailable&&(t.includes("in stock")||t.includes("add to cart"));return[{storeNumber:"bh-online",storeName:"B&H Photo Online",city:"Online",state:"",distance:null,available,pickupDisplay:available?"Online":"Out of stock",url:URLS.bh,channel:"online",retailer:"B&H Photo"}]}catch{return[]}
}
async function microCenter(postal){
  try{
    const [t,state]=await Promise.all([html(URLS.microCenter),postalState(postal)]),out=[],re=/\b([A-Z]{2})\s*-\s*([^()]{2,45}?)\s*\((in stock|out of stock)\)/gi;
    let m;while((m=re.exec(t))){const st=m[1].toUpperCase(),city=m[2].trim(),available=m[3].toLowerCase()==="in stock";out.push({storeNumber:"microcenter-"+st+"-"+city.toLowerCase().replace(/[^a-z0-9]+/g,"-"),storeName:"Micro Center - "+city,city,state:st,distance:null,available,pickupDisplay:available?"Pickup available":"Out of stock",url:URLS.microCenter,channel:"pickup",retailer:"Micro Center",nearby:state?st===state:true})}
    const unique=[...new Map(out.map(x=>[x.storeNumber,x])).values()];
    return state?unique.filter(x=>x.state===state):unique;
  }catch{return[]}
}
export async function checkRetailInventory({part,location,env}){
  if(part!==RETAIL_PRODUCT.part)throw Error("Unknown retail product.");
  const postal=String(location||"").includes("|")?String(location).split("|").slice(1).join("|"):String(location||"");
  const groups=await Promise.all([bestBuy(env,postal),bh(),microCenter(postal)]),stores=groups.flat();
  if(!stores.length)throw Error("Retailers did not return inventory data.");
  stores.sort((a,b)=>Number(b.available)-Number(a.available)||(a.distance??99999)-(b.distance??99999));
  return{checkedAt:new Date().toISOString(),stores}
}
export function discoverRetailProduct(productId){
  if(productId!==RETAIL_PRODUCT.id)return null;
  return{product:{id:RETAIL_PRODUCT.id,name:RETAIL_PRODUCT.name},configurations:[{part:RETAIL_PRODUCT.part,name:"Black — 32GB GDDR7 — OC Edition",productUrl:RETAIL_PRODUCT.productUrl}]}
}