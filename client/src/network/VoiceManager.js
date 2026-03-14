/**
 * VoiceManager — WebRTC peer-to-peer voice chat client.
 * Connects to VoiceServer.js signaling server and manages peer connections.
 * Supports: proximity audio, team channel, PTT, open mic, per-peer volume.
 */

import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Add TURN servers for NAT traversal in production:
  // { urls: 'turn:turn.yourserver.com:3478', username: '...', credential: '...' }
];

export default class VoiceManager {
  constructor(audioManager) {
    this.audioManager = audioManager;
    this._socket      = null;
    this._localStream = null;
    this._peerConns   = new Map();   // peerId → RTCPeerConnection
    this._remoteAudio = new Map();   // peerId → { element, gainNode }
    this._gainNodes   = new Map();   // peerId → GainNode (per-peer volume)

    this._audioCtx    = audioManager.ctx;
    this._outputNode  = audioManager._voiceGain;

    this._ptt         = false;
    this._openMic     = false;
    this._deafened    = false;
    this._muted       = false;
    this._mutedPeers  = new Set();
    this._volumes     = new Map();    // peerId → 0–1

    this._initialized = false;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Connect
  // ─────────────────────────────────────────────────────────────────────

  async connect(token, roomId, userId, squadId) {
    this._userId  = userId;
    this._roomId  = roomId;
    this._squadId = squadId;

    await this._acquireMicrophone();

    this._socket = io(`${SERVER_URL}/voice`, {
      auth:       { token, roomId, userId, squadId },
      transports: ['websocket'],
    });

    this._socket.on('connect',          ()  => console.log('[Voice] Signaling connected'));
    this._socket.on('disconnect',       ()  => console.warn('[Voice] Signaling disconnected'));
    this._socket.on('voice:peers',      (peers) => this._onPeerList(peers));
    this._socket.on('voice:peer_left',  (d) => this._onPeerLeft(d.userId));
    this._socket.on('voice:offer',      (d) => this._onOffer(d));
    this._socket.on('voice:answer',     (d) => this._onAnswer(d));
    this._socket.on('voice:ice_candidate', (d) => this._onICECandidate(d));
    this._socket.on('voice:peer_update',(d) => this._onPeerUpdate(d));
    this._socket.on('voice:activity',   (d) => this._onVoiceActivity(d));
    this._socket.on('voice:speaking',   (d) => this._onSpeaking(d));
  }

  disconnect() {
    for (const [peerId] of this._peerConns) {
      this._closePeer(peerId);
    }
    this._localStream?.getTracks().forEach(t => t.stop());
    this._socket?.disconnect();
    this._initialized = false;
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Microphone
  // ─────────────────────────────────────────────────────────────────────

  async _acquireMicrophone() {
    try {
      this._localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:    true,
          noiseSuppression:    true,
          autoGainControl:     true,
          sampleRate:          48000,
          channelCount:        1,
        },
        video: false,
      });
      this._initialized = true;

      // Start muted — only transmit on PTT or openMic
      this._setMicEnabled(false);
    } catch (err) {
      console.warn('[Voice] Microphone unavailable:', err.message);
      this._initialized = false;
    }
  }

  _setMicEnabled(enabled) {
    if (!this._localStream) return;
    for (const track of this._localStream.getAudioTracks()) {
      track.enabled = enabled && !this._muted;
    }
    this._socket?.emit('voice:activity', { speaking: enabled && !this._muted });
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Controls
  // ─────────────────────────────────────────────────────────────────────

  startPTT() {
    if (this._openMic || this._deafened) return;
    this._ptt = true;
    this._setMicEnabled(true);
    this._socket?.emit('voice:ptt_start');
  }

  stopPTT() {
    this._ptt = false;
    if (!this._openMic) this._setMicEnabled(false);
    this._socket?.emit('voice:ptt_stop');
  }

  toggleOpenMic(active) {
    this._openMic = active;
    this._setMicEnabled(active && !this._ptt);
    this._socket?.emit('voice:mic_toggle', { active });
  }

  setDeafened(deafened) {
    this._deafened = deafened;
    if (deafened) this._setMicEnabled(false);
    else if (this._openMic || this._ptt) this._setMicEnabled(true);
    this._outputNode.gain.value = deafened ? 0 : 1;
    this._socket?.emit('voice:set_deafened', { deafened });
  }

  setMuted(muted) {
    this._muted = muted;
    this._setMicEnabled(!muted && (this._ptt || this._openMic));
  }

  mutePeer(peerId, muted) {
    if (muted) this._mutedPeers.add(peerId);
    else       this._mutedPeers.delete(peerId);

    const gain = this._gainNodes.get(peerId);
    if (gain) gain.gain.value = muted ? 0 : (this._volumes.get(peerId) ?? 1);
    this._socket?.emit('voice:mute_peer', { targetId: peerId, muted });
  }

  setPeerVolume(peerId, volume) {
    const v = Math.max(0, Math.min(1, volume));
    this._volumes.set(peerId, v);
    const gain = this._gainNodes.get(peerId);
    if (gain && !this._mutedPeers.has(peerId)) gain.gain.value = v;
    this._socket?.emit('voice:set_volume', { targetId: peerId, volume: v });
  }

  updatePosition(position) {
    this._socket?.emit('voice:position', position);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Peer management
  // ─────────────────────────────────────────────────────────────────────

  _onPeerList(peers) {
    // We initiate offers to all existing peers
    for (const peer of peers) {
      this._createOffer(peer.userId, peer.squadId === this._squadId ? 'team' : 'proximity');
    }
  }

  _onPeerLeft(peerId) {
    this._closePeer(peerId);
  }

  async _createOffer(peerId, channel) {
    const pc = this._createPeerConnection(peerId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._socket.emit('voice:offer', { to: peerId, offer, channel });
  }

  async _onOffer({ from, offer, channel }) {
    const pc = this._createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this._socket.emit('voice:answer', { to: from, answer });
  }

  async _onAnswer({ from, answer }) {
    const pc = this._peerConns.get(from);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async _onICECandidate({ from, candidate }) {
    const pc = this._peerConns.get(from);
    if (!pc || !candidate) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[Voice] Failed to add ICE candidate:', err.message);
    }
  }

  _createPeerConnection(peerId) {
    if (this._peerConns.has(peerId)) return this._peerConns.get(peerId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this._peerConns.set(peerId, pc);

    // Add local audio tracks
    if (this._localStream) {
      for (const track of this._localStream.getTracks()) {
        pc.addTrack(track, this._localStream);
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this._socket.emit('voice:ice_candidate', { to: peerId, candidate });
      }
    };

    pc.ontrack = ({ streams }) => {
      this._attachRemoteAudio(peerId, streams[0]);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._closePeer(peerId);
      }
    };

    return pc;
  }

  _attachRemoteAudio(peerId, stream) {
    if (this._remoteAudio.has(peerId)) return;

    // Use MediaStreamSource → GainNode → voice output bus
    const source   = this._audioCtx.createMediaStreamSource(stream);
    const gainNode = this._audioCtx.createGain();
    gainNode.gain.value = this._volumes.get(peerId) ?? 1;

    source.connect(gainNode);
    gainNode.connect(this._outputNode);

    this._gainNodes.set(peerId, gainNode);
    this._remoteAudio.set(peerId, { source, gainNode });
  }

  _closePeer(peerId) {
    const pc = this._peerConns.get(peerId);
    if (pc) { pc.close(); this._peerConns.delete(peerId); }

    const audio = this._remoteAudio.get(peerId);
    if (audio) {
      audio.source.disconnect();
      audio.gainNode.disconnect();
      this._remoteAudio.delete(peerId);
    }
    this._gainNodes.delete(peerId);
  }

  // ─────────────────────────────────────────────────────────────────────
  //  Proximity / team updates from server
  // ─────────────────────────────────────────────────────────────────────

  _onPeerUpdate({ proximity, team }) {
    // Update gain nodes based on proximity distance
    for (const p of proximity) {
      const gain = this._gainNodes.get(p.userId);
      if (!gain || this._mutedPeers.has(p.userId) || this._deafened) continue;
      // Volume falls off with distance (linear, server already validated range)
      const maxDist = 50;
      const v = Math.max(0, 1 - p.distance / maxDist);
      gain.gain.linearRampToValueAtTime(
        v * (this._volumes.get(p.userId) ?? 1),
        this._audioCtx.currentTime + 0.1
      );
    }

    // Team peers always at full volume
    for (const p of team) {
      const gain = this._gainNodes.get(p.userId);
      if (!gain || this._mutedPeers.has(p.userId) || this._deafened) continue;
      gain.gain.linearRampToValueAtTime(
        this._volumes.get(p.userId) ?? 1,
        this._audioCtx.currentTime + 0.1
      );
    }
  }

  _onVoiceActivity({ userId, speaking }) {
    // Dispatch to UI for speaking indicator
    window.dispatchEvent(new CustomEvent('voice:activity', { detail: { userId, speaking } }));
  }

  _onSpeaking({ userId, speaking }) {
    window.dispatchEvent(new CustomEvent('voice:speaking', { detail: { userId, speaking } }));
  }
}
