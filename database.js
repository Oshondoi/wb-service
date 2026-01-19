/**
 * Database Module
 * Управление Supabase (PostgreSQL) базой данных для системы аккаунтов и компаний
 * 
 * Структура:
 * - accounts: Пользовательские аккаунты с авторизацией
 * - businesses: Компании (дочерние сущности аккаунтов) с API ключами WB
 * - product_costs: Себестоимость товаров
 * - wb_sales: Продажи WB (кэш)
 * - wb_orders: Заказы WB (кэш)
 * - wb_financial_reports: Финансовые отчёты WB (кэш)
 * - sync_logs: Логи синхронизаций
 * 
 * Логика: При удалении аккаунта автоматически удаляются все его компании (CASCADE)
 */

require('dotenv').config();
const crypto = require('crypto');
const supabase = require('./supabase-client');


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
async function createAccount(username, password, email = null) {
  const passwordHash = hashPassword(password);
  
  const { data, error } = await supabase
    .from('accounts')
    .insert({
      username,
      password_hash: passwordHash,
      email
    })
    .select()
    .single();
  
  if (error) {
    if (error.code === '23505') { // PostgreSQL unique violation
      throw new Error('Пользователь с таким именем или email уже существует');
    }
    throw error;
  }
  
  return { id: data.id, username: data.username, email: data.email };
}

/**
 * Авторизация аккаунта
 */
async function authenticateAccount(username, password) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('username', username)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  if (verifyPassword(password, data.password_hash)) {
    // Не возвращаем хеш пароля в результате
    delete data.password_hash;
    return data;
  }
  
  return null;
}

/**
 * Получение аккаунта по ID
 */
async function getAccountById(accountId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, username, email, created_at')
    .eq('id', accountId)
    .single();
  
  return error ? null : data;
}

/**
 * Удаление аккаунта (автоматически удалит все его компании через CASCADE)
 */
async function deleteAccount(accountId) {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId);
  
  return !error;
}

/**
 * Обновление пароля аккаунта
 */
async function updateAccountPassword(accountId, newPassword) {
  const passwordHash = hashPassword(newPassword);
  
  const { error } = await supabase
    .from('accounts')
    .update({ password_hash: passwordHash })
    .eq('id', accountId);
  
  return !error;
}

// ==================== КОМПАНИИ ====================

/**
 * Создание новой компании
 */
async function createBusiness(accountId, companyName, wbApiKey, description = null) {
  const { data, error } = await supabase
    .from('businesses')
    .insert({
      account_id: accountId,
      company_name: companyName,
      wb_api_key: wbApiKey,
      description,
      is_active: true // 🔥 Новые магазины создаются сразу активными
    })
    .select()
    .single();
  
  if (error) throw error;
  
  return {
    id: data.id,
    account_id: data.account_id,
    company_name: data.company_name,
    description: data.description,
    is_active: data.is_active
  };
}

/**
 * Получение всех компаний аккаунта
 */
async function getBusinessesByAccount(accountId, activeOnly = false) {
  let query = supabase
    .from('businesses')
    .select('*')
    .eq('account_id', accountId);
  
  if (activeOnly) {
    query = query.eq('is_active', true);
  }
  
  query = query.order('created_at', { ascending: false });
  
  const { data, error } = await query;
  
  return error ? [] : data;
}

/**
 * Получение компании по ID
 */
async function getBusinessById(businessId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single();
  
  return error ? null : data;
}

/**
 * Обновление данных компании
 */
async function updateBusiness(businessId, updates) {
  const allowedFields = ['company_name', 'wb_api_key', 'description', 'is_active'];
  const filteredUpdates = {};
  
  for (const key of Object.keys(updates)) {
    if (allowedFields.includes(key)) {
      filteredUpdates[key] = updates[key];
    }
  }
  
  if (Object.keys(filteredUpdates).length === 0) {
    return false;
  }
  
  const { error } = await supabase
    .from('businesses')
    .update(filteredUpdates)
    .eq('id', businessId);
  
  return !error;
}

/**
 * Удаление компании
 */
async function deleteBusiness(businessId) {
  const { error } = await supabase
    .from('businesses')
    .delete()
    .eq('id', businessId);
  
  return !error;
}

/**
 * Проверка принадлежности компании к аккаунту
 */
async function verifyBusinessOwnership(businessId, accountId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('account_id')
    .eq('id', businessId)
    .single();
  
  return !error && data && data.account_id === accountId;
}

/**
 * Получение активной компании (по умолчанию первая активная)
 */
async function getDefaultBusiness(accountId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  
  return error ? null : data;
}

/**
 * Получение статистики по аккаунту
 */
