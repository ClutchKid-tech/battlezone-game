'use strict';

// WebRTC Signaling Server — handles peer-to-peer voice chat negotiation.
//
// Architecture:
//   - Each match has two voice channels:  'proximity' and 'team'
//   - Proximity: players within PROXIMITY_RADIUS metres hear each other; volume scales with distance
//   - Team:      all squad/duo teammates hear each other regardless of distance
//   - Signaling flows: offer → answer → ICE candidates (standard WebRTC handshake)
//   - This server only relays signaling; actual audio data is peer-to-peer via WebRTC DataChannels

const PROXIMITY_RADIUS = 50;   // metres — hear enemies within this range
const PEER_UPDATE_INTERVAL_MS = 2000;  // how often to re-evaluate proximity peers

class VoiceServer {
  constructor(io) {
    this.io  = io;
    this.ns  = null;
    this._peerTimer = null;
    this._started = false;

    // roomId → Map<userId, VoicePeer>
    this.rooms = new Map();
  }

  start() {
    if (this._started) return;
    this._started = true;
    // Periodic proximity recalculation
    this._peerTimer = setInterval(() => this._updateProximityPeers(), PEER_UPDATE_INTERVAL_MS);
    console.log('[VoiceServer] Started');
  }

  stop() {
    clearInterval(this._peerTimer);
    this.rooms.clear();
    this._started = false;
    console.log('[VoiceServer] Stopped');
  }

  handleConnection(socket) {
    const { userId, roomId, squadId } = socket.handshake.auth;
    if (!roomId) { socket.disconnect(true); return; }

    // Register peer
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Map());
    const room = this.rooms.get(roomId);

    const peer = {
      userId,
      squadId:    squadId || null,
      socket,
      position:   { x: 0, y: 0, z: 0 },
      muted:      false,
      deafened:   false,
      ptt:        false,     // push-to-talk active
      openMic:    false,
      mutedPeers: new Set(), // peers this user has muted
      peers:      new Set(), // current connected peers
    };
    room.set(userId, peer);

    this._bindEvents(socket, peer, roomId);

    // Tell peer who else is in the room (they'll initiate offers)
    const existingPeers = [...room.values()]
      .filter(p => p.userId !== userId)
      .map(p => ({ userId: p.userId, squadId: p.squadId }));

    socket.emit('voice:peers', existingPeers);

