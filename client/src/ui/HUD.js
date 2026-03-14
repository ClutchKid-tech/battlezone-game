/**
 * HUD — pure DOM overlay (no Three.js) for:
 *   Health bar, Armor bar, Ammo counter, Kill feed,
 *   Zone timer, Player count, Minimap, Crosshair,
 *   Hit marker, Damage directional indicator,
 *   Hitmarker, Zone warning, Loot prompt, Chat.
 */

export default class HUD {
  constructor() {
    this._el = {};      // named DOM element cache
    this._killFeedTimers = [];
    this._hitmarkerTimer = 0;
    this._zoneDamageAlpha = 0;
    this._outOfZone = false;

    this._buildDOM();
    this._bindEvents();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Build DOM
  // ─────────────────────────────────────────────────────────────────────

  _buildDOM() {
    const hud = this._createEl('div', 'hud');
    hud.style.cssText = `
      position:fixed; inset:0; pointer-events:none;
      font-family:'Segoe UI',sans-serif; color:#fff;
      text-shadow:1px 1px 2px #000;
    `;

    // ── Health & Armor ────────────────────────────────────────────────
    const vitals = this._createEl('div', 'vitals');
    vitals.style.cssText = 'position:absolute;bottom:60px;left:20px;width:220px;';
    vitals.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="font-size:12px;width:16px;">❤</span>
        <div style="flex:1;height:10px;background:rgba(0,0,0,0.5);border-radius:5px;overflow:hidden;">
          <div id="hud-health-bar" style="height:100%;width:100%;background:#e05050;transition:width 0.2s;border-radius:5px;"></div>
        </div>
        <span id="hud-health-val" style="font-size:14px;font-weight:bold;min-width:28px;text-align:right;">100</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;width:16px;">🛡</span>
        <div style="flex:1;height:10px;background:rgba(0,0,0,0.5);border-radius:5px;overflow:hidden;">
          <div id="hud-armor-bar" style="height:100%;width:0%;background:#50a0e0;transition:width 0.2s;border-radius:5px;"></div>
        </div>
        <span id="hud-armor-val" style="font-size:14px;font-weight:bold;min-width:28px;text-align:right;">0</span>
      </div>
    `;
    hud.appendChild(vitals);

    // ── Ammo ──────────────────────────────────────────────────────────
    const ammo = this._createEl('div', 'ammo');
    ammo.style.cssText = 'position:absolute;bottom:60px;right:20px;text-align:right;';
    ammo.innerHTML = `
      <div id="hud-weapon-name" style="font-size:12px;opacity:0.8;"></div>
      <div style="font-size:28px;font-weight:bold;">
        <span id="hud-ammo-mag">--</span>
        <span style="font-size:16px;opacity:0.6;"> / </span>
        <span id="hud-ammo-reserve" style="font-size:16px;opacity:0.7;">--</span>
      </div>
      <div id="hud-reload-text" style="font-size:13px;color:#FFD700;display:none;">RELOADING...</div>
    `;
    hud.appendChild(ammo);

    // ── Player count & zone timer ─────────────────────────────────────
    const topRight = this._createEl('div', 'topright');
    topRight.style.cssText = 'position:absolute;top:12px;right:20px;text-align:right;';
    topRight.innerHTML = `
      <div style="font-size:22px;font-weight:bold;">
        <span id="hud-alive-count">100</span>
        <span style="font-size:13px;opacity:0.7;"> players</span>
      </div>
      <div id="hud-zone-info" style="font-size:13px;margin-top:4px;opacity:0.9;"></div>
    `;
    hud.appendChild(topRight);

    // ── Kill feed ─────────────────────────────────────────────────────
    const killfeed = this._createEl('div', 'killfeed');
    killfeed.style.cssText = 'position:absolute;top:12px;right:20px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;margin-top:70px;';
    hud.appendChild(killfeed);

    // ── Crosshair ─────────────────────────────────────────────────────
    const xhair = this._createEl('div', 'crosshair');
    xhair.style.cssText = `
      position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
      width:20px;height:20px;
    `;
    xhair.innerHTML = `
      <div style="position:absolute;top:50%;left:0;width:100%;height:1px;background:rgba(255,255,255,0.8);transform:translateY(-50%);"></div>
      <div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:rgba(255,255,255,0.8);transform:translateX(-50%);"></div>
      <div id="hud-hitmarker" style="position:absolute;inset:-4px;display:none;">
        <div style="position:absolute;top:0;left:0;width:6px;height:2px;background:#f44;transform:rotate(45deg);transform-origin:0 50%;"></div>
        <div style="position:absolute;top:0;right:0;width:6px;height:2px;background:#f44;transform:rotate(-45deg);transform-origin:100% 50%;"></div>
        <div style="position:absolute;bottom:0;left:0;width:6px;height:2px;background:#f44;transform:rotate(-45deg);transform-origin:0 50%;"></div>
        <div style="position:absolute;bottom:0;right:0;width:6px;height:2px;background:#f44;transform:rotate(45deg);transform-origin:100% 50%;"></div>
      </div>
    `;
    hud.appendChild(xhair);

    // ── Zone damage overlay ───────────────────────────────────────────
    const zoneOverlay = this._createEl('div', 'zone-overlay');
    zoneOverlay.style.cssText = `
      position:absolute;inset:0;
      background:radial-gradient(ellipse at center, transparent 50%, rgba(50,0,200,0.5) 100%);
      pointer-events:none;display:none;
    `;
    hud.appendChild(zoneOverlay);

    // ── Loot prompt ───────────────────────────────────────────────────
    const lootPrompt = this._createEl('div', 'loot-prompt');
    lootPrompt.style.cssText = `
      position:absolute;bottom:130px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.3);
      padding:8px 16px;border-radius:6px;font-size:14px;display:none;text-align:center;
    `;
    hud.appendChild(lootPrompt);

    // ── Chat ──────────────────────────────────────────────────────────
    const chat = this._createEl('div', 'chat');
    chat.style.cssText = `
      position:absolute;bottom:110px;left:20px;width:320px;
      display:flex;flex-direction:column;gap:2px;
    `;
    hud.appendChild(chat);

    const chatMessages = this._createEl('div', 'chat-messages');
    chatMessages.style.cssText = 'max-height:120px;overflow:hidden;display:flex;flex-direction:column-reverse;gap:2px;';
    chat.appendChild(chatMessages);

    // ── Damage directional indicator ──────────────────────────────────
    const damageDir = this._createEl('div', 'damage-dir');
    damageDir.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    hud.appendChild(damageDir);

    // ── Zone warning text ─────────────────────────────────────────────
    const zoneWarning = this._createEl('div', 'zone-warning');
    zoneWarning.style.cssText = `
      position:absolute;top:20%;left:50%;transform:translateX(-50%);
      font-size:22px;font-weight:bold;color:#6699ff;
      text-shadow:0 0 10px #6699ff;display:none;text-align:center;
    `;
    zoneWarning.textContent = '⚠ OUTSIDE SAFE ZONE';
    hud.appendChild(zoneWarning);

    document.body.appendChild(hud);
    this._root = hud;

    // Cache refs
    this._el = {
      healthBar:    document.getElementById('hud-health-bar'),
      healthVal:    document.getElementById('hud-health-val'),
      armorBar:     document.getElementById('hud-armor-bar'),
      armorVal:     document.getElementById('hud-armor-val'),
      ammoMag:      document.getElementById('hud-ammo-mag'),
      ammoReserve:  document.getElementById('hud-ammo-reserve'),
      weaponName:   document.getElementById('hud-weapon-name'),
      reloadText:   document.getElementById('hud-reload-text'),
      aliveCount:   document.getElementById('hud-alive-count'),
      zoneInfo:     document.getElementById('hud-zone-info'),
      killFeed:     killfeed,
      hitmarker:    document.getElementById('hud-hitmarker'),
      zoneOverlay,
      lootPrompt,
      chatMessages,
      damageDir,
      zoneWarning,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Event bindings
  // ─────────────────────────────────────────────────────────────────────

  _bindEvents() {
    window.addEventListener('hud:ammo',       (e) => this.updateAmmo(e.detail));
    window.addEventListener('hud:hitmarker',  (e) => this.showHitmarker(e.detail.bodyPart));
    window.addEventListener('hud:reloading',  (e) => this.setReloading(e.detail.reloading));
    window.addEventListener('hud:loot_prompt',(e) => this.showLootPrompt(e.detail));
    window.addEventListener('hud:zone',       (e) => this.updateZone(e.detail));
    window.addEventListener('chat:message',   (e) => this.addChatMessage(e.detail));
    window.addEventListener('hud:kill',       (e) => this.addKillFeedEntry(e.detail));
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update methods
  // ─────────────────────────────────────────────────────────────────────

  updateVitals(health, armor) {
    this._el.healthBar.style.width = `${Math.max(0, health)}%`;
    this._el.healthVal.textContent = Math.max(0, Math.round(health));
    this._el.armorBar.style.width  = `${Math.max(0, armor)}%`;
    this._el.armorVal.textContent  = Math.max(0, Math.round(armor));

    // Pulse red at low health
    const isLow = health < 25;
    this._el.healthBar.style.background = isLow
      ? `rgba(255,${Math.floor(health * 2)},${Math.floor(health * 2)},1)`
      : '#e05050';
  }

  updateAmmo({ ammoInMag, ammoReserve, weaponName }) {
    this._el.ammoMag.textContent     = ammoInMag    ?? '--';
    this._el.ammoReserve.textContent = ammoReserve  ?? '--';
    if (weaponName !== undefined) this._el.weaponName.textContent = weaponName;
  }

  updateAliveCount(count) {
    this._el.aliveCount.textContent = count;
  }

  setReloading(reloading) {
    this._el.reloadText.style.display = reloading ? '' : 'none';
  }

  showHitmarker(bodyPart) {
    const color = bodyPart === 'head' ? '#ffcc00' : '#ff4444';
    this._el.hitmarker.querySelectorAll('div').forEach(d => d.style.background = color);
    this._el.hitmarker.style.display = '';
    clearTimeout(this._hitmarkerTimeout);
    this._hitmarkerTimeout = setTimeout(() => {
      this._el.hitmarker.style.display = 'none';
    }, bodyPart === 'head' ? 200 : 120);
  }

  updateZone({ isOutside, distToZone, shrinkProgress, phase }) {
    this._outOfZone = isOutside;
    this._el.zoneWarning.style.display = isOutside ? '' : 'none';
    this._el.zoneOverlay.style.display  = isOutside ? '' : 'none';

    let text = '';
    if (phase === 'hold') {
      text = 'Zone stable';
    } else if (phase === 'shrink') {
      const pct = Math.round(shrinkProgress * 100);
      text = `Zone closing — ${pct}%`;
    }
    if (isOutside) text += ` | ${Math.round(distToZone)}m outside`;
    this._el.zoneInfo.textContent = text;
  }

  addKillFeedEntry({ killerName, victimName, weapon }) {
    const entry = document.createElement('div');
    entry.style.cssText = `
      background:rgba(0,0,0,0.6);padding:4px 10px;border-radius:4px;
      font-size:13px;animation:fadeInRight 0.2s ease;
    `;
    const killer = killerName
      ? `<span style="color:#FFD700;">${_esc(killerName)}</span> killed `
      : '';
    entry.innerHTML = `${killer}<span style="color:#FF6666;">${_esc(victimName)}</span> <span style="opacity:0.7;">[${_esc(weapon)}]</span>`;

    this._el.killFeed.insertBefore(entry, this._el.killFeed.firstChild);

    const timer = setTimeout(() => {
      entry.style.opacity = '0';
      entry.style.transition = 'opacity 0.5s';
      setTimeout(() => entry.remove(), 500);
    }, 6000);
    this._killFeedTimers.push(timer);

    // Keep kill feed to max 5 entries
    while (this._el.killFeed.children.length > 5) {
      this._el.killFeed.lastChild.remove();
    }
  }

  showLootPrompt({ show, item }) {
    const el = this._el.lootPrompt;
    if (!show) { el.style.display = 'none'; return; }
    el.style.display = '';
    const rarityColor = { common: '#aaa', uncommon: '#4a4', rare: '#44f', epic: '#a4a', legendary: '#fa0' };
    el.innerHTML = `
      <span style="color:${rarityColor[item?.rarity] || '#fff'};font-weight:bold;">${_esc(item?.name || 'Item')}</span>
      <br><span style="font-size:12px;opacity:0.7;">Press <kbd>F</kbd> to pick up</span>
    `;
  }

  addChatMessage({ from, name, message, channel }) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:13px;background:rgba(0,0,0,0.45);padding:2px 6px;border-radius:3px;';
    const chanColor = channel === 'team' ? '#88FF88' : '#FFFFFF';
    el.innerHTML = `<span style="color:${chanColor};">[${channel.toUpperCase()}]</span> <b>${_esc(name)}</b>: ${_esc(message)}`;
    this._el.chatMessages.insertBefore(el, this._el.chatMessages.firstChild);

    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 1s'; setTimeout(() => el.remove(), 1000); }, 8000);

    // Cap chat at 10 messages
    while (this._el.chatMessages.children.length > 10) this._el.chatMessages.lastChild.remove();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Update loop (called every frame)
  // ─────────────────────────────────────────────────────────────────────

  update(dt) {
    // Zone damage vignette pulse
    if (this._outOfZone) {
      this._zoneDamageAlpha = Math.min(1, this._zoneDamageAlpha + dt * 2);
      this._el.zoneOverlay.style.opacity = 0.3 + Math.sin(Date.now() / 400) * 0.2;
    } else {
      this._zoneDamageAlpha = Math.max(0, this._zoneDamageAlpha - dt * 3);
      this._el.zoneOverlay.style.opacity = this._zoneDamageAlpha;
      if (this._zoneDamageAlpha === 0) this._el.zoneOverlay.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Show / hide
  // ─────────────────────────────────────────────────────────────────────

  show() { this._root.style.display = ''; }
  hide() { this._root.style.display = 'none'; }

  // ─────────────────────────────────────────────────────────────────────

  _createEl(tag, id) {
    const el = document.createElement(tag);
    if (id) el.id = `hud-${id}`;
    return el;
  }

  dispose() {
    this._killFeedTimers.forEach(clearTimeout);
    this._root?.remove();
    window.removeEventListener('hud:ammo',        this._bindEvents);
  }
}

function _esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
