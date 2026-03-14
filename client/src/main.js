/**
 * main.js — Game entry point and state machine.
 * States: LOGIN → MENU → QUEUE → LOBBY → GAME → END
 */

import Renderer         from './engine/Renderer.js';
import Camera           from './engine/Camera.js';
import InputManager     from './engine/InputManager.js';
import AudioManager     from './engine/AudioManager.js';
import World            from './game/World.js';
import PlayerController from './game/PlayerController.js';
import RemotePlayer     from './game/RemotePlayer.js';
import WeaponSystem     from './game/WeaponSystem.js';
import VehicleController from './game/VehicleController.js';
import LootManager      from './game/LootManager.js';
import ZoneRenderer     from './game/ZoneRenderer.js';
import WeatherSystem    from './game/WeatherSystem.js';
import NetworkManager   from './network/NetworkManager.js';
import VoiceManager     from './network/VoiceManager.js';
import HUD              from './ui/HUD.js';
import MainMenu         from './ui/MainMenu.js';
import Shop             from './ui/Shop.js';
import Minimap          from './ui/Minimap.js';
import Lobby            from './ui/Lobby.js';
import EndScreen        from './ui/EndScreen.js';
import { API }          from './api.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

let canvas, renderer, camera, input, audio;
let world, player, remotePlayers, weapons, vehicles, loot, zone, weather;
let network, voice;
let hud, minimap, shop, lobby, endScreen, mainMenu;
let api;

let gameState = 'login';  // login | menu | queue | lobby | game | end
let localUserId   = null;
let localUsername = null;
let roomId        = null;
let token         = null;
let roomStateData = null;
let animFrameId   = null;
let lastTime      = 0;

