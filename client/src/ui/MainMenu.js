/**
 * MainMenu — full main menu UI.
 * Screens: main, play (solo/duo/squad + region), settings, stats.
 */

export default class MainMenu {
  constructor(network, api) {
    this.network = network;
    this.api     = api;

    this._root    = null;
    this._screen  = 'main';
    this._settings = this._loadSettings();

    this._buildDOM();
    this._onPlay = null;
    this._onShop = null;
    this._onLocker = null;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Build
  // ─────────────────────────────────────────────────────────────────────

  _buildDOM() {
    this._root = document.createElement('div');
    this._root.id = 'main-menu';
    this._root.style.cssText = `
      position:fixed;inset:0;background:linear-gradient(135deg,#0a0a1a 0%,#0d1a2e 50%,#0a1a0a 100%);
      display:flex;align-items:center;justify-content:center;z-index:1000;
      font-family:'Segoe UI',sans-serif;color:#fff;
    `;
    this._renderMain();
    document.body.appendChild(this._root);
  }

  _renderMain() {
    this._root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:0;min-width:400px;">
        <!-- Logo -->
        <div style="text-align:center;margin-bottom:40px;">
          <div style="font-size:52px;font-weight:900;letter-spacing:-2px;
            background:linear-gradient(90deg,#4af,#f4a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">
            BATTLEZONE
          </div>
          <div style="font-size:13px;opacity:0.5;letter-spacing:4px;margin-top:-6px;">BATTLE ROYALE</div>
        </div>

        <!-- Buttons -->
        ${this._btn('PLAY',      'btn-play',    '#4af', '#1a3a5a')}
        ${this._btn('ITEM SHOP', 'btn-shop',    '#fa4', '#3a2a0a')}
        ${this._btn('LOCKER',    'btn-locker',  '#aaf', '#1a1a3a')}
        ${this._btn('STATS',     'btn-stats',   '#8f8', '#0a2a0a')}
        ${this._btn('SETTINGS',  'btn-settings','#aaa', '#222')}
        ${this._btn('EXIT',      'btn-exit',    '#f88', '#2a0a0a')}

        <div style="margin-top:20px;font-size:11px;opacity:0.3;">v1.0.0 — 2025</div>
      </div>
    `;
    this._root.querySelector('#btn-play')    ?.addEventListener('click', () => this._renderPlay());
    this._root.querySelector('#btn-shop')    ?.addEventListener('click', () => this._onShop?.());
    this._root.querySelector('#btn-locker')  ?.addEventListener('click', () => this._onLocker?.());
    this._root.querySelector('#btn-stats')   ?.addEventListener('click', () => this._renderStats());
    this._root.querySelector('#btn-settings')?.addEventListener('click', () => this._renderSettings());
    this._root.querySelector('#btn-exit')    ?.addEventListener('click', () => { if (confirm('Exit game?')) window.close(); });
  }

  _renderPlay() {
    const regions = ['Auto', 'NA', 'EU', 'APAC', 'SA', 'ME'];
    const modes   = [
      { id: 'solo',  label: 'SOLO',  sub: '1 player',  icon: '👤' },
      { id: 'duo',   label: 'DUO',   sub: '2 players', icon: '👥' },
      { id: 'squad', label: 'SQUAD', sub: '4 players', icon: '👥👥' },
    ];

    this._root.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:20px;min-width:500px;">
        <div style="font-size:28px;font-weight:700;">SELECT MODE</div>

        <div style="display:flex;gap:16px;">
          ${modes.map(m => `
            <div class="mode-card" data-mode="${m.id}" style="
              cursor:pointer;border:2px solid rgba(255,255,255,0.15);border-radius:12px;
              padding:20px 28px;text-align:center;transition:all 0.15s;
              background:rgba(255,255,255,0.04);width:130px;
            ">
              <div style="font-size:28px;">${m.icon}</div>
              <div style="font-size:18px;font-weight:700;margin:8px 0 2px;">${m.label}</div>
              <div style="font-size:12px;opacity:0.6;">${m.sub}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:8px;">
          <div style="font-size:13px;opacity:0.6;margin-bottom:8px;text-align:center;">REGION</div>
          <div style="display:flex;gap:8px;">
            ${regions.map(r => `
              <button class="region-btn" data-region="${r.toLowerCase()}" style="
                background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.2);
                color:#fff;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;
              ">${r}</button>
            `).join('')}
          </div>
        </div>

        <button id="btn-start-queue" style="
          background:linear-gradient(90deg,#1a7a2a,#2aaa3a);border:none;color:#fff;
          font-size:20px;font-weight:700;padding:14px 60px;border-radius:10px;
          cursor:pointer;letter-spacing:2px;margin-top:8px;opacity:0.5;pointer-events:none;
        ">PLAY</button>

        <div id="queue-status" style="font-size:13px;opacity:0.6;height:20px;"></div>

        <button id="btn-back" style="
          background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;
          padding:8px 24px;border-radius:6px;cursor:pointer;font-size:13px;
        ">BACK</button>
      </div>
    `;

    let selectedMode   = null;
    let selectedRegion = 'auto';

    const updatePlayBtn = () => {
      const btn = this._root.querySelector('#btn-start-queue');
      if (selectedMode) {
        btn.style.opacity        = '1';
        btn.style.pointerEvents  = 'auto';
      }
    };

    // Mode selection
    this._root.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        this._root.querySelectorAll('.mode-card').forEach(c => {
          c.style.borderColor  = 'rgba(255,255,255,0.15)';
          c.style.background   = 'rgba(255,255,255,0.04)';
        });
        card.style.borderColor = '#4af';
        card.style.background  = 'rgba(68,170,255,0.12)';
        selectedMode = card.dataset.mode;
        updatePlayBtn();
      });
    });

    // Region selection
    this._root.querySelectorAll('.region-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._root.querySelectorAll('.region-btn').forEach(b => b.style.borderColor = 'rgba(255,255,255,0.2)');
        btn.style.borderColor = '#4af';
        selectedRegion = btn.dataset.region;
      });
    });

    // Default region
    this._root.querySelector('[data-region="auto"]').style.borderColor = '#4af';

    // Start queue
    this._root.querySelector('#btn-start-queue').addEventListener('click', () => {
      if (!selectedMode) return;
      const region = selectedRegion === 'auto' ? this._detectRegion() : selectedRegion;
      this._showQueueStatus();
      this.network.joinQueue(selectedMode, region);
      this._root.querySelector('#queue-status').textContent = `Searching for match… (${selectedMode.toUpperCase()})`;
    });

    this._root.querySelector('#btn-back').addEventListener('click', () => this._renderMain());

    // Matched → start game
    this._matchedUnsub = this.network.on('mm:matched', (data) => {
      this._matchedUnsub?.();
      this._root.querySelector('#queue-status').textContent = 'Match found! Loading…';
      setTimeout(() => this._onPlay?.(data), 800);
    });
  }

  _renderStats() {
    this._root.innerHTML = `
      <div style="min-width:420px;text-align:center;">
        <div style="font-size:28px;font-weight:700;margin-bottom:24px;">STATS</div>
        <div id="stats-content" style="font-size:14px;opacity:0.7;">Loading…</div>
        <button id="btn-back" style="
          margin-top:24px;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;
          padding:8px 24px;border-radius:6px;cursor:pointer;font-size:13px;
        ">BACK</button>
      </div>
    `;

    this.api.getStats().then(s => {
      if (!s) return;
      this._root.querySelector('#stats-content').innerHTML = `
        <table style="margin:0 auto;border-collapse:collapse;text-align:left;">
          <tr><td style="padding:6px 16px;opacity:0.6;">Matches Played</td><td style="padding:6px 16px;">${s.matches_played}</td></tr>
          <tr><td style="padding:6px 16px;opacity:0.6;">Wins</td><td style="padding:6px 16px;">${s.wins}</td></tr>
          <tr><td style="padding:6px 16px;opacity:0.6;">Top 10s</td><td style="padding:6px 16px;">${s.top10s}</td></tr>
          <tr><td style="padding:6px 16px;opacity:0.6;">K/D Ratio</td><td style="padding:6px 16px;">${s.kd_ratio ?? '—'}</td></tr>
          <tr><td style="padding:6px 16px;opacity:0.6;">Kills</td><td style="padding:6px 16px;">${s.kills}</td></tr>
          <tr><td style="padding:6px 16px;opacity:0.6;">Accuracy</td><td style="padding:6px 16px;">${s.accuracy_pct ?? '—'}%</td></tr>
        </table>
      `;
    });

    this._root.querySelector('#btn-back').addEventListener('click', () => this._renderMain());
  }

  _renderSettings() {
    const s = this._settings;
    this._root.innerHTML = `
      <div style="min-width:460px;">
        <div style="font-size:28px;font-weight:700;margin-bottom:24px;text-align:center;">SETTINGS</div>
        <div style="display:flex;flex-direction:column;gap:16px;max-height:70vh;overflow-y:auto;padding-right:8px;">

          <div class="setting-group">
            <div style="font-size:12px;text-transform:uppercase;opacity:0.5;margin-bottom:10px;letter-spacing:2px;">Graphics</div>
            ${this._settingSelect('Quality', 'quality', ['Low','Medium','High','Ultra'], s.quality || 'High')}
            ${this._settingRange('FOV', 'fov', 60, 110, s.fov || 75)}
          </div>

          <div class="setting-group">
            <div style="font-size:12px;text-transform:uppercase;opacity:0.5;margin-bottom:10px;letter-spacing:2px;">Mouse</div>
            ${this._settingRange('Sensitivity', 'sensitivity', 0.1, 10, s.sensitivity || 3)}
            ${this._settingToggle('Invert Y', 'invertY', s.invertY || false)}
          </div>

          <div class="setting-group">
            <div style="font-size:12px;text-transform:uppercase;opacity:0.5;margin-bottom:10px;letter-spacing:2px;">Audio</div>
            ${this._settingRange('Master Volume', 'masterVolume', 0, 100, s.masterVolume ?? 80)}
            ${this._settingRange('Music Volume', 'musicVolume', 0, 100, s.musicVolume ?? 30)}
            ${this._settingRange('SFX Volume', 'sfxVolume', 0, 100, s.sfxVolume ?? 90)}
          </div>

          <div class="setting-group">
            <div style="font-size:12px;text-transform:uppercase;opacity:0.5;margin-bottom:10px;letter-spacing:2px;">Voice</div>
            ${this._settingToggle('Push-to-Talk', 'ptt', s.ptt ?? true)}
            ${this._settingToggle('Profanity Filter', 'profanityFilter', s.profanityFilter ?? true)}
          </div>
        </div>

        <div style="display:flex;gap:12px;margin-top:20px;justify-content:center;">
          <button id="btn-save-settings" style="
            background:linear-gradient(90deg,#1a5a8a,#2a8aba);border:none;color:#fff;
            padding:10px 32px;border-radius:8px;cursor:pointer;font-size:14px;
          ">SAVE</button>
          <button id="btn-back" style="
            background:transparent;border:1px solid rgba(255,255,255,0.2);color:#fff;
            padding:10px 24px;border-radius:8px;cursor:pointer;font-size:13px;
          ">BACK</button>
        </div>
      </div>
    `;

    this._root.querySelector('#btn-save-settings').addEventListener('click', () => {
      const newSettings = {};
      this._root.querySelectorAll('[data-setting]').forEach(el => {
        const key = el.dataset.setting;
        newSettings[key] = el.type === 'checkbox' ? el.checked :
                           el.type === 'range'    ? Number(el.value) : el.value;
      });
      this._settings = { ...this._settings, ...newSettings };
      localStorage.setItem('settings', JSON.stringify(this._settings));
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: this._settings }));
      this._renderMain();
    });

    this._root.querySelector('#btn-back').addEventListener('click', () => this._renderMain());
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────────────────────

  _btn(label, id, accent, bg) {
    return `
      <button id="${id}" style="
        background:linear-gradient(135deg,${bg} 0%,${bg}88 100%);
        border:1px solid ${accent}44;color:#fff;
        padding:14px 0;border-radius:8px;cursor:pointer;
        font-size:16px;font-weight:700;letter-spacing:2px;
        width:280px;margin-bottom:8px;transition:all 0.15s;
        text-transform:uppercase;
      " onmouseover="this.style.borderColor='${accent}'" onmouseout="this.style.borderColor='${accent}44'">
        ${label}
      </button>
    `;
  }

  _settingRange(label, key, min, max, value) {
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="min-width:130px;font-size:13px;opacity:0.8;">${label}</span>
        <input type="range" data-setting="${key}" min="${min}" max="${max}" value="${value}"
               style="flex:1;accent-color:#4af;" oninput="this.nextElementSibling.textContent=this.value">
        <span style="min-width:36px;font-size:13px;text-align:right;">${value}</span>
      </div>
    `;
  }

  _settingSelect(label, key, options, current) {
    const opts = options.map(o => `<option value="${o}" ${o === current ? 'selected' : ''}>${o}</option>`).join('');
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="min-width:130px;font-size:13px;opacity:0.8;">${label}</span>
        <select data-setting="${key}" style="background:#1a2a3a;color:#fff;border:1px solid #4af44;border-radius:4px;padding:4px 8px;">
          ${opts}
        </select>
      </div>
    `;
  }

  _settingToggle(label, key, current) {
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="min-width:130px;font-size:13px;opacity:0.8;">${label}</span>
        <input type="checkbox" data-setting="${key}" ${current ? 'checked' : ''} style="width:16px;height:16px;accent-color:#4af;">
      </div>
    `;
  }

  _showQueueStatus() {
    let dots = 0;
    this._queueDotTimer = setInterval(() => {
      dots = (dots + 1) % 4;
      const el = this._root.querySelector('#queue-status');
      if (el) el.textContent = 'Searching' + '.'.repeat(dots);
    }, 500);
  }

  _detectRegion() {
    // Simple timezone-based region detection
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (/America/.test(tz)) return 'na';
    if (/Europe/.test(tz))  return 'eu';
    if (/Asia/.test(tz))    return 'apac';
    return 'na';
  }

  _loadSettings() {
    try { return JSON.parse(localStorage.getItem('settings') || '{}'); }
    catch { return {}; }
  }

  onPlay(fn)   { this._onPlay   = fn; }
  onShop(fn)   { this._onShop   = fn; }
  onLocker(fn) { this._onLocker = fn; }

  show() { this._root.style.display = 'flex'; }
  hide() { this._root.style.display = 'none'; }

  dispose() {
    clearInterval(this._queueDotTimer);
    this._root?.remove();
  }
}
