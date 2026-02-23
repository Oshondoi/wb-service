-- =============================================
-- FBO SCANNING v1.4
-- Партии привязаны к магазину: name = company_name, id-счётчик по магазину
-- =============================================

BEGIN;

-- 1) Расширяем fbo_batches
ALTER TABLE fbo_batches
  ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES businesses(id) ON DELETE RESTRICT;

ALTER TABLE fbo_batches
  ADD COLUMN IF NOT EXISTS seq_no BIGINT;

ALTER TABLE fbo_batches
  ADD COLUMN IF NOT EXISTS public_id TEXT;

-- Старый уникальный индекс по account+name мешает создавать много партий одного магазина
DROP INDEX IF EXISTS ux_fbo_batches_account_name_ci;

CREATE INDEX IF NOT EXISTS idx_fbo_batches_account_name_ci
  ON fbo_batches (account_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_fbo_batches_business_id
  ON fbo_batches (business_id);

-- 2) Счётчик партий на магазин
CREATE TABLE IF NOT EXISTS fbo_batch_counters (
  business_id BIGINT PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  next_seq_no BIGINT NOT NULL CHECK (next_seq_no >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Бэкофилл business_id для старых партий (первый активный магазин аккаунта)
UPDATE fbo_batches b
SET business_id = x.business_id
FROM (
  SELECT a.id AS account_id,
         (
           SELECT bs.id
           FROM businesses bs
           WHERE bs.account_id = a.id AND bs.is_active = true
           ORDER BY bs.id ASC
           LIMIT 1
         ) AS business_id
  FROM accounts a
) x
WHERE b.account_id = x.account_id
  AND b.business_id IS NULL
  AND x.business_id IS NOT NULL;

-- 4) Генерация seq_no/public_id для партии в рамках магазина
CREATE OR REPLACE FUNCTION fbo_assign_batch_public_id()
RETURNS TRIGGER AS $$
DECLARE
  v_company_name TEXT;
  v_next_seq BIGINT;
BEGIN
  IF NEW.business_id IS NULL THEN
    RAISE EXCEPTION 'business_id is required for batch';
  END IF;

  SELECT company_name INTO v_company_name FROM businesses WHERE id = NEW.business_id;
  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'business_id % not found', NEW.business_id;
  END IF;

  NEW.name := btrim(v_company_name);

  IF NEW.seq_no IS NULL THEN
    WITH seq AS (
      INSERT INTO fbo_batch_counters (business_id, next_seq_no)
      VALUES (NEW.business_id, 2)
      ON CONFLICT (business_id)
      DO UPDATE SET
        next_seq_no = fbo_batch_counters.next_seq_no + 1,
        updated_at = NOW()
      RETURNING next_seq_no
    )
    SELECT CASE WHEN next_seq_no = 2 THEN 1 ELSE next_seq_no - 1 END
    INTO v_next_seq
    FROM seq;

    NEW.seq_no := v_next_seq;
  END IF;

  IF NEW.public_id IS NULL OR btrim(NEW.public_id) = '' THEN
    NEW.public_id := btrim(v_company_name) || ' - ' || NEW.seq_no::TEXT;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fbo_assign_batch_public_id ON fbo_batches;
CREATE TRIGGER trg_fbo_assign_batch_public_id
BEFORE INSERT ON fbo_batches
FOR EACH ROW EXECUTE FUNCTION fbo_assign_batch_public_id();

-- 5) Для существующих партий, где seq/public отсутствуют
UPDATE fbo_batches
SET seq_no = id
WHERE seq_no IS NULL;

UPDATE fbo_batches b
SET public_id = btrim(COALESCE(bs.company_name, b.name, 'Партия')) || ' - ' || b.seq_no::TEXT
FROM businesses bs
WHERE bs.id = b.business_id
  AND (b.public_id IS NULL OR btrim(b.public_id) = '' OR b.public_id ~ '^[0-9]+$');

-- 6) Уникальность id партии внутри магазина
CREATE UNIQUE INDEX IF NOT EXISTS ux_fbo_batches_business_seq_no
  ON fbo_batches (business_id, seq_no)
  WHERE business_id IS NOT NULL AND seq_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fbo_batches_business_public_id
  ON fbo_batches (business_id, public_id)
  WHERE business_id IS NOT NULL AND public_id IS NOT NULL;

-- 7) Обновляем проверку ссылок shipment: batch должен принадлежать account и тому же business
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
