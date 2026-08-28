import 'dotenv/config';
import { pool, query } from './src/db.js';
import { hashPin } from './src/lib/auth.js';

const DEMO = {
  phone: '0712345678',
  pin: '1234',
  business_name: 'Baraka Duka',
  owner_name: 'Nadia',
  language: 'mixed',
};

const ITEMS = [
  ['Unga', 'packet', 48, 120, 150, 10],
  ['Sugar', 'kg', 6, 210, 280, 8],
  ['Cooking oil', 'litre', 18, 190, 250, 5],
  ['Milk', 'packet', 32, 45, 60, 12],
  ['Rice', 'kg', 25, 150, 200, 10],
  ['Tea leaves', 'packet', 4, 85, 120, 6],
  ['Soap', 'bar', 40, 35, 55, 10],
  ['Bread', 'loaf', 9, 50, 70, 10],
];

const CUSTOMERS = [
  ['Mama Jane', '0722000111'],
  ['Baba Ali', '0733222333'],
  ['Teacher Wanjiru', null],
];

async function seed() {
  const existing = await query('SELECT id FROM businesses WHERE phone = $1', [DEMO.phone]);
  if (existing.rows[0]) {
    await query('DELETE FROM businesses WHERE phone = $1', [DEMO.phone]);
  }

  const business = await query(
    `INSERT INTO businesses (phone, pin_hash, business_name, owner_name, language, onboarded)
     VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
    [DEMO.phone, hashPin(DEMO.pin), DEMO.business_name, DEMO.owner_name, DEMO.language]
  );
  const businessId = business.rows[0].id;

  for (const [name, unit, qty, cost, price, threshold] of ITEMS) {
    await query(
      `INSERT INTO items (business_id, name, unit, qty_on_hand, cost_price, price, low_stock_threshold)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [businessId, name, unit, qty, cost, price, threshold]
    );
  }

  for (const [name, phone] of CUSTOMERS) {
    await query('INSERT INTO customers (business_id, name, phone) VALUES ($1, $2, $3)', [
      businessId,
      name,
      phone,
    ]);
  }

  // A week of history so Reports and the Assistant have something real to read.
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

  console.log(`Seeded ${DEMO.business_name}`);
  console.log(`  Phone: ${DEMO.phone}`);
  console.log(`  PIN:   ${DEMO.pin}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
