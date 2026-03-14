/**
 * EndScreen — post-match results overlay.
 * Shows: placement, kills, damage, survival time, XP earned, per-player stats.
 */

export default class EndScreen {
  constructor() {
    this._root = null;
    this._onContinue = null;
  }

  show(results, localUserId) {
    if (!this._root) this._buildDOM();
    this._root.style.display = 'flex';
    this._render(results, localUserId);
  }

  hide() { this._root && (this._root.style.display = 'none'); }

  _buildDOM() {
    this._root = document.createElement('div');
    this._root.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.85);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      z-index:850;font-family:'Segoe UI',sans-serif;color:#fff;
    `;
    document.body.appendChild(this._root);
  }

  _render(results, localUserId) {
    const local  = results.players.find(p => p.userId === localUserId);
    const winner = results.players.find(p => p.userId === results.winnerId);
    const isWin  = localUserId === results.winnerId;

    const placement  = local?.placement  || 0;
    const kills      = local?.kills       || 0;
    const damage     = local?.damage      || 0;
    const survivalMs = local?.survivalMs  || 0;
    const survMin    = Math.floor(survivalMs / 60000);
    const survSec    = Math.floor((survivalMs % 60000) / 1000).toString().padStart(2, '0');

    // XP calculation (mirrored from server)
    const xp = kills * 100 + (isWin ? 500 : 0) + (placement <= 10 ? 200 : 0) + Math.floor(survivalMs / 1000);

    const headerColor = isWin ? '#FFD700' : placement <= 5 ? '#4af' : '#fff';
    const headerText  = isWin ? '🏆 VICTORY ROYALE' : `#${placement} PLACE`;

    const topPlayers = [...results.players]
      .sort((a, b) => a.placement - b.placement)
      .slice(0, 10);

    this._root.innerHTML = `
      <div style="max-width:700px;width:90%;max-height:90vh;overflow-y:auto;">
        <!-- Header -->
        <div style="text-align:center;margin-bottom:28px;">
          <div style="font-size:42px;font-weight:900;color:${headerColor};
            ${isWin ? 'text-shadow:0 0 20px #FFD700;' : ''}
            animation:fadeInDown 0.4s ease;">
            ${headerText}
          </div>
          ${winner && !isWin ? `<div style="font-size:14px;opacity:0.6;margin-top:4px;">Winner: <b>${winner.username}</b></div>` : ''}
          <div style="font-size:13px;opacity:0.5;margin-top:6px;">
            ${results.mode?.toUpperCase()} · ${_formatDuration(results.duration)}
          </div>
        </div>

        <!-- Your stats -->
        <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);
             border-radius:14px;padding:20px;margin-bottom:20px;">
          <div style="font-size:12px;text-transform:uppercase;opacity:0.5;letter-spacing:2px;margin-bottom:16px;">Your Performance</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;text-align:center;">
            ${this._stat('Kills',     kills)}
            ${this._stat('Damage',    Math.round(damage))}
            ${this._stat('Survived',  `${survMin}:${survSec}`)}
            ${this._stat('XP Earned', `+${xp.toLocaleString()}`)}
          </div>
        </div>

        <!-- Leaderboard -->
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
             border-radius:14px;padding:20px;margin-bottom:24px;">
          <div style="font-size:12px;text-transform:uppercase;opacity:0.5;letter-spacing:2px;margin-bottom:12px;">Top 10</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="opacity:0.5;font-size:11px;text-transform:uppercase;">
                <th style="text-align:left;padding:4px 8px;">#</th>
                <th style="text-align:left;padding:4px 8px;">Player</th>
                <th style="text-align:right;padding:4px 8px;">Kills</th>
                <th style="text-align:right;padding:4px 8px;">Damage</th>
                <th style="text-align:right;padding:4px 8px;">Survived</th>
              </tr>
            </thead>
            <tbody>
              ${topPlayers.map(p => {
                const isMe = p.userId === localUserId;
                const sm = Math.floor(p.survivalMs / 60000);
                const ss = Math.floor((p.survivalMs % 60000) / 1000).toString().padStart(2,'0');
                return `
                  <tr style="border-top:1px solid rgba(255,255,255,0.05);${isMe ? 'background:rgba(68,170,255,0.1);' : ''}">
                    <td style="padding:8px;">${p.placement === 1 ? '🏆' : `#${p.placement}`}</td>
                    <td style="padding:8px;font-weight:${isMe?'700':'400'};">${p.username}${isMe?' (You)':''}</td>
                    <td style="padding:8px;text-align:right;">${p.kills}</td>
                    <td style="padding:8px;text-align:right;">${Math.round(p.damage)}</td>
                    <td style="padding:8px;text-align:right;">${sm}:${ss}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Continue button -->
        <div style="text-align:center;">
          <button id="end-continue" style="
            background:linear-gradient(90deg,#1a5a8a,#2a8aba);border:none;color:#fff;
            font-size:18px;font-weight:700;padding:14px 60px;border-radius:10px;cursor:pointer;
            letter-spacing:2px;
          ">CONTINUE</button>
        </div>
      </div>
    `;

    this._root.querySelector('#end-continue').addEventListener('click', () => {
      this.hide();
      this._onContinue?.();
    });
  }

  _stat(label, value) {
    return `
      <div>
        <div style="font-size:26px;font-weight:700;margin-bottom:4px;">${value}</div>
        <div style="font-size:12px;opacity:0.6;text-transform:uppercase;letter-spacing:1px;">${label}</div>
      </div>
    `;
  }

  onContinue(fn) { this._onContinue = fn; }

  dispose() { this._root?.remove(); }
}

function _formatDuration(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}