    socket.on('disconnect', () => {
      room.delete(userId);
      if (room.size === 0) this.rooms.delete(roomId);
      this._broadcastToRoom(roomId, 'voice:peer_left', { userId }, socket.id);
    });
  }

  _bindEvents(socket, peer, roomId) {
    // Position updates (sent by GameRoom frequently; VoiceServer subscribes too)
    socket.on('voice:position', (pos) => {
      peer.position = pos;
    });

    // PTT / mic toggle
    socket.on('voice:ptt_start', () => {
      peer.ptt = true;
      this._broadcastToProximityPeers(roomId, peer, 'voice:speaking', { userId: peer.userId, speaking: true });
    });
    socket.on('voice:ptt_stop', () => {
      peer.ptt = false;
      this._broadcastToProximityPeers(roomId, peer, 'voice:speaking', { userId: peer.userId, speaking: false });
    });
    socket.on('voice:mic_toggle', (data) => {
      peer.openMic = data.active;
      this._broadcastToProximityPeers(roomId, peer, 'voice:speaking', { userId: peer.userId, speaking: peer.openMic });
    });

    // Activity indicator (VAD — Voice Activity Detection)
    socket.on('voice:activity', (data) => {
      // Relay voice activity to proximity peers so they can show the indicator
      const peers = this._getProximityPeers(roomId, peer);
      const teamPeers = this._getTeamPeers(roomId, peer);
      const allPeers = new Set([...peers, ...teamPeers]);
      for (const p of allPeers) {
        p.socket.emit('voice:activity', { userId: peer.userId, speaking: data.speaking });
      }
    });

    // Mute individual peers
    socket.on('voice:mute_peer', ({ targetId, muted }) => {
      if (muted) {
        peer.mutedPeers.add(targetId);
      } else {
        peer.mutedPeers.delete(targetId);
      }
      socket.emit('voice:mute_confirmed', { targetId, muted });
    });

    socket.on('voice:set_deafened', ({ deafened }) => {
      peer.deafened = deafened;
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────

    // Caller sends offer to a specific peer
    socket.on('voice:offer', ({ to, offer, channel }) => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      const target = room.get(to);
      if (!target) return;

      // Validate channel permission: proximity or team
      if (channel === 'team' && target.squadId !== peer.squadId) return;

      target.socket.emit('voice:offer', {
        from:    peer.userId,
        offer,
        channel,
      });
    });

    // Callee answers
    socket.on('voice:answer', ({ to, answer }) => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      const target = room.get(to);
      if (!target) return;
      target.socket.emit('voice:answer', { from: peer.userId, answer });
    });

    // ICE candidates relay
    socket.on('voice:ice_candidate', ({ to, candidate }) => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      const target = room.get(to);
      if (!target) return;
      target.socket.emit('voice:ice_candidate', { from: peer.userId, candidate });
    });

    // Peer reports a connection closed (let others know to clean up)
    socket.on('voice:peer_disconnected', ({ peerId }) => {
      const room = this.rooms.get(roomId);
      if (!room) return;
      const target = room.get(peerId);
      if (target) {
        target.socket.emit('voice:peer_disconnected', { peerId: peer.userId });
      }
    });

    // Volume request from client — server just confirms the range is valid
    socket.on('voice:set_volume', ({ targetId, volume }) => {
      const clamped = Math.max(0, Math.min(1, volume));
      socket.emit('voice:volume_set', { targetId, volume: clamped });
    });
  }

  // Re-evaluate which peers are within proximity range and push updated lists
  _updateProximityPeers() {
    for (const [roomId, room] of this.rooms) {
      for (const peer of room.values()) {
        const proximityPeers = this._getProximityPeers(roomId, peer);
        const teamPeers      = this._getTeamPeers(roomId, peer);

        // Build proximity peers list with distances for client-side volume scaling
        const proximityList = proximityPeers
          .filter(p => !peer.mutedPeers.has(p.userId))
          .map(p => ({
            userId:   p.userId,
            distance: this._dist3(peer.position, p.position),
            channel:  'proximity',
          }));

        const teamList = teamPeers
          .filter(p => !peer.mutedPeers.has(p.userId))
          .map(p => ({
            userId:  p.userId,
            channel: 'team',
          }));

        peer.socket.emit('voice:peer_update', {
          proximity: proximityList,
          team:      teamList,
        });
      }
    }
  }

  _getProximityPeers(roomId, selfPeer) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    const peers = [];
    for (const p of room.values()) {
      if (p.userId === selfPeer.userId) continue;
      if (this._dist3(selfPeer.position, p.position) <= PROXIMITY_RADIUS) {
        peers.push(p);
      }
    }
    return peers;
  }

  _getTeamPeers(roomId, selfPeer) {
    if (!selfPeer.squadId) return [];
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.values()].filter(
      p => p.userId !== selfPeer.userId && p.squadId === selfPeer.squadId
    );
  }

  _broadcastToProximityPeers(roomId, selfPeer, event, data) {
    for (const p of this._getProximityPeers(roomId, selfPeer)) {
      if (!p.deafened && !p.mutedPeers.has(selfPeer.userId)) {
        p.socket.emit(event, data);
      }
    }
    for (const p of this._getTeamPeers(roomId, selfPeer)) {
      if (!p.deafened && !p.mutedPeers.has(selfPeer.userId)) {
        p.socket.emit(event, data);
      }
    }
  }

  _broadcastToRoom(roomId, event, data, excludeSocketId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const p of room.values()) {
      if (p.socket.id !== excludeSocketId) {
        p.socket.emit(event, data);
      }
    }
  }

  _dist3(a, b) {
    return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2 + (a.z-b.z)**2);
  }
}

module.exports = VoiceServer;
