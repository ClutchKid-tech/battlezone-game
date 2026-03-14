'use strict';

// Global env vars needed by modules that validate them at load time
process.env.JWT_SECRET  = process.env.JWT_SECRET  || 'test-secret-key-min-32-chars-long!!';
process.env.NODE_ENV    = 'test';
process.env.PORT        = '8080';
process.env.TICK_RATE   = '64';
process.env.MIN_START_PLAYERS = '2';

// Suppress console noise during tests
global.console.warn  = jest.fn();
global.console.error = jest.fn();
global.console.log   = jest.fn();
