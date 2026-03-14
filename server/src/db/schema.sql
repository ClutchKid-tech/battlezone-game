-- Battle Royale — Full PostgreSQL Schema
-- Run with: psql $DATABASE_URL -f schema.sql
-- All timestamps are UTC. UUIDs used for all primary keys.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for username search

-- Must be defined before any trigger that uses it
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
--  Users & Auth
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    username        VARCHAR(32) NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   CHAR(60)    NOT NULL,            -- bcrypt hash
    avatar_url      TEXT,
    xp              BIGINT      NOT NULL DEFAULT 0,
    level           INT         NOT NULL DEFAULT 1,
    coins           INT         NOT NULL DEFAULT 0,   -- in-game soft currency
    premium_coins   INT         NOT NULL DEFAULT 0,   -- purchased hard currency
    is_banned       BOOLEAN     NOT NULL DEFAULT false,
    email_verified  BOOLEAN     NOT NULL DEFAULT false,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username_lower ON users (lower(username));
CREATE INDEX idx_users_email_lower    ON users (lower(email));
CREATE INDEX idx_users_xp             ON users (xp DESC);

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  CHAR(64)    NOT NULL UNIQUE,   -- SHA-256 of the raw token
    expires_at  TIMESTAMPTZ NOT NULL,
    device_info TEXT,
    ip_address  INET,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE email_verifications (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      CHAR(64)    NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
--  Player Stats & Match History
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE player_stats (
    user_id         UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    kills           BIGINT  NOT NULL DEFAULT 0,
    deaths          BIGINT  NOT NULL DEFAULT 0,
    wins            INT     NOT NULL DEFAULT 0,
    top10s          INT     NOT NULL DEFAULT 0,
    damage_dealt    BIGINT  NOT NULL DEFAULT 0,
    matches_played  INT     NOT NULL DEFAULT 0,
    shots_fired     BIGINT  NOT NULL DEFAULT 0,
    shots_hit       BIGINT  NOT NULL DEFAULT 0,
    headshots       BIGINT  NOT NULL DEFAULT 0,
    longest_kill_m  FLOAT   NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE matches (
    id          UUID        PRIMARY KEY,            -- roomId from GameRoom
    mode        VARCHAR(10) NOT NULL,               -- solo | duo | squad
    region      VARCHAR(10) NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL,
    ended_at    TIMESTAMPTZ NOT NULL,
    duration_ms INT         NOT NULL,
    winner_id   UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_matches_started ON matches(started_at DESC);

CREATE TABLE match_players (
    id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id     UUID    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    user_id      UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kills        INT     NOT NULL DEFAULT 0,
    damage_dealt INT     NOT NULL DEFAULT 0,
    placement    INT     NOT NULL,
    survived     BOOLEAN NOT NULL DEFAULT false,
    survival_ms  INT     NOT NULL DEFAULT 0,
    UNIQUE (match_id, user_id)
);

CREATE INDEX idx_match_players_user  ON match_players(user_id);
CREATE INDEX idx_match_players_match ON match_players(match_id);

-- ─────────────────────────────────────────────────────────────────────────────
--  Cosmetics & Shop
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE cosmetic_type AS ENUM (
    'skin', 'emote', 'weapon_wrap', 'parachute_trail', 'loading_screen', 'spray', 'music_pack'
);

CREATE TYPE rarity_type AS ENUM ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic');

CREATE TABLE cosmetic_items (
    id           UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(100)  NOT NULL,
    description  TEXT,
    cosmetic_type cosmetic_type NOT NULL,
    rarity       rarity_type   NOT NULL DEFAULT 'common',
    asset_url    TEXT          NOT NULL,
    preview_url  TEXT,
    set_name     VARCHAR(100),
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cosmetics_type ON cosmetic_items(cosmetic_type);

CREATE TABLE shop_rotations (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id         UUID        NOT NULL REFERENCES cosmetic_items(id),
    price_coins     INT,                                  -- NULL = not available for coins
    price_real      NUMERIC(8,2),                         -- USD, NULL = not available for purchase
    featured        BOOLEAN     NOT NULL DEFAULT false,
    available_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    available_until TIMESTAMPTZ,                          -- NULL = permanent
    rotation_type   VARCHAR(10) NOT NULL DEFAULT 'daily', -- daily | weekly | permanent
    UNIQUE (item_id, available_from)
);

CREATE TABLE shop_bundles (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    price_coins  INT,
    price_real   NUMERIC(8,2),
    banner_url   TEXT,
    available_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    available_until TIMESTAMPTZ
);

CREATE TABLE bundle_items (
    bundle_id UUID NOT NULL REFERENCES shop_bundles(id) ON DELETE CASCADE,
    item_id   UUID NOT NULL REFERENCES cosmetic_items(id),
    PRIMARY KEY (bundle_id, item_id)
);

CREATE TABLE user_inventory (
    id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id            UUID        NOT NULL REFERENCES cosmetic_items(id),
    purchased_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_method     VARCHAR(20) NOT NULL,    -- 'coins' | 'premium_coins' | 'stripe'
    stripe_payment_id  TEXT,
    UNIQUE (user_id, item_id)
);

CREATE INDEX idx_inventory_user ON user_inventory(user_id);

CREATE TABLE purchase_receipts (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id           UUID        REFERENCES cosmetic_items(id),
    bundle_id         UUID        REFERENCES shop_bundles(id),
    item_name         TEXT        NOT NULL,
    amount_coins      INT         NOT NULL DEFAULT 0,
    amount_real       NUMERIC(8,2) NOT NULL DEFAULT 0,
    payment_method    VARCHAR(20) NOT NULL,
    stripe_payment_id TEXT,
    stripe_charge_id  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_receipts_user ON purchase_receipts(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  Social
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');

CREATE TABLE friendships (
    id          UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id_a   UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_b   UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      friendship_status NOT NULL DEFAULT 'pending',
    initiated_by UUID             NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
    UNIQUE (user_id_a, user_id_b),
    CHECK (user_id_a < user_id_b)   -- enforce canonical ordering
);

CREATE INDEX idx_friendships_a ON friendships(user_id_a);
CREATE INDEX idx_friendships_b ON friendships(user_id_b);

CREATE TABLE party_invites (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID        NOT NULL REFERENCES users(id),
    to_user_id   UUID        NOT NULL REFERENCES users(id),
    party_code   VARCHAR(20) NOT NULL,
    mode         VARCHAR(10) NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    accepted_at  TIMESTAMPTZ,
    declined_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_party_invites_to ON party_invites(to_user_id, expires_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  Anti-Cheat & Moderation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE bans (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT        NOT NULL,
    banned_by   UUID        REFERENCES users(id),     -- NULL = system/auto-ban
    evidence    JSONB,                                 -- anti-cheat evidence payload
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,                           -- NULL = permanent
    active      BOOLEAN     NOT NULL DEFAULT true,
    appealed_at TIMESTAMPTZ,
    appeal_text TEXT,
    appeal_resolved_at TIMESTAMPTZ,
    appeal_result VARCHAR(20)                          -- 'upheld' | 'reversed'
);

CREATE INDEX idx_bans_user   ON bans(user_id, active);
CREATE INDEX idx_bans_active ON bans(active, expires_at);

CREATE TABLE player_reports (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id   UUID        NOT NULL REFERENCES users(id),
    reported_id   UUID        NOT NULL REFERENCES users(id),
    match_id      UUID        REFERENCES matches(id),
    reason        VARCHAR(50) NOT NULL,
    description   TEXT,
    chat_log      JSONB,
    replay_data   JSONB,
    status        VARCHAR(20) NOT NULL DEFAULT 'open',   -- open | reviewed | actioned
    reviewed_by   UUID        REFERENCES users(id),
    reviewed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_reported ON player_reports(reported_id, status);

CREATE TABLE anti_cheat_events (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id),
    match_id     UUID,
    event_type   VARCHAR(50) NOT NULL,   -- speed_hack | teleport | rapid_fire | wallhack_suspect
    severity     INT         NOT NULL,   -- 1-5
    evidence     JSONB       NOT NULL,
    auto_banned  BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ace_user ON anti_cheat_events(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
--  Replay System
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE match_replays (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id     UUID        NOT NULL REFERENCES matches(id) UNIQUE,
    storage_key  TEXT        NOT NULL,   -- S3 / GCS object key
    size_bytes   BIGINT      NOT NULL DEFAULT 0,
    expires_at   TIMESTAMPTZ NOT NULL,   -- replays expire after 30 days
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
--  Online sessions (for presence tracking)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE online_sessions (
    user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    room_id    TEXT,
    region     VARCHAR(10),
    expires_at TIMESTAMPTZ NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
--  Trigger: auto-update updated_at  (function defined at top of file)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER friendships_updated_at
    BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
--  Views
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW player_profiles AS
SELECT
    u.id, u.username, u.avatar_url, u.xp, u.level, u.coins,
    u.is_banned, u.created_at,
    s.kills, s.deaths, s.wins, s.top10s, s.matches_played,
    s.damage_dealt, s.shots_fired, s.shots_hit,
    ROUND(s.kills::numeric / NULLIF(s.deaths, 0), 2)          AS kd_ratio,
    ROUND(s.shots_hit::numeric * 100 / NULLIF(s.shots_fired, 0), 1) AS accuracy_pct
FROM users u
LEFT JOIN player_stats s ON s.user_id = u.id;

-- ─────────────────────────────────────────────────────────────────────────────
--  Seed: default shop items
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO cosmetic_items (id, name, description, cosmetic_type, rarity, asset_url, set_name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Soldier',   'The classic look',    'skin',            'common',    '/assets/skins/default_soldier.glb',    'Default'),
  ('00000000-0000-0000-0000-000000000002', 'Neon Striker',      'Glow-in-dark outfit', 'skin',            'epic',      '/assets/skins/neon_striker.glb',       'Neon'),
  ('00000000-0000-0000-0000-000000000003', 'Shadow Ops',        'Tactical stealth',    'skin',            'legendary', '/assets/skins/shadow_ops.glb',         'Operator'),
  ('00000000-0000-0000-0000-000000000004', 'Victory Dance',     'Celebrate!',          'emote',           'uncommon',  '/assets/emotes/victory_dance.glb',     NULL),
  ('00000000-0000-0000-0000-000000000005', 'Fist Pump',         'Classic celebration', 'emote',           'common',    '/assets/emotes/fist_pump.glb',         NULL),
  ('00000000-0000-0000-0000-000000000006', 'Rainbow Trail',     'Leave a streak',      'parachute_trail', 'rare',      '/assets/trails/rainbow.png',           'Rainbow'),
  ('00000000-0000-0000-0000-000000000007', 'Fire Wrap',         'Burn bright',         'weapon_wrap',     'epic',      '/assets/wraps/fire.png',               'Inferno'),
  ('00000000-0000-0000-0000-000000000008', 'Glacier Wrap',      'Ice cold',            'weapon_wrap',     'rare',      '/assets/wraps/glacier.png',            'Arctic'),
  ('00000000-0000-0000-0000-000000000009', 'Victory Screen',    'Winners loading',     'loading_screen',  'rare',      '/assets/screens/victory.jpg',          NULL),
  ('00000000-0000-0000-0000-000000000010', 'Phantom Soldier',   'Ghost of the zone',   'skin',            'legendary', '/assets/skins/phantom.glb',            'Phantom')
ON CONFLICT DO NOTHING;

INSERT INTO shop_rotations (item_id, price_coins, price_real, featured, rotation_type) VALUES
  ('00000000-0000-0000-0000-000000000002', 1200, 9.99,  true,  'weekly'),
  ('00000000-0000-0000-0000-000000000003', 2000, 19.99, true,  'weekly'),
  ('00000000-0000-0000-0000-000000000004', 300,  null,  false, 'daily'),
  ('00000000-0000-0000-0000-000000000005', 100,  null,  false, 'permanent'),
  ('00000000-0000-0000-0000-000000000006', 600,  4.99,  false, 'weekly'),
  ('00000000-0000-0000-0000-000000000007', 800,  6.99,  false, 'daily'),
  ('00000000-0000-0000-0000-000000000008', 600,  4.99,  false, 'daily'),
  ('00000000-0000-0000-0000-000000000009', 200,  null,  false, 'permanent'),
  ('00000000-0000-0000-0000-000000000010', 2500, 24.99, true,  'weekly')
ON CONFLICT DO NOTHING;
