-- =============================================
-- FBO SCANNING v1.3
-- Добавление сущности «Партии» (parent) и связи shipment -> batch
-- =============================================

BEGIN;

-- 1) Партии (родитель для поставок)
CREATE TABLE IF NOT EXISTS fbo_batches (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fbo_batches_name_not_empty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fbo_batches_account_name_ci
  ON fbo_batches (account_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_fbo_batches_account_active
  ON fbo_batches (account_id, is_active);

DROP TRIGGER IF EXISTS trg_fbo_batches_updated_at ON fbo_batches;
CREATE TRIGGER trg_fbo_batches_updated_at
BEFORE UPDATE ON fbo_batches
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- 2) Привязываем поставки к партии
ALTER TABLE fbo_shipments
  ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES fbo_batches(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_fbo_shipments_batch_id
  ON fbo_shipments(batch_id);

-- 3) Для существующих поставок создаём и назначаем дефолтную партию на аккаунт
INSERT INTO fbo_batches (account_id, name, created_by_user_id)
SELECT s.account_id, 'Партия по умолчанию', MIN(s.created_by_user_id)
FROM fbo_shipments s
WHERE NOT EXISTS (
  SELECT 1
  FROM fbo_batches b
  WHERE b.account_id = s.account_id
    AND lower(b.name) = lower('Партия по умолчанию')
)
GROUP BY s.account_id;

UPDATE fbo_shipments s
SET batch_id = b.id
FROM fbo_batches b
WHERE s.batch_id IS NULL
  AND s.account_id = b.account_id
  AND lower(b.name) = lower('Партия по умолчанию');

ALTER TABLE fbo_shipments
  ALTER COLUMN batch_id SET NOT NULL;

-- 4) Валидация ссылок shipment: source/warehouse/batch должны принадлежать account_id
CREATE OR REPLACE FUNCTION fbo_check_shipment_refs()
RETURNS TRIGGER AS $$
DECLARE
  v_source_account_id BIGINT;
  v_warehouse_account_id BIGINT;
  v_batch_account_id BIGINT;
BEGIN
  SELECT account_id INTO v_source_account_id FROM fbo_sources WHERE id = NEW.source_id;
  IF v_source_account_id IS NULL OR v_source_account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'source_id % does not belong to account_id %', NEW.source_id, NEW.account_id;
  END IF;

  IF NEW.warehouse_id IS NOT NULL THEN
    SELECT account_id INTO v_warehouse_account_id FROM fbo_warehouses WHERE id = NEW.warehouse_id;
    IF v_warehouse_account_id IS NULL OR v_warehouse_account_id <> NEW.account_id THEN
      RAISE EXCEPTION 'warehouse_id % does not belong to account_id %', NEW.warehouse_id, NEW.account_id;
    END IF;
  END IF;

  SELECT account_id INTO v_batch_account_id FROM fbo_batches WHERE id = NEW.batch_id;
  IF v_batch_account_id IS NULL OR v_batch_account_id <> NEW.account_id THEN
    RAISE EXCEPTION 'batch_id % does not belong to account_id %', NEW.batch_id, NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_check_shipment_refs ON fbo_shipments;
CREATE TRIGGER trg_fbo_check_shipment_refs
BEFORE INSERT OR UPDATE OF account_id, source_id, warehouse_id, batch_id ON fbo_shipments
FOR EACH ROW EXECUTE FUNCTION fbo_check_shipment_refs();

COMMIT;
