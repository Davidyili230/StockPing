const $ = id => document.getElementById(id);
const deviceId = localStorage.getItem('stockping-device') || crypto.randomUUID();
localStorage.setItem('stockping-device', deviceId);
let config = null;

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function formatTime(iso) {
  if (!iso) return 'Not checked yet';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown' : `Checked ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function getConfig() {
  const res = await fetch('/api/config');
  config = await res.json();
  $('intervalBadge').textContent = `Every ${Math.round(config.checkIntervalMs / 60000)} min`;
  if (!config.pushConfigured) {
    $('pushHint').textContent = 'Push is not configured on the server yet. Inventory tracking still works.';
    $('notifyBtn').disabled = true;
    $('testBtn').disabled = true;
  } else if (window.matchMedia('(display-mode: standalone)').matches) {
    $('pushHint').textContent = 'Installed app detected. Enable notifications to receive restock alerts.';
  } else {
    $('pushHint').textContent = 'On iPhone: add this site to your Home Screen, open it there, then enable notifications.';
  }
}

async function enableNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('Push notifications are not supported in this browser.');
    return;
  }
  if (!config?.pushConfigured) return;

  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Notification permission was not granted.');
    return;
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });
  }

  const res = await fetch('/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, subscription })
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Could not save notification subscription.');
  $('notifyBtn').textContent = 'Notifications enabled';
  toast('Notifications enabled.');
}

async function testPush() {
  const res = await fetch('/api/test-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Test notification failed.');
  toast('Test alert sent.');
}

function renderWatches(watches) {
  $('emptyState').style.display = watches.length ? 'none' : 'block';
  $('watchList').innerHTML = watches.map(w => {
    const stores = (w.stores || []).map(s => `
      <div class="store"><span>${escapeHtml(s.storeName)}${s.city ? ` · ${escapeHtml(s.city)}` : ''}</span><span>${s.distance == null ? '' : `${escapeHtml(s.distance.toFixed(1))} mi`}</span></div>
    `).join('');
    const error = w.status === 'unknown' && w.lastError ? `<div class="error-note">Check failed — ${escapeHtml(w.lastError)} We will retry automatically.</div>` : '';
    return `
      <article class="watch-card">
        <div class="watch-top">
          <div><h3>${escapeHtml(w.label)}</h3><div class="meta">${escapeHtml(w.part)} · ${escapeHtml(w.location)} · ${escapeHtml(w.radius)} mi · ${escapeHtml(formatTime(w.lastCheckedAt))}</div></div>
          <span class="status ${escapeHtml(w.status)}">${escapeHtml(w.status === 'unavailable' ? 'Out of stock' : w.status)}</span>
        </div>
        ${stores ? `<div class="store-list">${stores}</div>` : ''}
        ${error}
        <div class="watch-actions"><button data-check="${escapeHtml(w.id)}">Check now</button><button data-remove="${escapeHtml(w.id)}" class="danger">Stop watching</button></div>
      </article>
    `;
  }).join('');
}

async function loadWatches() {
  const res = await fetch(`/api/watches?deviceId=${encodeURIComponent(deviceId)}`);
  renderWatches(await res.json());
}

async function createWatch(event) {
  event.preventDefault();
  const payload = {
    deviceId,
    label: $('label').value,
    part: $('part').value,
    location: $('location').value,
    radius: Number($('radius').value),
    productUrl: $('productUrl').value
  };
  const res = await fetch('/api/watches', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not create watch.');
  $('watchForm').reset();
  $('radius').value = '25';
  toast('Watch started. First inventory check is running.');
  await loadWatches();
  setTimeout(loadWatches, 2500);
}

async function handleWatchAction(event) {
  const checkId = event.target.dataset.check;
  const removeId = event.target.dataset.remove;
  if (checkId) {
    event.target.disabled = true;
    event.target.textContent = 'Checking…';
    try {
      const res = await fetch(`/api/check/${encodeURIComponent(checkId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed.');
      toast(data.status === 'available' ? 'Available now!' : data.status === 'unknown' ? 'Apple check failed; status is unknown.' : 'No pickup stock found yet.');
      await loadWatches();
    } finally {
      event.target.disabled = false;
      event.target.textContent = 'Check now';
    }
  }
  if (removeId) {
    const res = await fetch(`/api/watches/${encodeURIComponent(removeId)}?deviceId=${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Could not remove watch.');
    toast('Watch removed.');
    await loadWatches();
  }
}

async function main() {
  if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/sw.js');
  await getConfig();
  await loadWatches();

  $('notifyBtn').addEventListener('click', () => enableNotifications().catch(e => toast(e.message)));
  $('testBtn').addEventListener('click', () => testPush().catch(e => toast(e.message)));
  $('watchForm').addEventListener('submit', e => createWatch(e).catch(err => toast(err.message)));
  $('refreshBtn').addEventListener('click', () => loadWatches().catch(err => toast(err.message)));
  $('watchList').addEventListener('click', e => handleWatchAction(e).catch(err => toast(err.message)));
  setInterval(() => loadWatches().catch(() => {}), 30000);
}

main().catch(error => toast(error.message));
