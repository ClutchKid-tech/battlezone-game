/**
 * Lobby — squad waiting room screen shown between matchmaking success and match start.
 * Shows: squad members, ready status, mode, region, countdown.
 */

export default class Lobby {
  constructor(api) {
    this.api    = api;
    this._root  = null;
    this._data  = null;
    this._onBack = null;
  }

  show(matchData, localUserId) {
    this._data  = matchData;
    this._local = localUserId;
    if (!this._root) this._buildDOM();
    this._root.style.display = 'flex';
    this._renderState();

    // Countdown
    if (matchData.countdown) {
      this._startCountdown(matchData.countdown);
    }
  }

  hide() { this._root && (this._root.style.display = 'none'); }

  _buildDOM() {
    this._root = document.createElement('div');
    this._root.style.cssText = `
      position:fixed;inset:0;background:linear-gradient(135deg,#0a0a1a,#0d1a2e);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      z-index:800;font-family:'Segoe UI',sans-serif;color:#fff;
    `;
    document.body.appendChild(this._root);
  }

  _renderState() {
    if (!this._root || !this._data) return;
    const d = this._data;

    const squads = d.squads || [];
    const squadsHTML = squads.map(squad => `
      <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
           border-radius:12px;padding:16px;min-width:200px;">
        <div style="font-size:11px;opacity:0.5;margin-bottom:12px;text-transform:uppercase;letter-spacing:2px;">Squad</div>
        ${squad.members.map(m => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="width:32px;height:32px;border-radius:50%;
                 background:${m.id === this._local ? '#4af' : '#888'};
                 display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">
              ${m.username[0].toUpperCase()}
            </div>
            <div>
              <div style="font-size:14px;font-weight:${m.id === this._local ? '700' : '400'};">
                ${m.username}${m.id === this._local ? ' (You)' : ''}
              </div>
              <div style="font-size:11px;color:${m.ready ? '#4f4' : '#f84'};">
                ${m.ready ? '✓ Ready' : '⌛ Waiting'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    this._root.innerHTML = `
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:32px;font-weight:700;margin-bottom:6px;">MATCH FOUND</div>
        <div style="font-size:14px;opacity:0.6;">Mode: <b>${(d.mode || 'solo').toUpperCase()}</b> · Region: <b>${(d.region || 'NA').toUpperCase()}</b></div>
      </div>

      <div id="lobby-countdown" style="font-size:56px;font-weight:900;color:#4af;margin-bottom:28px;min-height:72px;">
        ${d.countdown || ''}
      </div>

      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-bottom:32px;">
        ${squads.length > 0 ? squadsHTML : `
          <div style="opacity:0.5;font-size:14px;">Waiting for players (${d.playerCount || 0} / ${d.maxPlayers || 100})…</div>
        `}
      </div>

      <div style="font-size:13px;opacity:0.5;">Game starts automatically when the countdown reaches zero</div>
      <button id="lobby-leave" style="
        margin-top:24px;background:rgba(255,80,80,0.15);border:1px solid rgba(255,80,80,0.4);
        color:#f88;padding:8px 22px;border-radius:6px;cursor:pointer;font-size:13px;
      ">Leave Queue</button>
    `;

    this._root.querySelector('#lobby-leave').addEventListener('click', () => {
      clearInterval(this._countdownTimer);
      this._onBack?.();
    });
  }

  _startCountdown(seconds) {
    let remaining = seconds;
    clearInterval(this._countdownTimer);
    this._countdownTimer = setInterval(() => {
      remaining--;
      const el = this._root?.querySelector('#lobby-countdown');
      if (el) el.textContent = remaining > 0 ? remaining : '';
      if (remaining <= 0) clearInterval(this._countdownTimer);
    }, 1000);
  }

  updateCountdown(seconds) {
    const el = this._root?.querySelector('#lobby-countdown');
    if (el) el.textContent = seconds;
  }

  onBack(fn) { this._onBack = fn; }

  dispose() {
    clearInterval(this._countdownTimer);
    this._root?.remove();
  }
}
