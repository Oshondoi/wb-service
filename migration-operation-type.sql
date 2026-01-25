-- Миграция: Добавление колонки operation_type в таблицу cash_debts
-- Дата: 25 января 2026 г.
-- Описание: Добавляем поле operation_type для хранения типа операции (increase/decrease)

-- Добавляем колонку operation_type
ALTER TABLE cash_debts 
ADD COLUMN IF NOT EXISTS operation_type TEXT DEFAULT 'increase';

-- Обновляем существующие записи на основе знака суммы
-- Если сумма отрицательная - это погашение, иначе - начисление
UPDATE cash_debts 
SET operation_type = CASE 
  WHEN amount < 0 THEN 'decrease'
  ELSE 'increase'
END
WHERE operation_type IS NULL OR operation_type = 'increase';

-- Добавляем комментарий к колонке
COMMENT ON COLUMN cash_debts.operation_type IS 'Тип операции: increase (начисление) или decrease (погашение)';
