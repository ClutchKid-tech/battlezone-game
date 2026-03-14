/**
 * Shop — cosmetic item shop with:
 *   Daily/weekly rotation, bundles, purchase flow (coins + Stripe),
 *   purchase history, categories (Skins, Emotes, Wraps, Trails, Screens).
 */

export default class Shop {
  constructor(api) {
    this.api  = api;
    this._root = null;
    this._tab  = 'featured';
    this._items = [];
    this._userCoins = 0;
    this._onClose = null;
  }

  onClose(fn) { this._onClose = fn; }

  // ─────────────────────────────────────────────────────────────────────
  //  Show / hide
  // ─────────────────────────────────────────────────────────────────────

  async show(userCoins) {
    this._userCoins = userCoins;
    if (!this._root) this._buildDOM();
    this._root.style.display = 'flex';
    await this._loadItems();
    this._renderTab(this._tab);
  }

  hide() {
    if (this._root) this._root.style.display = 'none';
  }

  // ─────────────────────────────────────────────────────────────────────
  //  DOM
  // ─────────────────────────────────────────────────────────────────────

  _buildDOM() {
    this._root = document.createElement('div');
    this._root.style.cssText = `
      position:fixed;inset:0;background:linear-gradient(135deg,#0a0a1a,#1a0a2a);
      display:flex;flex-direction:column;z-index:1100;font-family:'Segoe UI',sans-serif;color:#fff;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.1);gap:16px;';
    header.innerHTML = `
      <div style="font-size:24px;font-weight:700;letter-spacing:2px;">ITEM SHOP</div>
      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:6px;font-size:16px;">
        <span style="color:#FFD700;">🪙</span>
        <span id="shop-coins" style="font-weight:700;">${this._userCoins}</span>
        <button id="shop-add-coins" style="
          margin-left:8px;background:linear-gradient(90deg,#fa0,#f60);border:none;color:#fff;
          padding:4px 12px;border-radius:5px;cursor:pointer;font-size:12px;font-weight:700;
        ">+ BUY COINS</button>
      </div>
      <button id="shop-close" style="
        background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;
        padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;
      ">✕ CLOSE</button>
    `;
    this._root.appendChild(header);

    // Tab bar
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex;gap:4px;padding:12px 24px;border-bottom:1px solid rgba(255,255,255,0.07);';
    const tabDefs = [
      { id: 'featured', label: '⭐ Featured' },
      { id: 'skins',    label: '👕 Skins' },
      { id: 'emotes',   label: '💃 Emotes' },
      { id: 'wraps',    label: '🔫 Wraps' },
      { id: 'trails',   label: '🌈 Trails' },
      { id: 'screens',  label: '🖼 Screens' },
      { id: 'history',  label: '🧾 History' },
    ];
    tabDefs.forEach(t => {
      const btn = document.createElement('button');
      btn.dataset.tab = t.id;
      btn.textContent = t.label;
      btn.style.cssText = `
        background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;
        padding:7px 16px;border-radius:6px;cursor:pointer;font-size:13px;
      `;
      btn.addEventListener('click', () => this._renderTab(t.id));
      tabs.appendChild(btn);
    });
    this._root.appendChild(tabs);
    this._tabs = tabs;

    // Content area
    this._content = document.createElement('div');
    this._content.style.cssText = 'flex:1;overflow-y:auto;padding:24px;';
    this._root.appendChild(this._content);

    document.body.appendChild(this._root);

    header.querySelector('#shop-close').addEventListener('click', () => { this.hide(); this._onClose?.(); });
    header.querySelector('#shop-add-coins').addEventListener('click', () => this._showBuyCoins());
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Data
  // ─────────────────────────────────────────────────────────────────────

  async _loadItems() {
    try {
      const data = await this.api.getShopItems();
      this._items = data.items || [];
    } catch { this._items = []; }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Tab rendering
  // ─────────────────────────────────────────────────────────────────────

  _renderTab(tabId) {
    this._tab = tabId;

    // Highlight active tab
    this._tabs?.querySelectorAll('button').forEach(b => {
      b.style.borderColor  = b.dataset.tab === tabId ? '#fa0' : 'rgba(255,255,255,0.12)';
      b.style.background   = b.dataset.tab === tabId ? 'rgba(255,170,0,0.12)' : 'rgba(255,255,255,0.06)';
    });

    if (tabId === 'history') { this._renderHistory(); return; }

    const typeMap = { skins: 'skin', emotes: 'emote', wraps: 'weapon_wrap', trails: 'parachute_trail', screens: 'loading_screen' };
    let filtered;
    if (tabId === 'featured') {
      filtered = this._items.filter(i => i.featured);
    } else {
      filtered = this._items.filter(i => i.cosmetic_type === typeMap[tabId]);
    }

    this._content.innerHTML = '';
    if (filtered.length === 0) {
      this._content.innerHTML = '<div style="text-align:center;opacity:0.5;padding:60px;">No items available</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;';

    for (const item of filtered) {
      const card = this._buildItemCard(item);
      grid.appendChild(card);
    }

    this._content.appendChild(grid);
  }

  _buildItemCard(item) {
    const rarityColors = { common: '#aaa', uncommon: '#4c4', rare: '#44f', epic: '#a4a', legendary: '#fa0', mythic: '#f4a' };
    const color  = rarityColors[item.rarity] || '#fff';
    const card   = document.createElement('div');
    card.style.cssText = `
      background:rgba(255,255,255,0.05);border:1px solid ${color}44;border-radius:12px;
      overflow:hidden;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;
    `;
    card.addEventListener('mouseenter', () => { card.style.transform='translateY(-4px)'; card.style.boxShadow=`0 8px 24px ${color}44`; });
    card.addEventListener('mouseleave', () => { card.style.transform='';                card.style.boxShadow=''; });

    const priceLabel = item.price_real
      ? `$${parseFloat(item.price_real).toFixed(2)}`
      : item.price_coins ? `🪙 ${item.price_coins}` : 'Free';

    card.innerHTML = `
      <div style="height:140px;background:linear-gradient(135deg,${color}22,${color}44);
           display:flex;align-items:center;justify-content:center;font-size:48px;">
        ${this._getItemIcon(item.cosmetic_type)}
      </div>
      <div style="padding:12px;">
        <div style="font-size:11px;color:${color};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${item.rarity}</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">${item.name}</div>
        <button class="shop-buy-btn" style="
          width:100%;background:linear-gradient(90deg,${color}33,${color}55);
          border:1px solid ${color}88;color:#fff;padding:7px;border-radius:6px;
          cursor:pointer;font-size:13px;font-weight:600;
        ">${priceLabel}</button>
      </div>
    `;

    card.querySelector('.shop-buy-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._confirmPurchase(item);
    });

    return card;
  }

  _getItemIcon(type) {
    const icons = { skin: '👤', emote: '💃', weapon_wrap: '🔫', parachute_trail: '🌈', loading_screen: '🖼', spray: '🖌', music_pack: '🎵' };
    return icons[type] || '🎁';
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Purchase flow
  // ─────────────────────────────────────────────────────────────────────

  _confirmPurchase(item) {
    const rarityColors = { common: '#aaa', uncommon: '#4c4', rare: '#44f', epic: '#a4a', legendary: '#fa0' };
    const color = rarityColors[item.rarity] || '#fff';

    const modal = document.createElement('div');
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;
    `;
    modal.innerHTML = `
      <div style="background:#1a1a2a;border:1px solid ${color}66;border-radius:14px;padding:32px;max-width:380px;width:90%;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">${this._getItemIcon(item.cosmetic_type)}</div>
        <div style="font-size:11px;color:${color};text-transform:uppercase;letter-spacing:1px;">${item.rarity}</div>
        <div style="font-size:22px;font-weight:700;margin:8px 0;">${item.name}</div>
        ${item.description ? `<div style="font-size:13px;opacity:0.6;margin-bottom:16px;">${item.description}</div>` : ''}
        <div style="font-size:18px;font-weight:600;margin-bottom:20px;color:#FFD700;">
          ${item.price_coins ? `🪙 ${item.price_coins} coins` : `$${parseFloat(item.price_real).toFixed(2)}`}
        </div>
        <div style="display:flex;gap:10px;justify-content:center;">
          ${item.price_coins ? `
            <button id="modal-buy-coins" style="
              background:linear-gradient(90deg,#fa0,#f60);border:none;color:#fff;
              padding:10px 24px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;
            ">BUY (Coins)</button>
          ` : ''}
          ${item.price_real ? `
            <button id="modal-buy-real" style="
              background:linear-gradient(90deg,#1a7a3a,#2aaa5a);border:none;color:#fff;
              padding:10px 24px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;
            ">BUY ($${parseFloat(item.price_real).toFixed(2)})</button>
          ` : ''}
          <button id="modal-cancel" style="
            background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;
            padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;
          ">CANCEL</button>
        </div>
        <div id="modal-error" style="color:#f88;font-size:13px;margin-top:12px;display:none;"></div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('#modal-cancel').addEventListener('click', close);

    modal.querySelector('#modal-buy-coins')?.addEventListener('click', async () => {
      try {
        await this.api.purchaseItem(item.id, 'coins');
        this._userCoins -= item.price_coins;
        document.getElementById('shop-coins').textContent = this._userCoins;
        close();
        this._showPurchaseSuccess(item);
      } catch (err) {
        modal.querySelector('#modal-error').style.display = '';
        modal.querySelector('#modal-error').textContent = err.message || 'Purchase failed';
      }
    });

    modal.querySelector('#modal-buy-real')?.addEventListener('click', async () => {
      // Trigger Stripe payment flow via API
      try {
        const { clientSecret } = await this.api.createPaymentIntent(item.id);
        await this._stripeCheckout(clientSecret, item);
        close();
        this._showPurchaseSuccess(item);
      } catch (err) {
        modal.querySelector('#modal-error').style.display = '';
        modal.querySelector('#modal-error').textContent = err.message || 'Payment failed';
      }
    });

    document.body.appendChild(modal);
  }

  async _stripeCheckout(clientSecret, item) {
    // Uses Stripe.js loaded via CDN in index.html
    if (!window.Stripe) throw new Error('Stripe not loaded');
    const stripe    = window.Stripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
    const { error } = await stripe.confirmPayment({
      clientSecret,
      confirmParams: { return_url: window.location.origin + '/shop/success' },
      redirect: 'if_required',
    });
    if (error) throw new Error(error.message);
  }

  _showPurchaseSuccess(item) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:fixed;top:24px;left:50%;transform:translateX(-50%);
      background:linear-gradient(90deg,#1a5a1a,#2a8a2a);border:1px solid #4f4;
      color:#fff;padding:12px 24px;border-radius:10px;font-size:16px;font-weight:600;
      z-index:9999;animation:fadeInDown 0.3s ease;
    `;
    toast.textContent = `✓ ${item.name} added to your locker!`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.5s'; setTimeout(()=>toast.remove(),500); }, 3000);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  History
  // ─────────────────────────────────────────────────────────────────────

  async _renderHistory() {
    this._content.innerHTML = '<div style="opacity:0.5;padding:20px;">Loading history…</div>';
    try {
      const receipts = await this.api.getPurchaseHistory();
      if (!receipts?.length) {
        this._content.innerHTML = '<div style="opacity:0.5;padding:40px;text-align:center;">No purchases yet</div>';
        return;
      }
      this._content.innerHTML = `
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="opacity:0.6;font-size:12px;text-transform:uppercase;letter-spacing:1px;">
              <th style="text-align:left;padding:8px;">Item</th>
              <th style="text-align:left;padding:8px;">Date</th>
              <th style="text-align:right;padding:8px;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${receipts.map(r => `
              <tr style="border-top:1px solid rgba(255,255,255,0.05);font-size:14px;">
                <td style="padding:10px 8px;">${r.item_name}</td>
                <td style="padding:10px 8px;opacity:0.6;">${new Date(r.created_at).toLocaleDateString()}</td>
                <td style="padding:10px 8px;text-align:right;">
                  ${r.amount_real > 0 ? `$${parseFloat(r.amount_real).toFixed(2)}` : `🪙 ${r.amount_coins}`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch {
      this._content.innerHTML = '<div style="color:#f88;padding:20px;">Failed to load history</div>';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Buy Coins
  // ─────────────────────────────────────────────────────────────────────

  _showBuyCoins() {
    const bundles = [
      { coins: 1000,  price: 7.99 },
      { coins: 2800,  price: 19.99, bonus: 400  },
      { coins: 5000,  price: 34.99, bonus: 1000 },
      { coins: 10000, price: 59.99, bonus: 3500 },
    ];

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;';
    modal.innerHTML = `
      <div style="background:#1a1a2a;border:1px solid #fa066;border-radius:14px;padding:32px;max-width:480px;width:90%;text-align:center;">
        <div style="font-size:22px;font-weight:700;margin-bottom:20px;">🪙 BUY COINS</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
          ${bundles.map(b => `
            <div class="coin-bundle" data-price="${b.price}" data-coins="${b.coins}" style="
              background:rgba(255,170,0,0.1);border:1px solid #fa0;border-radius:10px;
              padding:16px;cursor:pointer;transition:background 0.15s;
            ">
              <div style="font-size:24px;">🪙 ${b.coins.toLocaleString()}</div>
              ${b.bonus ? `<div style="font-size:12px;color:#fa0;margin:4px 0;">+${b.bonus} BONUS</div>` : '<div style="height:20px;"></div>'}
              <div style="font-size:18px;font-weight:700;margin-top:8px;">$${b.price}</div>
            </div>
          `).join('')}
        </div>
        <button id="modal-cancel" style="background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;">CANCEL</button>
      </div>
    `;

    modal.querySelector('#modal-cancel').addEventListener('click', () => modal.remove());
    modal.querySelectorAll('.coin-bundle').forEach(b => {
      b.addEventListener('click', async () => {
        const price = parseFloat(b.dataset.price);
        const coins = parseInt(b.dataset.coins);
        try {
          const { clientSecret } = await this.api.createCoinPurchaseIntent(coins, price);
          await this._stripeCheckout(clientSecret, { name: `${coins} Coins` });
          modal.remove();
          this._userCoins += coins;
          document.getElementById('shop-coins').textContent = this._userCoins;
        } catch (err) {
          alert('Payment failed: ' + err.message);
        }
      });
    });

    document.body.appendChild(modal);
  }

  dispose() { this._root?.remove(); }
}
