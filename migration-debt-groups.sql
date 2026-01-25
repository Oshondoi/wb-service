-- Миграция: Добавление группировки долгов
-- Дата: 25 января 2026 г.
-- Описание: Добавляем debt_group_id для группировки операций одного долга

-- Добавляем колонку debt_group_id
ALTER TABLE cash_debts 
ADD COLUMN IF NOT EXISTS debt_group_id UUID DEFAULT gen_random_uuid();

-- Создаем индекс для быстрого поиска по группам
CREATE INDEX IF NOT EXISTS idx_cash_debts_group_id ON cash_debts(debt_group_id);

-- Для существующих записей создаем группы по контрагенту + тип
-- Это временное решение, в идеале нужно руками проставить правильные группы
UPDATE cash_debts 
SET debt_group_id = gen_random_uuid()
WHERE debt_group_id IS NULL;

COMMENT ON COLUMN cash_debts.debt_group_id IS 'ID группы долга - операции с одним ID относятся к одному долгу';
