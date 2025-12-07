const express = require('express');
const axios = require('axios');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Загружаем базу юридических лиц продавцов
let SELLERS_DB = {};
try {
  const dbPath = path.join(__dirname, 'sellers-db.json');
  SELLERS_DB = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  console.log(`Загружено ${Object.keys(SELLERS_DB).length} продавцов в базу`);
} catch (err) {
  console.warn('База продавцов не загружена:', err.message);
}

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
function requireAuth(req, res, next) {
  // Проверяем токен в cookie
  const token = req.cookies?.authToken;
  if (token) {
    try {
      const accountId = parseInt(token, 10);
      const account = db.getAccountById(accountId);
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
      const account = db.getAccountById(accountId);
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
app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  
  // Проверяем логин/пароль через БД
  const account = db.authenticateAccount(login, password);
  
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

// ==================== API: УПРАВЛЕНИЕ КОМПАНИЯМИ ====================

// Получить список компаний текущего аккаунта
app.get('/api/businesses', requireAuth, (req, res) => {
  try {
    const businesses = db.getBusinessesByAccount(req.account.id);
    const stats = db.getAccountStats(req.account.id);
    res.json({ success: true, businesses, stats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Создать новую компанию
app.post('/api/businesses', requireAuth, (req, res) => {
  const { company_name, wb_api_key, description } = req.body;
  
  if (!company_name || !wb_api_key) {
    return res.json({ success: false, error: 'Название компании и API ключ обязательны' });
  }
  
  try {
    const business = db.createBusiness(req.account.id, company_name, wb_api_key, description);
    res.json({ success: true, business });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Обновить данные компании
app.put('/api/businesses/:id', requireAuth, (req, res) => {
  const businessId = parseInt(req.params.id);
  const { company_name, wb_api_key, description, is_active } = req.body;
  
  // Проверяем, что компания принадлежит текущему аккаунту
  if (!db.verifyBusinessOwnership(businessId, req.account.id)) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const updates = {};
    if (company_name !== undefined) updates.company_name = company_name;
    if (wb_api_key !== undefined) updates.wb_api_key = wb_api_key;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
    
    const success = db.updateBusiness(businessId, updates);
    res.json({ success, message: success ? 'Компания обновлена' : 'Компания не найдена' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Удалить компанию
app.delete('/api/businesses/:id', requireAuth, (req, res) => {
  const businessId = parseInt(req.params.id);
  
  // Проверяем, что компания принадлежит текущему аккаунту
  if (!db.verifyBusinessOwnership(businessId, req.account.id)) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const success = db.deleteBusiness(businessId);
    res.json({ success, message: success ? 'Компания удалена' : 'Компания не найдена' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Получить компанию по умолчанию (для fin-report)
app.get('/api/businesses/default', requireAuth, (req, res) => {
  try {
    const business = db.getDefaultBusiness(req.account.id);
    if (!business) {
      return res.json({ success: false, error: 'Нет активных компаний. Создайте компанию.' });
    }
    res.json({ success: true, business });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== API: СЕБЕСТОИМОСТЬ ====================

// Получить себестоимость всех товаров компании
app.get('/api/product-costs/:businessId', requireAuth, (req, res) => {
  const businessId = parseInt(req.params.businessId);
  
  // Проверяем принадлежность компании к аккаунту
  if (!db.verifyBusinessOwnership(businessId, req.account.id)) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const costs = db.getProductCostsByBusiness(businessId);
    res.json({ success: true, costs });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Массовое сохранение себестоимости
app.post('/api/product-costs/:businessId/bulk', requireAuth, (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const { products } = req.body;
  
  // Проверяем принадлежность компании к аккаунту
  if (!db.verifyBusinessOwnership(businessId, req.account.id)) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  if (!Array.isArray(products) || products.length === 0) {
    return res.json({ success: false, error: 'Нет данных для сохранения' });
  }
  
  try {
    const count = db.bulkUpsertProductCosts(businessId, products);
    res.json({ success: true, count, message: `Сохранено ${count} позиций` });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Получить себестоимость конкретного товара
app.get('/api/product-costs/:businessId/:nmId', requireAuth, (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const nmId = req.params.nmId;
  
  // Проверяем принадлежность компании к аккаунту
  if (!db.verifyBusinessOwnership(businessId, req.account.id)) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const cost = db.getProductCost(businessId, nmId);
    if (!cost) {
      return res.json({ success: false, error: 'Себестоимость не найдена' });
    }
    res.json({ success: true, cost });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Удалить себестоимость товара
app.delete('/api/product-costs/:businessId/:nmId', requireAuth, (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const nmId = req.params.nmId;
  
  // Проверяем принадлежность компании к аккаунту
  if (!db.verifyBusinessOwnership(businessId, req.account.id)) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  
  try {
    const success = db.deleteProductCost(businessId, nmId);
    res.json({ success, message: success ? 'Себестоимость удалена' : 'Себестоимость не найдена' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// API для получения финансовых данных (продажи + заказы)
app.get('/api/wb-finance', requireAuth, async (req, res) => {
  // Получаем компанию из параметров или берём дефолтную
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Компания не найдена или доступ запрещён' });
    }
  } else {
    business = db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных компаний. Создайте компанию через интерфейс управления.' });
  }

  try {
    // Получаем даты из параметров запроса
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    // API WB для получения отчета о продажах
    const salesUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFromStr}`;
    
    const response = await axios.get(salesUrl, {
      headers: {
        'Authorization': business.wb_api_key
      },
      timeout: 15000
    });

    const sales = response.data || [];
    
    // Обработка данных
    const items = sales.map(sale => {
      const forPay = sale.forPay || 0;
      const commission = (sale.commission_percent || 0) * forPay / 100;
      const logistics = sale.delivery_amount || 0;
      const profit = forPay - commission - logistics;
      
      return {
        date: sale.date ? new Date(sale.date).toLocaleDateString('ru-RU') : '—',
        nmId: sale.nmId,
        subject: sale.subject,
        forPay: forPay,
        commission: commission,
        logistics: logistics,
        profit: profit,
        type: sale.saleID ? 'sale' : 'order'
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

// API для получения продаж
app.get('/api/wb-sales', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Компания не найдена или доступ запрещён' });
    }
  } else {
    business = db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных компаний' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    const salesUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFromStr}`;
    
    const response = await axios.get(salesUrl, {
      headers: { 'Authorization': business.wb_api_key },
      timeout: 15000
    });

    const sales = (response.data || []).filter(s => s.saleID);
    
    const items = sales.map(sale => ({
      date: new Date(sale.date).toLocaleDateString('ru-RU'),
      nmId: sale.nmId,
      subject: sale.subject,
      forPay: sale.forPay || 0,
      commission: (sale.commission_percent || 0) * (sale.forPay || 0) / 100,
      logistics: sale.delivery_amount || 0,
      profit: (sale.forPay || 0) - ((sale.commission_percent || 0) * (sale.forPay || 0) / 100) - (sale.delivery_amount || 0),
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

// API для получения заказов
app.get('/api/wb-orders', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Компания не найдена или доступ запрещён' });
    }
  } else {
    business = db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных компаний' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    const ordersUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${dateFromStr}`;
    
    const response = await axios.get(ordersUrl, {
      headers: { 'Authorization': business.wb_api_key },
      timeout: 15000
    });

    const orders = response.data || [];
    
    const items = orders.map(order => ({
      date: new Date(order.date).toLocaleDateString('ru-RU'),
      nmId: order.nmId,
      subject: order.subject,
      forPay: order.totalPrice || 0,
      commission: 0,
      logistics: 0,
      profit: order.totalPrice || 0,
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
    business = db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Компания не найдена или доступ запрещён' });
    }
  } else {
    business = db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных компаний' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    
    const salesUrl = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFromStr}`;
    
    const response = await axios.get(salesUrl, {
      headers: { 'Authorization': business.wb_api_key },
      timeout: 15000
    });

    const sales = (response.data || []).filter(s => s.saleID);
    
    // Группируем по nmId (артикул WB)
    const groupedMap = {};
    
    sales.forEach(sale => {
      const nmId = sale.nmId;
      
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
          prices: [],
          warehouseName: sale.warehouseName || '—'
        };
      }
      
      const retailAmount = sale.retail_amount || sale.priceWithDisc || sale.finishedPrice || 0;
      const commission = sale.ppvz_sales_commission || 0;
      const logistics = (sale.delivery_rub || 0) + 
                       (sale.storage_fee || 0) + 
                       (sale.acquiring_fee || 0) + 
                       (sale.penalty || 0) + 
                       (sale.deduction || 0) + 
                       (sale.acceptance || 0);
      const profit = retailAmount - commission - logistics;
      
      groupedMap[nmId].quantity += 1;
      groupedMap[nmId].totalRevenue += retailAmount;
      groupedMap[nmId].totalCommission += commission;
      groupedMap[nmId].totalLogistics += logistics;
      groupedMap[nmId].totalProfit += profit;
      groupedMap[nmId].prices.push(retailAmount);
    });
    
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

// API для получения полного финансового отчёта WB (reportDetailByPeriod)
app.get('/api/wb-fin-report', requireAuth, async (req, res) => {
  // Получаем компанию
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  let business;
  
  if (businessId) {
    business = db.getBusinessById(businessId);
    if (!business || business.account_id !== req.account.id) {
      return res.json({ error: 'Компания не найдена или доступ запрещён' });
    }
  } else {
    business = db.getDefaultBusiness(req.account.id);
  }
  
  if (!business) {
    return res.json({ error: 'Нет активных компаний' });
  }

  try {
    const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
    const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];
    const limit = req.query.limit || 100000;
    const rrdid = req.query.rrdid || 0;
    
    const reportUrl = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${dateFromStr}&dateTo=${dateToStr}&limit=${limit}&rrdid=${rrdid}`;
    
    const response = await axios.get(reportUrl, {
      headers: { 'Authorization': business.wb_api_key },
      timeout: 30000
    });

    const data = response.data || [];
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

// Главная страница (только для авторизованных)
app.get('/', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper MAX</title>
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
  <button id="finReport" style="background:#0984e3">📈 Фин отчёт</button>
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
  var btnFinReport = document.getElementById('finReport');

  btnFinReport.onclick = function(){
    window.location.href = '/fin-report';
  };

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

// Страница финансового отчета
app.get('/fin-report', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Финансовый отчет - WB Helper</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;padding:20px;color:#222;background:#f8f9fa}
h1{margin:0 0 20px;font-size:32px;color:#2d3436}
.container{width:100%;max-width:1400px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
.back-btn{display:inline-block;padding:10px 20px;background:#6c5ce7;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin-bottom:20px;transition:all 0.2s}
.back-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(108,92,231,0.3)}
.api-btn{display:inline-block;padding:12px 24px;background:#00b894;color:#fff;border:none;border-radius:8px;font-weight:600;font-size:15px;cursor:pointer;transition:all 0.2s;margin-bottom:20px;margin-left:12px}
.api-btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,185,148,0.3)}
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
</style>
</head>
<body>
<div class="container">
  <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <a href="/" class="back-btn">← Вернуться на главную</a>
    <button class="api-btn" onclick="openBusinessManager()">🏢 Управление компаниями</button>
    <div id="businessSelector" style="display:flex;gap:8px;align-items:center">
      <label style="font-size:14px;font-weight:600;color:#2d3436">Компания:</label>
      <select id="currentBusiness" onchange="switchBusiness()" style="padding:8px 12px;border:2px solid #dfe6e9;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#fff">
        <option value="">Загрузка...</option>
      </select>
    </div>
  </div>

  <h1>📈 Финансовый отчет</h1>

  <!-- Панель управления -->
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
    <div style="display:flex;gap:8px;align-items:center;background:#fff;padding:8px 16px;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.08)">
      <label style="font-size:14px;font-weight:600;color:#2d3436;white-space:nowrap">📅 Период:</label>
      <input type="date" id="dateFrom" style="padding:6px 10px;border:1px solid #dfe6e9;border-radius:6px;font-size:14px;cursor:pointer" />
      <span style="color:#636e72">—</span>
      <input type="date" id="dateTo" style="padding:6px 10px;border:1px solid #dfe6e9;border-radius:6px;font-size:14px;cursor:pointer" />
    </div>
    <button id="btnFinReport" onclick="toggleReportType('finReport')" style="padding:12px 24px;background:#fff;color:#2d3436;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px;transition:all 0.3s">📈 Фин отчёт</button>
    <button id="btnSalesReport" onclick="toggleReportType('salesReport')" style="padding:12px 24px;background:#fff;color:#2d3436;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px;transition:all 0.3s">💰 Продажи</button>
    <button onclick="loadFinancialData()" style="padding:12px 24px;background:#00b894;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">📊 Загрузить данные</button>
    <button onclick="loadOrders()" style="padding:12px 24px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">📦 Заказы</button>
    <button onclick="openCostModal()" style="padding:12px 24px;background:#fd79a8;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:15px">💰 Себестоимость</button>
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

  <!-- Датасет (динамическая таблица) -->
  <div id="datasetContainer" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-top:20px;display:none">
    <div style="padding:20px;border-bottom:2px solid #f1f3f5">
      <h2 style="margin:0;font-size:20px;color:#2d3436">📊 Датасет</h2>
    </div>
    <div style="overflow-x:auto;max-width:100%;max-height:600px;overflow-y:auto">
      <table id="datasetTable" style="width:100%;border-collapse:collapse;min-width:3000px">
        <thead id="datasetHeader" style="position:sticky;top:0;z-index:10">
          <tr style="background:#f8f9fa">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Номер отчёта</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Дата начала</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Дата конца</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Дата создания</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Валюта</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ID строки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">GI ID</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% доставки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Тариф дата с</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Тариф дата по</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Предмет</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Артикул WB</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Бренд</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Артикул продавца</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Размер</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Баркод</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Тип документа</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Кол-во</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Цена розничная</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Сумма продажи</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% скидки</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% комиссии</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Склад</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Операция</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Дата заказа</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Дата продажи</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Дата отчёта</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ШК</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Розница со скидкой</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Стоимость доставки</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Сумма возврата</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Доставка руб</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Тип коробки</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Скидка товара</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Промо продавца</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% СПП</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% КВВ база</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% КВВ</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Рейтинг %</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">КГВП v2</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Комиссия продаж</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">К перечислению</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Вознаграждение</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Эквайринг</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% эквайринга</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Обработка платежа</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Банк эквайринга</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Вознаграждение WB</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">НДС вознагр</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Офис</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ID офиса</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ID продавца</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Название продавца</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ИНН</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">№ декларации</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Тип бонуса</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ID стикера</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Страна сайта</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">DBS</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Штраф</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Доп. платёж</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Ребилл логистика</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Ребилл орг</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Хранение</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Удержание</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Приёмка</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">ID сборки</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">КИЗ</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">SRID</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Тип отчёта</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Юрлицо</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">TRBX ID</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Рассрочка</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">% скидки WIBES</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Кэшбэк сумма</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Кэшбэк скидка</th>
            <th style="padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">Кэшбэк комиссия</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">UID заказа</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px">График платежей</th>
          </tr>
        </thead>
        <tbody id="datasetBody">
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Модальное окно управления компаниями -->
<div id="businessModal" class="modal">
  <div class="modal-content" style="max-width:900px">
    <div class="modal-header">
      <h2>🏢 Управление компаниями</h2>
      <button class="close-btn" onclick="closeBusinessManager()">&times;</button>
    </div>
    
    <div style="margin-bottom:20px">
      <button onclick="openAddBusinessForm()" style="padding:10px 20px;background:#00b894;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">+ Добавить компанию</button>
    </div>
    
    <!-- Форма добавления компании -->
    <div id="addBusinessForm" style="display:none;background:#f8f9fa;padding:20px;border-radius:8px;margin-bottom:20px">
      <h3 style="margin-top:0">Новая компания</h3>
      <form id="businessForm" onsubmit="addBusiness(event)">
        <div class="form-group">
          <label for="companyName">Название компании *</label>
          <input type="text" id="companyName" placeholder="Моя компания" required />
        </div>
        <div class="form-group">
          <label for="wbApiKey">API ключ Wildberries *</label>
          <input type="text" id="wbApiKey" placeholder="Ваш API ключ от WB" required />
          <small>API ключ можно получить в личном кабинете WB: Настройки → Доступ к API</small>
        </div>
        <div class="form-group">
          <label for="description">Описание (необязательно)</label>
          <textarea id="description" rows="2" placeholder="Краткое описание компании"></textarea>
        </div>
        <div style="display:flex;gap:10px">
          <button type="submit" style="padding:10px 20px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer">Сохранить</button>
          <button type="button" onclick="closeAddBusinessForm()" style="padding:10px 20px;background:#dfe6e9;color:#2d3436;border:none;border-radius:8px;font-weight:600;cursor:pointer">Отмена</button>
        </div>
      </form>
    </div>
    
    <!-- Список компаний -->
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
      <button onclick="loadCostData()" style="padding:10px 20px;background:#00b894;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">🚀 Запустить загрузку</button>
      <button onclick="saveCostData()" style="padding:10px 20px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-left:10px">💾 Сохранить</button>
    </div>
    
    <div id="costTableContainer" style="flex:1;overflow:auto;padding:20px">
      <p style="text-align:center;color:#636e72">Нажмите "Запустить загрузку" для получения данных</p>
    </div>
  </div>
</div>

<script>
// ==================== УПРАВЛЕНИЕ КОМПАНИЯМИ ====================
let businesses = [];
let currentBusinessId = null;

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
      updateBusinessSelector(data.businesses);
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
    document.getElementById('businessList').innerHTML = '<p style="text-align:center;color:#636e72">Нет компаний. Добавьте первую компанию.</p>';
    return;
  }
  
  let html = '<div style="display:grid;gap:12px">';
  businessList.forEach(business => {
    const isActive = business.is_active === 1;
    const statusBadge = isActive 
      ? '<span style="background:#00b894;color:#fff;padding:4px 8px;border-radius:4px;font-size:12px">Активна</span>'
      : '<span style="background:#dfe6e9;color:#636e72;padding:4px 8px;border-radius:4px;font-size:12px">Неактивна</span>';
    
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
      alert('✅ Компания успешно добавлена!');
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
  if (!confirm(\`Вы уверены, что хотите удалить компанию "\${companyName}"?\`)) {
    return;
  }
  
  fetch(\`/api/businesses/\${businessId}\`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      alert('✅ Компания удалена');
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
  const activeBusinesses = businessList.filter(b => b.is_active === 1);
  
  if (activeBusinesses.length === 0) {
    selector.innerHTML = '<option value="">Нет активных компаний</option>';
    selector.disabled = true;
    return;
  }
  
  selector.disabled = false;
  selector.innerHTML = activeBusinesses.map(b => 
    \`<option value="\${b.id}">\${b.company_name}</option>\`
  ).join('');
  
  // Устанавливаем первую активную компанию как текущую
  if (!currentBusinessId || !activeBusinesses.find(b => b.id === currentBusinessId)) {
    currentBusinessId = activeBusinesses[0].id;
    selector.value = currentBusinessId;
  }
}

function switchBusiness() {
  currentBusinessId = parseInt(document.getElementById('currentBusiness').value);
  // Перезагружаем данные для новой компании (если они были загружены)
  console.log('Переключено на компанию ID:', currentBusinessId);
}

// Закрытие модалки при клике вне её
document.getElementById('businessModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeBusinessManager();
  }
});

// Загружаем список компаний при загрузке страницы
loadBusinesses();

// ==================== МОДАЛКА СЕБЕСТОИМОСТИ ====================
let costDataCache = []; // Кеш данных о себестоимости

function openCostModal() {
  if (!currentBusinessId) {
    alert('❌ Сначала выберите компанию');
    return;
  }
  document.getElementById('costModal').classList.add('active');
}

function closeCostModal() {
  document.getElementById('costModal').classList.remove('active');
}

// Загрузка данных из WB API для текущей компании
function loadCostData() {
  if (!currentBusinessId) {
    alert('❌ Выберите компанию');
    return;
  }
  
  const container = document.getElementById('costTableContainer');
  container.innerHTML = '<p style="text-align:center;color:#636e72">⏳ Загрузка товаров...</p>';
  
  // Получаем API ключ из текущей выбранной компании
  const business = businesses.find(b => b.id === currentBusinessId);
  if (!business) {
    container.innerHTML = '<p style="text-align:center;color:#d63031">❌ Компания не найдена</p>';
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
      subject: item.subject || '—',
      brand: item.brand || '—',
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
      // Обновляем себестоимости в кеше из БД
      data.costs.forEach(savedCost => {
        const item = costDataCache.find(c => c.nmId == savedCost.nm_id);
        if (item) {
          item.cost = savedCost.cost;
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

// Отрисовка таблицы с данными
function renderCostTable() {
  const container = document.getElementById('costTableContainer');
  
  let html = \`
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f8f9fa">
          <th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436">Артикул WB</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436">Предмет</th>
          <th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436">Бренд</th>
          <th style="padding:12px;text-align:right;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436">Себестоимость (₽)</th>
        </tr>
      </thead>
      <tbody>
  \`;
  
  costDataCache.forEach((item, index) => {
    html += \`
      <tr style="border-bottom:1px solid #f1f3f5">
        <td style="padding:12px;color:#2d3436;font-weight:500">\${item.nmId}</td>
        <td style="padding:12px;color:#636e72">\${item.subject}</td>
        <td style="padding:12px;color:#636e72">\${item.brand}</td>
        <td style="padding:12px;text-align:right">
          <input 
            type="number" 
            id="cost_\${index}"
            value="\${item.cost || ''}"
            onchange="updateCost(\${index}, this.value)"
            placeholder="0"
            style="width:120px;padding:6px 10px;border:2px solid #dfe6e9;border-radius:6px;text-align:right;font-size:14px"
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

// Обновление себестоимости в кеше
function updateCost(index, value) {
  if (costDataCache[index]) {
    costDataCache[index].cost = parseFloat(value) || 0;
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
    } else {
      alert('❌ Ошибка: ' + data.error);
    }
  })
  .catch(err => {
    alert('❌ Ошибка сохранения: ' + err.message);
  });
}

// Закрытие модалки при клике вне её
document.getElementById('costModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeCostModal();
  }
});

// Устанавливаем даты по умолчанию (последние 30 дней)
window.addEventListener('DOMContentLoaded', function() {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 30);
  
  document.getElementById('dateTo').value = dateTo.toISOString().split('T')[0];
  document.getElementById('dateFrom').value = dateFrom.toISOString().split('T')[0];
});

// Переменная для хранения выбранного типа отчета
let selectedReportType = null;

// Функция переключения типа отчета
function toggleReportType(type) {
  const btnFinReport = document.getElementById('btnFinReport');
  const btnSalesReport = document.getElementById('btnSalesReport');
  const datasetContainer = document.getElementById('datasetContainer');
  
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
    datasetContainer.style.display = 'none';
  } else {
    // Сначала сбрасываем все кнопки
    resetButton(btnFinReport);
    resetButton(btnSalesReport);
    
    // Выбираем нужную кнопку
    selectedReportType = type;
    const activeBtn = type === 'finReport' ? btnFinReport : btnSalesReport;
    const gradient = type === 'finReport' 
      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
      : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
    const borderColor = type === 'finReport' ? '#667eea' : '#f093fb';
    
    activeBtn.style.background = gradient;
    activeBtn.style.color = '#fff';
    activeBtn.style.border = '2px solid ' + borderColor;
    activeBtn.style.transform = 'translateY(-2px)';
    activeBtn.style.boxShadow = '0 4px 12px rgba(102,126,234,0.4)';
    datasetContainer.style.display = 'block';
    
    // Обновляем заголовок таблицы
    updateDatasetHeader(type);
  }
}

// Обновление заголовка датасета
function updateDatasetHeader(type) {
  const thead = document.getElementById('datasetHeader');
  
  if (type === 'salesReport') {
    // Заголовки для отчёта по продажам
    thead.innerHTML = '<tr style="background:#f8f9fa">' +
      '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Артикул WB</th>' +
      '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Предмет</th>' +
      '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Бренд</th>' +
      '<th style="padding:12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Кол-во продаж</th>' +
      '<th style="padding:12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Общая выручка</th>' +
      '<th style="padding:12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Комиссия</th>' +
      '<th style="padding:12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Логистика</th>' +
      '<th style="padding:12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Прибыль</th>' +
      '<th style="padding:12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Средняя цена</th>' +
      '<th style="padding:12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:14px">Склад</th>' +
      '</tr>';
  } else if (type === 'finReport') {
    // Полный заголовок для финансового отчёта (все 82 колонки)
    const thStyle = 'padding:8px 12px;text-align:left;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px';
    const thStyleRight = 'padding:8px 12px;text-align:right;border-bottom:2px solid #e9ecef;font-weight:600;color:#2d3436;white-space:nowrap;font-size:13px';
    
    thead.innerHTML = '<tr style="background:#f8f9fa">' +
      '<th style="' + thStyle + '">Номер отчёта</th>' +
      '<th style="' + thStyle + '">Дата начала</th>' +
      '<th style="' + thStyle + '">Дата конца</th>' +
      '<th style="' + thStyle + '">Дата создания</th>' +
      '<th style="' + thStyle + '">Валюта</th>' +
      '<th style="' + thStyle + '">ID строки</th>' +
      '<th style="' + thStyle + '">GI ID</th>' +
      '<th style="' + thStyleRight + '">% доставки</th>' +
      '<th style="' + thStyle + '">Тариф дата с</th>' +
      '<th style="' + thStyle + '">Тариф дата по</th>' +
      '<th style="' + thStyle + '">Предмет</th>' +
      '<th style="' + thStyle + '">Артикул WB</th>' +
      '<th style="' + thStyle + '">Бренд</th>' +
      '<th style="' + thStyle + '">Артикул продавца</th>' +
      '<th style="' + thStyle + '">Размер</th>' +
      '<th style="' + thStyle + '">Баркод</th>' +
      '<th style="' + thStyle + '">Тип документа</th>' +
      '<th style="' + thStyleRight + '">Кол-во</th>' +
      '<th style="' + thStyleRight + '">Цена розничная</th>' +
      '<th style="' + thStyleRight + '">Сумма продажи</th>' +
      '<th style="' + thStyleRight + '">% скидки</th>' +
      '<th style="' + thStyleRight + '">% комиссии</th>' +
      '<th style="' + thStyle + '">Склад</th>' +
      '<th style="' + thStyle + '">Операция</th>' +
      '<th style="' + thStyle + '">Дата заказа</th>' +
      '<th style="' + thStyle + '">Дата продажи</th>' +
      '<th style="' + thStyle + '">Дата отчёта</th>' +
      '<th style="' + thStyle + '">ШК</th>' +
      '<th style="' + thStyleRight + '">Розница со скидкой</th>' +
      '<th style="' + thStyleRight + '">Стоимость доставки</th>' +
      '<th style="' + thStyleRight + '">Сумма возврата</th>' +
      '<th style="' + thStyleRight + '">Доставка руб</th>' +
      '<th style="' + thStyle + '">Тип коробки</th>' +
      '<th style="' + thStyleRight + '">Скидка товара</th>' +
      '<th style="' + thStyleRight + '">Промо продавца</th>' +
      '<th style="' + thStyleRight + '">% СПП</th>' +
      '<th style="' + thStyleRight + '">% КВВ база</th>' +
      '<th style="' + thStyleRight + '">% КВВ</th>' +
      '<th style="' + thStyleRight + '">Рейтинг %</th>' +
      '<th style="' + thStyleRight + '">КГВП v2</th>' +
      '<th style="' + thStyleRight + '">Комиссия продаж</th>' +
      '<th style="' + thStyleRight + '">К перечислению</th>' +
      '<th style="' + thStyleRight + '">Вознаграждение</th>' +
      '<th style="' + thStyleRight + '">Эквайринг</th>' +
      '<th style="' + thStyleRight + '">% эквайринга</th>' +
      '<th style="' + thStyle + '">Обработка платежа</th>' +
      '<th style="' + thStyle + '">Банк эквайринга</th>' +
      '<th style="' + thStyleRight + '">Вознаграждение WB</th>' +
      '<th style="' + thStyleRight + '">НДС вознагр</th>' +
      '<th style="' + thStyle + '">Офис</th>' +
      '<th style="' + thStyle + '">ID офиса</th>' +
      '<th style="' + thStyle + '">ID продавца</th>' +
      '<th style="' + thStyle + '">Название продавца</th>' +
      '<th style="' + thStyle + '">ИНН</th>' +
      '<th style="' + thStyle + '">№ декларации</th>' +
      '<th style="' + thStyle + '">Тип бонуса</th>' +
      '<th style="' + thStyle + '">ID стикера</th>' +
      '<th style="' + thStyle + '">Страна сайта</th>' +
      '<th style="' + thStyle + '">DBS</th>' +
      '<th style="' + thStyleRight + '">Штраф</th>' +
      '<th style="' + thStyleRight + '">Доп. платёж</th>' +
      '<th style="' + thStyleRight + '">Ребилл логистика</th>' +
      '<th style="' + thStyle + '">Ребилл орг</th>' +
      '<th style="' + thStyleRight + '">Хранение</th>' +
      '<th style="' + thStyleRight + '">Удержание</th>' +
      '<th style="' + thStyleRight + '">Приёмка</th>' +
      '<th style="' + thStyle + '">ID сборки</th>' +
      '<th style="' + thStyle + '">КИЗ</th>' +
      '<th style="' + thStyle + '">SRID</th>' +
      '<th style="' + thStyle + '">Тип отчёта</th>' +
      '<th style="' + thStyle + '">Юрлицо</th>' +
      '<th style="' + thStyle + '">TRBX ID</th>' +
      '<th style="' + thStyleRight + '">Рассрочка</th>' +
      '<th style="' + thStyleRight + '">% скидки WIBES</th>' +
      '<th style="' + thStyleRight + '">Кэшбэк сумма</th>' +
      '<th style="' + thStyleRight + '">Кэшбэк скидка</th>' +
      '<th style="' + thStyleRight + '">Кэшбэк комиссия</th>' +
      '<th style="' + thStyle + '">UID заказа</th>' +
      '<th style="' + thStyle + '">График платежей</th>' +
      '</tr>';
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
function loadFinancialData() {
  if (!currentBusinessId) {
    alert('❌ Выберите компанию');
    return;
  }
  
  const dateRange = getDateRange();
  if (!dateRange) return;
  
  // Проверяем выбран ли тип отчёта
  if (selectedReportType === 'finReport') {
    loadFullFinReport(dateRange);
    return;
  }
  
  if (selectedReportType === 'salesReport') {
    loadSalesReport(dateRange);
    return;
  }
  
  const tbody = document.getElementById('finTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка данных...</td></tr>';
  
  fetch('/api/wb-finance?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
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

function loadSales() {
  if (!currentBusinessId) {
    alert('❌ Выберите компанию');
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
    alert('❌ Выберите компанию');
    return;
  }
  
  const dateRange = getDateRange();
  if (!dateRange) return;
  
  const tbody = document.getElementById('finTableBody');
  tbody.innerHTML = '<tr><td colspan="8" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка заказов...</td></tr>';
  
  fetch('/api/wb-orders?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
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

// Загрузка отчёта по продажам (уникальные артикулы)
function loadSalesReport(dateRange) {
  if (!currentBusinessId) {
    alert('❌ Выберите компанию');
    return;
  }
  
  const tbody = document.getElementById('datasetBody');
  tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка отчёта по продажам...</td></tr>';
  
  fetch('/api/wb-sales-grouped?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
  })
  .then(res => res.json())
  .then(response => {
    if (response.error) {
      tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#d63031">❌ ' + response.error + '</td></tr>';
      return;
    }
    
    displaySalesReport(response.data);
  })
  .catch(err => {
    tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#d63031">❌ Ошибка загрузки: ' + err.message + '</td></tr>';
  });
}

// Отображение отчёта по продажам (уникальные артикулы)
function displaySalesReport(data) {
  const tbody = document.getElementById('datasetBody');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" style="padding:40px;text-align:center;color:#636e72">Нет данных за выбранный период</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.innerHTML = 
      '<td style="padding:12px;font-size:14px;font-weight:600">' + (item.nmId || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px">' + (item.subject || '—') + '</td>' +
      '<td style="padding:12px;font-size:14px">' + (item.brand || '—') + '</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#00b894">' + (item.quantity || 0) + '</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px">' + (item.totalRevenue || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;color:#d63031">' + (item.totalCommission || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;color:#e17055">' + (item.totalLogistics || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#00b894">' + (item.totalProfit || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;text-align:right;font-size:14px">' + (item.avgPrice || 0).toFixed(2) + ' ₽</td>' +
      '<td style="padding:12px;font-size:13px;color:#636e72">' + (item.warehouseName || '—') + '</td>';
    tbody.appendChild(tr);
  });
  
  // Обновляем карточки статистики
  let totalRevenue = 0, totalCommission = 0, totalLogistics = 0, totalProfit = 0;
  data.forEach(item => {
    totalRevenue += item.totalRevenue || 0;
    totalCommission += item.totalCommission || 0;
    totalLogistics += item.totalLogistics || 0;
    totalProfit += item.totalProfit || 0;
  });
  
  document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(2) + ' ₽';
  document.getElementById('totalCommission').textContent = '-' + totalCommission.toFixed(2) + ' ₽';
  document.getElementById('totalLogistics').textContent = totalLogistics.toFixed(2) + ' ₽';
  document.getElementById('netProfit').textContent = totalProfit.toFixed(2) + ' ₽';
  document.getElementById('pureProfit').textContent = '—';
}

// Загрузка полного финансового отчёта WB
function loadFullFinReport(dateRange) {
  if (!currentBusinessId) {
    alert('❌ Выберите компанию');
    return;
  }
  
  const tbody = document.getElementById('datasetBody');
  tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#636e72">⏳ Загрузка финансового отчёта...</td></tr>';
  
  fetch('/api/wb-fin-report?businessId=' + currentBusinessId + '&dateFrom=' + dateRange.dateFrom + '&dateTo=' + dateRange.dateTo, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    }
  })
  .then(res => res.json())
  .then(response => {
    if (response.error) {
      tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#d63031">❌ ' + response.error + '</td></tr>';
      return;
    }
    
    displayFullFinReport(response.data);
  })
  .catch(err => {
    tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#d63031">❌ Ошибка загрузки: ' + err.message + '</td></tr>';
  });
}

// Отображение полного финансового отчёта
function displayFullFinReport(data) {
  const tbody = document.getElementById('datasetBody');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="82" style="padding:40px;text-align:center;color:#636e72">Нет данных за выбранный период</td></tr>';
    return;
  }
  
  tbody.innerHTML = '';
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f3f5';
    tr.innerHTML = 
      '<td style="padding:8px 12px;font-size:13px">' + (item.realizationreport_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.date_from || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.date_to || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.create_dt || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.currency_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.rrd_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.gi_id || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.dlv_prc || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.fix_tariff_date_from || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.fix_tariff_date_to || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.subject_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.nm_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.brand_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.sa_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ts_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.barcode || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.doc_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.quantity || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.retail_price || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600">' + (item.retail_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.sale_percent || 0) + '%</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.commission_percent || 0) + '%</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.office_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.supplier_oper_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.order_dt ? new Date(item.order_dt).toLocaleDateString('ru-RU') : '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.sale_dt ? new Date(item.sale_dt).toLocaleDateString('ru-RU') : '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.rr_dt || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.shk_id || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.retail_price_withdisc_rub || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.delivery_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.return_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.delivery_rub || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.gi_box_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.product_discount_for_report || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.supplier_promo || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_spp_prc || 0) + '%</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_kvw_prc_base || 0) + '%</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_kvw_prc || 0) + '%</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.sup_rating_prc_up || 0) + '%</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.is_kgvp_v2 || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;color:#d63031">' + (item.ppvz_sales_commission || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:600;color:#00b894">' + (item.ppvz_for_pay || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_reward || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;color:#e17055">' + (item.acquiring_fee || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.acquiring_percent || 0) + '%</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.payment_processing || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.acquiring_bank || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_vw || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.ppvz_vw_nds || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_office_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_office_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_supplier_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_supplier_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.ppvz_inn || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.declaration_number || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.bonus_type_name || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.sticker_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.site_country || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.srv_dbs ? 'Да' : 'Нет') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;color:#d63031">' + (item.penalty || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.additional_payment || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.rebill_logistic_cost || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.rebill_logistic_org || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px;color:#e17055">' + (item.storage_fee || 0).toFixed(2) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.deduction || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.acceptance || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.assembly_id || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px;max-width:150px;overflow:hidden;text-overflow:ellipsis">' + (item.kiz || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.srid || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.report_type || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.is_legal_entity ? 'Да' : 'Нет') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.trbx_id || '—') + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.installment_cofinancing_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.wibes_wb_discount_percent || 0) + '%</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.cashback_amount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.cashback_discount || 0) + '</td>' +
      '<td style="padding:8px 12px;text-align:right;font-size:13px">' + (item.cashback_commission_change || 0) + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.order_uid || '—') + '</td>' +
      '<td style="padding:8px 12px;font-size:13px">' + (item.payment_schedule || '—') + '</td>';
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

app.listen(PORT, () => {
  console.log('WB price service started on port', PORT);
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