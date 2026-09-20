import { generateVapidKeys } from '@mmmike/web-push/vapid';
const keys = await generateVapidKeys();
console.log('\nVAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey + '\n');
console.log('Keep the private key secret. Add both values as Cloudflare Worker secrets.');
