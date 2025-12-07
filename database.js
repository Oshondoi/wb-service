/**
 * Database Module
 * Управление локальной SQLite базой данных для системы аккаунтов и компаний
 * 
 * Структура:
 * - accounts: Пользовательские аккаунты с авторизацией
 * - businesses: Компании (дочерние сущности аккаунтов) с API ключами WB
 * 
 * Логика: При удалении аккаунта автоматически удаляются все его компании (CASCADE)
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// Путь к файлу базы данных
const DB_PATH = path.join(__dirname, 'wb-service.db');

// Инициализация базы данных
const db = new Database(DB_PATH, { verbose: console.log });

// Включаем поддержку внешних ключей (CASCADE DELETE)
db.pragma('foreign_keys = ON');

/**
 * Создание схемы базы данных при первом запуске
 */
function initializeDatabase() {
  // Таблица аккаунтов
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Таблица компаний (businesses)
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      company_name TEXT NOT NULL,
      wb_api_key TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Таблица себестоимости товаров
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      nm_id TEXT NOT NULL,
      subject TEXT,
      brand TEXT,
      cost REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
      UNIQUE(business_id, nm_id)
    )
  `);

  // Индексы для оптимизации запросов
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_businesses_account_id ON businesses(account_id);
    CREATE INDEX IF NOT EXISTS idx_businesses_is_active ON businesses(is_active);
    CREATE INDEX IF NOT EXISTS idx_product_costs_business_id ON product_costs(business_id);
    CREATE INDEX IF NOT EXISTS idx_product_costs_nm_id ON product_costs(nm_id);
  `);

  console.log('✅ База данных инициализирована');
}

/**
 * Хеширование пароля с использованием SHA256 + соль
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Проверка пароля
 */
function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha256').toString('hex');
  return hash === verifyHash;
}

// ==================== АККАУНТЫ ====================

/**
 * Создание нового аккаунта
 */
function createAccount(username, password, email = null) {
  const passwordHash = hashPassword(password);
  const stmt = db.prepare(`
    INSERT INTO accounts (username, password_hash, email)
    VALUES (?, ?, ?)
  `);
  
  try {
    const result = stmt.run(username, passwordHash, email);
    return { id: result.lastInsertRowid, username, email };
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('Пользователь с таким именем или email уже существует');
    }
    throw error;
  }
}

/**
 * Авторизация аккаунта
 */
function authenticateAccount(username, password) {
  const stmt = db.prepare('SELECT * FROM accounts WHERE username = ?');
  const account = stmt.get(username);
  
  if (!account) {
    return null;
  }
  
  if (verifyPassword(password, account.password_hash)) {
    // Не возвращаем хеш пароля в результате
    delete account.password_hash;
    return account;
  }
  
  return null;
}

/**
 * Получение аккаунта по ID
 */
function getAccountById(accountId) {
  const stmt = db.prepare('SELECT id, username, email, created_at FROM accounts WHERE id = ?');
  return stmt.get(accountId);
}

/**
 * Удаление аккаунта (автоматически удалит все его компании через CASCADE)
 */
function deleteAccount(accountId) {
  const stmt = db.prepare('DELETE FROM accounts WHERE id = ?');
  const result = stmt.run(accountId);
  return result.changes > 0;
}

/**
 * Обновление пароля аккаунта
 */
function updateAccountPassword(accountId, newPassword) {
  const passwordHash = hashPassword(newPassword);
  const stmt = db.prepare('UPDATE accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  const result = stmt.run(passwordHash, accountId);
  return result.changes > 0;
}

// ==================== КОМПАНИИ ====================

/**
 * Создание новой компании
 */
function createBusiness(accountId, companyName, wbApiKey, description = null) {
  const stmt = db.prepare(`
    INSERT INTO businesses (account_id, company_name, wb_api_key, description)
    VALUES (?, ?, ?, ?)
  `);
  
  const result = stmt.run(accountId, companyName, wbApiKey, description);
  return {
    id: result.lastInsertRowid,
    account_id: accountId,
    company_name: companyName,
    description
  };
}

/**
 * Получение всех компаний аккаунта
 */
function getBusinessesByAccount(accountId, activeOnly = false) {
  let query = 'SELECT * FROM businesses WHERE account_id = ?';
  if (activeOnly) {
    query += ' AND is_active = 1';
  }
  query += ' ORDER BY created_at DESC';
  
  const stmt = db.prepare(query);
  return stmt.all(accountId);
}

/**
 * Получение компании по ID
 */
function getBusinessById(businessId) {
  const stmt = db.prepare('SELECT * FROM businesses WHERE id = ?');
  return stmt.get(businessId);
}

/**
 * Обновление данных компании
 */
function updateBusiness(businessId, updates) {
  const allowedFields = ['company_name', 'wb_api_key', 'description', 'is_active'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));
  
  if (fields.length === 0) {
    return false;
  }
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  
  const stmt = db.prepare(`
    UPDATE businesses 
    SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);
  
  const result = stmt.run(...values, businessId);
  return result.changes > 0;
}

/**
 * Удаление компании
 */
function deleteBusiness(businessId) {
  const stmt = db.prepare('DELETE FROM businesses WHERE id = ?');
  const result = stmt.run(businessId);
  return result.changes > 0;
}

/**
 * Проверка принадлежности компании к аккаунту
 */
function verifyBusinessOwnership(businessId, accountId) {
  const stmt = db.prepare('SELECT account_id FROM businesses WHERE id = ?');
  const business = stmt.get(businessId);
  return business && business.account_id === accountId;
}

/**
 * Получение активной компании (по умолчанию первая активная)
 */
function getDefaultBusiness(accountId) {
  const stmt = db.prepare(`
    SELECT * FROM businesses 
    WHERE account_id = ? AND is_active = 1 
    ORDER BY created_at ASC 
    LIMIT 1
  `);
  return stmt.get(accountId);
}

/**
 * Получение статистики по аккаунту
 */
function getAccountStats(accountId) {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_businesses,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_businesses
    FROM businesses
    WHERE account_id = ?
  `);
  return stmt.get(accountId);
}

