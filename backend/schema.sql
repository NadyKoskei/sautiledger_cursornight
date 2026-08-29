-- Idempotent schema for deploys (Render, local node). Does not drop data.
-- For a full local wipe, use init.sql with Docker or psql instead.

CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'duka'
    CHECK (business_type IN ('duka', 'mama_mboga', 'kiosk', 'other')),
  currency TEXT NOT NULL DEFAULT 'KES',
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'sw', 'mixed')),
  onboarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'piece',
  qty_on_hand NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  price NUMERIC(12, 2) NOT NULL,
  low_stock_threshold NUMERIC(12, 2) NOT NULL DEFAULT 5,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS items_business_name_idx
  ON items (business_id, lower(name))
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS customers_business_name_idx
  ON customers (business_id, lower(name));

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  batch_id UUID NOT NULL DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('sale', 'credit', 'repayment')),
  item_id INTEGER REFERENCES items (id) ON DELETE SET NULL,
  item_name TEXT,
  qty NUMERIC(12, 2),
  unit_price NUMERIC(12, 2),
  unit_cost NUMERIC(12, 2),
  total NUMERIC(12, 2) NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'cash' CHECK (payment_type IN ('cash', 'credit')),
  customer_id INTEGER REFERENCES customers (id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'voice' CHECK (source IN ('voice', 'manual')),
  transcript TEXT,
  voided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_business_created_idx
  ON transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_batch_idx ON transactions (batch_id);
CREATE INDEX IF NOT EXISTS transactions_customer_idx ON transactions (customer_id);
