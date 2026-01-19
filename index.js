require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const syncService = require('./sync-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Кэш для юридических лиц (чтобы не парсить одного продавца несколько раз)
const LEGAL_NAMES_CACHE = new Map();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'wb-helper-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 часа
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS в продакшене
    sameSite: 'lax'
  }
}));

// Диагностика неожиданных ошибок чтобы процесс не падал молча
process.on('unhandledRejection', err => {
  console.error('UnhandledRejection:', err && err.message);
});
process.on('uncaughtException', err => {
  console.error('UncaughtException:', err && err.message);
});

// Функция задержки
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Случайная задержка от min до max секунд
const randomDelay = (minSec, maxSec) => {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  console.log(`Waiting ${(ms / 1000).toFixed(1)}s before request...`);
  return delay(ms);
};

// Middleware для проверки авторизации через БД
async function requireAuth(req, res, next) {
  // Проверяем токен в cookie
  const token = req.cookies?.authToken;
  if (token) {
    try {
      const accountId = parseInt(token, 10);
      const account = await db.getAccountById(accountId);
      if (account) {
        // Прикрепляем информацию об аккаунте к запросу
        req.account = account;
        return next();
      }
    } catch (e) {
      // Невалидный токен
    }
  }
  
  // Проверяем токен в заголовке Authorization (для API)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7);
    try {
      const accountId = parseInt(bearerToken, 10);
      const account = await db.getAccountById(accountId);
      if (account) {
        req.account = account;
        return next();
      }
    } catch (e) {
      // Невалидный токен
    }
  }
  
  res.redirect('/login');
}