async function init() {
  canvas = document.getElementById('game-canvas');

  api     = new API();
  network = new NetworkManager();

  // Auth is handled by the inline script in index.html.
  // Listen for its success event, or pick up a saved session.
  window.addEventListener('auth:success', (e) => {
    const r = e.detail;
    token         = r.access;
    localUserId   = r.userId;
    localUsername = r.username;
    api.setToken(token);
    transitionTo('menu');
  });

  const savedToken = sessionStorage.getItem('token');
  const savedUser  = sessionStorage.getItem('user');
  if (savedToken && savedUser) {
    token         = savedToken;
    const u       = JSON.parse(savedUser);
    localUserId   = u.id;
    localUsername = u.username;
    api.setToken(token);
  }

  // Core 3D systems — wrapped so a WebGL failure doesn't break auth
  try {
    renderer = new Renderer(canvas, loadSetting('quality', 'high'));
    camera   = new Camera(renderer);
  } catch (err) {
    console.warn('[Main] 3D engine failed to start (WebGL unavailable?):', err.message);
  }

  input    = new InputManager();
  audio    = new AudioManager();

  // UI systems
  mainMenu  = new MainMenu(network, api);
  shop      = new Shop(api);
  lobby     = new Lobby(api);
  endScreen = new EndScreen();
  hud       = new HUD();
  minimap   = new Minimap();

  hud.hide();
  minimap.hide();

  // Apply saved settings
  applySettings(loadSettings());
  window.addEventListener('settings:changed', (e) => applySettings(e.detail));

  if (savedToken && savedUser) {
    transitionTo('menu');
  }

  // Wire up main menu callbacks
  mainMenu.onPlay((data) => {
    roomId = data.roomId;
    transitionTo('lobby', data);
  });
  mainMenu.onShop(() => { mainMenu.hide(); shop.show(0); });
  shop.onClose(() => mainMenu.show());
  mainMenu.onLocker(() => { /* locker placeholder — shows inventory */ mainMenu.hide(); window.alert('Locker coming soon!'); mainMenu.show(); });
  lobby.onBack(() => { network.leaveQueue(); transitionTo('menu'); });
  endScreen.onContinue(() => transitionTo('menu'));

  // Network: matched in matchmaking
  network.on('mm:matched', (data) => {
    if (gameState === 'queue') transitionTo('lobby', data);
  });

  // Start render loop
  requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────────────────────────
//  State machine
// ─────────────────────────────────────────────────────────────────────────────

async function transitionTo(state, data = {}) {
  console.log(`[Game] ${gameState} → ${state}`);
  gameState = state;

  switch (state) {
    case 'menu': {
      destroyGameSystems();
      hud.hide();
      minimap.hide();
      lobby.hide();
      endScreen.hide();
      input.exitPointerLock();
      mainMenu.show();
      try { const menuSrc = audio?.playMenuMusic?.(); mainMenu._menuMusicSrc = menuSrc; } catch (_) {}
      break;
    }

    case 'lobby': {
      mainMenu.hide();
      lobby.show(data, localUserId);
      // Connect to game server now — join room before match starts
      network.connect(token, data.roomId);
      network.on('room:start', (d) => {
        lobby.hide();
        transitionTo('game', d);
      });
      network.on('room:countdown', (d) => {
        lobby.updateCountdown(d.seconds);
      });
      break;
    }

    case 'game': {
      lobby.hide();
      await startGame(data);
      break;
    }

    case 'end': {
      stopGame();
      endScreen.show(data, localUserId);
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Game start
// ─────────────────────────────────────────────────────────────────────────────

async function startGame(roomData) {
  roomStateData = roomData;

  // Build world
  const loadingScreen = showLoading();
  world   = new World(renderer, camera);
  await world.build((p) => updateLoading(p));
  hideLoading(loadingScreen);

  // Game systems
  player   = new PlayerController(renderer.scene, world, camera, network, audio);
  weapons  = new WeaponSystem(renderer.scene, camera, audio, network);
  vehicles = new VehicleController(renderer.scene, network, audio, camera);
  loot     = new LootManager(renderer.scene, network, audio);
  zone     = new ZoneRenderer(renderer.scene);
  weather  = new WeatherSystem(renderer.scene, renderer, audio);
  remotePlayers = new Map();   // userId → RemotePlayer

  // Minimap squad ID
  const myData = roomData.players?.find(p => p.id === localUserId);
  if (myData?.squadId) minimap.setSquadId(myData.squadId);

  // Initialise vehicles and loot from room:start data
  if (roomData.vehicles) vehicles.initialise(roomData.vehicles);
  if (roomData.loot)     loot.initialise(roomData.loot);

  // Spawn remote players
  if (roomData.players) {
    for (const p of roomData.players) {
      if (p.id === localUserId) continue;
      const rp = new RemotePlayer(renderer.scene, p);
      rp.setTeamColor(p.squadId === myData?.squadId);
      remotePlayers.set(p.id, rp);
    }
  }

  // Voice chat
  voice = new VoiceManager(audio);
  await voice.connect(token, roomId, localUserId, myData?.squadId || null);

  vehicles.setLocalPlayerId(localUserId);

  // Network event handlers for in-game
  _bindGameNetworkEvents();

  // Camera setup
  renderer.setCamera(camera.camera);
  camera.setCollisionMeshes(world.getCollisionMeshes());

  // HUD
  hud.show();
  minimap.show();

  // Player initial position from server
  if (myData?.pos) {
    player.position.set(myData.pos.x, myData.pos.y, myData.pos.z);
  }

  // Grab pointer lock on first click
  document.addEventListener('click', () => {
    if (gameState === 'game') input.requestPointerLock();
  }, { once: true });

  // Pick a random weather to start
  const weathers = ['clear', 'cloudy', 'rain', 'fog'];
  weather.setWeather(weathers[Math.floor(Math.random() * weathers.length)]);

  console.log('[Game] Match started');
}

function _bindGameNetworkEvents() {
  // World state — update remote players
  network.on('world:state', (data) => {
    // Update remote players from interpolated state
    for (const p of data.players) {
      if (p.id === localUserId) {
        // Reconcile local vitals
        hud.updateVitals(p.hp, p.armor);
        continue;
      }
      let rp = remotePlayers.get(p.id);
      if (!rp && p.alive) {
        rp = new RemotePlayer(renderer.scene, p);
        remotePlayers.set(p.id, rp);
      }
      if (rp) rp.update(p, 1 / 64);
    }
    // Alive count
    hud.updateAliveCount(data.players.filter(p => p.alive).length);
    // Zone
    if (data.zone) {
      zone.update(data.zone, { x: player.position.x, z: player.position.z }, 1 / 64);
    }
  });

  // Player killed
  network.on('player:killed', (d) => {
    hud.addKillFeedEntry({ killerName: d.killerName, victimName: d.victimName, weapon: d.weapon });
    if (d.victimId === localUserId) {
      // local player died
      input.exitPointerLock();
      setTimeout(() => transitionTo('end', { ...roomStateData, endReason: 'killed' }), 3000);
    }
    const rp = remotePlayers.get(d.victimId);
    if (rp) rp.alive = false;
  });

  // Match ended
  network.on('room:end', (d) => {
    transitionTo('end', d.results);
  });

  // Stats update
  network.on('stats:update', (d) => {
    hud.updateVitals(d.health, d.armor);
  });

  // Shot VFX from other players
  network.on('player:shot', (d) => {
    if (d.playerId === localUserId) return;
    audio.playGunshot(d.weaponId, d.origin, false);
  });

  // Inventory
  network.on('inventory:update', (d) => {
    // WeaponSystem reads equipped slot
  });

  // Kill confirmed
  network.on('kill:confirmed', (d) => {
    audio.playKillSound();
    window.dispatchEvent(new CustomEvent('hud:kill', { detail: d }));
  });

  // Voice activity indicators
  window.addEventListener('voice:activity', (e) => {
    const rp = remotePlayers.get(e.detail.userId);
    if (rp) rp.setSpeaking(e.detail.speaking);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Game loop
// ─────────────────────────────────────────────────────────────────────────────

function gameLoop(timestamp) {
  animFrameId = requestAnimationFrame(gameLoop);

  const dt = Math.min(0.05, (timestamp - lastTime) / 1000);   // cap at 50ms
  lastTime  = timestamp;

  if (gameState !== 'game') {
    renderer?.render();
    return;
  }

  // Input
  input.update();

  // Player
  player.update(input, dt);

  // Voice position
  voice?.updatePosition({ x: player.position.x, y: player.position.y, z: player.position.z });

  // PTT
  if (input.wasJustPressed('pushToTalk'))  voice?.startPTT();
  if (input.wasJustReleased('pushToTalk')) voice?.stopPTT();

  // Weapons
  weapons.update(input, player.getVelocity(), dt);

  // Vehicles
  vehicles.update(null, input, localUserId, dt);

  // Loot
  loot.update(player.getPosition(), input, dt);

  // Zone & weather
  weather.update(player.getPosition(), dt);

  // Audio listener
  const lookDir = camera.getLookDirection();
  audio.updateListener(camera.getPosition(), lookDir, { x: 0, y: 1, z: 0 });

  // HUD update
  hud.update(dt);

  // Minimap
  const allPlayers = [...remotePlayers.values()].map(rp => ({
    id: rp.id, alive: rp.alive, squadId: rp.squadId,
    pos: rp.group.position,
  }));
  minimap.update(player.getPosition(), camera.yaw, allPlayers, [], roomStateData?.zone);

  // Flush input (clear just-pressed)
  input.flush();

  // Render
  renderer.render();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function showLoading() {
  const el = document.createElement('div');
  el.id = 'loading-screen';
  el.style.cssText = 'position:fixed;inset:0;background:#0a0a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2000;color:#fff;font-family:sans-serif;';
  el.innerHTML = `
    <div style="font-size:28px;font-weight:700;margin-bottom:20px;">Loading World…</div>
    <div style="width:300px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">
      <div id="loading-bar" style="height:100%;width:0%;background:#4af;transition:width 0.3s;"></div>
    </div>
    <div id="loading-pct" style="margin-top:12px;font-size:14px;opacity:0.6;">0%</div>
  `;
  document.body.appendChild(el);
  return el;
}

function updateLoading(progress) {
  const bar = document.getElementById('loading-bar');
  const pct = document.getElementById('loading-pct');
  if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
  if (pct) pct.textContent = `${Math.round(progress * 100)}%`;
}

function hideLoading(el) {
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 600); }
}

function stopGame() {
  voice?.disconnect();
  input.exitPointerLock();
}

function destroyGameSystems() {
  if (gameState !== 'game') return;
  player?.dispose();
  weapons?.dispose();
  vehicles?.dispose();
  loot?.dispose();
  zone?.dispose();
  weather?.dispose();
  for (const rp of (remotePlayers?.values() || [])) rp.dispose();
  remotePlayers?.clear();
  world?.dispose();
  voice?.disconnect();
  network.disconnect();
}

function applySettings(s) {
  if (s.quality)       renderer?.setQuality(s.quality.toLowerCase());
  if (s.fov)           camera?.setFOV(s.fov);
  if (s.sensitivity)   camera?.setSensitivity(s.sensitivity * 0.0005);
  if (s.masterVolume !== undefined) audio?.setMasterVolume(s.masterVolume / 100);
  if (s.musicVolume   !== undefined) audio?.setMusicVolume(s.musicVolume / 100);
  if (s.sfxVolume     !== undefined) audio?.setSFXVolume(s.sfxVolume / 100);
}

function loadSettings()        { try { return JSON.parse(localStorage.getItem('settings') || '{}'); } catch { return {}; } }
function loadSetting(k, def)   { return loadSettings()[k] ?? def; }

// ─────────────────────────────────────────────────────────────────────────────
//  Kick off
// ─────────────────────────────────────────────────────────────────────────────

init().catch(err => console.error('[Main] Fatal init error:', err));
