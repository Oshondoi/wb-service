-- =============================================
-- FBO SCANNING v1.1 (ADDITIVE MIGRATION)
-- Без ломки текущей схемы: только новые таблицы/функции/индексы
-- Совместимо с существующими accounts/businesses/... таблицами
-- =============================================

BEGIN;

-- 0) Безопасно добавляем глобальный счётчик поставок на уровне аккаунта
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS shipment_seq BIGINT NOT NULL DEFAULT 0;

-- 1) Роли сотрудников внутри аккаунта (Owner / Manager)
--    ВАЖНО: этот слой не ломает текущую auth-модель, а расширяет её.
CREATE TABLE IF NOT EXISTS account_members (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_account_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  display_name TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_account_id),
  UNIQUE (account_id, email)
);

-- 2) Источники (создатель поставок)
CREATE TABLE IF NOT EXISTS fbo_sources (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fbo_sources_name_not_empty CHECK (length(btrim(name)) > 0)
);

-- Уникальность имени источника в рамках аккаунта (регистронезависимо)
CREATE UNIQUE INDEX IF NOT EXISTS ux_fbo_sources_account_name_ci
  ON fbo_sources (account_id, lower(name));

-- 3) Склады WB (справочник)
CREATE TABLE IF NOT EXISTS fbo_warehouses (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  wb_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fbo_warehouses_name_not_empty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fbo_warehouses_account_name_ci
  ON fbo_warehouses (account_id, lower(name));

-- 4) Поставки
CREATE TABLE IF NOT EXISTS fbo_shipments (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  source_id BIGINT NOT NULL REFERENCES fbo_sources(id) ON DELETE RESTRICT,
  warehouse_id BIGINT NOT NULL REFERENCES fbo_warehouses(id) ON DELETE RESTRICT,

  -- Глобальная нумерация по аккаунту
  seq_no BIGINT NOT NULL,
  public_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'done', 'canceled')),
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (account_id, seq_no),
  UNIQUE (account_id, public_id)
);

-- 5) Короба
CREATE TABLE IF NOT EXISTS fbo_boxes (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES fbo_shipments(id) ON DELETE CASCADE,
  box_no BIGINT NOT NULL,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id, box_no)
);

