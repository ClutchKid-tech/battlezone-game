/**
 * MainMenu — AAA Battle Royale main menu.
 * Full-width 3-column layout. Military tactical aesthetic.
 * Left: player card + squad. Center: logo + buttons + ticker. Right: character art + season.
 * Web Audio API sound design. 200-ember animated canvas. No external assets.
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
    background: #060809;
  }

  /* ── BACKGROUND ── */
  #mm-bg { position: absolute; inset: 0; z-index: 0; }

  .mm-scanlines {
    position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background: repeating-linear-gradient(0deg, transparent, transparent 3px,
      rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px);
  }
  .mm-vignette {
    position: absolute; inset: 0; z-index: 3; pointer-events: none;
    background: radial-gradient(ellipse at 50% 60%, transparent 30%, rgba(0,0,0,0.72) 100%);
  }

  /* ── HUD CORNERS ── */
  .mm-corner {
    position: absolute; width: 72px; height: 72px;
    z-index: 30; pointer-events: none;
    opacity: 0;
    animation: mm-corner-in 0.5s ease forwards;
  }
  .mm-corner-tl { top:16px; left:16px;  border-top:2px solid #FF6B1A; border-left:2px solid #FF6B1A; animation-delay:0.1s; }
  .mm-corner-tr { top:16px; right:16px; border-top:2px solid #FF6B1A; border-right:2px solid #FF6B1A; animation-delay:0.2s; }
  .mm-corner-bl { bottom:16px; left:16px;  border-bottom:2px solid #FF6B1A; border-left:2px solid #FF6B1A; animation-delay:0.3s; }
  .mm-corner-br { bottom:16px; right:16px; border-bottom:2px solid #FF6B1A; border-right:2px solid #FF6B1A; animation-delay:0.4s; }
  @keyframes mm-corner-in {
    from { opacity:0; width:20px; height:20px; }
    to   { opacity:1; width:72px; height:72px; }
  }

  /* ── STATUS BAR ── */
  .mm-statusbar {
    position: absolute; top:0; left:0; right:0; height:36px; z-index:25;
    display:flex; align-items:center; justify-content:space-between;
    padding:0 32px;
    background: linear-gradient(90deg, rgba(6,8,12,0.98) 0%, rgba(6,8,12,0.88) 50%, rgba(6,8,12,0.98) 100%);
    border-bottom: 1px solid rgba(255,107,26,0.22);
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px; color: #8A8278; letter-spacing: 0.14em;
  }
  .mm-status-left, .mm-status-right { display:flex; align-items:center; gap:24px; }
  .mm-status-online { color: #2ECC71; }
  .mm-status-online::before {
    content:''; display:inline-block;
    width:6px; height:6px; background:#2ECC71; border-radius:50%;
    margin-right:7px; animation: mm-blink 1.6s ease-in-out infinite;
    box-shadow: 0 0 6px #2ECC71;
  }
  .mm-status-coord { color: #FF6B1A; opacity:0.7; }
  @keyframes mm-blink { 0%,100%{opacity:1} 50%{opacity:0.3} }

  /* ── BOTTOM BAR ── */
  .mm-bottombar {
    position: absolute; bottom:0; left:0; right:0; z-index:25;
    display:flex; flex-direction:column;
  }
  .mm-ticker-wrap {
    height:30px; background:rgba(255,107,26,0.08);
    border-top:1px solid rgba(255,107,26,0.25);
    border-bottom:1px solid rgba(255,107,26,0.1);
    overflow:hidden; display:flex; align-items:center;
  }
  .mm-ticker-label {
    flex-shrink:0; padding:0 14px;
    font-family:'Share Tech Mono',monospace;
    font-size:9px; letter-spacing:0.2em;
    color:#FF6B1A; background:rgba(255,107,26,0.15);
    border-right:1px solid rgba(255,107,26,0.3);
    height:100%; display:flex; align-items:center;
  }
  .mm-ticker-track {
    display:flex; align-items:center; gap:0;
    animation: mm-ticker 60s linear infinite;
    white-space:nowrap;
  }
  .mm-ticker-track span {
    font-family:'Share Tech Mono',monospace;
    font-size:10px; color:#7A7268; letter-spacing:0.12em;
    padding:0 32px;
  }
  .mm-ticker-track span::before { content:'◈ '; color:#FF6B1A; opacity:0.5; }
  @keyframes mm-ticker { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  .mm-metabar {
    height:28px; background:rgba(6,8,12,0.95);
    display:flex; align-items:center; justify-content:space-between;
    padding:0 32px;
    font-family:'Share Tech Mono',monospace;
    font-size:9px; color:#3A3530; letter-spacing:0.12em;
  }
  .mm-ammo { color:#FF6B1A; opacity:0.5; letter-spacing:0.04em; }
  .mm-version { color:#FF6B1A; opacity:0.45; }

  /* ── MAIN LAYOUT: 3 COLUMNS ── */
  .mm-layout {
    position: absolute; inset:0; z-index:15;
    display:grid;
    grid-template-columns: 25% 50% 25%;
    grid-template-rows: 1fr;
    padding: 36px 0 88px;
    gap: 0;
  }

  /* ════════════════════════════════════════
     LEFT PANEL
  ════════════════════════════════════════ */
  .mm-left {
    display:flex; flex-direction:column; gap:16px;
    padding: 20px 20px 20px 32px;
    justify-content:flex-start;
    padding-top:48px;
  }

  /* Player card */
  .mm-player-card {
    background: rgba(8,14,20,0.88);
    border:1px solid rgba(255,107,26,0.2);
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%);
    padding:16px;
    animation: mm-fadein 0.5s 0.2s ease both;
  }
  .mm-player-top { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
  .mm-avatar {
    width:52px; height:52px; border-radius:50%;
    background: linear-gradient(135deg, #1A2530, #0D1820);
    border:2px solid rgba(255,107,26,0.5);
    display:flex; align-items:center; justify-content:center;
    font-family:'Bebas Neue',sans-serif; font-size:22px; color:#FF6B1A;
    position:relative; flex-shrink:0;
    box-shadow: 0 0 16px rgba(255,107,26,0.2);
  }
  .mm-avatar-level {
    position:absolute; bottom:-6px; right:-6px;
    background:#FF6B1A; color:#060809;
    font-family:'Bebas Neue',sans-serif; font-size:11px;
    width:20px; height:20px; border-radius:3px;
    display:flex; align-items:center; justify-content:center;
    border:1px solid rgba(255,255,255,0.2);
  }
  .mm-player-info { flex:1; min-width:0; }
  .mm-player-name {
    font-family:'Bebas Neue',sans-serif; font-size:20px; letter-spacing:0.08em;
    color:#F0EDE8; line-height:1;
  }
  .mm-player-rank {
    font-family:'Share Tech Mono',monospace; font-size:9px; color:#FF6B1A;
    letter-spacing:0.2em; margin-top:3px; opacity:0.8;
  }
  .mm-xp-label {
    font-family:'Share Tech Mono',monospace; font-size:9px; color:#5A5550;
    letter-spacing:0.14em; display:flex; justify-content:space-between; margin-bottom:5px;
  }
  .mm-xp-bar {
    height:4px; background:rgba(255,255,255,0.07);
    border-radius:2px; overflow:hidden;
  }
  .mm-xp-fill {
    height:100%; width:68%;
    background: linear-gradient(90deg, #FF6B1A, #FFa050);
    border-radius:2px;
    box-shadow: 0 0 8px rgba(255,107,26,0.5);
    animation: mm-xp-grow 1.2s 0.5s ease both;
  }
  @keyframes mm-xp-grow { from { width:0; } }

  /* Last match stats */
  .mm-stats-mini {
    background: rgba(8,14,20,0.8);
    border:1px solid rgba(255,107,26,0.12);
    padding:12px 14px;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    animation: mm-fadein 0.5s 0.35s ease both;
  }
  .mm-stats-title {
    font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:0.25em;
    color:#FF6B1A; opacity:0.7; margin-bottom:10px;
    border-bottom:1px solid rgba(255,107,26,0.12); padding-bottom:6px;
  }
  .mm-stats-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
  .mm-stat-cell { text-align:center; }
  .mm-stat-val {
    font-family:'Bebas Neue',sans-serif; font-size:22px;
    color:#F0EDE8; line-height:1;
  }
  .mm-stat-val.gold { color:#F0C040; }
  .mm-stat-label {
    font-family:'Share Tech Mono',monospace; font-size:8px; color:#5A5550;
    letter-spacing:0.15em; margin-top:2px;
  }

  /* Squad slots */
  .mm-squad {
    background: rgba(8,14,20,0.8);
    border:1px solid rgba(255,107,26,0.12);
    padding:12px 14px;
    animation: mm-fadein 0.5s 0.5s ease both;
  }
  .mm-squad-title {
    font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:0.25em;
    color:#5A5550; margin-bottom:10px; display:flex; justify-content:space-between;
    align-items:center;
  }
  .mm-squad-title span:last-child { color:#2ECC71; font-size:8px; }
  .mm-squad-slots { display:flex; flex-direction:column; gap:6px; }
  .mm-squad-slot {
    height:34px; display:flex; align-items:center; gap:10px;
    background: rgba(255,255,255,0.03);
    border:1px dashed rgba(255,107,26,0.18);
    padding:0 12px; cursor:pointer;
    font-family:'Rajdhani',sans-serif; font-size:12px;
    letter-spacing:0.2em; color:#3A3530;
    transition: all 0.15s;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }
  .mm-squad-slot:hover { border-color:rgba(255,107,26,0.4); color:#FF6B1A; background:rgba(255,107,26,0.04); }
  .mm-squad-slot.filled { border-style:solid; border-color:rgba(255,107,26,0.3); color:#7A7268; }
  .mm-squad-dot {
    width:8px; height:8px; border-radius:50%;
    background:rgba(255,107,26,0.25); border:1px solid rgba(255,107,26,0.4);
    flex-shrink:0;
  }
  .mm-squad-dot.filled { background:#2ECC71; border-color:#2ECC71; box-shadow:0 0 6px #2ECC71; }

  @keyframes mm-fadein {
    from { opacity:0; transform:translateX(-12px); }
    to   { opacity:1; transform:translateX(0); }
  }

  /* ════════════════════════════════════════
     CENTER PANEL
  ════════════════════════════════════════ */
  .mm-center {
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    padding:0 20px;
    gap:0;
  }

  /* Logo */
  .mm-logo-wrap {
    text-align:center; margin-bottom:28px;
    animation: mm-logo-drop 0.7s ease both;
  }
  @keyframes mm-logo-drop {
    from { opacity:0; transform:translateY(-24px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .mm-eyebrow {
    font-family:'Share Tech Mono',monospace; font-size:10px; letter-spacing:0.5em;
    color:#FF6B1A; opacity:0.8; margin-bottom:4px; text-transform:uppercase;
  }
  .mm-logo-title {
    font-family:'Bebas Neue',sans-serif; font-size:clamp(80px,8vw,110px); line-height:0.88;
    letter-spacing:0.07em; color:#F0EDE8;
    text-shadow: 0 0 40px rgba(255,107,26,0.6), 0 0 90px rgba(255,107,26,0.25), 0 3px 0 rgba(0,0,0,0.9);
    animation: mm-glow 3s ease-in-out infinite alternate;
  }
  @keyframes mm-glow {
    from { text-shadow:0 0 30px rgba(255,107,26,0.4), 0 0 60px rgba(255,107,26,0.15), 0 3px 0 rgba(0,0,0,0.9); }
    to   { text-shadow:0 0 60px rgba(255,107,26,0.8), 0 0 120px rgba(255,107,26,0.4), 0 3px 0 rgba(0,0,0,0.9); }
  }
  .mm-logo-sub {
    font-family:'Exo 2',sans-serif; font-weight:300; font-size:12px;
    letter-spacing:0.4em; color:#8A8078; text-transform:uppercase; margin-top:6px;
  }
  .mm-logo-line {
    width:380px; height:1px; margin:16px auto 0;
    background: linear-gradient(90deg, transparent, #FF6B1A 30%, #FF6B1A 70%, transparent);
    opacity:0.45;
  }

  /* Buttons */
  .mm-nav { display:flex; flex-direction:column; gap:5px; width:100%; max-width:420px; }

  .mm-btn {
    position:relative;
    display:flex; align-items:center;
    width:100%; height:48px; padding:0 20px 0 16px;
    background: rgba(255,107,26,0.04);
    border:1px solid rgba(255,107,26,0.2);
    border-left:none;
    color:#A09890;
    font-family:'Bebas Neue',sans-serif; font-size:20px;
    letter-spacing:0.3em; text-transform:uppercase;
    cursor:pointer;
    clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
    transition: background 0.14s, border-color 0.14s, color 0.14s, transform 0.1s, box-shadow 0.14s;
    opacity:0; animation: mm-fadeup 0.4s ease both;
    text-align:left;
  }
  .mm-btn::before {
    content:'';
    position:absolute; left:0; top:0; bottom:0; width:4px;
    background: #FF6B1A;
    transition: width 0.12s, box-shadow 0.12s;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6px), 0 100%);
  }
  .mm-btn:hover, .mm-btn:focus-visible {
    background: rgba(255,107,26,0.1);
    border-color: rgba(255,107,26,0.7);
    color: #F0EDE8;
    transform: translateX(6px);
    box-shadow: 0 0 28px rgba(255,107,26,0.2), inset 0 0 30px rgba(255,107,26,0.05);
    outline:none;
  }
  .mm-btn:hover::before { width:8px; box-shadow:0 0 12px #FF6B1A; }
  .mm-btn:active { transform:translateX(3px) scale(0.99); }

  .mm-btn-inner { display:flex; align-items:center; gap:12px; flex:1; }
  .mm-btn-icon { font-size:16px; opacity:0.75; width:20px; text-align:center; flex-shrink:0; }
  .mm-btn-label { flex:1; }
  .mm-btn-tag {
    font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:0.15em;
    color:#5A5550; margin-left:auto; flex-shrink:0; padding-right:8px;
    transition: color 0.14s;
  }
  .mm-btn:hover .mm-btn-tag { color:#FF6B1A; opacity:0.8; }

  /* PLAY button override */
  .mm-btn-primary {
    height:62px; font-size:26px;
    background: rgba(255,107,26,0.1);
    border-color: rgba(255,107,26,0.55);
    color:#F0EDE8;
    box-shadow: 0 0 24px rgba(255,107,26,0.15);
    animation: mm-fadeup 0.4s ease both, mm-play-pulse 2.5s 1s ease-in-out infinite;
  }
  @keyframes mm-play-pulse {
    0%,100% { box-shadow:0 0 20px rgba(255,107,26,0.15); }
    50%      { box-shadow:0 0 40px rgba(255,107,26,0.35); }
  }
  .mm-btn-primary::before { width:6px; box-shadow:0 0 16px #FF6B1A; }
  .mm-btn-primary:hover { box-shadow:0 0 50px rgba(255,107,26,0.45), inset 0 0 40px rgba(255,107,26,0.08); }

  .mm-btn-danger { border-color:rgba(232,35,10,0.2); color:#7A5050; }
  .mm-btn-danger::before { background:#E8230A; }
  .mm-btn-danger:hover {
    background:rgba(232,35,10,0.09); border-color:rgba(232,35,10,0.6);
    color:#FF8070; box-shadow:0 0 24px rgba(232,35,10,0.2);
  }

  .mm-divider { width:100%; height:1px; background:rgba(255,107,26,0.1); margin:3px 0; }

  @keyframes mm-fadeup {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }

  /* Press Enter prompt */
  .mm-enter-prompt {
    margin-top:22px;
    font-family:'Share Tech Mono',monospace; font-size:10px;
    letter-spacing:0.35em; color:#5A5550; text-transform:uppercase;
    animation: mm-enter-blink 1.8s ease-in-out infinite;
    transition: opacity 0.4s;
  }
  .mm-enter-prompt.hidden { opacity:0; pointer-events:none; }
  @keyframes mm-enter-blink { 0%,100%{opacity:0.6} 50%{opacity:0.15} }

  /* ════════════════════════════════════════
     RIGHT PANEL
  ════════════════════════════════════════ */
  .mm-right {
    display:flex; flex-direction:column;
    align-items:flex-end;
    padding:20px 32px 20px 10px;
    padding-top:40px;
    position:relative; overflow:hidden;
  }

  /* Season banner */
  .mm-season-banner {
    width:100%;
    background: linear-gradient(135deg, rgba(240,192,64,0.08) 0%, rgba(8,14,20,0.9) 100%);
    border:1px solid rgba(240,192,64,0.3);
    border-right:none;
    padding:14px 16px;
    clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
    margin-bottom:16px;
    animation: mm-faderight 0.5s 0.4s ease both;
  }
  .mm-season-eyebrow {
    font-family:'Share Tech Mono',monospace; font-size:8px; letter-spacing:0.35em;
    color:#F0C040; opacity:0.8; margin-bottom:4px;
  }
  .mm-season-title {
    font-family:'Bebas Neue',sans-serif; font-size:34px; letter-spacing:0.08em;
    color:#F0C040; line-height:0.95;
    text-shadow: 0 0 30px rgba(240,192,64,0.6),
                 0 0 60px rgba(240,192,64,0.25),
                 0 2px 0 rgba(0,0,0,0.9);
    animation: mm-gold-pulse 3s ease-in-out infinite alternate;
  }
  @keyframes mm-gold-pulse {
    from { text-shadow:0 0 20px rgba(240,192,64,0.5), 0 0 40px rgba(240,192,64,0.2), 0 2px 0 rgba(0,0,0,0.9); }
    to   { text-shadow:0 0 45px rgba(240,192,64,0.8), 0 0 80px rgba(240,192,64,0.4), 0 2px 0 rgba(0,0,0,0.9); }
  }
  .mm-season-sub {
    font-family:'Exo 2',sans-serif; font-size:10px; color:#8A7840; margin-top:6px;
  }
  @keyframes mm-faderight {
    from { opacity:0; transform:translateX(16px); }
    to   { opacity:1; transform:translateX(0); }
  }

  /* Soldier art */
  .mm-soldier-wrap {
    flex:1; width:100%; position:relative;
    display:flex; align-items:flex-end; justify-content:center;
    overflow:hidden;
    animation: mm-faderight 0.6s 0.2s ease both;
  }
  .mm-soldier-svg {
    width:88%; max-height:430px;
    animation: mm-breathe 4s ease-in-out infinite;
    transform-origin: center bottom;
  }
  @keyframes mm-breathe {
    0%,100% { transform:scaleY(1); }
    50%      { transform:scaleY(1.005); }
  }

  /* Featured item card */
  .mm-featured {
    width:100%;
    background: linear-gradient(135deg, rgba(8,14,20,0.95) 0%, rgba(18,24,30,0.9) 100%);
    border:1px solid rgba(255,107,26,0.22);
    border-right:none;
    padding:12px 14px;
    clip-path:polygon(0 0, 100% 0, 100% 100%, 10px 100%, 0 calc(100% - 10px));
    margin-bottom:12px;
    animation: mm-faderight 0.5s 0.55s ease both;
  }
  .mm-featured-label {
    font-family:'Share Tech Mono',monospace; font-size:8px; letter-spacing:0.3em;
    color:#FF6B1A; opacity:0.7; margin-bottom:8px;
  }
  .mm-featured-weapon {
    display:flex; align-items:center; gap:12px;
  }
  .mm-weapon-art {
    width:60px; height:36px; flex-shrink:0;
    background: rgba(255,107,26,0.06); border:1px solid rgba(255,107,26,0.2);
    display:flex; align-items:center; justify-content:center;
    font-size:22px;
  }
  .mm-weapon-info { flex:1; min-width:0; }
  .mm-weapon-name {
    font-family:'Bebas Neue',sans-serif; font-size:16px; letter-spacing:0.1em;
    color:#F0EDE8; line-height:1;
  }
  .mm-weapon-rarity {
    font-family:'Share Tech Mono',monospace; font-size:8px; color:#F0C040;
    letter-spacing:0.2em; margin-top:2px;
  }

  /* Battle pass CTA */
  .mm-battlepass {
    width:100%;
    background: linear-gradient(135deg, rgba(240,192,64,0.15) 0%, rgba(180,120,0,0.08) 100%);
    border:1px solid rgba(240,192,64,0.4);
    border-right:none;
    padding:14px 16px;
    cursor:pointer;
    transition: all 0.15s;
    clip-path:polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
    animation: mm-faderight 0.5s 0.65s ease both;
  }
  .mm-battlepass:hover {
    background:linear-gradient(135deg, rgba(240,192,64,0.25) 0%, rgba(180,120,0,0.15) 100%);
    border-color:rgba(240,192,64,0.7);
    box-shadow:0 0 30px rgba(240,192,64,0.25);
    transform:translateX(-4px);
  }
  .mm-bp-label {
    font-family:'Share Tech Mono',monospace; font-size:8px; letter-spacing:0.3em;
    color:#F0C040; opacity:0.7; margin-bottom:4px;
  }
  .mm-bp-title {
    font-family:'Bebas Neue',sans-serif; font-size:22px; letter-spacing:0.1em;
    color:#F0C040; line-height:1;
    text-shadow:0 0 20px rgba(240,192,64,0.5);
  }
  .mm-bp-sub {
    font-family:'Exo 2',sans-serif; font-size:10px; color:#8A7840; margin-top:3px;
  }
  .mm-bp-arrow {
    float:right; font-size:18px; color:#F0C040; opacity:0.7;
    line-height:1; margin-top:-18px;
  }

  /* ── SUB-SCREENS (PLAY, STATS, SETTINGS) ── */
  .mm-screen {
    position:absolute; inset:0; z-index:25;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    padding:70px 40px 100px;
    background: rgba(6,8,12,0.94);
    backdrop-filter:blur(8px);
    animation: mm-screenfade 0.22s ease both;
  }
  @keyframes mm-screenfade { from{opacity:0} to{opacity:1} }
  .mm-screen-title {
    font-family:'Bebas Neue',sans-serif; font-size:52px; letter-spacing:0.1em;
    color:#F0EDE8; text-shadow:0 0 24px rgba(255,107,26,0.35);
    margin-bottom:6px;
  }
  .mm-screen-line {
    width:220px; height:1px; margin-bottom:32px;
    background:linear-gradient(90deg, transparent, #FF6B1A, transparent); opacity:0.5;
  }
  .mm-back-btn {
    position:absolute; top:52px; left:40px;
    display:flex; align-items:center; gap:8px;
    background:rgba(8,12,18,0.8); border:1px solid rgba(255,107,26,0.25);
    color:#8A8078; font-family:'Rajdhani',sans-serif; font-size:13px;
    letter-spacing:0.2em; text-transform:uppercase;
    padding:8px 18px; cursor:pointer;
    clip-path:polygon(8px 0,100% 0,100% 100%,0 100%,0 8px);
    transition:all 0.15s;
  }
  .mm-back-btn:hover { color:#F0EDE8; border-color:rgba(255,107,26,0.6); background:rgba(255,107,26,0.08); }

  /* Play screen */
  .mm-mode-grid { display:flex; gap:16px; margin-bottom:28px; }
  .mm-mode-card {
    width:150px; padding:22px 16px;
    background:rgba(8,12,18,0.82); border:1px solid rgba(255,107,26,0.22);
    cursor:pointer; text-align:center;
    clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));
    transition:all 0.14s;
  }
  .mm-mode-card:hover, .mm-mode-card.selected {
    background:rgba(255,107,26,0.1); border-color:rgba(255,107,26,0.7);
    box-shadow:0 0 24px rgba(255,107,26,0.18);
  }
  .mm-mode-card.selected { border-color:#FF6B1A; }
  .mm-mode-icon { font-size:30px; margin-bottom:10px; }
  .mm-mode-label {
    font-family:'Rajdhani',sans-serif; font-weight:700; font-size:17px;
    letter-spacing:0.2em; color:#F0EDE8; text-transform:uppercase;
  }
  .mm-mode-sub { font-size:11px; color:#8A8078; margin-top:4px; }

  .mm-region-row { display:flex; gap:8px; margin-bottom:28px; flex-wrap:wrap; justify-content:center; }
  .mm-region-btn {
    padding:7px 18px;
    background:rgba(8,12,18,0.7); border:1px solid rgba(255,107,26,0.2);
    color:#8A8078; font-family:'Rajdhani',sans-serif; font-size:12px;
    letter-spacing:0.2em; text-transform:uppercase; cursor:pointer;
    transition:all 0.14s;
    clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,0 100%);
  }
  .mm-region-btn:hover, .mm-region-btn.selected {
    border-color:rgba(255,107,26,0.6); color:#F0EDE8; background:rgba(255,107,26,0.08);
  }
  .mm-region-btn.selected { border-color:#FF6B1A; color:#FF6B1A; }

  .mm-queue-btn {
    height:58px; padding:0 44px;
    background:rgba(255,107,26,0.18); border:1px solid rgba(255,107,26,0.65);
    color:#F0EDE8; font-family:'Bebas Neue',sans-serif; font-size:22px;
    letter-spacing:0.35em; text-transform:uppercase; cursor:pointer;
    clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px));
    transition:all 0.15s;
    box-shadow:0 0 24px rgba(255,107,26,0.18);
    position:relative; overflow:hidden;
  }
  .mm-queue-btn:hover {
    background:rgba(255,107,26,0.3); border-color:#FF6B1A;
    box-shadow:0 0 50px rgba(255,107,26,0.45);
    transform:scale(1.02);
  }

  /* Stats screen */
  .mm-stats-grid-full {
    display:grid; grid-template-columns:repeat(3,1fr); gap:14px;
    width:100%; max-width:640px;
  }
  .mm-stat-card {
    background:rgba(8,12,18,0.85); border:1px solid rgba(255,107,26,0.18);
    padding:18px 20px; text-align:center;
    clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px));
    transition:all 0.14s;
  }
  .mm-stat-card:hover { border-color:rgba(255,107,26,0.5); background:rgba(255,107,26,0.06); }
  .mm-stat-card-val {
    font-family:'Bebas Neue',sans-serif; font-size:38px; color:#F0EDE8;
    line-height:1;
    text-shadow:0 0 20px rgba(255,107,26,0.25);
  }
  .mm-stat-card-val.highlight { color:#FF6B1A; }
  .mm-stat-card-label {
    font-family:'Share Tech Mono',monospace; font-size:9px; color:#5A5550;
    letter-spacing:0.2em; margin-top:5px;
  }

  /* Settings screen */
  .mm-settings-groups { display:flex; gap:28px; width:100%; max-width:780px; }
  .mm-settings-group { flex:1; }
  .mm-settings-group-title {
    font-family:'Share Tech Mono',monospace; font-size:9px; letter-spacing:0.3em;
    color:#FF6B1A; opacity:0.7; border-bottom:1px solid rgba(255,107,26,0.15);
    padding-bottom:8px; margin-bottom:14px;
  }
  .mm-setting-row {
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom:12px; gap:12px;
  }
  .mm-setting-label {
    font-family:'Rajdhani',sans-serif; font-size:13px; font-weight:600;
    letter-spacing:0.15em; color:#8A8078; text-transform:uppercase;
    flex:1;
  }
  .mm-slider { width:120px; accent-color:#FF6B1A; cursor:pointer; }
  .mm-toggle {
    width:36px; height:18px; border-radius:9px;
    background:rgba(255,107,26,0.12); border:1px solid rgba(255,107,26,0.3);
    cursor:pointer; position:relative; transition:background 0.2s;
    flex-shrink:0;
  }
  .mm-toggle.on { background:rgba(255,107,26,0.4); border-color:#FF6B1A; }
  .mm-toggle::after {
    content:''; position:absolute; top:2px; left:2px;
    width:12px; height:12px; border-radius:50%;
    background:#5A5550; transition:transform 0.2s, background 0.2s;
  }
  .mm-toggle.on::after { transform:translateX(18px); background:#FF6B1A; }
`;

/* ─────────────────────────────────────────────────────────── */

export default class MainMenu {
  constructor(network, api) {
    this.network = network;
    this.api     = api;

    this._onPlayCb   = null;
    this._onShopCb   = null;
    this._onLockerCb = null;

    this._selectedMode   = 'squad';
    this._selectedRegion = 'NA-EAST';
    this._enterPromptDismissed = false;
    this._audioCtx = null;

    this._root    = null;
    this._canvas  = null;
    this._animId  = null;
    this._coordId = null;

    this._particles = [];
    this._helicopterX = null;
    this._helicopterTimer = 0;
    this._muzzleFlashes = [];
    this._muzzleTimer = 3 + Math.random() * 5;
    this._lightRays = [];

    this._build();
  }

  /* ─── Public API ─── */

  onPlay(fn)   { this._onPlayCb   = fn; }
  onShop(fn)   { this._onShopCb   = fn; }
  onLocker(fn) { this._onLockerCb = fn; }

  show() {
    this._root.style.display = 'flex';
    this._renderMain();
    this._startCanvas();
    this._startCoordTick();
    this._playBoom();
  }

  hide() {
    this._root.style.display = 'none';
    this._stopCanvas();
    this._stopCoordTick();
    this._removeSubScreen();
  }

  dispose() {
    this.hide();
    if (this._root.parentNode) this._root.parentNode.removeChild(this._root);
    const st = document.getElementById('mm-styles');
    if (st) st.remove();
    if (this._audioCtx) { this._audioCtx.close(); this._audioCtx = null; }
  }

  /* ─── Build DOM skeleton ─── */

  _build() {
    if (!document.getElementById('mm-styles')) {
      const st = document.createElement('style');
      st.id = 'mm-styles';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    this._root = document.createElement('div');
    this._root.id = 'mm-root';
    this._root.style.cssText = 'display:none;flex-direction:column;';
    document.body.appendChild(this._root);

    // Background canvas
    this._canvas = document.createElement('canvas');
    this._canvas.id = 'mm-bg';
    this._root.appendChild(this._canvas);

    this._root.insertAdjacentHTML('beforeend', `
      <div class="mm-scanlines"></div>
      <div class="mm-vignette"></div>

      <div class="mm-corner mm-corner-tl"></div>
      <div class="mm-corner mm-corner-tr"></div>
      <div class="mm-corner mm-corner-bl"></div>
      <div class="mm-corner mm-corner-br"></div>

      <div class="mm-statusbar">
        <div class="mm-status-left">
          <span class="mm-status-online">SERVER ONLINE</span>
          <span>BATTLEZONE v1.0.0</span>
          <span class="mm-status-coord" id="mm-coord">GRID: 47.2°N  89.1°E</span>
        </div>
        <div class="mm-status-right">
          <span id="mm-playercount">◈ 2,847 ONLINE</span>
          <span id="mm-utctime">UTC 00:00:00</span>
        </div>
      </div>
    `);

    // Three-column layout
    this._layoutEl = document.createElement('div');
    this._layoutEl.className = 'mm-layout';
    this._root.appendChild(this._layoutEl);

    // Bottom bar
    const tickerItems = [
      'SEASON 1: OPERATION GHOST FIRE NOW LIVE',
      'NEW WEAPONS: TAC-9 SMG + IRON LANCE MARKSMAN RIFLE',
      'DOUBLE XP WEEKEND ENDS MONDAY 23:59 UTC',
      'RANKED MODE UNLOCKS AT LEVEL 10',
      'VEHICLE UPDATE: ARMOURED CARRIER + RECON DRONE',
      'ANTI-CHEAT v2.4 DEPLOYED — REPORT SUSPICIOUS ACTIVITY',
      'NEW MAP ZONES: DERELICT SHIPYARD + COMMAND BUNKER',
    ];
    const doubled = [...tickerItems, ...tickerItems];
    this._root.insertAdjacentHTML('beforeend', `
      <div class="mm-bottombar">
        <div class="mm-ticker-wrap">
          <div class="mm-ticker-label">INTEL</div>
          <div class="mm-ticker-track">
            ${doubled.map(t => `<span>${t}</span>`).join('')}
          </div>
        </div>
        <div class="mm-metabar">
          <span>BATTLEZONE STUDIOS © 2025 — ALL RIGHTS RESERVED</span>
          <span class="mm-ammo">◼◼◼◼◼◼◼◼ 30/30</span>
          <span class="mm-version">BUILD 1.0.0-ALPHA</span>
        </div>
      </div>
    `);

    this._startClock();
    this._initParticles();
  }

  /* ─── Render main screen ─── */

  _renderMain() {
    this._removeSubScreen();

    this._layoutEl.innerHTML = `
      ${this._buildLeftPanel()}
      ${this._buildCenterPanel()}
      ${this._buildRightPanel()}
    `;

    // Wire buttons
    this._q('#mm-btn-play').addEventListener('click', () => { this._playClick(); this._renderPlay(); });
    this._q('#mm-btn-shop').addEventListener('click', () => { this._playClick(); this._onShopCb?.(); });
    this._q('#mm-btn-locker').addEventListener('click', () => { this._playClick(); this._onLockerCb?.(); });
    this._q('#mm-btn-stats').addEventListener('click', () => { this._playClick(); this._renderStats(); });
    this._q('#mm-btn-settings').addEventListener('click', () => { this._playClick(); this._renderSettings(); });
    this._q('#mm-btn-exit').addEventListener('click', () => { this._playClick(); if (confirm('Exit to desktop?')) window.close(); });

    // Hover sounds on all buttons
    this._layoutEl.querySelectorAll('.mm-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => this._playHover());
    });

    // Dismiss ENTER prompt on first interaction
    const enterPrompt = this._q('#mm-enter-prompt');
    const dismiss = () => {
      if (this._enterPromptDismissed) return;
      this._enterPromptDismissed = true;
      if (enterPrompt) enterPrompt.classList.add('hidden');
    };
    window.addEventListener('keydown', dismiss, { once: true });
    window.addEventListener('click', dismiss, { once: true });

    // Enter key → play
    const onEnter = (e) => { if (e.key === 'Enter') { dismiss(); this._renderPlay(); } };
    window.addEventListener('keydown', onEnter);
    // clean up when we navigate
    this._layoutEl._onEnter = onEnter;
  }

  _buildLeftPanel() {
    return `
      <div class="mm-left">
        <div class="mm-player-card">
          <div class="mm-player-top">
            <div class="mm-avatar">S<div class="mm-avatar-level">47</div></div>
            <div class="mm-player-info">
              <div class="mm-player-name">SOLDIER_01</div>
              <div class="mm-player-rank">◈ GOLD III — SEASON 1</div>
            </div>
          </div>
          <div class="mm-xp-label"><span>LEVEL 47</span><span>6,800 / 10,000 XP</span></div>
          <div class="mm-xp-bar"><div class="mm-xp-fill"></div></div>
        </div>

        <div class="mm-stats-mini">
          <div class="mm-stats-title">LAST MATCH</div>
          <div class="mm-stats-grid">
            <div class="mm-stat-cell">
              <div class="mm-stat-val">7</div>
              <div class="mm-stat-label">KILLS</div>
            </div>
            <div class="mm-stat-cell">
              <div class="mm-stat-val gold">#3</div>
              <div class="mm-stat-label">PLACE</div>
            </div>
            <div class="mm-stat-cell">
              <div class="mm-stat-val">842</div>
              <div class="mm-stat-label">DMG</div>
            </div>
          </div>
        </div>

        <div class="mm-squad">
          <div class="mm-squad-title">
            <span>SQUAD</span>
            <span>READY</span>
          </div>
          <div class="mm-squad-slots">
            <div class="mm-squad-slot filled">
              <div class="mm-squad-dot filled"></div>
              <span>SOLDIER_01 (YOU)</span>
            </div>
            <div class="mm-squad-slot">
              <div class="mm-squad-dot"></div>
              <span>+ INVITE</span>
            </div>
            <div class="mm-squad-slot">
              <div class="mm-squad-dot"></div>
              <span>+ INVITE</span>
            </div>
            <div class="mm-squad-slot">
              <div class="mm-squad-dot"></div>
              <span>+ INVITE</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _buildCenterPanel() {
    const delays = [0.1, 0.2, 0.28, 0.34, 0.4, 0.46, 0.52, 0.58];
    return `
      <div class="mm-center">
        <div class="mm-logo-wrap">
          <div class="mm-eyebrow">◈ SEASON 1: OPERATION GHOST FIRE ◈</div>
          <div class="mm-logo-title">BATTLEZONE</div>
          <div class="mm-logo-sub">100 Players · Last Squad Standing</div>
          <div class="mm-logo-line"></div>
        </div>

        <nav class="mm-nav" role="navigation">
          <button id="mm-btn-play" class="mm-btn mm-btn-primary" style="animation-delay:${delays[0]}s">
            <div class="mm-btn-inner">
              <span class="mm-btn-icon">▶▶</span>
              <span class="mm-btn-label">PLAY</span>
              <span class="mm-btn-tag">SQUAD MODE · HOT</span>
            </div>
          </button>
          <div class="mm-divider" style="animation:mm-fadeup 0.4s ${delays[1]}s ease both; opacity:0;"></div>
          <button id="mm-btn-shop" class="mm-btn" style="animation-delay:${delays[2]}s">
            <div class="mm-btn-inner">
              <span class="mm-btn-icon">◈</span>
              <span class="mm-btn-label">ITEM SHOP</span>
              <span class="mm-btn-tag">3 NEW ITEMS</span>
            </div>
          </button>
          <button id="mm-btn-locker" class="mm-btn" style="animation-delay:${delays[3]}s">
            <div class="mm-btn-inner">
              <span class="mm-btn-icon">⊞</span>
              <span class="mm-btn-label">LOCKER</span>
              <span class="mm-btn-tag">24 ITEMS</span>
            </div>
          </button>
          <button id="mm-btn-stats" class="mm-btn" style="animation-delay:${delays[4]}s">
            <div class="mm-btn-inner">
              <span class="mm-btn-icon">◉</span>
              <span class="mm-btn-label">STATS</span>
              <span class="mm-btn-tag">K/D 2.4</span>
            </div>
          </button>
          <button id="mm-btn-settings" class="mm-btn" style="animation-delay:${delays[5]}s">
            <div class="mm-btn-inner">
              <span class="mm-btn-icon">⚙</span>
              <span class="mm-btn-label">SETTINGS</span>
              <span class="mm-btn-tag"></span>
            </div>
          </button>
          <div class="mm-divider" style="animation:mm-fadeup 0.4s ${delays[6]}s ease both; opacity:0;"></div>
          <button id="mm-btn-exit" class="mm-btn mm-btn-danger" style="animation-delay:${delays[7]}s">
            <div class="mm-btn-inner">
              <span class="mm-btn-icon">✕</span>
              <span class="mm-btn-label">EXIT</span>
              <span class="mm-btn-tag"></span>
            </div>
          </button>
        </nav>

        <div class="mm-enter-prompt${this._enterPromptDismissed ? ' hidden' : ''}" id="mm-enter-prompt">
          ▶ PRESS ENTER TO BEGIN ◀
        </div>
      </div>
    `;
  }

  _buildRightPanel() {
    return `
      <div class="mm-right">
        <div class="mm-season-banner">
          <div class="mm-season-eyebrow">◈ SEASON 1 ◈</div>
          <div class="mm-season-title">OPERATION:<br>GHOST FIRE</div>
          <div class="mm-season-sub">New map zones · 2 weapons · Battle Pass</div>
        </div>

        <div class="mm-soldier-wrap">
          ${this._buildSoldierSVG()}
        </div>

        <div class="mm-featured">
          <div class="mm-featured-label">◈ FEATURED ITEM</div>
          <div class="mm-featured-weapon">
            <div class="mm-weapon-art">🔫</div>
            <div class="mm-weapon-info">
              <div class="mm-weapon-name">PHANTOM EDGE AR</div>
              <div class="mm-weapon-rarity">★ LEGENDARY SKIN</div>
            </div>
          </div>
        </div>

        <div class="mm-battlepass">
          <div class="mm-bp-label">◈ LIMITED TIME</div>
          <div class="mm-bp-title">BATTLE PASS</div>
          <div class="mm-bp-sub">100 tiers of rewards · Season 1</div>
          <div class="mm-bp-arrow">▶</div>
        </div>
      </div>
    `;
  }

  _buildSoldierSVG() {
    // Pure dark military silhouette. All shapes #0A0C0E.
    // Orange rim light via SVG feDropShadow (right-side only, dx=8).
    // Angular helmet polygon. Right arm raised holding rifle. No circles, no eyes.
    // S1 ELITE badge embedded on chest in gold.
    return `
      <svg class="mm-soldier-svg" viewBox="0 0 260 530" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="mm-rim" x="-30%" y="-5%" width="165%" height="115%">
            <feDropShadow dx="8" dy="0" stdDeviation="6"
              flood-color="#FF6B1A" flood-opacity="0.82" result="drop"/>
            <feDropShadow dx="4" dy="0" stdDeviation="3"
              flood-color="#FF9B50" flood-opacity="0.45"/>
          </filter>
        </defs>

        <!-- ── FULL SILHOUETTE ── all #0A0C0E, rim from filter -->
        <g fill="#0A0C0E" filter="url(#mm-rim)">

          <!-- BOOT SOLES -->
          <rect x="22" y="514" width="80" height="10"/>
          <rect x="114" y="514" width="70" height="10"/>

          <!-- BOOTS -->
          <polygon points="28,498 98,498 100,516 26,516"/>
          <polygon points="116,498 180,498 182,516 114,516"/>

          <!-- SHINS -->
          <polygon points="34,397 90,397 93,500 31,500"/>
          <polygon points="120,397 170,397 174,500 118,500"/>

          <!-- KNEE PADS -->
          <rect x="30" y="360" width="63" height="24"/>
          <rect x="118" y="360" width="58" height="24"/>

          <!-- THIGHS (wide combat stance) -->
          <polygon points="38,292 96,292 93,402 35,402"/>
          <polygon points="120,292 174,292 176,402 118,402"/>

          <!-- BELT -->
          <rect x="34" y="279" width="152" height="15"/>

          <!-- HIP POUCHES -->
          <rect x="36" y="288" width="26" height="24"/>
          <rect x="158" y="288" width="26" height="24"/>

          <!-- TORSO / PLATE CARRIER (trapezoid, slightly wider at shoulder) -->
          <polygon points="42,144 196,144 192,281 38,281"/>

          <!-- CHEST MOLLE POUCHES — 3 rows -->
          <rect x="56" y="157" width="27" height="19"/>
          <rect x="89" y="157" width="30" height="19"/>
          <rect x="126" y="157" width="27" height="19"/>
          <rect x="56" y="180" width="27" height="17"/>
          <rect x="89" y="180" width="30" height="17"/>
          <rect x="126" y="180" width="27" height="17"/>
          <rect x="56" y="201" width="27" height="15"/>
          <rect x="126" y="201" width="27" height="15"/>

          <!-- SHOULDER PADS -->
          <polygon points="8,144 64,144 60,186 4,194"/>
          <polygon points="190,144 232,144 234,194 188,186"/>

          <!-- NECK -->
          <rect x="108" y="111" width="28" height="35"/>

          <!-- HEAD — tight balaclava wrap, angular polygon, NO circles -->
          <polygon points="80,68 178,68 180,113 78,113"/>

          <!-- HELMET DOME — angular ACH polygon, NOT an ellipse -->
          <polygon points="78,68 82,40 97,16 124,8 152,16 168,40 172,68"/>

          <!-- HELMET BRIM (forward visor, flat top) -->
          <polygon points="64,54 192,54 194,72 62,72"/>

          <!-- NVG MOUNT PLATE -->
          <rect x="106" y="36" width="38" height="16"/>

          <!-- NVG TUBES — angled rectangles, NOT circles -->
          <polygon points="104,48 122,48 124,72 102,72"/>
          <polygon points="128,48 148,48 150,72 126,72"/>

          <!-- HELMET SIDE ARC-RAILS -->
          <rect x="72" y="42" width="11" height="30"/>
          <rect x="151" y="42" width="11" height="30"/>

          <!-- COMMS HEADSET (right side) -->
          <rect x="162" y="52" width="18" height="28"/>
          <rect x="168" y="40" width="8" height="18"/>

          <!-- CHIN STRAP -->
          <rect x="64" y="66" width="14" height="28"/>
          <rect x="156" y="66" width="14" height="28"/>

          <!-- LEFT ARM — down at side, slight forward lean -->
          <polygon points="4,194 60,186 56,260 0,268"/>
          <polygon points="0,260 55,252 51,326 0,332"/>
          <!-- Left glove -->
          <polygon points="0,323 51,317 49,346 0,350"/>

          <!-- RIGHT ARM — raised, elbow bent up, hand at rifle stock area -->
          <!-- Upper arm goes from shoulder up-right -->
          <polygon points="186,186 230,192 226,148 182,142"/>
          <!-- Forearm continues up to hand -->
          <polygon points="180,142 225,146 221,106 177,102"/>
          <!-- Glove / hand gripping stock -->
          <polygon points="175,100 222,102 220,128 173,126"/>

          <!-- ═══════════════════════════════
               RIFLE — left-pointing, almost horizontal, slight rise
               Stock at right shoulder, long barrel to left
          ═══════════════════════════════ -->

          <!-- STOCK (at right shoulder) -->
          <polygon points="216,114 258,120 256,138 214,132"/>

          <!-- RECEIVER BODY -->
          <polygon points="170,116 220,112 218,134 168,134"/>

          <!-- CARRYING HANDLE / TOP RAIL -->
          <rect x="172" y="104" width="48" height="14"/>

          <!-- SCOPE BODY -->
          <rect x="175" y="100" width="44" height="16"/>
          <!-- Scope front lens shroud -->
          <rect x="173" y="101" width="8" height="14"/>
          <!-- Scope rear lens shroud -->
          <rect x="210" y="101" width="8" height="14"/>

          <!-- BARREL (long, left-pointing) -->
          <polygon points="24,122 174,116 174,128 24,128"/>

          <!-- MUZZLE BRAKE / COMPENSATOR -->
          <polygon points="10,120 28,120 28,130 10,130"/>
          <rect x="14" y="116" width="8" height="6"/>

          <!-- MAGAZINE (hangs below receiver) -->
          <polygon points="180,134 200,134 198,174 178,174"/>

          <!-- PISTOL GRIP (trigger guard area) -->
          <polygon points="196,134 214,134 212,162 194,162"/>

          <!-- RAIL UNDERSIDE / HANDGUARD -->
          <rect x="88" y="128" width="84" height="7"/>

          <!-- VERTICAL FORE-GRIP (below barrel, tactical) -->
          <polygon points="52,128 68,128 66,150 50,150"/>

          <!-- GAS BLOCK / SIGHT (small bump on barrel) -->
          <rect x="130" y="118" width="12" height="8"/>

        </g>

        <!-- ── S1 ELITE BADGE — ON CHEST (gold, outside filter so it stays gold) ── -->
        <rect x="82" y="222" width="60" height="22" rx="1"
          fill="rgba(240,192,64,0.10)" stroke="#F0C040" stroke-width="0.9" opacity="0.88"/>
        <text x="112" y="237"
          font-family="'Bebas Neue',Arial,sans-serif"
          font-size="11" fill="#F0C040" text-anchor="middle" letter-spacing="2">S1 ELITE</text>

        <!-- RADIO ANTENNA (thin wire on helmet) -->
        <line x1="170" y1="52" x2="188" y2="10"
          stroke="#1C2018" stroke-width="2"/>

      </svg>
    `;
  }

  /* ─── Play screen ─── */

  _renderPlay() {
    this._removeSubScreen();
    if (this._layoutEl._onEnter) { window.removeEventListener('keydown', this._layoutEl._onEnter); }

    const screen = document.createElement('div');
    screen.className = 'mm-screen';
    screen.id = 'mm-subscreen';
    screen.innerHTML = `
      <button class="mm-back-btn" id="mm-back">◂ BACK</button>
      <div class="mm-screen-title">SELECT MODE</div>
      <div class="mm-screen-line"></div>
      <div class="mm-mode-grid">
        ${[['🎮','SOLO','1 player','solo'],['👥','DUO','2 players','duo'],['⚔','SQUAD','4 players','squad']].map(([icon,label,sub,val]) => `
          <div class="mm-mode-card${this._selectedMode===val?' selected':''}" data-mode="${val}">
            <div class="mm-mode-icon">${icon}</div>
            <div class="mm-mode-label">${label}</div>
            <div class="mm-mode-sub">${sub}</div>
          </div>
        `).join('')}
      </div>
      <div class="mm-region-row">
        ${['NA-EAST','NA-WEST','EU','ASIA','OCE'].map(r => `
          <button class="mm-region-btn${this._selectedRegion===r?' selected':''}" data-region="${r}">${r}</button>
        `).join('')}
      </div>
      <button class="mm-queue-btn" id="mm-queue-start">FIND MATCH</button>
    `;
    this._root.appendChild(screen);

    screen.querySelectorAll('.mm-mode-card').forEach(c => {
      c.addEventListener('click', () => {
        this._playClick();
        this._selectedMode = c.dataset.mode;
        screen.querySelectorAll('.mm-mode-card').forEach(x => x.classList.toggle('selected', x.dataset.mode === this._selectedMode));
      });
    });
    screen.querySelectorAll('.mm-region-btn').forEach(b => {
      b.addEventListener('click', () => {
        this._playClick();
        this._selectedRegion = b.dataset.region;
        screen.querySelectorAll('.mm-region-btn').forEach(x => x.classList.toggle('selected', x.dataset.region === this._selectedRegion));
      });
    });
    screen.querySelector('#mm-back').addEventListener('click', () => { this._playClick(); this._renderMain(); });
    screen.querySelector('#mm-queue-start').addEventListener('click', () => {
      this._playClick();
      this._startMatchmaking();
    });
  }

  _startMatchmaking() {
    this._removeSubScreen();
    const screen = document.createElement('div');
    screen.className = 'mm-screen';
    screen.id = 'mm-subscreen';
    screen.innerHTML = `
      <button class="mm-back-btn" id="mm-back">◂ CANCEL</button>
      <div class="mm-screen-title">SEARCHING…</div>
      <div class="mm-screen-line"></div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:12px;color:#5A5550;letter-spacing:0.2em;margin-bottom:24px;">
        MODE: ${this._selectedMode.toUpperCase()} &nbsp;·&nbsp; REGION: ${this._selectedRegion}
      </div>
      <div id="mm-queue-pulse" style="
        width:80px;height:80px;border-radius:50%;
        border:2px solid rgba(255,107,26,0.4);
        display:flex;align-items:center;justify-content:center;
        animation:mm-queue-ring 1.5s ease-in-out infinite;
        margin-bottom:24px;
      ">
        <div style="width:50px;height:50px;border-radius:50%;background:rgba(255,107,26,0.12);
          border:2px solid #FF6B1A;display:flex;align-items:center;justify-content:center;
          font-family:'Bebas Neue',sans-serif;font-size:14px;color:#FF6B1A;letter-spacing:0.1em;">
          QUEUE
        </div>
      </div>
      <style>@keyframes mm-queue-ring{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.2);opacity:0.5}}</style>
      <div id="mm-queue-time" style="font-family:'Share Tech Mono',monospace;font-size:11px;color:#5A5550;letter-spacing:0.25em;">
        ESTIMATED: 0:00
      </div>
    `;
    this._root.appendChild(screen);
    screen.querySelector('#mm-back').addEventListener('click', () => {
      this._playClick();
      this.network?.leaveQueue?.();
      this._renderPlay();
    });

    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed++;
      const queueEl = document.getElementById('mm-queue-time');
      if (queueEl) queueEl.textContent = `SEARCHING: ${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
    }, 1000);
    screen._queueTimer = timer;

    this.network?.joinQueue?.(this._selectedMode, this._selectedRegion);

    if (this.network) {
      const offMatched = this.network.on('mm:matched', (data) => {
        clearInterval(timer);
        offMatched?.();
        this._onPlayCb?.(data);
      });
    }
  }

  /* ─── Stats screen ─── */

  _renderStats() {
    this._removeSubScreen();
    const screen = document.createElement('div');
    screen.className = 'mm-screen';
    screen.id = 'mm-subscreen';
    const stats = [
      ['248','MATCHES'],['47','WINS'],['2.4','K/D RATIO'],
      ['4,812','TOTAL KILLS'],['#12,443','GLOBAL RANK'],['68%','TOP 10 RATE'],
    ];
    screen.innerHTML = `
      <button class="mm-back-btn" id="mm-back">◂ BACK</button>
      <div class="mm-screen-title">STATISTICS</div>
      <div class="mm-screen-line"></div>
      <div class="mm-stats-grid-full">
        ${stats.map(([v,l],i) => `
          <div class="mm-stat-card" style="animation:mm-screenfade 0.3s ${i*0.06}s ease both;opacity:0;">
            <div class="mm-stat-card-val${i<2?' highlight':''}">${v}</div>
            <div class="mm-stat-card-label">${l}</div>
          </div>
        `).join('')}
      </div>
    `;
    this._root.appendChild(screen);
    screen.querySelector('#mm-back').addEventListener('click', () => { this._playClick(); this._renderMain(); });
  }

  /* ─── Settings screen ─── */

  _renderSettings() {
    this._removeSubScreen();
    const screen = document.createElement('div');
    screen.className = 'mm-screen';
    screen.id = 'mm-subscreen';
    screen.innerHTML = `
      <button class="mm-back-btn" id="mm-back">◂ BACK</button>
      <div class="mm-screen-title">SETTINGS</div>
      <div class="mm-screen-line"></div>
      <div class="mm-settings-groups">
        <div class="mm-settings-group">
          <div class="mm-settings-group-title">◈ GRAPHICS</div>
          ${[['QUALITY','select'],['RENDER DISTANCE','slider'],['SHADOWS','toggle'],['MOTION BLUR','toggle'],['FOV','slider']].map(([l,t]) => this._settingRow(l,t)).join('')}
        </div>
        <div class="mm-settings-group">
          <div class="mm-settings-group-title">◈ AUDIO</div>
          ${[['MASTER VOLUME','slider'],['MUSIC VOLUME','slider'],['SFX VOLUME','slider'],['VOICE CHAT','toggle'],['SUBTITLES','toggle']].map(([l,t]) => this._settingRow(l,t)).join('')}
        </div>
        <div class="mm-settings-group">
          <div class="mm-settings-group-title">◈ CONTROLS</div>
          ${[['SENSITIVITY','slider'],['AIM ASSIST','toggle'],['INVERT Y','toggle'],['SPRINT TOGGLE','toggle'],['CROUCH TOGGLE','toggle']].map(([l,t]) => this._settingRow(l,t)).join('')}
        </div>
      </div>
    `;
    this._root.appendChild(screen);
    screen.querySelector('#mm-back').addEventListener('click', () => {
      this._playClick();
      const s = {};
      screen.querySelectorAll('[data-key]').forEach(el => {
        s[el.dataset.key] = el.type==='range' ? +el.value : el.classList.contains('on');
      });
      window.dispatchEvent(new CustomEvent('settings:changed', { detail: s }));
      this._renderMain();
    });
    screen.querySelectorAll('.mm-toggle').forEach(t => {
      t.addEventListener('click', () => t.classList.toggle('on'));
    });
  }

  _settingRow(label, type) {
    const key = label.toLowerCase().replace(/\s+/g,'_');
    if (type === 'slider') return `
      <div class="mm-setting-row">
        <label class="mm-setting-label">${label}</label>
        <input type="range" class="mm-slider" data-key="${key}" min="0" max="100" value="70">
      </div>`;
    if (type === 'toggle') return `
      <div class="mm-setting-row">
        <label class="mm-setting-label">${label}</label>
        <div class="mm-toggle on" data-key="${key}"></div>
      </div>`;
    return `
      <div class="mm-setting-row">
        <label class="mm-setting-label">${label}</label>
        <select class="mm-slider" data-key="${key}" style="width:100px;background:#0E1218;color:#8A8078;border:1px solid rgba(255,107,26,0.25);padding:3px;">
          <option>HIGH</option><option>MEDIUM</option><option>LOW</option>
        </select>
      </div>`;
  }

  _removeSubScreen() {
    const old = document.getElementById('mm-subscreen');
    if (old) {
      if (old._queueTimer) clearInterval(old._queueTimer);
      old.remove();
    }
  }

  /* ─── Canvas background ─── */

  _initParticles() {
    this._particles = [];
    for (let i = 0; i < 200; i++) {
      this._particles.push({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0003,
        vy: -(0.0002 + Math.random() * 0.0008),
        size: 0.8 + Math.random() * 2.2,
        alpha: 0.2 + Math.random() * 0.7,
        life: Math.random(),
      });
    }
    // Init light rays
    this._lightRays = Array.from({ length: 6 }, (_, i) => ({
      angle: (Math.PI * 0.55) + (i - 3) * 0.06,
      width: 0.015 + Math.random() * 0.02,
      alpha: 0.03 + Math.random() * 0.05,
    }));
  }

  _startCanvas() {
    if (this._animId) return;
    const resize = () => {
      this._canvas.width  = window.innerWidth;
      this._canvas.height = window.innerHeight;
    };
    resize();
    this._resizeHandler = resize;
    window.addEventListener('resize', resize);
    this._lastTs = 0;
    const loop = (ts) => {
      const dt = Math.min(0.05, (ts - this._lastTs) / 1000);
      this._lastTs = ts;
      this._drawBg(dt);
      this._animId = requestAnimationFrame(loop);
    };
    this._animId = requestAnimationFrame(loop);
  }

  _stopCanvas() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    if (this._resizeHandler) { window.removeEventListener('resize', this._resizeHandler); }
  }

  _drawBg(dt) {
    const cvs = this._canvas;
    const ctx = cvs.getContext('2d');
    const W = cvs.width, H = cvs.height;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0,   '#060809');
    sky.addColorStop(0.4, '#080C10');
    sky.addColorStop(0.7, '#0D1218');
    sky.addColorStop(1,   '#141820');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Volumetric light rays from horizon
    const horizonY = H * 0.62;
    const rayOriginX = W * 0.5;
    ctx.save();
    for (const ray of this._lightRays) {
      const endX = rayOriginX + Math.tan(ray.angle - Math.PI / 2) * (H - horizonY);
      const grd = ctx.createLinearGradient(rayOriginX, horizonY, endX, H * 0.05);
      grd.addColorStop(0, `rgba(255,107,26,${ray.alpha})`);
      grd.addColorStop(1, 'rgba(255,107,26,0)');
      ctx.beginPath();
      const hw = Math.tan(ray.width) * (H - horizonY);
      ctx.moveTo(rayOriginX, horizonY);
      ctx.lineTo(endX - hw, 0);
      ctx.lineTo(endX + hw, 0);
      ctx.closePath();
      ctx.fillStyle = grd;
      ctx.fill();
    }
    ctx.restore();

    // Horizon glow
    const hGlow = ctx.createRadialGradient(W * 0.5, horizonY, 0, W * 0.5, horizonY, W * 0.55);
    hGlow.addColorStop(0,   'rgba(255,107,26,0.14)');
    hGlow.addColorStop(0.4, 'rgba(255,80,10,0.06)');
    hGlow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = hGlow;
    ctx.fillRect(0, 0, W, H);

    // Distant building ruins silhouette — deterministic so no flicker on redraw
    // [x, y, w, h, notchSeeds[], windowLit[]]
    const RUINS = [
      { x:0.04, y:0.575, w:0.044, h:0.125, notches:[[0.05,0.25],[0.45,0.18],[0.7,0.30]], wlit:[0,2] },
      { x:0.09, y:0.598, w:0.022, h:0.072, notches:[[0.2,0.22],[0.6,0.28]],              wlit:[] },
      { x:0.115,y:0.558, w:0.034, h:0.112, notches:[[0.1,0.20],[0.55,0.25],[0.8,0.18]],  wlit:[1] },
      { x:0.155,y:0.588, w:0.026, h:0.082, notches:[[0.3,0.22]],                          wlit:[0] },
      { x:0.19, y:0.548, w:0.044, h:0.130, notches:[[0.05,0.28],[0.5,0.20],[0.75,0.26]], wlit:[2] },
      { x:0.245,y:0.570, w:0.022, h:0.095, notches:[[0.2,0.25],[0.65,0.22]],              wlit:[] },
      { x:0.70, y:0.548, w:0.050, h:0.135, notches:[[0.1,0.26],[0.45,0.18],[0.72,0.30]], wlit:[0,1] },
      { x:0.758,y:0.588, w:0.030, h:0.082, notches:[[0.3,0.24]],                          wlit:[1] },
      { x:0.798,y:0.548, w:0.042, h:0.122, notches:[[0.08,0.20],[0.5,0.26],[0.78,0.22]], wlit:[2] },
      { x:0.848,y:0.572, w:0.026, h:0.090, notches:[[0.2,0.28],[0.6,0.22]],              wlit:[] },
      { x:0.882,y:0.558, w:0.036, h:0.112, notches:[[0.15,0.24],[0.55,0.20]],             wlit:[0] },
      { x:0.926,y:0.592, w:0.022, h:0.068, notches:[[0.3,0.22]],                          wlit:[1] },
    ];

    for (const b of RUINS) {
      const bx = b.x*W, by = b.y*H, bw = b.w*W, bh = b.h*H;

      // Main building body
      ctx.fillStyle = '#050707';
      ctx.fillRect(bx, by, bw, bh);

      // Notched / destroyed top edge
      ctx.fillStyle = '#060809';
      for (const [ns, nw] of b.notches) {
        ctx.fillRect(bx + ns*bw, by, nw*bw, bh*0.28 + nw*bh*0.6);
      }

      // Diagonal crack on wall (thin dark line)
      ctx.strokeStyle = '#060809';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + bw*0.35, by + bh*0.2);
      ctx.lineTo(bx + bw*0.55, by + bh*0.65);
      ctx.stroke();

      // Windows — 3 columns, 2 rows of window grid
      const cols = 3, rows = 2;
      const ww = bw * 0.14, wh = bh * 0.14;
      const wGapX = (bw - cols*ww) / (cols + 1);
      const wGapY = bh * 0.15;
      const wStartY = by + bh * 0.32;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const wx = bx + wGapX*(col+1) + col*ww;
          const wy = wStartY + row*(wh + wGapY);
          const idx = row*cols + col;
          const isLit = b.wlit.includes(idx);
          const isBroken = (idx % 4 === 2); // some windows broken

          // Window frame (slightly lighter dark)
          ctx.fillStyle = '#080A0A';
          ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);

          // Window interior
          if (isLit) {
            // Warm orange glow — fire inside
            ctx.fillStyle = 'rgba(255,100,20,0.12)';
          } else if (isBroken) {
            // Dark void / broken out
            ctx.fillStyle = '#020304';
          } else {
            // Dark glass
            ctx.fillStyle = '#040608';
          }
          ctx.fillRect(wx, wy, ww, wh);

          if (isLit) {
            // Inner glow core
            ctx.fillStyle = 'rgba(255,140,40,0.08)';
            ctx.fillRect(wx + ww*0.2, wy + wh*0.2, ww*0.6, wh*0.6);
          }

          if (isBroken) {
            // Jagged broken glass line across window
            ctx.strokeStyle = '#060809';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(wx, wy + wh*0.3);
            ctx.lineTo(wx + ww*0.4, wy + wh*0.7);
            ctx.lineTo(wx + ww, wy + wh*0.1);
            ctx.stroke();
          }
        }
      }
    }

    // Tactical grid
    ctx.save();
    ctx.strokeStyle = 'rgba(255,107,26,0.025)';
    ctx.lineWidth = 0.5;
    const gSize = 60;
    for (let gx = 0; gx < W; gx += gSize) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += gSize) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.restore();

    // Terrain silhouette
    ctx.fillStyle = '#030505';
    ctx.beginPath();
    ctx.moveTo(0, H);
    const pts = [
      [0,0.72],[0.05,0.70],[0.10,0.73],[0.15,0.68],[0.20,0.71],[0.25,0.67],
      [0.30,0.70],[0.35,0.65],[0.40,0.69],[0.45,0.63],[0.50,0.67],
      [0.55,0.64],[0.60,0.68],[0.65,0.62],[0.70,0.66],[0.75,0.70],
      [0.80,0.67],[0.85,0.71],[0.90,0.68],[0.95,0.72],[1.0,0.70],
    ];
    for (const [px, py] of pts) ctx.lineTo(px * W, py * H);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // Muzzle flash bursts
    this._muzzleTimer -= dt;
    if (this._muzzleTimer <= 0) {
      this._muzzleTimer = 3 + Math.random() * 5;
      const flashX = (0.05 + Math.random() * 0.85) * W;
      const flashY = (0.55 + Math.random() * 0.12) * H;
      this._muzzleFlashes.push({ x: flashX, y: flashY, life: 1, maxLife: 0.12 + Math.random() * 0.1 });
    }
    for (let i = this._muzzleFlashes.length - 1; i >= 0; i--) {
      const fl = this._muzzleFlashes[i];
      fl.life -= dt / fl.maxLife;
      if (fl.life <= 0) { this._muzzleFlashes.splice(i, 1); continue; }
      const a = Math.pow(fl.life, 0.5) * 0.9;
      const r = (1 - fl.life) * 30 + 5;
      const fg = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, r);
      fg.addColorStop(0, `rgba(255,255,220,${a})`);
      fg.addColorStop(0.3, `rgba(255,180,80,${a*0.6})`);
      fg.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Helicopter silhouette
    this._helicopterTimer -= dt;
    if (this._helicopterX === null && this._helicopterTimer <= 0) {
      this._helicopterX = -0.15;
      this._helicopterTimer = 20 + Math.random() * 10;
    }
    if (this._helicopterX !== null) {
      this._helicopterX += dt * 0.04;
      const hx = this._helicopterX * W;
      const hy = H * 0.22;
      ctx.save();
      ctx.fillStyle = '#0A0C0A';
      // Body
      ctx.beginPath();
      ctx.ellipse(hx, hy, 32, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tail
      ctx.beginPath();
      ctx.moveTo(hx + 32, hy);
      ctx.lineTo(hx + 70, hy - 4);
      ctx.lineTo(hx + 70, hy + 2);
      ctx.lineTo(hx + 32, hy + 4);
      ctx.closePath();
      ctx.fill();
      // Skids
      ctx.fillRect(hx - 22, hy + 10, 20, 3);
      ctx.fillRect(hx + 4, hy + 10, 20, 3);
      ctx.fillRect(hx - 16, hy + 6, 3, 5);
      ctx.fillRect(hx + 14, hy + 6, 3, 5);
      // Rotor blur
      ctx.save();
      ctx.strokeStyle = 'rgba(30,40,30,0.6)';
      ctx.lineWidth = 2;
      for (let r = 0; r < 4; r++) {
        const ang = (Date.now() / 80 + r * Math.PI / 2) % (Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(ang) * 44, hy - 10 + Math.sin(ang) * 4);
        ctx.lineTo(hx - Math.cos(ang) * 44, hy - 10 - Math.sin(ang) * 4);
        ctx.stroke();
      }
      ctx.restore();
      // Tail rotor
      ctx.save();
      ctx.strokeStyle = 'rgba(30,40,30,0.5)';
      ctx.lineWidth = 1.5;
      const tang = (Date.now() / 50) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(hx + 70, hy - 4 + Math.cos(tang) * 8);
      ctx.lineTo(hx + 70, hy - 4 - Math.cos(tang) * 8);
      ctx.stroke();
      ctx.restore();
      // Nav light
      ctx.fillStyle = `rgba(255,50,50,${0.5 + 0.5 * Math.sin(Date.now() / 400)})`;
      ctx.beginPath(); ctx.arc(hx - 30, hy, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (this._helicopterX > 1.15) this._helicopterX = null;
    }

    // Fog layers
    const fogTime = Date.now() / 1000;
    for (let f = 0; f < 3; f++) {
      const fogX = ((fogTime * 0.008 * (f + 1) * 0.6 + f * 0.33) % 1.5 - 0.25) * W;
      const fogGrd = ctx.createLinearGradient(fogX, H * 0.5, fogX + W * 0.6, H * 0.9);
      fogGrd.addColorStop(0, 'rgba(10,14,18,0)');
      fogGrd.addColorStop(0.3, `rgba(10,14,18,${0.06 - f * 0.015})`);
      fogGrd.addColorStop(0.7, `rgba(10,14,18,${0.06 - f * 0.015})`);
      fogGrd.addColorStop(1, 'rgba(10,14,18,0)');
      ctx.fillStyle = fogGrd;
      ctx.fillRect(fogX, H * 0.5, W * 0.6, H * 0.5);
    }

    // Ember particles
    for (const p of this._particles) {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.life += dt * 0.4;
      if (p.life >= 1) {
        p.life = 0;
        p.x = Math.random();
        p.y = 0.9 + Math.random() * 0.15;
        p.vy = -(0.0002 + Math.random() * 0.0008);
        p.vx = (Math.random() - 0.5) * 0.0003;
      }
      const fade = p.life < 0.15 ? p.life / 0.15 : p.life > 0.7 ? (1 - p.life) / 0.3 : 1;
      const hue = 20 + Math.random() * 15;
      ctx.fillStyle = `hsla(${hue},100%,60%,${p.alpha * fade * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ─── Clock & coord tick ─── */

  _startClock() {
    const tick = () => {
      const el = document.getElementById('mm-utctime');
      if (el) {
        const n = new Date();
        el.textContent = `UTC ${String(n.getUTCHours()).padStart(2,'0')}:${String(n.getUTCMinutes()).padStart(2,'0')}:${String(n.getUTCSeconds()).padStart(2,'0')}`;
      }
    };
    tick();
    this._clockInterval = setInterval(tick, 1000);
  }

  _startCoordTick() {
    let lat = 47.2, lon = 89.1;
    this._coordId = setInterval(() => {
      lat += (Math.random() - 0.5) * 0.02;
      lon += (Math.random() - 0.5) * 0.02;
      const el = document.getElementById('mm-coord');
      if (el) el.textContent = `GRID: ${lat.toFixed(1)}°N  ${lon.toFixed(1)}°E`;
    }, 2200);
  }

  _stopCoordTick() {
    if (this._coordId) { clearInterval(this._coordId); this._coordId = null; }
  }

  /* ─── Web Audio sounds ─── */

  _getAudio() {
    if (!this._audioCtx) {
      try { this._audioCtx = new (window.AudioContext || /** @type {any} */(window).webkitAudioContext)(); } catch (_) {}
    }
    return this._audioCtx;
  }

  _playBoom() {
    const ctx = this._getAudio();
    if (!ctx) return;
    try {
      // Sub-bass boom
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1.4);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 2.0);

      // High transient crack
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const src = ctx.createBufferSource();
      const g2 = ctx.createGain();
      src.buffer = buf;
      g2.gain.setValueAtTime(0.35, ctx.currentTime);
      src.connect(g2); g2.connect(ctx.destination);
      src.start(ctx.currentTime + 0.01);
    } catch (_) {}
  }

  _playHover() {
    const ctx = this._getAudio();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.06);
    } catch (_) {}
  }

  _playClick() {
    const ctx = this._getAudio();
    if (!ctx) return;
    try {
      // Low thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);

      // Reverb tail (noise burst)
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2) * 0.08;
      const src = ctx.createBufferSource();
      const g2 = ctx.createGain();
      src.buffer = buf;
      g2.gain.setValueAtTime(0.12, ctx.currentTime + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      src.connect(g2); g2.connect(ctx.destination);
      src.start(ctx.currentTime + 0.04);
    } catch (_) {}
  }

  /* ─── Helpers ─── */

  _q(sel) { return this._root.querySelector(sel); }
}
