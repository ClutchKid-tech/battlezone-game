/**
 * InputManager — keyboard, mouse, and gamepad input with rebindable keys.
 * Emits a clean action state every frame (no raw event handling in game code).
 */

const DEFAULT_BINDINGS = {
  moveForward:    'KeyW',
  moveBackward:   'KeyS',
  strafeLeft:     'KeyA',
  strafeRight:    'KeyD',
  jump:           'Space',
  crouch:         'KeyC',
  prone:          'KeyZ',
  sprint:         'ShiftLeft',
  reload:         'KeyR',
  interact:       'KeyF',
  slot1:          'Digit1',
  slot2:          'Digit2',
  slot3:          'Digit3',
  slot4:          'Digit4',
  nextWeapon:     'WheelUp',     // virtual — mapped from wheel event
  prevWeapon:     'WheelDown',
  throwable:      'KeyG',
  useItem:        'KeyH',
  vehicleEnter:   'KeyF',
  vehicleExit:    'KeyF',
  map:            'KeyM',
  inventory:      'Tab',
  toggleCamera:   'KeyV',
  pushToTalk:     'CapsLock',
  ping:           'MiddleMouseButton',
  fire:           'MouseLeft',
  ads:            'MouseRight',
  chat:           'Enter',
  scoreboard:     'Tab',
};

