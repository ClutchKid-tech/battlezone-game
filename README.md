# BattleZone — Multiplayer 3D Battle Royale

A production-grade, browser-based Battle Royale built with Three.js + Node.js + Socket.io. 100 players per match, 4 km² map, 64 Hz server tick rate.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Browser Client (Three.js + Vite)                       │
│  engine/ · game/ · network/ · ui/                       │
└──────────────────┬──────────────────────────────────────┘
                   │  WSS /game  /matchmaking  /voice
┌──────────────────▼──────────────────────────────────────┐
│  Game Server (Node.js + Socket.io)                      │
│  GameServer → GameRoom (64 Hz tick)                     │
│  MatchmakingService · VoiceServer (WebRTC signalling)   │
│  REST API: /api/auth  /api/stats  /api/shop  /api/friends│
└────────┬──────────────────────────┬─────────────────────┘
         │                          │
┌────────▼────────┐      ┌──────────▼─────────┐
│  PostgreSQL 16  │      │  Redis 7            │
│  Users, Stats   │      │  Sessions, Queues   │
│  Matches, Shop  │      │  Pub/Sub, Rate-limit│
└─────────────────┘      └────────────────────┘
```

**Tech stack**
| Layer | Technology | Why |
|-------|-----------|-----|
| Client rendering | Three.js 0.166 | WebGL, zero install, cross-platform |
| Client build | Vite 5 | Fast HMR, tree-shaking, ESM output |
| Game server | Node.js 20 + Socket.io 4 | Event loop suits I/O-heavy real-time |
| REST API | Express 4 + Helmet | Lightweight, well-understood |
| Database | PostgreSQL 16 | ACID, JSON aggregation for stats |
| Cache / Pub-Sub | Redis 7 | Sub-millisecond session & queue ops |
| Payments | Stripe | PCI-compliant, webhook-verified |
| Auth | JWT (HS256) + bcryptjs | Stateless, refresh-token rotation |
| Containers | Docker + Docker Compose | One-command local stack |
| Orchestration | Kubernetes + HPA | Auto-scale game pods to demand |

---

## Local Setup (Docker Desktop — Recommended)

### Prerequisites
- Docker Desktop ≥ 4.x (includes Compose v2)
- Node.js ≥ 20 (for running tests outside Docker)

### 1. Clone & configure
```bash
git clone <repo-url> battle-royale
cd battle-royale
cp .env.example .env
```

Edit `.env` — at minimum set:
- `JWT_SECRET` — run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` and paste the output
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — from your Stripe dashboard (test keys are fine locally)
- Leave `DATABASE_URL` and `REDIS_URL` as-is for Docker

### 2. Start the full stack
```bash
npm run docker:up
```

This starts:
- PostgreSQL on `localhost:5432` (auto-runs `schema.sql`)
- Redis on `localhost:6379`
- Game server on `http://localhost:8080`
- Client (Nginx) on `http://localhost:3000`

Open **http://localhost:3000** in your browser.

### 3. View logs
```bash
npm run docker:logs
# or a specific service:
docker-compose logs -f server
```

### 4. Stop everything
```bash
npm run docker:down
# To also wipe database volumes:
npm run docker:reset
```

---

## Local Dev (without Docker)

Requires PostgreSQL and Redis running locally (or via `docker-compose up postgres redis`).

```bash
npm run install:all

# Terminal 1 — game server (hot reload)
npm run dev:server

# Terminal 2 — client (Vite HMR)
npm run dev:client
```

---

## Running Tests

```bash
# All tests with coverage (requires Postgres + Redis in .env)
npm test

# Unit tests only (no DB needed)
npm run test:unit

# Integration tests (needs a test DB)
npm run test:int
```

Coverage threshold: **90%** branches/functions/lines/statements.

---

## API Reference

### Auth  `/api/auth`
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/register` | `{username, email, password}` | Create account, returns JWT pair |
| POST | `/login` | `{usernameOrEmail, password}` | Login, returns JWT pair |
| POST | `/refresh` | `{refresh}` | Rotate refresh token |
| POST | `/logout` | `{refresh}` | Revoke refresh token |
| GET  | `/me` | — | Authenticated user info |

### Stats  `/api/stats`  *(requires Bearer token)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Your aggregated stats |
| GET | `/:userId` | Public stats for any user |
| GET | `/leaderboard/:mode` | Top 100 — solo/duo/squad/overall |
| GET | `/match/:matchId` | Full match result |
| GET | `/me/history` | Paginated match history |

### Shop  `/api/shop`  *(requires Bearer token)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/items` | Today's rotating shop |
| POST | `/buy` | Purchase with in-game coins |
| POST | `/checkout` | Stripe checkout for coin packages |
| POST | `/webhook` | Stripe webhook (no auth) |
| GET | `/inventory` | Your owned cosmetics |
| GET | `/history` | Transaction history |
| GET | `/balance` | Current coin balance |
| GET | `/packages` | Available coin packages |

### Friends  `/api/friends`  *(requires Bearer token)*
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Friends list |
| GET | `/requests` | Incoming requests |
| POST | `/request` | Send request by username |
| POST | `/accept/:id` | Accept request |
| DELETE | `/reject/:id` | Decline request |
| DELETE | `/:friendId` | Remove friend |
| POST | `/invite` | Generate shareable invite link |
| POST | `/invite/use` | Redeem invite code |
| POST | `/block/:targetId` | Block user |

### WebSocket Namespaces
| Namespace | Auth | Description |
|-----------|------|-------------|
| `/matchmaking` | JWT | Queue management |
| `/game` | JWT + roomId | In-match real-time events |
| `/voice` | JWT | WebRTC signalling |

