'use strict';

const express = require('express');
const Stripe  = require('stripe');
const { v4: uuidv4 } = require('uuid');
const { getPostgres } = require('../../db/postgres');
const { getRedis }    = require('../../db/redis');
const { shopLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// In-game currency amounts per real-money package
const CURRENCY_PACKAGES = [
  { id: 'pack_starter',  coins: 500,   price: 499,   stripePriceId: process.env.STRIPE_PRICE_STARTER  },
  { id: 'pack_standard', coins: 1100,  price: 999,   stripePriceId: process.env.STRIPE_PRICE_STANDARD },
  { id: 'pack_value',    coins: 2400,  price: 1999,  stripePriceId: process.env.STRIPE_PRICE_VALUE    },
  { id: 'pack_premium',  coins: 6500,  price: 4999,  stripePriceId: process.env.STRIPE_PRICE_PREMIUM  },
];

// ─── Item Shop endpoints ───────────────────────────────────────────────────

// GET /api/shop/items  — current rotating shop
router.get('/items', async (req, res) => {
  const redis = getRedis();
  const cached = await redis.get('shop:daily');
  if (cached) return res.json(JSON.parse(cached));

  const db = getPostgres();
  const { rows } = await db.query(`
    SELECT si.id, si.name, si.category, si.rarity, si.price_coins,
           si.preview_url, si.bundle_id, srot.featured, srot.expires_at
    FROM shop_items si
    JOIN shop_rotation srot ON srot.item_id = si.id
    WHERE srot.expires_at > NOW()
    ORDER BY srot.featured DESC, si.rarity DESC, si.name
  `);

  // Group into bundles
  const bundles = {};
  const standalone = [];
  for (const item of rows) {
    if (item.bundle_id) {
      if (!bundles[item.bundle_id]) bundles[item.bundle_id] = { bundleId: item.bundle_id, items: [] };
      bundles[item.bundle_id].items.push(item);
    } else {
      standalone.push(item);
    }
  }

  const response = { standalone, bundles: Object.values(bundles) };
  await redis.set('shop:daily', JSON.stringify(response), { EX: 3600 });
  return res.json(response);
});

// POST /api/shop/buy  — purchase with in-game coins
router.post('/buy', shopLimiter, async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });

  const db = getPostgres();
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    // Fetch item
    const { rows: itemRows } = await client.query(
      `SELECT id, name, price_coins FROM shop_items WHERE id = $1`, [itemId]
    );
    if (!itemRows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item not found' }); }
    const item = itemRows[0];

    // Check if already owned
    const { rows: owned } = await client.query(
      `SELECT 1 FROM player_inventory WHERE user_id = $1 AND item_id = $2`, [req.userId, itemId]
    );
    if (owned.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Item already owned' }); }

    // Check wallet balance
    const { rows: wallet } = await client.query(
      `SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [req.userId]
    );
    if (!wallet[0] || wallet[0].balance < item.price_coins) {
      await client.query('ROLLBACK');
      return res.status(402).json({ error: 'Insufficient coins' });
    }

    // Deduct coins
    await client.query(
      `UPDATE wallets SET balance = balance - $1 WHERE user_id = $2`,
      [item.price_coins, req.userId]
    );

    // Grant item
    const purchaseId = uuidv4();
    await client.query(
      `INSERT INTO player_inventory (id, user_id, item_id, purchased_at)
       VALUES ($1, $2, $3, NOW())`,
      [purchaseId, req.userId, itemId]
    );

    // Record transaction
    await client.query(
      `INSERT INTO transactions (id, user_id, type, item_id, coins_spent, created_at)
       VALUES ($1, $2, 'shop_purchase', $3, $4, NOW())`,
      [uuidv4(), req.userId, itemId, item.price_coins]
    );

    await client.query('COMMIT');

    const { rows: newWallet } = await db.query(
      `SELECT balance FROM wallets WHERE user_id = $1`, [req.userId]
    );

    return res.json({
      purchaseId,
      item: itemRows[0],
      balance: newWallet[0]?.balance,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Shop] Buy error:', err.message);
    return res.status(500).json({ error: 'Purchase failed' });
  } finally {
    client.release();
  }
});

// POST /api/shop/checkout  — buy coins with real money via Stripe
router.post('/checkout', shopLimiter, async (req, res) => {
  const { packageId } = req.body;
  const pkg = CURRENCY_PACKAGES.find(p => p.id === packageId);
  if (!pkg) return res.status(400).json({ error: 'Invalid package' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: pkg.stripePriceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_ORIGIN}/shop?success=1&coins=${pkg.coins}`,
      cancel_url:  `${process.env.CLIENT_ORIGIN}/shop?cancelled=1`,
      client_reference_id: req.userId,
      metadata: { packageId, coins: String(pkg.coins), userId: req.userId },
      customer_email: await _getUserEmail(req.userId),
    });
    return res.json({ url: session.url });
  } catch (err) {
    console.error('[Shop] Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Checkout failed' });
  }
});

// POST /api/shop/webhook  — Stripe webhook (no auth middleware)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId  = session.client_reference_id;
    const coins   = parseInt(session.metadata.coins, 10);
    const packageId = session.metadata.packageId;

    if (userId && coins > 0) {
      await _grantCoins(userId, coins, session.id, packageId);
    }
  }

  res.json({ received: true });
});

// GET /api/shop/inventory
router.get('/inventory', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(`
    SELECT pi.id AS inventory_id, si.id, si.name, si.category, si.rarity,
           si.preview_url, pi.purchased_at
    FROM player_inventory pi
    JOIN shop_items si ON si.id = pi.item_id
    WHERE pi.user_id = $1
    ORDER BY pi.purchased_at DESC
  `, [req.userId]);
  return res.json(rows);
});

// GET /api/shop/history
router.get('/history', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(`
    SELECT t.id, t.type, t.coins_spent, t.coins_earned, t.created_at,
           si.name AS item_name, si.category AS item_category
    FROM transactions t
    LEFT JOIN shop_items si ON si.id = t.item_id
    WHERE t.user_id = $1
    ORDER BY t.created_at DESC
    LIMIT 100
  `, [req.userId]);
  return res.json(rows);
});

// GET /api/shop/balance
router.get('/balance', async (req, res) => {
  const db = getPostgres();
  const { rows } = await db.query(`SELECT balance FROM wallets WHERE user_id = $1`, [req.userId]);
  return res.json({ balance: rows[0]?.balance || 0 });
});

// GET /api/shop/packages
router.get('/packages', (req, res) => {
  return res.json(CURRENCY_PACKAGES.map(({ id, coins, price }) => ({ id, coins, price })));
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function _grantCoins(userId, coins, stripeSessionId, packageId) {
  const db = getPostgres();
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Idempotency: check if this session was already processed
    const { rows } = await client.query(
      `SELECT 1 FROM transactions WHERE stripe_session_id = $1`, [stripeSessionId]
    );
    if (rows.length > 0) { await client.query('ROLLBACK'); return; }

    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [coins, userId]
    );
    await client.query(
      `INSERT INTO transactions (id, user_id, type, coins_earned, stripe_session_id, package_id, created_at)
       VALUES ($1, $2, 'coin_purchase', $3, $4, $5, NOW())`,
      [uuidv4(), userId, coins, stripeSessionId, packageId]
    );

    await client.query('COMMIT');
    console.log(`[Shop] Granted ${coins} coins to user ${userId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Shop] _grantCoins error:', err.message);
  } finally {
    client.release();
  }
}

async function _getUserEmail(userId) {
  const db = getPostgres();
  const { rows } = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
  return rows[0]?.email || undefined;
}

module.exports = router;