async function getAccountStats(accountId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('is_active')
    .eq('account_id', accountId);
  
  if (error) {
    return { total_businesses: 0, active_businesses: 0 };
  }
  
  return {
    total_businesses: data.length,
    active_businesses: data.filter(b => b.is_active).length
  };
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

/**
 * Создание дефолтного аккаунта при первом запуске (если нет аккаунтов)
 */
async function initializeDefaultAccount() {
  try {
    // Проверяем, есть ли уже аккаунты
    const { data, error } = await supabase
      .from('accounts')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('❌ Ошибка проверки аккаунтов:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('ℹ️ Аккаунты уже существуют в Supabase');
      return;
    }
    
    // Создаём дефолтный аккаунт
    const account = await createAccount('admin', 'tarelkastakan', null);
    console.log(`✅ Создан дефолтный аккаунт в Supabase: ${account.username}`);
    
  } catch (error) {
    // Аккаунт может уже существовать (уникальный username)
    if (error.message.includes('уже существует')) {
      console.log('ℹ️ Дефолтный аккаунт уже существует');
    } else {
      console.error('❌ Ошибка создания дефолтного аккаунта:', error.message);
    }
  }
}

// ==================== СЕБЕСТОИМОСТЬ ====================

/**
 * Сохранить/обновить себестоимость товара
 */
async function upsertProductCost(businessId, nmId, subject, brand, customName, cost) {
  const { error } = await supabase
    .from('product_costs')
    .upsert({
      business_id: businessId,
      nm_id: nmId,
      subject,
      brand,
      custom_name: customName,
      cost
    }, {
      onConflict: 'business_id,nm_id'
    });
  
  return !error;
}

/**
 * Массовое сохранение себестоимости
 */
async function bulkUpsertProductCosts(businessId, products) {
  const items = products.map(p => ({
    business_id: businessId,
    nm_id: p.nmId,
    brand: p.brand,
    custom_name: p.customName || '',
    cost: p.cost
  }));
  
  const { error } = await supabase
    .from('product_costs')
    .upsert(items, {
      onConflict: 'business_id,nm_id'
    });
  
  return error ? 0 : products.length;
}

/**
 * Получить себестоимость всех товаров компании
 */
async function getProductCostsByBusiness(businessId) {
  const { data, error } = await supabase
    .from('product_costs')
    .select('*')
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false });
  
  return error ? [] : data;
}

/**
 * Получить себестоимость конкретного товара
 */
async function getProductCost(businessId, nmId) {
  const { data, error } = await supabase
    .from('product_costs')
    .select('*')
    .eq('business_id', businessId)
    .eq('nm_id', nmId)
    .single();
  
  return error ? null : data;
}

/**
 * Удалить себестоимость товара
 */
async function deleteProductCost(businessId, nmId) {
  const { error } = await supabase
    .from('product_costs')
    .delete()
    .eq('business_id', businessId)
    .eq('nm_id', nmId);
  
  return !error;
}

// ==================== КЭШИРОВАННЫЕ ДАННЫЕ WB ====================

/**
 * Получить продажи из БД (кэш)
 */
async function getSalesFromCache(businessId, dateFrom = null, dateTo = null) {
  let query = supabase
    .from('wb_sales')
    .select('*')
    .eq('business_id', businessId)
    .order('sale_dt', { ascending: false });
  
  if (dateFrom) {
    query = query.gte('sale_dt', dateFrom);
  }
  
  if (dateTo) {
    query = query.lte('sale_dt', dateTo);
  }
  
  const { data, error } = await query;
  
  return error ? [] : data;
}

/**
 * Получить заказы из БД (кэш)
 */
async function getOrdersFromCache(businessId, dateFrom = null, dateTo = null) {
  let query = supabase
    .from('wb_orders')
    .select('*')
    .eq('business_id', businessId)
    .order('order_dt', { ascending: false });
  
  if (dateFrom) {
    query = query.gte('order_dt', dateFrom);
  }
  
  if (dateTo) {
    query = query.lte('order_dt', dateTo);
  }
  
  const { data, error } = await query;
  
  return error ? [] : data;
}

/**
 * Получить финансовый отчёт из БД (кэш)
 */
async function getFinancialReportFromCache(businessId, dateFrom = null, dateTo = null) {
  let query = supabase
    .from('wb_financial_reports')
    .select('*')
    .eq('business_id', businessId)
    .order('sale_dt', { ascending: false });
  
  if (dateFrom) {
    query = query.gte('sale_dt', dateFrom);
  }
  
  if (dateTo) {
    query = query.lte('sale_dt', dateTo);
  }
  
  const { data, error } = await query;
  
  return error ? [] : data;
}

/**
 * Получить последнюю синхронизацию магазина
 */
async function getLastSync(businessId, syncType = null) {
  let query = supabase
    .from('sync_logs')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1);
  
  if (syncType) {
    query = query.eq('sync_type', syncType);
  }
  
  const { data, error } = await query;
  
  return (error || !data || data.length === 0) ? null : data[0];
}

// Инициализация при запуске модуля
initializeDefaultAccount().catch(err => {
  console.error('❌ Ошибка инициализации дефолтного аккаунта:', err);
});

// ==================== ПРОВЕРКА НАЛИЧИЯ ДАННЫХ ====================

/**
 * Проверяет, есть ли хоть какие-то данные в таблицах продаж/заказов
 * Используется для определения, нужна ли первичная синхронизация
 */
async function checkIfDataExists() {
  try {
    const { count, error } = await supabase
      .from('wb_sales')
      .select('*', { count: 'exact', head: true })
      .limit(1);
    
    if (error) {
      console.error('Ошибка проверки данных:', error);
      return false;
    }
    
    return count > 0;
  } catch (err) {
    console.error('Ошибка checkIfDataExists:', err);
    return false;
  }
}

// ==================== ЭКСПОРТ ====================

module.exports = {
  supabase, // Экспортируем клиент Supabase для прямого доступа
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
  deleteProductCost,
  // Кэш WB данных
  getSalesFromCache,
  getOrdersFromCache,
  getFinancialReportFromCache,
  getLastSync,
  // Утилиты
  checkIfDataExists
};

