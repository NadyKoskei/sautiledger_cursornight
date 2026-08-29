/**
 * Walks the same API path the eight screens take, in order, against a live
 * database. Run with the backend up: node e2e.mjs
 */
import 'dotenv/config';
import { pool } from './src/db.js';

const BASE = process.env.API_URL || 'http://localhost:5050';

let token = null;
let passed = 0;
let failed = 0;
const createdPhones = [];

async function call(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

async function run() {
  const phone = `07${Math.floor(10000000 + Math.random() * 89999999)}`;
  createdPhones.push(phone);

  console.log('\n1. Login / Sign Up');
  const signup = await call('/api/auth/signup', {
    method: 'POST',
    body: {
      phone,
      pin: '4321',
      business_name: 'Test Duka',
      owner_name: 'Amina',
      language: 'mixed',
    },
  });
  check('signup returns a token', Boolean(signup.body.token), JSON.stringify(signup.body));
  check('new shop is not onboarded', signup.body.business?.onboarded === false);
  token = signup.body.token;

  const badPin = await call('/api/auth/signup', {
    method: 'POST',
    body: { phone: '0700000001', pin: '12', business_name: 'x', owner_name: 'y' },
  });
  check('short PIN is rejected', badPin.status === 400);

  const shortPhone = await call('/api/auth/signup', {
    method: 'POST',
    body: { phone: '0701891', pin: '1234', business_name: 'x', owner_name: 'y' },
  });
  check('short phone is rejected', shortPhone.status === 400);

  const duplicate = await call('/api/auth/signup', {
    method: 'POST',
    body: { phone, pin: '4321', business_name: 'Test Duka', owner_name: 'Amina' },
  });
  check('duplicate phone is rejected', duplicate.status === 409);

  const guest = await call('/api/auth/guest', { method: 'POST', body: {} });
  check('guest login returns a token', Boolean(guest.body.token), JSON.stringify(guest.body));
  check('guest shop is onboarded', guest.body.business?.onboarded === true);
  if (guest.body.business?.phone) createdPhones.push(guest.body.business.phone);

  const openShop = await call('/api/auth/login', { method: 'POST', body: { phone: '0701891234' } });
  check('open shop 0701891234 needs no PIN', Boolean(openShop.body.token) && openShop.body.business?.phone === '0701891234');

  const emptyAudio = await call('/api/transcribe', { method: 'POST', body: {} });
  check('transcribe rejects empty audio', emptyAudio.status === 400);

  const emptyTts = await call('/api/tts', { method: 'POST', body: {} });
  check('tts rejects empty text', emptyTts.status === 400);

  console.log('\n2. Onboarding');
  const onboarded = await call('/api/auth/business', {
    method: 'PATCH',
    body: { business_type: 'mama_mboga', currency: 'KES', language: 'sw', onboarded: true },
  });
  check('business type saved', onboarded.body.business?.business_type === 'mama_mboga');
  check('onboarding flag saved', onboarded.body.business?.onboarded === true);

  const firstItem = await call('/api/items', {
    method: 'POST',
    body: { name: 'Sukuma', unit: 'bunch', qty_on_hand: 30, cost_price: 10, price: 20, low_stock_threshold: 5 },
  });
  check('first item created', firstItem.status === 201);

  console.log('\n3. Dashboard');
  const emptyDash = await call('/api/dashboard');
  check('dashboard loads for a fresh shop', emptyDash.status === 200);
  check('totals start at zero', emptyDash.body.totals?.cash_sales === 0);
  check('proactive tip is present', typeof emptyDash.body.tip?.text === 'string');

  console.log('\n4. Inventory');
  await call('/api/items', {
    method: 'POST',
    body: { name: 'Tomato', unit: 'kg', qty_on_hand: 4, cost_price: 60, price: 100, low_stock_threshold: 5 },
  });
  const items = await call('/api/items');
  check('inventory lists both items', items.body.items?.length === 2);
  check('low stock is flagged', items.body.items?.some((item) => item.name === 'Tomato' && item.low_stock));

  const search = await call('/api/items?search=suku');
  check('search filters items', search.body.items?.length === 1);

  const lowOnly = await call('/api/items?low=true');
  check('low-stock filter works', lowOnly.body.items?.every((item) => item.low_stock));

  const edited = await call(`/api/items/${firstItem.body.item.id}`, {
    method: 'PATCH',
    body: { price: 25 },
  });
  check('item price can be edited', edited.body.item?.price === 25);

  const restock = await call('/api/transaction', {
    method: 'POST',
    body: { action: 'restock', items: [{ name: 'Tomato', qty: 20 }] },
  });
  check('voice restock adds stock', restock.body.items?.[0]?.qty_on_hand === 24, JSON.stringify(restock.body));
  check('restock spoken message is short', /^Done\. Added /.test(restock.body.message || ''), restock.body.message);

  console.log('\n4b. Halima inventory rules');
  const sugarItem = await call('/api/items', {
    method: 'POST',
    body: { name: 'Sugar', unit: 'kg', qty_on_hand: 10, cost_price: 80, price: 100, low_stock_threshold: 3 },
  });
  check('sugar added for stock tests', sugarItem.status === 201);

  const test1 = await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'Sugar', qty: 2 }],
      payment_type: 'credit',
      customer_name: 'Moha',
    },
  });
  check('TEST 1 records 2kg sugar for Moha', test1.status === 200 && test1.body.receipt?.lines?.[0]?.qty_on_hand === 8, JSON.stringify(test1.body));
  check('TEST 1 names Moha', test1.body.receipt?.customer?.name === 'Moha');
  check('TEST 1 spoken is brief', /Done\. I recorded 2 kg of Sugar for Moha/.test(test1.body.message || ''), test1.body.message);
  await call(`/api/transactions/${test1.body.receipt.batch_id}/undo`, { method: 'POST' });

  await call(`/api/items/${sugarItem.body.item.id}`, { method: 'PATCH', body: { qty_on_hand: 0 } });
  const test2 = await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'Sugar', qty: 2 }],
      payment_type: 'credit',
      customer_name: 'Moha',
    },
  });
  check('TEST 2 rejects empty stock', test2.status === 409 && /out of stock/i.test(test2.body.message || ''), JSON.stringify(test2.body));
  const afterZero = await call('/api/items?search=sugar');
  check('TEST 2 sugar stays at 0', afterZero.body.items?.[0]?.qty_on_hand === 0);

  await call(`/api/items/${sugarItem.body.item.id}`, { method: 'PATCH', body: { qty_on_hand: 1 } });
  const test3 = await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'Sugar', qty: 2 }],
      payment_type: 'credit',
      customer_name: 'Moha',
    },
  });
  check('TEST 3 rejects insufficient stock', test3.status === 409 && /only have 1 kg/i.test(test3.body.message || ''), JSON.stringify(test3.body));
  const afterOne = await call('/api/items?search=sugar');
  check('TEST 3 sugar stays at 1', afterOne.body.items?.[0]?.qty_on_hand === 1);

  const riceBefore = await call('/api/items');
  const riceCount = riceBefore.body.items?.length;
  const test4 = await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'Rice', qty: 2 }],
      payment_type: 'credit',
      customer_name: 'Moha',
    },
  });
  check('TEST 4 rejects unknown rice', test4.status === 404 && /not in your inventory/i.test(test4.body.message || ''), JSON.stringify(test4.body));
  const riceAfter = await call('/api/items');
  check('TEST 4 does not create rice', riceAfter.body.items?.length === riceCount && !riceAfter.body.items?.some((row) => /rice/i.test(row.name)));
  const sugarUnchanged = await call('/api/items?search=sugar');
  check('TEST 4 sugar remains 1kg', sugarUnchanged.body.items?.[0]?.qty_on_hand === 1);

  await call(`/api/items/${sugarItem.body.item.id}`, { method: 'PATCH', body: { qty_on_hand: 10 } });
  const test5 = await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'sugar', qty: 2 }],
      payment_type: 'credit',
      customer_name: 'Moha',
    },
  });
  check('TEST 5 credit deducts sugar', test5.body.receipt?.lines?.[0]?.qty_on_hand === 8);
  check('TEST 5 Moha debt increases', test5.body.receipt?.customer?.balance === 200, JSON.stringify(test5.body.receipt?.customer));
  check('TEST 5 is a credit entry', test5.body.receipt?.action === 'credit');
  await call(`/api/transactions/${test5.body.receipt.batch_id}/undo`, { method: 'POST' });

  const test6 = await call('/api/transaction', {
    method: 'POST',
    body: { action: 'restock', items: [{ name: 'Sugar', qty: 10 }] },
  });
  check('TEST 6 adds 10kg sugar', test6.body.items?.[0]?.qty_on_hand === 20, JSON.stringify(test6.body));
  check('TEST 6 spoken is brief', /Done\. Added 10 kg of Sugar/.test(test6.body.message || ''), test6.body.message);

  const test7 = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'Moha took something' },
  });
  check(
    'TEST 7 asks which product',
    /which product/i.test(test7.body.clarification || '') && !(test7.body.items || []).length,
    JSON.stringify(test7.body)
  );

  const kilos = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'Moha took two kgs of sugar' },
  });
  check(
    'speech maps kilos of sugar to the shelf',
    kilos.body.items?.[0]?.matched === true && kilos.body.items?.[0]?.name === 'Sugar' && kilos.body.items?.[0]?.qty === 2,
    JSON.stringify(kilos.body)
  );

  console.log('\n5. Sales / Voice ledger');
  const intent = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'sell two sukuma cash' },
  });
  check('speech parses to a sale intent', intent.body.action === 'sale');
  check('intent carries no money', intent.body.total === undefined && intent.body.price === undefined);

  const moha = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'Moha took 2kgs of sugar' },
  });
  check(
    'customer-first credit names Moha',
    moha.body.action === 'credit' &&
      moha.body.customer_name === 'Moha' &&
      /sugar/i.test(moha.body.items?.[0]?.name || '') &&
      moha.body.items?.[0]?.qty === 2,
    JSON.stringify(moha.body)
  );

  const asked = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'how much sukuma do I have' },
  });
  check('voice questions stay out of the ledger', asked.body.action === 'ask' && /Sukuma/.test(asked.body.answer || ''), asked.body.answer);

  const about = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'what can you do' },
  });
  check(
    'voice knows SautiLedger',
    about.body.action === 'ask' && /SautiLedger/.test(about.body.answer || ''),
    about.body.answer
  );

  const sale = await call('/api/transaction', { method: 'POST', body: intent.body });
  check('sale is priced by the database', sale.body.receipt?.total === 50, JSON.stringify(sale.body));
  check('stock decremented', sale.body.receipt?.lines?.[0]?.qty_on_hand === 28);
  check('spoken message returned', /Done\. I recorded 2 bunch of Sukuma/.test(sale.body.message || ''), sale.body.message);

  const creditIntent = await call('/api/parse-intent', {
    method: 'POST',
    body: { transcript: 'credit 3 tomato to Mama Njeri' },
  });
  const credit = await call('/api/transaction', { method: 'POST', body: creditIntent.body });
  check('credit sale creates the customer', credit.body.receipt?.customer?.name === 'Mama Njeri');
  check('credit adds to balance', credit.body.receipt?.customer?.balance === 300);

  const overSell = await call('/api/transaction', {
    method: 'POST',
    body: { action: 'sale', items: [{ name: 'Sukuma', qty: 9999 }], payment_type: 'cash' },
  });
  check('overselling is blocked', overSell.status === 409);

  const feed = await call('/api/transactions');
  check("today's feed groups by entry", feed.body.transactions?.length === 2);

  const undo = await call(`/api/transactions/${credit.body.receipt.batch_id}/undo`, { method: 'POST' });
  check('undo succeeds', undo.status === 200);
  const afterUndo = await call('/api/customers');
  check('undo reverses the balance', afterUndo.body.outstanding === 0, JSON.stringify(afterUndo.body));
  const stockBack = await call('/api/items?search=tomato');
  check('undo restores stock', stockBack.body.items?.[0]?.qty_on_hand === 24);

  console.log('\n6. Customers / Madeni');
  await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'Tomato', qty: 2 }],
      payment_type: 'credit',
      customer_name: 'Mama Njeri',
    },
  });
  const customers = await call('/api/customers');
  check('outstanding total is computed', customers.body.outstanding === 200);
  check(
    'credit items list names the person',
    customers.body.taken?.some((row) => row.customer_name === 'Mama Njeri' && /Tomato/i.test(row.item_name || '')),
    JSON.stringify(customers.body.taken)
  );
  const customerId = customers.body.customers.find((row) => row.name === 'Mama Njeri').id;

  const detail = await call(`/api/customers/${customerId}`);
  check('customer history loads', detail.body.history?.length >= 1);

  const repayment = await call(`/api/customers/${customerId}/repayment`, {
    method: 'POST',
    body: { amount: 150 },
  });
  check('repayment reduces balance', repayment.body.receipt?.customer?.balance === 50);

  const stillOwes = await call('/api/customers');
  check(
    'credit list stays while they still owe',
    stillOwes.body.taken?.some((row) => row.customer_name === 'Mama Njeri'),
    JSON.stringify(stillOwes.body.taken)
  );

  const settle = await call(`/api/customers/${customerId}/repayment`, {
    method: 'POST',
    body: { amount: 50 },
  });
  check('full payment clears the balance', settle.body.receipt?.customer?.balance === 0);

  const settled = await call('/api/customers');
  check(
    'paid credits leave the taken list',
    !settled.body.taken?.some((row) => row.customer_name === 'Mama Njeri'),
    JSON.stringify(settled.body.taken)
  );

  const overpay = await call(`/api/customers/${customerId}/repayment`, {
    method: 'POST',
    body: { amount: 0 },
  });
  check('zero repayment is rejected', overpay.status === 400);

  await call('/api/transaction', {
    method: 'POST',
    body: {
      action: 'credit',
      items: [{ name: 'Tomato', qty: 1 }],
      payment_type: 'credit',
      customer_name: 'Mama Njeri',
    },
  });

  console.log('\n7. Reports');
  for (const range of ['today', 'week', 'month']) {
    const report = await call(`/api/reports?range=${range}`);
    check(`${range} report loads`, report.status === 200);
    check(
      `${range} profit equals revenue minus cost`,
      Math.abs(report.body.totals.profit - (report.body.totals.revenue - report.body.totals.cost)) < 0.01
    );
  }
  const week = await call('/api/reports?range=week');
  check('daily series covers 7 days', week.body.series?.length === 7);
  check('top items ranked', Array.isArray(week.body.top_items));
  check('closing stock valued', week.body.stock?.at_cost > 0);

  console.log('\n8. AI Assistant');
  const questions = [
    ['Who owes me the most?', /Mama Njeri/],
    ['Should I restock?', /Restock|stocked/],
    ['How much profit this week?', /profit/],
    ['What are my best sellers?', /best sellers|No sales/],
    ['What is my stock worth?', /worth/],
    ['What is on my shelf?', /Sukuma|stocking/],
    ['How much Sukuma do I have?', /Sukuma/],
    ['What can you do?', /SautiLedger|voice ledger/],
  ];
  for (const [question, pattern] of questions) {
    const answer = await call('/api/assistant', { method: 'POST', body: { question } });
    check(`"${question}"`, pattern.test(answer.body.answer || ''), answer.body.answer);
  }

  console.log('\nSecurity');
  const saved = token;
  token = null;
  check('dashboard needs auth', (await call('/api/dashboard')).status === 401);
  token = 'forged.token';
  check('forged token rejected', (await call('/api/items')).status === 401);
  token = saved;

  const otherPhone = `07${Math.floor(10000000 + Math.random() * 89999999)}`;
  createdPhones.push(otherPhone);
  const other = await call('/api/auth/signup', {
    method: 'POST',
    body: { phone: otherPhone, pin: '9999', business_name: 'Other', owner_name: 'Zawadi' },
  });
  const mine = (await call('/api/items')).body.items[0].id;
  token = other.body.token;
  const crossTenant = await call(`/api/items/${mine}`, { method: 'PATCH', body: { price: 1 } });
  check('another shop cannot touch my items', crossTenant.status === 404);
  const otherItems = await call('/api/items');
  check('new shop sees an empty shelf', otherItems.body.items.length === 0);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}

run()
  .catch((error) => {
    console.error('Harness crashed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Test shops are removed so the demo database stays as seeded.
    if (createdPhones.length > 0) {
      await pool.query('DELETE FROM businesses WHERE phone = ANY($1)', [createdPhones]);
    }
    await pool.end();
  });