---

## Project Structure

```
battle-royale/
├── server/
│   ├── src/
│   │   ├── index.js                  Entry point
│   │   ├── game/
│   │   │   ├── GameServer.js         Room registry
│   │   │   ├── GameRoom.js           Match lifecycle + 64 Hz tick
│   │   │   ├── Player.js             Player state & combat
│   │   │   ├── Inventory.js          Item/weapon/ammo management
│   │   │   ├── Zone.js               Shrinking safe zone (7 stages)
│   │   │   ├── LootSystem.js         Item spawning (40 items/km²)
│   │   │   ├── WeaponRegistry.js     24 weapons with full stats
│   │   │   ├── BulletPhysics.js      Server-side hitscan + projectiles
│   │   │   ├── VehicleSystem.js      Car, motorcycle, boat, buggy
│   │   │   └── AntiCheat.js          Speed/shot validation
│   │   ├── matchmaking/
│   │   │   └── MatchmakingService.js Region/mode queues
│   │   ├── api/
│   │   │   ├── routes/               auth, stats, shop, friends
│   │   │   └── middleware/           JWT auth, rate limiting
│   │   ├── db/
│   │   │   ├── postgres.js           Pool + domain helpers
│   │   │   ├── redis.js              Client + helpers
│   │   │   └── schema.sql            Full DB schema + indexes
│   │   └── voice/
│   │       └── VoiceServer.js        WebRTC signalling server
│   ├── tests/
│   │   ├── unit/                     Zone, Player, AntiCheat, Inventory, Weapons
│   │   └── integration/              GameRoom, auth API, shop API
│   └── package.json
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.js                   Game state machine
│   │   ├── engine/
│   │   │   ├── Renderer.js           Three.js scene, LOD, shadows
│   │   │   ├── Camera.js             FPS/TPS camera + collision
│   │   │   ├── InputManager.js       Keyboard, mouse, pointer lock
│   │   │   └── AudioManager.js       3D spatial audio (Web Audio API)
│   │   ├── game/
│   │   │   ├── World.js              4 km² procedural terrain
│   │   │   ├── PlayerController.js   Movement, jump, crouch, prone
│   │   │   ├── RemotePlayer.js       Interpolation of network players
│   │   │   ├── WeaponSystem.js       Shoot, recoil, reload, ADS
│   │   │   ├── VehicleController.js  Enter/exit, driving, camera
│   │   │   ├── LootManager.js        Loot rendering + pickup UI
│   │   │   ├── ZoneRenderer.js       Safe-zone visual ring + damage
│   │   │   └── WeatherSystem.js      Rain, fog, wind, day/night cycle
│   │   ├── network/
│   │   │   ├── NetworkManager.js     Socket.io + client-side prediction
│   │   │   └── VoiceManager.js       WebRTC proximity + team voice
│   │   └── ui/
│   │       ├── HUD.js                Health, armour, ammo, minimap, kill feed
│   │       ├── MainMenu.js           Menu, settings, mode selector
│   │       ├── Lobby.js              Squad lobby screen
│   │       ├── Shop.js               Item shop + Stripe checkout
│   │       ├── Minimap.js            Real-time canvas minimap
│   │       └── EndScreen.js          Post-match results + XP
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile.client
├── docker-compose.yml                Full local stack
├── Dockerfile.server
├── k8s/deployment.yaml               Deployment + Service + Ingress + HPA
├── .env.example                      All env vars documented
└── package.json                      Monorepo scripts
```

---

## Deployment (Kubernetes)

### 1. Build and push images
```bash
docker build -f Dockerfile.server -t YOUR_REGISTRY/battlezone-server:latest .
docker build -f client/Dockerfile.client -t YOUR_REGISTRY/battlezone-client:latest ./client
docker push YOUR_REGISTRY/battlezone-server:latest
docker push YOUR_REGISTRY/battlezone-client:latest
```

Update the image name in `k8s/deployment.yaml`.

### 2. Create namespace and secrets
```bash
npm run k8s:namespace
cp .env.example .env  # fill in production values
npm run k8s:secrets
```

### 3. Apply manifests
```bash
npm run k8s:apply
```

This deploys:
- Game server (3 replicas, anti-affinity, rolling update)
- HPA: 2–50 replicas based on CPU (65%) and memory (75%)
- Ingress with WebSocket support and cert-manager TLS

---

## Scaling Notes

- Each game server process handles up to 20 concurrent rooms × 100 players = 2,000 concurrent players
- Add replicas (or raise `MAX_ROOMS`) to scale; Redis pub/sub coordinates cross-pod state
- PostgreSQL should use a managed service (RDS, Cloud SQL) in production with a connection pooler (PgBouncer)
- Redis should use a managed cluster (ElastiCache, Redis Cloud) with replication

---

## Security Checklist

- [x] Server-side hit validation — clients never determine damage
- [x] JWT with short expiry + refresh token rotation
- [x] Rate limiting on all endpoints (stricter on auth)
- [x] Helmet HTTP security headers + CSP
- [x] bcrypt password hashing (cost factor 12)
- [x] Anti-cheat: speed hack, teleport, rapid-fire detection
- [x] Stripe webhook signature verification (idempotent)
- [x] Non-root Docker user
- [x] Input sanitisation on all user-supplied strings
- [x] No client-side secrets (Vite env vars are public — only publishable keys)

---

*BattleZone — built with Node.js 20, Three.js 0.166, Socket.io 4, PostgreSQL 16, Redis 7.*
