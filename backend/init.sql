-- SautiLedger schema
-- AI never does math. Postgres is the source of truth for prices, stock, and totals.

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  qty_on_hand INTEGER NOT NULL DEFAULT 0,
  price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  balance NUMERIC(10, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('sale', 'credit', 'repayment')),
  item_id INTEGER REFERENCES items (id),
  qty INTEGER,
  total NUMERIC(10, 2) NOT NULL,
  payment_type TEXT,
  customer_id INTEGER REFERENCES customers (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_name_idx ON items (name);
CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name);
CREATE INDEX IF NOT EXISTS transactions_created_at_idx ON transactions (created_at DESC);

-- Seed a typical duka shelf so the MVP can record voice sales immediately.
INSERT INTO items (name, qty_on_hand, price) VALUES
  ('Unga', 50, 150.00),
  ('Sugar', 30, 280.00),
  ('Cooking oil', 20, 250.00),
  ('Milk', 40, 60.00),
  ('Rice', 25, 200.00),
  ('Tea leaves', 15, 120.00);

INSERT INTO customers (name, balance) VALUES
  ('Mama Jane', 500.00),
  ('Baba Ali', 0.00);