// ==================== МИГРАЦИЯ ДАННЫХ ====================

/**
 * Миграция существующих API ключей из файла wb-api-key.txt
 * Создаёт дефолтный аккаунт и компанию при первом запуске
 */
function migrateFromLegacyApiKey() {
  const fs = require('fs');
  const legacyKeyPath = path.join(__dirname, 'wb-api-key.txt');
  
  // Проверяем, есть ли уже аккаунты в БД
  const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
  
  if (accountCount.count > 0) {
    console.log('ℹ️ Аккаунты уже существуют в БД, миграция не требуется');
    return;
  }
  
  // Проверяем наличие старого файла с ключом
  if (!fs.existsSync(legacyKeyPath)) {
    console.log('ℹ️ Файл wb-api-key.txt не найден, создаём пустую БД');
    return;
  }
  
  try {
    const legacyKey = fs.readFileSync(legacyKeyPath, 'utf-8').trim();
    
    if (!legacyKey) {
      console.log('ℹ️ Файл wb-api-key.txt пустой, миграция не требуется');
      return;
    }
    
    // Создаём дефолтный аккаунт (admin/tarelkastakan из текущей авторизации)
    const account = createAccount('admin', 'tarelkastakan', null);
    console.log(`✅ Создан дефолтный аккаунт: ${account.username}`);
    
    // Создаём первую компанию с мигрированным ключом
    const business = createBusiness(
      account.id,
      'Моя компания',
      legacyKey,
      'Мигрировано из wb-api-key.txt'
    );
    console.log(`✅ Создана компания: ${business.company_name}`);
    
    // Переименовываем старый файл
    fs.renameSync(legacyKeyPath, legacyKeyPath + '.backup');
    console.log('✅ Миграция завершена, файл wb-api-key.txt переименован в .backup');
    
  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);
  }
}

// ==================== СЕБЕСТОИМОСТЬ ====================

/**
 * Сохранить/обновить себестоимость товара
 */
function upsertProductCost(businessId, nmId, subject, brand, cost) {
  const stmt = db.prepare(`
    INSERT INTO product_costs (business_id, nm_id, subject, brand, cost)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(business_id, nm_id) 
    DO UPDATE SET 
      subject = excluded.subject,
      brand = excluded.brand,
      cost = excluded.cost,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const result = stmt.run(businessId, nmId, subject, brand, cost);
  return result.changes > 0;
}

/**
 * Массовое сохранение себестоимости
 */
function bulkUpsertProductCosts(businessId, products) {
  const stmt = db.prepare(`
    INSERT INTO product_costs (business_id, nm_id, subject, brand, cost)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(business_id, nm_id) 
    DO UPDATE SET 
      subject = excluded.subject,
      brand = excluded.brand,
      cost = excluded.cost,
      updated_at = CURRENT_TIMESTAMP
  `);
  
  const transaction = db.transaction((items) => {
    for (const item of items) {
      stmt.run(businessId, item.nmId, item.subject, item.brand, item.cost);
    }
  });
  
  transaction(products);
  return products.length;
}

/**
 * Получить себестоимость всех товаров компании
 */
function getProductCostsByBusiness(businessId) {
  const stmt = db.prepare('SELECT * FROM product_costs WHERE business_id = ? ORDER BY updated_at DESC');
  return stmt.all(businessId);
}

/**
 * Получить себестоимость конкретного товара
 */
function getProductCost(businessId, nmId) {
  const stmt = db.prepare('SELECT * FROM product_costs WHERE business_id = ? AND nm_id = ?');
  return stmt.get(businessId, nmId);
}

/**
 * Удалить себестоимость товара
 */
function deleteProductCost(businessId, nmId) {
  const stmt = db.prepare('DELETE FROM product_costs WHERE business_id = ? AND nm_id = ?');
  const result = stmt.run(businessId, nmId);
  return result.changes > 0;
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

// Создаём схему при импорте модуля
initializeDatabase();

// Пытаемся мигрировать старые данные
migrateFromLegacyApiKey();

// ==================== ЭКСПОРТ ====================

module.exports = {
  db,
  // Аккаунты
  createAccount,
  authenticateAccount,
  getAccountById,
  deleteAccount,
  updateAccountPassword,
  // Компании
  createBusiness,
  getBusinessesByAccount,
  getBusinessById,
  updateBusiness,
  deleteBusiness,
  verifyBusinessOwnership,
  getDefaultBusiness,
  getAccountStats,
  // Себестоимость
  upsertProductCost,
  bulkUpsertProductCosts,
  getProductCostsByBusiness,
  getProductCost,
  deleteProductCost
};