// Страница входа
app.get('/login', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/');
  }
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Вход - WB Helper</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.login-box{background:#fff;border-radius:16px;padding:40px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:400px}
.login-box h1{margin:0 0 10px;font-size:28px;color:#2d3436;text-align:center}
.login-box .subtitle{text-align:center;color:#636e72;margin-bottom:30px;font-size:14px}
.form-group{margin-bottom:20px}
label{display:block;margin-bottom:8px;font-weight:600;color:#2d3436;font-size:14px}
input{width:100%;padding:12px 16px;border:2px solid #dfe6e9;border-radius:8px;font-size:15px;transition:border 0.2s;box-sizing:border-box}
input:focus{outline:none;border-color:#6c5ce7}
button{width:100%;padding:14px;border:none;background:#6c5ce7;color:#fff;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;transition:all 0.2s}
button:hover{background:#5f4dd1;transform:translateY(-2px);box-shadow:0 4px 12px rgba(108,92,231,0.4)}
.hint{font-size:12px;color:#b2bec3;margin-top:4px}
.error{background:#ff7675;color:#fff;padding:12px;border-radius:6px;margin-bottom:20px;font-size:14px;display:none}
</style></head><body>
<div class="login-box">
  <h1>🚀 WB Helper MAX</h1>
  <p class="subtitle">Войдите для доступа к сервису</p>
  <div id="error" class="error"></div>
  <form id="loginForm">
    <div class="form-group">
      <label for="login">Логин</label>
      <input type="text" id="login" name="login" required autocomplete="username" />
    </div>
    <div class="form-group">
      <label for="password">Пароль</label>
      <input type="password" id="password" name="password" required autocomplete="current-password" />
      <div class="hint">Подсказка: посуда</div>
    </div>
    <button type="submit">Войти</button>
  </form>
</div>
<script>
document.getElementById('loginForm').onsubmit = function(e) {
  e.preventDefault();
  var login = document.getElementById('login').value;
  var password = document.getElementById('password').value;
  fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({login: login, password: password})
  })
  .then(function(r){return r.json();})
  .then(function(data){
    if(data.success){
      // Сохраняем токен в localStorage
      localStorage.setItem('authToken', data.token);
      window.location.href = '/';
    } else {
      var err = document.getElementById('error');
      err.textContent = data.message || 'Неверный логин или пароль';
      err.style.display = 'block';
    }
  })
  .catch(function(e){
    var err = document.getElementById('error');
    err.textContent = 'Ошибка соединения';
    err.style.display = 'block';
  });
};
</script></body></html>`);
});

// API для входа
app.post('/api/login', async (req, res) => {
  const { login, password } = req.body;
  
  // Проверяем логин/пароль через БД
  const account = await db.authenticateAccount(login, password);
  
  if (account) {
    // Создаём токен (ID аккаунта) и ставим в cookie
    const token = account.id.toString();
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 часа
    });
    
    return res.json({ 
      success: true, 
      token,
      account: {
        id: account.id,
        username: account.username,
        email: account.email
      }
    });
  }
  
  res.json({ success: false, message: 'Неверный логин или пароль' });
});

// ==================== API: УПРАВЛЕНИЕ МАГАЗИНАМИ ====================

// Получить список магазинов текущего аккаунта
app.get('/api/businesses', requireAuth, async (req, res) => {
  try {
    const businesses = await db.getBusinessesByAccount(req.account.id);
    const stats = await db.getAccountStats(req.account.id);
    res.json({ success: true, businesses, stats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Создать новую компанию
app.post('/api/businesses', requireAuth, async (req, res) => {
  const { company_name, wb_api_key, description } = req.body;
  
  if (!company_name || !wb_api_key) {
    return res.json({ success: false, error: 'Название компании и API ключ обязательны' });
  }
  
  try {
    const business = await db.createBusiness(req.account.id, company_name, wb_api_key, description);
    
    // 🔄 Запускаем начальную синхронизацию в фоне (загрузка ВСЕЙ истории WB)
    syncService.syncAllData(business.id, business.wb_api_key)
      .then(() => console.log(`✅ Начальная синхронизация завершена для магазина ${business.id}`))
      .catch(err => console.error(`❌ Ошибка начальной синхронизации для магазина ${business.id}:`, err.message));
    
    res.json({ success: true, business, message: 'Магазин создан, синхронизация данных запущена' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Обновить данные компании
app.put('/api/businesses/:id', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.id);
  const { company_name, wb_api_key, description, is_active } = req.body;
  
  // Проверяем, что компания принадлежит текущему аккаунту
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const updates = {};
    if (company_name !== undefined) updates.company_name = company_name;
    if (wb_api_key !== undefined) updates.wb_api_key = wb_api_key;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active ? true : false;
    
    const success = await db.updateBusiness(businessId, updates);
    res.json({ success, message: success ? 'Магазин обновлён' : 'Магазин не найден' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Удалить магазин
app.delete('/api/businesses/:id', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.id);

  // Проверяем, что магазин принадлежит текущему аккаунту
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const success = await db.deleteBusiness(businessId);
    res.json({ success, message: success ? 'Магазин удалён' : 'Магазин не найден' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Получить компанию по умолчанию (для fin-report)
app.get('/api/businesses/default', requireAuth, async (req, res) => {
  try {
    const business = await db.getDefaultBusiness(req.account.id);
    if (!business) {
      return res.json({ success: false, error: 'Нет активных магазинов. Создайте магазин.' });
    }
    res.json({ success: true, business });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== API: СЕБЕСТОИМОСТЬ ====================

// Получить себестоимость всех товаров магазина
app.get('/api/product-costs/:businessId', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);

  // Проверяем принадлежность магазина к аккаунту
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const costs = await db.getProductCostsByBusiness(businessId);
    res.json({ success: true, costs });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Массовое сохранение себестоимости
app.post('/api/product-costs/:businessId/bulk', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const { products } = req.body;
  
  // Проверяем принадлежность компании к аккаунту
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    return res.json({ success: false, error: 'Нет данных для сохранения' });
  }
  
  try {
    const count = await db.bulkUpsertProductCosts(businessId, products);
    res.json({ success: true, count, message: `Сохранено ${count} позиций` });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Получить себестоимость конкретного товара
app.get('/api/product-costs/:businessId/:nmId', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const nmId = req.params.nmId;
  
  // Проверяем принадлежность компании к аккаунту
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const cost = await db.getProductCost(businessId, nmId);
    if (!cost) {
      return res.json({ success: false, error: 'Себестоимость не найдена' });
    }
    res.json({ success: true, cost });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Удалить себестоимость товара
app.delete('/api/product-costs/:businessId/:nmId', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const nmId = req.params.nmId;
  
  // Проверяем принадлежность компании к аккаунту
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const success = await db.deleteProductCost(businessId, nmId);
    res.json({ success, message: success ? 'Себестоимость удалена' : 'Себестоимость не найдена' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// API для получения финансовых данных (продажи + заказы) из Supabase
app.get('/api/wb-finance', requireAuth, async (req, res) => {
  // Получаем компанию из параметров или берём дефолтную
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = await db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Магазин не найден или доступ запрещён' });
    }
  } else {
    business = await db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных магазинов. Создайте магазин через интерфейс управления.' });
  }

  try {
    // Получаем даты из параметров запроса
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    // 📊 Читаем данные из Supabase кэша
    const sales = await db.getSalesFromCache(business.id, dateFromStr, dateToStr);
    
    // Обработка данных
    const items = sales.map(sale => {
      const forPay = sale.for_pay || 0;
      const commission = (sale.commission_percent || 0) * forPay / 100;
      const logistics = sale.delivery_amount || 0;
      const profit = forPay - commission - logistics;
      
      return {
        date: sale.sale_dt ? new Date(sale.sale_dt).toLocaleDateString('ru-RU') : '—',
        nmId: sale.nm_id,
        subject: sale.subject,
        forPay: forPay,
        commission: commission,
        logistics: logistics,
        profit: profit,
        type: sale.sale_id ? 'sale' : 'order'
      };
    });

    // Подсчет статистики
    const stats = {
      totalRevenue: items.reduce((sum, item) => sum + item.forPay, 0),
      totalCommission: items.reduce((sum, item) => sum + item.commission, 0),
      totalLogistics: items.reduce((sum, item) => sum + item.logistics, 0),
      netProfit: items.reduce((sum, item) => sum + item.profit, 0)
    };

    res.json({ items, stats });
  } catch (err) {
    console.error('Ошибка получения финансовых данных:', err.message);
    res.json({ error: 'Ошибка получения данных: ' + err.message });
  }
});

// API для получения продаж из Supabase
app.get('/api/wb-sales', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = await db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Магазин не найден или доступ запрещён' });
    }
  } else {
    business = await db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных магазинов' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    // 📊 Читаем данные из Supabase кэша
    const salesData = await db.getSalesFromCache(business.id, dateFromStr, dateToStr);
    const sales = salesData.filter(s => s.sale_id); // Только продажи (не заказы)
    
    const items = sales.map(sale => ({
      date: new Date(sale.sale_dt).toLocaleDateString('ru-RU'),
      nmId: sale.nm_id,
      subject: sale.subject,
      forPay: sale.for_pay || 0,
      commission: (sale.commission_percent || 0) * (sale.for_pay || 0) / 100,
      logistics: sale.delivery_amount || 0,
      profit: (sale.for_pay || 0) - ((sale.commission_percent || 0) * (sale.for_pay || 0) / 100) - (sale.delivery_amount || 0),
      type: 'sale'
    }));

    const stats = {
      totalRevenue: items.reduce((s, i) => s + i.forPay, 0),
      totalCommission: items.reduce((s, i) => s + i.commission, 0),
      totalLogistics: items.reduce((s, i) => s + i.logistics, 0),
      netProfit: items.reduce((s, i) => s + i.profit, 0)
    };

    res.json({ items, stats });
  } catch (err) {
    console.error('Ошибка получения продаж:', err.message);
    res.json({ error: 'Ошибка: ' + err.message });
  }
});

// API для получения заказов из Supabase
app.get('/api/wb-orders', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = await db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Магазин не найден или доступ запрещён' });
    }
  } else {
    business = await db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных магазинов' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    // 📊 Читаем данные из Supabase кэша
    const orders = await db.getOrdersFromCache(business.id, dateFromStr, dateToStr);
    
    const items = orders.map(order => ({
      date: new Date(order.order_dt).toLocaleDateString('ru-RU'),
      nmId: order.nm_id,
      subject: order.subject,
      forPay: order.total_price || 0,
      commission: 0,
      logistics: 0,
      profit: order.total_price || 0,
      type: 'order'
    }));

    const stats = {
      totalRevenue: items.reduce((s, i) => s + i.forPay, 0),
      totalCommission: 0,
      totalLogistics: 0,
      netProfit: items.reduce((s, i) => s + i.profit, 0)
    };

    res.json({ items, stats });
  } catch (err) {
    console.error('Ошибка получения заказов:', err.message);
    res.json({ error: 'Ошибка: ' + err.message });
  }
});

// API для получения сгруппированных продаж по уникальным артикулам
app.get('/api/wb-sales-grouped', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;

  if (businessId) {
    business = await db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Магазин не найден или доступ запрещён' });
    }
  } else {
    business = await db.getDefaultBusiness(req.account.id);
  }

  if (!business) {
    return res.json({ error: 'Нет активных магазинов' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];

    // 📊 Читаем финансовый отчёт из Supabase кэша (вместо обращения к WB API)
    console.log(`📊 Загрузка данных из Supabase для магазина ${business.id}, период ${dateFromStr} - ${dateToStr}`);
    const finReportData = await db.getFinancialReportFromCache(business.id, dateFromStr, dateToStr);
    
    console.log(`📊 Получено ${finReportData.length} записей из Supabase`);

    // Группируем данные из финансового отчёта
    const groupedMap = {};

    finReportData.forEach(item => {
      const nmId = item.nm_id;
      if (!nmId) return;

      if (!groupedMap[nmId]) {
        groupedMap[nmId] = {
          nmId: nmId,
          subject: item.subject_name || '—',
          brand: item.brand_name || '—',
          quantity: 0,
          totalRevenue: 0,
          totalCommission: 0,
          totalLogistics: 0,
          totalProfit: 0,
          totalForPay: 0,
          prices: [],
          warehouseName: item.office_name || '—'
        };
      }

      const quantity = Number(item.quantity || 1);
      const retailAmount = Number(item.retail_amount || 0);
      const commission = Number(item.ppvz_sales_commission || 0);
      const logistics = Number(item.delivery_rub || 0) +
                       Number(item.storage_fee || 0) +
                       Number(item.acquiring_fee || 0) +
                       Number(item.penalty || 0) +
                       Number(item.deduction || 0) +
                       Number(item.acceptance || 0);
      const profit = retailAmount - commission - logistics;
      const forPay = Number(item.ppvz_for_pay || 0); // К перечислению из fin report

      groupedMap[nmId].quantity += quantity;
      groupedMap[nmId].totalRevenue += retailAmount;
      groupedMap[nmId].totalCommission += commission;
      groupedMap[nmId].totalLogistics += logistics;
      groupedMap[nmId].totalProfit += profit;
      groupedMap[nmId].totalForPay += forPay;
      groupedMap[nmId].prices.push(retailAmount);
    });

    // Если данных нет, пробуем взять из wb_sales (продажи)
    if (Object.keys(groupedMap).length === 0) {
      console.log('📊 FinReport пустой, пробуем загрузить из wb_sales...');
      const salesData = await db.getSalesFromCache(business.id, dateFromStr, dateToStr);
      
      salesData.forEach(sale => {
        const nmId = sale.nm_id;

        if (!groupedMap[nmId]) {
          groupedMap[nmId] = {
            nmId: nmId,
            subject: sale.subject || '—',
            brand: sale.brand || '—',
            quantity: 0,
            totalRevenue: 0,
            totalCommission: 0,
            totalLogistics: 0,
            totalProfit: 0,
            totalForPay: 0,
            prices: [],
            warehouseName: sale.warehouse_name || '—'
          };
        }

        const retailAmount = sale.total_price || sale.price_with_disc || sale.finished_price || 0;
        const commission = sale.ppvz_sales_commission || 0;
        const logistics = (sale.delivery_rub || 0) +
                         (sale.storage_fee || 0) +
                         (sale.acquiring_fee || 0) +
                         (sale.penalty || 0) +
                         (sale.deduction || 0) +
                         (sale.acceptance || 0);
        const profit = retailAmount - commission - logistics;
        const forPay = sale.ppvz_for_pay || (retailAmount - commission - logistics);

        groupedMap[nmId].quantity += 1;
        groupedMap[nmId].totalRevenue += retailAmount;
        groupedMap[nmId].totalCommission += commission;
        groupedMap[nmId].totalLogistics += logistics;
        groupedMap[nmId].totalProfit += profit;
        groupedMap[nmId].totalForPay += forPay;
        groupedMap[nmId].prices.push(retailAmount);
      });
    }
    
    // Преобразуем в массив и считаем среднюю цену
    const groupedItems = Object.values(groupedMap).map(item => {
      const avgPrice = item.prices.length > 0
        ? item.prices.reduce((sum, p) => sum + p, 0) / item.prices.length
        : 0;

      return {
        nmId: item.nmId,
        subject: item.subject,
        brand: item.brand,
        quantity: item.quantity,
        totalRevenue: item.totalRevenue,
        totalCommission: item.totalCommission,
        totalLogistics: item.totalLogistics,
        totalProfit: item.totalProfit,
        totalForPay: item.totalForPay, // Сумма к перечислению
        avgPrice: avgPrice,
        warehouseName: item.warehouseName
      };
    });
    
    // Сортируем по количеству продаж (от большего к меньшему)
    groupedItems.sort((a, b) => b.quantity - a.quantity);
    
    res.json({ data: groupedItems });
  } catch (err) {
    console.error('Ошибка получения сгруппированных продаж:', err.message);
    res.json({ error: 'Ошибка: ' + err.message });
  }
});

// API для получения полного финансового отчёта из Supabase
app.get('/api/wb-fin-report', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = await db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Магазин не найден или доступ запрещён' });
    }
  } else {
    business = await db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных магазинов' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    // 📊 Читаем данные из Supabase кэша
    const data = await db.getFinancialReportFromCache(business.id, dateFromStr, dateToStr);
    res.json({ data });
  } catch (err) {
    console.error('Ошибка получения финансового отчёта:', err.message);
    res.json({ error: 'Ошибка: ' + err.message });
  }
});

// API для выхода
app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Страница анализа товаров (только для авторизованных)
app.get('/products', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper MAX - Анализ товаров</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;padding:20px;color:#222;background:#f8f9fa}
h1{margin:0 0 20px;font-size:32px;color:#2d3436}
.container{width:100%;max-width:100%;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
.field{display:flex;flex-direction:column}
label{font-weight:600;margin-bottom:6px;font-size:14px;color:#636e72}
input,select{padding:10px 12px;border:2px solid #dfe6e9;border-radius:8px;font-size:15px;transition:border 0.2s}
input:focus,select:focus{outline:none;border-color:#6c5ce7}
.buttons{display:flex;gap:12px;margin-top:20px;flex-wrap:wrap}
button{padding:12px 24px;border:none;background:#6c5ce7;color:#fff;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600;transition:all 0.2s}
button:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(108,92,231,0.3)}
button.secondary{background:#0984e3}
button.danger{background:#d63031}
button.success{background:#00b894}
.info-box{background:#f1f3f5;padding:16px;border-radius:8px;margin:20px 0;font-size:14px}
.info-box strong{color:#2d3436}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:20px;background:#fff}
th,td{border:1px solid #dfe6e9;padding:10px 12px;text-align:left}
th{background:#6c5ce7;color:#fff;font-weight:600;position:sticky;top:0}
tbody tr:hover{background:#f8f9fa}
.product-img{width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid #dfe6e9}
.table-wrapper{overflow-x:auto;margin-top:20px;border-radius:8px;border:1px solid #dfe6e9}
.status-ok{color:#00b894;font-weight:600}
.status-error{color:#d63031;font-weight:600}
.badge{display:inline-block;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;margin:2px}
.badge-primary{background:#dfe6ff;color:#0984e3}
.badge-success{background:#d5f4e6;color:#00b894}
.badge-warning{background:#ffeaa7;color:#fdcb6e}
</style></head><body>
<div class="container">
<h1>🚀 WB Helper MAX</h1>
<div class="info-box">
  <strong>Максимальная версия:</strong> Получайте все доступные данные о товаре — цену, остатки, рейтинг, отзывы, изображения, склады и информацию о пункте выдачи (dest).
</div>
<div class="controls">
  <div class="field">
    <label for="nm">Артикул WB</label>
    <input id="nm" type="text" placeholder="например 272673889" />
  </div>
  <div class="field">
    <label for="domain">Домен</label>
    <select id="domain">
      <option value="ru">wildberries.ru (RUB)</option>
      <option value="kg">wildberries.kg (KGS)</option>
      <option value="kz">wildberries.kz (KZT)</option>
    </select>
  </div>
  <div class="field">
    <label for="dest">Пункт выдачи (dest)</label>
    <select id="dest">
      <option value="">Авто (перебор)</option>
      <option value="-1257786">-1257786 (Москва)</option>
      <option value="-1029256">-1029256 (СПб)</option>
      <option value="-1059509">-1059509 (Казань)</option>
      <option value="-59208">-59208 (Екатеринбург)</option>
      <option value="-364763">-364763 (Новосибирск)</option>
    </select>
  </div>
</div>
<div class="buttons">
  <button id="fetch" class="success">📊 Получить данные</button>
  <button id="open" class="secondary">🔗 Открыть товар</button>
  <button id="clear" class="danger">🗑️ Очистить таблицу</button>
  <button onclick="window.location.href='/'" style="background:#0984e3">📈 Главная</button>
  <button onclick="localStorage.removeItem('authToken');window.location.href='/login'" style="background:#636e72">🚪 Выход</button>
</div>
<div class="table-wrapper">
  <table id="dataTable">
    <thead><tr>
      <th>Артикул</th>
      <th>Фото товара</th>
      <th>Название</th>
      <th>Бренд</th>
      <th>Продавец (ID)</th>
      <th>Магазин</th>
      <th>Категория</th>
      <th>Цвет</th>
      <th>Цена</th>
      <th>Валюта</th>
      <th>Рейтинг</th>
      <th>Отзывы</th>
      <th>Кол-во фото</th>
      <th>Остатки</th>
      <th>Склады</th>
      <th>Модель</th>
      <th>Dest</th>
      <th>Источник</th>
      <th>Время</th>
      <th>Статус</th>
    </tr></thead>
    <tbody></tbody>
  </table>
</div>
</div>
<script>
window.addEventListener('DOMContentLoaded', function(){
  // Проверяем авторизацию
  var token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  
  var nmEl = document.getElementById('nm');
  var domainEl = document.getElementById('domain');
  var destEl = document.getElementById('dest');
  var btnFetch = document.getElementById('fetch');
  var btnOpen = document.getElementById('open');
  var btnClear = document.getElementById('clear');

  btnOpen.onclick = function(){
    var nm = nmEl.value.trim();
    if(!nm){ alert('Введите артикул'); return; }
    var domain = domainEl.value;
    var url = 'https://www.wildberries.'+domain+'/catalog/'+nm+'/detail.aspx';
    window.open(url,'_blank');
  };

  btnFetch.onclick = function(){
    var nm = nmEl.value.trim();
    if(!nm){ alert('Введите артикул'); return; }
    var domain = domainEl.value;
    var dest = destEl.value;
    var url = '/wb-max?nm='+encodeURIComponent(nm)+'&domain='+encodeURIComponent(domain);
    if(dest) url += '&dest='+encodeURIComponent(dest);
    
    btnFetch.disabled = true;
    btnFetch.textContent = '⏳ Загрузка...';
    
    fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
      .then(function(r){return r.json();})
      .then(function(data){
        addRow(data);
        btnFetch.disabled = false;
        btnFetch.textContent = '📊 Получить данные';
      })
      .catch(function(e){
        alert('Ошибка запроса: '+e.message);
        btnFetch.disabled = false;
        btnFetch.textContent = '📊 Получить данные';
      });
  };

  btnClear.onclick = function(){
    var tb=document.querySelector('#dataTable tbody');
    if(tb) tb.innerHTML='';
  };

  function addRow(data){
    var tb=document.querySelector('#dataTable tbody');
    if(!tb) return;
    var tr=document.createElement('tr');
    var timeStr=new Date().toLocaleTimeString();
    
    var status = data.error ? '<span class="status-error">'+data.error+'</span>' : '<span class="status-ok">OK (успешно)</span>';
    var price = '-';
    if (!data.error) {
      if (data.price !== undefined && data.price !== null && data.price > 0) {
        price = data.price.toFixed(2);
      } else if (data.stocksQty === 0 || (data.warehouses && data.warehouses.length === 0)) {
        price = 'нет в наличии';
      } else {
        price = '0.00';
      }
    }
    var rating = (data.rating || 0) + ' ' + (data.rating ? '(из 5)' : '');
    var feedbacks = (data.feedbacks || 0) + ' ' + (data.feedbacks ? '(шт)' : '');
    var images = (data.images || 0) + ' ' + (data.images ? '(фото)' : '');
    var stocksQty = (data.stocksQty || 0) + ' ' + (data.stocksQty ? '(шт на складах)' : '');
    
      var warehouses = '-';
      var fulfillmentWh = {
        '206348': true, // Кольцово (Екатеринбург)
        '120762': true, // Подольск
        '301760': true, // Новосибирск (сортировочный)
        '507': true,    // Электросталь
        '117986': true, // СПб Север
        '206828': true, // Софьино
        '204151': true, // Марушкинское
        '204163': true, // Тверь
        '203490': true, // Казань
        '205362': true  // Ростов-на-Дону
      };
      var modelText = '-';
    if(data.warehouses && data.warehouses.length > 0){
      // Преобразуем ID складов в человекочитаемые названия
      var whMap = {
        '206348':'Кольцово (Екатеринбург)',
        '120762':'Подольск (Мск область)',
        '301760':'Новосиб (Сортировочный)',
        '507':'Электросталь',
        '117986':'Санкт‑Петербург Север',
        '206828':'Софьино',
        '204151':'Марушкинское',
        '204163':'Тверь',
        '203490':'Казань',
        '205362':'Ростов‑на‑Дону'
      };
      // Если пришли количества по складам — используем их
      var items = Array.isArray(data.warehousesQty) && data.warehousesQty.length > 0
        ? data.warehousesQty.map(function(it){
            var id = String(it.wh);
            var name = whMap[id] || ('Склад '+id);
            var qty = Number(it.qty || 0);
            return '<span class="badge badge-primary">'+name+' — '+qty+' шт</span>';
          })
        : data.warehouses.map(function(w){
            var id = String(w);
            var name = whMap[id] || ('Склад '+id);
            return '<span class="badge badge-primary">'+name+' — ? шт</span>';
          });
      var whList = items.join(' ');
      warehouses = whList;
      // Определяем модель: FBO, если есть остатки на любом из fulfillment складов; иначе FBS
      var hasFulfillment = false;
      if (Array.isArray(data.warehousesQty) && data.warehousesQty.length > 0) {
        for (var j=0;j<data.warehousesQty.length;j++){
          var wid = String(data.warehousesQty[j].wh || '');
          if (fulfillmentWh[wid]) { hasFulfillment = true; break; }
        }
      } else if (Array.isArray(data.warehouses)) {
        for (var k=0;k<data.warehouses.length;k++){
          var wid2 = String(data.warehouses[k] || '');
          if (fulfillmentWh[wid2]) { hasFulfillment = true; break; }
        }
      }
      modelText = hasFulfillment ? 'FBO' : 'FBS';
    }
    
    var destUsed = (data.destUsed || '-');
    if(data.destUsed){
      var destName = '';
      if(data.destUsed === '-1257786') destName = 'Москва';
      else if(data.destUsed === '-1029256') destName = 'СПб';
      else if(data.destUsed === '-1059509') destName = 'Казань';
      else if(data.destUsed === '-59208') destName = 'Екатеринбург';
      else if(data.destUsed === '-364763') destName = 'Новосибирск';
      else destName = 'регион';
      destUsed = data.destUsed + ' (' + destName + ')';
    }
    
    var source = (data.source || '-');
    if(data.source){
      var srcName = '';
      if(data.source.indexOf('v2') >= 0) srcName = 'API v2';
      else if(data.source.indexOf('v1') >= 0) srcName = 'API v1';
      else if(data.source.indexOf('basket') >= 0) srcName = 'CDN корзины';
      else if(data.source.indexOf('html') >= 0) srcName = 'HTML страница';
      else srcName = data.source;
      source = data.source + ' (' + srcName + ')';
    }
    
    var currency = data.currency || 'RUB';
    var currencyName = '';
    if(currency === 'RUB') currencyName = 'российский рубль';
    else if(currency === 'KGS') currencyName = 'киргизский сом';
    else if(currency === 'KZT') currencyName = 'казахстанский тенге';
    currency = currency + (currencyName ? ' (' + currencyName + ')' : '');
    
    var mainImage = '-';
    if(data.mainImage){
      var imgHtml = '<img src="'+data.mainImage+'" class="product-img" alt="Фото" crossorigin="anonymous" onerror="';
      imgHtml += 'var alt=[';
      imgHtml += 'this.src.replace(\\'.webp\\',\\'.jpg\\'),';
      imgHtml += 'this.src.replace(\\'basket-\\'+this.src.match(/basket-(\\\\d+)/)[1],\\'basket-01\\'),';
      imgHtml += '\\'https://images.wbstatic.net/big/new/\\'+this.src.match(/(\\\\d+)\\\\/part/)[1]+\\'0000/\\'+this.src.match(/part\\\\/(\\\\d+)/)[1]+\\'-1.jpg\\'';
      imgHtml += '];';
      imgHtml += 'if(!this.tried)this.tried=0;';
      imgHtml += 'this.tried++;';
      imgHtml += 'if(this.tried<alt.length){this.src=alt[this.tried-1];}else{this.style.display=\\'none\\';this.parentElement.innerHTML=\\'<div style=\\\"width:80px;height:80px;background:#eee;display:flex;align-items:center;justify-content:center;border-radius:6px;color:#999;font-size:11px\\\">\u041d\u0435\u0442 \u0444\u043e\u0442\u043e</div>\\';}" />';
      mainImage = imgHtml;
    }
    
    var sellerId = data.sellerId || '-';
    var sellerName = data.sellerName || '-'; // Полное юрлицо
    var storeName = data.storeName || '-';   // Торговое название (магазин)
    
    // Формируем строку для продавца: Полное юрлицо (ID)
    var sellerDisplay = '-';
    if (sellerName !== '-' && sellerId !== '-') {
      sellerDisplay = sellerName + ' (' + sellerId + ')';
    } else if (sellerName !== '-') {
      sellerDisplay = sellerName;
    } else if (sellerId !== '-') {
      sellerDisplay = 'ID: ' + sellerId;
    }
    
    // Магазин - отдельно
    var storeDisplay = storeName !== '-' ? storeName : '-';
    
    var category = data.category || '-';
    var color = data.color || '-';
    var productUrl = (function(){
      var host = 'www.wildberries.kg';
      return 'https://' + host + '/catalog/' + (data.nm || '') + '/detail.aspx';
    })();
    var nmLink = data.nm ? ('<a href="'+productUrl+'" target="_blank" rel="noopener noreferrer">'+data.nm+'</a>') : '-';
    var cols = [
      nmLink,
      mainImage,
      data.name || '-',
      data.brand || '-',
      sellerDisplay,
      storeDisplay,
      category,
      color,
      price,
      currency,
      rating,
      feedbacks,
      images,
      stocksQty,
      warehouses,
      modelText,
      destUsed,
      source,
      timeStr,
      status
    ];
    
    for(var i=0;i<cols.length;i++){
      var td=document.createElement('td');
      if(i === 0 || i === 1 || i === 14 || i === 19){ // 0=link, 1=image, 14=warehouses, 19=status use innerHTML
        td.innerHTML = cols[i];
      } else {
        td.textContent = cols[i];
      }
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
});
</script></body></html>`);
});

// Хелпер извлечения цены из объекта товара
function extractPrice(product) {
  const candidates = [];
  // Прямые поля продукта
  ['salePriceU','clientSalePriceU','basicPriceU','priceU'].forEach(k => {
    if (typeof product[k] === 'number' && product[k] > 0) candidates.push(product[k]);
  });
  // Цены в sizes (v2 формат)
  if (Array.isArray(product.sizes)) {
    for (const s of product.sizes) {
      const p = s && s.price;
      if (p) {
        ['basic','product','total'].forEach(k => {
          if (typeof p[k] === 'number' && p[k] > 0) candidates.push(p[k]);
        });
      }
    }
  }
  return candidates.length ? Math.min(...candidates) : 0;
}

// Попытка получить цену из basket CDN (новый формат доменов)
async function tryBasket(nm) {
  const vol = Math.floor(nm / 100000);
  const part = Math.floor(nm / 1000);
  const domains = [];
  // basket-01.wb.ru до basket-40.wb.ru
  for (let i=1;i<=40;i++) domains.push(`basket-${String(i).padStart(2,'0')}.wb.ru`);
  for (const d of domains) {
    const url = `https://${d}/vol${vol}/part${part}/${nm}/info/ru/card.json`;
    try {
      const resp = await axios.get(url, { headers: { 'User-Agent':'Mozilla/5.0','Accept':'application/json' }, timeout: 6000 });
      const data = resp.data;
      if (data) {
        const priceCandidates = [
          data.salePriceU,
          data.priceU,
          data.basicPriceU,
          data.extended?.basicPriceU,
          data.extended?.clientPriceU
        ].filter(x => typeof x === 'number' && x>0);
        if (priceCandidates.length) {
          return { price: Math.min(...priceCandidates)/100, name: data.imt_name || '', brand: data.selling?.brand_name || '', source: url };
        }
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Fallback парсинг из HTML страницы товара (SSR + текст).
async function fetchFromHtml(nm) {
  const urls = [
    `https://www.wildberries.ru/catalog/${nm}/detail.aspx`,
    `https://www.wildberries.kg/catalog/${nm}/detail.aspx`,
    `https://www.wildberries.kz/catalog/${nm}/detail.aspx`
  ];
  for (const htmlUrl of urls) {
    let html;
    try {
      const resp = await axios.get(htmlUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }, timeout: 15000 });
      html = resp.data;
    } catch (e) {
      continue; // следующий домен
    }

    // Попытка извлечь window.__NUXT__ (иногда скрипт заканчивается </script>)
    let nuxtBlock = null;
    const nuxtScriptMatch = html.match(/window.__NUXT__=(.*?);<\/script>/s);
    if (nuxtScriptMatch) nuxtBlock = nuxtScriptMatch[1];
    if (!nuxtBlock) {
      const altMatch = html.match(/window.__NUXT__=(\{.*?\});/s);
      if (altMatch) nuxtBlock = altMatch[1];
    }
    if (nuxtBlock) {
      try {
        // Часто это уже объект; если начинается с '{' — парсим.
        let nuxtObj;
        if (nuxtBlock.trim().startsWith('{')) {
          nuxtObj = JSON.parse(nuxtBlock.replace(/;$/,''));
        }
        if (nuxtObj) {
          const jsonStr = JSON.stringify(nuxtObj);
          const m = jsonStr.match(/"salePriceU":(\d+)/) || jsonStr.match(/"priceU":(\d+)/);
          if (m) {
            return { price: parseInt(m[1],10)/100, currency: htmlUrl.includes('.kg') ? 'KGS' : htmlUrl.includes('.kz') ? 'KZT' : 'RUB', name:'', brand:'', source: htmlUrl.includes('.kg') ? 'html-nuxt-kg' : htmlUrl.includes('.kz') ? 'html-nuxt-kz' : 'html-nuxt' };
          }
        }
      } catch (_) { /* ignore */ }
    }

    // Прямой поиск числовых salePriceU/priceU в HTML
    const numMatch = html.match(/salePriceU":(\d+)/) || html.match(/priceU":(\d+)/);
    if (numMatch) {
      return { price: parseInt(numMatch[1],10)/100, currency: htmlUrl.includes('.kg') ? 'KGS' : htmlUrl.includes('.kz') ? 'KZT' : 'RUB', name:'', brand:'', source: htmlUrl.includes('.kg') ? 'html-regex-kg' : htmlUrl.includes('.kz') ? 'html-regex-kz' : 'html-regex' };
    }

    // Текстовая цена: допускаем неразрывные пробелы и узкие пробелы
    const textPriceRegex = /([0-9][0-9\s\u00A0\u202F\.]{0,12})\s*(сом|KGS|руб|₽|тенге|KZT)/i;
    const textPriceMatch = html.match(textPriceRegex);
    if (textPriceMatch) {
      const rawDigits = textPriceMatch[1].replace(/[\s\u00A0\u202F\.]+/g,'');
      const value = parseInt(rawDigits,10);
      if (!isNaN(value) && value > 0) {
        const curToken = textPriceMatch[2].toLowerCase();
        let currency = 'RUB';
        if (curToken.startsWith('сом') || curToken === 'kgs') currency = 'KGS';
        else if (curToken.startsWith('тенге') || curToken === 'kzt') currency = 'KZT';
        return { price: value, currency, name:'', brand:'', source: htmlUrl.includes('.kg') ? 'html-text-kg' : htmlUrl.includes('.kz') ? 'html-text-kz' : 'html-text' };
      }
    }
  }
  return null;
}

// Получить полное название юридического лица через API WB
async function fetchLegalEntityName(sellerId) {
  if (!sellerId) return '';
  const id = String(sellerId).trim();
  
  // Проверяем кэш
  if (LEGAL_NAMES_CACHE.has(id)) {
    const cached = LEGAL_NAMES_CACHE.get(id);
    console.log(`✓ Из кэша для ${id}: ${cached}`);
    return cached;
  }
  
  // МЕТОД 1: Через внутренний API профиля продавца (JSON endpoint)
  const apiEndpoints = [
    `https://www.wildberries.ru/webapi/seller/data/short?supplierId=${id}`,
    `https://www.wildberries.kg/webapi/seller/data/short?supplierId=${id}`,
    `https://www.wildberries.kz/webapi/seller/data/short?supplierId=${id}`
  ];
  
  for (const apiUrl of apiEndpoints) {
    try {
      const resp = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': `https://www.wildberries.ru/seller/${id}`
        },
        timeout: 8000
      });
      
      // Может быть в data.legalName или data.name или data.supplierName
      const data = resp.data || {};
      const legalName = data.legalName || data.fullName || data.organizationName || data.name || data.supplierName;
      
      if (legalName && String(legalName).length > 2) {
        const name = String(legalName).trim();
        console.log(`✓ Получено из WebAPI для ${id}: ${name}`);
        LEGAL_NAMES_CACHE.set(id, name);
        return name;
      }
    } catch (err) {
      // Пробуем следующий endpoint
      continue;
    }
  }
  
  // МЕТОД 2: Пробуем card API (иногда там есть seller info)
  try {
    const cardUrl = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=-1257786&nm=${id}`;
    const resp = await axios.get(cardUrl, {
      headers: {
        'User-Agent': 'WildberriesApp/1.0',
        'Accept': 'application/json'
      },
      timeout: 8000
    });
    
    const products = resp?.data?.data?.products || [];
    if (products.length > 0 && products[0].supplierName) {
      const name = String(products[0].supplierName).trim();
      console.log(`✓ Получено из card API для ${id}: ${name}`);
      LEGAL_NAMES_CACHE.set(id, name);
      return name;
    }
  } catch (err) {
    console.log(`Card API не вернул данные для ${id}: ${err.message}`);
  }
  
  // МЕТОД 3: HTML парсинг (последний резерв, обычно блокируется)
  const domains = ['wildberries.kg', 'wildberries.kz', 'wildberries.ru'];
  
  for (const domain of domains) {
    const url = `https://www.${domain}/seller/${id}`;
    
    await delay(300); // короткая задержка
    
    try {
      const resp = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9'
        },
        timeout: 8000,
        maxRedirects: 3
      });
      const html = String(resp.data || '');
    
      const patterns = [
        /(?:Общество с ограниченной ответственностью|ООО)\s+[«"'"]?([А-ЯЁа-яёA-Za-z0-9\s\-\.]+?)[«"'"]?(?=\s*<?(?:ИНН|ОГРН))/i,
        /(?:Индивидуальный предприниматель|ИП)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)/i,
        /(?:Индивидуальный предприниматель|ИП)\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)(?=\s*<?(?:ИНН))/i,
        /(?:Акционерное общество|АО)\s+[«"'"]?([А-ЯЁа-яёA-Za-z0-9\s\-\.]+?)[«"'"]?(?=\s*<?(?:ИНН))/i
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let fullName = match[1].trim().replace(/\s+/g, ' ').replace(/[<>]/g, '');
          
          if (pattern.source.includes('Индивидуальный') && !fullName.startsWith('Индивидуальный')) {
            fullName = 'Индивидуальный предприниматель ' + fullName;
          }
          
          console.log(`✓ Спарсено HTML для ${id} (${domain}): ${fullName}`);
          LEGAL_NAMES_CACHE.set(id, fullName);
          return fullName;
        }
      }
    } catch (err) {
      continue;
    }
  }
  
  console.log(`✗ Не удалось получить юрлицо для продавца ${id}`);
  LEGAL_NAMES_CACHE.set(id, '');
  return '';
}

