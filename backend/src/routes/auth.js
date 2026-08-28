import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { query } from '../db.js';
import { createToken, hashPin, isPhone, normalizePhone, requireAuth, verifyPin } from '../lib/auth.js';
import { DEMO_ITEMS } from '../lib/demoCatalog.js';

export const authRouter = Router();

function guestPhone() {
  return `07${String(randomInt(10000000, 99999999))}`;
}

async function findOrCreateOpenShop(phone) {
  const existing = await query('SELECT * FROM businesses WHERE phone = $1', [phone]);
  if (existing.rows[0]) return existing.rows[0];

  const { rows } = await query(
    `INSERT INTO businesses (phone, pin_hash, business_name, owner_name, language, onboarded)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
    [phone, hashPin('0000'), 'Guest Duka', 'Guest', 'mixed']
  );
  const shop = rows[0];

  for (const [name, unit, qty, cost, price, threshold] of DEMO_ITEMS) {
    await query(
      `INSERT INTO items (business_id, name, unit, qty_on_hand, cost_price, price, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [shop.id, name, unit, qty, cost, price, threshold]
    );
  }

  return shop;
}

function publicBusiness(row) {
  return {
    id: row.id,
    phone: row.phone,
    business_name: row.business_name,
    owner_name: row.owner_name,
    business_type: row.business_type,
    currency: row.currency,
    language: row.language,
    onboarded: row.onboarded,
  };
}

authRouter.post('/signup', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin || '');
    const businessName = String(req.body?.business_name || '').trim();
    const ownerName = String(req.body?.owner_name || '').trim();
    const language = ['en', 'sw', 'mixed'].includes(req.body?.language) ? req.body.language : 'en';

    if (!isPhone(phone)) {
      return res.status(400).json({ message: 'Enter a valid phone number, like 0712345678.' });
    }
    if (!/^\d{4,6}$/.test(pin)) {
      return res.status(400).json({ message: 'Your PIN must be 4 to 6 digits.' });
    }
    if (!businessName || !ownerName) {
      return res.status(400).json({ message: 'Business name and your name are both required.' });
    }

    const existing = await query('SELECT id FROM businesses WHERE phone = $1', [phone]);
    if (existing.rows[0]) {
      return res.status(409).json({ message: 'That number already has an account. Log in instead.' });
    }

    const { rows } = await query(
      `INSERT INTO businesses (phone, pin_hash, business_name, owner_name, language)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [phone, hashPin(pin), businessName, ownerName, language]
    );

    return res.status(201).json({
      token: createToken(rows[0].id),
      business: publicBusiness(rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin || '');

    if (!pin) {
      const openPhone = isPhone(phone) ? phone : guestPhone();
      const business = await findOrCreateOpenShop(openPhone);
      return res.json({ token: createToken(business.id), business: publicBusiness(business) });
    }

    const { rows } = await query('SELECT * FROM businesses WHERE phone = $1', [phone]);
    const business = rows[0];

    if (!business || !verifyPin(pin, business.pin_hash)) {
      return res.status(401).json({ message: 'That phone number and PIN do not match.' });
    }

    return res.json({ token: createToken(business.id), business: publicBusiness(business) });
  } catch (error) {
    return next(error);
  }
});

authRouter.post('/guest', async (req, res, next) => {
  try {
    const requested = normalizePhone(req.body?.phone);
    const phone = isPhone(requested) ? requested : guestPhone();
    const business = await findOrCreateOpenShop(phone);
    return res.json({ token: createToken(business.id), business: publicBusiness(business) });
  } catch (error) {
    return next(error);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM businesses WHERE id = $1', [req.businessId]);
    if (!rows[0]) return res.status(404).json({ message: 'Account not found.' });
    return res.json({ business: publicBusiness(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

authRouter.patch('/business', requireAuth, async (req, res, next) => {
  try {
    const type = req.body?.business_type;
    const language = req.body?.language;

    const { rows } = await query(
      `UPDATE businesses
          SET business_type = COALESCE($2, business_type),
              currency      = COALESCE($3, currency),
              language      = COALESCE($4, language),
              onboarded     = COALESCE($5, onboarded)
        WHERE id = $1
        RETURNING *`,
      [
        req.businessId,
        ['duka', 'mama_mboga', 'kiosk', 'other'].includes(type) ? type : null,
        req.body?.currency || null,
        ['en', 'sw', 'mixed'].includes(language) ? language : null,
        typeof req.body?.onboarded === 'boolean' ? req.body.onboarded : null,
      ]
    );

    return res.json({ business: publicBusiness(rows[0]) });
  } catch (error) {
    return next(error);
  }
});