export default class InputManager {
  constructor() {
    // Load saved bindings from localStorage
    const saved = localStorage.getItem('keybindings');
    this.bindings = saved ? { ...DEFAULT_BINDINGS, ...JSON.parse(saved) } : { ...DEFAULT_BINDINGS };

    // Current frame action states
    this.state = {
      moveForward: false, moveBackward: false,
      strafeLeft:  false, strafeRight:  false,
      jump:        false, crouch: false, prone: false,
      sprint:      false, reload: false, interact: false,
      slot1: false, slot2: false, slot3: false, slot4: false,
      nextWeapon: false, prevWeapon: false,
      throwable: false, useItem: false,
      vehicleEnter: false, vehicleExit: false,
      map: false, inventory: false,
      toggleCamera: false,
      pushToTalk: false,
      ping: false,
      fire: false, ads: false,
      chat: false, scoreboard: false,
    };

    // Raw just-pressed set (cleared after 1 frame)
    this._justPressed  = new Set();
    this._justReleased = new Set();

    // Mouse
    this.mouseDeltaX    = 0;
    this.mouseDeltaY    = 0;
    this._rawMouseDX    = 0;
    this._rawMouseDY    = 0;
    this._pointerLocked = false;

    // Scroll
    this._wheelDelta = 0;

    // Pressed keys set (by code)
    this._pressed = new Set();

    // Action → code reverse map (built once)
    this._codeToAction = {};
    this._rebuildCodeMap();

    this._bindEvents();
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Event binding
  // ─────────────────────────────────────────────────────────────────────

  _bindEvents() {
    this._onKeyDown   = (e) => this._handleKeyDown(e);
    this._onKeyUp     = (e) => this._handleKeyUp(e);
    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onMouseDown = (e) => this._handleMouseDown(e);
    this._onMouseUp   = (e) => this._handleMouseUp(e);
    this._onWheel     = (e) => this._handleWheel(e);
    this._onPLChange  = ()  => this._handlePointerLockChange();

    document.addEventListener('keydown',             this._onKeyDown);
    document.addEventListener('keyup',               this._onKeyUp);
    document.addEventListener('mousemove',           this._onMouseMove);
    document.addEventListener('mousedown',           this._onMouseDown);
    document.addEventListener('mouseup',             this._onMouseUp);
    document.addEventListener('wheel',               this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange',   this._onPLChange);
    document.addEventListener('pointerlockerror',    () => console.warn('[Input] Pointer lock error'));
  }

  requestPointerLock() {
    document.body.requestPointerLock();
  }

  exitPointerLock() {
    document.exitPointerLock();
  }

  _handlePointerLockChange() {
    this._pointerLocked = document.pointerLockElement === document.body;
  }

  _handleKeyDown(e) {
    if (e.repeat) return;
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

    this._pressed.add(e.code);
    const action = this._codeToAction[e.code];
    if (action) {
      this.state[action] = true;
      this._justPressed.add(action);
    }
    // Prevent browser shortcuts (F1-F4 etc) while in-game
    if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
  }

  _handleKeyUp(e) {
    this._pressed.delete(e.code);
    const action = this._codeToAction[e.code];
    if (action) {
      this.state[action] = false;
      this._justReleased.add(action);
    }
  }

  _handleMouseMove(e) {
    if (!this._pointerLocked) return;
    this._rawMouseDX += e.movementX;
    this._rawMouseDY += e.movementY;
  }

  _handleMouseDown(e) {
    if (e.button === 0) { this.state.fire = true;  this._justPressed.add('fire'); }
    if (e.button === 2) { this.state.ads  = true;  this._justPressed.add('ads');  }
    if (e.button === 1) { this.state.ping = true;  this._justPressed.add('ping'); e.preventDefault(); }
  }

  _handleMouseUp(e) {
    if (e.button === 0) { this.state.fire = false; this._justReleased.add('fire'); }
    if (e.button === 2) { this.state.ads  = false; this._justReleased.add('ads');  }
    if (e.button === 1) { this.state.ping = false; }
  }

  _handleWheel(e) {
    this._wheelDelta += e.deltaY;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Per-frame update — call at start of game loop
  // ─────────────────────────────────────────────────────────────────────

  update() {
    // Expose accumulated mouse delta for this frame
    this.mouseDeltaX = this._rawMouseDX;
    this.mouseDeltaY = this._rawMouseDY;
    this._rawMouseDX = 0;
    this._rawMouseDY = 0;

    // Wheel → weapon switch
    if (this._wheelDelta < -10) {
      this.state.nextWeapon = true;
      this._justPressed.add('nextWeapon');
    } else if (this._wheelDelta > 10) {
      this.state.prevWeapon = true;
      this._justPressed.add('prevWeapon');
    }
    this._wheelDelta = 0;
  }

  // Call at end of frame to clear just-pressed / just-released
  flush() {
    for (const action of this._justPressed)  this.state[action] = this._pressed.has(this.bindings[action]);
    this._justPressed.clear();
    this._justReleased.clear();
    this.state.nextWeapon = false;
    this.state.prevWeapon = false;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Query helpers
  // ─────────────────────────────────────────────────────────────────────

  isHeld(action)       { return this.state[action] === true; }
  wasJustPressed(action)  { return this._justPressed.has(action); }
  wasJustReleased(action) { return this._justReleased.has(action); }

  getMoveVector() {
    return {
      x: (this.state.strafeRight ? 1 : 0) - (this.state.strafeLeft  ? 1 : 0),
      z: (this.state.moveBackward ? 1 : 0) - (this.state.moveForward ? 1 : 0),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Rebinding
  // ─────────────────────────────────────────────────────────────────────

  rebind(action, code) {
    // Remove old binding
    for (const [a, c] of Object.entries(this.bindings)) {
      if (c === code && a !== action) delete this._codeToAction[c];
    }
    this.bindings[action] = code;
    this._rebuildCodeMap();
    localStorage.setItem('keybindings', JSON.stringify(this.bindings));
  }

  resetToDefaults() {
    this.bindings = { ...DEFAULT_BINDINGS };
    this._rebuildCodeMap();
    localStorage.removeItem('keybindings');
  }

  _rebuildCodeMap() {
    this._codeToAction = {};
    for (const [action, code] of Object.entries(this.bindings)) {
      if (!code.startsWith('Mouse') && !code.startsWith('Wheel')) {
        this._codeToAction[code] = action;
      }
    }
  }

  dispose() {
    document.removeEventListener('keydown',           this._onKeyDown);
    document.removeEventListener('keyup',             this._onKeyUp);
    document.removeEventListener('mousemove',         this._onMouseMove);
    document.removeEventListener('mousedown',         this._onMouseDown);
    document.removeEventListener('mouseup',           this._onMouseUp);
    document.removeEventListener('wheel',             this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPLChange);
    this.exitPointerLock();
  }
}
