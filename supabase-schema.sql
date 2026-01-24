-- ===== SUPABASE DATABASE SCHEMA =====
-- Это SQL нужно выполнить в Supabase SQL Editor
-- для создания всех необходимых таблиц

-- 1. Таблица аккаунтов (пользователи системы)
CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Таблица магазинов (businesses)
CREATE TABLE IF NOT EXISTS businesses (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  wb_api_key TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Миграция (если таблица уже создана):
-- ALTER TABLE businesses ALTER COLUMN wb_api_key DROP NOT NULL;

-- 3. Таблица себестоимости товаров
CREATE TABLE IF NOT EXISTS product_costs (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  nm_id TEXT NOT NULL,
  subject TEXT,
  brand TEXT,
  custom_name TEXT,
  cost DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, nm_id)
);

-- 3.1 Таблица движения денег (ДДС)
CREATE TABLE IF NOT EXISTS cash_transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  business_id BIGINT REFERENCES businesses(id) ON DELETE SET NULL,
  tx_type TEXT NOT NULL, -- 'income' | 'expense'
  amount DECIMAL(12,2) NOT NULL,
  tx_date TIMESTAMPTZ NOT NULL,
  category TEXT,
  counterparty TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 Таблица долгов
CREATE TABLE IF NOT EXISTS cash_debts (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  business_id BIGINT REFERENCES businesses(id) ON DELETE SET NULL,
  debt_type TEXT NOT NULL, -- 'receivable' | 'payable'
  amount DECIMAL(12,2) NOT NULL,
  counterparty TEXT,
  due_date TIMESTAMPTZ,
  status TEXT DEFAULT 'open', -- 'open' | 'closed'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 Таблица категорий ДДС (привязка к аккаунту)
CREATE TABLE IF NOT EXISTS cash_categories (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, name_normalized)
);

-- 3.3 Таблица контрагентов (привязка к аккаунту)
CREATE TABLE IF NOT EXISTS counterparties (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, name_normalized)
);

-- 4. Таблица продаж WB
CREATE TABLE IF NOT EXISTS wb_sales (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Основные поля из WB API
  sale_dt TIMESTAMPTZ,
  last_change_dt TIMESTAMPTZ,
  supplier_article TEXT,
  tech_size TEXT,
  barcode TEXT,
  total_price DECIMAL(10,2),
  discount_percent INTEGER,
  is_supply BOOLEAN,
  is_realization BOOLEAN,
  promo_code_discount DECIMAL(10,2),
  warehouse_name TEXT,
  country_name TEXT,
  oblast_okrug_name TEXT,
  region_name TEXT,
  income_id BIGINT,
  sale_id TEXT,
  odid BIGINT,
  spp DECIMAL(10,2),
  for_pay DECIMAL(10,2),
  finished_price DECIMAL(10,2),
  price_with_disc DECIMAL(10,2),
  nm_id BIGINT,
  subject TEXT,
  category TEXT,
  brand TEXT,
  is_storno INTEGER,
  g_number TEXT,
  sticker TEXT,
  srid TEXT,
  
  -- Служебные поля
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, sale_id)
);

-- 5. Таблица заказов WB
CREATE TABLE IF NOT EXISTS wb_orders (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Основные поля из WB API
  order_dt TIMESTAMPTZ,
  last_change_dt TIMESTAMPTZ,
  supplier_article TEXT,
  tech_size TEXT,
  barcode TEXT,
  total_price DECIMAL(10,2),
  discount_percent INTEGER,
  warehouse_name TEXT,
  oblast TEXT,
  income_id BIGINT,
  odid BIGINT,
  nm_id BIGINT,
  subject TEXT,
  category TEXT,
  brand TEXT,
  is_cancel BOOLEAN,
  cancel_dt TIMESTAMPTZ,
  g_number TEXT,
  sticker TEXT,
  srid TEXT,
  
  -- Служебные поля
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, odid)
);

