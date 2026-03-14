'use strict';

process.env.JWT_SECRET = 'test-secret-key-min-32-chars-long!!';
process.env.NODE_ENV = 'test';

// Mock postgres and redis before requiring the app
const mockDb = {
  query: jest.fn(),
  connect: jest.fn(),
};
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('../../src/db/postgres', () => ({
  connectPostgres:    jest.fn().mockResolvedValue(undefined),
  disconnectPostgres: jest.fn().mockResolvedValue(undefined),
  getPostgres: jest.fn(() => mockDb),
  getPool:     jest.fn(() => mockDb),
  query:       jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../../src/db/redis', () => ({
  connectRedis:    jest.fn().mockResolvedValue(undefined),
  disconnectRedis: jest.fn().mockResolvedValue(undefined),
  getRedis: jest.fn(() => mockRedis),
}));

const request  = require('supertest');
const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const authRouter = require('../../src/api/routes/auth');

// Build a minimal express app (no rate limiting to keep tests fast)
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const HASHED_PW = bcrypt.hashSync('Password1!', 1); // fast salt for tests

describe('POST /api/auth/register', () => {
  let app;
  beforeEach(() => {
    app = makeApp();
    jest.clearAllMocks();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 for invalid username (too short)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'ab', email: 'ab@test.com', password: 'Password1!',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'validuser', email: 'valid@test.com', password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('returns 409 when username/email already taken', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] }); // EXISTS check

    const res = await request(app).post('/api/auth/register').send({
      username: 'existinguser', email: 'existing@test.com', password: 'Password1!',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/taken/i);
  });

  it('returns 201 with tokens on successful registration', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [] })        // EXISTS check → empty
      .mockResolvedValueOnce({ rows: [] })        // INSERT users
      .mockResolvedValueOnce({ rows: [] });       // INSERT wallets
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).post('/api/auth/register').send({
      username: 'newplayer', email: 'new@test.com', password: 'Password1!',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('access');
    expect(res.body).toHaveProperty('refresh');
    expect(res.body).toHaveProperty('userId');
    expect(res.body.username).toBe('newplayer');
  });

  it('returns 500 on database error', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app).post('/api/auth/register').send({
      username: 'failuser', email: 'fail@test.com', password: 'Password1!',
    });
    expect(res.status).toBe(500);
  });
});

describe('POST /api/auth/login', () => {
  let app;
  beforeEach(() => {
    app = makeApp();
    jest.clearAllMocks();
  });

  it('returns 400 when credentials are missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 when user not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/auth/login').send({
      usernameOrEmail: 'ghost', password: 'Password1!',
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid credentials/i);
  });

  it('returns 403 when account is banned', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'u1', username: 'banneduser', password_hash: HASHED_PW, banned: true }],
    });

    const res = await request(app).post('/api/auth/login').send({
      usernameOrEmail: 'banneduser', password: 'Password1!',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/banned/i);
  });

  it('returns 401 for wrong password', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: 'u1', username: 'alice', password_hash: HASHED_PW, banned: false }],
    });

    const res = await request(app).post('/api/auth/login').send({
      usernameOrEmail: 'alice', password: 'WrongPassword!',
    });
    expect(res.status).toBe(401);
  });

  it('returns 200 with tokens on valid credentials', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ id: 'u1', username: 'alice', password_hash: HASHED_PW, banned: false }],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE last_login
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).post('/api/auth/login').send({
      usernameOrEmail: 'alice', password: 'Password1!',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access');
    expect(res.body).toHaveProperty('refresh');
    expect(res.body.username).toBe('alice');
  });
});

describe('POST /api/auth/refresh', () => {
  let app;
  beforeEach(() => {
    app = makeApp();
    jest.clearAllMocks();
  });

  it('returns 400 when refresh token is missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for invalid/malformed token', async () => {
    const res = await request(app).post('/api/auth/refresh').send({
      refresh: 'totally-not-a-jwt',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when stored token does not match (revoked)', async () => {
    const refreshToken = jwt.sign(
      { sub: 'u1', username: 'alice', type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    mockRedis.get.mockResolvedValue('different-token');

    const res = await request(app).post('/api/auth/refresh').send({ refresh: refreshToken });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/revoked/i);
  });

  it('returns new tokens when refresh token is valid', async () => {
    const refreshToken = jwt.sign(
      { sub: 'u1', username: 'alice', type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    mockRedis.get.mockResolvedValue(refreshToken);
    mockRedis.set.mockResolvedValue('OK');

    const res = await request(app).post('/api/auth/refresh').send({ refresh: refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('access');
    expect(res.body).toHaveProperty('refresh');
    // New refresh token should be different
    expect(res.body.refresh).not.toBe(refreshToken);
  });
});

describe('POST /api/auth/logout', () => {
  let app;
  beforeEach(() => {
    app = makeApp();
    jest.clearAllMocks();
  });

  it('returns ok:true even without a token', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('revokes refresh token from Redis', async () => {
    const refreshToken = jwt.sign(
      { sub: 'u1', username: 'alice' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    mockRedis.del.mockResolvedValue(1);

    await request(app).post('/api/auth/logout').send({ refresh: refreshToken });
    expect(mockRedis.del).toHaveBeenCalledWith('refresh:u1');
  });
});
