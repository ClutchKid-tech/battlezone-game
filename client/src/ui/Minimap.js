/**
 * Minimap — 2D canvas overlay.
 * Shows: terrain, zone circles, players (team=green, enemy=red), vehicles, self (arrow).
 */

const MAP_SIZE      = 4000;
const DEFAULT_ZOOM  = 0.04;   // pixels per metre at zoom level 1

export default class Minimap {
  constructor() {
    this._canvas  = null;
    this._ctx     = null;
    this._zoom    = DEFAULT_ZOOM;
    this._size    = 180;     // px
    this._squadId = null;

    this._buildDOM();
  }

  _buildDOM() {
    const wrapper  = document.createElement('div');
    wrapper.style.cssText = `
      position:fixed;bottom:20px;right:20px;
      width:${this._size}px;height:${this._size}px;
      border-radius:50%;overflow:hidden;
      border:2px solid rgba(255,255,255,0.5);
      background:#1a2a1a;
      pointer-events:none;z-index:100;
    `;

    this._canvas  = document.createElement('canvas');
    this._canvas.width  = this._size;
    this._canvas.height = this._size;
    this._ctx = this._canvas.getContext('2d');

    wrapper.appendChild(this._canvas);
    document.body.appendChild(wrapper);
    this._wrapper = wrapper;
  }

  setSquadId(id) { this._squadId = id; }

  // ─────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────

  update(selfPosition, selfYaw, players, vehicles, zoneData) {
    const ctx  = this._ctx;
    const size = this._size;
    const half = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = '#1a2a18';
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();

    // Convert world → minimap coords (centred on player)
    const toMM = (wx, wz) => ({
      x: half + (wx - selfPosition.x) * this._zoom,
      y: half + (wz - selfPosition.z) * this._zoom,
    });

    // Zone circles
    if (zoneData) {
      const cCur = toMM(zoneData.currentCenter.x, zoneData.currentCenter.z);
      const rCur = zoneData.currentRadius * this._zoom;
      ctx.strokeStyle = 'rgba(100,150,255,0.8)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(cCur.x, cCur.y, rCur, 0, Math.PI * 2);
      ctx.stroke();

      // Next zone (white dashed)
      if (zoneData.phase === 'shrink') {
        const cNext = toMM(zoneData.nextCenter.x, zoneData.nextCenter.z);
        const rNext = zoneData.nextRadius * this._zoom;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cNext.x, cNext.y, rNext, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Remote players
    for (const p of (players || [])) {
      if (!p.alive) continue;
      const mm = toMM(p.pos.x, p.pos.z);
      const isTeammate = p.squadId && p.squadId === this._squadId;

      ctx.fillStyle = isTeammate ? '#44FF88' : '#FF4444';
      ctx.beginPath();
      ctx.arc(mm.x, mm.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vehicles
    for (const v of (vehicles || [])) {
      const mm = toMM(v.position.x, v.position.z);
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(mm.x - 3, mm.y - 3, 6, 6);
    }

    // Self — rotated arrow
    ctx.save();
    ctx.translate(half, half);
    ctx.rotate(-selfYaw);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();  // unclip

    // Compass bearing
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font      = '9px sans-serif';
    ctx.textAlign = 'center';
    const compass = ['N','E','S','W'];
    const cPos = [
      [half, 10], [size - 10, half], [half, size - 4], [10, half]
    ];
    for (let i = 0; i < 4; i++) {
      ctx.fillText(compass[i], cPos[i][0], cPos[i][1]);
    }
  }

  setZoom(z) { this._zoom = Math.max(0.01, Math.min(0.2, z)); }

  show() { this._wrapper.style.display = ''; }
  hide() { this._wrapper.style.display = 'none'; }

  dispose() { this._wrapper.remove(); }
}
