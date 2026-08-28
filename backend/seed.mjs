import 'dotenv/config';
import { pool, query } from './src/db.js';
import { hashPin } from './src/lib/auth.js';
import { DEMO_CUSTOMERS, DEMO_ITEMS, OPEN_SHOP_PHONE } from './src/lib/demoCatalog.js';

const SHOPS = [
  {
    phone: '0712345678',
    pin: '1234',
    business_name: 'Baraka Duka',
    owner_name: 'Nadia',
    language: 'mixed',
  },
  {
    phone: OPEN_SHOP_PHONE,
    pin: '0000',
    business_name: 'Open Duka',
    owner_name: 'Guest',
    language: 'mixed',
  },
];

async function seedShop(shop) {
  await query('DELETE FROM businesses WHERE phone = $1', [shop.phone]);

  const business = await query(
    `INSERT INTO businesses (phone, pin_hash, business_name, owner_name, language, onboarded)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
    [shop.phone, hashPin(shop.pin), shop.business_name, shop.owner_name, shop.language]
  );
  const businessId = business.rows[0].id;

  for (const [name, unit, qty, cost, price, threshold] of DEMO_ITEMS) {
    await query(
      `INSERT INTO items (business_id, name, unit, qty_on_hand, cost_price, price, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [businessId, name, unit, qty, cost, price, threshold]
    );
  }

  for (const [name, phone] of DEMO_CUSTOMERS) {
    await query('INSERT INTO customers (business_id, name, phone) VALUES ($1, $2, $3)', [
      businessId,
      name,
      phone,
    ]);
  }

  const items = await query('SELECT id, name, cost_price, price FROM items WHERE business_id = $1', [
    businessId,
  ]);
  const customers = await query('SELECT id, name FROM customers WHERE business_id = $1', [businessId]);

  for (let daysAgo = 6; daysAgo >= 0; daysAgo -= 1) {
    const salesToday = 3 + ((daysAgo * 2) % 4);

    for (let n = 0; n < salesToday; n += 1) {
      const item = items.rows[(daysAgo + n) % items.rows.length];
      const qty = 1 + ((daysAgo + n) % 3);
      const onCredit = (daysAgo + n) % 5 === 0;
      const customer = onCredit ? customers.rows[(daysAgo + n) % customers.rows.length] : null;
      const at = `NOW() - INTERVAL '${daysAgo} days' - INTERVAL '${n + 1} hours'`;

      await query(
        `INSERT INTO transactions
           (business_id, type, item_id, item_name, qty, unit_price, unit_cost, total,
            payment_type, customer_id, source, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'voice', ${at})`,
        [
          businessId,
          onCredit ? 'credit' : 'sale',
          item.id,
          item.name,
          qty,
          item.price,
          item.cost_price,
          Number(item.price) * qty,
          onCredit ? 'credit' : 'cash',
          customer?.id || null,
        ]
      );

      if (customer) {
        await query('UPDATE customers SET balance = balance + $1 WHERE id = $2', [
          Number(item.price) * qty,
          customer.id,
        ]);
      }
    }
  }

  const repaid = customers.rows[0];
  await query(
    `INSERT INTO transactions (business_id, type, total, payment_type, customer_id, source, created_at)
     VALUES ($1, 'repayment', 200, 'cash', $2, 'manual', NOW() - INTERVAL '2 days')`,
    [businessId, repaid.id]
  );
  await query('UPDATE customers SET balance = GREATEST(balance - 200, 0) WHERE id = $1', [repaid.id]);

  console.log(`Seeded ${shop.business_name}`);
  console.log(`  Phone: ${shop.phone}`);
  console.log(`  PIN:   ${shop.pin === '0000' ? '(none required)' : shop.pin}`);
}

async function seed() {
  await query("DELETE FROM businesses WHERE phone = '0701891'");
  for (const shop of SHOPS) {
    await seedShop(shop);
  }
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
