# StockPing — Cloudflare Edition

StockPing is an installable iPhone PWA that monitors Apple Store pickup inventory for exact Apple part numbers and sends Web Push alerts when availability changes from unavailable to available.

This edition is built for **Cloudflare Workers + D1 + Cron Triggers**. It does not need Render, Docker, a persistent disk, or an always-on Node server.

## What changed from the Render build
- Express/local JSON storage replaced by a Cloudflare Worker API + D1.
- `setInterval` replaced by a Cloudflare Cron Trigger every 1 minute.
- Node `web-push` replaced by an edge-native Web Crypto push sender.
- Static PWA assets are deployed together with the Worker.
- Render/Docker files are intentionally removed.

## Deploy from your existing GitHub repository

### 1. Replace the old repository files
Upload/commit everything in this ZIP to the repository root. Delete the old `render.yaml`, `Dockerfile`, `.dockerignore`, `.env.example`, `src/server.js`, and `src/store.js` if GitHub still shows them.

### 2. Install locally (recommended)
```bash
npm install
npx wrangler login
```

### 3. Create D1
```bash
npx wrangler d1 create stockping-db
```
Copy the returned `database_id` and replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.jsonc`.

### 4. Create the tables
```bash
npm run db:remote
```

### 5. Generate Web Push keys
```bash
npm run keys
```
Copy the two values. Never commit the private key.

### 6. Add Cloudflare secrets
```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```
Paste the matching value at each prompt.

Edit `VAPID_SUBJECT` in `wrangler.jsonc` to an email you control, for example `mailto:me@example.com`.

### 7. Test
```bash
npm run check
npm run dev
```
Open the local URL. For a local scheduled check use:
```bash
npx wrangler dev --test-scheduled
```

### 8. Deploy
```bash
npm run deploy
```
Wrangler prints the live `workers.dev` URL.

## GitHub automatic deployment
After the first working deployment, you can connect the GitHub repository in Cloudflare **Workers & Pages → Create → Import a repository**. Keep `wrangler.jsonc` as the source of truth. In the Cloudflare Worker settings, make sure the D1 binding is named `DB` and the VAPID secrets are present for the production Worker.

## Install on iPhone
1. Open the HTTPS `workers.dev` URL in Safari.
2. Share → **Add to Home Screen**.
3. Open StockPing from the Home Screen icon.
4. Tap **Enable notifications** and Allow.
5. Tap **Send test alert**.
6. Add an exact Apple part/SKU, ZIP/postal code, and radius.

On iPhone, Web Push requires the web app to be installed to the Home Screen (iOS/iPadOS 16.4+).

## Automatic checks
`wrangler.jsonc` contains `* * * * *`, so Cloudflare invokes the scheduled checker every 1 minute. The app batches up to 20 SKUs for each location and backs off a location for 10 minutes after Apple returns HTTP 429 or 541.

## Inventory caveat
Apple's pickup endpoint is public-facing but undocumented and can change or rate-limit automated requests. StockPing reports failures as **Unknown**, not Out of stock. An alert does not reserve inventory.

## Security
- Never commit VAPID private keys.
- Push subscription endpoints are stored in D1 and should be treated as secrets.
- This is designed as a personal/small private monitor; it uses a browser-generated device ID rather than user accounts.

## Not affiliated with Apple
StockPing is independent and is not affiliated with or endorsed by Apple Inc.


## PC hardware retailer tracking

StockPing also supports the ASUS TUF Gaming GeForce RTX 5090 OC Edition (TUF-RTX5090-O32G-GAMING).

Current sources:
- Best Buy online availability (SKU 6614122)
- Best Buy nearby pickup when `BESTBUY_API_KEY` is configured
- Micro Center pickup availability (SKU 800078)
- B&H online availability (MFR TUF-RTX5090-O32G-GAMING)

For precise Best Buy pickup results by postal code, create a Best Buy Developer API key and store it as a Cloudflare Worker secret:

```bash
npx wrangler secret put BESTBUY_API_KEY
```

Do not commit the API key to `wrangler.jsonc` or Git.
