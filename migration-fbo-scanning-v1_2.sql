-- =============================================
-- FBO SCANNING v1.2
-- Расширение модели до: shipment -> shipment_warehouses -> boxes -> scans
-- =============================================

BEGIN;

-- 1) Поставка может быть создана без warehouse_id на первом шаге
ALTER TABLE fbo_shipments
  ALTER COLUMN warehouse_id DROP NOT NULL;

-- Триггер валидации ссылок для fbo_shipments: warehouse_id может быть NULL
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

  IF NEW.warehouse_id IS NOT NULL THEN
    SELECT account_id INTO v_warehouse_account_id FROM fbo_warehouses WHERE id = NEW.warehouse_id;
    IF v_warehouse_account_id IS NULL OR v_warehouse_account_id <> NEW.account_id THEN
      RAISE EXCEPTION 'warehouse_id % does not belong to account_id %', NEW.warehouse_id, NEW.account_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Связка складов внутри поставки
CREATE TABLE IF NOT EXISTS fbo_shipment_warehouses (
  id BIGSERIAL PRIMARY KEY,
  shipment_id BIGINT NOT NULL REFERENCES fbo_shipments(id) ON DELETE CASCADE,
  warehouse_id BIGINT NOT NULL REFERENCES fbo_warehouses(id) ON DELETE RESTRICT,
  created_by_user_id BIGINT REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_fbo_shipment_warehouses_shipment_id ON fbo_shipment_warehouses(shipment_id);
CREATE INDEX IF NOT EXISTS idx_fbo_shipment_warehouses_warehouse_id ON fbo_shipment_warehouses(warehouse_id);

-- 3) Короб привязываем к shipment_warehouse
ALTER TABLE fbo_boxes
  ADD COLUMN IF NOT EXISTS shipment_warehouse_id BIGINT REFERENCES fbo_shipment_warehouses(id) ON DELETE CASCADE;

-- Бэкофилл: если у поставки уже указан warehouse_id, создаём связку и переносим короба
INSERT INTO fbo_shipment_warehouses (shipment_id, warehouse_id, created_by_user_id)
SELECT s.id, s.warehouse_id, s.created_by_user_id
FROM fbo_shipments s
WHERE s.warehouse_id IS NOT NULL
ON CONFLICT (shipment_id, warehouse_id) DO NOTHING;

UPDATE fbo_boxes b
SET shipment_warehouse_id = sw.id
FROM fbo_shipments s
JOIN fbo_shipment_warehouses sw
  ON sw.shipment_id = s.id
 AND sw.warehouse_id = s.warehouse_id
WHERE b.shipment_id = s.id
  AND b.shipment_warehouse_id IS NULL
  AND s.warehouse_id IS NOT NULL;

ALTER TABLE fbo_boxes
  ALTER COLUMN shipment_warehouse_id SET NOT NULL;

-- Убираем старую уникальность (shipment_id, box_no), добавляем новую (shipment_warehouse_id, box_no)
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'fbo_boxes'::regclass
    AND contype = 'u'
    AND conname = 'fbo_boxes_shipment_id_box_no_key';

  IF con_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE fbo_boxes DROP CONSTRAINT ' || quote_ident(con_name);
  END IF;
END $$;

ALTER TABLE fbo_boxes
  ADD CONSTRAINT fbo_boxes_shipment_warehouse_id_box_no_key UNIQUE (shipment_warehouse_id, box_no);

-- 4) Счётчик коробов на уровне shipment_warehouse
CREATE TABLE IF NOT EXISTS fbo_box_counters_v2 (
  shipment_warehouse_id BIGINT PRIMARY KEY REFERENCES fbo_shipment_warehouses(id) ON DELETE CASCADE,
  next_box_no BIGINT NOT NULL CHECK (next_box_no >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION fbo_create_box_v2(
  p_shipment_warehouse_id BIGINT,
  p_created_by_user_id BIGINT
)
RETURNS fbo_boxes
LANGUAGE plpgsql
AS $$
DECLARE
  v_shipment_id BIGINT;
  v_next_box_no BIGINT;
  v_row fbo_boxes;
BEGIN
  SELECT shipment_id INTO v_shipment_id
  FROM fbo_shipment_warehouses
  WHERE id = p_shipment_warehouse_id;

  IF v_shipment_id IS NULL THEN
    RAISE EXCEPTION 'shipment_warehouse_id % not found', p_shipment_warehouse_id;
  END IF;

  WITH seq AS (
    INSERT INTO fbo_box_counters_v2 (shipment_warehouse_id, next_box_no)
    VALUES (p_shipment_warehouse_id, 2)
    ON CONFLICT (shipment_warehouse_id)
    DO UPDATE SET
      next_box_no = fbo_box_counters_v2.next_box_no + 1,
      updated_at = NOW()
    RETURNING next_box_no
  )
  SELECT CASE WHEN next_box_no = 2 THEN 1 ELSE next_box_no - 1 END
  INTO v_next_box_no
  FROM seq;

  INSERT INTO fbo_boxes (
    shipment_id,
    shipment_warehouse_id,
    box_no,
    created_by_user_id
  ) VALUES (
    v_shipment_id,
    p_shipment_warehouse_id,
    v_next_box_no,
    p_created_by_user_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMIT;
