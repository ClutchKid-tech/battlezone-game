'use strict';

const rateLimit = require('express-rate-limit');

// In-memory store (per-process). For multi-instance deployments swap to
// rate-limit-redis after Redis is connected — see README scaling notes.

// General API: 200 req/min per IP
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});

// Auth endpoints: 10 req/min per IP (brute-force protection)
const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please wait.' },
});

// Shop purchases: 30 req/min
const shopLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many shop requests.' },
});

module.exports = { apiLimiter, strictLimiter, shopLimiter };
