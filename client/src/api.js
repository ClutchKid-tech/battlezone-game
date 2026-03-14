/**
 * API client — thin wrapper over fetch for all REST endpoints.
 */

const BASE = import.meta.env.VITE_SERVER_URL || '';

export class API {
  constructor() {
    this._token = null;
  }

  setToken(token) { this._token = token; }

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  }

  async _req(method, path, body) {
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers:     this._headers(),
      body:        body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || data.message || res.statusText), { status: res.status, data });
    return data;
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  register(username, email, password) {
    return this._req('POST', '/auth/register', { username, email, password });
  }
  login(username, password) {
    return this._req('POST', '/auth/login', { username, password });
  }
  logout() {
    return this._req('POST', '/auth/logout');
  }
  refreshToken(refreshToken) {
    return this._req('POST', '/auth/refresh', { refreshToken });
  }

  // ── Stats ─────────────────────────────────────────────────────────────
  getStats(userId) {
    return this._req('GET', `/stats${userId ? `/${userId}` : ''}`);
  }
  getLeaderboard() {
    return this._req('GET', '/stats/leaderboard');
  }
  getMatchHistory(userId) {
    return this._req('GET', `/stats/matches${userId ? `?userId=${userId}` : ''}`);
  }

  // ── Shop ──────────────────────────────────────────────────────────────
  getShopItems() {
    return this._req('GET', '/shop/items');
  }
  purchaseItem(itemId, paymentMethod) {
    return this._req('POST', '/shop/purchase', { itemId, paymentMethod });
  }
  createPaymentIntent(itemId) {
    return this._req('POST', '/shop/payment-intent', { itemId });
  }
  createCoinPurchaseIntent(coins, amount) {
    return this._req('POST', '/shop/coin-intent', { coins, amount });
  }
  getPurchaseHistory() {
    return this._req('GET', '/shop/history');
  }

  // ── Friends ───────────────────────────────────────────────────────────
  getFriends() {
    return this._req('GET', '/friends');
  }
  sendFriendRequest(username) {
    return this._req('POST', '/friends/request', { username });
  }
  acceptFriendRequest(userId) {
    return this._req('POST', `/friends/${userId}/accept`);
  }
  declineFriendRequest(userId) {
    return this._req('POST', `/friends/${userId}/decline`);
  }
  removeFriend(userId) {
    return this._req('DELETE', `/friends/${userId}`);
  }
}
