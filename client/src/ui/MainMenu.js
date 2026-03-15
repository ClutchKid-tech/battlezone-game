/**
 * MainMenu — AAA battle royale main menu.
 * Military/tactical aesthetic: dark warzone palette, orange fire accent,
 * animated canvas background, clip-path buttons, HUD chrome.
 */

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Exo+2:wght@300;400;700;900&display=swap');

  #mm-root * { box-sizing: border-box; margin: 0; padding: 0; }

  #mm-root {
    position: fixed; inset: 0;
    display: none;
    font-family: 'Exo 2', sans-serif;
    color: #F0EDE8;
    z-index: 1000;
    overflow: hidden;
  }

  #mm-bg { position: absolute; inset: 0; z-index: 0; }

  .mm-scanlines {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background: repeating-linear-gradient(0deg, transparent, transparent 3px,
      rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px);
  }

  .mm-vignette {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%);
  }

  /* ── HUD CORNERS ── */
  .mm-corner {
    position: absolute; width: 60px; height: 60px;
    z-index: 10; pointer-events: none;
  }
  .mm-corner-tl { top:16px; left:16px;  border-top:2px solid #FF6B1A; border-left:2px solid #FF6B1A; }
  .mm-corner-tr { top:16px; right:16px; border-top:2px solid #FF6B1A; border-right:2px solid #FF6B1A; }
  .mm-corner-bl { bottom:16px; left:16px;  border-bottom:2px solid #FF6B1A; border-left:2px solid #FF6B1A; }
  .mm-corner-br { bottom:16px; right:16px; border-bottom:2px solid #FF6B1A; border-right:2px solid #FF6B1A; }

  /* ── STATUS BAR ── */
  .mm-statusbar {
    position: absolute; top:0; left:0; right:0; height:34px; z-index:20;
    display:flex; align-items:center; justify-content:space-between;
    padding:0 28px;
    background: rgba(6,8,12,0.8);
    border-bottom: 1px solid rgba(255,107,26,0.12);
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #5A5550; letter-spacing: 0.14em;
  }
  .mm-status-online { color: #3DBA5A; }
  .mm-status-online::before {
    content:''; display:inline-block;
    width:6px; height:6px; background:#3DBA5A; border-radius:50%;
    margin-right:6px; animation: mm-blink 1.6s ease-in-out infinite;
  }
  @keyframes mm-blink { 0%,100%{opacity:1} 50%{opacity:0.25} }

  /* ── BOTTOM BAR ── */
  .mm-bottombar {
    position: absolute; bottom:0; left:0; right:0; height:34px; z-index:20;
    display:flex; align-items:center; justify-content:space-between;
    padding:0 28px;
    background: rgba(6,8,12,0.8);
    border-top: 1px solid rgba(255,107,26,0.1);
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #5A5550; letter-spacing: 0.12em;
  }
  .mm-version { color:#FF6B1A; opacity:0.6; }

  /* ── LAYOUT ── */
  .mm-layout {
    position: absolute; inset:0; z-index:15;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    padding: 60px 0 50px;
  }

  /* ── LOGO ── */
  .mm-logo-wrap {
    text-align:center; margin-bottom:36px;
    animation: mm-fadedown 0.6s ease both;
  }
  @keyframes mm-fadedown {
    from { opacity:0; transform:translateY(-18px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .mm-eyebrow {
    font-family:'Share Tech Mono', monospace;
    font-size:10px; letter-spacing:0.45em;
    color:#FF6B1A; opacity:0.85; margin-bottom:4px;
    text-transform:uppercase;
  }
  .mm-logo-title {
    font-family:'Bebas Neue', sans-serif;
    font-size:100px; line-height:0.88;
    letter-spacing:0.07em; color:#F0EDE8;
    text-shadow: 0 0 30px rgba(255,107,26,0.5),
                 0 0 70px rgba(255,107,26,0.2),
                 0 2px 0px rgba(0,0,0,0.8);
    animation: mm-glow 3s ease-in-out infinite alternate;
  }
  @keyframes mm-glow {
    from { text-shadow: 0 0 30px rgba(255,107,26,0.4), 0 0 60px rgba(255,107,26,0.15), 0 2px 0 rgba(0,0,0,0.8); }
    to   { text-shadow: 0 0 50px rgba(255,107,26,0.7), 0 0 100px rgba(255,107,26,0.3), 0 2px 0 rgba(0,0,0,0.8); }
  }
  .mm-logo-sub {
    font-family:'Exo 2', sans-serif; font-weight:300;
    font-size:12px; letter-spacing:0.38em; color:#8A8078;
    text-transform:uppercase; margin-top:6px;
  }
  .mm-logo-line {
    width:320px; height:1px; margin:18px auto 0;
    background: linear-gradient(90deg, transparent, #FF6B1A 40%, #FF6B1A 60%, transparent);
    opacity:0.5;
  }

  /* ── BUTTONS ── */
  .mm-nav {
    display:flex; flex-direction:column; align-items:center; gap:8px;
  }

  .mm-btn {
    position:relative;
    display:flex; align-items:center; gap:14px;
    width:300px; height:52px; padding:0 22px;
    background: rgba(8,12,18,0.75);
    border:1px solid rgba(255,107,26,0.28);
    color:#C8C0B8;
    font-family:'Rajdhani', sans-serif;
    font-size:15px; font-weight:700;
    letter-spacing:0.28em; text-transform:uppercase;
    cursor:pointer;
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
    transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.12s, box-shadow 0.15s;
    opacity:0; animation: mm-fadeup 0.4s ease both;
  }
  @keyframes mm-fadeup {
    from { opacity:0; transform:translateY(14px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .mm-btn-icon {
    font-size:14px; opacity:0.7; flex-shrink:0; width:16px; text-align:center;
    transition: opacity 0.15s;
  }
  .mm-btn::before {
    content:'';
    position:absolute; left:0; top:0; bottom:0; width:3px;
    background: #FF6B1A; opacity:0;
    transition: opacity 0.15s;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6px), 0 100%);
  }
  .mm-btn:hover {
    background: rgba(255,107,26,0.1);
    border-color: rgba(255,107,26,0.75);
    color: #F0EDE8;
    transform: translateX(5px);
    box-shadow: 0 0 24px rgba(255,107,26,0.18), inset 0 0 20px rgba(255,107,26,0.04);
  }
  .mm-btn:hover .mm-btn-icon { opacity:1; }
  .mm-btn:hover::before { opacity:1; }
  .mm-btn:active { transform:translateX(3px) scale(0.98); }

  .mm-btn-primary {
    background: rgba(255,107,26,0.12);
    border-color: rgba(255,107,26,0.6);
    color: #F0EDE8;
  }
  .mm-btn-primary:hover {
    background: rgba(255,107,26,0.22);
    border-color: #FF6B1A;
    box-shadow: 0 0 32px rgba(255,107,26,0.3), inset 0 0 24px rgba(255,107,26,0.06);
  }

  .mm-btn-danger { border-color: rgba(232,35,10,0.3); color:#9A7070; }
  .mm-btn-danger:hover {
    background: rgba(232,35,10,0.1);
    border-color: rgba(232,35,10,0.7);
    color: #FF6060;
    box-shadow: 0 0 24px rgba(232,35,10,0.2);
  }

  .mm-divider {
    width:300px; height:1px; margin:4px 0;
    background: rgba(255,107,26,0.1);
  }

  /* ── SUB-SCREENS ── */
  .mm-screen {
    position:absolute; inset:0; z-index:25;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    padding:60px 40px 50px;
    background: rgba(6,8,12,0.92);
    animation: mm-screenfade 0.2s ease both;
  }
  @keyframes mm-screenfade {
    from { opacity:0; }
    to   { opacity:1; }
  }

  .mm-screen-title {
    font-family:'Bebas Neue', sans-serif;
    font-size:48px; letter-spacing:0.1em;
    color:#F0EDE8;
    text-shadow: 0 0 20px rgba(255,107,26,0.3);
    margin-bottom:8px;
  }
  .mm-screen-line {
    width:200px; height:1px; margin-bottom:32px;
    background: linear-gradient(90deg, transparent, #FF6B1A, transparent);
    opacity:0.5;
  }

  /* ── PLAY SCREEN ── */
  .mm-mode-grid {
    display:flex; gap:14px; margin-bottom:28px;
  }
  .mm-mode-card {
    width:140px; padding:20px 16px;
    background: rgba(8,12,18,0.8);
    border:1px solid rgba(255,107,26,0.2);
    cursor:pointer; text-align:center;
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px));
    transition: all 0.15s;
  }
  .mm-mode-card:hover, .mm-mode-card.selected {
    background: rgba(255,107,26,0.1);
    border-color: rgba(255,107,26,0.7);
    box-shadow: 0 0 20px rgba(255,107,26,0.15);
  }
  .mm-mode-card.selected { border-color: #FF6B1A; }
  .mm-mode-icon { font-size:28px; margin-bottom:8px; }
  .mm-mode-label {
    font-family:'Rajdhani', sans-serif; font-weight:700;
    font-size:16px; letter-spacing:0.2em; color:#F0EDE8;
    text-transform:uppercase;
  }
  .mm-mode-sub { font-size:11px; color:#8A8078; margin-top:3px; }

  .mm-region-row {
    display:flex; gap:8px; margin-bottom:28px; flex-wrap:wrap; justify-content:center;
  }
  .mm-region-btn {
    padding:6px 16px;
    background: rgba(8,12,18,0.7);
    border:1px solid rgba(255,255,255,0.12);
    color:#8A8078;
    font-family:'Share Tech Mono', monospace; font-size:11px;
    letter-spacing:0.15em; cursor:pointer;
    transition: all 0.15s;
  }
  .mm-region-btn:hover, .mm-region-btn.selected {
    border-color: rgba(255,107,26,0.6); color:#F0EDE8;
  }
  .mm-region-btn.selected { border-color:#FF6B1A; color:#FF6B1A; }

  .mm-play-btn {
    width:260px; height:54px;
    background: rgba(255,107,26,0.15);
    border:1px solid rgba(255,107,26,0.5);
    color:#F0EDE8;
    font-family:'Rajdhani', sans-serif; font-weight:700;
    font-size:18px; letter-spacing:0.35em; text-transform:uppercase;
    cursor:pointer;
    clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px));
    transition: all 0.15s;
    opacity:0.45; pointer-events:none;
  }
  .mm-play-btn.ready {
    opacity:1; pointer-events:auto;
    border-color:#FF6B1A;
    box-shadow: 0 0 28px rgba(255,107,26,0.25);
  }
  .mm-play-btn.ready:hover {
    background: rgba(255,107,26,0.28);
    box-shadow: 0 0 40px rgba(255,107,26,0.4);
    transform:scale(1.02);
  }
  .mm-play-btn:active { transform:scale(0.98); }

  .mm-queue-status {
    margin-top:14px; height:18px;
    font-family:'Share Tech Mono', monospace;
    font-size:11px; color:#FF6B1A; letter-spacing:0.15em;
    animation: mm-blink 1s linear infinite;
  }

  .mm-back-btn {
    margin-top:20px; padding:8px 28px;
    background:transparent;
    border:1px solid rgba(255,255,255,0.12);
    color:#8A8078;
    font-family:'Rajdhani', sans-serif; font-weight:600;
    font-size:13px; letter-spacing:0.2em; text-transform:uppercase;
    cursor:pointer; transition:all 0.15s;
  }
  .mm-back-btn:hover { border-color:rgba(255,255,255,0.3); color:#F0EDE8; }

  /* ── STATS SCREEN ── */
  .mm-stats-grid {
    display:grid; grid-template-columns:1fr 1fr; gap:12px;
    width:440px; margin-bottom:24px;
  }
  .mm-stat-cell {
    padding:16px 20px;
    background: rgba(8,12,18,0.7);
    border:1px solid rgba(255,107,26,0.15);
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
  }
  .mm-stat-cell-label {
    font-family:'Share Tech Mono', monospace;
    font-size:9px; letter-spacing:0.2em; color:#5A5550;
    text-transform:uppercase; margin-bottom:6px;
  }
  .mm-stat-cell-val {
    font-family:'Bebas Neue', sans-serif;
    font-size:34px; line-height:1; color:#F0EDE8; letter-spacing:0.05em;
  }
  .mm-stat-cell-val span { color:#FF6B1A; }

  /* ── SETTINGS SCREEN ── */
  .mm-settings-wrap {
    width:460px; max-height:62vh; overflow-y:auto; padding-right:6px;
    scrollbar-width:thin; scrollbar-color: rgba(255,107,26,0.3) transparent;
  }
  .mm-setting-group {
    margin-bottom:22px;
  }
  .mm-setting-group-label {
    font-family:'Share Tech Mono', monospace;
    font-size:9px; letter-spacing:0.22em; color:#FF6B1A; opacity:0.7;
    text-transform:uppercase; margin-bottom:12px;
    padding-bottom:6px; border-bottom:1px solid rgba(255,107,26,0.12);
  }
  .mm-setting-row {
    display:flex; align-items:center; gap:14px; margin-bottom:10px;
  }
  .mm-setting-row label {
    min-width:140px; font-size:12px; color:#A8A09A; letter-spacing:0.06em;
  }
  .mm-setting-row input[type=range] {
    flex:1; accent-color:#FF6B1A; height:3px;
  }
  .mm-setting-row input[type=checkbox] {
    width:16px; height:16px; accent-color:#FF6B1A;
  }
  .mm-setting-row select {
    background:#0D1117; color:#F0EDE8;
    border:1px solid rgba(255,107,26,0.25); border-radius:2px;
    padding:4px 10px; font-size:12px; font-family:'Exo 2', sans-serif;
  }
  .mm-setting-row span {
    min-width:32px; text-align:right;
    font-family:'Share Tech Mono', monospace; font-size:11px; color:#8A8078;
  }

  .mm-save-btn {
    padding:10px 36px;
    background: rgba(255,107,26,0.15);
    border:1px solid rgba(255,107,26,0.45);
    color:#F0EDE8;
    font-family:'Rajdhani', sans-serif; font-weight:700;
    font-size:14px; letter-spacing:0.25em; text-transform:uppercase;
    cursor:pointer; transition:all 0.15s;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  }
  .mm-save-btn:hover {
    background: rgba(255,107,26,0.28);
    border-color:#FF6B1A;
    box-shadow:0 0 20px rgba(255,107,26,0.2);
  }
`;

export default class MainMenu {
  constructor(network, api) {
    this.network = network;
    this.api     = api;

    this._settings    = this._loadSettings();
    this._onPlay      = null;
    this._onShop      = null;
    this._onLocker    = null;
    this._matchedUnsub = null;

    this._canvas      = null;
    this._ctx         = null;
    this._animFrame   = null;
    this._particles   = [];
    this._terrain     = [];
    this._fogOffset   = 0;
    this._W = 0; this._H = 0;

    this._injectStyles();
    this._buildDOM();
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('mm-styles')) return;
    const s = document.createElement('style');
    s.id = 'mm-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ─── DOM ──────────────────────────────────────────────────────────────────

  _buildDOM() {
    this._root = document.createElement('div');
    this._root.id = 'mm-root';
    document.body.appendChild(this._root);

    // Animated BG canvas
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'mm-bg';
    this._root.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // Scanlines + vignette
    this._root.insertAdjacentHTML('beforeend', `
      <div class="mm-scanlines"></div>
      <div class="mm-vignette"></div>
      <div class="mm-corner mm-corner-tl"></div>
      <div class="mm-corner mm-corner-tr"></div>
      <div class="mm-corner mm-corner-bl"></div>
      <div class="mm-corner mm-corner-br"></div>
    `);

    // Status bar
    this._statusBar = document.createElement('div');
    this._statusBar.className = 'mm-statusbar';
    this._statusBar.innerHTML = `
      <span><span class="mm-status-online">SERVERS ONLINE</span></span>
      <span id="mm-player-count" style="color:#8A8078">— PLAYERS ONLINE</span>
      <span id="mm-clock" style="font-family:'Share Tech Mono',monospace">--:--:-- UTC</span>
    `;
    this._root.appendChild(this._statusBar);

    // Bottom bar
    this._root.insertAdjacentHTML('beforeend', `
      <div class="mm-bottombar">
        <span>© 2026 BATTLEZONE STUDIOS</span>
        <span class="mm-version">v1.0.0-ALPHA</span>
        <span>BUILD 20260314</span>
      </div>
    `);

    // Main layout
    this._layout = document.createElement('div');
    this._layout.className = 'mm-layout';
    this._root.appendChild(this._layout);

    this._renderMain();
    this._startAnimation();
    this._startClock();
    this._loadPlayerCount();
  }

  // ─── Main screen ──────────────────────────────────────────────────────────

  _renderMain() {
    this._layout.innerHTML = `
      <div class="mm-logo-wrap">
        <div class="mm-eyebrow">▶ &nbsp; ENTER THE ZONE &nbsp; ◀</div>
        <div class="mm-logo-title">BATTLEZONE</div>
        <div class="mm-logo-sub">Battle Royale &nbsp;·&nbsp; 100 Players &nbsp;·&nbsp; Last Standing</div>
        <div class="mm-logo-line"></div>
      </div>

      <nav class="mm-nav" id="mm-nav">
        ${this._btn('▶', 'PLAY',      'mm-btn-primary', 0, 'mm-btn-play')}
        ${this._btn('⬡', 'ITEM SHOP', '',               1, 'mm-btn-shop')}
        ${this._btn('◈', 'LOCKER',    '',               2, 'mm-btn-locker')}
        <div class="mm-divider"></div>
        ${this._btn('◎', 'STATS',     '',               3, 'mm-btn-stats')}
        ${this._btn('⚙', 'SETTINGS',  '',               4, 'mm-btn-settings')}
        <div class="mm-divider"></div>
        ${this._btn('✕', 'EXIT',      'mm-btn-danger',  5, 'mm-btn-exit')}
      </nav>
    `;

    this._layout.querySelector('.mm-btn-play')    ?.addEventListener('click', () => this._renderPlay());
    this._layout.querySelector('.mm-btn-shop')    ?.addEventListener('click', () => this._onShop?.());
    this._layout.querySelector('.mm-btn-locker')  ?.addEventListener('click', () => this._onLocker?.());
    this._layout.querySelector('.mm-btn-stats')   ?.addEventListener('click', () => this._renderStats());
    this._layout.querySelector('.mm-btn-settings')?.addEventListener('click', () => this._renderSettings());
    this._layout.querySelector('.mm-btn-exit')    ?.addEventListener('click', () => {
      if (confirm('Exit to desktop?')) window.close();
    });
  }

  _btn(icon, label, extraClass, delay, id) {
    return `
      <button id="${id}" class="mm-btn ${extraClass}"
        style="animation-delay:${delay * 80}ms">
        <span class="mm-btn-icon">${icon}</span>
        ${label}
      </button>`;
  }

  // ─── Play screen ──────────────────────────────────────────────────────────

  _renderPlay() {
    const modes   = [
      { id:'solo',  icon:'◉', label:'SOLO',  sub:'1 player'  },
      { id:'duo',   icon:'◈', label:'DUO',   sub:'2 players' },
      { id:'squad', icon:'⬡', label:'SQUAD', sub:'4 players' },
    ];
    const regions = ['AUTO','NA','EU','APAC','SA','ME'];

    const screen = this._makeScreen();
    screen.innerHTML = `
      <div class="mm-screen-title">SELECT MODE</div>
      <div class="mm-screen-line"></div>

      <div class="mm-mode-grid">
        ${modes.map(m => `
          <div class="mm-mode-card" data-mode="${m.id}">
            <div class="mm-mode-icon">${m.icon}</div>
            <div class="mm-mode-label">${m.label}</div>
            <div class="mm-mode-sub">${m.sub}</div>
          </div>`).join('')}
      </div>

      <div class="mm-region-row">
        ${regions.map((r,i) => `
          <button class="mm-region-btn${i===0?' selected':''}" data-region="${r.toLowerCase()}">${r}</button>
        `).join('')}
      </div>

      <button class="mm-play-btn" id="mm-start-btn">PLAY NOW</button>
      <div class="mm-queue-status" id="mm-queue-txt" style="display:none"></div>
      <button class="mm-back-btn" id="mm-back">◀ &nbsp; BACK</button>
    `;

    let selectedMode   = null;
    let selectedRegion = 'auto';

    screen.querySelectorAll('.mm-mode-card').forEach(c => {
      c.addEventListener('click', () => {
        screen.querySelectorAll('.mm-mode-card').forEach(x => x.classList.remove('selected'));
        c.classList.add('selected');
        selectedMode = c.dataset.mode;
        screen.querySelector('#mm-start-btn').classList.add('ready');
      });
    });

    screen.querySelectorAll('.mm-region-btn').forEach(b => {
      b.addEventListener('click', () => {
        screen.querySelectorAll('.mm-region-btn').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        selectedRegion = b.dataset.region;
      });
    });

    screen.querySelector('#mm-start-btn').addEventListener('click', () => {
      if (!selectedMode) return;
      const region = selectedRegion === 'auto' ? this._detectRegion() : selectedRegion;
      const qt = screen.querySelector('#mm-queue-txt');
      qt.style.display = '';
      qt.textContent = `SEARCHING FOR MATCH · ${selectedMode.toUpperCase()} · ${region.toUpperCase()}`;
      this.network.joinQueue(selectedMode, region);

      this._matchedUnsub = this.network.on('mm:matched', (data) => {
        this._matchedUnsub?.();
        qt.textContent = 'MATCH FOUND — DEPLOYING...';
        setTimeout(() => this._onPlay?.(data), 900);
      });
    });

    screen.querySelector('#mm-back').addEventListener('click', () => {
      screen.remove();
      if (this._matchedUnsub) { this._matchedUnsub(); this._matchedUnsub = null; }
    });
  }

  // ─── Stats screen ─────────────────────────────────────────────────────────

  _renderStats() {
    const screen = this._makeScreen();
    screen.innerHTML = `
      <div class="mm-screen-title">COMBAT RECORD</div>
      <div class="mm-screen-line"></div>
      <div class="mm-stats-grid" id="mm-stats-grid">
        ${this._statCell('Matches Played', '—')}
        ${this._statCell('Wins', '—')}
        ${this._statCell('K/D Ratio', '—')}
        ${this._statCell('Top 10s', '—')}
        ${this._statCell('Total Kills', '—')}
        ${this._statCell('Accuracy', '—')}
      </div>
      <button class="mm-back-btn">◀ &nbsp; BACK</button>
    `;

    screen.querySelector('.mm-back-btn').addEventListener('click', () => screen.remove());

    this.api.getStats().then(s => {
      if (!s) return;
      const vals = [
        s.matches_played ?? 0,
        s.wins           ?? 0,
        s.kd_ratio       ?? '—',
        s.top10s         ?? 0,
        s.kills          ?? 0,
        (s.accuracy_pct  ?? '—') + (s.accuracy_pct != null ? '%' : ''),
      ];
      screen.querySelectorAll('.mm-stat-cell-val').forEach((el, i) => {
        el.innerHTML = `<span>${vals[i]}</span>`;
      });
    }).catch(() => {});
  }

  _statCell(label, val) {
    return `
      <div class="mm-stat-cell">
        <div class="mm-stat-cell-label">${label}</div>
        <div class="mm-stat-cell-val"><span>${val}</span></div>
      </div>`;
  }

  // ─── Settings screen ──────────────────────────────────────────────────────

  _renderSettings() {
    const s = this._settings;
    const screen = this._makeScreen();
    screen.innerHTML = `
      <div class="mm-screen-title">SETTINGS</div>
      <div class="mm-screen-line"></div>
      <div class="mm-settings-wrap">
        <div class="mm-setting-group">
          <div class="mm-setting-group-label">Graphics</div>
          <div class="mm-setting-row">
            <label>Quality</label>
            <select data-key="quality">
              ${['Low','Medium','High','Ultra'].map(o =>
                `<option ${(s.quality||'High')===o?'selected':''}>${o}</option>`
              ).join('')}
            </select>
          </div>
          <div class="mm-setting-row">
            <label>Field of View</label>
            <input type="range" data-key="fov" min="60" max="110" value="${s.fov||75}"
              oninput="this.nextElementSibling.textContent=this.value">
            <span>${s.fov||75}</span>
          </div>
        </div>
        <div class="mm-setting-group">
          <div class="mm-setting-group-label">Mouse</div>
          <div class="mm-setting-row">
            <label>Sensitivity</label>
            <input type="range" data-key="sensitivity" min="1" max="100" value="${s.sensitivity||30}"
              oninput="this.nextElementSibling.textContent=this.value">
            <span>${s.sensitivity||30}</span>
          </div>
          <div class="mm-setting-row">
            <label>Invert Y-Axis</label>
            <input type="checkbox" data-key="invertY" ${s.invertY?'checked':''}>
          </div>
        </div>
        <div class="mm-setting-group">
          <div class="mm-setting-group-label">Audio</div>
          <div class="mm-setting-row">
            <label>Master Volume</label>
            <input type="range" data-key="masterVolume" min="0" max="100" value="${s.masterVolume??80}"
              oninput="this.nextElementSibling.textContent=this.value">
            <span>${s.masterVolume??80}</span>
          </div>
          <div class="mm-setting-row">
            <label>Music Volume</label>
            <input type="range" data-key="musicVolume" min="0" max="100" value="${s.musicVolume??30}"
              oninput="this.nextElementSibling.textContent=this.value">
            <span>${s.musicVolume??30}</span>
          </div>
          <div class="mm-setting-row">
            <label>SFX Volume</label>
            <input type="range" data-key="sfxVolume" min="0" max="100" value="${s.sfxVolume??90}"
              oninput="this.nextElementSibling.textContent=this.value">
            <span>${s.sfxVolume??90}</span>
          </div>
        </div>
        <div class="mm-setting-group">
          <div class="mm-setting-group-label">Voice</div>
          <div class="mm-setting-row">
            <label>Push-to-Talk</label>
            <input type="checkbox" data-key="ptt" ${(s.ptt??true)?'checked':''}>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;margin-top:20px;">
        <button class="mm-save-btn" id="mm-save">SAVE CHANGES</button>
        <button class="mm-back-btn" style="margin-top:0" id="mm-back">◀ BACK</button>
      </div>
    `;

    screen.querySelector('#mm-save').addEventListener('click', () => {
      const updated = {};
      screen.querySelectorAll('[data-key]').forEach(el => {
        updated[el.dataset.key] = el.type === 'checkbox' ? el.checked
          : el.type === 'range' ? Number(el.value) : el.value;
      });
      this._settings = { ...this._settings, ...updated };
      localStorage.setItem('settings', JSON.stringify(this._settings));
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: this._settings }));
      screen.remove();
    });

    screen.querySelector('#mm-back').addEventListener('click', () => screen.remove());
  }

  // ─── Canvas background animation ──────────────────────────────────────────

  _startAnimation() {
    const resize = () => {
      this._W = this._canvas.width  = this._root.offsetWidth  || window.innerWidth;
      this._H = this._canvas.height = this._root.offsetHeight || window.innerHeight;
      this._buildTerrain();
    };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 140; i++) this._particles.push(this._newParticle(true));

    const tick = () => {
      if (!this._root.isConnected) return;
      this._drawBg();
      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  _buildTerrain() {
    this._terrain = [];
    const pts = 90;
    for (let i = 0; i <= pts; i++) {
      this._terrain.push({
        x: (i / pts) * this._W,
        y: this._H * 0.70 + Math.sin(i * 0.17) * 55 + Math.sin(i * 0.06) * 85 + Math.random() * 18,
      });
    }
  }

  _newParticle(randomY = false) {
    const W = this._W || window.innerWidth;
    const H = this._H || window.innerHeight;
    return {
      x: Math.random() * W,
      y: randomY ? Math.random() * H : H + 5,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -(Math.random() * 0.55 + 0.12),
      life: 0,
      maxLife: 220 + Math.random() * 320,
      size: Math.random() * 1.6 + 0.3,
      ember: Math.random() > 0.65,
    };
  }

  _drawBg() {
    const c = this._ctx, W = this._W, H = this._H;
    c.clearRect(0, 0, W, H);

    // Sky
    const sky = c.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0,   '#050709');
    sky.addColorStop(0.42,'#0C1016');
    sky.addColorStop(0.72,'#1A0F07');
    sky.addColorStop(1,   '#281304');
    c.fillStyle = sky; c.fillRect(0, 0, W, H * 0.72);

    // Horizon fire glow
    const glow = c.createRadialGradient(W * 0.5, H * 0.62, 0, W * 0.5, H * 0.62, W * 0.52);
    glow.addColorStop(0,   'rgba(255, 85, 12, 0.22)');
    glow.addColorStop(0.38,'rgba(255, 40, 0, 0.07)');
    glow.addColorStop(1,   'transparent');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);

    // Secondary glow offset
    const glow2 = c.createRadialGradient(W * 0.72, H * 0.58, 0, W * 0.72, H * 0.58, W * 0.28);
    glow2.addColorStop(0,   'rgba(240,60,0,0.1)');
    glow2.addColorStop(1,   'transparent');
    c.fillStyle = glow2; c.fillRect(0, 0, W, H);

    // Fog layers
    this._fogOffset += 0.12;
    for (let f = 0; f < 4; f++) {
      c.save(); c.globalAlpha = 0.055 + f * 0.025;
      const fg = c.createLinearGradient(0, H * 0.56, 0, H * 0.74);
      fg.addColorStop(0,'transparent');
      fg.addColorStop(0.5,`rgba(210,120,50,0.9)`);
      fg.addColorStop(1,'transparent');
      c.fillStyle = fg;
      const off = (this._fogOffset * (f + 1) * 0.38) % (W + 300);
      c.beginPath(); c.moveTo(-off, H * 0.56);
      for (let x = 0; x <= W + 300; x += 28) {
        c.lineTo(x - off, H * 0.56 + Math.sin((x + this._fogOffset * (f + 1) * 1.8) * 0.013) * 18);
      }
      c.lineTo(W + 300, H); c.lineTo(0, H); c.fill();
      c.restore();
    }

    // Distant mountains
    c.fillStyle = '#090C10';
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 18) {
      c.lineTo(x, H * 0.56 + Math.sin(x * 0.0055) * 85 + Math.sin(x * 0.021) * 38);
    }
    c.lineTo(W, H); c.fill();

    // Ground terrain
    c.fillStyle = '#060809';
    c.beginPath();
    this._terrain.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
    c.lineTo(W, H); c.lineTo(0, H); c.closePath(); c.fill();

    // Tactical grid
    c.strokeStyle = 'rgba(255,107,26,0.035)'; c.lineWidth = 0.5;
    const gs = 90;
    for (let x = 0; x < W; x += gs) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,H); c.stroke(); }
    for (let y = 0; y < H; y += gs) { c.beginPath(); c.moveTo(0,y); c.lineTo(W,y); c.stroke(); }

    // Particles
    for (let i = 0; i < this._particles.length; i++) {
      const p = this._particles[i];
      p.x += p.vx + Math.sin(p.life * 0.038) * 0.28;
      p.y += p.vy; p.life++;
      if (p.life > p.maxLife || p.y < -8) {
        this._particles[i] = this._newParticle(false);
        continue;
      }
      const t = p.life / p.maxLife;
      const a = t < 0.1 ? t * 10 * 0.55 : t > 0.8 ? (1 - t) * 5 * 0.55 : 0.55;
      c.fillStyle = p.ember
        ? `rgba(255,${75 + (Math.random()*55)|0},18,${a * 0.95})`
        : `rgba(175,165,155,${a * 0.28})`;
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill();
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _makeScreen() {
    const s = document.createElement('div');
    s.className = 'mm-screen';
    this._root.appendChild(s);
    return s;
  }

  _startClock() {
    const update = () => {
      const el = document.getElementById('mm-clock');
      if (el) el.textContent = new Date().toUTCString().split(' ')[4] + ' UTC';
    };
    update();
    this._clockTimer = setInterval(update, 1000);
  }

  _loadPlayerCount() {
    let base = 24300 + Math.floor(Math.random() * 2000);
    const el = () => document.getElementById('mm-player-count');
    const update = () => {
      base += Math.floor((Math.random() - 0.3) * 15);
      base = Math.max(18000, Math.min(38000, base));
      if (el()) el().textContent = base.toLocaleString() + ' PLAYERS ONLINE';
    };
    update();
    this._countTimer = setInterval(update, 3500);
  }

  _detectRegion() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (/America/.test(tz)) return 'na';
    if (/Europe/.test(tz))  return 'eu';
    if (/Asia/.test(tz))    return 'apac';
    return 'na';
  }

  _loadSettings() {
    try { return JSON.parse(localStorage.getItem('settings') || '{}'); } catch { return {}; }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  onPlay(fn)   { this._onPlay   = fn; }
  onShop(fn)   { this._onShop   = fn; }
  onLocker(fn) { this._onLocker = fn; }

  show() { this._root.style.display = 'flex'; this._renderMain(); }
  hide() { this._root.style.display = 'none'; }

  dispose() {
    cancelAnimationFrame(this._animFrame);
    clearInterval(this._clockTimer);
    clearInterval(this._countTimer);
    this._root?.remove();
  }
}