-- 6. Таблица финансовых отчетов WB (65 колонок данных + 3 системных)
CREATE TABLE IF NOT EXISTS wb_financial_reports (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Основные поля из reportDetailByPeriod
  realizationreport_id BIGINT,
  date_from TIMESTAMPTZ,
  date_to TIMESTAMPTZ,
  create_dt TIMESTAMPTZ,
  currency_name TEXT,
  suppliercontract_code TEXT,
  rrd_id BIGINT,
  gi_id BIGINT,
  subject_name TEXT,
  nm_id BIGINT,
  brand_name TEXT,
  sa_name TEXT,
  ts_name TEXT,
  barcode TEXT,
  doc_type_name TEXT,
  quantity INTEGER,
  retail_price DECIMAL(10,2),
  retail_amount DECIMAL(10,2),
  sale_percent INTEGER,
  commission_percent DECIMAL(10,2),
  office_name TEXT,
  supplier_oper_name TEXT,
  order_dt TIMESTAMPTZ,
  sale_dt TIMESTAMPTZ,
  rr_dt TIMESTAMPTZ,
  shk_id BIGINT,
  retail_price_withdisc_rub DECIMAL(10,2),
  delivery_amount INTEGER,
  return_amount INTEGER,
  delivery_rub DECIMAL(10,2),
  gi_box_type_name TEXT,
  product_discount_for_report DECIMAL(10,2),
  supplier_promo DECIMAL(10,2),
  rid BIGINT,
  ppvz_spp_prc DECIMAL(10,2),
  ppvz_kvw_prc_base DECIMAL(10,2),
  ppvz_kvw_prc DECIMAL(10,2),
  sup_rating_prc_up DECIMAL(10,2),
  is_kgvp_v2 DECIMAL(10,2),
  ppvz_sales_commission DECIMAL(10,2),
  ppvz_for_pay DECIMAL(10,2),
  ppvz_reward DECIMAL(10,2),
  acquiring_fee DECIMAL(10,2),
  acquiring_bank TEXT,
  ppvz_vw DECIMAL(10,2),
  ppvz_vw_nds DECIMAL(10,2),
  ppvz_office_id BIGINT,
  ppvz_office_name TEXT,
  ppvz_supplier_id BIGINT,
  ppvz_supplier_name TEXT,
  ppvz_inn TEXT,
  declaration_number TEXT,
  bonus_type_name TEXT,
  sticker_id TEXT,
  site_country TEXT,
  penalty DECIMAL(10,2),
  additional_payment DECIMAL(10,2),
  rebill_logistic_cost DECIMAL(10,2),
  rebill_logistic_org TEXT,
  kiz TEXT,
  storage_fee DECIMAL(10,2),
  deduction DECIMAL(10,2),
  acceptance DECIMAL(10,2),
  srid TEXT,
  report_type INTEGER,
  
  -- Служебные поля
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, rrd_id)
);

-- 7. Таблица логов синхронизации
CREATE TABLE IF NOT EXISTS sync_logs (
  id BIGSERIAL PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'sales', 'orders', 'financial'
  status TEXT NOT NULL, -- 'success', 'error', 'in_progress'
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Создание индексов для быстрых запросов
CREATE INDEX IF NOT EXISTS idx_businesses_account_id ON businesses(account_id);
CREATE INDEX IF NOT EXISTS idx_businesses_is_active ON businesses(is_active);
CREATE INDEX IF NOT EXISTS idx_product_costs_business_id ON product_costs(business_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_nm_id ON product_costs(nm_id);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_account_id ON cash_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_business_id ON cash_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_date ON cash_transactions(tx_date);

CREATE INDEX IF NOT EXISTS idx_cash_debts_account_id ON cash_debts(account_id);
CREATE INDEX IF NOT EXISTS idx_cash_debts_business_id ON cash_debts(business_id);
CREATE INDEX IF NOT EXISTS idx_cash_debts_status ON cash_debts(status);

CREATE INDEX IF NOT EXISTS idx_wb_sales_business_id ON wb_sales(business_id);
CREATE INDEX IF NOT EXISTS idx_wb_sales_nm_id ON wb_sales(nm_id);
CREATE INDEX IF NOT EXISTS idx_wb_sales_sale_dt ON wb_sales(sale_dt);
CREATE INDEX IF NOT EXISTS idx_wb_sales_synced_at ON wb_sales(synced_at);

CREATE INDEX IF NOT EXISTS idx_wb_orders_business_id ON wb_orders(business_id);
CREATE INDEX IF NOT EXISTS idx_wb_orders_nm_id ON wb_orders(nm_id);
CREATE INDEX IF NOT EXISTS idx_wb_orders_order_dt ON wb_orders(order_dt);
CREATE INDEX IF NOT EXISTS idx_wb_orders_synced_at ON wb_orders(synced_at);

CREATE INDEX IF NOT EXISTS idx_wb_financial_business_id ON wb_financial_reports(business_id);
CREATE INDEX IF NOT EXISTS idx_wb_financial_nm_id ON wb_financial_reports(nm_id);
CREATE INDEX IF NOT EXISTS idx_wb_financial_sale_dt ON wb_financial_reports(sale_dt);
CREATE INDEX IF NOT EXISTS idx_wb_financial_synced_at ON wb_financial_reports(synced_at);

CREATE INDEX IF NOT EXISTS idx_sync_logs_business_id ON sync_logs(business_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON businesses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_costs_updated_at BEFORE UPDATE ON product_costs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cash_transactions_updated_at BEFORE UPDATE ON cash_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cash_debts_updated_at BEFORE UPDATE ON cash_debts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - опционально, можно включить позже
-- ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wb_sales ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wb_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wb_financial_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- ===== ГОТОВО! =====
-- Теперь выполни этот SQL в Supabase SQL Editor:
-- 1. Открой https://supabase.com/dashboard/project/fjkcpndtirljciaaakpr/editor
-- 2. Нажми "SQL Editor" в левом меню
-- 3. Создай новый запрос ("New query")
-- 4. Скопируй весь этот файл и вставь туда
-- 5. Нажми "Run" или F5