-- Технический счётчик коробов для безопасной параллельной нумерации
CREATE TABLE IF NOT EXISTS fbo_box_counters (
  shipment_id BIGINT PRIMARY KEY REFERENCES fbo_shipments(id) ON DELETE CASCADE,
  next_box_no BIGINT NOT NULL CHECK (next_box_no >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6) Скан-события
CREATE TABLE IF NOT EXISTS fbo_scan_events (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES fbo_shipments(id) ON DELETE CASCADE,
  box_id BIGINT NOT NULL REFERENCES fbo_boxes(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fbo_scan_events_barcode_not_empty CHECK (length(btrim(barcode)) > 0)
);

-- =============================================
-- TRIGGERS / FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at триггеры
DROP TRIGGER IF EXISTS trg_account_members_updated_at ON account_members;
CREATE TRIGGER trg_account_members_updated_at
BEFORE UPDATE ON account_members
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fbo_sources_updated_at ON fbo_sources;
CREATE TRIGGER trg_fbo_sources_updated_at
BEFORE UPDATE ON fbo_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fbo_warehouses_updated_at ON fbo_warehouses;
CREATE TRIGGER trg_fbo_warehouses_updated_at
BEFORE UPDATE ON fbo_warehouses
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fbo_shipments_updated_at ON fbo_shipments;
CREATE TRIGGER trg_fbo_shipments_updated_at
BEFORE UPDATE ON fbo_shipments
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

DROP TRIGGER IF EXISTS trg_fbo_boxes_updated_at ON fbo_boxes;
CREATE TRIGGER trg_fbo_boxes_updated_at
BEFORE UPDATE ON fbo_boxes
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- Проверка, что source / warehouse принадлежат аккаунту поставки
CREATE OR REPLACE FUNCTION fbo_check_shipment_refs()
RETURNS TRIGGER AS $$
DECLARE
  v_source_account_id BIGINT;
  v_warehouse_account_id BIGINT;
BEGIN
  SELECT account_id INTO v_source_account_id FROM fbo_sources WHERE id = NEW.source_id;
  IF v_source_account_id IS NULL OR v_source_account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'source_id % does not belong to account_id %', NEW.source_id, NEW.account_id;
  END IF;

  SELECT account_id INTO v_warehouse_account_id FROM fbo_warehouses WHERE id = NEW.warehouse_id;
  IF v_warehouse_account_id IS NULL OR v_warehouse_account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'warehouse_id % does not belong to account_id %', NEW.warehouse_id, NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_check_shipment_refs ON fbo_shipments;
CREATE TRIGGER trg_fbo_check_shipment_refs
BEFORE INSERT OR UPDATE OF account_id, source_id, warehouse_id ON fbo_shipments
FOR EACH ROW EXECUTE FUNCTION fbo_check_shipment_refs();

-- Авто seq_no + public_id: SOURCE_NAME-<global_seq_by_account>
CREATE OR REPLACE FUNCTION fbo_assign_shipment_public_id()
RETURNS TRIGGER AS $$
DECLARE
  v_next_seq BIGINT;
  v_source_name TEXT;
BEGIN
  IF NEW.seq_no IS NOT NULL AND NEW.public_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE accounts
  SET shipment_seq = shipment_seq + 1
  WHERE id = NEW.account_id
  RETURNING shipment_seq INTO v_next_seq;

  IF v_next_seq IS NULL THEN
    RAISE EXCEPTION 'account_id % not found while generating shipment seq', NEW.account_id;
  END IF;

  SELECT name INTO v_source_name FROM fbo_sources WHERE id = NEW.source_id;
  IF v_source_name IS NULL THEN
    RAISE EXCEPTION 'source_id % not found while generating public_id', NEW.source_id;
  END IF;

  NEW.seq_no = v_next_seq;
  NEW.public_id = btrim(v_source_name) || '-' || v_next_seq::TEXT;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_assign_shipment_public_id ON fbo_shipments;
CREATE TRIGGER trg_fbo_assign_shipment_public_id
BEFORE INSERT ON fbo_shipments
FOR EACH ROW EXECUTE FUNCTION fbo_assign_shipment_public_id();

-- Запрет редактирования закрытых/отменённых поставок (done/canceled)
CREATE OR REPLACE FUNCTION fbo_block_mutations_when_closed()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
  v_shipment_id BIGINT;
BEGIN
  v_shipment_id := COALESCE(NEW.shipment_id, OLD.shipment_id);
  SELECT status INTO v_status FROM fbo_shipments WHERE id = v_shipment_id;

  IF v_status IN ('done', 'canceled') THEN
    RAISE EXCEPTION 'shipment % has status %, mutations are forbidden', v_shipment_id, v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_boxes_block_closed_ins ON fbo_boxes;
CREATE TRIGGER trg_fbo_boxes_block_closed_ins
BEFORE INSERT ON fbo_boxes
FOR EACH ROW EXECUTE FUNCTION fbo_block_mutations_when_closed();

DROP TRIGGER IF EXISTS trg_fbo_boxes_block_closed_upd ON fbo_boxes;
CREATE TRIGGER trg_fbo_boxes_block_closed_upd
BEFORE UPDATE ON fbo_boxes
FOR EACH ROW EXECUTE FUNCTION fbo_block_mutations_when_closed();

DROP TRIGGER IF EXISTS trg_fbo_boxes_block_closed_del ON fbo_boxes;
CREATE TRIGGER trg_fbo_boxes_block_closed_del
BEFORE DELETE ON fbo_boxes
FOR EACH ROW EXECUTE FUNCTION fbo_block_mutations_when_closed();

DROP TRIGGER IF EXISTS trg_fbo_scans_block_closed_ins ON fbo_scan_events;
CREATE TRIGGER trg_fbo_scans_block_closed_ins
BEFORE INSERT ON fbo_scan_events
FOR EACH ROW EXECUTE FUNCTION fbo_block_mutations_when_closed();

DROP TRIGGER IF EXISTS trg_fbo_scans_block_closed_upd ON fbo_scan_events;
CREATE TRIGGER trg_fbo_scans_block_closed_upd
BEFORE UPDATE ON fbo_scan_events
FOR EACH ROW EXECUTE FUNCTION fbo_block_mutations_when_closed();

DROP TRIGGER IF EXISTS trg_fbo_scans_block_closed_del ON fbo_scan_events;
CREATE TRIGGER trg_fbo_scans_block_closed_del
BEFORE DELETE ON fbo_scan_events
FOR EACH ROW EXECUTE FUNCTION fbo_block_mutations_when_closed();

-- Запрет отката статуса done/canceled обратно в draft
CREATE OR REPLACE FUNCTION fbo_validate_shipment_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('done', 'canceled') AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'shipment %: cannot move status from % back to draft', OLD.id, OLD.status;
  END IF;

  IF NEW.status = 'done' AND OLD.status <> 'done' THEN
    NEW.closed_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_validate_status_transition ON fbo_shipments;
CREATE TRIGGER trg_fbo_validate_status_transition
BEFORE UPDATE OF status ON fbo_shipments
FOR EACH ROW EXECUTE FUNCTION fbo_validate_shipment_status_transition();

-- Автонумерация box_no (параллельно-безопасная)
CREATE OR REPLACE FUNCTION fbo_assign_next_box_no()
RETURNS TRIGGER AS $$
DECLARE
  v_next_box_no BIGINT;
BEGIN
  IF NEW.box_no IS NOT NULL THEN
    RETURN NEW;
  END IF;

  WITH seq AS (
    INSERT INTO fbo_box_counters (shipment_id, next_box_no)
    VALUES (NEW.shipment_id, 2)
    ON CONFLICT (shipment_id)
    DO UPDATE SET
      next_box_no = fbo_box_counters.next_box_no + 1,
      updated_at = NOW()
    RETURNING next_box_no
  )
  SELECT CASE WHEN next_box_no = 2 THEN 1 ELSE next_box_no - 1 END
  INTO v_next_box_no
  FROM seq;

  NEW.box_no = v_next_box_no;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_assign_next_box_no ON fbo_boxes;
CREATE TRIGGER trg_fbo_assign_next_box_no
BEFORE INSERT ON fbo_boxes
FOR EACH ROW EXECUTE FUNCTION fbo_assign_next_box_no();

-- Проверка соответствия shipment_id у scan и box
CREATE OR REPLACE FUNCTION fbo_check_scan_box_shipment_match()
RETURNS TRIGGER AS $$
DECLARE
  v_box_shipment_id BIGINT;
BEGIN
  SELECT shipment_id INTO v_box_shipment_id FROM fbo_boxes WHERE id = NEW.box_id;

  IF v_box_shipment_id IS NULL THEN
    RAISE EXCEPTION 'box_id % not found', NEW.box_id;
  END IF;

  IF v_box_shipment_id <> NEW.shipment_id THEN
    RAISE EXCEPTION 'box_id % belongs to shipment %, but event shipment is %', NEW.box_id, v_box_shipment_id, NEW.shipment_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_check_scan_box_shipment_match ON fbo_scan_events;
CREATE TRIGGER trg_fbo_check_scan_box_shipment_match
BEFORE INSERT OR UPDATE OF shipment_id, box_id ON fbo_scan_events
FOR EACH ROW EXECUTE FUNCTION fbo_check_scan_box_shipment_match();

-- =============================================
-- HELPER FUNCTIONS (удобно для API)
-- =============================================

-- Создание поставки одной функцией (атомарно)
CREATE OR REPLACE FUNCTION fbo_create_shipment(
  p_account_id BIGINT,
  p_source_id BIGINT,
  p_warehouse_id BIGINT,
  p_created_by_user_id BIGINT
)
RETURNS fbo_shipments
LANGUAGE plpgsql
AS $$
DECLARE
  v_row fbo_shipments;
BEGIN
  INSERT INTO fbo_shipments (
    account_id,
    source_id,
    warehouse_id,
    created_by_user_id
  ) VALUES (
    p_account_id,
    p_source_id,
    p_warehouse_id,
    p_created_by_user_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Создание короба в поставке одной функцией (автонумерация)
CREATE OR REPLACE FUNCTION fbo_create_box(
  p_shipment_id BIGINT,
  p_created_by_user_id BIGINT
)
RETURNS fbo_boxes
LANGUAGE plpgsql
AS $$
DECLARE
  v_row fbo_boxes;
BEGIN
  INSERT INTO fbo_boxes (
    shipment_id,
    created_by_user_id
  ) VALUES (
    p_shipment_id,
    p_created_by_user_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Отмена последнего скана по поставке
CREATE OR REPLACE FUNCTION fbo_undo_last_scan(
  p_shipment_id BIGINT,
  p_user_id BIGINT DEFAULT NULL
)
RETURNS fbo_scan_events
LANGUAGE plpgsql
AS $$
DECLARE
  v_last fbo_scan_events;
BEGIN
  SELECT * INTO v_last
  FROM fbo_scan_events
  WHERE shipment_id = p_shipment_id
    AND (p_user_id IS NULL OR created_by_user_id = p_user_id)
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_last.id IS NULL THEN
    RAISE EXCEPTION 'no scan events found for shipment %', p_shipment_id;
  END IF;

  DELETE FROM fbo_scan_events WHERE id = v_last.id;
  RETURN v_last;
END;
$$;

-- =============================================
-- REPORT VIEWS
-- =============================================

CREATE OR REPLACE VIEW v_fbo_box_barcode_qty AS
SELECT
  b.shipment_id,
  b.id AS box_id,
  b.box_no,
  e.barcode,
  COUNT(*)::BIGINT AS qty
FROM fbo_boxes b
JOIN fbo_scan_events e ON e.box_id = b.id
GROUP BY b.shipment_id, b.id, b.box_no, e.barcode;

CREATE OR REPLACE VIEW v_fbo_shipment_barcode_qty AS
SELECT
  e.shipment_id,
  e.barcode,
  COUNT(*)::BIGINT AS total_qty
FROM fbo_scan_events e
GROUP BY e.shipment_id, e.barcode;

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_account_members_account_id ON account_members(account_id);
CREATE INDEX IF NOT EXISTS idx_account_members_user_account_id ON account_members(user_account_id);
CREATE INDEX IF NOT EXISTS idx_account_members_role ON account_members(role);

CREATE INDEX IF NOT EXISTS idx_fbo_sources_account_active ON fbo_sources(account_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fbo_warehouses_account_active ON fbo_warehouses(account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_fbo_shipments_account_status_created_at ON fbo_shipments(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fbo_shipments_source_id ON fbo_shipments(source_id);
CREATE INDEX IF NOT EXISTS idx_fbo_shipments_warehouse_id ON fbo_shipments(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_fbo_boxes_shipment_id ON fbo_boxes(shipment_id);
CREATE INDEX IF NOT EXISTS idx_fbo_scan_events_shipment_created_at ON fbo_scan_events(shipment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fbo_scan_events_box_id ON fbo_scan_events(box_id);
CREATE INDEX IF NOT EXISTS idx_fbo_scan_events_barcode ON fbo_scan_events(barcode);

COMMIT;

-- =============================================
-- ПРИМЕР БАЗОВОГО НАПОЛНЕНИЯ СКЛАДОВ
-- (замени :account_id на свой ID аккаунта)
-- =============================================
-- INSERT INTO fbo_warehouses (account_id, name, wb_code, is_active)
-- VALUES
--   (:account_id, 'Коледино', 'KLD', true),
--   (:account_id, 'Электросталь', 'ELS', true),
--   (:account_id, 'Казань', 'KZN', true)
-- ON CONFLICT DO NOTHING;