// Главная страница - Финансовый отчет
app.get('/', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper - Финансовый отчет</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;padding:20px;color:#222;background:#f8f9fa}
h1{margin:0 0 20px;font-size:32px;color:#2d3436}
.container{width:100%;max-width:1400px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
.api-btn{display:inline-block;padding:12px 24px;background:#00b894;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer;transition:all 0.2s}
.api-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,185,148,0.3)}
.update-btn{display:inline-block;padding:12px 24px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer;transition:all 0.2s}
.update-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(108,92,231,0.3)}
.info-box{background:#e3f2fd;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2196f3}
.info-box h2{margin:0 0 10px;color:#1976d2;font-size:20px}
.info-box p{margin:5px 0;color:#555;line-height:1.6}
.feature-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-top:20px}
.feature-card{background:#f8f9fa;padding:16px;border-radius:8px;border:2px solid #e9ecef}
.feature-card h3{margin:0 0 10px;color:#2d3436;font-size:16px}
.feature-card p{margin:0;color:#636e72;font-size:14px;line-height:1.5}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center}
.modal.active{display:flex}
.modal-content{background:#fff;border-radius:12px;padding:32px;max-width:500px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);animation:slideIn 0.3s ease}
@keyframes slideIn{from{transform:translateY(-50px);opacity:0}to{transform:translateY(0);opacity:1}}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
.modal-header h2{margin:0;font-size:24px;color:#2d3436}
.close-btn{background:none;border:none;font-size:28px;color:#636e72;cursor:pointer;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;transition:color 0.2s}
.close-btn:hover{color:#2d3436}
.form-group{margin-bottom:20px}
.form-group label{display:block;font-weight:600;margin-bottom:8px;color:#2d3436;font-size:14px}
.form-group input{width:100%;padding:12px;border:2px solid #dfe6e9;border-radius:8px;font-size:15px;transition:border 0.2s;box-sizing:border-box}
.form-group input:focus{outline:none;border-color:#00b894}
.form-group small{display:block;margin-top:6px;color:#636e72;font-size:13px}
.modal-footer{display:flex;gap:12px;justify-content:flex-end;margin-top:24px}
.modal-footer button{padding:12px 24px;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s}
.btn-cancel{background:#dfe6e9;color:#2d3436}
.btn-cancel:hover{background:#b2bec3}
.btn-save{background:#00b894;color:#fff}
.btn-save:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,185,148,0.3)}
.api-status{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:20px;font-size:14px;font-weight:600;margin-left:12px;vertical-align:middle}
.api-status.active{background:#d4edda;color:#155724;border:2px solid #c3e6cb}
.api-status.inactive{background:#f8d7da;color:#721c24;border:2px solid #f5c6cb}
.api-status-icon{font-size:18px}
#dateRangeBtn:hover{border-color:#6c5ce7;box-shadow:0 4px 12px rgba(108,92,231,0.2);transform:translateY(-1px)}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.1)}}
</style>
</head>
<body>
<div class="container">
  <div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <button class="api-btn" onclick="openBusinessManager()">🏢 Управление магазинами</button>
      <button class="api-btn" onclick="window.location.href='/products'" style="background:#6c5ce7">🔍 Анализ товаров</button>
      <div id="businessSelector" style="display:flex;gap:8px;align-items:center">
        <label style="font-size:14px;font-weight:600;color:#2d3436">Магазин:</label>
        <select id="currentBusiness" onchange="switchBusiness()" style="padding:8px 12px;border:2px solid #dfe6e9;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#fff">
          <option value="">Загрузка...</option>
        </select>
      </div>
      <button class="api-btn" onclick="localStorage.removeItem('authToken');window.location.href='/login'" style="background:#636e72">🚪 Выход</button>
    </div>
    <div style="display:flex;gap:12px;align-items:center">
      <button class="update-btn" onclick="syncWithWB()" title="Принудительная синхронизация с WB API">🔄 Синхронизация с WB</button>
    </div>
  </div>

  <h1>📈 Финансовый отчет</h1>
  
  ${process.env.VERCEL ? `
  <div style="background:#fff3cd;border:2px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px">
    <span style="font-size:24px">⚠️</span>
    <div style="flex:1">
      <strong style="color:#856404">Vercel Demo Mode:</strong>
      <span style="color:#856404"> Данные хранятся в памяти и сбросятся при перезапуске сервера. Для production используйте PostgreSQL/MySQL.</span>
    </div>
  </div>
  ` : ''}

  <!-- Панель управления -->
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
    <button id="dateRangeBtn" onclick="openDateRangePicker()" style="display:flex;gap:8px;align-items:center;background:#fff;padding:12px 20px;border:2px solid #dfe6e9;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;color:#2d3436;transition:all 0.2s;box-shadow:0 2px 6px rgba(0,0,0,0.08)">
      <span style="font-size:18px">📅</span>
      <span id="dateRangeText">Период:</span>
      <span id="dateRangeDisplay" style="color:#6c5ce7;font-weight:700">14.12.2025 — 13.01.2026</span>
    </button>
    <input type="date" id="dateFrom" style="display:none" />
    <input type="date" id="dateTo" style="display:none" />
    <button id="btnFinReport" onclick="openFinReportModal()" style="padding:12px 24px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px;transition:all 0.3s;box-shadow:0 4px 12px rgba(102,126,234,0.3);position:relative">
      📈 Фин отчёт
      <span id="finReportBadge" style="display:none;position:absolute;top:-8px;right:-8px;background:#ff6b6b;color:#fff;border-radius:50%;width:20px;height:20px;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;animation:pulse 1.5s infinite">⏳</span>
    </button>
    <button id="btnSalesReport" onclick="openSalesReportModal()" style="padding:12px 24px;background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px;transition:all 0.3s;box-shadow:0 4px 12px rgba(240,147,251,0.3);position:relative">
      💰 Продажи
      <span id="salesReportBadge" style="display:none;position:absolute;top:-8px;right:-8px;background:#ff6b6b;color:#fff;border-radius:50%;width:20px;height:20px;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;animation:pulse 1.5s infinite">⏳</span>
    </button>
    <button id="btnOrders" onclick="openOrdersModal()" style="padding:12px 24px;background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px;transition:all 0.3s;box-shadow:0 4px 12px rgba(79,172,254,0.3);position:relative">
      📦 Заказы
      <span id="ordersReportBadge" style="display:none;position:absolute;top:-8px;right:-8px;background:#ff6b6b;color:#fff;border-radius:50%;width:20px;height:20px;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;animation:pulse 1.5s infinite">⏳</span>
    </button>
    <button onclick="openCostModal()" style="padding:12px 24px;background:#fd79a8;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">💰 Себестоимость</button>
  </div>
  
  <!-- Индикатор загрузки -->
  <div id="loadingIndicator" style="display:none;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:16px 24px;border-radius:8px;margin-bottom:20px;box-shadow:0 4px 12px rgba(102,126,234,0.3)">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:24px;height:24px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite"></div>
      <div>
        <div style="font-weight:700;font-size:16px">⏳ Загрузка данных...</div>
        <div id="loadingStatus" style="font-size:13px;opacity:0.9;margin-top:4px">Загружаются все отчёты</div>
      </div>
    </div>
  </div>

  <!-- Карточки с общей статистикой -->
  <div id="statsCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:20px 0">
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px;border-radius:12px;color:#fff">
      <div style="font-size:14px;opacity:0.9;margin-bottom:8px">Общая выручка</div>
      <div id="totalRevenue" style="font-size:28px;font-weight:700">—</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px">Что заплатили покупатели</div>
    </div>
    <div style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:20px;border-radius:12px;color:#fff">
      <div style="font-size:14px;opacity:0.9;margin-bottom:8px">Комиссия WB</div>
      <div id="totalCommission" style="font-size:28px;font-weight:700">—</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px">Удержание маркетплейса</div>
    </div>
    <div style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);padding:20px;border-radius:12px;color:#fff">
      <div style="font-size:14px;opacity:0.9;margin-bottom:8px">Логистика + расходы</div>
      <div id="totalLogistics" style="font-size:28px;font-weight:700">—</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px">Доставка, хранение, штрафы</div>
    </div>
    <div style="background:linear-gradient(135deg,#43e97b 0%,#38f9d7 100%);padding:20px;border-radius:12px;color:#fff">
      <div style="font-size:14px;opacity:0.9;margin-bottom:8px">К перечислению</div>
      <div id="netProfit" style="font-size:28px;font-weight:700">—</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px">Придёт на ваш счёт</div>
    </div>
    <div style="background:linear-gradient(135deg,#ffd89b 0%,#19547b 100%);padding:20px;border-radius:12px;color:#fff">
      <div style="font-size:14px;opacity:0.9;margin-bottom:8px">Чистая прибыль</div>
      <div id="pureProfit" style="font-size:28px;font-weight:700">—</div>
      <div style="font-size:11px;opacity:0.7;margin-top:4px">Расчёт добавится позже</div>
    </div>
  </div>

  <!-- Модальное окно: Финансовый отчёт -->
  <div id="finReportModal" class="modal" onclick="closeModalOnOutsideClick(event, 'finReportModal')">
    <div class="modal-content" style="max-width:95vw;width:95vw;max-height:90vh" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h2>📈 Финансовый отчёт</h2>
        <button class="close-btn" onclick="closeModal('finReportModal')">&times;</button>
      </div>
      <div id="finReportTabs" style="display:none;gap:0;margin-bottom:0;flex-wrap:wrap;background:#f8f9fa;padding:0 20px"></div>
      <div style="overflow-x:auto;max-width:100%;max-height:70vh;overflow-y:auto;border-top:2px solid #e9ecef">
        <table id="finReportTable" style="width:100%;border-collapse:collapse;min-width:4000px">
          <thead id="finReportHeader" style="position:sticky;top:0;z-index:10;background:#f8f9fa">
          <tr style="background:#f8f9fa">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:40px;max-width:50px;word-wrap:break-word">№</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Номер поставки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Предмет</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:120px;word-wrap:break-word">Код номенклатуры</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Бренд</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Артикул поставщика</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:200px;word-wrap:break-word">Название</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:60px;max-width:80px;word-wrap:break-word">Размер</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Баркод</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Тип документа</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Обоснование для оплаты</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Дата заказа покупателем</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Дата продажи</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:60px;max-width:80px;word-wrap:break-word">Кол-во</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Цена розничная, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">ВайлдБерриз реализовал Товар (Пр)</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Согласованный продуктовый дисконт, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Промокод, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Итоговая согласованная скидка</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Цена розничная с учетом согласованной скидки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Размер снижения кВВ из-за реализации, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Размер снижения кВВ из-за акции, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Размер кВВ, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Размер кВВ без НДС, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Итоговая согласованная скидка, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Размер кВВ</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Возмещение за выдачу и возврат товаров</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Эквайринг/Комиссия за организацию платежей</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:180px;word-wrap:break-word">Размер комиссии за эквайринг/Комиссия за организацию платежей, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Тип платежа за Эквайринг/Комиссия за организацию платежей</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Возмещение ВайлдБерриз (ВВ), без НДС</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">НДС с Возмещения ВайлдБерриз</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">К перечислению Продавцу за реализованный Товар</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Количество поставок</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Количество возвратов</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Услуги по доставке товара покупателю</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Дата начала действия фиксации</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Дата конца действия фиксации</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Признак услуги штрафов и корректировок</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Общая сумма штрафов</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Корректировка Возмещения ВайлдБерриз (ВВ)</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:180px;word-wrap:break-word">Виды логистики, штрафов и корректировок ВВ</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Список МП</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Наименование банка-эквайера</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Номер офиса</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Наименование офиса доставки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:90px;max-width:120px;word-wrap:break-word">ИНН партнера</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Партнер</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:100px;word-wrap:break-word">Склад</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:70px;max-width:90px;word-wrap:break-word">Страна</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Тип коробов</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Номер таможенной декларации</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Номер сборочного задания</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Код маркировки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:60px;max-width:80px;word-wrap:break-word">ШК</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:60px;max-width:80px;word-wrap:break-word">Srid</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:180px;word-wrap:break-word">Возмещение издержек по перевозке/по складским операциям с товаром</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Организатор перевозки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:80px;max-width:110px;word-wrap:break-word">Хранение</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:90px;max-width:120px;word-wrap:break-word">Удержания</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:140px;word-wrap:break-word">Операции при приемке</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Фиксированный коэффициент скидка по поставке</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:150px;word-wrap:break-word">Признак продажи юридическому лицу</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Номер короба для обработки товара</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:90px;max-width:120px;word-wrap:break-word">Скидка Wibes, %</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Компенсация скидки по программе лояльности</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:160px;word-wrap:break-word">Стоимость участия в программе лояльности</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:140px;max-width:190px;word-wrap:break-word">Сумма удержанная за начисленные баллы программы лояльности</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:100px;max-width:130px;word-wrap:break-word">Id корзины заказа</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;font-size:13px;min-width:120px;max-width:150px;word-wrap:break-word">Способы продажи и тип товара</th>
            
            
            
            
            
            
            
            
            
          </tr>
        </thead>
        <tbody id="finReportBody">
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Модальное окно: Продажи -->
<div id="salesReportModal" class="modal" onclick="closeModalOnOutsideClick(event, 'salesReportModal')">
  <div class="modal-content" style="max-width:90vw;width:90vw;max-height:90vh" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2>💰 Отчёт по продажам</h2>
      <button class="close-btn" onclick="closeModal('salesReportModal')">&times;</button>
    </div>
    <div style="overflow-x:auto;max-width:100%;max-height:70vh;overflow-y:auto">
      <table id="salesReportTable" style="width:100%;border-collapse:collapse">
        <thead id="salesReportHeader" style="position:sticky;top:0;z-index:10;background:#f8f9fa">
        </thead>
        <tbody id="salesReportBody">
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Модальное окно: Заказы -->
<div id="ordersModal" class="modal" onclick="closeModalOnOutsideClick(event, 'ordersModal')">
  <div class="modal-content" style="max-width:90vw;width:90vw;max-height:90vh" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2>📦 Отчёт по заказам</h2>
      <button class="close-btn" onclick="closeModal('ordersModal')">&times;</button>
    </div>
    <div style="overflow-x:auto;max-width:100%;max-height:70vh;overflow-y:auto">
      <table id="ordersTable" style="width:100%;border-collapse:collapse">
        <thead id="ordersHeader" style="position:sticky;top:0;z-index:10;background:#f8f9fa">
        </thead>
        <tbody id="ordersBody">
        </tbody>
      </table>
    </div>
  </div>
</div>
</div>

<!-- Модальное окно управления магазинами -->
<div id="businessModal" class="modal">
  <div class="modal-content" style="max-width:900px">
    <div class="modal-header">
      <h2>🏢 Управление магазинами</h2>
      <button class="close-btn" onclick="closeBusinessManager()">&times;</button>
    </div>
    
    <div style="margin-bottom:20px">
      <button onclick="openAddBusinessForm()" style="padding:10px 20px;background:#00b894;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">+ Добавить магазин</button>
    </div>
    
    <!-- Форма добавления магазина -->
    <div id="addBusinessForm" style="display:none;background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px">
      <h3 style="margin-top:0">Новый магазин</h3>
      <form id="businessForm" onsubmit="addBusiness(event)">
        <div class="form-group">
          <label for="companyName">Название магазина *</label>
          <input type="text" id="companyName" placeholder="Мой магазин" required />
        </div>
        <div class="form-group">
          <label for="wbApiKey">API ключ Wildberries *</label>
          <input type="text" id="wbApiKey" placeholder="Ваш API ключ от WB" required />
          <small>API ключ можно получить в личном кабинете WB: Настройки → Доступ к API</small>
        </div>
        <div class="form-group">
          <label for="description">Описание (необязательно)</label>
          <textarea id="description" rows="2" placeholder="Краткое описание магазина"></textarea>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit" style="padding:10px 20px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Сохранить</button>
          <button type="button" onclick="closeAddBusinessForm()" style="padding:10px 20px;background:#dfe6e9;color:#2d3436;border:none;border-radius:8px;font-weight:600;cursor:pointer">Отмена</button>
        </div>
      </form>
    </div>
    
    <!-- Список магазинов -->
    <div id="businessList" style="max-height:400px;overflow-y:auto">
      <p style="text-align:center;color:#636e72">Загрузка...</p>
    </div>
  </div>
</div>

<!-- Модальное окно себестоимости -->
<div id="costModal" class="modal">
  <div class="modal-content" style="max-width:1000px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column">
    <div class="modal-header" style="flex-shrink:0">
      <h2>💰 Себестоимость товаров</h2>
      <button class="close-btn" onclick="closeCostModal()">&times;</button>
    </div>
    
    <div style="flex-shrink:0;padding:0 20px 15px;border-bottom:1px solid #dfe6e9">
      <button id="saveCostBtn" onclick="saveCostData()" disabled style="padding:10px 20px;background:#b2bec3;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:not-allowed;font-size:14px">💾 Сохранить</button>
    </div>
    
    <div id="costTableContainer" style="flex:1;overflow:auto;padding:20px">
      <p style="text-align:center;color:#636e72">⏳ Загрузка товаров...</p>
    </div>
  </div>
</div>

<!-- Модальное окно выбора диапазона дат -->
<div id="dateRangeModal" class="modal" onclick="closeModalOnOutsideClick(event, 'dateRangeModal')">
  <div class="modal-content" style="max-width:900px;padding:0" onclick="event.stopPropagation()">
    <div class="modal-header" style="border-radius:12px 12px 0 0">
      <h2>📅 Выбор периода</h2>
      <button class="close-btn" onclick="closeModal('dateRangeModal')">&times;</button>
    </div>
    <div style="display:flex;gap:0">
      <!-- Календарь -->
      <div style="flex:1;padding:20px;border-right:1px solid #dfe6e9;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-shrink:0">
          <button onclick="changeCalendarYear(-1)" style="padding:8px 12px;background:#f8f9fa;border:none;border-radius:6px;cursor:pointer;font-size:18px;font-weight:700;color:#2d3436">‹</button>
          <div style="font-weight:700;font-size:18px;color:#2d3436">
            <span id="calendarYear"></span>
          </div>
          <button onclick="changeCalendarYear(1)" style="padding:8px 12px;background:#f8f9fa;border:none;border-radius:6px;cursor:pointer;font-size:18px;font-weight:700;color:#2d3436">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:12px;flex-shrink:0">
          <div style="text-align:center;font-weight:600;font-size:12px;color:#636e72;padding:8px">Пн</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#636e72;padding:8px">Вт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#636e72;padding:8px">Ср</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#636e72;padding:8px">Чт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#636e72;padding:8px">Пт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#ff6b6b;padding:8px">Сб</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#ff6b6b;padding:8px">Вс</div>
        </div>
        <div id="calendarMonths" style="flex:1;overflow-y:auto;max-height:500px"></div>
      </div>
      
      <!-- Боковая панель -->
      <div style="width:280px;padding:20px;background:#f8f9fa;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:13px;font-weight:600;color:#636e72;margin-bottom:4px">БЫСТРЫЙ ВЫБОР</div>
          <button onclick="selectQuickRange('week')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Неделя</button>
          <button onclick="selectQuickRange('month')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Месяц</button>
          <button onclick="selectQuickRange('quarter')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Квартал</button>
          <button onclick="selectQuickRange('year')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Год</button>
        </div>
        
        <div style="border-top:1px solid #dfe6e9;padding-top:16px">
          <div style="font-size:13px;font-weight:600;color:#636e72;margin-bottom:8px">ВЫБРАННЫЙ ПЕРИОД</div>
          <div style="background:#fff;padding:12px;border-radius:8px;border:2px solid #dfe6e9;margin-bottom:8px">
            <div style="font-size:12px;color:#636e72;margin-bottom:4px">Начало периода</div>
            <div id="selectedStartDate" style="font-weight:700;color:#2d3436;font-size:14px">Не выбрано</div>
          </div>
          <div style="background:#fff;padding:12px;border-radius:8px;border:2px solid #dfe6e9">
            <div style="font-size:12px;color:#636e72;margin-bottom:4px">Конец периода</div>
            <div id="selectedEndDate" style="font-weight:700;color:#2d3436;font-size:14px">Не выбрано</div>
          </div>
        </div>
        
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
          <button onclick="resetDateRange()" style="padding:12px 24px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s">
            Сбросить
          </button>
          <button onclick="applyDateRange()" style="padding:12px 24px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;transition:all 0.2s">
            Применить
          </button>
        </div>
      </div>
    </div>
    <input type="date" id="dateFromPicker" style="display:none" />
    <input type="date" id="dateToPicker" style="display:none" />
  </div>
</div>

<script>
// ==================== УПРАВЛЕНИЕ КОМПАНИЯМИ ====================
let businesses = [];
let currentBusinessId = null;
// Флаги загрузки данных для каждого типа отчёта
let finReportDataLoaded = false;
let salesReportDataLoaded = false;
let ordersDataLoaded = false;

// Переменная для хранения выбранного типа отчета
let selectedReportType = null;

// Функция переключения типа отчета
function toggleReportType(type) {
  const btnFinReport = document.getElementById('btnFinReport');
  const btnSalesReport = document.getElementById('btnSalesReport');
  const btnOrders = document.getElementById('btnOrders');
  
  // Сбрасываем стили всех кнопок
  const resetButton = (btn) => {
    btn.style.background = '#fff';
    btn.style.color = '#2d3436';
    btn.style.border = '2px solid #dfe6e9';
    btn.style.transform = 'none';
    btn.style.boxShadow = 'none';
  };
  
  if (selectedReportType === type) {
    // Снимаем выбор
    selectedReportType = null;
    resetButton(btnFinReport);
    resetButton(btnSalesReport);
    resetButton(btnOrders);
  } else {
    // Сначала сбрасываем все кнопки
    resetButton(btnFinReport);
    resetButton(btnSalesReport);
    resetButton(btnOrders);
    
    // Выбираем нужную кнопку
    selectedReportType = type;
    let activeBtn, gradient, borderColor;
    
    if (type === 'finReport') {
      activeBtn = btnFinReport;
      gradient = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      borderColor = '#667eea';
    } else if (type === 'salesReport') {
      activeBtn = btnSalesReport;
      gradient = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      borderColor = '#f093fb';
    } else if (type === 'orders') {
      activeBtn = btnOrders;
      gradient = 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
      borderColor = '#4facfe';
    }
    
    activeBtn.style.background = gradient;
    activeBtn.style.color = '#fff';
    activeBtn.style.border = '2px solid ' + borderColor;
    activeBtn.style.transform = 'translateY(-2px)';
    activeBtn.style.boxShadow = '0 4px 12px rgba(102,126,234,0.4)';
  }
}

function openBusinessManager() {
  document.getElementById('businessModal').classList.add('active');
  loadBusinesses();
}

function closeBusinessManager() {
  document.getElementById('businessModal').classList.remove('active');
  closeAddBusinessForm();
}

function openAddBusinessForm() {
  document.getElementById('addBusinessForm').style.display = 'block';
}

function closeAddBusinessForm() {
  document.getElementById('addBusinessForm').style.display = 'none';
  document.getElementById('businessForm').reset();
}

function loadBusinesses() {
  fetch('/api/businesses', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      businesses = data.businesses;
      renderBusinessList(data.businesses);
      
      // Восстанавливаем последний выбранный магазин из localStorage
      const savedBusinessId = localStorage.getItem('selectedBusinessId');
      if (savedBusinessId && savedBusinessId !== 'null') {
        currentBusinessId = savedBusinessId === 'all' ? 'all' : parseInt(savedBusinessId);
        console.log('📦 Восстановлен сохранённый магазин:', currentBusinessId);
      }
      
      updateBusinessSelector(data.businesses);
      
      // Автоматически загружаем данные из Supabase после загрузки списка компаний
      if (currentBusinessId) {
        console.log('🔄 Автозагрузка данных при инициализации страницы');
        loadFinancialData();
      }
    } else {
      document.getElementById('businessList').innerHTML = '<p style="color:#d63031">Ошибка: ' + data.error + '</p>';
    }
  })
  .catch(err => {
    document.getElementById('businessList').innerHTML = '<p style="color:#d63031">Ошибка загрузки: ' + err.message + '</p>';
  });
}

function renderBusinessList(businessList) {
  if (businessList.length === 0) {
    document.getElementById('businessList').innerHTML = '<p style="text-align:center;color:#636e72">Нет магазинов. Добавьте первый магазин.</p>';
    return;
  }
  
  let html = '<div style="display:grid;gap:12px">';
  businessList.forEach(business => {
    const isActive = business.is_active === true || business.is_active === 1;
    const statusBadge = isActive 
      ? '<span style="background:#00b894;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px">Активен</span>'
      : '<span style="background:#dfe6e9;color:#636e72;padding:4px 8px;border-radius:4px;font-size:12px">Неактивен</span>';
    
    html += \`
      <div style="background:\${isActive ? '#fff' : '#f8f9fa'};padding:16px;border-radius:8px;border:2px solid \${isActive ? '#6c5ce7' : '#dfe6e9'}">
        <div style="display:flex;justify-content:space-between;align-items:start">
          <div style="flex:1">
            <h4 style="margin:0 0 8px;color:#2d3436">\${business.company_name}</h4>
            <p style="margin:0 0 4px;font-size:13px;color:#636e72">API: \${business.wb_api_key.substring(0, 20)}...</p>
            \${business.description ? \`<p style="margin:0;font-size:13px;color:#636e72">\${business.description}</p>\` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            \${statusBadge}
            <button onclick="toggleBusinessActive(\${business.id}, \${!isActive})" style="padding:6px 12px;background:#74b9ff;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">\${isActive ? 'Деактивировать' : 'Активировать'}</button>
            <button onclick="deleteBusiness(\${business.id}, '\${business.company_name}')" style="padding:6px 12px;background:#d63031;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer">Удалить</button>
          </div>
        </div>
      </div>
    \`;
  });
  html += '</div>';
  
  document.getElementById('businessList').innerHTML = html;
}

function addBusiness(event) {
  event.preventDefault();
  
  const formData = {
    company_name: document.getElementById('companyName').value.trim(),
    wb_api_key: document.getElementById('wbApiKey').value.trim(),
    description: document.getElementById('description').value.trim()
  };
  
  fetch('/api/businesses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify(formData)
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('✅ Магазин успешно добавлен!');
      closeAddBusinessForm();
      loadBusinesses();
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
  })
  .catch(err => {
    alert('❌ Ошибка: ' + err.message);
  });
}

function toggleBusinessActive(businessId, isActive) {
  fetch(\`/api/businesses/\${businessId}\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ is_active: isActive })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      loadBusinesses();
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
  })
  .catch(err => {
    alert('❌ Ошибка: ' + err.message);
  });
}

function deleteBusiness(businessId, companyName) {
  if (!confirm(\`Вы уверены, что хотите удалить магазин "\${companyName}"?\`)) {
    return;
  }
  
  fetch(\`/api/businesses/\${businessId}\`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('✅ Магазин удалён');
      loadBusinesses();
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
  })
  .catch(err => {
    alert('❌ Ошибка: ' + err.message);
  });
}

function updateBusinessSelector(businessList) {
  const selector = document.getElementById('currentBusiness');
  const activeBusinesses = businessList.filter(b => b.is_active === true || b.is_active === 1);
  
  if (activeBusinesses.length === 0) {
    selector.innerHTML = '<option value="">Нет активных магазинов</option>';
    selector.disabled = true;
    return;
  }
  
  selector.disabled = false;
  
  // Добавляем placeholder "Выбор магазина"
  let options = '<option value="" disabled>Выбор магазина...</option>';
  
  // Добавляем опцию "Все активные магазины" если больше одного магазина
  if (activeBusinesses.length > 1) {
    options += '<option value="all">🌐 Все активные магазины</option>';
  }
  
  // Добавляем список магазинов
  options += activeBusinesses.map(b => 
    \`<option value="\${b.id}">\${b.company_name}</option>\`
  ).join('');
  
  selector.innerHTML = options;
  
  // Устанавливаем первый магазин по умолчанию (или сохраняем текущий выбор)
  if (currentBusinessId && (currentBusinessId === 'all' || activeBusinesses.find(b => b.id === currentBusinessId))) {
    // Если уже был выбран магазин - сохраняем выбор
    selector.value = currentBusinessId;
  } else if (activeBusinesses.length === 1) {
    // Если только один магазин - автоматически выбираем его
    currentBusinessId = activeBusinesses[0].id;
    selector.value = currentBusinessId;
  } else {
    // Если магазинов много и ничего не выбрано - показываем placeholder
    currentBusinessId = null;
    selector.value = '';
  }
  
  console.log('updateBusinessSelector: currentBusinessId=' + currentBusinessId + ', selector.value=' + selector.value);
}

function switchBusiness() {
  const value = document.getElementById('currentBusiness').value;
  currentBusinessId = value === 'all' ? 'all' : parseInt(value);
  
  // Сохраняем выбранный магазин в localStorage
  if (currentBusinessId) {
    localStorage.setItem('selectedBusinessId', currentBusinessId);
    console.log('💾 Сохранён выбор магазина:', currentBusinessId);
  } else {
    localStorage.removeItem('selectedBusinessId');
  }
  
  console.log('switchBusiness: value=' + value + ', currentBusinessId=' + currentBusinessId);
  
  // Автоматически загружаем данные из Supabase при смене магазина
  if (currentBusinessId) {
    console.log('🔄 Автоматическая загрузка данных для магазина:', currentBusinessId);
    loadFinancialData();
  }
}

// Принудительная синхронизация с WB API
function syncWithWB() {
  if (!currentBusinessId || currentBusinessId === 'all') {
    alert('❌ Выберите конкретный магазин для синхронизации с WB API');
    return;
  }
  
  if (!confirm('Запустить принудительную синхронизацию с WB API? Это может занять несколько минут.')) {
    return;
  }
  
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = '⏳ Синхронизация...';
  
  fetch('/api/sync/' + currentBusinessId, {
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer ' + localStorage.getItem('authToken'),
      'Content-Type': 'application/json'
    }
  })
  .then(res => res.json())
  .then(data => {
    btn.disabled = false;
    btn.textContent = '🔄 Синхронизация с WB';
    
    if (data.success) {
      alert('✅ Синхронизация завершена успешно!\\n\\n' +
            'Продажи: ' + (data.results.sales || 0) + ' записей\\n' +
            'Заказы: ' + (data.results.orders || 0) + ' записей\\n' +
            'Финансы: ' + (data.results.financial || 0) + ' записей');
      
      // Перезагружаем данные после синхронизации
      loadFinancialData();
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
  })
  .catch(err => {
    btn.disabled = false;
    btn.textContent = '🔄 Синхронизация с WB';
    alert('❌ Ошибка синхронизации: ' + err.message);
  });
}

// Закрытие модалки при клике вне её
document.getElementById('businessModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeBusinessManager();
  }
});

// Helper функция для загрузки данных из всех активных магазинов
function loadFromAllBusinesses(endpoint, dateRange, displayCallback) {
  const activeBusinesses = businesses.filter(b => b.is_active === 1);
  
  if (activeBusinesses.length === 0) {
    const tbody = document.getElementById('datasetBody');
    tbody.innerHTML = '<tr><td colspan="10" style="padding:40px;text-align:center;color:#d63031">❌ Нет активных магазинов</td></tr>';
    return;
  }
  
  // Делаем параллельные запросы ко всем активным компаниям
  const promises = activeBusinesses.map(business => 
    fetch(endpoint + '?businessId=' + business.id + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
    })
    .then(res => res.json())
    .catch(err => ({ error: 'Ошибка загрузки для ' + business.company_name + ': ' + err.message }))
  );
  
  Promise.all(promises).then(results => {
    // Фильтруем ошибки и объединяем данные
    let allData = [];
    let errors = [];
    
    results.forEach((result, index) => {
      const companyName = activeBusinesses[index].company_name;
      
      console.log('Результат от компании', companyName, ':', result);
      
      if (result.error) {
        errors.push(companyName + ': ' + result.error);
      } else if (result.items) {
        // Для Orders API - извлекаем items и добавляем company_name
        if (Array.isArray(result.items)) {
          const itemsWithCompany = result.items.map(item => ({ ...item, company_name: companyName }));
          allData = allData.concat(itemsWithCompany);
        }
      } else if (result.data) {
        // Для Sales API и Fin Report - извлекаем data и добавляем company_name
        if (Array.isArray(result.data)) {
          const dataWithCompany = result.data.map(item => ({ ...item, company_name: companyName }));
          allData = allData.concat(dataWithCompany);
        } else {
          allData.push({ ...result.data, company_name: companyName });
        }
      } else if (Array.isArray(result)) {
        // Если result сам является массивом
        const resultWithCompany = result.map(item => ({ ...item, company_name: companyName }));
        allData = allData.concat(resultWithCompany);
      }
    });
    
    if (errors.length > 0) {
      console.warn('Ошибки при загрузке:', errors);
    }
    
    console.log('Всего загружено записей:', allData.length);
    console.log('Пример первой записи:', allData[0]);
    
    // Передаем объединенные данные в callback
    displayCallback(allData);
  });
}

// Загружаем список компаний при загрузке страницы
loadBusinesses();

// ==================== МОДАЛКА СЕБЕСТОИМОСТИ ====================
let costDataCache = []; // Кеш данных о себестоимости

function openCostModal() {
  if (!currentBusinessId) {
    alert('❌ Сначала Выберите магазин');
    return;
  }
  document.getElementById('costModal').classList.add('active');
  loadCostData();
}

function closeCostModal() {
  document.getElementById('costModal').classList.remove('active');
}

// Загрузка данных из WB API для текущей компании
function loadCostData() {
  if (!currentBusinessId) {
    alert('❌ Выберите магазин');
    return;
  }
  
  const container = document.getElementById('costTableContainer');
  container.innerHTML = '<p style="text-align:center;color:#636e72">⏳ Загрузка товаров...</p>';
  
  // Получаем API ключ из текущей выбранной компании
  const business = businesses.find(b => b.id === currentBusinessId);
  if (!business) {
    container.innerHTML = '<p style="text-align:center;color:#d63031">❌ Магазин не найден</p>';
    return;
  }
  
  // Используем endpoint sales для получения списка товаров
  const dateRange = getDateRange();
  fetch(\`/api/wb-sales-grouped?businessId=\${currentBusinessId}&dateFrom=\${dateRange.dateFrom}&dateTo=\${dateRange.dateTo}\`, {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(response => {
    if (response.error) {
      container.innerHTML = '<p style="text-align:center;color:#d63031">❌ ' + response.error + '</p>';
      return;
    }
    
    if (!response.data || response.data.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#636e72">Нет данных за выбранный период</p>';
      return;
    }
    
    // Формируем данные для таблицы
    costDataCache = response.data.map(item => ({
      nmId: item.nmId,
      brand: item.brand || '—',
      customName: '', // Название присваивается пользователем
      cost: 0 // Себестоимость заполняется вручную
    }));
    
    // Загружаем сохранённые себестоимости из БД
    loadSavedCosts();
  })
  .catch(err => {
    container.innerHTML = '<p style="text-align:center;color:#d63031">❌ Ошибка: ' + err.message + '</p>';
  });
}

// Загрузка сохранённых себестоимостей из БД
function loadSavedCosts() {
  if (!currentBusinessId) return;
  
  fetch(\`/api/product-costs/\${currentBusinessId}\`, {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success && data.costs) {
      // Обновляем себестоимости и названия в кеше из БД
      data.costs.forEach(savedCost => {
        const item = costDataCache.find(c => c.nmId == savedCost.nm_id);
        if (item) {
          item.cost = savedCost.cost;
          item.customName = savedCost.custom_name || '';
        }
      });
    }
    renderCostTable();
  })
  .catch(err => {
    console.error('Ошибка загрузки себестоимостей:', err);
    renderCostTable(); // Рендерим таблицу даже при ошибке
  });
}

// Получить URL изображения товара по nmId
function getProductImageUrl(nmId) {
  // Актуальный формат WB 2025-2026
  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  
  // Определение хоста по vol
  let host;
  if (vol >= 0 && vol <= 143) host = '01';
  else if (vol >= 144 && vol <= 287) host = '02';
  else if (vol >= 288 && vol <= 431) host = '03';
  else if (vol >= 432 && vol <= 719) host = '04';
  else if (vol >= 720 && vol <= 1007) host = '05';
  else if (vol >= 1008 && vol <= 1061) host = '06';
  else if (vol >= 1062 && vol <= 1115) host = '07';
  else if (vol >= 1116 && vol <= 1169) host = '08';
  else if (vol >= 1170 && vol <= 1313) host = '09';
  else if (vol >= 1314 && vol <= 1601) host = '10';
  else if (vol >= 1602 && vol <= 1655) host = '11';
  else if (vol >= 1656 && vol <= 1919) host = '12';
  else if (vol >= 1920 && vol <= 2045) host = '13';
  else host = '14';
  
  return \`https://basket-\${host}.wbbasket.ru/vol\${vol}/part\${part}/\${nmId}/images/big/1.webp\`;
}

// Отрисовка таблицы с данными
function renderCostTable() {
  const container = document.getElementById('costTableContainer');
  
  let html = \`
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f8f9fa">
          <th style="padding:12px;text-align:center;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:80px">Фото</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:12%">Бренд</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:12%">Артикул WB</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:35%">Название товара</th>
          <th style="padding:12px;text-align:right;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:25%">Себестоимость (₽)</th>
        </tr>
      </thead>
      <tbody>
  \`;
  
  costDataCache.forEach((item, index) => {
    const imageUrl = getProductImageUrl(item.nmId);
    html += \`
      <tr style="border-bottom:1px solid #f1f3f5">
        <td style="padding:8px;text-align:center">
          <img 
            src="\${imageUrl}" 
            alt="Товар" 
            style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #dfe6e9"
            onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect width=%2250%22 height=%2250%22 fill=%22%23dfe6e9%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23636e72%22 font-size=%2212%22%3E📦%3C/text%3E%3C/svg%3E'"
          />
        </td>
        <td style="padding:12px;color:#636e72">\${item.brand}</td>
        <td style="padding:12px;color:#2d3436;font-weight:500">\${item.nmId}</td>
        <td style="padding:12px">
          <input 
            type="text" 
            id="name_\${index}"
            value="\${item.customName || ''}"
            oninput="updateCostField(\${index}, 'customName', this.value)"
            placeholder="Введите название"
            style="width:100%;padding:6px 10px;border:2px solid #dfe6e9;border-radius:6px;font-size:14px"
          />
        </td>
        <td style="padding:12px;text-align:right">
          <input 
            type="number" 
            id="cost_\${index}"
            value="\${item.cost || ''}"
            oninput="updateCostField(\${index}, 'cost', this.value)"
            placeholder="0"
            style="width:150px;padding:6px 10px;border:2px solid #dfe6e9;border-radius:6px;text-align:right;font-size:14px"
          />
        </td>
      </tr>
    \`;
  });
  
  html += \`
      </tbody>
    </table>
  \`;
  
  container.innerHTML = html;
}

// Обновление данных в кеше и активация кнопки сохранения
function updateCostField(index, field, value) {
  if (costDataCache[index]) {
    if (field === 'cost') {
      costDataCache[index].cost = parseFloat(value) || 0;
    } else if (field === 'customName') {
      costDataCache[index].customName = value;
    }
    
    // Активируем кнопку сохранения
    const saveBtn = document.getElementById('saveCostBtn');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.style.background = '#6c5ce7';
      saveBtn.style.cursor = 'pointer';
    }
  }
}

// Сохранение данных себестоимости
function saveCostData() {
  if (costDataCache.length === 0) {
    alert('❌ Нет данных для сохранения. Сначала загрузите данные.');
    return;
  }
  
  if (!currentBusinessId) {
    alert('❌ Компания не выбрана');
    return;
  }
  
  // Отправляем данные на сервер
  fetch(\`/api/product-costs/\${currentBusinessId}/bulk\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ products: costDataCache })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert(\`✅ \${data.message}\`);
      // Деактивируем кнопку после успешного сохранения
      const saveBtn = document.getElementById('saveCostBtn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.style.background = '#b2bec3';
        saveBtn.style.cursor = 'not-allowed';
      }
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
  })
  .catch(err => {
    alert('❌ Ошибка сохранения: ' + err.message);
  });
}

// ==================== ВЫБОР ДИАПАЗОНА ДАТ ====================
let currentCalendarYear = new Date().getFullYear();
let selectedStartDate = null;
let selectedEndDate = null;
let isSelectingRange = false;

function openDateRangePicker() {
  const dateFrom = document.getElementById('dateFrom');
  const dateTo = document.getElementById('dateTo');
  
  // Устанавливаем текущий выбранный диапазон
  if (dateFrom.value && dateTo.value) {
    selectedStartDate = new Date(dateFrom.value);
    selectedEndDate = new Date(dateTo.value);
    updateSelectedDatesDisplay();
  }
  
  // Показываем текущий год
  currentCalendarYear = (selectedEndDate || new Date()).getFullYear();
  renderCalendar();
  
  document.getElementById('dateRangeModal').style.display = 'flex';
  
  // Скроллим к текущему месяцу
  setTimeout(() => {
    const currentMonth = (selectedEndDate || new Date()).getMonth();
    const monthElement = document.getElementById('month-' + currentMonth);
    if (monthElement) {
      monthElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

function renderCalendar() {
  const year = currentCalendarYear;
  
  // Обновляем заголовок года
  document.getElementById('calendarYear').textContent = year;
  
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthsContainer = document.getElementById('calendarMonths');
  monthsContainer.innerHTML = '';
  
  // Рендерим все 12 месяцев
  for (let month = 0; month < 12; month++) {
    const monthBlock = document.createElement('div');
    monthBlock.id = 'month-' + month;
    monthBlock.style.cssText = 'margin-bottom:24px;scroll-margin-top:20px';
    
    // Заголовок месяца
    const monthTitle = document.createElement('div');
    monthTitle.textContent = monthNames[month];
    monthTitle.style.cssText = 'font-weight:700;font-size:16px;color:#2d3436;margin-bottom:12px;text-align:center';
    monthBlock.appendChild(monthTitle);
    
    // Сетка дней
    const daysGrid = document.createElement('div');
    daysGrid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px';
    
    // Получаем первый и последний день месяца
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Получаем день недели первого дня
    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
    
    // Пустые ячейки
    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.style.padding = '10px';
      daysGrid.appendChild(emptyDay);
    }
    
    // Дни месяца
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dayDate = new Date(year, month, day);
      const dayElement = document.createElement('div');
      dayElement.textContent = day;
      dayElement.style.cssText = 'padding:10px;text-align:center;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s';
      
      // Проверяем диапазон
      const isInRange = selectedStartDate && selectedEndDate && 
                        dayDate >= selectedStartDate && dayDate <= selectedEndDate;
      const isStart = selectedStartDate && dayDate.toDateString() === selectedStartDate.toDateString();
      const isEnd = selectedEndDate && dayDate.toDateString() === selectedEndDate.toDateString();
      
      if (isStart || isEnd) {
        dayElement.style.background = '#6c5ce7';
        dayElement.style.color = '#fff';
      } else if (isInRange) {
        dayElement.style.background = '#e3e1fc';
        dayElement.style.color = '#6c5ce7';
      } else {
        dayElement.style.background = '#fff';
        dayElement.style.color = '#2d3436';
      }
      
      dayElement.onmouseover = () => {
        if (!isStart && !isEnd) {
          dayElement.style.background = '#f8f9fa';
        }
      };
      dayElement.onmouseout = () => {
        if (!isInRange && !isStart && !isEnd) {
          dayElement.style.background = '#fff';
        } else if (isInRange && !isStart && !isEnd) {
          dayElement.style.background = '#e3e1fc';
        }
      };
      
      dayElement.onclick = () => selectDate(dayDate);
      
      daysGrid.appendChild(dayElement);
    }
    
    monthBlock.appendChild(daysGrid);
    monthsContainer.appendChild(monthBlock);
  }
}

function selectDate(date) {
  if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
    // Начинаем новый выбор
    selectedStartDate = date;
    selectedEndDate = null;
  } else if (selectedStartDate && !selectedEndDate) {
    // Выбираем конечную дату
    if (date < selectedStartDate) {
      selectedEndDate = selectedStartDate;
      selectedStartDate = date;
    } else {
      selectedEndDate = date;
    }
  }
  
  updateSelectedDatesDisplay();
  renderCalendar();
}

function changeCalendarYear(offset) {
  currentCalendarYear += offset;
  renderCalendar();
}

function updateSelectedDatesDisplay() {
  const formatDate = (date) => {
    if (!date) return 'Не выбрано';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return \`\${day}.\${month}.\${year}\`;
  };
  
  document.getElementById('selectedStartDate').textContent = formatDate(selectedStartDate);
  document.getElementById('selectedEndDate').textContent = formatDate(selectedEndDate);
}

function selectQuickRange(type) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Конечная дата = сегодня
  selectedEndDate = new Date(today);
  
  switch(type) {
    case 'week':
      selectedStartDate = new Date(today);
      selectedStartDate.setDate(selectedStartDate.getDate() - 7);
      break;
    case 'month':
      selectedStartDate = new Date(today);
      selectedStartDate.setDate(selectedStartDate.getDate() - 30);
      break;
    case 'quarter':
      selectedStartDate = new Date(today);
      selectedStartDate.setDate(selectedStartDate.getDate() - 90);
      break;
    case 'year':
      selectedStartDate = new Date(today);
      selectedStartDate.setDate(selectedStartDate.getDate() - 365);
      break;
  }
  
  updateSelectedDatesDisplay();
  renderCalendar();
  
  // Автоматически применяем выбранный быстрый период
  applyDateRange();
}

function resetDateRange() {
  selectedStartDate = null;
  selectedEndDate = null;
  updateSelectedDatesDisplay();
  renderCalendar();
}

function applyDateRange() {
  if (!selectedStartDate || !selectedEndDate) {
    alert('⚠️ Пожалуйста, выберите обе даты');
    return;
  }
  
  // Применяем даты
  const toISOString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return \`\${year}-\${month}-\${day}\`;
  };
  
  document.getElementById('dateFrom').value = toISOString(selectedStartDate);
  document.getElementById('dateTo').value = toISOString(selectedEndDate);
  
  // Форматируем для отображения (dd.mm.yyyy)
  const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return \`\${day}.\${month}.\${year}\`;
  };
  
  const displayText = \`\${formatDate(selectedStartDate)} — \${formatDate(selectedEndDate)}\`;
  document.getElementById('dateRangeDisplay').textContent = displayText;
  
  // Сохраняем период в localStorage
  localStorage.setItem('selectedDateFrom', toISOString(selectedStartDate));
  localStorage.setItem('selectedDateTo', toISOString(selectedEndDate));
  
  closeModal('dateRangeModal');
  
  // Автоматически перезагружаем данные с новым периодом
  loadFinancialData();
}

// Закрытие модалки при клике вне её
document.getElementById('costModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeCostModal();
  }
});

// Устанавливаем даты по умолчанию (последние 30 дней) и загружаем компании
window.addEventListener('DOMContentLoaded', function() {
  // Проверяем авторизацию
  const token = localStorage.getItem('authToken');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  
  // Восстанавливаем сохраненный период или устанавливаем значения по умолчанию
  const savedDateFrom = localStorage.getItem('selectedDateFrom');
  const savedDateTo = localStorage.getItem('selectedDateTo');
  
  let dateTo, dateFrom;
  
  if (savedDateFrom && savedDateTo) {
    // Восстанавливаем сохраненный период
    dateFrom = new Date(savedDateFrom);
    dateTo = new Date(savedDateTo);
  } else {
    // Устанавливаем dateTo = вчера (исключая сегодня)
    dateTo = new Date();
    dateTo.setDate(dateTo.getDate() - 1); // вчера
    
    // dateFrom = 90 дней назад (максимальный период WB API)
    dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 90);
  }
  
  document.getElementById('dateTo').value = dateTo.toISOString().split('T')[0];
  document.getElementById('dateFrom').value = dateFrom.toISOString().split('T')[0];
  
  // Обновляем отображение диапазона дат
  const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return \`\${day}.\${month}.\${year}\`;
  };
  document.getElementById('dateRangeDisplay').textContent = \`\${formatDate(dateFrom)} — \${formatDate(dateTo)}\`;
  
  // Загружаем список компаний
  loadBusinesses();
});

// ==================== ФИНАНСОВЫЕ ОТЧЁТЫ ====================

// Функция закрытия модального окна
function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

// Закрытие модального окна при клике вне его содержимого
function closeModalOnOutsideClick(event, modalId) {
  if (event.target.id === modalId) {
    closeModal(modalId);
  }
}

// Получить выбранные даты
function getDateRange() {
  const dateFrom = document.getElementById('dateFrom').value;
  const dateTo = document.getElementById('dateTo').value;
  
  if (!dateFrom || !dateTo) {
    alert('⚠️ Пожалуйста, выберите период');
    return null;
  }
  
  return { dateFrom, dateTo };
}

// Загрузка финансовых данных
// Функция загрузки ВСЕХ отчётов сразу
function loadFinancialData() {
  if (!currentBusinessId) {
    alert('❌ Выберите магазин');
    return;
  }
  
  const dateRange = getDateRange();
  if (!dateRange) return;
  
  // Сбрасываем флаги загрузки
  finReportDataLoaded = false;
  salesReportDataLoaded = false;
  ordersDataLoaded = false;
  
  // Показываем индикатор загрузки
  document.getElementById('loadingIndicator').style.display = 'block';
  document.getElementById('finReportBadge').style.display = 'flex';
  document.getElementById('salesReportBadge').style.display = 'flex';
  document.getElementById('ordersReportBadge').style.display = 'flex';
  
  // Загружаем все 3 отчёта параллельно
  loadFullFinReport(dateRange);
  loadSalesReport(dateRange);
  loadOrders();
}

// Проверка завершения всех загрузок
function checkAllDataLoaded() {
  if (finReportDataLoaded && salesReportDataLoaded && ordersDataLoaded) {
    // Скрываем индикатор загрузки
    document.getElementById('loadingIndicator').style.display = 'none';
    document.getElementById('finReportBadge').style.display = 'none';
    document.getElementById('salesReportBadge').style.display = 'none';
    document.getElementById('ordersReportBadge').style.display = 'none';
  }
}

// Функции открытия модалок
function openFinReportModal() {
  const modal = document.getElementById('finReportModal');
  const tbody = document.getElementById('finReportBody');
  
  if (!finReportDataLoaded) {
    tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#636e72;font-size:16px">Данные не загружены</td></tr>';
  }
  
  modal.style.display = 'flex';
}

function openSalesReportModal() {
  const modal = document.getElementById('salesReportModal');
  const tbody = document.getElementById('salesReportBody');
  
  if (!salesReportDataLoaded) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:40px;text-align:center;color:#636e72;font-size:16px">Данные не загружены</td></tr>';
  }
  
  modal.style.display = 'flex';
}

function openOrdersModal() {
  const modal = document.getElementById('ordersModal');
  const tbody = document.getElementById('ordersBody');
  
  if (!ordersDataLoaded) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#636e72;font-size:16px">Данные не загружены</td></tr>';
  }
  
  modal.style.display = 'flex';
}

function loadSales() {
  if (!currentBusinessId) {
    alert('❌ Выберите магазин');
    return;
  }
  
  const dateRange = getDateRange();
  if (!dateRange) return;
  
  const tbody = document.getElementById('finTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка продаж...</td></tr>';
  
  fetch('/api/wb-sales?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#d63031">❌ ' + data.error + '</td></tr>';
      return;
    }
    
    displayFinancialData(data);
  })
  .catch(err => {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#d63031">❌ Ошибка загрузки: ' + err.message + '</td></tr>';
  });
}

function loadOrders() {
  if (!currentBusinessId) {
    alert('❌ Выберите магазин');
    return;
  }
  
  const dateRange = getDateRange();
  if (!dateRange) return;
  
  const tbody = document.getElementById('ordersBody');
  tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка заказов...</td></tr>';
  
  // Если выбраны все магазины - загружаем из всех активных
  if (currentBusinessId === 'all') {
    loadFromAllBusinesses('/api/wb-orders', dateRange, displayOrdersData);
    return;
  }
  
  fetch('/api/wb-orders?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#d63031">❌ ' + data.error + '</td></tr>';
      // Устанавливаем флаг даже при ошибке, чтобы не ждать вечно
      ordersDataLoaded = true;
      document.getElementById('ordersReportBadge').style.display = 'none';
      checkAllDataLoaded();
      return;
    }
    
    displayOrdersData(data);
  })
  .catch(err => {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#d63031">❌ Ошибка загрузки: ' + err.message + '</td></tr>';
    // Устанавливаем флаг даже при ошибке, чтобы не ждать вечно
    ordersDataLoaded = true;
    document.getElementById('ordersReportBadge').style.display = 'none';
    checkAllDataLoaded();
  });
}

// Отображение данных заказов
function displayOrdersData(data) {
  const tbody = document.getElementById('ordersBody');
  const thead = document.getElementById('ordersHeader');
  
  // Устанавливаем заголовки
  thead.innerHTML = '<tr style="background:#f8f9fa">' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Артикул WB</th>' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Предмет</th>' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Бренд</th>' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Кол-во заказов</th>' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Общая сумма</th>' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Средняя цена</th>' +
    '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Склад</th>' +
    '</tr>';
  
  if (!data.items || data.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="padding:40px;text-align:center;color:#636e72">Нет заказов за выбранный период</td></tr>';
    
    // Устанавливаем флаг загрузки даже если данных нет
    ordersDataLoaded = true;
    document.getElementById('ordersReportBadge').style.display = 'none';
    checkAllDataLoaded();
    return;
  }
  
  // Группируем заказы по артикулам
  const grouped = {};
  data.items.forEach(item => {
    const key = item.nmId;
    if (!grouped[key]) {
      grouped[key] = {
        nmId: item.nmId,
        subject: item.subject,
        brand: item.subject,
        quantity: 0,
        totalAmount: 0,
        warehouse: '—'
      };
    }
    grouped[key].quantity += 1;
    grouped[key].totalAmount += item.forPay || 0;
  });
  
  const rows = Object.values(grouped);
  
  // Обновляем карточки статистики
  document.getElementById('totalRevenue').textContent = (data.stats?.totalRevenue || 0).toFixed(2) + ' ₽';
  document.getElementById('totalCommission').textContent = '—';
  document.getElementById('totalLogistics').textContent = '—';
  document.getElementById('netProfit').textContent = data.items.length + ' заказов';
  
  // Заполняем таблицу
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.style.transition = 'background 0.2s';
    tr.onmouseover = () => tr.style.background = '#f8f9fa';
    tr.onmouseout = () => tr.style.background = 'transparent';
    
    const avgPrice = row.totalAmount / row.quantity;
    
    tr.innerHTML = 
      '<td style="padding:12px;font-weight:600;color:#2d3436">' + (row.nmId || '—') + '</td>' +
      '<td style="padding:12px;color:#636e72">' + (row.subject || '—') + '</td>' +
      '<td style="padding:12px;color:#636e72">' + (row.brand || '—') + '</td>' +
      '<td style="padding:12px;text-align:right;font-weight:600;color:#0984e3">' + row.quantity + '</td>' +
      '<td style="padding:12px;text-align:right;font-weight:600;color:#00b894">' + row.totalAmount.toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;color:#636e72">' + avgPrice.toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;color:#636e72">' + row.warehouse + '</td>';
    
    tbody.appendChild(tr);
  });
  
  // Устанавливаем флаг загрузки
  ordersDataLoaded = true;
  
  // Скрываем бейдж загрузки для заказов
  document.getElementById('ordersReportBadge').style.display = 'none';
  
  // Проверяем завершение всех загрузок
  checkAllDataLoaded();
}

// Загрузка отчёта по продажам (уникальные артикулы)
function loadSalesReport(dateRange) {
  if (!currentBusinessId) {
    alert('❌ Выберите магазин');
    return;
  }
  
  const tbody = document.getElementById('salesReportBody');
  tbody.innerHTML = '<tr><td colspan="11" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка отчёта по продажам...</td></tr>';
  
  // Если выбраны все магазины - загружаем из всех активных
  if (currentBusinessId === 'all') {
    loadFromAllBusinesses('/api/wb-sales-grouped', dateRange, displaySalesReport);
    return;
  }
  
  fetch('/api/wb-sales-grouped?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
  })
  .then(res => res.json())
  .then(response => {
    if (response.error) {
      tbody.innerHTML = '<tr><td colspan="11" style="padding:40px;text-align:center;color:#d63031">❌ ' + response.error + '</td></tr>';
      // Устанавливаем флаг даже при ошибке
      salesReportDataLoaded = true;
      document.getElementById('salesReportBadge').style.display = 'none';
      checkAllDataLoaded();
      return;
    }
    
    // Добавляем company_name к каждому элементу данных
    const currentBusiness = businesses.find(b => b.id === currentBusinessId);
    const companyName = currentBusiness ? currentBusiness.company_name : '—';
    const dataWithCompany = response.data.map(item => ({ ...item, company_name: companyName }));
    
    displaySalesReport(dataWithCompany);
  })
  .catch(err => {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:40px;text-align:center;color:#d63031">❌ Ошибка загрузки: ' + err.message + '</td></tr>';
    // Устанавливаем флаг даже при ошибке
    salesReportDataLoaded = true;
    document.getElementById('salesReportBadge').style.display = 'none';
    checkAllDataLoaded();
  });
}

// Отображение отчёта по продажам (уникальные артикулы)
// Глобальная переменная для хранения данных и состояния сортировки
let salesReportData = [];
let salesSortState = { column: 'company_name', direction: 'asc' };

function displaySalesReport(data) {
  const tbody = document.getElementById('salesReportBody');
  const thead = document.getElementById('salesReportHeader');
  
  // Сохраняем данные глобально
  salesReportData = data;
  
  // Устанавливаем заголовки с возможностью сортировки
  const thStyle = 'padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px;cursor:pointer;user-select:none;transition:all 0.2s';
  const thStyleRight = 'padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px;cursor:pointer;user-select:none;transition:all 0.2s';
  
  thead.innerHTML = '<tr style="background:#f8f9fa">' +
    '<th style="' + thStyle + '" onclick="sortSalesReport(&quot;company_name&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Магазин ↕</th>' +
    '<th style="' + thStyle + '" onclick="sortSalesReport(&quot;nmId&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Артикул WB ↕</th>' +
    '<th style="' + thStyle + '" onclick="sortSalesReport(&quot;subject&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Предмет ↕</th>' +
    '<th style="' + thStyle + '" onclick="sortSalesReport(&quot;brand&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Бренд ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;quantity&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Кол-во ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;totalRevenue&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Выручка ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;totalCommission&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Комиссия ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;totalLogistics&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Логистика ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;totalForPay&quot;)" onmouseover="this.style.color=&quot;#00b894&quot;;this.style.background=&quot;#e8fff6&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">К перечислению ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;totalProfit&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Прибыль ↕</th>' +
    '<th style="' + thStyleRight + '" onclick="sortSalesReport(&quot;avgPrice&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Средняя цена ↕</th>' +
    '<th style="' + thStyle + '" onclick="sortSalesReport(&quot;warehouseName&quot;)" onmouseover="this.style.color=&quot;#6c5ce7&quot;;this.style.background=&quot;#e8e6ff&quot;" onmouseout="this.style.color=&quot;#2d3436&quot;;this.style.background=&quot;transparent&quot;">Склад ↕</th>' +
    '</tr>';
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:40px;text-align:center;color:#636e72">Нет данных за выбранный период</td></tr>';
    return;
  }
  
  // Агрегируем данные по артикулам с сохранением company_name
  const aggregated = {};
  data.forEach(item => {
    const key = item.nmId + '_' + item.brand + '_' + (item.company_name || ''); // Уникальный ключ

    if (!aggregated[key]) {
      aggregated[key] = {
        company_name: item.company_name || '—',
        nmId: item.nmId,
        subject: item.subject,
        brand: item.brand,
        quantity: 0,
        totalRevenue: 0,
        totalCommission: 0,
        totalLogistics: 0,
        totalProfit: 0,
        totalForPay: 0, // Сумма к перечислению
        prices: [],
        warehouseName: item.warehouseName
      };
    }

    aggregated[key].quantity += item.quantity || 0;
    aggregated[key].totalRevenue += item.totalRevenue || 0;
    aggregated[key].totalCommission += item.totalCommission || 0;
    aggregated[key].totalLogistics += item.totalLogistics || 0;
    aggregated[key].totalProfit += item.totalProfit || 0;
    aggregated[key].totalForPay += item.totalForPay || 0; // Добавляем к перечислению
    if (item.avgPrice) {
      aggregated[key].prices.push(item.avgPrice);
    }
  });

  // Преобразуем обратно в массив и считаем среднюю цену
  let finalData = Object.values(aggregated).map(item => ({
    ...item,
    avgPrice: item.prices.length > 0
      ? item.prices.reduce((sum, p) => sum + p, 0) / item.prices.length
      : 0
  }));
  
  // Сохраняем обработанные данные
  salesReportData = finalData;
  
  // Сортируем по компании по умолчанию
  salesSortState = { column: 'company_name', direction: 'asc' };
  finalData.sort((a, b) => {
    const valA = (a.company_name || '').toLowerCase();
    const valB = (b.company_name || '').toLowerCase();
    return valA.localeCompare(valB);
  });
  
  tbody.innerHTML = '';
  finalData.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.innerHTML =
      '<td style="padding:12px;font-size:14px;font-weight:600;color:#6c5ce7">' + (item.company_name || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px;font-weight:600">' + (item.nmId || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px">' + (item.subject || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px">' + (item.brand || '—') + '</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#00b894">' + (item.quantity || 0) + '</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px">' + (item.totalRevenue || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;color:#d63031">' + (item.totalCommission || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;color:#e17055">' + (item.totalLogistics || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:700;color:#00b894;font-size:16px">' + (item.totalForPay || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#00b894">' + (item.totalProfit || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px">' + (item.avgPrice || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;font-size:13px;color:#636e72">' + (item.warehouseName || '—') + '</td>';
    tbody.appendChild(tr);
  });
  
  // Обновляем карточки статистики
  let totalRevenue = 0, totalCommission = 0, totalLogistics = 0, totalProfit = 0, totalForPay = 0;
  finalData.forEach(item => {
    totalRevenue += item.totalRevenue || 0;
    totalCommission += item.totalCommission || 0;
    totalLogistics += item.totalLogistics || 0;
    totalProfit += item.totalProfit || 0;
    totalForPay += item.totalForPay || 0;
  });

  document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(2) + ' ₽';
  document.getElementById('totalCommission').textContent = '-' + totalCommission.toFixed(2) + ' ₽';
  document.getElementById('totalLogistics').textContent = totalLogistics.toFixed(2) + ' ₽';
  document.getElementById('netProfit').textContent = totalForPay.toFixed(2) + ' ₽';
  document.getElementById('pureProfit').textContent = 'К перечислению: ' + totalForPay.toFixed(2) + ' ₽';
  
  // Устанавливаем флаг загрузки
  salesReportDataLoaded = true;
  
  // Скрываем бейдж загрузки для продаж
  document.getElementById('salesReportBadge').style.display = 'none';
  
  // Проверяем завершение всех загрузок
  checkAllDataLoaded();
}

// Функция сортировки таблицы продаж
function sortSalesReport(column) {
  // Определяем тип данных для корректной сортировки
  const numericColumns = ['nmId', 'quantity', 'totalRevenue', 'totalCommission', 'totalLogistics', 'totalProfit', 'totalForPay', 'avgPrice'];
  const isNumeric = numericColumns.includes(column);
  
  // Переключаем направление, если кликнули на ту же колонку
  if (salesSortState.column === column) {
    salesSortState.direction = salesSortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    salesSortState.column = column;
    salesSortState.direction = 'asc';
  }
  
  // Сортируем данные
  salesReportData.sort((a, b) => {
    let valA = a[column];
    let valB = b[column];

    if (isNumeric) {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
      return salesSortState.direction === 'asc' ? valA - valB : valB - valA;
    } else {
      valA = (valA || '').toString().toLowerCase();
      valB = (valB || '').toString().toLowerCase();
      const comparison = valA.localeCompare(valB);
      return salesSortState.direction === 'asc' ? comparison : -comparison;
    }
  });

  // Перерисовываем таблицу
  const tbody = document.getElementById('salesReportBody');
  tbody.innerHTML = '';
  salesReportData.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.innerHTML =
      '<td style="padding:12px;font-size:14px;font-weight:600;color:#6c5ce7">' + (item.company_name || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px;font-weight:600">' + (item.nmId || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px">' + (item.subject || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px">' + (item.brand || '—') + '</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#00b894">' + (item.quantity || 0) + '</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px">' + (item.totalRevenue || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;color:#d63031">' + (item.totalCommission || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;color:#e17055">' + (item.totalLogistics || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:700;color:#00b894;font-size:16px">' + (item.totalForPay || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#00b894">' + (item.totalProfit || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px">' + (item.avgPrice || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;font-size:13px;color:#636e72">' + (item.warehouseName || '—') + '</td>';
    tbody.appendChild(tr);
  });
}

// Загрузка полного финансового отчёта WB
function loadFullFinReport(dateRange) {
  console.log('loadFullFinReport вызвана, currentBusinessId:', currentBusinessId);
  
  if (!currentBusinessId) {
    alert('❌ Выберите магазин');
    return;
  }
  
  const tbody = document.getElementById('finReportBody');
  tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка финансового отчёта...</td></tr>';
  
  // Если выбраны все магазины - загружаем из всех активных
  if (currentBusinessId === 'all') {
    console.log('Загружаем из всех активных магазинов');
    loadFromAllBusinesses('/api/wb-fin-report', dateRange, displayFullFinReport);
    return;
  }
  
  console.log('Загружаем из одного магазина:', currentBusinessId);
  
  fetch('/api/wb-fin-report?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
  })
  .then(res => res.json())
  .then(response => {
    if (response.error) {
      tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#d63031">❌ ' + response.error + '</td></tr>';
      // Устанавливаем флаг даже при ошибке
      finReportDataLoaded = true;
      document.getElementById('finReportBadge').style.display = 'none';
      checkAllDataLoaded();
      return;
    }
    
    // Добавляем company_name к каждому элементу данных
    const currentBusiness = businesses.find(b => b.id === currentBusinessId);
    const companyName = currentBusiness ? currentBusiness.company_name : '—';
    const dataWithCompany = response.data.map(item => ({ ...item, company_name: companyName }));
    
    displayFullFinReport(dataWithCompany);
  })
  .catch(err => {
    tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#d63031">❌ Ошибка загрузки: ' + err.message + '</td></tr>';
    // Устанавливаем флаг даже при ошибке
    finReportDataLoaded = true;
    document.getElementById('finReportBadge').style.display = 'none';
    checkAllDataLoaded();
  });
}

// Отображение полного финансового отчёта
let finReportDataByCompany = {}; // Храним данные по компаниям
let currentFinReportCompany = null;

function displayFullFinReport(data) {
  console.log('displayFullFinReport вызвана, данных:', data ? data.length : 0);
  console.log('currentBusinessId:', currentBusinessId);
  
  const tbody = document.getElementById('finReportBody');
  const tabsContainer = document.getElementById('finReportTabs');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="69" style="padding:40px;text-align:center;color:#636e72">Нет данных за выбранный период</td></tr>';
    if (tabsContainer) tabsContainer.style.display = 'none';
    
    // Устанавливаем флаг загрузки даже если данных нет
    finReportDataLoaded = true;
    document.getElementById('finReportBadge').style.display = 'none';
    checkAllDataLoaded();
    return;
  }
  
  // Группируем данные по компаниям (только если есть company_name)
  const hasCompanyNames = data.some(item => item.company_name);
  console.log('Есть ли company_name в данных:', hasCompanyNames);
  console.log('Пример первого элемента:', data[0]);
  
  if (hasCompanyNames && currentBusinessId === 'all') {
    // Группируем по компаниям
    finReportDataByCompany = {};
    data.forEach(item => {
      const companyName = item.company_name || '—';
      if (!finReportDataByCompany[companyName]) {
        finReportDataByCompany[companyName] = [];
      }
      finReportDataByCompany[companyName].push(item);
    });
    
    const companyNames = Object.keys(finReportDataByCompany);
    
    if (companyNames.length > 1) {
      // Создаем табы
      if (tabsContainer) {
        tabsContainer.style.display = 'flex';
        tabsContainer.style.borderBottom = '2px solid #e9ecef';
        tabsContainer.style.marginBottom = '0';
        tabsContainer.innerHTML = companyNames.map((name, index) => 
          '<button onclick="switchFinReportCompany(' + index + ')" ' +
          'style="padding:12px 24px;background:#f8f9fa;border:none;border-bottom:3px solid transparent;' +
          'font-weight:600;cursor:pointer;margin-right:2px;transition:all 0.2s;color:#636e72;font-size:14px" ' +
          'id="finTab_' + index + '">' + name + '</button>'
        ).join('');
      }
      
      // Показываем первую компанию
      currentFinReportCompany = 0;
      renderFinReportData(finReportDataByCompany[companyNames[0]]);
      highlightActiveFinTab(0);
      return;
    }
  }
  
  // Если не нужны табы - просто показываем все данные
  if (tabsContainer) tabsContainer.style.display = 'none';
  renderFinReportData(data);
}

function switchFinReportCompany(index) {
  const companyNames = Object.keys(finReportDataByCompany);
  currentFinReportCompany = index;
  renderFinReportData(finReportDataByCompany[companyNames[index]]);
  highlightActiveFinTab(index);
}

function highlightActiveFinTab(index) {
  const allTabs = document.querySelectorAll('[id^="finTab_"]');
  allTabs.forEach(tab => {
    tab.style.background = '#f8f9fa';
    tab.style.color = '#636e72';
    tab.style.borderBottom = '3px solid transparent';
  });
  
  const activeTab = document.getElementById('finTab_' + index);
  if (activeTab) {
    activeTab.style.background = '#fff';
    activeTab.style.color = '#6c5ce7';
    activeTab.style.borderBottom = '3px solid #6c5ce7';
  }
}

function renderFinReportData(data) {
  const tbody = document.getElementById('finReportBody');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="71" style="padding:40px;text-align:center;color:#636e72">Нет данных</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  let rowNumber = 0;
  data.forEach(item => {
    rowNumber++;
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    
    // Размер товара из ts_name
    const size = item.ts_name ? item.ts_name.split('/')[0] : '—';
    
    tr.innerHTML = 
      '<td style="padding:8px 12px;font-size:13px">' + rowNumber + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.gi_id || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.subject_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.nm_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.brand_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.sa_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px;max-width:200px;overflow:hidden;text-overflow:ellipsis">' + (item.ts_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + size + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.barcode || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.doc_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.supplier_oper_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.order_dt ? new Date(item.order_dt).toLocaleDateString('ru-RU') : '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.sale_dt ? new Date(item.sale_dt).toLocaleDateString('ru-RU') : '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.quantity || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.retail_price || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600">' + (item.retail_amount || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.product_discount_for_report || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.supplier_promo || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_spp_prc || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.retail_price_withdisc_rub || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_kvw_prc_base || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.sup_rating_prc_up || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_kvw_prc || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.is_kgvp_v2 || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.sale_percent || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_sales_commission || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_reward || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.acquiring_fee || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.commission_percent || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.bonus_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_vw || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_vw_nds || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;color:#00b894">' + (item.ppvz_for_pay || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.delivery_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.return_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.delivery_rub || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.date_from ? new Date(item.date_from).toLocaleDateString('ru-RU') : '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.date_to ? new Date(item.date_to).toLocaleDateString('ru-RU') : '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.supplier_oper_name || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;color:#d63031">' + (item.penalty || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.additional_payment || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.gi_box_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.sticker_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.acquiring_bank || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_office_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_office_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_inn || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_supplier_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.office_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.site_country || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.gi_box_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.declaration_number || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.rid || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px;max-width:150px;overflow:hidden;text-overflow:ellipsis">' + (item.kiz || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.shk_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.srid || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.rebill_logistic_cost || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.rebill_logistic_org || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;color:#e17055">' + (item.storage_fee || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.deduction || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.acceptance || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.suppliercontract_code || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">—</td>' +
      '<td style="padding:8px 12px;font-size:13px">—</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">0</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">0</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">0</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">0</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.rid || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.report_type || '—') + '</td>';
    tbody.appendChild(tr);
      '<td style="padding:8px 12px;font-size:13px">' + (item.srid || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.report_type || '—') + '</td>';
    tbody.appendChild(tr);
  });
  
  // Обновляем карточки статистики на основе ПРАВИЛЬНЫХ данных WB
  let totalRevenue = 0;        // Общая выручка (что заплатили покупатели)
  let totalCommission = 0;     // Комиссия WB
  let totalLogistics = 0;      // Логистика + хранение + эквайринг + штрафы
  let totalForPay = 0;         // К перечислению (то что придёт на счёт)
  
  data.forEach(item => {
    // Выручка = сумма продажи (retail_amount) * количество
    totalRevenue += (item.retail_amount || 0) * (item.quantity || 1);
    
    // Комиссия WB
    totalCommission += (item.ppvz_sales_commission || 0);
    
    // Все затраты: логистика, хранение, эквайринг, штрафы, удержания, приёмка
    totalLogistics += (item.delivery_rub || 0) + 
                      (item.storage_fee || 0) + 
                      (item.acquiring_fee || 0) + 
                      (item.penalty || 0) + 
                      (item.deduction || 0) + 
                      (item.acceptance || 0);
    
    // К ПЕРЕЧИСЛЕНИЮ - это уже чистая сумма от WB (они всё вычли)
    totalForPay += (item.ppvz_for_pay || 0);
  });
  
  // Обновляем карточки
  document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(2) + ' ₽';
  document.getElementById('totalCommission').textContent = '-' + totalCommission.toFixed(2) + ' ₽';
  document.getElementById('totalLogistics').textContent = totalLogistics.toFixed(2) + ' ₽';
  document.getElementById('netProfit').textContent = totalForPay.toFixed(2) + ' ₽';
  document.getElementById('pureProfit').textContent = '—';
  
  // Устанавливаем флаг загрузки
  finReportDataLoaded = true;
  
  // Скрываем бейдж загрузки для фин отчёта
  document.getElementById('finReportBadge').style.display = 'none';
  
  // Проверяем завершение всех загрузок
  checkAllDataLoaded();
}

function displayFinancialData(data) {
  const tbody = document.getElementById('finTableBody');
  
  if (!data.items || data.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#636e72">Нет данных за выбранный период</td></tr>';
    return;
  }
  
  // Обновляем карточки статистики
  document.getElementById('totalRevenue').textContent = (data.stats?.totalRevenue || 0).toFixed(2) + ' ₽';
  document.getElementById('totalCommission').textContent = (data.stats?.totalCommission || 0).toFixed(2) + ' ₽';
  document.getElementById('totalLogistics').textContent = (data.stats?.totalLogistics || 0).toFixed(2) + ' ₽';
  document.getElementById('netProfit').textContent = (data.stats?.netProfit || 0).toFixed(2) + ' ₽';
  
  // Заполняем таблицу
  tbody.innerHTML = '';
  data.items.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.innerHTML = '<td style="padding:12px">' + item.date + '</td>' +
      '<td style="padding:12px">' + (item.nmId || '—') + '</td>' +
      '<td style="padding:12px">' + (item.subject || '—') + '</td>' +
      '<td style="padding:12px;text-align:right;font-weight:600">' + (item.forPay?.toFixed(2) || '0.00') + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;color:#d63031">' + (item.commission?.toFixed(2) || '0.00') + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;color:#e17055">' + (item.logistics?.toFixed(2) || '0.00') + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-weight:600;color:#00b894">' + (item.profit?.toFixed(2) || '0.00') + ' ₽</td>' +
      '<td style="padding:12px;text-align:center"><span style="padding:4px 12px;background:' + (item.type === 'sale' ? '#d4edda' : '#fff3cd') + ';color:' + (item.type === 'sale' ? '#155724' : '#856404') + ';border-radius:12px;font-size:12px;font-weight:600">' + (item.type === 'sale' ? 'Продажа' : 'Заказ') + '</span></td>';
    tbody.appendChild(tr);
  });
}
</script>
<script>
// Загрузка компаний при открытии страницы
window.addEventListener('DOMContentLoaded', function() {
  loadBusinesses();
});
</script>
</body>
</html>`);
});

// GET /wb-price?nm=АРТИКУЛ
app.get('/wb-price', requireAuth, async (req, res) => {
  const nm = req.query.nm;
  if (!nm) return res.status(400).json({ error: 'nm (артикул) обязателен' });

  // Списки возможных параметров для перебора
  const destList = [-1257786, -1029256, -1059509]; // сократим для скорости
  const appTypes = [1]; // сначала только тип 1
  const endpoints = [
    (appType,dest) => `https://card.wb.ru/cards/v2/detail?appType=${appType}&curr=rub&dest=${dest}&nm=${nm}`,
    (appType,dest) => `https://card.wb.ru/cards/v1/detail?appType=${appType}&curr=rub&dest=${dest}&nm=${nm}`,
    (appType,dest) => `https://card.wb.ru/cards/detail?appType=${appType}&curr=rub&dest=${dest}&nm=${nm}`
  ];

  let lastError = null;
  let debugTried = [];
  let attemptStatuses = [];

  for (const dest of destList) {
    for (const appType of appTypes) {
      for (const buildUrl of endpoints) {
        const url = buildUrl(appType,dest);
        try {
          debugTried.push(url);
          const response = await axios.get(url, {
            headers: {
              'User-Agent': 'WildberriesApp/1.0',
              'Accept': 'application/json',
              'Accept-Language': 'ru'
            },
            timeout: 10000
          });
          attemptStatuses.push({ url, status: response.status, count: response.data?.data?.products?.length || 0 });
          const product = response.data?.data?.products?.find(p => String(p.id) === String(nm)) || response.data?.data?.products?.[0];
          if (!product) continue;
          // Для диагностики: показать часть объектов price из sizes
          try {
            const samplePrices = Array.isArray(product.sizes) ? product.sizes.slice(0,3).map(s => s && s.price) : [];
            attemptStatuses.push({ url: url + '#sample', samplePrices });
          } catch(_) {}
          const rawPrice = extractPrice(product);
          if (rawPrice > 0) {
            return res.json({
              nm: product.id,
              name: product.name,
              price: rawPrice/100,
              brand: product.brand,
              source: url,
              attempts: attemptStatuses
            });
          }
          // Явная проверка цен во вложенных sizes[].price для v2
          let sizeCandidates = [];
          if (Array.isArray(product.sizes)) {
            for (const s of product.sizes) {
              const p = s && s.price;
              if (!p) continue;
              ['basic','product','total'].forEach(k => {
                if (typeof p[k] === 'number' && p[k] > 0) sizeCandidates.push(p[k]);
              });
            }
          }
          if (sizeCandidates.length) {
            const priceVal = Math.min(...sizeCandidates)/100;
            return res.json({
              nm: product.id,
              name: product.name,
              price: priceVal,
              brand: product.brand,
              source: url + '#sizes.price',
              attempts: attemptStatuses
            });
          }
        } catch (e) {
          lastError = e;
          attemptStatuses.push({ url, error: e.message, status: e.response?.status });
          continue;
        }
      }
    }
  }

  // HTML fallback
  const htmlData = await fetchFromHtml(nm);
  if (htmlData && htmlData.price > 0) {
    return res.json({ nm, ...htmlData, source: 'html' });
  }

  // Basket fallback
  const basketData = await tryBasket(Number(nm));
  if (basketData && basketData.price > 0) {
    return res.json({ nm, ...basketData, source: basketData.source || 'basket' });
  }

  return res.status(404).json({
    error: 'цена не найдена',
    tried: debugTried,
    attempts: attemptStatuses,
    lastError: lastError?.message
  });
});

// Прокси для изображений WB (обходим блокировку CDN)
app.get('/wb-image', async (req, res) => {
  const nm = req.query.nm;
  const pic = req.query.pic || 1;
  if (!nm) return res.status(400).send('nm required');

  const vol = Math.floor(nm / 100000);
  const part = Math.floor(nm / 1000);
  
  // Пробуем разные CDN
  const urls = [
    `https://basket-${String((vol % 20) + 1).padStart(2, '0')}.wbbasket.ru/vol${vol}/part${part}/${nm}/images/big/${pic}.webp`,
    `https://basket-01.wbbasket.ru/vol${vol}/part${part}/${nm}/images/big/${pic}.jpg`,
    `https://images.wbstatic.net/big/new/${vol}0000/${nm}-${pic}.jpg`,
    `https://basket-${String((vol % 20) + 1).padStart(2, '0')}.wb.ru/vol${vol}/part${part}/${nm}/images/big/${pic}.jpg`
  ];

  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }
      });
      
      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.set('Content-Type', contentType);
      res.set('Cache-Control', 'public, max-age=86400'); // кэш на 24 часа
      return res.send(response.data);
    } catch (e) {
      continue;
    }
  }
  
  // Если ничего не сработало - возвращаем placeholder SVG
  res.set('Content-Type', 'image/svg+xml');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect fill="#ddd" width="100" height="100"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="#999">Нет фото</text>
  </svg>`);
});

// ==================== CRON JOB: АВТОСИНХРОНИЗАЦИЯ ====================

// Запуск автоматической синхронизации каждый день в 3:30 утра по Бишкеку
cron.schedule('30 0 * * *', async () => {
  console.log('\n🕐 [CRON] Запуск автоматической синхронизации в 3:30 утра (Бишкек)...');
  try {
    await syncService.syncAllBusinesses();
    console.log('✅ [CRON] Автоматическая синхронизация завершена успешно\n');
  } catch (error) {
    console.error('❌ [CRON] Ошибка автоматической синхронизации:', error.message);
  }
}, {
  scheduled: true,
  timezone: "Europe/Moscow" // Московское время (00:30 МСК = 3:30 Бишкек)
});

console.log('⏰ Cron job настроен: автосинхронизация в 3:30 утра (Бишкек) каждый день');

// ==================== API: РУЧНАЯ СИНХРОНИЗАЦИЯ ====================

// Ручной запуск синхронизации для ВСЕХ магазинов (только для админа)
app.post('/api/sync-all', requireAuth, async (req, res) => {
  try {
    console.log(`\n🔄 [ADMIN] Запуск ручной синхронизации всех магазинов...`);
    
    // Запускаем синхронизацию в фоне, не блокируя ответ
    syncService.syncAllBusinesses().catch(err => {
      console.error('❌ Ошибка фоновой синхронизации:', err.message);
    });
    
    res.json({
      success: true,
      message: 'Синхронизация всех магазинов запущена в фоне. Это может занять несколько минут.'
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Ручной запуск синхронизации для конкретного магазина
app.post('/api/sync/:businessId', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);
  
  // Проверяем принадлежность
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const business = await db.getBusinessById(businessId);
    if (!business) {
      return res.json({ success: false, error: 'Магазин не найден' });
    }
    
    console.log(`🔄 Ручной запуск синхронизации для магазина ${business.company_name} (ID: ${businessId})`);
    const results = await syncService.syncAllData(businessId, business.wb_api_key);
    
    res.json({
      success: true,
      message: 'Синхронизация завершена',
      results
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Получить статус последней синхронизации
app.get('/api/sync-status/:businessId', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);
  
  // Проверяем принадлежность
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const salesSync = await db.getLastSync(businessId, 'sales');
    const ordersSync = await db.getLastSync(businessId, 'orders');
    const financialSync = await db.getLastSync(businessId, 'financial');
    
    res.json({
      success: true,
      status: {
        sales: salesSync,
        orders: ordersSync,
        financial: financialSync
      }
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== ЗАПУСК СЕРВЕРА ====================

app.listen(PORT, async () => {
  console.log('WB price service started on port', PORT);
  console.log(`🌍 Server URL: http://localhost:${PORT}`);
  
  // Проверяем, есть ли данные в БД. Если нет - запускаем первичную синхронизацию
  try {
    const hasData = await db.checkIfDataExists();
    if (!hasData) {
      console.log('\n🔄 Первый запуск: данных нет, запускаем синхронизацию всех магазинов в фоне...');
      syncService.syncAllBusinesses().catch(err => {
        console.error('❌ Ошибка первичной синхронизации:', err.message);
      });
    } else {
      console.log('ℹ️ Данные уже есть в базе. Следующая автосинхронизация в 3:30 утра (Бишкек).');
    }
  } catch (error) {
    console.error('⚠️ Ошибка проверки данных:', error.message);
  }
});

// Дополнительный endpoint для просмотра сырого ответа
app.get('/wb-raw', requireAuth, async (req, res) => {
  const nm = req.query.nm;
  if (!nm) return res.status(400).json({ error: 'nm обязателен' });
  try {
    const url = `https://card.wb.ru/cards/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nm}`;
    const response = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0', 'Accept': 'application/json' }, timeout: 10000 });
    res.json(response.data);
  } catch (e) {
    res.status(500).json({ error: 'raw fetch failed', details: e.message, status: e.response?.status });
  }
});

// Простой текстовый ответ для Google Sheets без Apps Script: только число
app.get('/wb-price-plain', async (req, res) => {
  try {
    const nm = req.query.nm;
    if (!nm) return res.status(400).send('nm required');
    // Переиспользуем основной обработчик через локальный вызов функций
    const destList = [-1257786, -1029256, -1059509];
    const appTypes = [1];
    const endpoints = [
      (appType,dest) => `https://card.wb.ru/cards/v2/detail?appType=${appType}&curr=rub&dest=${dest}&nm=${nm}`
    ];
    for (const dest of destList) {
      for (const appType of appTypes) {
        for (const buildUrl of endpoints) {
          const url = buildUrl(appType, dest);
          try {
            const response = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0', 'Accept': 'application/json' }, timeout: 10000 });
            const product = response.data?.data?.products?.find(p => String(p.id) === String(nm)) || response.data?.data?.products?.[0];
            if (!product) continue;
            let rawPrice = extractPrice(product);
            if (rawPrice <= 0 && Array.isArray(product.sizes)) {
              let sizeCandidates = [];
              for (const s of product.sizes) {
                const p = s && s.price;
                if (!p) continue;
                ['basic','product','total'].forEach(k => { if (typeof p[k] === 'number' && p[k] > 0) sizeCandidates.push(p[k]); });
              }
              if (sizeCandidates.length) rawPrice = Math.min(...sizeCandidates);
            }
            if (rawPrice > 0) {
              res.setHeader('Content-Type','text/plain; charset=utf-8');
              return res.send(String(rawPrice/100));
            }
          } catch (_) { /* try next */ }
        }
      }
    }
    // Fallback: HTML или basket
    const htmlData = await fetchFromHtml(nm);
    if (htmlData && htmlData.price > 0) {
      res.setHeader('Content-Type','text/plain; charset=utf-8');
      return res.send(String(htmlData.price));
    }
    const basketData = await tryBasket(Number(nm));
    if (basketData && basketData.price > 0) {
      res.setHeader('Content-Type','text/plain; charset=utf-8');
      return res.send(String(basketData.price));
    }
    return res.status(404).send('price not found');
  } catch (e) {
    return res.status(500).send('error');
  }
});

// CSV с ценой и названием для Google Sheets - ПУБЛИЧНЫЙ API
app.get('/wb-price-csv', async (req, res) => {
  const nmRaw = req.query.nm;
  const domain = (req.query.domain || 'ru').trim();
  if (!nmRaw) return res.status(400).type('text/csv').send('price,name\n,');
  const nm = String(nmRaw).trim();

  // Базовый список dest (георегионы) для попыток получения карточки
  const destList = ['-1257786','-1029256','-1059509'];
  let product = null;
  let priceU = 0;

  // Пытаемся через v2 detail
  for (const dest of destList) {
    const url = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=${dest}&nm=${nm}`;
    try {
      const r = await axios.get(url, { headers: { 'User-Agent':'WildberriesApp/1.0' }, timeout: 8000 });
      const products = r?.data?.data?.products || [];
      if (!products.length) continue;
      product = products.find(p => String(p.id) === nm) || products[0];
      priceU = extractPrice(product);
      if (priceU > 0) break; // нашли валидную цену
    } catch (_) { /* пробуем следующий dest */ }
  }

  // Fallback v1 если не нашли
  if (!product || priceU <= 0) {
    try {
      const url = `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&nm=${nm}`;
      const r = await axios.get(url, { headers: { 'User-Agent':'WildberriesApp/1.0' }, timeout: 8000 });
      const products = r?.data?.data?.products || [];
      if (products.length) {
        product = products.find(p => String(p.id) === nm) || products[0];
        if (priceU <= 0) priceU = extractPrice(product);
      }
    } catch (_) {}
  }

  // Basket CDN fallback
  if ((!product || priceU <= 0)) {
    const basketData = await tryBasket(Number(nm));
    if (basketData && basketData.price > 0) {
      return res.type('text/csv').send('price,name\n' + String(basketData.price) + ',"' + (basketData.name || '') + '"');
    }
  }

  // HTML fallback
  if (priceU <= 0) {
    const htmlData = await fetchFromHtml(nm);
    if (htmlData && htmlData.price > 0) {
      return res.type('text/csv').send('price,name\n' + String(htmlData.price) + ',""');
    }
  }

  if (!product) {
    return res.status(404).type('text/csv').send('price,name\n,');
  }

  // Формируем финальные значения
  const name = product.name || product.imt_name || '';
  const price = priceU > 0 ? (priceU / 100) : 0;
  const safeName = String(name).replace(/"/g,'""');

  res.type('text/csv').send('price,name\n' + String(price) + ',"' + safeName + '"');
});

// Функция для подсчета остатков и складов
function summarizeStocks(product) {
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  let totalQty = 0;
  const perWh = new Map();
  for (const s of sizes) {
    const stocks = Array.isArray(s.stocks) ? s.stocks : [];
    for (const st of stocks) {
      const q = Number(st.qty || 0);
      const wh = String(st.wh || '');
      if (!isNaN(q)) {
        totalQty += q;
        if (wh) perWh.set(wh, (perWh.get(wh) || 0) + q);
      }
    }
  }
  const warehouses = Array.from(perWh.keys());
  const warehousesQty = warehouses.map(wh => ({ wh, qty: perWh.get(wh) || 0 }));
  return { totalQty, warehouses, warehousesQty };
}

// ===== Endpoint для максимальных данных (JSON) =====
app.get('/wb-max', requireAuth, async (req, res) => {
  const nm = String(req.query.nm || '').trim();
  const dest = String(req.query.dest || '').trim();
  const domain = String(req.query.domain || 'ru').trim();
  
  if (!nm) {
    return res.status(400).json({ error: 'Артикул (nm) обязателен' });
  }

  // Определяем список dest для перебора
  const destCandidates = [];
  if (dest) destCandidates.push(dest);
  destCandidates.push('-1257786', '-1029256', '-1059509', '-59208', '-364763');

  let product = null;
  let source = null;
  let destUsed = null;

  // Пробуем v2/detail с разными dest
  for (const d of destCandidates) {
    try {
      const url = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=${d}&nm=${nm}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'WildberriesApp/1.0', 'Accept': 'application/json' },
        timeout: 10000
      });
      const products = response?.data?.data?.products || [];
      if (products.length > 0) {
        product = products.find(p => String(p.id) === String(nm)) || products[0];
        source = `v2/detail`;
        destUsed = d;
        break;
      }
    } catch (e) {
      continue;
    }
  }

  // Fallback: v1
  if (!product) {
    try {
      const url = `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&nm=${nm}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'WildberriesApp/1.0' },
        timeout: 10000
      });
      const products = response?.data?.data?.products || [];
      if (products.length > 0) {
        product = products[0];
        source = 'v1/detail';
      }
    } catch (e) {}
  }

  // Fallback: basket CDN
  let basketPrice = 0;
  if (!product) {
    try {
      const vol = Math.floor(nm / 100000);
      const part = Math.floor(nm / 1000);
      const url = `https://basket-01.wb.ru/vol${vol}/part${part}/${nm}/info/ru/card.json`;
      const response = await axios.get(url, { timeout: 8000 });
      const data = response?.data || {};
      const cand = Number(data.salePriceU || data.priceU || data.basicPriceU || 0);
      if (!isNaN(cand) && cand > 0) {
        basketPrice = cand;
        source = 'basket-cdn';
        product = { id: nm, name: data.imt_name || '', brand: data.selling?.brand_name || '' };
      }
    } catch (e) {}
  }

  // Fallback: HTML
  if (!product && basketPrice === 0) {
    const htmlData = await fetchFromHtml(nm);
    if (htmlData && htmlData.price > 0) {
      return res.json({
        nm,
        name: htmlData.name || '',
        brand: htmlData.brand || '',
        sellerId: '',
        price: htmlData.price,
        currency: htmlData.currency || 'RUB',
        rating: 0,
        feedbacks: 0,
        images: 0,
        stocksQty: 0,
        warehouses: [],
        destUsed: '',
        source: htmlData.source || 'html',
        domain
      });
    }
  }

  if (!product) {
    return res.status(404).json({ error: 'Товар не найден' });
  }

  // Извлекаем данные
  let priceU = extractPrice(product);
  if (basketPrice > 0 && priceU === 0) priceU = basketPrice;

  // Дополнительные поля
  const name = product.name || product.imt_name || '';
  const brand = product.brand || product.selling?.brand_name || '';
  const sellerId = product.sellerId || product.supplierId || '';
  
  // Получаем данные продавца - ТОЛЬКО ID и магазин
  let sellerName = ''; // Пока отключено (требуется Puppeteer)
  let storeName = product.supplier || ''; // Краткое торговое название (магазин)
  
  // Категория товара - берём из поля entity (название на русском)
  let category = product.entity || '';
  // Делаем первую букву заглавной для красоты
  if (category && category.length > 0) {
    category = category.charAt(0).toUpperCase() + category.slice(1);
  }
  
  // Цвет товара - берем первый цвет (основной для данного артикула)
  let color = '';
  if (Array.isArray(product.colors) && product.colors.length > 0) {
    color = product.colors[0].name || '';
  }
  
  const rating = product.rating || 0;
  const feedbacks = product.feedbacks || 0;
  const images = Array.isArray(product.pics) ? product.pics.length : (Array.isArray(product.images) ? product.images.length : 0);

  // Главное фото товара - используем прямой URL с корректным форматом
  let mainImage = '';
  if (product.id || nm) {
    const productId = product.id || nm;
    const vol = Math.floor(productId / 100000);
    const part = Math.floor(productId / 1000);
    let picNum = 1;
    if (Array.isArray(product.pics) && product.pics.length > 0) {
      picNum = product.pics[0];
    } else if (Array.isArray(product.colors) && product.colors.length > 0 && Array.isArray(product.colors[0].pics)) {
      picNum = product.colors[0].pics[0] || 1;
    }
    // Генерируем прямые URL для разных CDN (браузер попробует сам)
    const basketNum = String(1 + (vol % 20)).padStart(2, '0');
    mainImage = `https://basket-${basketNum}.wbbasket.ru/vol${vol}/part${part}/${productId}/images/big/${picNum}.webp`;
  }

  // Остатки и склады
  const { totalQty, warehouses, warehousesQty } = summarizeStocks(product);

  // Валюта по домену
  let currency = 'RUB';
  if (domain === 'kg') currency = 'KGS';
  else if (domain === 'kz') currency = 'KZT';

  // Отладка: выводим данные в консоль сервера
  console.log('Product ID:', product.id || nm, 'mainImage URL:', mainImage);
  if (Array.isArray(product.pics)) console.log('pics:', product.pics.slice(0, 3));

  return res.json({
    nm,
    name,
    brand,
    sellerId,
    sellerName,
    storeName,
    category,
    color,
    price: priceU > 0 ? priceU / 100 : 0,
    currency,
    rating,
    feedbacks,
    images,
    mainImage,
    stocksQty: totalQty,
    warehouses,
    warehousesQty,
    destUsed: destUsed || '',
    source: source || 'unknown',
    domain
  });
});

// ===== Max CSV endpoint: rich, single-row data for Sheets =====
app.get('/wb-max-csv', async (req, res) => {
  const nm = String(req.query.nm || '').trim();
  const dest = String(req.query.dest || '').trim();
  const domain = String(req.query.domain || 'ru').trim();
  if (!nm) {
    res.status(400).type('text/csv').send('error,message\n400,Missing nm');
    return;
  }

  // Вспомогательная функция для безопасного получения значений
  function safeGet(obj, path, defVal) {
    try {
      const parts = String(path).split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur == null) return defVal;
        cur = cur[p];
      }
      return cur == null ? defVal : cur;
    } catch (_) {
      return defVal;
    }
  }

  // Определение валюты по домену
  function currencyByDomain(d) {
    if (d === 'kg') return 'KGS';
    if (d === 'kz') return 'KZT';
    return 'RUB';
  }

  // Try v2 detail first with a few dests
  const destCandidates = [];
  if (dest) destCandidates.push(dest);
  destCandidates.push('-1257786','-1029256','-1059509');

  let product = null;
  let source = null;
  let priceU = 0;

  try {
    for (const d of destCandidates) {
      try {
        const url = `https://card.wb.ru/cards/v2/detail?appType=1&curr=rub&dest=${d}&nm=${nm}`;
        const r = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0' }, timeout: 10000 });
        const products = r?.data?.data?.products || [];
        if (products.length) {
          product = products.find(p => String(p.id) === String(nm)) || products[0];
          source = `v2:${d}`;
          break;
        }
      } catch (_) {}
    }

    if (!product) {
      // v1 fallback
      try {
        const url = `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&nm=${nm}`;
        const r = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0' }, timeout: 10000 });
        const products = r?.data?.data?.products || [];
        if (products.length) {
          product = products[0];
          source = 'v1';
        }
      } catch (_) {}
    }

    // Basket CDN
    let basketPrice = 0;
    if (!product) {
      try {
        const vol = Math.floor(nm / 100000);
        const part = Math.floor(nm / 1000);
        const url = `https://basket-01.wb.ru/vol${vol}/part${part}/${nm}/info/ru/card.json`;
        const r = await axios.get(url, { timeout: 8000 });
        const data = r?.data || {};
        const cand = Number(data.salePriceU || data.priceU || data.basicPriceU || 0);
        if (!isNaN(cand) && cand > 0) {
          basketPrice = cand;
          source = 'basket';
        }
      } catch (_) {}
    }

    // HTML fallback
    let htmlPrice = 0;
    if (!product && basketPrice === 0) {
      try {
        const host = domain === 'kg' ? 'www.wildberries.kg' : domain === 'kz' ? 'www.wildberries.kz' : 'www.wildberries.ru';
        const url = `https://${host}/catalog/${nm}/detail.aspx`;
        const r = await axios.get(url, { timeout: 12000 });
        const html = String(r?.data || '');
        const m = html.match(/salePriceU":(\d+)/) || html.match(/priceU":(\d+)/);
        if (m) {
          htmlPrice = Number(m[1]);
          source = `html:${domain}`;
        }
      } catch (_) {}
    }

    if (product) priceU = extractPrice(product);
    if ((!priceU || priceU <= 0) && basketPrice > 0) priceU = basketPrice;
    if ((!priceU || priceU <= 0) && htmlPrice > 0) priceU = htmlPrice;

    const price = priceU > 0 ? (priceU / 100) : 0;
    const name = safeGet(product, 'name', '') || safeGet(product, 'product', '');
    const brand = safeGet(product, 'brand', '');
    const sellerId = safeGet(product, 'sellerId', '') || safeGet(product, 'supplierId', '');
    const rating = safeGet(product, 'rating', 0);
    const feedbacks = safeGet(product, 'feedbacks', 0);
    const pics = Array.isArray(product?.pics) ? product.pics.length : (Array.isArray(product?.images) ? product.images.length : 0);
    const { totalQty, warehouses } = summarizeStocks(product || {});
    const destUsed = source && source.startsWith('v2:') ? source.split(':')[1] : (dest || '');
    const currency = currencyByDomain(domain);
    const url = domain === 'kg' ? `https://www.wildberries.kg/catalog/${nm}/detail.aspx` : domain === 'kz' ? `https://www.wildberries.kz/catalog/${nm}/detail.aspx` : `https://www.wildberries.ru/catalog/${nm}/detail.aspx`;

    const header = [
      'nm','name','brand','sellerId','sellerName','storeName','category','color','price','currency','destUsed','domain','source','rating','feedbacks','images','stocksTotalQty','warehouses','url'
    ];
    
    // Получаем данные продавца - ТОЛЬКО ID и магазин
    let sellerName = ''; // Пока отключено (требуется Puppeteer)
    let storeName = safeGet(product, 'supplier', '') || ''; // Краткое торговое название
    
    // Категория - берём из поля entity (название на русском)
    let category = '';
    if (product && product.entity) {
      category = product.entity;
      // Делаем первую букву заглавной
      if (category.length > 0) {
        category = category.charAt(0).toUpperCase() + category.slice(1);
      }
    }
    
    // Цвет - берем первый цвет
    let color = '';
    if (product && Array.isArray(product.colors) && product.colors.length > 0) {
      color = product.colors[0].name || '';
    }
    
    const row = [
      nm,
      String(name).replace(/"/g,'""'),
      String(brand).replace(/"/g,'""'),
      String(sellerId),
      String(sellerName).replace(/"/g,'""'),
      String(storeName).replace(/"/g,'""'),
      String(category).replace(/"/g,'""'),
      String(color).replace(/"/g,'""'),
      String(price),
      currency,
      String(destUsed),
      domain,
      String(source || 'unknown'),
      String(rating || 0),
      String(feedbacks || 0),
      String(pics || 0),
      String(totalQty || 0),
      String(warehouses.join('|')),
      url
    ];

    const csv = `${header.join(',')}\n"${row[0]}","${row[1]}","${row[2]}","${row[3]}","${row[4]}","${row[5]}","${row[6]}","${row[7]}","${row[8]}","${row[9]}","${row[10]}","${row[11]}","${row[12]}","${row[13]}","${row[14]}","${row[15]}","${row[16]}","${row[17]}","${row[18]}"`;
    res.status(200).type('text/csv').send(csv);
  } catch (e) {
    res.status(500).type('text/csv').send('error,message\n500,Internal error');
  }
});


