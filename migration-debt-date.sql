-- Миграция: добавление поля debt_date в таблицу cash_debts
-- Выполнить в Supabase SQL Editor

ALTER TABLE cash_debts 
ADD COLUMN IF NOT EXISTS debt_date TIMESTAMPTZ;

-- Можно установить значение по умолчанию для существующих записей (опционально)
-- UPDATE cash_debts SET debt_date = created_at WHERE debt_date IS NULL;
