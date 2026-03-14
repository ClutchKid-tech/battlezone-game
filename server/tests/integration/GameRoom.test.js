'use strict';

// Mock heavy subsystems that would need real DB/network
jest.mock('../../src/db/postgres', () => ({
  saveMatchResult: jest.fn().mockResolvedValue(undefined),
  getPostgres: jest.fn(),
}));

jest.mock('../../src/game/LootSystem', () => {
  return jest.fn().mockImplementation(() => ({
    spawnInitialLoot: jest.fn(),
    getSnapshot: jest.fn().mockReturnValue([]),
    getLootAt: jest.fn().mockReturnValue(null),
    removeLoot: jest.fn(),
    addDroppedLoot: jest.fn(),
    clear: jest.fn(),
  }));
});

jest.mock('../../src/game/VehicleSystem', () => {
  return jest.fn().mockImplementation(() => ({
    spawnInitialVehicles: jest.fn(),
    getSnapshot: jest.fn().mockReturnValue([]),
    tick: jest.fn(),
    getVehicle: jest.fn().mockReturnValue(null),
    getNearestVehicle: jest.fn().mockReturnValue(null),
    enterVehicle: jest.fn().mockReturnValue(false),
    exitVehicle: jest.fn(),
    steer: jest.fn(),
    clear: jest.fn(),
  }));
});

jest.mock('../../src/game/BulletPhysics', () => {
  return jest.fn().mockImplementation(() => ({
    tick: jest.fn().mockReturnValue([]),
    processShot: jest.fn().mockReturnValue(null),
    addProjectile: jest.fn(),
    clear: jest.fn(),
  }));
});

const GameRoom = require('../../src/game/GameRoom');

// Minimal Socket.io mock
function makeSocketMock(id = 'socket-1') {
  const handlers = {};
  return {
    id,
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    on: (event, handler) => { handlers[event] = handler; },
    _trigger: (event, data) => handlers[event] && handlers[event](data),
    _handlers: handlers,
  };
}

function makeIOMock() {
  const rooms = {};
  const nsMock = {
    to: jest.fn(() => ({ emit: jest.fn() })),
    in: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn(),
  };
  return {
    of: jest.fn(() => nsMock),
    to: jest.fn(() => ({ emit: jest.fn() })),
    _ns: nsMock,
  };
}

function makePendingPlayer(userId, username, squadId = null) {
  return { userId, username, squadId };
}

function makeRoom(players = [], mode = 'solo', region = 'NA') {
  const io = makeIOMock();
  const room = new GameRoom('room-test-1', players, mode, region, io);
  return { room, io };
}

describe('GameRoom', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates room in WAITING phase', () => {
      const { room } = makeRoom();
      expect(room.phase).toBe('waiting');
    });

    it('registers pending players', () => {
      const { room } = makeRoom([
        makePendingPlayer('u1', 'Alice'),
        makePendingPlayer('u2', 'Bob'),
      ]);
      expect(room.players.size).toBe(2);
    });

    it('has correct roomId', () => {
      const { room } = makeRoom();
      expect(room.roomId).toBe('room-test-1');
    });

    it('isFinished() returns false initially', () => {
      const { room } = makeRoom();
      expect(room.isFinished()).toBe(false);
    });
  });

  describe('addSocket()', () => {
    it('connects a player and joins room channel', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      const socket = makeSocketMock('sock-1');
      room.addSocket(socket, 'u1', 'Alice');
      expect(socket.join).toHaveBeenCalledWith('room-test-1');
    });

    it('emits room:state to the connecting socket', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      const socket = makeSocketMock('sock-1');
      room.addSocket(socket, 'u1', 'Alice');
      expect(socket.emit).toHaveBeenCalledWith('room:state', expect.any(Object));
    });

    it('rejects connection to active match', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      room.phase = 'active';
      const socket = makeSocketMock('sock-new');
      room.addSocket(socket, 'u999', 'Stranger');
      expect(socket.emit).toHaveBeenCalledWith('error', expect.objectContaining({ code: 'MATCH_IN_PROGRESS' }));
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('begins countdown when minimum players connect', () => {
      // MIN_START_PLAYERS defaults to 2 in tests (process.env not set)
      const { room } = makeRoom([
        makePendingPlayer('u1', 'Alice'),
        makePendingPlayer('u2', 'Bob'),
      ]);
      const s1 = makeSocketMock('s1');
      const s2 = makeSocketMock('s2');
      room.addSocket(s1, 'u1', 'Alice');
      room.addSocket(s2, 'u2', 'Bob');
      // Phase should have transitioned to countdown
      expect(room.phase).toBe('countdown');
    });
  });

  describe('start()', () => {
    it('spawns initial loot and vehicles', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      room.start();
      expect(room.loot.spawnInitialLoot).toHaveBeenCalled();
      expect(room.vehicles.spawnInitialVehicles).toHaveBeenCalled();
    });
  });

  describe('forceEnd()', () => {
    it('sets phase to ended', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      room.start();
      jest.advanceTimersByTime(31_000); // skip countdown
      room.forceEnd('test');
      expect(room.phase).toBe('ended');
      expect(room.isFinished()).toBe(true);
    });

    it('calling forceEnd twice is safe (idempotent)', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      room.forceEnd('test');
      expect(() => room.forceEnd('test')).not.toThrow();
    });
  });

  describe('dispose()', () => {
    it('clears players map', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      room.dispose();
      expect(room.players.size).toBe(0);
    });
  });

  describe('hasPlayer()', () => {
    it('returns true for registered player', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      expect(room.hasPlayer('u1')).toBe(true);
    });

    it('returns false for unknown player', () => {
      const { room } = makeRoom([makePendingPlayer('u1', 'Alice')]);
      expect(room.hasPlayer('u-unknown')).toBe(false);
    });
  });

  describe('match lifecycle', () => {
    it('transitions WAITING → COUNTDOWN → ACTIVE after countdown', () => {
      const pending = [makePendingPlayer('u1', 'Alice'), makePendingPlayer('u2', 'Bob')];
      const { room } = makeRoom(pending);
      room.start();
      const s1 = makeSocketMock('s1');
      const s2 = makeSocketMock('s2');
      room.addSocket(s1, 'u1', 'Alice');
      room.addSocket(s2, 'u2', 'Bob');
      expect(room.phase).toBe('countdown');

      // Skip countdown timer (30 seconds)
      jest.advanceTimersByTime(31_000);
      expect(room.phase).toBe('active');
    });

    it('sets startedAt when match goes active', () => {
      const pending = [makePendingPlayer('u1', 'Alice'), makePendingPlayer('u2', 'Bob')];
      const { room } = makeRoom(pending);
      room.start();
      const s1 = makeSocketMock('s1');
      const s2 = makeSocketMock('s2');
      room.addSocket(s1, 'u1', 'Alice');
      room.addSocket(s2, 'u2', 'Bob');
      jest.advanceTimersByTime(31_000);
      expect(room.startedAt).not.toBeNull();
    });

    it('ends game when only one player is alive (solo mode)', () => {
      const { saveMatchResult } = require('../../src/db/postgres');
      const pending = [makePendingPlayer('u1', 'Alice'), makePendingPlayer('u2', 'Bob')];
      const { room } = makeRoom(pending, 'solo');
      room.start();
      const s1 = makeSocketMock('s1');
      const s2 = makeSocketMock('s2');
      room.addSocket(s1, 'u1', 'Alice');
      room.addSocket(s2, 'u2', 'Bob');

      jest.advanceTimersByTime(31_000); // start match

      // Kill one player
      const players = [...room.players.values()];
      players[0].alive = false;

      // Advance one tick (64Hz → ~16ms)
      jest.advanceTimersByTime(16);

      expect(room.phase).toBe('ended');
      expect(saveMatchResult).toHaveBeenCalled();
    });
  });

  describe('player disconnect', () => {
    it('marks player as not connected on disconnect', () => {
      const pending = [makePendingPlayer('u1', 'Alice')];
      const { room } = makeRoom(pending);
      const socket = makeSocketMock('s1');
      room.addSocket(socket, 'u1', 'Alice');
      const player = room.players.get('u1');

      socket._trigger('disconnect', 'transport close');
      expect(player.connected).toBe(false);
    });
  });
});
