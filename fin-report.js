require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./database');
const supabase = require('./supabase-client');
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

function isLikelyJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3;
}

async function ensureAccountFromAuthUser(user) {
  if (!user || !user.email) {
    return null;
  }

  const existing = await db.getAccountByEmail(user.email);
  if (existing) {
    return existing;
  }

  const rawUsername = user.user_metadata && user.user_metadata.username
    ? String(user.user_metadata.username)
    : String(user.email).split('@')[0];
  const baseUsername = rawUsername.trim() || 'user';
  let candidate = baseUsername;
  let suffix = 1;

  while (await db.getAccountByUsername(candidate)) {
    candidate = `${baseUsername}${suffix}`;
    suffix += 1;
  }

  const randomPassword = crypto.randomBytes(16).toString('hex');
  return db.createAccount(candidate, randomPassword, user.email);
}

async function getAccountFromAuthToken(token) {
  if (!token) {
    return null;
  }

  if (isLikelyJwt(token)) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return null;
    }
    return ensureAccountFromAuthUser(data.user);
  }

  const accountId = parseInt(token, 10);
  if (!Number.isNaN(accountId)) {
    return db.getAccountById(accountId);
  }

  return null;
}

// Middleware для проверки авторизации через БД и Supabase Auth
async function requireAuth(req, res, next) {
  const token = req.cookies?.authToken;
  const accountFromCookie = await getAccountFromAuthToken(token);
  if (accountFromCookie) {
    req.account = accountFromCookie;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7);
    const accountFromHeader = await getAccountFromAuthToken(bearerToken);
    if (accountFromHeader) {
      req.account = accountFromHeader;
      return next();
    }
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Необходима авторизация' });
  }

  res.redirect('/login');
}

// Страница авторизации (вход + регистрация)
app.get('/auth', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/');
  }
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Вход - Elestet сервис</title>
<style>
*{box-sizing:border-box}
html{overflow-y:scroll}
*{scrollbar-width:thin;scrollbar-color:rgba(56,189,248,0.45) rgba(15,23,42,0.55)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.45);border-radius:10px;border:2px solid rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,0.7)}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;margin:0;padding:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(1200px 600px at 10% -10%,#7f8cff 0%,rgba(127,140,255,0) 60%),radial-gradient(900px 500px at 90% 0%,#3b82f6 0%,rgba(59,130,246,0) 55%),#0f172a;color:#e2e8f0;position:relative}
body::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0));pointer-events:none}
.login-box{background:rgba(15,23,42,0.85);backdrop-filter:blur(12px);border:1px solid rgba(148,163,184,0.2);border-radius:24px;padding:44px 40px;box-shadow:0 30px 80px rgba(0,0,0,0.45);width:100%;max-width:430px;position:relative;z-index:1;animation:slideUp 0.6s cubic-bezier(0.16,1,0.3,1)}
@keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
.login-box h1{margin:0 0 12px;font-size:30px;font-weight:700;color:#f8fafc;text-align:center;letter-spacing:-0.4px}
.login-box .subtitle{text-align:center;color:#cbd5f5;margin-bottom:22px;font-size:14px;font-weight:500}
.tab-switch{display:flex;gap:10px;background:rgba(30,41,59,0.72);padding:8px;border-radius:14px;margin-bottom:24px;border:1px solid rgba(148,163,184,0.18)}
.tab-switch button{flex:1;padding:10px 12px;border-radius:10px;background:transparent;color:#cbd5f5;box-shadow:none;font-size:13px;text-transform:uppercase;letter-spacing:0.4px;font-weight:700}
.tab-switch button:hover{transform:none;box-shadow:none}
.tab-switch button.active{background:linear-gradient(135deg,#22d3ee 0%,#3b82f6 100%);color:#0b1220;box-shadow:0 10px 25px rgba(59,130,246,0.35)}
.form-group{margin-bottom:22px}
label{display:block;margin-bottom:10px;font-weight:600;color:#e2e8f0;font-size:13px;letter-spacing:0.3px;text-transform:uppercase}
input{width:100%;padding:14px 16px;border:1px solid rgba(148,163,184,0.35);border-radius:12px;font-size:15px;transition:all 0.25s;box-sizing:border-box;background:rgba(15,23,42,0.6);color:#e2e8f0}
input:focus{outline:none;border-color:#60a5fa;box-shadow:0 0 0 4px rgba(96,165,250,0.2)}
button{width:100%;padding:15px;border:none;background:linear-gradient(135deg,#22d3ee 0%,#3b82f6 100%);color:#0b1220;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.25s;box-shadow:0 10px 25px rgba(59,130,246,0.35);letter-spacing:0.3px}
button:hover{transform:translateY(-2px);box-shadow:0 16px 35px rgba(59,130,246,0.45)}
button:active{transform:translateY(0)}
.hint{font-size:12px;color:#93a4c7;margin-top:8px;font-weight:500}
.error{background:linear-gradient(135deg,#ef4444 0%,#fb7185 100%);color:#fff;padding:12px 14px;border-radius:10px;margin-bottom:22px;font-size:13px;font-weight:600;display:none;box-shadow:0 6px 16px rgba(239,68,68,0.35);position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:9999;max-width:480px;width:calc(100% - 40px);text-align:center}
.success{background:linear-gradient(135deg,#22c55e 0%,#4ade80 100%);color:#0b1220;padding:12px 14px;border-radius:10px;margin-bottom:22px;font-size:13px;font-weight:700;display:none;box-shadow:0 6px 16px rgba(34,197,94,0.35);position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:9999;max-width:480px;width:calc(100% - 40px);text-align:center}
.auth-forms{min-height:380px;display:flex;flex-direction:column;justify-content:flex-start;position:relative}
.auth-form{width:100%;position:absolute;top:0;left:0;opacity:0;transform:translateY(8px);transition:opacity 0.25s ease, transform 0.25s ease;pointer-events:none}
.auth-form.active{opacity:1;transform:translateY(0);pointer-events:auto}
</style></head><body>
<div class="login-box">
  <h1>🚀 Elestet сервис</h1>
  <p id="subtitle" class="subtitle">Войдите для доступа к сервису</p>
  <div class="tab-switch">
    <button type="button" id="tabLogin" class="active">Вход</button>
    <button type="button" id="tabRegister">Регистрация</button>
  </div>
  <div id="error" class="error"></div>
  <div id="success" class="success"></div>
  <div class="auth-forms">
    <form id="loginForm" class="auth-form active">
      <div class="form-group">
        <label for="login">Email или логин</label>
        <input type="text" id="login" name="login" required autocomplete="username" />
      </div>
      <div class="form-group">
        <label for="password">Пароль</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" />
        <div class="hint">Подсказка: посуда</div>
      </div>
      <button type="submit">Войти</button>
    </form>
    <form id="registerForm" class="auth-form">
      <div class="form-group">
        <label for="regUsername">Логин</label>
        <input type="text" id="regUsername" name="regUsername" required autocomplete="username" />
      </div>
      <div class="form-group">
        <label for="regEmail">Email</label>
        <input type="email" id="regEmail" name="regEmail" required autocomplete="email" />
      </div>
      <div class="form-group">
        <label for="regPassword">Пароль</label>
        <input type="password" id="regPassword" name="regPassword" required autocomplete="new-password" />
        <div class="hint">После регистрации подтвердите email</div>
      </div>
      <button type="submit">Зарегистрироваться</button>
    </form>
  </div>
</div>
<script>
function setActiveTab(tab) {
  var loginTab = document.getElementById('tabLogin');
  var registerTab = document.getElementById('tabRegister');
  var loginForm = document.getElementById('loginForm');
  var registerForm = document.getElementById('registerForm');
  var subtitle = document.getElementById('subtitle');
  var err = document.getElementById('error');
  var ok = document.getElementById('success');
  var isLogin = tab === 'login';

  loginTab.classList.toggle('active', isLogin);
  registerTab.classList.toggle('active', !isLogin);
  loginForm.classList.toggle('active', isLogin);
  registerForm.classList.toggle('active', !isLogin);
  subtitle.textContent = isLogin
    ? 'Войдите для доступа к сервису'
    : 'Создайте аккаунт для доступа к сервису';
  err.style.display = 'none';
  ok.style.display = 'none';
}

document.getElementById('tabLogin').onclick = function() {
  setActiveTab('login');
};
document.getElementById('tabRegister').onclick = function() {
  setActiveTab('register');
};

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

document.getElementById('registerForm').onsubmit = function(e) {
  e.preventDefault();
  var username = document.getElementById('regUsername').value;
  var email = document.getElementById('regEmail').value;
  var password = document.getElementById('regPassword').value;
  fetch('/api/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username: username, email: email, password: password})
  })
  .then(function(r){return r.json();})
  .then(function(data){
    var err = document.getElementById('error');
    var ok = document.getElementById('success');
    if(data.success){
      err.style.display = 'none';
      ok.textContent = data.message || 'Регистрация успешна. Подтвердите email и войдите.';
      ok.style.display = 'block';
    } else {
      ok.style.display = 'none';
      err.textContent = data.message || 'Не удалось создать аккаунт';
      err.style.display = 'block';
    }
  })
  .catch(function(){
    var err = document.getElementById('error');
    err.textContent = 'Ошибка соединения';
    err.style.display = 'block';
  });
};

var params = new URLSearchParams(window.location.search);
setActiveTab(params.get('tab') === 'register' ? 'register' : 'login');
</script></body></html>`);
});

// Совместимость: вход и регистрация
app.get('/login', (req, res) => {
  res.redirect('/auth');
});

app.get('/register', (req, res) => {
  res.redirect('/auth?tab=register');
});

// API для входа
app.post('/api/login', async (req, res) => {
  const { login, password } = req.body;
  const identifier = String(login || '').trim();
  const rawPassword = String(password || '');

  if (!identifier || !rawPassword) {
    return res.json({ success: false, message: 'Введите логин и пароль' });
  }

  if (identifier.includes('@')) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: rawPassword
    });

    if (error || !data || !data.session) {
      const lowerMessage = String(error && error.message ? error.message : '').toLowerCase();
      const message = lowerMessage.includes('email not confirmed')
        ? 'Подтвердите email перед входом'
        : 'Неверный email или пароль';
      return res.json({ success: false, message });
    }

    const token = data.session.access_token;
    const account = await ensureAccountFromAuthUser(data.user);
    if (!account) {
      return res.json({ success: false, message: 'Ошибка создания аккаунта' });
    }

    res.cookie('authToken', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
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

  const account = await db.authenticateAccount(identifier, rawPassword);
  if (account) {
    const token = account.id.toString();
    res.cookie('authToken', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
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

// API для регистрации
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  const cleanUsername = String(username || '').trim();
  const cleanEmail = String(email || '').trim();
  const rawPassword = String(password || '').trim();

  if (!cleanUsername || !cleanEmail || !rawPassword) {
    return res.json({ success: false, message: 'Заполните логин, email и пароль' });
  }

  const existingByUsername = await db.getAccountByUsername(cleanUsername);
  if (existingByUsername) {
    return res.json({ success: false, message: 'Логин уже занят' });
  }

  const existingByEmail = await db.getAccountByEmail(cleanEmail);
  if (existingByEmail) {
    return res.json({ success: false, message: 'Email уже зарегистрирован' });
  }

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password: rawPassword,
    options: {
      data: {
        username: cleanUsername
      }
    }
  });

  if (error) {
    return res.json({ success: false, message: error.message || 'Не удалось создать пользователя' });
  }

  const randomPassword = crypto.randomBytes(16).toString('hex');
  try {
    await db.createAccount(cleanUsername, randomPassword, cleanEmail);
  } catch (e) {
    const existingAccount = await db.getAccountByEmail(cleanEmail);
    if (!existingAccount) {
      return res.json({ success: false, message: 'Не удалось создать аккаунт в системе' });
    }
  }

  res.json({
    success: true,
    message: 'Регистрация успешна. Подтвердите email, затем войдите в систему.'
  });
});

// ==================== API: УПРАВЛЕНИЕ МАГАЗИНАМИ ====================

// Получить список магазинов текущего аккаунта
app.get('/api/businesses', requireAuth, async (req, res) => {
  try {
    const onlyWithApi = req.query.onlyWithApi === '1' || req.query.onlyWithApi === 'true';
    const businesses = await db.getBusinessesByAccount(req.account.id, false, onlyWithApi);
    const stats = await db.getAccountStats(req.account.id);
    res.json({ success: true, businesses, stats });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Создать новую компанию
app.post('/api/businesses', requireAuth, async (req, res) => {
  const { company_name, wb_api_key, description } = req.body;
  
  if (!company_name) {
    return res.json({ success: false, error: 'Название компании обязательно' });
  }
  
  try {
    const apiKey = wb_api_key && String(wb_api_key).trim() ? String(wb_api_key).trim() : null;
    const business = await db.createBusiness(req.account.id, company_name, apiKey, description);
    
    if (apiKey) {
      // 🔄 Запускаем начальную синхронизацию в фоне (загрузка ВСЕЙ истории WB)
      syncService.syncAllData(business.id, apiKey)
        .then(() => console.log(`✅ Начальная синхронизация завершена для магазина ${business.id}`))
        .catch(err => console.error(`❌ Ошибка начальной синхронизации для магазина ${business.id}:`, err.message));
    }
    
    res.json({ success: true, business, message: apiKey ? 'Магазин создан, синхронизация данных запущена' : 'Магазин создан' });
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
    if (wb_api_key !== undefined) {
      const apiKey = wb_api_key && String(wb_api_key).trim() ? String(wb_api_key).trim() : null;
      updates.wb_api_key = apiKey;
    }
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
      return res.json({ success: false, error: 'Нет активных магазинов с API ключом. Создайте магазин.' });
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

// ==================== API: КОНТРАГЕНТЫ ====================

app.get('/api/counterparties', requireAuth, async (req, res) => {
  const search = req.query.q || null;
  try {
    const items = await db.getCounterparties(req.account.id, search);
    res.json({ success: true, items });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/counterparties', requireAuth, async (req, res) => {
  const name = (req.body && req.body.name) ? String(req.body.name) : '';
  if (!name.trim()) {
    return res.json({ success: false, error: 'Название контрагента обязательно' });
  }
  try {
    const item = await db.upsertCounterparty(req.account.id, name);
    res.json({ success: true, item });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== API: КАТЕГОРИИ ДДС ====================

app.get('/api/cash-categories', requireAuth, async (req, res) => {
  const search = req.query.q || null;
  try {
    const items = await db.getCashCategories(req.account.id, search);
    res.json({ success: true, items });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/cash-categories', requireAuth, async (req, res) => {
  const name = (req.body && req.body.name) ? String(req.body.name) : '';
  if (!name.trim()) {
    return res.json({ success: false, error: 'Название категории обязательно' });
  }
  try {
    const item = await db.upsertCashCategory(req.account.id, name);
    res.json({ success: true, item });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== API: ДВИЖЕНИЕ ДЕНЕГ ====================

// Получить транзакции (ДДС)
app.get('/api/cash/transactions', requireAuth, async (req, res) => {
  const dateFrom = req.query.dateFrom || null;
  const dateTo = req.query.dateTo || null;
  const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
  const txType = req.query.type || null;

  if (businessId) {
    const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
    if (!isOwner) {
      return res.json({ success: false, error: 'Доступ запрещён' });
    }
  }

  try {
    const items = await db.getCashTransactions(req.account.id, dateFrom, dateTo, businessId, txType);
    res.json({ success: true, items });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Создать транзакцию
app.post('/api/cash/transactions', requireAuth, async (req, res) => {
  const { tx_type, amount, tx_date, category, counterparty, note, business_id } = req.body;

  if (!tx_type || !['income', 'expense'].includes(tx_type)) {
    return res.json({ success: false, error: 'Неверный тип операции' });
  }

  if (!amount || Number(amount) <= 0) {
    return res.json({ success: false, error: 'Сумма должна быть больше 0' });
  }

  if (!tx_date) {
    return res.json({ success: false, error: 'Дата операции обязательна' });
  }

  if (business_id) {
    const isOwner = await db.verifyBusinessOwnership(parseInt(business_id), req.account.id);
    if (!isOwner) {
      return res.json({ success: false, error: 'Доступ запрещён' });
    }
  }

  try {
    const item = await db.createCashTransaction(req.account.id, {
      tx_type,
      amount: Number(amount),
      tx_date,
      category,
      counterparty,
      note,
      business_id: business_id ? parseInt(business_id) : null
    });
    res.json({ success: true, item });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Обновить транзакцию
app.put('/api/cash/transactions/:id', requireAuth, async (req, res) => {
  const txId = parseInt(req.params.id);
  const updates = { ...req.body };

  if (updates.business_id) {

app.delete('/api/cash/transactions/bulk', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(id => Number.isFinite(id)) : [];
  if (!ids.length) {
    return res.json({ success: false, error: 'Нет операций для удаления' });
  }

  try {
    const deleted = await db.deleteCashTransactionsBulk(req.account.id, ids);
    res.json({ success: true, deleted });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});
    const isOwner = await db.verifyBusinessOwnership(parseInt(updates.business_id), req.account.id);
    if (!isOwner) {
      return res.json({ success: false, error: 'Доступ запрещён' });
    }
  }

  try {
    const success = await db.updateCashTransaction(req.account.id, txId, updates);
    res.json({ success });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Удалить транзакцию
app.delete('/api/cash/transactions/:id', requireAuth, async (req, res) => {
  const txId = parseInt(req.params.id);

  try {
    const success = await db.deleteCashTransaction(req.account.id, txId);
    res.json({ success });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Сводка по ДДС
app.get('/api/cash/summary', requireAuth, async (req, res) => {
  const dateFrom = req.query.dateFrom || null;
  const dateTo = req.query.dateTo || null;

  try {
    const summary = await db.getCashSummary(req.account.id, dateFrom, dateTo);
    res.json({ success: true, summary });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ==================== API: ДОЛГИ ====================

app.get('/api/cash/debts', requireAuth, async (req, res) => {
  const status = req.query.status || null;

  try {
    const items = await db.getCashDebts(req.account.id, status);
    res.json({ success: true, items });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/cash/debts', requireAuth, async (req, res) => {
  const { debt_date, debt_type, amount, counterparty, due_date, status, note, business_id, operation_type } = req.body;

  if (!debt_type || !['receivable', 'payable'].includes(debt_type)) {
    return res.json({ success: false, error: 'Неверный тип долга' });
  }

  if (!amount || Number(amount) === 0) {
    return res.json({ success: false, error: 'Сумма не может быть нулевой' });
  }

  if (business_id) {
    const isOwner = await db.verifyBusinessOwnership(parseInt(business_id), req.account.id);
    if (!isOwner) {
      return res.json({ success: false, error: 'Доступ запрещён' });
    }
  }

  try {
    // Ищем открытую группу долга для этого контрагента + тип
    const openDebtGroup = await db.findOpenDebtGroup(req.account.id, counterparty, debt_type, business_id);
    const amountValue = Number(amount);

    if (openDebtGroup && amountValue !== 0) {
      const currentBalance = Number(openDebtGroup.balance || 0);
      const newBalance = currentBalance + amountValue;

      // Если операция переворачивает долг в противоположный (переплата/перебор)
      if (currentBalance !== 0 && Math.sign(currentBalance) !== Math.sign(newBalance) && Math.abs(newBalance) > 0.01) {
        const closeAmount = -currentBalance; // Закрываем текущий долг до нуля
        const closeOperationType = closeAmount < 0 ? 'decrease' : 'increase';

        const closeItem = await db.createCashDebt(req.account.id, {
          debt_date: debt_date || null,
          debt_type,
          amount: closeAmount,
          counterparty,
          due_date: due_date || null,
          status: status || 'open',
          note,
          business_id: business_id ? parseInt(business_id) : null,
          operation_type: closeOperationType,
          debt_group_id: openDebtGroup.debt_group_id
        });

        const oppositeDebtType = debt_type === 'receivable' ? 'payable' : 'receivable';
        const newAmount = Math.abs(newBalance);

        const newItem = await db.createCashDebt(req.account.id, {
          debt_date: debt_date || null,
          debt_type: oppositeDebtType,
          amount: newAmount,
          counterparty,
          due_date: due_date || null,
          status: 'open',
          note,
          business_id: business_id ? parseInt(business_id) : null,
          operation_type: 'increase',
          debt_group_id: null
        });

        return res.json({ success: true, items: [closeItem, newItem], split: true });
      }
    }

    const item = await db.createCashDebt(req.account.id, {
      debt_date: debt_date || null,
      debt_type,
      amount: amountValue,
      counterparty,
      due_date: due_date || null,
      status: status || 'open',
      note,
      business_id: business_id ? parseInt(business_id) : null,
      operation_type: operation_type || 'increase',
      debt_group_id: openDebtGroup ? openDebtGroup.debt_group_id : null // Если есть открытая группа - используем её ID
    });
    res.json({ success: true, item });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/cash/debts/recalculate', requireAuth, async (req, res) => {
  const { counterparty, business_id, amount, debt_date, note } = req.body;

  if (!counterparty || !String(counterparty).trim()) {
    return res.json({ success: false, error: 'Контрагент не указан' });
  }

  if (business_id) {
    const isOwner = await db.verifyBusinessOwnership(parseInt(business_id), req.account.id);
    if (!isOwner) {
      return res.json({ success: false, error: 'Доступ запрещён' });
    }
  }

  try {
    const receivableGroup = await db.findOpenDebtGroup(req.account.id, counterparty, 'receivable', business_id ? parseInt(business_id) : null);
    const payableGroup = await db.findOpenDebtGroup(req.account.id, counterparty, 'payable', business_id ? parseInt(business_id) : null);

    if (!receivableGroup || !payableGroup) {
      return res.json({ success: false, error: 'Для перерасчёта нужны оба типа долга' });
    }

    const receivableBalance = Math.abs(Number(receivableGroup.balance || 0));
    const payableBalance = Math.abs(Number(payableGroup.balance || 0));
    const maxAmount = Math.min(receivableBalance, payableBalance);

    if (!maxAmount || maxAmount <= 0.01) {
      return res.json({ success: false, error: 'Нет суммы для перерасчёта' });
    }

    const requestedAmount = amount ? Number(amount) : maxAmount;
    if (!requestedAmount || requestedAmount <= 0) {
      return res.json({ success: false, error: 'Сумма должна быть больше 0' });
    }
    if (requestedAmount - maxAmount > 0.01) {
      return res.json({ success: false, error: 'Сумма превышает доступный максимум' });
    }

    const finalNote = note && String(note).trim() ? String(note).trim() : 'Взаимозачёт';
    const offsetAmount = -Math.abs(requestedAmount);

    const receivableItem = await db.createCashDebt(req.account.id, {
      debt_date: debt_date || null,
      debt_type: 'receivable',
      amount: offsetAmount,
      counterparty,
      due_date: null,
      status: 'open',
      note: finalNote,
      business_id: business_id ? parseInt(business_id) : null,
      operation_type: 'decrease',
      debt_group_id: receivableGroup.debt_group_id
    });

    const payableItem = await db.createCashDebt(req.account.id, {
      debt_date: debt_date || null,
      debt_type: 'payable',
      amount: offsetAmount,
      counterparty,
      due_date: null,
      status: 'open',
      note: finalNote,
      business_id: business_id ? parseInt(business_id) : null,
      operation_type: 'decrease',
      debt_group_id: payableGroup.debt_group_id
    });

    return res.json({ success: true, items: [receivableItem, payableItem], amount: Math.abs(offsetAmount) });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.put('/api/cash/debts/:id', requireAuth, async (req, res) => {
  const debtId = parseInt(req.params.id);
  const updates = { ...req.body };

  if (updates.business_id) {
    const isOwner = await db.verifyBusinessOwnership(parseInt(updates.business_id), req.account.id);
    if (!isOwner) {
      return res.json({ success: false, error: 'Доступ запрещён' });
    }
  }

  try {
    const success = await db.updateCashDebt(req.account.id, debtId, updates);
    res.json({ success });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.delete('/api/cash/debts/bulk', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(id => Number.isFinite(id)) : [];
  if (!ids.length) {
    return res.json({ success: false, error: 'Нет записей для удаления' });
  }

  try {
    const deleted = await db.deleteCashDebtsBulk(req.account.id, ids);
    res.json({ success: true, deleted });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.delete('/api/cash/debts/:id', requireAuth, async (req, res) => {
  const debtId = parseInt(req.params.id);

  try {
    const success = await db.deleteCashDebt(req.account.id, debtId);
    res.json({ success });
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

// API для получения остатков WB по API ключам
app.get('/api/wb-stocks', requireAuth, async (req, res) => {
  try {
    const rawIds = (req.query.businessIds || '').split(',').map(id => parseInt(id, 10)).filter(Boolean);
    const businesses = await db.getBusinessesByAccount(req.account.id, false, true);
    const filtered = rawIds.length ? businesses.filter(b => rawIds.includes(b.id)) : businesses;

    if (!filtered.length) {
      return res.json({ success: false, error: 'Нет магазинов с API ключом' });
    }

    const dateFrom = req.query.dateFrom || '2019-01-01';
    const itemsMap = new Map();
    const errors = [];

    for (const business of filtered) {
      if (!business.wb_api_key) continue;
      try {
        const url = 'https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=' + dateFrom;
        const response = await axios.get(url, {
          headers: { 'Authorization': business.wb_api_key },
          timeout: 60000
        });

        const stocks = response.data || [];
        stocks.forEach(stock => {
          const nmId = stock.nmId || stock.nm_id;
          if (!nmId) return;

          const key = business.id + ':' + nmId;
          const qty = Number(stock.quantity || stock.quantityFull || stock.quantityNotInOrders || 0);
          const inWayToClient = Number(stock.inWayToClient || stock.inWayToClientQty || 0);
          const inWayFromClient = Number(stock.inWayFromClient || stock.inWayFromClientQty || 0);

          if (!itemsMap.has(key)) {
            itemsMap.set(key, {
              business_id: business.id,
              nm_id: nmId,
              brand: stock.brand || stock.tradeMark || '',
              subject: stock.subject || stock.category || '',
              qty: 0,
              in_way_to_client: 0,
              in_way_from_client: 0,
              total_qty: 0
            });
          }

          const item = itemsMap.get(key);
          item.qty += qty;
          item.in_way_to_client += inWayToClient;
          item.in_way_from_client += inWayFromClient;
          item.total_qty = item.qty + item.in_way_to_client + item.in_way_from_client;
        });
      } catch (err) {
        errors.push({ business_id: business.id, error: err.message });
      }
    }

    const items = Array.from(itemsMap.values());
    return res.json({ success: true, items, errors });
  } catch (err) {
    return res.json({ success: false, error: err.message });
  }
});

// API для выхода
app.get('/api/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('authToken', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });
      res.redirect('/login');
    });
    return;
  }

  res.clearCookie('authToken', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
  res.redirect('/login');
});

// Страница анализа товаров (только для авторизованных)
app.get('/products', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper MAX - Анализ товаров</title>
<style>
*{box-sizing:border-box}
html{overflow-y:scroll}
*{scrollbar-width:thin;scrollbar-color:rgba(56,189,248,0.45) rgba(15,23,42,0.55)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.45);border-radius:10px;border:2px solid rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,0.7)}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;margin:0;padding:24px 24px 24px 0;color:#e2e8f0;background:#0b1220;background-image:radial-gradient(1200px 600px at 10% -10%,rgba(56,189,248,0.25),rgba(0,0,0,0)),radial-gradient(900px 500px at 90% 0%,rgba(34,197,94,0.15),rgba(0,0,0,0)),linear-gradient(180deg,#0b1220 0%,#0f172a 40%,#0b1220 100%);min-height:100vh}
.layout{display:flex;gap:18px;min-height:calc(100vh - 48px)}
.sidebar{width:92px;flex:0 0 92px;background:rgba(10,16,30,0.92);border:1px solid rgba(148,163,184,0.12);border-radius:0;box-shadow:0 20px 50px rgba(2,6,23,0.45);padding:10px 8px;position:sticky;top:0;align-self:flex-start;height:100vh;display:flex;flex-direction:column;gap:14px;z-index:1;margin-top:-24px}
.sidebar-footer{margin-top:auto}
.sidebar-top{display:flex;justify-content:center;padding:6px 0 2px}
.sidebar-top-icon{width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:12px;letter-spacing:0.3px}
.main{flex:1;min-width:0;position:relative;z-index:2}
.sidebar-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:66px;padding:8px 4px;border-radius:16px;border:1px solid rgba(148,163,184,0.16);background:rgba(12,18,34,0.7);color:#e2e8f0;text-decoration:none;text-align:center;transition:all 0.2s;box-shadow:0 10px 22px rgba(2,6,23,0.35)}
.sidebar-icon{width:28px;height:28px;border-radius:10px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);display:flex;align-items:center;justify-content:center}
.sidebar-icon svg{width:16px;height:16px;stroke:#7dd3fc;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sidebar-text{font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:#cbd5f5;line-height:1.2}
.sidebar-link:hover{border-color:rgba(56,189,248,0.55);background:rgba(15,23,42,0.85)}
.sidebar-link:hover .sidebar-icon{background:rgba(56,189,248,0.18);border-color:rgba(56,189,248,0.55)}
.sidebar-link:hover .sidebar-text{color:#fff}
.sidebar-link.logout .sidebar-icon{background:rgba(239,68,68,0.16);border-color:rgba(239,68,68,0.5)}
.sidebar-link.logout .sidebar-icon svg{stroke:#fca5a5}
.sidebar-link.logout:hover .sidebar-icon{background:rgba(239,68,68,0.22);border-color:rgba(239,68,68,0.7)}
.main{flex:1;min-width:0}
.container{width:100%;max-width:none;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:26px 26px 30px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
@media (max-width: 900px){
  .layout{flex-direction:column}
  .sidebar{width:100%;height:auto;position:relative;top:auto}
}
.header-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.8)}
.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:14px}
.brand-title{font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase}
.brand-subtitle{font-size:11px;color:#94a3b8;letter-spacing:0.4px;text-transform:uppercase}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.api-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase}
.api-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.api-btn.primary{background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.7);color:#86efac;box-shadow:0 8px 18px rgba(34,197,94,0.22)}
.api-btn.primary:hover{border-color:#22c55e;color:#eafff3;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
.api-btn.secondary{background:rgba(56,189,248,0.15);border-color:rgba(56,189,248,0.65);color:#bae6fd;box-shadow:0 8px 18px rgba(56,189,248,0.22)}
.api-btn.secondary:hover{border-color:#38bdf8;color:#e2f2ff;box-shadow:0 12px 26px rgba(56,189,248,0.35)}
.api-btn.danger{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.55);color:#fca5a5;box-shadow:0 8px 18px rgba(239,68,68,0.2)}
.api-btn.danger:hover{border-color:#ef4444;color:#fee2e2;box-shadow:0 12px 26px rgba(239,68,68,0.35)}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:16px}
.section-title{margin:0 0 12px;font-size:14px;font-weight:700;color:#f8fafc;letter-spacing:0.3px}
.section-note{color:#cbd5f5;font-size:12px;line-height:1.6;margin:0}
.cash-form-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.cash-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
.cash-input{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0}
.cash-input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
.actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.table-wrapper{overflow-x:auto;border-radius:14px;border:1px solid rgba(148,163,184,0.18);box-shadow:0 14px 30px rgba(0,0,0,0.35)}
.cash-table{width:100%;border-collapse:collapse}
.cash-table th{background:#0b1220;color:#e2e8f0;font-size:11px;text-align:left;padding:10px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:10;letter-spacing:0.4px;text-transform:uppercase}
.cash-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,0.15);font-size:12px;color:#e2e8f0}
.cash-table tbody tr{transition:all 0.15s}
.cash-table tbody tr:hover{background:rgba(56,189,248,0.08)}
.product-img{width:70px;height:70px;object-fit:cover;border-radius:10px;border:1px solid rgba(148,163,184,0.25);box-shadow:0 6px 16px rgba(0,0,0,0.25);background:#0b1220}
.photo-cell{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:70px;min-height:70px}
.photo-placeholder{display:none;width:70px;height:70px;border-radius:10px;border:1px dashed rgba(148,163,184,0.3);display:flex;align-items:center;justify-content:center;font-size:10px;color:#94a3b8;background:rgba(15,23,42,0.6)}
.photo-cell.no-photo .product-img{display:none}
.photo-cell.no-photo .photo-placeholder{display:flex}
.photo-preview{display:none;position:absolute;left:calc(100% + 12px);top:50%;transform:translateY(-50%);padding:8px;background:#0f172a;border:1px solid rgba(148,163,184,0.2);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,0.45);z-index:50}
.photo-preview img{width:220px;height:220px;object-fit:cover;border-radius:12px;border:1px solid rgba(148,163,184,0.25)}
.photo-cell.has-photo:hover .photo-preview{display:block}
.status-ok{color:#86efac;font-weight:800}
.status-error{color:#fca5a5;font-weight:800}
.badge{display:inline-block;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800;margin:2px;letter-spacing:0.3px;text-transform:uppercase}
.badge-primary{background:rgba(59,130,246,0.18);color:#93c5fd;border:1px solid rgba(59,130,246,0.35)}
.badge-success{background:rgba(34,197,94,0.18);color:#86efac;border:1px solid rgba(34,197,94,0.35)}
.badge-warning{background:rgba(245,158,11,0.18);color:#fcd34d;border:1px solid rgba(245,158,11,0.35)}
</style></head><body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="sidebar-top-icon">WB</div>
    </div>
    <a class="sidebar-link" href="/">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
      </span>
      <span class="sidebar-text">Главная</span>
    </a>
    <a class="sidebar-link" href="/fin-report">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16" /><path d="M7 16v-6" /><path d="M12 16V8" /><path d="M17 16v-3" /></svg>
      </span>
      <span class="sidebar-text">Финансовый отчет</span>
    </a>
    <a class="sidebar-link" href="/products">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
      </span>
      <span class="sidebar-text">Анализ товаров</span>
    </a>
    <a class="sidebar-link" href="/stocks">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></svg>
      </span>
      <span class="sidebar-text">Управление остатками</span>
    </a>
    <div class="sidebar-footer">
      <a class="sidebar-link logout" href="/api/logout" onclick="localStorage.removeItem('authToken')">
        <span class="sidebar-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M13 4H5v16h8" /></svg>
        </span>
        <span class="sidebar-text">Выход</span>
      </a>
    </div>
  </aside>
  <main class="main">
    <div class="container">
<div class="header-bar">
  <div class="brand"></div>
  <div class="toolbar"></div>
</div>
<div class="section">
  <h2 class="section-title">Максимальная версия</h2>
  <p class="section-note">Получайте все доступные данные о товаре — цену, остатки, рейтинг, отзывы, изображения, склады и информацию о пункте выдачи (dest).</p>
</div>
<div class="section">
  <h2 class="section-title">Параметры запроса</h2>
  <div class="cash-form-row">
    <div>
      <label class="cash-label" for="nm">Артикул WB</label>
      <input id="nm" class="cash-input" type="text" placeholder="например 272673889" />
    </div>
    <div>
      <label class="cash-label" for="domain">Домен</label>
      <select id="domain" class="cash-input">
        <option value="ru">wildberries.ru (RUB)</option>
        <option value="kg">wildberries.kg (KGS)</option>
        <option value="kz">wildberries.kz (KZT)</option>
      </select>
    </div>
    <div>
      <label class="cash-label" for="dest">Пункт выдачи (dest)</label>
      <select id="dest" class="cash-input">
        <option value="">Авто (перебор)</option>
        <option value="-1257786">-1257786 (Москва)</option>
        <option value="-1029256">-1029256 (СПб)</option>
        <option value="-1059509">-1059509 (Казань)</option>
        <option value="-59208">-59208 (Екатеринбург)</option>
        <option value="-364763">-364763 (Новосибирск)</option>
      </select>
    </div>
  </div>
  <div class="actions-row">
    <button id="fetch" class="api-btn primary">📊 Получить данные</button>
    <button id="open" class="api-btn secondary">🔗 Открыть товар</button>
    <button id="clear" class="api-btn danger">🗑️ Очистить таблицу</button>
  </div>
</div>
<div class="section">
  <h2 class="section-title">Результаты</h2>
  <div class="table-wrapper">
    <table id="dataTable" class="cash-table">
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
</div>
  </main>
</div>
<script>
// Функция для чтения cookie
function getCookie(name) {
  const value = '; ' + document.cookie;
  const parts = value.split('; ' + name + '=');
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Синхронизация токена из cookie в localStorage
function syncAuthToken() {
  const cookieToken = getCookie('authToken');
  const localToken = localStorage.getItem('authToken');
  
  if (cookieToken && cookieToken !== localToken) {
    localStorage.setItem('authToken', cookieToken);
    return cookieToken;
  } else if (localToken) {
    return localToken;
  }
  return null;
}

window.addEventListener('DOMContentLoaded', function(){
  // Синхронизируем токен из cookie в localStorage
  var token = syncAuthToken();
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

  window.handleImageLoad = function(img){
    var wrap = img.closest('.photo-cell');
    if (wrap) {
      wrap.classList.remove('no-photo');
      wrap.classList.add('has-photo');
    }
  };

  window.handleImageError = function(img){
    var wrap = img.closest('.photo-cell');
    if (wrap) {
      wrap.classList.remove('has-photo');
      wrap.classList.add('no-photo');
    }
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
      if(data.source.indexOf('v4') >= 0) srcName = 'API v4';
      else if(data.source.indexOf('v2') >= 0) srcName = 'API v2';
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
    
    var mainImage = '<div class="photo-cell no-photo"><div class="photo-placeholder">Нет фото</div></div>';
    if(data.mainImage){
      var imgHtml = '<div class="photo-cell">' +
        '<img src="'+data.mainImage+'" class="product-img" alt="Фото" crossorigin="anonymous" onload="handleImageLoad(this)" onerror="handleImageError(this)" />' +
        '<div class="photo-preview"><img src="'+data.mainImage+'" alt="Фото" onload="handleImageLoad(this)" onerror="handleImageError(this)" /></div>' +
        '<div class="photo-placeholder">Нет фото</div>' +
      '</div>';
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
    const cardUrl = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&nm=${id}`;
    const resp = await axios.get(cardUrl, {
      headers: {
        'User-Agent': 'WildberriesApp/1.0',
        'Accept': 'application/json'
      },
      timeout: 8000
    });
    
    const products = resp?.data?.products || resp?.data?.data?.products || [];
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

// Страница движения денег (ДДС)
app.get('/', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper - Движение денег</title>
<style>
*{box-sizing:border-box}
html{overflow-y:scroll}
*{scrollbar-width:thin;scrollbar-color:rgba(56,189,248,0.45) rgba(15,23,42,0.55)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.45);border-radius:10px;border:2px solid rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,0.7)}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;margin:0;padding:24px 24px 24px 0;color:#e2e8f0;background:#0b1220;background-image:radial-gradient(1200px 600px at 10% -10%,rgba(56,189,248,0.25),rgba(0,0,0,0)),radial-gradient(900px 500px at 90% 0%,rgba(34,197,94,0.15),rgba(0,0,0,0)),linear-gradient(180deg,#0b1220 0%,#0f172a 40%,#0b1220 100%);min-height:100vh}
.layout{display:flex;gap:18px;min-height:calc(100vh - 48px)}
.sidebar{width:92px;flex:0 0 92px;background:rgba(10,16,30,0.92);border:1px solid rgba(148,163,184,0.12);border-radius:0;box-shadow:0 20px 50px rgba(2,6,23,0.45);padding:10px 8px;position:sticky;top:0;align-self:flex-start;height:100vh;display:flex;flex-direction:column;gap:14px;z-index:1;margin-top:-24px}
.sidebar-footer{margin-top:auto}
.sidebar-top{display:flex;justify-content:center;padding:6px 0 2px}
.sidebar-top-icon{width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:12px;letter-spacing:0.3px}
.main{flex:1;min-width:0;position:relative;z-index:2}
.sidebar-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:66px;padding:8px 4px;border-radius:16px;border:1px solid rgba(148,163,184,0.16);background:rgba(12,18,34,0.7);color:#e2e8f0;text-decoration:none;text-align:center;transition:all 0.2s;box-shadow:0 10px 22px rgba(2,6,23,0.35)}
.sidebar-icon{width:28px;height:28px;border-radius:10px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);display:flex;align-items:center;justify-content:center}
.sidebar-icon svg{width:16px;height:16px;stroke:#7dd3fc;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sidebar-text{font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:#cbd5f5;line-height:1.2}
.sidebar-link:hover{border-color:rgba(56,189,248,0.55);background:rgba(15,23,42,0.85)}
.sidebar-link:hover .sidebar-icon{background:rgba(56,189,248,0.18);border-color:rgba(56,189,248,0.55)}
.sidebar-link:hover .sidebar-text{color:#fff}
.sidebar-link.logout .sidebar-icon{background:rgba(239,68,68,0.16);border-color:rgba(239,68,68,0.5)}
.sidebar-link.logout .sidebar-icon svg{stroke:#fca5a5}
.sidebar-link.logout:hover .sidebar-icon{background:rgba(239,68,68,0.22);border-color:rgba(239,68,68,0.7)}
.main{flex:1;min-width:0}
.container{width:100%;max-width:none;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:26px 26px 30px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
@media (max-width: 900px){
  .layout{flex-direction:column}
  .sidebar{width:100%;height:auto;position:relative;top:auto}
}
.header-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.8)}
.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:14px}
.brand-title{font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase}
.brand-subtitle{font-size:11px;color:#94a3b8;letter-spacing:0.4px;text-transform:uppercase}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.api-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase}
.api-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.api-btn.primary{background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.7);color:#86efac;box-shadow:0 8px 18px rgba(34,197,94,0.22)}
.api-btn.primary:hover{border-color:#22c55e;color:#eafff3;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
.api-btn.secondary{background:rgba(56,189,248,0.15);border-color:rgba(56,189,248,0.65);color:#bae6fd;box-shadow:0 8px 18px rgba(56,189,248,0.22)}
.api-btn.secondary:hover{border-color:#38bdf8;color:#e2f2ff;box-shadow:0 12px 26px rgba(56,189,248,0.35)}
.api-btn.secondary{background:rgba(56,189,248,0.15);border-color:rgba(56,189,248,0.65);color:#bae6fd;box-shadow:0 8px 18px rgba(56,189,248,0.22)}
.api-btn.secondary:hover{border-color:#38bdf8;color:#e2f2ff;box-shadow:0 12px 26px rgba(56,189,248,0.35)}
.api-btn.create-op{white-space:nowrap;min-width:160px;justify-content:center}
.filter-btn{appearance:none;-webkit-appearance:none;-moz-appearance:none;display:inline-flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(56,189,248,0.08);color:#c7d2fe;border:1px solid rgba(56,189,248,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:box-shadow 0.2s,border-color 0.2s,color 0.2s;background-color 0.2s;letter-spacing:0.4px;text-transform:uppercase;box-shadow:0 6px 14px rgba(56,189,248,0.15)}
.filter-btn:hover{border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.25);background:rgba(56,189,248,0.14);color:#e2e8f0}
.filter-btn:focus{outline:none;border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.25)}
.filter-btn option{background:#0f172a;color:#e2e8f0}
.filter-btn:disabled{opacity:0.6;cursor:not-allowed}
.selected-count{min-width:14ch;display:inline-block}
.filter-menu{position:relative;display:inline-flex}
.filter-dropdown{position:absolute;top:calc(100% + 6px);left:0;min-width:190px;background:#0f172a;border:1px solid rgba(148,163,184,0.25);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.4);padding:6px;z-index:30;display:none}
.filter-dropdown.open{display:block}
.filter-item{padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#e2e8f0;cursor:pointer;transition:background 0.2s,color 0.2s}
.filter-item:hover{background:rgba(56,189,248,0.15);color:#fff}
.filter-item.active{background:rgba(34,197,94,0.18);color:#86efac}
.filter-menu{position:relative;display:inline-flex}
.filter-dropdown{position:absolute;top:calc(100% + 6px);left:0;min-width:190px;background:#0f172a;border:1px solid rgba(148,163,184,0.25);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.4);padding:6px;z-index:30;display:none}
.filter-dropdown.open{display:block}
.filter-item{padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#e2e8f0;cursor:pointer;transition:background 0.2s,color 0.2s}
.filter-item:hover{background:rgba(56,189,248,0.15);color:#fff}
.filter-item.active{background:rgba(34,197,94,0.18);color:#86efac}
.selected-count{min-width:14ch;display:inline-block}
.filter-btn{appearance:none;-webkit-appearance:none;-moz-appearance:none;display:inline-flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(56,189,248,0.08);color:#c7d2fe;border:1px solid rgba(56,189,248,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:box-shadow 0.2s,border-color 0.2s,color 0.2s;background-color 0.2s;letter-spacing:0.4px;text-transform:uppercase;box-shadow:0 6px 14px rgba(56,189,248,0.15)}
.filter-btn:hover{border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.25);background:rgba(56,189,248,0.14);color:#e2e8f0}
.filter-btn:focus{outline:none;border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.25)}
.filter-btn option{background:#0f172a;color:#e2e8f0}
.filter-btn:disabled{opacity:0.6;cursor:not-allowed}
.api-btn.create-op{white-space:nowrap;min-width:160px;justify-content:center}
.api-btn.primary{background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.7);color:#86efac;box-shadow:0 8px 18px rgba(34,197,94,0.22)}
.api-btn.primary:hover{border-color:#22c55e;color:#eafff3;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:16px}
.cash-tabs{display:flex;gap:8px;margin-bottom:14px}
.cash-tab-btn{padding:8px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.85);color:#e2e8f0;font-weight:700;font-size:12px;cursor:pointer;letter-spacing:0.3px;text-transform:uppercase;transition:all 0.2s}
.cash-tab-btn.active{background:#38bdf8;color:#0b1220;border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.cash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.stat-card{background:#0b1220;border:1px solid rgba(148,163,184,0.2);border-radius:14px;padding:16px 16px 18px;box-shadow:0 14px 32px rgba(0,0,0,0.35);position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;left:0;top:0;right:0;height:3px;background:var(--accent)}
.stat-label{font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:8px}
.stat-value{font-size:24px;font-weight:700;letter-spacing:-0.3px;color:#f8fafc}
.stat-hint{font-size:11px;color:#94a3b8;margin-top:6px}
.cash-form{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:14px;padding:14px;margin-bottom:14px}
.cash-form-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.cash-form-row.two-col{grid-template-columns:repeat(2,minmax(260px,1fr))}
.cash-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
.cash-input{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0}
.cash-input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
input[type=number]::-webkit-outer-spin-button,
input[type=number]::-webkit-inner-spin-button{appearance:none;-webkit-appearance:none;margin:0}
input[type=number]{-moz-appearance:textfield}
.cash-action-btn{padding:10px 14px;border:none;border-radius:10px;background:#22c55e;color:#0b1220;font-weight:800;font-size:12px;cursor:pointer;letter-spacing:0.3px;text-transform:uppercase;box-shadow:0 10px 22px rgba(34,197,94,0.3);transition:all 0.2s}
.cash-action-btn:hover{transform:translateY(-2px);box-shadow:0 16px 30px rgba(34,197,94,0.4)}
.cash-table{width:100%;border-collapse:collapse}
.cash-table th{background:#0b1220;color:#e2e8f0;font-size:12px;text-align:left;padding:10px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:10}
.cash-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,0.15);font-size:12px;color:#e2e8f0}
.cash-pill{padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.cash-pill.income{background:rgba(34,197,94,0.2);color:#86efac;border:1px solid rgba(34,197,94,0.35)}
.cash-pill.expense{background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.35)}
.cash-pill.receivable{background:rgba(34,197,94,0.18);color:#22c55e;border:1px solid #22c55e}
.cash-pill.payable{background:rgba(239,68,68,0.18);color:#ef4444;border:1px solid #ef4444}
.debt-progress-bar{box-sizing:border-box}
.cash-muted{color:#94a3b8;font-size:12px}
.cash-sub-tabs{display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid rgba(148,163,184,0.15)}
.cash-sub-tab{background:none;border:none;padding:12px 20px;cursor:pointer;font-size:14px;font-weight:600;color:#94a3b8;border-bottom:3px solid transparent;transition:all 0.2s}
.cash-sub-tab:hover{color:#e2e8f0;background:rgba(56,189,248,0.1)}
.cash-sub-tab.active{color:#38bdf8;border-bottom-color:#38bdf8}
.range-btn{display:flex;gap:8px;align-items:center;background:rgba(15,23,42,0.85);padding:10px 14px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;color:#e2e8f0;transition:all 0.2s;letter-spacing:0.3px;text-transform:uppercase}
.range-btn:hover{border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.2);transform:translateY(-2px)}
.range-value{color:#93c5fd;font-weight:700}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(6px);z-index:1000;align-items:center;justify-content:center;padding:24px;overflow:auto}
.modal.active{display:flex}
.modal-content{background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.2);border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,0.5);max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow:auto;margin:0 auto}
.modal-header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid rgba(148,163,184,0.2)}
.modal-header h2{margin:0;font-size:18px;font-weight:700;color:#f8fafc}
.modal-header.centered{justify-content:center;position:relative}
.modal-header.centered .close-btn{position:absolute;right:0;top:0}
.modal-footer{display:flex;justify-content:center;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(148,163,184,0.2)}
.cash-modal .modal-content{max-width:1100px}
.cash-modal .cash-form-row{grid-template-columns:repeat(2,minmax(260px,1fr))}
.close-btn{background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:all 0.2s}
.close-btn:hover{border-color:#38bdf8;color:#fff}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="sidebar-top-icon">WB</div>
    </div>
    <a class="sidebar-link" href="/">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
      </span>
      <span class="sidebar-text">Главная</span>
    </a>
    <a class="sidebar-link" href="/fin-report">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16" /><path d="M7 16v-6" /><path d="M12 16V8" /><path d="M17 16v-3" /></svg>
      </span>
      <span class="sidebar-text">Финансовый отчет</span>
    </a>
    <a class="sidebar-link" href="/products">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
      </span>
      <span class="sidebar-text">Анализ товаров</span>
    </a>
    <a class="sidebar-link" href="/stocks">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></svg>
      </span>
      <span class="sidebar-text">Управление остатками</span>
    </a>
    <div class="sidebar-footer">
      <a class="sidebar-link logout" href="/api/logout" onclick="localStorage.removeItem('authToken')">
        <span class="sidebar-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M13 4H5v16h8" /></svg>
        </span>
        <span class="sidebar-text">Выход</span>
      </a>
    </div>
  </aside>
  <main class="main">
    <div class="container">
  <div class="header-bar">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div class="brand"></div>
    </div>
    <div class="toolbar">
      <button id="cashDateRangeBtn" onclick="openCashDateRangePicker()" class="range-btn">
        <span style="font-size:16px">📅</span>
        <span>Период:</span>
        <span id="cashDateRangeDisplay" class="range-value">—</span>
      </button>
    </div>
  </div>

  <input type="date" id="cashDateFrom" style="display:none" />
  <input type="date" id="cashDateTo" style="display:none" />

  <div class="section">
    <div class="cash-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
      <div class="stat-card" style="--accent:#38bdf8">
        <div class="stat-label">💵 Касса</div>
        <div id="cashBalanceTotal" class="stat-value">—</div>
        <div class="stat-hint">Что реально в кармане</div>
      </div>
      <div class="stat-card" style="--accent:#22c55e">
        <div class="stat-label">🔄 Нам должны</div>
        <div id="cashReceivableTotal" class="stat-value">—</div>
        <div class="stat-hint">Дебиторская задолженность</div>
      </div>
      <div class="stat-card" style="--accent:#f97316">
        <div class="stat-label">🔄 Мы должны</div>
        <div id="cashPayableTotal" class="stat-value">—</div>
        <div class="stat-hint">Кредиторская задолженность</div>
      </div>
      <div class="stat-card" style="--accent:#8b5cf6">
        <div class="stat-label">💼 Чистый баланс</div>
        <div id="cashNetBalanceTotal" class="stat-value">—</div>
        <div class="stat-hint">С учётом долгов</div>
      </div>
    </div>
  </div>

  <div class="cash-tabs">
    <button id="cashTabTransactions" class="cash-tab-btn active" onclick="switchCashTab('transactions')">Движение</button>
    <button id="cashTabDebts" class="cash-tab-btn" onclick="switchCashTab('debts')">Долги</button>
    <button id="cashTabStocks" class="cash-tab-btn" onclick="switchCashTab('stocks')">Запасы</button>
  </div>

  <div id="cashflowTransactionsTab">
    <div class="cash-sub-tabs" style="margin-top:8px">
      <button class="cash-sub-tab cash-tx-sub-tab active" onclick="switchCashTxSubTab('all')">Все</button>
      <button class="cash-sub-tab cash-tx-sub-tab" onclick="switchCashTxSubTab('income')">Приходы</button>
      <button class="cash-sub-tab cash-tx-sub-tab" onclick="switchCashTxSubTab('expense')">Расходы</button>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="cash-muted selected-count" style="font-size:12px">Выбрано: <span id="cashTxSelectedCount">0</span></div>
        <button class="api-btn primary create-op" style="padding:6px 10px" onclick="openCashTransactionModal()">Создать операцию</button>
      </div>
      <button id="cashTxBulkDeleteBtn" class="api-btn" style="padding:6px 10px" onclick="deleteSelectedCashTransactions()" disabled>Удалить выбранные</button>
    </div>
    <div style="max-height:50vh;overflow:auto">
      <table class="cash-table">
        <thead>
          <tr>
            <th style="width:32px;text-align:center"><input type="checkbox" id="cashTxSelectAll" onclick="toggleAllCashTxCheckboxes(this)" /></th>
            <th>Дата операции</th>
            <th>Тип</th>
            <th>Сумма</th>
            <th>Категория</th>
            <th>Магазин</th>
            <th>Контрагент</th>
            <th>Комментарий</th>
            <th>Создана</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="cashTransactionsBody">
          <tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div id="cashflowDebtsTab" style="display:none">
    <!-- Подвкладки -->
    <div class="cash-sub-tabs">
      <button class="cash-sub-tab cash-debt-sub-tab active" onclick="switchDebtSubTab('summary')">Список контрагентов</button>
      <button class="cash-sub-tab cash-debt-sub-tab" onclick="switchDebtSubTab('operations')">Записи</button>
    </div>

    <!-- Вкладка: Сводка долгов -->
    <div id="debtSummaryTab" style="display:block">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="cash-muted selected-count" style="font-size:12px">Выбрано: <span id="debtSummarySelectedCount">0</span></div>
          <button class="api-btn primary create-op" style="padding:6px 10px" onclick="openCashDebtModal()">Создать операцию</button>
        </div>
        <button id="debtSummaryBulkDeleteBtn" class="api-btn" style="padding:6px 10px" onclick="deleteSelectedDebtSummaries()" disabled>Удалить выбранные</button>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th style="width:32px;text-align:center"><input type="checkbox" id="debtSummarySelectAll" onclick="toggleAllDebtSummaryCheckboxes(this)" /></th>
              <th>Контрагент</th>
              <th>Тип</th>
              <th style="min-width:80px;text-align:center">Прогресс</th>
              <th>Всего</th>
              <th>Оплачено</th>
              <th>Остаток</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="debtSummaryBody">
            <tr><td colspan="9" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Вкладка: Записи долгов -->
    <div id="debtOperationsTab" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="cash-muted selected-count" style="font-size:12px">Выбрано: <span id="cashDebtSelectedCount">0</span></div>
          <button class="api-btn primary create-op" style="padding:6px 10px" onclick="openCashDebtModal()">Создать операцию</button>
          <div class="filter-menu">
            <button id="cashDebtOperationFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtOperationMenu(event)">Все операции</button>
            <div id="cashDebtOperationMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all" onclick="setDebtOperationFilter('all')">Все операции</div>
              <div class="filter-item" data-value="increase" onclick="setDebtOperationFilter('increase')">Начисления</div>
              <div class="filter-item" data-value="decrease" onclick="setDebtOperationFilter('decrease')">Погашения</div>
            </div>
          </div>
          <div class="filter-menu">
            <button id="cashDebtTypeFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtTypeMenu(event)">Все типы</button>
            <div id="cashDebtTypeMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all" onclick="setDebtTypeFilter('all')">Все типы</div>
              <div class="filter-item" data-value="receivable" onclick="setDebtTypeFilter('receivable')">Нам должны</div>
              <div class="filter-item" data-value="payable" onclick="setDebtTypeFilter('payable')">Мы должны</div>
            </div>
          </div>
        </div>
        <button id="cashDebtBulkDeleteBtn" class="api-btn" style="padding:6px 10px" onclick="deleteSelectedCashDebts()" disabled>Удалить выбранные</button>
      </div>
      <div style="max-height:50vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th style="width:32px;text-align:center"><input type="checkbox" id="cashDebtSelectAll" onclick="toggleAllDebtCheckboxes(this)" /></th>
              <th>Дата операции</th>
              <th>Тип</th>
              <th>Операция</th>
              <th>Сумма</th>
              <th>Контрагент</th>
              <th>Срок</th>
              <th>Магазин</th>
              <th>Комментарий</th>
              <th style="text-align:right">Действия</th>
            </tr>
          </thead>
          <tbody id="cashDebtsBody">
            <tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="cashflowStocksTab" style="display:none">
    <div class="cash-sub-tabs" style="margin-top:8px;flex-wrap:wrap;row-gap:6px">
      <button class="cash-sub-tab cash-stock-sub-tab active" data-tab="api" onclick="switchCashStockSubTab('api')">По API ключам</button>
      <button class="cash-sub-tab cash-stock-sub-tab" data-tab="local" onclick="switchCashStockSubTab('local')">У себя на складе</button>
      <button class="cash-sub-tab cash-stock-sub-tab" data-tab="production" onclick="switchCashStockSubTab('production')">В производстве</button>
      <button class="cash-sub-tab cash-stock-sub-tab" data-tab="procurement" onclick="switchCashStockSubTab('procurement')">Закупки</button>
      <button class="cash-sub-tab cash-stock-sub-tab" data-tab="logistics" onclick="switchCashStockSubTab('logistics')">В логистике</button>
      <button class="cash-sub-tab cash-stock-sub-tab" data-tab="outsourcing" onclick="switchCashStockSubTab('outsourcing')">Аутсорс услуги</button>
    </div>

    <div id="cashStocksApiTab">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="cash-muted selected-count" style="font-size:12px">Позиции: <span id="cashStocksCount">0</span></div>
          <button class="api-btn primary" style="padding:6px 10px" onclick="openCostModal()">💰 Себестоимость</button>
          <div class="filter-menu">
            <button id="cashStocksBusinessBtn" class="api-btn secondary" style="padding:6px 10px" onclick="toggleStocksBusinessMenu(event)">Все магазины</button>
            <div id="cashStocksBusinessMenu" class="filter-dropdown" onclick="event.stopPropagation()"></div>
          </div>
          <button id="cashStocksRefreshBtn" class="api-btn" style="padding:6px 10px" onclick="loadStocksData()">Обновить</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Магазин</th>
              <th>Бренд</th>
              <th>Предмет</th>
              <th>Артикул WB</th>
              <th style="text-align:right">На складе</th>
              <th style="text-align:right">В пути к клиенту</th>
              <th style="text-align:right">В пути от клиента</th>
              <th style="text-align:right">Итого</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody id="cashStocksBody">
            <tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div id="cashStocksLocalTab" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="cash-muted selected-count" style="font-size:12px">Позиции: <span id="cashStocksLocalCount">0</span></div>
          <button class="api-btn primary" style="padding:6px 10px" onclick="openCostModal()">💰 Себестоимость</button>
          <button class="api-btn" style="padding:6px 10px" disabled>Добавить позицию</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Артикул WB</th>
              <th style="text-align:right">Количество</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5" class="cash-muted" style="text-align:center;padding:16px">Раздел в разработке</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div id="cashStocksProductionTab" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="cash-muted selected-count" style="font-size:12px">Позиции: <span id="cashStocksProductionCount">0</span></div>
          <button class="api-btn primary" style="padding:6px 10px" onclick="openCostModal()">💰 Себестоимость</button>
          <button class="api-btn" style="padding:6px 10px" disabled>Добавить позицию</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Комментарий</th>
              <th style="text-align:right">Количество</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5" class="cash-muted" style="text-align:center;padding:16px">Раздел в разработке</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div id="cashStocksProcurementTab" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="cash-muted selected-count" style="font-size:12px">Позиции: <span id="cashStocksProcurementCount">0</span></div>
          <button class="api-btn primary" style="padding:6px 10px" onclick="openCostModal()">💰 Себестоимость</button>
          <button class="api-btn" style="padding:6px 10px" disabled>Добавить позицию</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Комментарий</th>
              <th style="text-align:right">Количество</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5" class="cash-muted" style="text-align:center;padding:16px">Раздел в разработке</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div id="cashStocksLogisticsTab" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="cash-muted selected-count" style="font-size:12px">Позиции: <span id="cashStocksLogisticsCount">0</span></div>
          <button class="api-btn primary" style="padding:6px 10px" onclick="openCostModal()">💰 Себестоимость</button>
          <button class="api-btn" style="padding:6px 10px" disabled>Добавить позицию</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Комментарий</th>
              <th style="text-align:right">Количество</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5" class="cash-muted" style="text-align:center;padding:16px">Раздел в разработке</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div id="cashStocksOutsourcingTab" style="display:none">
      <div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="cash-muted selected-count" style="font-size:12px">Позиции: <span id="cashStocksOutsourcingCount">0</span></div>
          <button class="api-btn primary" style="padding:6px 10px" onclick="openCostModal()">💰 Себестоимость</button>
          <button class="api-btn" style="padding:6px 10px" disabled>Добавить позицию</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Наименование</th>
              <th>Комментарий</th>
              <th style="text-align:right">Количество</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="5" class="cash-muted" style="text-align:center;padding:16px">Раздел в разработке</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
    </div>
  </main>
</div>

<!-- Модалка: операции долга -->
<div id="debtOperationsModal" class="modal" onclick="closeDebtOperationsModal()">
  <div class="modal-content" style="max-width:1000px" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2 id="debtOperationsModalTitle">Операции долга</h2>
      <button class="close-btn" onclick="closeDebtOperationsModal()">&times;</button>
    </div>
    <div style="padding:16px">
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table">
          <thead>
            <tr>
              <th>Дата операции</th>
              <th>Тип</th>
              <th>Операция</th>
              <th>Сумма</th>
              <th>Контрагент</th>
              <th>Срок</th>
              <th>Магазин</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody id="debtOperationsModalBody">
            <tr><td colspan="8" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- Модалка: перерасчёт долгов -->
<div id="debtRecalcModal" class="modal" onclick="closeDebtRecalcModal()">
  <div class="modal-content" style="max-width:720px" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2>↔ Перерасчёт долгов</h2>
      <button class="close-btn" onclick="closeDebtRecalcModal()">&times;</button>
    </div>
    <div class="cash-form" style="margin-bottom:0">
      <div class="cash-form-row two-col">
        <div>
          <div class="cash-label">Контрагент</div>
          <div id="debtRecalcCounterparty" class="cash-input" style="display:flex;align-items:center">—</div>
        </div>
        <div>
          <div class="cash-label">Магазин</div>
          <div id="debtRecalcBusiness" class="cash-input" style="display:flex;align-items:center">—</div>
        </div>
        <div>
          <div class="cash-label">Нам должны</div>
          <div id="debtRecalcReceivable" class="cash-input" style="display:flex;align-items:center">—</div>
        </div>
        <div>
          <div class="cash-label">Мы должны</div>
          <div id="debtRecalcPayable" class="cash-input" style="display:flex;align-items:center">—</div>
        </div>
      </div>
      <div class="cash-form-row" style="margin-top:12px">
        <div>
          <div class="cash-label">Сумма перерасчёта</div>
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#cbd5f5">
            <input id="debtRecalcAuto" type="checkbox" onchange="toggleDebtRecalcAuto()" />
            Авто‑перерасчёт (максимум)
          </label>
          <input id="debtRecalcAmount" type="number" min="0" step="0.01" class="cash-input" placeholder="Автоматически" oninput="updateDebtRecalcPreview()" />
          <div class="cash-muted" style="margin-top:6px">Максимум: <span id="debtRecalcMax">—</span></div>
          <div class="cash-muted" style="margin-top:6px">После перерасчёта: нам должны — <span id="debtRecalcAfterReceivable">—</span>, мы должны — <span id="debtRecalcAfterPayable">—</span></div>
        </div>
        <div>
          <div class="cash-label">Дата</div>
          <input id="debtRecalcDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Комментарий</div>
          <input id="debtRecalcNote" type="text" class="cash-input" placeholder="Взаимозачёт" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="api-btn" onclick="closeDebtRecalcModal()">Отмена</button>
        <button class="cash-action-btn" onclick="submitDebtRecalc()">Перерасчитать</button>
      </div>
    </div>
  </div>
</div>

<!-- Модалка: создание операции движения -->
<div id="cashTransactionModal" class="modal cash-modal" onclick="closeCashTransactionModal()">
  <div class="modal-content" onclick="event.stopPropagation()">
    <div class="modal-header centered">
      <h2>➕ Новая операция</h2>
      <button class="close-btn" onclick="closeCashTransactionModal()">&times;</button>
    </div>
    <div class="cash-form" style="margin-bottom:0">
      <div class="cash-form-row">
        <div>
          <div class="cash-label">Дата</div>
          <input id="cashTxDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Тип</div>
          <select id="cashTxType" class="cash-input">
            <option value="income">Приход</option>
            <option value="expense">Расход</option>
          </select>
        </div>
        <div>
          <div class="cash-label">Сумма</div>
          <input id="cashTxAmount" type="number" min="0" step="0.01" class="cash-input" placeholder="0" />
        </div>
        <div>
          <div class="cash-label">Категория</div>
          <select id="cashTxCategory" class="cash-input" onchange="handleCashCategoryChange()"></select>
        </div>
        <div>
          <div class="cash-label">Магазин</div>
          <select id="cashTxBusiness" class="cash-input" onchange="handleCashBusinessChange('tx')"></select>
        </div>
        <div>
          <div class="cash-label">Контрагент</div>
          <select id="cashTxCounterparty" class="cash-input" onchange="handleCounterpartyChange('tx')"></select>
        </div>
        <div>
          <div class="cash-label">Комментарий</div>
          <input id="cashTxNote" type="text" class="cash-input" placeholder="Примечание" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="cash-action-btn" onclick="addCashTransaction()">Создать</button>
      </div>
    </div>
  </div>
</div>

<!-- Модалка: создание операции долга -->
<div id="cashDebtModal" class="modal cash-modal" onclick="closeCashDebtModal()">
  <div class="modal-content" onclick="event.stopPropagation()">
    <div class="modal-header centered">
      <h2>➕ Новая операция долга</h2>
      <button class="close-btn" onclick="closeCashDebtModal()">&times;</button>
    </div>
    <div class="cash-form" style="margin-bottom:0">
      <div class="cash-form-row">
        <div>
          <div class="cash-label">Дата</div>
          <input id="cashDebtDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Тип долга</div>
          <select id="cashDebtType" class="cash-input">
            <option value="receivable">Должен контрагент</option>
            <option value="payable">Должны контрагенту</option>
          </select>
        </div>
        <div>
          <div class="cash-label">Тип операции</div>
          <select id="cashDebtOperationType" class="cash-input">
            <option value="increase">Начисление</option>
            <option value="decrease">Погашение</option>
          </select>
        </div>
        <div>
          <div class="cash-label">Сумма</div>
          <input id="cashDebtAmount" type="number" min="0" step="0.01" class="cash-input" placeholder="0" />
        </div>
        <div>
          <div class="cash-label">Контрагент</div>
          <select id="cashDebtCounterparty" class="cash-input" onchange="handleCounterpartyChange('debt')"></select>
        </div>
        <div>
          <div class="cash-label">Срок</div>
          <input id="cashDebtDueDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Магазин (опционально)</div>
          <select id="cashDebtBusiness" class="cash-input" onchange="handleCashBusinessChange('debt')"></select>
        </div>
        <div>
          <div class="cash-label">Комментарий</div>
          <input id="cashDebtNote" type="text" class="cash-input" placeholder="Примечание" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="cash-action-btn" onclick="addCashDebt()">Создать</button>
      </div>
    </div>
  </div>
</div>

<!-- Модалка: редактирование операции ДДС -->
<div id="editCashTxModal" class="modal cash-modal" onclick="closeEditCashTransactionModal()">
  <div class="modal-content" onclick="event.stopPropagation()">
    <div class="modal-header centered">
      <h2>✏️ Редактирование операции</h2>
      <button class="close-btn" onclick="closeEditCashTransactionModal()">&times;</button>
    </div>
    <div class="cash-form" style="padding:16px 20px">
      <div class="cash-form-row">
        <div>
          <div class="cash-label">Дата</div>
          <input id="editCashTxDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Тип</div>
          <select id="editCashTxType" class="cash-input">
            <option value="income">Приход</option>
            <option value="expense">Расход</option>
          </select>
        </div>
        <div>
          <div class="cash-label">Сумма</div>
          <input id="editCashTxAmount" type="number" min="0" step="0.01" class="cash-input" placeholder="0" />
        </div>
        <div>
          <div class="cash-label">Категория</div>
          <select id="editCashTxCategory" class="cash-input" onchange="handleEditCashCategoryChange()"></select>
        </div>
        <div>
          <div class="cash-label">Магазин</div>
          <select id="editCashTxBusiness" class="cash-input" onchange="handleEditCashBusinessChange()"></select>
        </div>
        <div>
          <div class="cash-label">Контрагент</div>
          <select id="editCashTxCounterparty" class="cash-input" onchange="handleEditCashCounterpartyChange()"></select>
        </div>
        <div>
          <div class="cash-label">Комментарий</div>
          <input id="editCashTxNote" type="text" class="cash-input" placeholder="Примечание" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="api-btn" onclick="closeEditCashTransactionModal()">Отмена</button>
        <button class="cash-action-btn" onclick="saveEditCashTransaction()">Сохранить</button>
      </div>
    </div>
  </div>
</div>

<!-- Модалка: редактирование записи долга -->
<div id="editDebtModal" class="modal cash-modal" onclick="closeEditDebtModal()">
  <div class="modal-content" onclick="event.stopPropagation()">
    <div class="modal-header centered">
      <h2>✏️ Редактирование записи долга</h2>
      <button class="close-btn" onclick="closeEditDebtModal()">&times;</button>
    </div>
    <div class="cash-form" style="padding:16px 20px">
      <div class="cash-form-row">
        <div>
          <div class="cash-label">Дата</div>
          <input id="editDebtDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Тип долга</div>
          <select id="editDebtType" class="cash-input">
            <option value="receivable">Должен контрагент</option>
            <option value="payable">Должны контрагенту</option>
          </select>
        </div>
        <div>
          <div class="cash-label">Тип операции</div>
          <select id="editDebtOperationType" class="cash-input">
            <option value="increase">Начисление</option>
            <option value="decrease">Погашение</option>
          </select>
        </div>
        <div>
          <div class="cash-label">Сумма</div>
          <input id="editDebtAmount" type="number" min="0" step="0.01" class="cash-input" placeholder="0" />
        </div>
        <div>
          <div class="cash-label">Контрагент</div>
          <select id="editDebtCounterparty" class="cash-input" onchange="handleEditDebtCounterpartyChange()"></select>
        </div>
        <div>
          <div class="cash-label">Срок</div>
          <input id="editDebtDueDate" type="date" class="cash-input" />
        </div>
        <div>
          <div class="cash-label">Магазин (опционально)</div>
          <select id="editDebtBusiness" class="cash-input" onchange="handleEditDebtBusinessChange()"></select>
        </div>
        <div>
          <div class="cash-label">Комментарий</div>
          <input id="editDebtNote" type="text" class="cash-input" placeholder="Примечание" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="api-btn" onclick="closeEditDebtModal()">Отмена</button>
        <button class="cash-action-btn" onclick="saveEditDebt()">Сохранить</button>
      </div>
    </div>
  </div>
</div>

<!-- Модальное окно выбора периода для ДДС -->
<div id="cashDateRangeModal" class="modal" onclick="closeCashModalOnOutsideClick(event)">
  <div class="modal-content" style="max-width:900px;padding:0" onclick="event.stopPropagation()">
    <div class="modal-header" style="border-radius:12px 12px 0 0">
      <h2>📅 Выбор периода</h2>
      <button class="close-btn" onclick="closeCashDateRangeModal()">&times;</button>
    </div>
    <div style="display:flex;gap:16px;padding:20px">
      <div style="flex:1">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <button onclick="changeCashCalendarYear(-1)" style="background:#fff;border:2px solid #dfe6e9;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer">◀</button>
          <div id="cashCalendarYear" style="font-weight:700;font-size:16px;color:#2d3436"></div>
          <button onclick="changeCashCalendarYear(1)" style="background:#fff;border:2px solid #dfe6e9;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer">▶</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:8px">
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Пн</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Вт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Ср</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Чт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Пт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#fca5a5;padding:8px">Сб</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#fca5a5;padding:8px">Вс</div>
        </div>
        <div id="cashCalendarMonths" style="flex:1;overflow-y:auto;max-height:500px;overflow-x:hidden"></div>
      </div>
      <div style="width:280px;padding:20px;background:#f8f9fa;display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:13px;font-weight:600;color:#636e72;margin-bottom:4px">БЫСТРЫЙ ВЫБОР</div>
          <button onclick="selectCashQuickRange('week')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Неделя</button>
          <button onclick="selectCashQuickRange('month')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Месяц</button>
          <button onclick="selectCashQuickRange('quarter')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Квартал</button>
          <button onclick="selectCashQuickRange('year')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">📅 Год</button>
          <button onclick="selectCashQuickRange('all')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">♾️ За всё время</button>
        </div>
        <div style="border-top:1px solid #dfe6e9;padding-top:16px">
          <div style="font-size:13px;font-weight:600;color:#636e72;margin-bottom:8px">ВЫБРАННЫЙ ПЕРИОД</div>
          <div style="background:#fff;padding:12px;border-radius:8px;border:2px solid #dfe6e9;margin-bottom:8px">
            <div style="font-size:12px;color:#636e72;margin-bottom:4px">Начало периода</div>
            <div id="cashSelectedStartDate" style="font-weight:700;color:#2d3436;font-size:14px">Не выбрано</div>
          </div>
          <div style="background:#fff;padding:12px;border-radius:8px;border:2px solid #dfe6e9">
            <div style="font-size:12px;color:#636e72;margin-bottom:4px">Конец периода</div>
            <div id="cashSelectedEndDate" style="font-weight:700;color:#2d3436;font-size:14px">Не выбрано</div>
          </div>
        </div>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px">
          <button onclick="resetCashDateRange()" style="padding:12px 24px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s">Сбросить</button>
          <button onclick="applyCashDateRange()" style="padding:12px 24px;background:#6c5ce7;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;transition:all 0.2s">Применить</button>
        </div>
      </div>
    </div>
    <input type="date" id="cashDateFromPicker" style="display:none" />
    <input type="date" id="cashDateToPicker" style="display:none" />
  </div>
</div>

<!-- Модальное окно подтверждения для ДДС -->
<div id="cashConfirmModal" class="modal" onclick="closeCashConfirmModal()">
  <div class="modal-content" style="max-width:460px" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2>Подтверждение</h2>
      <button class="close-btn" onclick="closeCashConfirmModal()">&times;</button>
    </div>
    <div id="cashConfirmText" style="font-size:14px;color:#e2e8f0;margin-bottom:18px">Подтвердите действие</div>
    <div style="display:flex;gap:12px;justify-content:flex-end">
      <button class="api-btn" onclick="closeCashConfirmModal()">Отмена</button>
      <button class="cash-action-btn" onclick="confirmCashAction()">Добавить</button>
    </div>
  </div>
</div>

<script>
let businesses = [];
let cashTransactions = [];
let cashDebts = [];
let debtSummaryIndex = {};
let currentDebtRecalc = null;
let counterparties = [];
let cashCategories = [];
let pendingBusinesses = [];
let pendingCounterparties = [];
let pendingCategories = [];
let cashConfirmCallback = null;
let cashCalendarYear = new Date().getFullYear();
let cashSelectedStartDate = null;
let cashSelectedEndDate = null;
let currentEditCashTxId = null;
let currentEditDebtId = null;
let cashStocksItems = [];
let cashStocksCosts = {};

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(amount);
}

function formatQty(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU').format(amount);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initCashRange() {
  const today = new Date();
  const dateTo = today.toISOString().slice(0, 10);
  const dateFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const savedFrom = localStorage.getItem('cashDateFrom');
  const savedTo = localStorage.getItem('cashDateTo');

  document.getElementById('cashDateFrom').value = savedFrom || dateFrom;
  document.getElementById('cashDateTo').value = savedTo || dateTo;
  document.getElementById('cashTxDate').value = dateTo;
  updateCashRangeDisplay();
}

function applyCashRange() {
  const dateFrom = document.getElementById('cashDateFrom').value;
  const dateTo = document.getElementById('cashDateTo').value;
  localStorage.setItem('cashDateFrom', dateFrom);
  localStorage.setItem('cashDateTo', dateTo);
  updateCashRangeDisplay();
  loadCashflowData();
}

function updateCashRangeDisplay() {
  const dateFrom = document.getElementById('cashDateFrom').value;
  const dateTo = document.getElementById('cashDateTo').value;
  if (!dateFrom || !dateTo) {
    document.getElementById('cashDateRangeDisplay').textContent = '—';
    return;
  }
  const formatDate = (value) => {
    const [y, m, d] = value.split('-');
    return d + '.' + m + '.' + y;
  };
  document.getElementById('cashDateRangeDisplay').textContent = formatDate(dateFrom) + ' — ' + formatDate(dateTo);
}

function openCashDateRangePicker() {
  const dateFrom = document.getElementById('cashDateFrom');
  const dateTo = document.getElementById('cashDateTo');

  if (dateFrom.value && dateTo.value) {
    cashSelectedStartDate = new Date(dateFrom.value);
    cashSelectedEndDate = new Date(dateTo.value);
    updateCashSelectedDatesDisplay();
  }

  cashCalendarYear = (cashSelectedEndDate || new Date()).getFullYear();
  renderCashCalendar();

  document.getElementById('cashDateRangeModal').classList.add('active');

  setTimeout(() => {
    const currentMonth = (cashSelectedEndDate || new Date()).getMonth();
    const monthElement = document.getElementById('cash-month-' + currentMonth);
    if (monthElement) {
      monthElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

function closeCashDateRangeModal() {
  document.getElementById('cashDateRangeModal').classList.remove('active');
}

function closeCashModalOnOutsideClick(event) {
  if (event.target && event.target.id === 'cashDateRangeModal') {
    closeCashDateRangeModal();
  }
}

function renderCashCalendar() {
  const year = cashCalendarYear;
  document.getElementById('cashCalendarYear').textContent = year;

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const monthsContainer = document.getElementById('cashCalendarMonths');
  monthsContainer.innerHTML = '';

  for (let month = 0; month < 12; month++) {
    const monthBlock = document.createElement('div');
    monthBlock.id = 'cash-month-' + month;
    monthBlock.style.cssText = 'margin-bottom:24px;scroll-margin-top:20px';

    const monthTitle = document.createElement('div');
    monthTitle.textContent = monthNames[month];
    monthTitle.style.cssText = 'font-weight:700;font-size:14px;color:#cbd5f5;margin-bottom:12px;text-align:center;letter-spacing:0.4px;text-transform:uppercase';
    monthBlock.appendChild(monthTitle);

    const daysGrid = document.createElement('div');
    daysGrid.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:4px';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    let startDayOfWeek = firstDay.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.style.padding = '10px';
      daysGrid.appendChild(emptyDay);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dayDate = new Date(year, month, day);
      const dayElement = document.createElement('div');
      dayElement.textContent = day;
      dayElement.style.cssText = 'padding:10px;text-align:center;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s;border:1px solid transparent;user-select:none';

      const isInRange = cashSelectedStartDate && cashSelectedEndDate &&
                        dayDate >= cashSelectedStartDate && dayDate <= cashSelectedEndDate;
      const isStart = cashSelectedStartDate && dayDate.toDateString() === cashSelectedStartDate.toDateString();
      const isEnd = cashSelectedEndDate && dayDate.toDateString() === cashSelectedEndDate.toDateString();
      const dayState = isStart || isEnd ? 'edge' : (isInRange ? 'range' : 'empty');
      dayElement.dataset.state = dayState;

      const applyBaseStyles = () => {
        if (dayState === 'edge') {
          dayElement.style.background = 'linear-gradient(135deg,#c7d2fe 0%,#bae6fd 100%)';
          dayElement.style.color = '#0b1220';
          dayElement.style.boxShadow = '0 10px 22px rgba(59,130,246,0.18)';
          dayElement.style.borderColor = 'rgba(147,197,253,0.7)';
        } else if (dayState === 'range') {
          dayElement.style.background = 'rgba(129,140,248,0.22)';
          dayElement.style.color = '#e0e7ff';
          dayElement.style.borderColor = 'rgba(129,140,248,0.35)';
          dayElement.style.boxShadow = 'inset 0 0 0 1px rgba(129,140,248,0.18)';
        } else {
          dayElement.style.background = 'rgba(15,23,42,0.9)';
          dayElement.style.color = '#e2e8f0';
          dayElement.style.boxShadow = 'inset 0 0 0 1px rgba(148,163,184,0.08)';
          dayElement.style.borderColor = 'rgba(148,163,184,0.12)';
        }
      };

      applyBaseStyles();

      dayElement.onmouseover = () => {
        if (dayState === 'edge') {
          dayElement.style.background = 'linear-gradient(135deg,#bae6fd 0%,#dbeafe 100%)';
          dayElement.style.borderColor = 'rgba(56,189,248,0.75)';
          dayElement.style.boxShadow = '0 12px 26px rgba(56,189,248,0.22)';
          dayElement.style.color = '#0b1220';
        } else if (dayState === 'range') {
          dayElement.style.background = 'rgba(56,189,248,0.18)';
          dayElement.style.borderColor = 'rgba(56,189,248,0.45)';
          dayElement.style.boxShadow = '0 8px 18px rgba(56,189,248,0.18)';
          dayElement.style.color = '#e0f2fe';
        } else {
          dayElement.style.background = 'rgba(56,189,248,0.16)';
          dayElement.style.borderColor = 'rgba(56,189,248,0.4)';
          dayElement.style.boxShadow = '0 6px 16px rgba(56,189,248,0.16)';
          dayElement.style.color = '#e0f2fe';
        }
      };
      dayElement.onmouseout = () => {
        applyBaseStyles();
      };

      dayElement.onclick = () => selectCashDate(dayDate);

      daysGrid.appendChild(dayElement);
    }

    monthBlock.appendChild(daysGrid);
    monthsContainer.appendChild(monthBlock);
  }
}

function selectCashDate(date) {
  if (!cashSelectedStartDate || (cashSelectedStartDate && cashSelectedEndDate)) {
    cashSelectedStartDate = date;
    cashSelectedEndDate = null;
  } else if (cashSelectedStartDate && !cashSelectedEndDate) {
    if (date < cashSelectedStartDate) {
      cashSelectedEndDate = cashSelectedStartDate;
      cashSelectedStartDate = date;
    } else {
      cashSelectedEndDate = date;
    }
  }

  updateCashSelectedDatesDisplay();
  renderCashCalendar();
}

function changeCashCalendarYear(offset) {
  cashCalendarYear += offset;
  renderCashCalendar();
}

function updateCashSelectedDatesDisplay() {
  const formatDate = (date) => {
    if (!date) return 'Не выбрано';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return day + '.' + month + '.' + year;
  };

  document.getElementById('cashSelectedStartDate').textContent = formatDate(cashSelectedStartDate);
  document.getElementById('cashSelectedEndDate').textContent = formatDate(cashSelectedEndDate);
}

function selectCashQuickRange(type) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  cashSelectedEndDate = new Date(today);

  switch(type) {
    case 'week':
      cashSelectedStartDate = new Date(today);
      cashSelectedStartDate.setDate(cashSelectedStartDate.getDate() - 7);
      break;
    case 'month':
      cashSelectedStartDate = new Date(today);
      cashSelectedStartDate.setDate(cashSelectedStartDate.getDate() - 30);
      break;
    case 'quarter':
      cashSelectedStartDate = new Date(today);
      cashSelectedStartDate.setDate(cashSelectedStartDate.getDate() - 90);
      break;
    case 'year':
      cashSelectedStartDate = new Date(today);
      cashSelectedStartDate.setDate(cashSelectedStartDate.getDate() - 365);
      break;
    case 'all':
      cashSelectedStartDate = new Date('2019-01-01');
      break;
  }

  updateCashSelectedDatesDisplay();
  renderCashCalendar();
}

function resetCashDateRange() {
  cashSelectedStartDate = null;
  cashSelectedEndDate = null;
  updateCashSelectedDatesDisplay();
  renderCashCalendar();
}

function applyCashDateRange() {
  if (!cashSelectedStartDate || !cashSelectedEndDate) {
    alert('⚠️ Пожалуйста, выберите обе даты');
    return;
  }

  const toISOString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  };

  document.getElementById('cashDateFrom').value = toISOString(cashSelectedStartDate);
  document.getElementById('cashDateTo').value = toISOString(cashSelectedEndDate);

  closeCashDateRangeModal();
  applyCashRange();
}

function switchCashTab(tab) {
  const transactionsTab = document.getElementById('cashflowTransactionsTab');
  const debtsTab = document.getElementById('cashflowDebtsTab');
  const stocksTab = document.getElementById('cashflowStocksTab');
  const btnTransactions = document.getElementById('cashTabTransactions');
  const btnDebts = document.getElementById('cashTabDebts');
  const btnStocks = document.getElementById('cashTabStocks');

  if (tab === 'debts') {
    transactionsTab.style.display = 'none';
    debtsTab.style.display = 'block';
    stocksTab.style.display = 'none';
    btnTransactions.classList.remove('active');
    btnDebts.classList.add('active');
    btnStocks.classList.remove('active');
    localStorage.setItem('cashActiveTab', 'debts');
  } else if (tab === 'stocks') {
    transactionsTab.style.display = 'none';
    debtsTab.style.display = 'none';
    stocksTab.style.display = 'block';
    btnTransactions.classList.remove('active');
    btnDebts.classList.remove('active');
    btnStocks.classList.add('active');
    localStorage.setItem('cashActiveTab', 'stocks');
    const savedStockTab = localStorage.getItem('activeStockSubTab') || 'api';
    switchCashStockSubTab(savedStockTab);
    if (savedStockTab === 'api') {
      loadStocksData();
    }
  } else {
    transactionsTab.style.display = 'block';
    debtsTab.style.display = 'none';
    stocksTab.style.display = 'none';
    btnTransactions.classList.add('active');
    btnDebts.classList.remove('active');
    btnStocks.classList.remove('active');
    localStorage.setItem('cashActiveTab', 'transactions');
  }
}

function loadBusinesses() {
  fetch('/api/businesses', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) throw new Error(data.error || 'Ошибка загрузки магазинов');
    businesses = data.businesses || [];
    updateCashBusinessOptions();
    updateStocksBusinessButton();
    renderStocksBusinessMenu();
    loadStocksData();
  })
  .catch(() => {
    businesses = [];
    updateCashBusinessOptions();
  });
}

function updateCashBusinessOptions() {
  const businessOptions = ['<option value="">Без привязки</option>', '<option value="__new__">➕ Создать новый...</option>'];
  businesses.forEach(b => {
    businessOptions.push('<option value="' + b.id + '">' + b.company_name + '</option>');
  });
  pendingBusinesses.forEach(item => {
    businessOptions.push('<option value="' + item.value + '">🕒 ' + escapeHtml(item.name) + '</option>');
  });
  const txSelect = document.getElementById('cashTxBusiness');
  const debtSelect = document.getElementById('cashDebtBusiness');
  const editTxSelect = document.getElementById('editCashTxBusiness');
  const editDebtSelect = document.getElementById('editDebtBusiness');
  if (txSelect) txSelect.innerHTML = businessOptions.join('');
  if (debtSelect) debtSelect.innerHTML = businessOptions.join('');
  if (editTxSelect) editTxSelect.innerHTML = businessOptions.join('');
  if (editDebtSelect) editDebtSelect.innerHTML = businessOptions.join('');
}

function updateCounterpartyOptions() {
  const options = ['<option value="">Без контрагента</option>', '<option value="__new__">➕ Создать новый...</option>'];
  counterparties.forEach(item => {
    options.push('<option value="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</option>');
  });
  pendingCounterparties.forEach(item => {
    options.push('<option value="' + item.value + '">🕒 ' + escapeHtml(item.name) + '</option>');
  });
  const txSelect = document.getElementById('cashTxCounterparty');
  const debtSelect = document.getElementById('cashDebtCounterparty');
  const editTxSelect = document.getElementById('editCashTxCounterparty');
  const editDebtSelect = document.getElementById('editDebtCounterparty');
  if (txSelect) txSelect.innerHTML = options.join('');
  if (debtSelect) debtSelect.innerHTML = options.join('');
  if (editTxSelect) editTxSelect.innerHTML = options.join('');
  if (editDebtSelect) editDebtSelect.innerHTML = options.join('');
}

function updateCashCategoryOptions() {
  const options = ['<option value="">Без категории</option>', '<option value="__new__">➕ Создать новую...</option>'];
  cashCategories.forEach(item => {
    options.push('<option value="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</option>');
  });
  pendingCategories.forEach(item => {
    options.push('<option value="' + item.value + '">🕒 ' + escapeHtml(item.name) + '</option>');
  });
  const select = document.getElementById('cashTxCategory');
  const editSelect = document.getElementById('editCashTxCategory');
  if (select) select.innerHTML = options.join('');
  if (editSelect) editSelect.innerHTML = options.join('');
}

function handleBusinessChangeById(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  if (select.value !== '__new__') return;

  const name = prompt('Название магазина (без API ключа, только ДДС):');
  if (!name || !name.trim()) {
    select.value = '';
    return;
  }
  const description = prompt('Описание (необязательно):') || '';

  const tempId = 'pending_business_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  pendingBusinesses.push({
    id: tempId,
    value: tempId,
    name: name.trim(),
    description: description.trim()
  });
  updateCashBusinessOptions();
  select.value = tempId;
}

function handleCashBusinessChange(target) {
  const selectId = target === 'debt' ? 'cashDebtBusiness' : 'cashTxBusiness';
  handleBusinessChangeById(selectId);
}

function handleCounterpartyChangeById(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  if (select.value !== '__new__') return;

  const name = prompt('Название контрагента:');
  if (!name || !name.trim()) {
    select.value = '';
    return;
  }

  const tempId = 'pending_counterparty_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  pendingCounterparties.push({
    id: tempId,
    value: tempId,
    name: name.trim()
  });
  updateCounterpartyOptions();
  select.value = tempId;
}

function handleCounterpartyChange(target) {
  const selectId = target === 'debt' ? 'cashDebtCounterparty' : 'cashTxCounterparty';
  handleCounterpartyChangeById(selectId);
}

function handleCategoryChangeById(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  if (select.value !== '__new__') return;

  const name = prompt('Название категории:');
  if (!name || !name.trim()) {
    select.value = '';
    return;
  }

  const tempId = 'pending_category_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  pendingCategories.push({
    id: tempId,
    value: tempId,
    name: name.trim()
  });
  updateCashCategoryOptions();
  select.value = tempId;
}

function handleCashCategoryChange() {
  handleCategoryChangeById('cashTxCategory');
}

function handleEditCashCategoryChange() {
  handleCategoryChangeById('editCashTxCategory');
}

function handleEditCashBusinessChange() {
  handleBusinessChangeById('editCashTxBusiness');
}

function handleEditDebtBusinessChange() {
  handleBusinessChangeById('editDebtBusiness');
}

function handleEditCashCounterpartyChange() {
  handleCounterpartyChangeById('editCashTxCounterparty');
}

function handleEditDebtCounterpartyChange() {
  handleCounterpartyChangeById('editDebtCounterparty');
}

function loadCounterparties() {
  fetch('/api/counterparties', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) throw new Error(data.error || 'Ошибка загрузки контрагентов');
    counterparties = data.items || [];
    updateCounterpartyOptions();
  })
  .catch(() => {
    counterparties = [];
    updateCounterpartyOptions();
  });
}

function loadCashCategories() {
  fetch('/api/cash-categories', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) throw new Error(data.error || 'Ошибка загрузки категорий');
    cashCategories = data.items || [];
    updateCashCategoryOptions();
  })
  .catch(() => {
    cashCategories = [];
    updateCashCategoryOptions();
  });
}

function rememberCounterparty(name) {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return;
  const exists = counterparties.some(item => String(item.name || '').toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    counterparties.push({ name: normalized });
    updateCounterpartyOptions();
  }
}

function rememberCashCategory(name) {
  const normalized = String(name || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return;
  const exists = cashCategories.some(item => String(item.name || '').toLowerCase() === normalized.toLowerCase());
  if (!exists) {
    cashCategories.push({ name: normalized });
    updateCashCategoryOptions();
  }
}

function openCashConfirmModal(message, onConfirm) {
  const modal = document.getElementById('cashConfirmModal');
  const text = document.getElementById('cashConfirmText');
  if (text) text.textContent = message || 'Подтвердите действие';
  cashConfirmCallback = typeof onConfirm === 'function' ? onConfirm : null;
  if (modal) modal.classList.add('active');
}

function closeCashConfirmModal() {
  const modal = document.getElementById('cashConfirmModal');
  if (modal) modal.classList.remove('active');
  cashConfirmCallback = null;
}

function confirmCashAction() {
  if (cashConfirmCallback) {
    cashConfirmCallback();
  }
  closeCashConfirmModal();
}

async function resolvePendingBusiness(value) {
  if (!value || !String(value).startsWith('pending_business_')) return value || null;
  const itemIndex = pendingBusinesses.findIndex(item => item.value === value);
  if (itemIndex === -1) return null;
  const item = pendingBusinesses[itemIndex];
  const response = await fetch('/api/businesses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({
      company_name: item.name,
      wb_api_key: null,
      description: item.description || ''
    })
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Ошибка создания магазина');
  }
  pendingBusinesses.splice(itemIndex, 1);
  loadBusinesses();
  return data.business.id;
}

async function resolvePendingCounterparty(value) {
  if (!value || !String(value).startsWith('pending_counterparty_')) return value || '';
  const itemIndex = pendingCounterparties.findIndex(item => item.value === value);
  if (itemIndex === -1) return '';
  const item = pendingCounterparties[itemIndex];
  const response = await fetch('/api/counterparties', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ name: item.name })
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Ошибка создания контрагента');
  }
  pendingCounterparties.splice(itemIndex, 1);
  loadCounterparties();
  return data.item.name;
}

async function resolvePendingCategory(value) {
  if (!value || !String(value).startsWith('pending_category_')) return value || '';
  const itemIndex = pendingCategories.findIndex(item => item.value === value);
  if (itemIndex === -1) return '';
  const item = pendingCategories[itemIndex];
  const response = await fetch('/api/cash-categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ name: item.name })
  });
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Ошибка создания категории');
  }
  pendingCategories.splice(itemIndex, 1);
  loadCashCategories();
  return data.item.name;
}

function toggleCashBusinessField() {
  const select = document.getElementById('cashTxBusiness');
  if (!select) return;
  select.disabled = false;
  select.style.opacity = '1';
}

function getBusinessNameById(businessId) {
  if (!businessId) return '—';
  const business = businesses.find(b => b.id === businessId);
  return business ? business.company_name : '—';
}

function loadCashflowData() {
  const dateFrom = document.getElementById('cashDateFrom').value;
  const dateTo = document.getElementById('cashDateTo').value;
  const url = '/api/cash/transactions?dateFrom=' + dateFrom + '&dateTo=' + dateTo;

  console.log('Loading cashflow data from:', url);
  fetch(url, {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => {
    console.log('Response status:', res.status);
    return res.json();
  })
  .then(data => {
    console.log('Data received:', data);
    if (!data.success) throw new Error(data.error || 'Ошибка загрузки');
    cashTransactions = data.items || [];
    updateCashSummary();
    const savedSubTab = localStorage.getItem('activeCashTxSubTab') || 'all';
    switchCashTxSubTab(savedSubTab);
  })
  .catch(err => {
    console.error('Error loading cashflow:', err);
    const body = document.getElementById('cashTransactionsBody');
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">❌ ' + err.message + '</td></tr>';
  });
}

function updateCashSummary() {
  let income = 0;
  let expense = 0;
  cashTransactions.forEach(item => {
    const amount = Number(item.amount || 0);
    if (item.tx_type === 'income') {
      income += amount;
    } else if (item.tx_type === 'expense') {
      expense += amount;
    }
  });
  const cashBalance = income - expense;
  
  // Расчёт долгов (только открытые)
  let receivable = 0;
  let payable = 0;
  cashDebts.forEach(debt => {
    if (debt.status === 'open') {
      const amount = Number(debt.amount || 0);
      if (debt.debt_type === 'receivable') {
        receivable += amount;
      } else if (debt.debt_type === 'payable') {
        payable += amount;
      }
    }
  });
  
  const netBalance = cashBalance + receivable - payable;
  
  document.getElementById('cashBalanceTotal').textContent = formatMoney(cashBalance);
  document.getElementById('cashReceivableTotal').textContent = formatMoney(receivable);
  document.getElementById('cashPayableTotal').textContent = formatMoney(payable);
  document.getElementById('cashNetBalanceTotal').textContent = formatMoney(netBalance);
}

function renderCashTransactions() {
  const body = document.getElementById('cashTransactionsBody');
  const activeTab = localStorage.getItem('activeCashTxSubTab') || 'all';
  const filteredTransactions = activeTab === 'all'
    ? cashTransactions
    : cashTransactions.filter(tx => tx.tx_type === activeTab);

  if (!filteredTransactions.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет операций за период</td></tr>';
    updateCashTxSelectAllState();
    return;
  }

  const rows = filteredTransactions.map(item => {
    const dateText = item.tx_date ? new Date(item.tx_date).toLocaleDateString('ru-RU') : '—';
    const createdDate = item.created_at ? new Date(item.created_at) : null;
    const createdText = createdDate ? 
      createdDate.toLocaleDateString('ru-RU') + ' ' + 
      createdDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) + 
      ' <span style="opacity:0.6">(' + createdDate.toLocaleTimeString('ru-RU', {timeZoneName: 'short'}).split(' ').pop() + ')</span>' 
      : '—';
    const typeLabel = item.tx_type === 'income' ? 'Приход' : 'Расход';
    const typeClass = item.tx_type === 'income' ? 'income' : 'expense';
    const businessName = getBusinessNameById(item.business_id);
    return '<tr>' +
      '<td style="text-align:center"><input type="checkbox" class="cash-tx-checkbox" data-id="' + item.id + '" onchange="updateCashTxSelectAllState()" /></td>' +
      '<td>' + dateText + '</td>' +
      '<td><span class="cash-pill ' + typeClass + '">' + typeLabel + '</span></td>' +
      '<td>' + formatMoney(item.amount) + '</td>' +
      '<td>' + (item.category || '—') + '</td>' +
      '<td>' + businessName + '</td>' +
      '<td>' + (item.counterparty || '—') + '</td>' +
      '<td>' + (item.note || '—') + '</td>' +
      '<td style="color:#94a3b8;font-size:12px">' + createdText + '</td>' +
      '<td style="text-align:right;display:flex;justify-content:flex-end;gap:6px">' +
        '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Редактировать" onclick="editCashTransaction(' + item.id + ')">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
        '</button>' +
        '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Удалить" onclick="deleteCashTransaction(' + item.id + ')">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  body.innerHTML = rows;
  updateCashTxSelectAllState();
}

function switchCashTxSubTab(tab) {
  const tabs = document.querySelectorAll('.cash-tx-sub-tab');
  tabs.forEach(btn => btn.classList.remove('active'));
  const map = {
    all: 0,
    income: 1,
    expense: 2
  };
  const index = map[tab] ?? 0;
  if (tabs[index]) {
    tabs[index].classList.add('active');
  }
  localStorage.setItem('activeCashTxSubTab', tab);
  renderCashTransactions();
}

function switchCashTxSubTab(tab) {
  const tabs = document.querySelectorAll('.cash-tx-sub-tab');
  tabs.forEach(btn => btn.classList.remove('active'));
  const map = {
    all: 0,
    income: 1,
    expense: 2
  };
  const index = map[tab] ?? 0;
  if (tabs[index]) {
    tabs[index].classList.add('active');
  }
  localStorage.setItem('activeCashTxSubTab', tab);
  renderCashTransactions();
}

function toggleAllCashTxCheckboxes(source) {
  const checkboxes = document.querySelectorAll('#cashTransactionsBody .cash-tx-checkbox');
  checkboxes.forEach(cb => { cb.checked = source.checked; });
  updateCashTxSelectAllState();
}

function updateCashTxSelectAllState() {
  const selectAll = document.getElementById('cashTxSelectAll');
  if (!selectAll) return;
  const checkboxes = Array.from(document.querySelectorAll('#cashTransactionsBody .cash-tx-checkbox'));
  const checkedCount = checkboxes.filter(cb => cb.checked).length;
  const selectedCountEl = document.getElementById('cashTxSelectedCount');
  const bulkDeleteBtn = document.getElementById('cashTxBulkDeleteBtn');
  if (selectedCountEl) {
    selectedCountEl.textContent = String(checkedCount);
  }
  if (bulkDeleteBtn) {
    const disabled = checkedCount === 0;
    bulkDeleteBtn.disabled = disabled;
    bulkDeleteBtn.style.opacity = disabled ? '0.5' : '1';
    bulkDeleteBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
  if (!checkboxes.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

async function deleteSelectedCashTransactions() {
  const checkboxes = Array.from(document.querySelectorAll('#cashTransactionsBody .cash-tx-checkbox'));
  const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => Number(cb.dataset.id)).filter(id => Number.isFinite(id));
  if (!selectedIds.length) {
    alert('❌ Выберите хотя бы одну операцию');
    return;
  }
  if (!confirm('Удалить выбранные операции?')) return;

  try {
    const response = await fetch('/api/cash/transactions/bulk', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({ ids: selectedIds })
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Ошибка массового удаления');
    }
    loadCashflowData();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function addCashTransaction() {
  const txDate = document.getElementById('cashTxDate').value;
  const amount = document.getElementById('cashTxAmount').value;
  if (!txDate || !amount || Number(amount) <= 0) {
    alert('❌ Укажите дату и сумму');
    return;
  }

  openCashConfirmModal('Добавить операцию?', async () => {
    try {
      const txType = document.getElementById('cashTxType').value;
      const rawCategory = document.getElementById('cashTxCategory').value === '__new__' ? '' : document.getElementById('cashTxCategory').value;
      const rawBusinessId = document.getElementById('cashTxBusiness').value === '__new__' ? '' : document.getElementById('cashTxBusiness').value;
      const rawCounterparty = document.getElementById('cashTxCounterparty').value === '__new__' ? '' : document.getElementById('cashTxCounterparty').value;
      const note = document.getElementById('cashTxNote').value.trim();

      const category = await resolvePendingCategory(rawCategory);
      const businessId = await resolvePendingBusiness(rawBusinessId);
      const counterparty = await resolvePendingCounterparty(rawCounterparty);

      const response = await fetch('/api/cash/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('authToken')
        },
        body: JSON.stringify({
          tx_type: txType,
          amount: Number(amount),
          tx_date: txDate,
          category: category || null,
          counterparty: counterparty || null,
          note,
          business_id: businessId || null
        })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Ошибка сохранения');

      rememberCounterparty(counterparty);
      rememberCashCategory(category);
      
      // Полный сброс формы
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('cashTxDate').value = today;
      document.getElementById('cashTxType').value = 'income';
      document.getElementById('cashTxAmount').value = '';
      document.getElementById('cashTxCategory').value = '';
      document.getElementById('cashTxCounterparty').value = '';
      document.getElementById('cashTxBusiness').value = '';
      document.getElementById('cashTxNote').value = '';
      closeCashTransactionModal();
      
      loadCashflowData();
    } catch (err) {
      alert('❌ ' + err.message);
    }
  });
}

function deleteCashTransaction(id) {
  if (!confirm('Удалить операцию?')) return;
  fetch('/api/cash/transactions/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) throw new Error(data.error || 'Ошибка удаления');
    loadCashflowData();
  })
  .catch(err => alert('❌ ' + err.message));
}

function editCashTransaction(id) {
  const item = cashTransactions.find(tx => Number(tx.id) === Number(id));
  if (!item) {
    alert('❌ Операция не найдена');
    return;
  }

  currentEditCashTxId = Number(id);
  updateCashBusinessOptions();
  updateCounterpartyOptions();
  updateCashCategoryOptions();

  document.getElementById('editCashTxDate').value = item.tx_date ? String(item.tx_date).split('T')[0] : '';
  document.getElementById('editCashTxType').value = item.tx_type || 'income';
  document.getElementById('editCashTxAmount').value = item.amount || '';
  const categorySelect = document.getElementById('editCashTxCategory');
  if (categorySelect) {
    if (item.category && !Array.from(categorySelect.options).some(o => o.value === item.category)) {
      categorySelect.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(item.category) + '">' + escapeHtml(item.category) + '</option>');
    }
    categorySelect.value = item.category || '';
  }
  const businessSelect = document.getElementById('editCashTxBusiness');
  if (businessSelect) {
    const businessValue = item.business_id ? String(item.business_id) : '';
    if (businessValue && !Array.from(businessSelect.options).some(o => o.value === businessValue)) {
      businessSelect.insertAdjacentHTML('beforeend', '<option value="' + businessValue + '">' + businessValue + '</option>');
    }
    businessSelect.value = businessValue;
  }
  const counterpartySelect = document.getElementById('editCashTxCounterparty');
  if (counterpartySelect) {
    if (item.counterparty && !Array.from(counterpartySelect.options).some(o => o.value === item.counterparty)) {
      counterpartySelect.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(item.counterparty) + '">' + escapeHtml(item.counterparty) + '</option>');
    }
    counterpartySelect.value = item.counterparty || '';
  }
  document.getElementById('editCashTxNote').value = item.note || '';

  const modal = document.getElementById('editCashTxModal');
  if (modal) modal.classList.add('active');
}

function closeEditCashTransactionModal() {
  const modal = document.getElementById('editCashTxModal');
  if (modal) modal.classList.remove('active');
  currentEditCashTxId = null;
}

async function saveEditCashTransaction() {
  if (!currentEditCashTxId) return;
  const txDate = document.getElementById('editCashTxDate').value;
  const txType = document.getElementById('editCashTxType').value;
  const amount = document.getElementById('editCashTxAmount').value;
  const rawCategory = document.getElementById('editCashTxCategory').value === '__new__' ? '' : document.getElementById('editCashTxCategory').value;
  const rawBusinessId = document.getElementById('editCashTxBusiness').value === '__new__' ? '' : document.getElementById('editCashTxBusiness').value;
  const rawCounterparty = document.getElementById('editCashTxCounterparty').value === '__new__' ? '' : document.getElementById('editCashTxCounterparty').value;
  const note = document.getElementById('editCashTxNote').value.trim();

  if (!txDate || !amount || Number(amount) <= 0) {
    alert('❌ Укажите дату и сумму');
    return;
  }

  try {
    const category = await resolvePendingCategory(rawCategory);
    const businessId = await resolvePendingBusiness(rawBusinessId);
    const counterparty = await resolvePendingCounterparty(rawCounterparty);

    const response = await fetch('/api/cash/transactions/' + currentEditCashTxId, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({
        tx_type: txType,
        amount: Number(amount),
        tx_date: txDate,
        category: category || null,
        counterparty: counterparty || null,
        note: note || null,
        business_id: businessId || null
      })
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Ошибка сохранения');
    closeEditCashTransactionModal();
    loadCashflowData();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function switchDebtSubTab(tab) {
  const tabs = document.querySelectorAll('.cash-debt-sub-tab');
  const summaryTab = document.getElementById('debtSummaryTab');
  const operationsTab = document.getElementById('debtOperationsTab');
  
  if (!tabs.length || !summaryTab || !operationsTab) return;
  
  tabs.forEach(t => t.classList.remove('active'));
  
  if (tab === 'summary') {
    tabs[0].classList.add('active');
    summaryTab.style.display = 'block';
    operationsTab.style.display = 'none';
  } else if (tab === 'operations') {
    tabs[1].classList.add('active');
    summaryTab.style.display = 'none';
    operationsTab.style.display = 'block';
  }
  
  // Сохраняем активную подвкладку
  localStorage.setItem('activeDebtSubTab', tab);
}

function switchCashStockSubTab(tab) {
  const tabs = document.querySelectorAll('.cash-stock-sub-tab');
  const tabMap = {
    api: 'cashStocksApiTab',
    local: 'cashStocksLocalTab',
    production: 'cashStocksProductionTab',
    procurement: 'cashStocksProcurementTab',
    logistics: 'cashStocksLogisticsTab',
    outsourcing: 'cashStocksOutsourcingTab'
  };

  if (!tabs.length) return;

  const safeTab = tabMap[tab] ? tab : 'api';

  tabs.forEach(t => t.classList.remove('active'));
  tabs.forEach(t => {
    if (t.dataset && t.dataset.tab === safeTab) t.classList.add('active');
  });

  Object.values(tabMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  const activeEl = document.getElementById(tabMap[safeTab]);
  if (activeEl) activeEl.style.display = 'block';

  localStorage.setItem('activeStockSubTab', safeTab);
  if (safeTab === 'api') {
    loadStocksData();
  }
}

function loadStocksData() {
  const body = document.getElementById('cashStocksBody');
  const countEl = document.getElementById('cashStocksCount');
  const activeTab = localStorage.getItem('cashActiveTab');
  const activeSubTab = localStorage.getItem('activeStockSubTab') || 'api';

  if (!body || activeTab !== 'stocks' || activeSubTab !== 'api') return;

  const selectedIds = getSelectedStockBusinessIds();
  const availableIds = businesses.filter(b => b.wb_api_key).map(b => b.id);
  const ids = (selectedIds && selectedIds.length) ? selectedIds : availableIds;

  if (!ids.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет магазинов с API ключом</td></tr>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>';
  if (countEl) countEl.textContent = '0';

  const query = encodeURIComponent(ids.join(','));
  fetch('/api/wb-stocks?businessIds=' + query, {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(async data => {
    if (!data.success) throw new Error(data.error || 'Ошибка загрузки остатков');
    cashStocksItems = data.items || [];

    const uniqueBusinessIds = Array.from(new Set(cashStocksItems.map(it => it.business_id))).filter(Boolean);
    cashStocksCosts = await loadStocksCosts(uniqueBusinessIds);
    renderStocksTable();
  })
  .catch(err => {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Ошибка: ' + escapeHtml(err.message) + '</td></tr>';
    if (countEl) countEl.textContent = '0';
  });
}

async function loadStocksCosts(businessIds) {
  const costMap = {};
  if (!businessIds || !businessIds.length) return costMap;

  await Promise.all(businessIds.map(id => {
    return fetch('/api/product-costs/' + id, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success || !Array.isArray(data.costs)) return;
      data.costs.forEach(item => {
        const key = String(id) + ':' + String(item.nm_id);
        costMap[key] = Number(item.cost || 0);
      });
    })
    .catch(() => {});
  }));

  return costMap;
}

function renderStocksTable() {
  const body = document.getElementById('cashStocksBody');
  const countEl = document.getElementById('cashStocksCount');
  if (!body) return;

  if (!cashStocksItems.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет данных</td></tr>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  const rows = cashStocksItems.map(item => {
    const business = businesses.find(b => b.id === item.business_id);
    const businessName = business ? business.company_name : '—';
    const nmId = item.nm_id || '—';
    const brand = item.brand || '—';
    const subject = item.subject || '—';
    const qty = Number(item.qty || 0);
    const inWayToClient = Number(item.in_way_to_client || 0);
    const inWayFromClient = Number(item.in_way_from_client || 0);
    const totalQty = Number(item.total_qty || 0);
    const costKey = String(item.business_id) + ':' + String(item.nm_id);
    const costValue = (costKey in cashStocksCosts) ? cashStocksCosts[costKey] : null;
    const sumValue = (costValue !== null) ? totalQty * Number(costValue || 0) : null;

    return '<tr>' +
      '<td>' + escapeHtml(businessName) + '</td>' +
      '<td>' + escapeHtml(brand) + '</td>' +
      '<td>' + escapeHtml(subject) + '</td>' +
      '<td>' + escapeHtml(nmId) + '</td>' +
      '<td style="text-align:right">' + formatQty(qty) + '</td>' +
      '<td style="text-align:right">' + formatQty(inWayToClient) + '</td>' +
      '<td style="text-align:right">' + formatQty(inWayFromClient) + '</td>' +
      '<td style="text-align:right">' + formatQty(totalQty) + '</td>' +
      '<td style="text-align:right">' + (costValue !== null ? formatMoney(costValue) : '—') + '</td>' +
      '<td style="text-align:right">' + (sumValue !== null ? formatMoney(sumValue) : '—') + '</td>' +
    '</tr>';
  });

  body.innerHTML = rows.join('');
  if (countEl) countEl.textContent = String(cashStocksItems.length);
}

function getSelectedStockBusinessIds() {
  const raw = localStorage.getItem('cashStocksBusinessIds');
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw).map(id => parseInt(id, 10)).filter(Boolean);
    return ids.length ? ids : null;
  } catch (e) {
    return null;
  }
}

function setSelectedStockBusinessIds(ids) {
  if (!ids || !ids.length || (businesses.length && ids.length >= businesses.length)) {
    localStorage.removeItem('cashStocksBusinessIds');
  } else {
    localStorage.setItem('cashStocksBusinessIds', JSON.stringify(ids));
  }
  updateStocksBusinessButton();
  renderStocksBusinessMenu();
}

function updateStocksBusinessButton() {
  const btn = document.getElementById('cashStocksBusinessBtn');
  if (!btn) return;
  if (!businesses.length) {
    btn.textContent = 'Магазины: нет';
    return;
  }
  const selected = getSelectedStockBusinessIds();
  if (!selected || selected.length >= businesses.length) {
    btn.textContent = 'Все магазины';
    return;
  }
  if (selected.length === 1) {
    const found = businesses.find(b => b.id === selected[0]);
    btn.textContent = found ? found.company_name : '1 магазин';
    return;
  }
  btn.textContent = 'Магазинов: ' + selected.length;
}

function renderStocksBusinessMenu() {
  const menu = document.getElementById('cashStocksBusinessMenu');
  if (!menu) return;

  if (!businesses.length) {
    menu.innerHTML = '<div class="filter-item">Нет магазинов</div>';
    return;
  }

  const selected = getSelectedStockBusinessIds();
  const allIds = businesses.map(b => b.id);
  const allSelected = !selected || selected.length >= allIds.length;
  const activeIds = selected || allIds;

  const items = [];
  items.push('<div class="filter-item ' + (allSelected ? 'active' : '') + '" onclick="event.stopPropagation(); toggleStockBusinessAll()">Все магазины</div>');
  businesses.forEach(b => {
    const isActive = !allSelected && activeIds.includes(b.id);
    items.push('<div class="filter-item ' + (isActive ? 'active' : '') + '" onclick="event.stopPropagation(); toggleStockBusiness(' + b.id + ')">' + b.company_name + '</div>');
  });
  menu.innerHTML = items.join('');
}

function toggleStockBusinessAll() {
  setSelectedStockBusinessIds(null);
  loadStocksData();
}

function toggleStockBusiness(id) {
  let ids = getSelectedStockBusinessIds();
  if (!ids || !ids.length) {
    ids = businesses.map(b => b.id);
  }
  const index = ids.indexOf(id);
  if (index >= 0) {
    ids.splice(index, 1);
  } else {
    ids.push(id);
  }
  if (!ids.length) {
    setSelectedStockBusinessIds(null);
  } else {
    setSelectedStockBusinessIds(ids);
  }
  loadStocksData();
}

function toggleStocksBusinessMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashStocksBusinessMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  if (opMenu) opMenu.classList.remove('open');
  if (typeMenu) typeMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function loadCashDebts() {
  fetch('/api/cash/debts', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    console.log('Долги загружены:', data);
    if (!data.success) throw new Error(data.error || 'Ошибка загрузки');
    cashDebts = data.items || [];
    console.log('cashDebts массив:', cashDebts.length, 'записей');
    restoreDebtOperationsFilters();
    renderCashDebts();
    renderDebtSummary();
    updateCashSummary();
    
    // Восстанавливаем активную подвкладку
    const savedTab = localStorage.getItem('activeDebtSubTab') || 'summary';
    switchDebtSubTab(savedTab);
  })
  .catch(err => {
    console.error('Ошибка загрузки долгов:', err);
    const body = document.getElementById('cashDebtsBody');
    if (body) body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">❌ ' + err.message + '</td></tr>';
  });
}

function getDebtSummaryKey(counterparty, businessId) {
  const name = counterparty || 'Без контрагента';
  const biz = businessId ? String(businessId) : 'null';
  return name + '||' + biz;
}

function renderDebtSummary() {
  const body = document.getElementById('debtSummaryBody');
  if (!body) return;
  
  const summary = {};
  
  // Группируем по debt_group_id (каждая группа = отдельный долг)
  cashDebts.forEach(debt => {
    const groupId = (debt.debt_group_id && debt.debt_group_id !== 'null') ? debt.debt_group_id : debt.id;
    if (!summary[groupId]) {
      summary[groupId] = {
        group_id: groupId,
        counterparty: debt.counterparty || 'Без контрагента',
        debt_type: debt.debt_type,
        total_amount: 0,
        paid_amount: 0,
        business_id: debt.business_id,
        due_date: debt.due_date
      };
    }
    
    const amount = Number(debt.amount || 0);
    
    // Положительные суммы - начисление долга
    if (amount > 0) {
      summary[groupId].total_amount += amount;
    } else {
      // Отрицательные суммы - погашение долга
      summary[groupId].paid_amount += Math.abs(amount);
    }
  });
  
  const summaries = Object.values(summary).map(item => {
    const remainder = item.total_amount - item.paid_amount;
    const isClosed = Math.abs(remainder) < 0.01; // Погрешность для float
    const percent = item.total_amount > 0 ? (item.paid_amount / item.total_amount) * 100 : 0;
    return {
      ...item,
      remainder,
      isClosed,
      statusLabel: isClosed ? 'Закрыт' : 'Открыт',
      percent
    };
  });

  const nextSummaryIndex = {};
  summaries.forEach(item => {
    const key = getDebtSummaryKey(item.counterparty, item.business_id);
    if (!nextSummaryIndex[key]) nextSummaryIndex[key] = {};
    if (item.remainder <= 0.01) return;
    const existing = nextSummaryIndex[key][item.debt_type];
    if (!existing || Number(existing.remainder || 0) < Number(item.remainder || 0)) {
      nextSummaryIndex[key][item.debt_type] = item;
    }
  });
  debtSummaryIndex = nextSummaryIndex;
  
  // Сортировка: 1) открытые выше, 2) по проценту выполнения (больше = выше)
  summaries.sort((a, b) => {
    // Сначала по статусу (открытые выше)
    if (!a.isClosed && b.isClosed) return -1;
    if (a.isClosed && !b.isClosed) return 1;
    
    // Внутри каждой группы - по проценту выполнения (больше процент = выше)
    return b.percent - a.percent;
  });
  
  if (!summaries.length) {
    body.innerHTML = '<tr><td colspan="9" class="cash-muted" style="text-align:center;padding:16px">Нет долгов</td></tr>';
    updateDebtSummarySelectAllState();
    return;
  }
  
  const rows = summaries.map(item => {
    const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
    const typeClass = item.debt_type === 'receivable' ? 'receivable' : 'payable';
    const counterpartyEncoded = encodeURIComponent(item.counterparty || '—');
    const businessName = getBusinessNameById(item.business_id);
    const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString('ru-RU') : '—';
    const key = getDebtSummaryKey(item.counterparty, item.business_id);
    const keyEncoded = encodeURIComponent(key);
    const oppositeType = item.debt_type === 'receivable' ? 'payable' : 'receivable';
    const pair = debtSummaryIndex[key] || {};
    const oppositeItem = pair[oppositeType];
    const canRecalc = !item.isClosed && oppositeItem && Number(oppositeItem.remainder || 0) > 0.01;
    const recalcTitle = canRecalc ? 'Перерасчёт' : 'Перерасчёт доступен только при двух открытых типах долга';
    const recalcStyle = canRecalc ? '' : 'opacity:0.4;cursor:not-allowed;';
    const recalcOnclick = canRecalc ? "openDebtRecalcModal('" + keyEncoded + "')" : 'return false;';
    
    // Прогресс-бар
    const percent = item.total_amount > 0 ? Math.max(0, Math.min(100, Math.round((item.paid_amount / item.total_amount) * 100))) : 0;
    const barColor = item.debt_type === 'receivable' ? '#22c55e' : '#ef4444';
    const barBg = item.debt_type === 'receivable' ? 'rgba(34,197,94,0.13)' : 'rgba(239,68,68,0.13)';
    const progressBar = '<div class="debt-progress-bar" style="height:14px;width:70px;border-radius:8px;background:' + barBg + ';margin:0;display:flex;align-items:center;overflow:hidden;box-shadow:0 1px 4px 0 rgba(0,0,0,0.04)"><div style="height:100%;width:' + percent + '%;background:' + barColor + ';transition:width 0.3s;border-radius:8px"></div></div>';
    
    // Визуальное отличие для закрытых долгов
    const rowStyle = item.isClosed ? 'opacity:0.3;background:rgba(255,255,255,0.01);filter:grayscale(0.8)' : '';
    const statusIcon = item.isClosed ? '✓' : '●';
    const statusColor = item.isClosed ? '#4b5563' : '#22c55e';
    
    return '<tr style="' + rowStyle + '">' +
      '<td style="text-align:center"><input type="checkbox" class="debt-summary-checkbox" data-group-id="' + item.group_id + '" onchange="updateDebtSummarySelectAllState()" /></td>' +
      '<td>' + (item.counterparty || '—') + '</td>' +
      '<td><span class="cash-pill ' + typeClass + '">' + typeLabel + '</span></td>' +
      '<td style="text-align:center;vertical-align:middle">' + progressBar + '</td>' +
      '<td>' + formatMoney(item.total_amount) + '</td>' +
      '<td>' + formatMoney(item.paid_amount) + '</td>' +
      '<td><strong>' + formatMoney(item.remainder) + '</strong></td>' +
      '<td><span style="color:' + statusColor + '">' + statusIcon + ' ' + item.statusLabel + '</span></td>' +
      '<td style="text-align:right;display:flex;justify-content:flex-end;gap:6px">' +
      '<button class="api-btn" style="padding:6px 8px;line-height:0;' + recalcStyle + '" title="' + recalcTitle + '" onclick="' + recalcOnclick + '">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"/><path d="M7 8l-4 4 4 4"/><path d="M17 16l4-4-4-4"/></svg>' +
      '</button>' +
      '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Детали" onclick="openDebtOperationsModal(\\\'' + item.group_id + '\\\')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>' +
      '</button>' +
      '</td>' +
    '</tr>';
  }).join('');
  
  body.innerHTML = rows;
  updateDebtSummarySelectAllState();
}

function toggleAllDebtSummaryCheckboxes(source) {
  const checkboxes = document.querySelectorAll('#debtSummaryBody .debt-summary-checkbox');
  checkboxes.forEach(cb => { cb.checked = source.checked; });
  updateDebtSummarySelectAllState();
}

function updateDebtSummarySelectAllState() {
  const selectAll = document.getElementById('debtSummarySelectAll');
  if (!selectAll) return;
  const checkboxes = Array.from(document.querySelectorAll('#debtSummaryBody .debt-summary-checkbox'));
  const checkedCount = checkboxes.filter(cb => cb.checked).length;
  const selectedCountEl = document.getElementById('debtSummarySelectedCount');
  const bulkDeleteBtn = document.getElementById('debtSummaryBulkDeleteBtn');
  if (selectedCountEl) {
    selectedCountEl.textContent = String(checkedCount);
  }
  if (bulkDeleteBtn) {
    const disabled = checkedCount === 0;
    bulkDeleteBtn.disabled = disabled;
    bulkDeleteBtn.style.opacity = disabled ? '0.5' : '1';
    bulkDeleteBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
  if (!checkboxes.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

async function deleteSelectedDebtSummaries() {
  const checkboxes = Array.from(document.querySelectorAll('#debtSummaryBody .debt-summary-checkbox'));
  const groupIds = checkboxes.filter(cb => cb.checked).map(cb => cb.dataset.groupId).filter(Boolean);
  if (!groupIds.length) {
    alert('❌ Выберите хотя бы одну запись');
    return;
  }
  if (!confirm('Удалить выбранные долги и все их операции?')) return;

  const groupSet = new Set(groupIds);
  const idsToDelete = cashDebts
    .filter(debt => {
      const gid = (debt.debt_group_id && debt.debt_group_id !== 'null') ? debt.debt_group_id : String(debt.id);
      return groupSet.has(String(gid));
    })
    .map(debt => Number(debt.id))
    .filter(id => Number.isFinite(id));

  if (!idsToDelete.length) {
    alert('❌ Не удалось найти операции для удаления');
    return;
  }

  try {
    const response = await fetch('/api/cash/debts/bulk', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({ ids: idsToDelete })
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Ошибка массового удаления');
    }
    loadCashDebts();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function openDebtOperationsModal(groupId) {
  const modal = document.getElementById('debtOperationsModal');
  const body = document.getElementById('debtOperationsModalBody');
  const title = document.getElementById('debtOperationsModalTitle');
  if (!modal || !body || !title) return;

  const targetGroupId = String(groupId);
  const operations = cashDebts.filter(debt => {
    const gid = (debt.debt_group_id && debt.debt_group_id !== 'null') ? String(debt.debt_group_id) : String(debt.id);
    return gid === targetGroupId;
  });

  const counterpartyName = operations[0]?.counterparty || '—';
  title.textContent = 'Операции долга: ' + counterpartyName;

  if (!operations.length) {
    body.innerHTML = '<tr><td colspan="8" class="cash-muted" style="text-align:center;padding:16px">Нет операций</td></tr>';
  } else {
    const rows = operations
      .sort((a, b) => new Date(b.debt_date || 0) - new Date(a.debt_date || 0))
      .map(item => {
        const debtDate = item.debt_date ? new Date(item.debt_date).toLocaleDateString('ru-RU') : '—';
        const amount = Number(item.amount || 0);
        const isPayment = amount < 0;
        const displayAmount = Math.abs(amount);
        const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
        const typeClass = item.debt_type === 'receivable' ? 'receivable' : 'payable';
        const operationTypeLabel = (item.operation_type === 'decrease' || (isPayment && !item.operation_type)) ? 'Погашение' : 'Начисление';
        const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString('ru-RU') : '—';
        const businessName = getBusinessNameById(item.business_id);

        return '<tr>' +
          '<td>' + debtDate + '</td>' +
          '<td><span class="cash-pill ' + typeClass + '">' + typeLabel + '</span></td>' +
          '<td>' + operationTypeLabel + '</td>' +
          '<td>' + (isPayment ? '-' : '+') + formatMoney(displayAmount) + '</td>' +
          '<td>' + (item.counterparty || '—') + '</td>' +
          '<td>' + dueDate + '</td>' +
          '<td>' + businessName + '</td>' +
          '<td>' + (item.note || '—') + '</td>' +
        '</tr>';
      }).join('');

    body.innerHTML = rows;
  }

  modal.classList.add('active');
}

function closeDebtOperationsModal() {
  const modal = document.getElementById('debtOperationsModal');
  if (modal) modal.classList.remove('active');
}

function openDebtRecalcModal(keyEncoded) {
  const key = decodeURIComponent(keyEncoded || '');
  const pair = debtSummaryIndex[key];
  if (!pair || !pair.receivable || !pair.payable) {
    alert('❌ Для перерасчёта нужны оба типа долга');
    return;
  }

  const receivable = pair.receivable;
  const payable = pair.payable;
  const receivableRemainder = Math.max(0, Number(receivable.remainder || 0));
  const payableRemainder = Math.max(0, Number(payable.remainder || 0));
  const maxAmount = Math.min(receivableRemainder, payableRemainder);

  if (!maxAmount || maxAmount <= 0.01) {
    alert('❌ Нет суммы для перерасчёта');
    return;
  }

  const modal = document.getElementById('debtRecalcModal');
  const counterpartyEl = document.getElementById('debtRecalcCounterparty');
  const businessEl = document.getElementById('debtRecalcBusiness');
  const receivableEl = document.getElementById('debtRecalcReceivable');
  const payableEl = document.getElementById('debtRecalcPayable');
  const maxEl = document.getElementById('debtRecalcMax');
  const amountInput = document.getElementById('debtRecalcAmount');
  const dateInput = document.getElementById('debtRecalcDate');
  const noteInput = document.getElementById('debtRecalcNote');

  const counterpartyName = receivable.counterparty || payable.counterparty || '—';
  const businessId = receivable.business_id || payable.business_id || null;
  const businessName = getBusinessNameById(businessId);

  if (counterpartyEl) counterpartyEl.textContent = counterpartyName;
  if (businessEl) businessEl.textContent = businessName || '—';
  if (receivableEl) receivableEl.textContent = formatMoney(receivableRemainder);
  if (payableEl) payableEl.textContent = formatMoney(payableRemainder);
  if (maxEl) maxEl.textContent = formatMoney(maxAmount);

  if (amountInput) {
    amountInput.value = '';
    amountInput.placeholder = 'Автоматически: ' + formatMoney(maxAmount);
  }
  const autoInput = document.getElementById('debtRecalcAuto');
  if (autoInput) autoInput.checked = false;

  toggleDebtRecalcAuto();
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  if (noteInput) noteInput.value = '';

  currentDebtRecalc = {
    counterparty: counterpartyName,
    business_id: businessId,
    maxAmount,
    receivableRemainder,
    payableRemainder
  };

  updateDebtRecalcPreview();

  if (modal) modal.classList.add('active');
}

function closeDebtRecalcModal() {
  const modal = document.getElementById('debtRecalcModal');
  if (modal) modal.classList.remove('active');
  currentDebtRecalc = null;
}

function toggleDebtRecalcAuto() {
  const autoInput = document.getElementById('debtRecalcAuto');
  const amountInput = document.getElementById('debtRecalcAmount');
  const isAuto = autoInput ? autoInput.checked : true;
  if (amountInput) {
    amountInput.disabled = isAuto;
    amountInput.style.opacity = isAuto ? '0.7' : '1';
    if (isAuto) {
      amountInput.value = currentDebtRecalc ? String(currentDebtRecalc.maxAmount || '') : '';
    } else {
      amountInput.value = '';
    }
  }
  updateDebtRecalcPreview();
}

function updateDebtRecalcPreview() {
  if (!currentDebtRecalc) return;
  const amountInput = document.getElementById('debtRecalcAmount');
  const autoInput = document.getElementById('debtRecalcAuto');
  const afterReceivableEl = document.getElementById('debtRecalcAfterReceivable');
  const afterPayableEl = document.getElementById('debtRecalcAfterPayable');

  const isAuto = autoInput ? autoInput.checked : true;
  const rawAmount = amountInput ? amountInput.value.trim() : '';
  const requestedAmount = isAuto ? currentDebtRecalc.maxAmount : (rawAmount ? Number(rawAmount) : 0);
  const safeAmount = (!requestedAmount || requestedAmount <= 0) ? 0 : requestedAmount;

  const receivableAfter = Math.max(0, currentDebtRecalc.receivableRemainder - safeAmount);
  const payableAfter = Math.max(0, currentDebtRecalc.payableRemainder - safeAmount);

  if (afterReceivableEl) afterReceivableEl.textContent = formatMoney(receivableAfter);
  if (afterPayableEl) afterPayableEl.textContent = formatMoney(payableAfter);
}

async function submitDebtRecalc() {
  if (!currentDebtRecalc) return;

  const amountInput = document.getElementById('debtRecalcAmount');
  const autoInput = document.getElementById('debtRecalcAuto');
  const dateInput = document.getElementById('debtRecalcDate');
  const noteInput = document.getElementById('debtRecalcNote');

  const isAuto = autoInput ? autoInput.checked : true;
  const rawAmount = amountInput ? amountInput.value.trim() : '';
  const requestedAmount = isAuto ? currentDebtRecalc.maxAmount : (rawAmount ? Number(rawAmount) : 0);

  if (!requestedAmount || requestedAmount <= 0) {
    alert('❌ Укажите сумму перерасчёта');
    return;
  }

  if (requestedAmount - currentDebtRecalc.maxAmount > 0.01) {
    alert('❌ Сумма превышает доступный максимум');
    return;
  }

  try {
    const response = await fetch('/api/cash/debts/recalculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({
        counterparty: currentDebtRecalc.counterparty,
        business_id: currentDebtRecalc.business_id,
        amount: requestedAmount,
        debt_date: dateInput ? dateInput.value || null : null,
        note: noteInput ? noteInput.value.trim() : null
      })
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Ошибка перерасчёта');

    closeDebtRecalcModal();
    loadCashDebts();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function openCashTransactionModal() {
  const modal = document.getElementById('cashTransactionModal');
  if (modal) modal.classList.add('active');
}

function closeCashTransactionModal() {
  const modal = document.getElementById('cashTransactionModal');
  if (modal) modal.classList.remove('active');
}

function openCashDebtModal() {
  const modal = document.getElementById('cashDebtModal');
  if (modal) modal.classList.add('active');
}

function closeCashDebtModal() {
  const modal = document.getElementById('cashDebtModal');
  if (modal) modal.classList.remove('active');
}

function getDebtOperationKey(item) {
  const amount = Number(item.amount || 0);
  const isPayment = amount < 0;
  if (item.operation_type === 'decrease' || (isPayment && !item.operation_type)) return 'decrease';
  return 'increase';
}

function getDebtOperationLabel(item) {
  return getDebtOperationKey(item) === 'decrease' ? 'Погашение' : 'Начисление';
}

function getDebtOperationsFilterValues() {
  const operationValue = localStorage.getItem('cashDebtOperationFilter') || 'all';
  const typeValue = localStorage.getItem('cashDebtTypeFilter') || 'all';
  return { operationValue, typeValue };
}

function restoreDebtOperationsFilters() {
  localStorage.setItem('cashDebtOperationFilter', 'all');
  localStorage.setItem('cashDebtTypeFilter', 'all');
  updateDebtFilterButtons();
}

function updateDebtFilterButtons() {
  const operationBtn = document.getElementById('cashDebtOperationFilterBtn');
  const typeBtn = document.getElementById('cashDebtTypeFilterBtn');
  const operationMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const operationValue = localStorage.getItem('cashDebtOperationFilter') || 'all';
  const typeValue = localStorage.getItem('cashDebtTypeFilter') || 'all';
  if (operationBtn) {
    operationBtn.textContent = operationValue === 'increase' ? 'Начисления' : operationValue === 'decrease' ? 'Погашения' : 'Все операции';
  }
  if (typeBtn) {
    typeBtn.textContent = typeValue === 'receivable' ? 'Нам должны' : typeValue === 'payable' ? 'Мы должны' : 'Все типы';
  }
  if (operationMenu) {
    operationMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === operationValue);
    });
  }
  if (typeMenu) {
    typeMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === typeValue);
    });
  }
}

function toggleDebtOperationMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  if (typeMenu) typeMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtTypeMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashDebtTypeMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  if (opMenu) opMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function setDebtOperationFilter(value) {
  localStorage.setItem('cashDebtOperationFilter', value);
  const menu = document.getElementById('cashDebtOperationMenu');
  if (menu) menu.classList.remove('open');
  updateDebtFilterButtons();
  renderCashDebts();
}

function setDebtTypeFilter(value) {
  localStorage.setItem('cashDebtTypeFilter', value);
  const menu = document.getElementById('cashDebtTypeMenu');
  if (menu) menu.classList.remove('open');
  updateDebtFilterButtons();
  renderCashDebts();
}

document.addEventListener('click', (event) => {
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const stocksMenu = document.getElementById('cashStocksBusinessMenu');
  const stocksBtn = document.getElementById('cashStocksBusinessBtn');
  if (stocksMenu && (stocksMenu.contains(event.target) || (stocksBtn && stocksBtn.contains(event.target)))) {
    return;
  }
  if (opMenu) opMenu.classList.remove('open');
  if (typeMenu) typeMenu.classList.remove('open');
  if (stocksMenu) stocksMenu.classList.remove('open');
});

function applyDebtOperationsFilters(items) {
  const { operationValue, typeValue } = getDebtOperationsFilterValues();
  return items.filter(item => {
    if (operationValue !== 'all' && getDebtOperationKey(item) !== operationValue) return false;
    if (typeValue !== 'all' && item.debt_type !== typeValue) return false;
    return true;
  });
}

function renderCashDebts() {
  const body = document.getElementById('cashDebtsBody');
  if (!cashDebts.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет записей</td></tr>';
    updateDebtSelectAllState();
    return;
  }

  // Сортировка по дате операции (от новых к старым)
  const sortedDebts = applyDebtOperationsFilters([...cashDebts]).sort((a, b) => {
    const dateA = new Date(a.debt_date || 0);
    const dateB = new Date(b.debt_date || 0);
    return dateB - dateA;
  });

  if (!sortedDebts.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет записей по выбранным фильтрам</td></tr>';
    updateDebtSelectAllState();
    return;
  }

  const rows = sortedDebts.map(item => {
    const debtDate = item.debt_date ? new Date(item.debt_date).toLocaleDateString('ru-RU') : '—';
    const amount = Number(item.amount || 0);
    const isPayment = amount < 0;
    const displayAmount = Math.abs(amount);
    const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
    const typeClass = item.debt_type === 'receivable' ? 'receivable' : 'payable';
    const operationTypeLabel = getDebtOperationLabel(item);
    const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString('ru-RU') : '—';
    const businessName = getBusinessNameById(item.business_id);
    
    return '<tr>' +
      '<td style="text-align:center"><input type="checkbox" class="cash-debt-checkbox" data-id="' + item.id + '" onchange="updateDebtSelectAllState()" /></td>' +
      '<td>' + debtDate + '</td>' +
      '<td><span class="cash-pill ' + typeClass + '">' + typeLabel + '</span></td>' +
      '<td>' + operationTypeLabel + '</td>' +
      '<td>' + (isPayment ? '-' : '+') + formatMoney(displayAmount) + '</td>' +
      '<td>' + (item.counterparty || '—') + '</td>' +
      '<td>' + dueDate + '</td>' +
      '<td>' + businessName + '</td>' +
      '<td>' + (item.note || '—') + '</td>' +
      '<td style="text-align:right;display:flex;justify-content:flex-end;gap:6px">' +
      '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Редактировать" onclick="editCashDebt(' + item.id + ')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
      '</button>' +
      '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Удалить" onclick="deleteCashDebt(' + item.id + ')">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
      '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  body.innerHTML = rows;
  updateDebtSelectAllState();
}

function toggleAllDebtCheckboxes(source) {
  const checkboxes = document.querySelectorAll('#cashDebtsBody .cash-debt-checkbox');
  checkboxes.forEach(cb => { cb.checked = source.checked; });
  updateDebtSelectAllState();
}

function updateDebtSelectAllState() {
  const selectAll = document.getElementById('cashDebtSelectAll');
  if (!selectAll) return;
  const checkboxes = Array.from(document.querySelectorAll('#cashDebtsBody .cash-debt-checkbox'));
  const checkedCount = checkboxes.filter(cb => cb.checked).length;
  const selectedCountEl = document.getElementById('cashDebtSelectedCount');
  const bulkDeleteBtn = document.getElementById('cashDebtBulkDeleteBtn');
  if (selectedCountEl) {
    selectedCountEl.textContent = String(checkedCount);
  }
  if (bulkDeleteBtn) {
    const disabled = checkedCount === 0;
    bulkDeleteBtn.disabled = disabled;
    bulkDeleteBtn.style.opacity = disabled ? '0.5' : '1';
    bulkDeleteBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
  if (!checkboxes.length) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  selectAll.checked = checkedCount === checkboxes.length;
  selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

async function deleteSelectedCashDebts() {
  const checkboxes = Array.from(document.querySelectorAll('#cashDebtsBody .cash-debt-checkbox'));
  const selectedIds = checkboxes.filter(cb => cb.checked).map(cb => Number(cb.dataset.id)).filter(id => Number.isFinite(id));
  if (!selectedIds.length) {
    alert('❌ Выберите хотя бы одну запись');
    return;
  }
  if (!confirm('Удалить выбранные записи?')) return;

  try {
    const response = await fetch('/api/cash/debts/bulk', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({ ids: selectedIds })
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Ошибка массового удаления');
    }
    loadCashDebts();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function addCashDebt() {
  const amount = document.getElementById('cashDebtAmount').value;
  if (!amount || Number(amount) <= 0) {
    alert('❌ Укажите сумму');
    return;
  }

  openCashConfirmModal('Добавить операцию долга?', async () => {
    try {
      const debtDate = document.getElementById('cashDebtDate').value;
      const debtType = document.getElementById('cashDebtType').value;
      const operationType = document.getElementById('cashDebtOperationType').value;
      const rawCounterparty = document.getElementById('cashDebtCounterparty').value === '__new__' ? '' : document.getElementById('cashDebtCounterparty').value;
      const dueDate = document.getElementById('cashDebtDueDate').value;
      const rawBusinessId = document.getElementById('cashDebtBusiness').value === '__new__' ? '' : document.getElementById('cashDebtBusiness').value;
      const note = document.getElementById('cashDebtNote').value.trim();

      const counterparty = await resolvePendingCounterparty(rawCounterparty);
      const businessId = await resolvePendingBusiness(rawBusinessId);

      const operationAmount = Number(amount);
      
      // Каждая операция создаёт НОВУЮ запись
      // Для погашения создаём запись с отрицательной суммой
      const finalAmount = operationType === 'decrease' ? -operationAmount : operationAmount;

      const response = await fetch('/api/cash/debts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + localStorage.getItem('authToken')
          },
          body: JSON.stringify({
            debt_date: debtDate || null,
            debt_type: debtType,
            amount: finalAmount,
            counterparty: counterparty || null,
            due_date: dueDate || null,
            business_id: businessId || null,
            operation_type: operationType,
            note: note || null
          })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Ошибка сохранения');

      rememberCounterparty(counterparty);
      document.getElementById('cashDebtDate').value = '';
      document.getElementById('cashDebtAmount').value = '';
      document.getElementById('cashDebtCounterparty').value = '';
      document.getElementById('cashDebtNote').value = '';
      document.getElementById('cashDebtDueDate').value = '';
      closeCashDebtModal();
      loadCashDebts();
    } catch (err) {
      alert('❌ ' + err.message);
    }
  });
}

function closeCashDebt(id) {
  fetch('/api/cash/debts/' + id, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ status: 'closed' })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) throw new Error(data.error || 'Ошибка обновления');
    loadCashDebts();
  })
  .catch(err => alert('❌ ' + err.message));
}

function deleteCashDebt(id) {
  if (!confirm('Удалить долг?')) return;
  fetch('/api/cash/debts/' + id, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) throw new Error(data.error || 'Ошибка удаления');
    loadCashDebts();
  })
  .catch(err => alert('❌ ' + err.message));
}

function editCashDebt(id) {
  const item = cashDebts.find(debt => Number(debt.id) === Number(id));
  if (!item) {
    alert('❌ Запись долга не найдена');
    return;
  }

  currentEditDebtId = Number(id);
  updateCashBusinessOptions();
  updateCounterpartyOptions();

  document.getElementById('editDebtDate').value = item.debt_date ? String(item.debt_date).split('T')[0] : '';
  document.getElementById('editDebtType').value = item.debt_type || 'receivable';
  const amount = Number(item.amount || 0);
  const isPayment = amount < 0;
  const operationType = item.operation_type || (isPayment ? 'decrease' : 'increase');
  document.getElementById('editDebtOperationType').value = operationType;
  document.getElementById('editDebtAmount').value = Math.abs(amount) || '';

  const counterpartySelect = document.getElementById('editDebtCounterparty');
  if (counterpartySelect) {
    if (item.counterparty && !Array.from(counterpartySelect.options).some(o => o.value === item.counterparty)) {
      counterpartySelect.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(item.counterparty) + '">' + escapeHtml(item.counterparty) + '</option>');
    }
    counterpartySelect.value = item.counterparty || '';
  }

  document.getElementById('editDebtDueDate').value = item.due_date ? String(item.due_date).split('T')[0] : '';

  const businessSelect = document.getElementById('editDebtBusiness');
  if (businessSelect) {
    const businessValue = item.business_id ? String(item.business_id) : '';
    if (businessValue && !Array.from(businessSelect.options).some(o => o.value === businessValue)) {
      businessSelect.insertAdjacentHTML('beforeend', '<option value="' + businessValue + '">' + businessValue + '</option>');
    }
    businessSelect.value = businessValue;
  }

  document.getElementById('editDebtNote').value = item.note || '';

  const modal = document.getElementById('editDebtModal');
  if (modal) modal.classList.add('active');
}

function closeEditDebtModal() {
  const modal = document.getElementById('editDebtModal');
  if (modal) modal.classList.remove('active');
  currentEditDebtId = null;
}

async function saveEditDebt() {
  if (!currentEditDebtId) return;
  const debtDate = document.getElementById('editDebtDate').value;
  const debtType = document.getElementById('editDebtType').value;
  const operationType = document.getElementById('editDebtOperationType').value;
  const amountInput = document.getElementById('editDebtAmount').value;
  const rawCounterparty = document.getElementById('editDebtCounterparty').value === '__new__' ? '' : document.getElementById('editDebtCounterparty').value;
  const dueDate = document.getElementById('editDebtDueDate').value;
  const rawBusinessId = document.getElementById('editDebtBusiness').value === '__new__' ? '' : document.getElementById('editDebtBusiness').value;
  const note = document.getElementById('editDebtNote').value.trim();

  if (!amountInput || Number(amountInput) <= 0) {
    alert('❌ Укажите сумму');
    return;
  }

  try {
    const counterparty = await resolvePendingCounterparty(rawCounterparty);
    const businessId = await resolvePendingBusiness(rawBusinessId);
    const operationAmount = Number(amountInput);
    const finalAmount = operationType === 'decrease' ? -operationAmount : operationAmount;

    const response = await fetch('/api/cash/debts/' + currentEditDebtId, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({
        debt_date: debtDate || null,
        debt_type: debtType,
        amount: finalAmount,
        counterparty: counterparty || null,
        due_date: dueDate || null,
        business_id: businessId || null,
        operation_type: operationType,
        note: note || null
      })
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Ошибка сохранения');
    closeEditDebtModal();
    loadCashDebts();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

initCashRange();
loadBusinesses();
loadCounterparties();
loadCashCategories();
loadCashflowData();
loadCashDebts();

// Восстанавливаем активную вкладку
const savedTab = localStorage.getItem('cashActiveTab') || 'transactions';
switchCashTab(savedTab);
if (savedTab === 'debts') {
  const savedDebtTab = localStorage.getItem('activeDebtSubTab') || 'summary';
  switchDebtSubTab(savedDebtTab);
}
if (savedTab === 'stocks') {
  const savedStockTab = localStorage.getItem('activeStockSubTab') || 'api';
  switchCashStockSubTab(savedStockTab);
}
</script>
</body></html>`);
});

// Страница управления остатками (в разработке)
app.get('/stocks', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper - Управление остатками</title>
<style>
*{box-sizing:border-box}
html{overflow-y:scroll}
*{scrollbar-width:thin;scrollbar-color:rgba(56,189,248,0.45) rgba(15,23,42,0.55)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.45);border-radius:10px;border:2px solid rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,0.7)}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;margin:0;padding:24px 24px 24px 0;color:#e2e8f0;background:#0b1220;background-image:radial-gradient(1200px 600px at 10% -10%,rgba(56,189,248,0.25),rgba(0,0,0,0)),radial-gradient(900px 500px at 90% 0%,rgba(34,197,94,0.15),rgba(0,0,0,0)),linear-gradient(180deg,#0b1220 0%,#0f172a 40%,#0b1220 100%);min-height:100vh}
.layout{display:flex;gap:18px;min-height:calc(100vh - 48px)}
.sidebar{width:92px;flex:0 0 92px;background:rgba(10,16,30,0.92);border:1px solid rgba(148,163,184,0.12);border-radius:0;box-shadow:0 20px 50px rgba(2,6,23,0.45);padding:10px 8px;position:sticky;top:0;align-self:flex-start;height:100vh;display:flex;flex-direction:column;gap:14px;z-index:1;margin-top:-24px}
.sidebar-footer{margin-top:auto}
.sidebar-top{display:flex;justify-content:center;padding:6px 0 2px}
.sidebar-top-icon{width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:12px;letter-spacing:0.3px}
.main{flex:1;min-width:0;position:relative;z-index:2}
.sidebar-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:66px;padding:8px 4px;border-radius:16px;border:1px solid rgba(148,163,184,0.16);background:rgba(12,18,34,0.7);color:#e2e8f0;text-decoration:none;text-align:center;transition:all 0.2s;box-shadow:0 10px 22px rgba(2,6,23,0.35)}
.sidebar-icon{width:28px;height:28px;border-radius:10px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);display:flex;align-items:center;justify-content:center}
.sidebar-icon svg{width:16px;height:16px;stroke:#7dd3fc;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sidebar-text{font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:#cbd5f5;line-height:1.2}
.sidebar-link:hover{border-color:rgba(56,189,248,0.55);background:rgba(15,23,42,0.85)}
.sidebar-link:hover .sidebar-icon{background:rgba(56,189,248,0.18);border-color:rgba(56,189,248,0.55)}
.sidebar-link:hover .sidebar-text{color:#fff}
.sidebar-link.logout .sidebar-icon{background:rgba(239,68,68,0.16);border-color:rgba(239,68,68,0.5)}
.sidebar-link.logout .sidebar-icon svg{stroke:#fca5a5}
.sidebar-link.logout:hover .sidebar-icon{background:rgba(239,68,68,0.22);border-color:rgba(239,68,68,0.7)}
.main{flex:1;min-width:0}
.container{width:100%;max-width:none;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:26px 26px 30px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
.header-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.8)}
.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:14px}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.api-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase}
.api-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:16px}
.section-title{margin:0 0 12px;font-size:14px;font-weight:700;color:#f8fafc;letter-spacing:0.3px}
.section-note{color:#cbd5f5;font-size:12px;line-height:1.6;margin:0}
@media (max-width: 900px){
  .layout{flex-direction:column}
  .sidebar{width:100%;height:auto;position:relative;top:auto}
}
</style></head><body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="sidebar-top-icon">WB</div>
    </div>
    <a class="sidebar-link" href="/">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
      </span>
      <span class="sidebar-text">Главная</span>
    </a>
    <a class="sidebar-link" href="/fin-report">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16" /><path d="M7 16v-6" /><path d="M12 16V8" /><path d="M17 16v-3" /></svg>
      </span>
      <span class="sidebar-text">Финансовый отчет</span>
    </a>
    <a class="sidebar-link" href="/products">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
      </span>
      <span class="sidebar-text">Анализ товаров</span>
    </a>
    <a class="sidebar-link" href="/stocks">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></svg>
      </span>
      <span class="sidebar-text">Управление остатками</span>
    </a>
    <div class="sidebar-footer">
      <a class="sidebar-link logout" href="/api/logout" onclick="localStorage.removeItem('authToken')">
        <span class="sidebar-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M13 4H5v16h8" /></svg>
        </span>
        <span class="sidebar-text">Выход</span>
      </a>
    </div>
  </aside>
  <main class="main">
    <div class="container">
      <div class="header-bar">
        <div class="brand"></div>
        <div class="toolbar"></div>
      </div>
      <div class="section">
        <h2 class="section-title">Управление остатками</h2>
        <p class="section-note">Раздел в разработке. Здесь появится отдельный интерфейс управления остатками.</p>
      </div>
    </div>
  </main>
</div>
</body></html>`);
});

// Главная страница - Финансовый отчет
app.get('/fin-report', requireAuth, (req, res) => {
  res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper - Финансовый отчет</title>
<style>
*{box-sizing:border-box}
html{overflow-y:scroll}
*{scrollbar-width:thin;scrollbar-color:rgba(56,189,248,0.45) rgba(15,23,42,0.55)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.45);border-radius:10px;border:2px solid rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,0.7)}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;margin:0;padding:24px 24px 24px 0;color:#e2e8f0;background:#0b1220;background-image:radial-gradient(1200px 600px at 10% -10%,rgba(56,189,248,0.25),rgba(0,0,0,0)),radial-gradient(900px 500px at 90% 0%,rgba(34,197,94,0.15),rgba(0,0,0,0)),linear-gradient(180deg,#0b1220 0%,#0f172a 40%,#0b1220 100%);min-height:100vh}
.layout{display:flex;gap:18px;min-height:calc(100vh - 48px)}
.sidebar{width:92px;flex:0 0 92px;background:rgba(10,16,30,0.92);border:1px solid rgba(148,163,184,0.12);border-radius:0;box-shadow:0 20px 50px rgba(2,6,23,0.45);padding:10px 8px;position:sticky;top:0;align-self:flex-start;height:100vh;display:flex;flex-direction:column;gap:14px;z-index:1;margin-top:-24px}
.sidebar-footer{margin-top:auto}
.sidebar-top{display:flex;justify-content:center;padding:6px 0 2px}
.sidebar-top-icon{width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:12px;letter-spacing:0.3px}
.main{flex:1;min-width:0;position:relative;z-index:2}
.sidebar-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:66px;padding:8px 4px;border-radius:16px;border:1px solid rgba(148,163,184,0.16);background:rgba(12,18,34,0.7);color:#e2e8f0;text-decoration:none;text-align:center;transition:all 0.2s;box-shadow:0 10px 22px rgba(2,6,23,0.35)}
.sidebar-icon{width:28px;height:28px;border-radius:10px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);display:flex;align-items:center;justify-content:center}
.sidebar-icon svg{width:16px;height:16px;stroke:#7dd3fc;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sidebar-text{font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:#cbd5f5;line-height:1.2}
.sidebar-link:hover{border-color:rgba(56,189,248,0.55);background:rgba(15,23,42,0.85)}
.sidebar-link:hover .sidebar-icon{background:rgba(56,189,248,0.18);border-color:rgba(56,189,248,0.55)}
.sidebar-link:hover .sidebar-text{color:#fff}
.sidebar-link.logout .sidebar-icon{background:rgba(239,68,68,0.16);border-color:rgba(239,68,68,0.5)}
.sidebar-link.logout .sidebar-icon svg{stroke:#fca5a5}
.sidebar-link.logout:hover .sidebar-icon{background:rgba(239,68,68,0.22);border-color:rgba(239,68,68,0.7)}
.main{flex:1;min-width:0}
.container{width:100%;max-width:none;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:26px 26px 30px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
@media (max-width: 900px){
  .layout{flex-direction:column}
  .sidebar{width:100%;height:auto;position:relative;top:auto}
}
h1{margin:0 0 16px;font-size:28px;font-weight:700;color:#f8fafc;letter-spacing:-0.3px}
.header-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.header-left{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.8)}
.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:14px}
.brand-title{font-size:13px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase}
.brand-subtitle{font-size:11px;color:#94a3b8;letter-spacing:0.4px;text-transform:uppercase}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.api-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase}
.api-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.update-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:#38bdf8;color:#0b1220;border:none;border-radius:10px;font-weight:800;font-size:12px;cursor:pointer;transition:all 0.2s;box-shadow:0 12px 28px rgba(56,189,248,0.35);letter-spacing:0.4px;text-transform:uppercase}
.update-btn:hover{transform:translateY(-2px);box-shadow:0 18px 34px rgba(56,189,248,0.45)}
.selector-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase}
.select-control{padding:9px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;background:rgba(15,23,42,0.85);transition:all 0.2s;color:#e2e8f0}
.select-control:hover{border-color:#38bdf8}
.select-control:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:16px}
.section-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.range-btn{display:flex;gap:8px;align-items:center;background:rgba(15,23,42,0.85);padding:10px 14px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;cursor:pointer;font-size:12px;font-weight:700;color:#e2e8f0;transition:all 0.2s;letter-spacing:0.3px;text-transform:uppercase}
.range-btn:hover{border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.2);transform:translateY(-2px)}
.range-value{color:#93c5fd;font-weight:700}
.report-toolbar{display:flex;gap:10px;flex-wrap:wrap}
.report-btn{padding:10px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.25);background:transparent;color:#e2e8f0;font-weight:700;font-size:12px;cursor:pointer;letter-spacing:0.3px;text-transform:uppercase;transition:all 0.2s;position:relative}
.report-btn:hover{border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.18)}
.report-primary{background:#1e293b;border-color:#334155}
.report-accent{background:#22c55e;color:#0b1220;border:none;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
.report-accent:hover{box-shadow:0 18px 34px rgba(34,197,94,0.45)}
.report-danger{background:#f97316;color:#0b1220;border:none;box-shadow:0 12px 26px rgba(249,115,22,0.35)}
.report-info{background:#38bdf8;color:#0b1220;border:none;box-shadow:0 12px 26px rgba(56,189,248,0.35)}
.report-badge{position:absolute;top:-8px;right:-8px;background:#ef4444;color:#fff;border-radius:999px;width:20px;height:20px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;animation:pulse 1.5s infinite;box-shadow:0 4px 10px rgba(239,68,68,0.35)}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:16px 0}
.stat-card{background:#0b1220;border:1px solid rgba(148,163,184,0.2);border-radius:14px;padding:16px 16px 18px;box-shadow:0 14px 32px rgba(0,0,0,0.35);position:relative;overflow:hidden}
.stat-card::before{content:'';position:absolute;left:0;top:0;right:0;height:3px;background:var(--accent)}
.stat-label{font-size:11px;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:8px}
.stat-value{font-size:24px;font-weight:700;letter-spacing:-0.3px;color:#f8fafc}
.stat-hint{font-size:11px;color:#94a3b8;margin-top:6px}
.api-status{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;margin-left:8px;vertical-align:middle;letter-spacing:0.3px;text-transform:uppercase}
.api-status.active{background:rgba(34,197,94,0.18);color:#86efac;border:1px solid rgba(34,197,94,0.35)}
.api-status.inactive{background:rgba(239,68,68,0.18);color:#fca5a5;border:1px solid rgba(239,68,68,0.35)}
.api-status-icon{font-size:14px}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(6px);z-index:1000;align-items:center;justify-content:center;padding:24px;overflow:auto}
.modal.active{display:flex}
.modal-overlay{z-index:2000}
.modal-content{background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.2);border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,0.5);max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow:auto;margin:0 auto}
.cost-modal-content{width:1000px;max-width:calc(100vw - 48px);height:80vh;max-height:calc(100vh - 48px);min-height:520px;overflow:hidden;display:flex;flex-direction:column}
.cost-table-container{flex:1;overflow:auto;padding:20px}
.cost-image-wrap{position:relative;display:inline-flex;align-items:center;justify-content:center}
.cost-image{width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #dfe6e9}
.cost-image-preview{position:absolute;left:60px;top:50%;transform:translateY(-50%);width:160px;height:160px;background:#fff;border:1px solid #dfe6e9;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.25);padding:6px;display:none;z-index:10}
.cost-image-preview img{width:100%;height:100%;object-fit:cover;border-radius:8px}
.cost-image-wrap:hover .cost-image-preview{display:block}
.cost-skeleton-table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden}
.skeleton-cell{height:16px;background:linear-gradient(90deg,#e5e7eb 0%,#f3f4f6 50%,#e5e7eb 100%);background-size:200% 100%;animation:skeleton 1.2s ease-in-out infinite;border-radius:6px}
@keyframes skeleton{0%{background-position:200% 0}100%{background-position:-200% 0}}
.cash-tabs{display:flex;gap:8px;margin-bottom:14px}
.cash-tab-btn{padding:8px 14px;border-radius:10px;border:1px solid rgba(148,163,184,0.3);background:rgba(15,23,42,0.85);color:#e2e8f0;font-weight:700;font-size:12px;cursor:pointer;letter-spacing:0.3px;text-transform:uppercase;transition:all 0.2s}
.cash-tab-btn.active{background:#38bdf8;color:#0b1220;border-color:#38bdf8;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.cash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.cash-form{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:14px;padding:14px;margin-bottom:14px}
.cash-form-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.cash-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
.cash-input{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0}
.cash-input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
.cash-action-btn{padding:10px 14px;border:none;border-radius:10px;background:#22c55e;color:#0b1220;font-weight:800;font-size:12px;cursor:pointer;letter-spacing:0.3px;text-transform:uppercase;box-shadow:0 10px 22px rgba(34,197,94,0.3);transition:all 0.2s}
.cash-action-btn:hover{transform:translateY(-2px);box-shadow:0 16px 30px rgba(34,197,94,0.4)}
.cash-table{width:100%;border-collapse:collapse}
.cash-table th{background:#0b1220;color:#e2e8f0;font-size:12px;text-align:left;padding:10px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:10}
.cash-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,0.15);font-size:12px;color:#e2e8f0}
.cash-pill{padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.cash-pill.income{background:rgba(34,197,94,0.2);color:#86efac;border:1px solid rgba(34,197,94,0.35)}
.cash-pill.expense{background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.35)}
.cash-pill.receivable{background:rgba(56,189,248,0.2);color:#93c5fd;border:1px solid rgba(56,189,248,0.35)}
.cash-pill.payable{background:rgba(245,158,11,0.2);color:#fcd34d;border:1px solid rgba(245,158,11,0.35)}
.cash-muted{color:#94a3b8;font-size:12px}
.modal-header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid rgba(148,163,184,0.2)}
.modal-header h2{margin:0;font-size:18px;font-weight:700;color:#f8fafc}
.close-btn{background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:all 0.2s}
.close-btn:hover{border-color:#38bdf8;color:#fff}
.modal-content table{color:#e2e8f0}
.modal-content th{background:#0b1220;color:#e2e8f0}
.modal-content td{border-color:rgba(148,163,184,0.2)}
#finReportTable th{background:#0f172a !important;color:#e2e8f0 !important;border-bottom:1px solid rgba(148,163,184,0.25) !important}
#finReportTable td{color:#e2e8f0 !important;border-bottom:1px solid rgba(148,163,184,0.2) !important}
#finReportTable tr:hover td{background:rgba(56,189,248,0.08) !important}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.7;transform:scale(1.08)}}
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="sidebar-top-icon">WB</div>
    </div>
    <a class="sidebar-link" href="/">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>
      </span>
      <span class="sidebar-text">Главная</span>
    </a>
    <a class="sidebar-link" href="/fin-report">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16" /><path d="M7 16v-6" /><path d="M12 16V8" /><path d="M17 16v-3" /></svg>
      </span>
      <span class="sidebar-text">Финансовый отчет</span>
    </a>
    <a class="sidebar-link" href="/products">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
      </span>
      <span class="sidebar-text">Анализ товаров</span>
    </a>
    <a class="sidebar-link" href="/stocks">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></svg>
      </span>
      <span class="sidebar-text">Управление остатками</span>
    </a>
    <div class="sidebar-footer">
      <a class="sidebar-link logout" href="/api/logout" onclick="localStorage.removeItem('authToken')">
        <span class="sidebar-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M13 4H5v16h8" /></svg>
        </span>
        <span class="sidebar-text">Выход</span>
      </a>
    </div>
  </aside>
  <main class="main">
    <div class="container">
  <div class="header-bar">
    <div class="header-left">
      <div class="brand"></div>
      <div class="toolbar">
        <button class="api-btn" onclick="openBusinessManager()">🏢 Управление магазинами</button>
        <div id="businessSelector" style="display:flex;gap:10px;align-items:center">
          <span class="selector-label">Магазин:</span>
          <select id="currentBusiness" onchange="switchBusiness()" class="select-control">
            <option value="">Загрузка...</option>
          </select>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:12px;align-items:center">
      <button class="update-btn" onclick="syncWithWB()" title="Принудительная синхронизация с WB API">🔄 Синхронизация с WB</button>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h1>📈 Финансовый отчет</h1>
    </div>
  </div>
  
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
  <div class="section">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <button id="dateRangeBtn" onclick="openDateRangePicker()" class="range-btn">
        <span style="font-size:16px">📅</span>
        <span id="dateRangeText">Период:</span>
        <span id="dateRangeDisplay" class="range-value">14.12.2025 — 13.01.2026</span>
      </button>
      <input type="date" id="dateFrom" style="display:none" />
      <input type="date" id="dateTo" style="display:none" />
      <div class="report-toolbar">
        <button id="btnFinReport" onclick="openFinReportModal()" class="report-btn report-primary">
          📈 Фин отчёт
          <span id="finReportBadge" class="report-badge" style="display:none">⏳</span>
        </button>
        <button id="btnSalesReport" onclick="openSalesReportModal()" class="report-btn report-info">
          💰 Продажи
          <span id="salesReportBadge" class="report-badge" style="display:none">⏳</span>
        </button>
        <button id="btnOrders" onclick="openOrdersModal()" class="report-btn report-info">
          📦 Заказы
          <span id="ordersReportBadge" class="report-badge" style="display:none">⏳</span>
        </button>
        <button onclick="openCostModal()" class="report-btn report-accent">💰 Себестоимость</button>
      </div>
    </div>
  </div>
  
  <!-- Индикатор загрузки -->
  <div id="loadingIndicator" style="display:none;background:rgba(15,23,42,0.85);color:#e2e8f0;padding:18px 22px;border-radius:14px;margin-bottom:22px;box-shadow:0 18px 40px rgba(0,0,0,0.4);border:1px solid rgba(148,163,184,0.2)">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="width:26px;height:26px;border:3px solid rgba(148,163,184,0.3);border-top-color:#93c5fd;border-radius:50%;animation:spin 1s linear infinite"></div>
      <div>
        <div style="font-weight:700;font-size:14px;letter-spacing:0.4px;text-transform:uppercase">⏳ Загрузка данных...</div>
        <div id="loadingStatus" style="font-size:12px;opacity:0.9;margin-top:4px;color:#cbd5f5">Загружаются все отчёты</div>
      </div>
    </div>
  </div>

  <!-- Карточки с общей статистикой -->
  <div id="statsCards" class="stats-grid">
    <div class="stat-card" style="--accent:#38bdf8">
      <div class="stat-label">Общая выручка</div>
      <div id="totalRevenue" class="stat-value">—</div>
      <div class="stat-hint">Что заплатили покупатели</div>
    </div>
    <div class="stat-card" style="--accent:#fca5a5">
      <div class="stat-label">Комиссия WB</div>
      <div id="totalCommission" class="stat-value">—</div>
      <div class="stat-hint">Удержание маркетплейса</div>
    </div>
    <div class="stat-card" style="--accent:#93c5fd">
      <div class="stat-label">Логистика + расходы</div>
      <div id="totalLogistics" class="stat-value">—</div>
      <div class="stat-hint">Доставка, хранение, штрафы</div>
    </div>
    <div class="stat-card" style="--accent:#86efac">
      <div class="stat-label">К перечислению</div>
      <div id="netProfit" class="stat-value">—</div>
      <div class="stat-hint">Придёт на ваш счёт</div>
    </div>
    <div class="stat-card" style="--accent:#fcd34d">
      <div class="stat-label">Чистая прибыль</div>
      <div id="pureProfit" class="stat-value">—</div>
      <div class="stat-hint">Расчёт добавится позже</div>
    </div>
  </div>

    </div>
  </main>
</div>

  <!-- Модальное окно: Детали отчёта -->
  <div id="reportInfoModal" class="modal modal-overlay" onclick="closeModalOnOutsideClick(event, 'reportInfoModal')">
    <div class="modal-content" style="max-width:600px;width:600px" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h2>📋 Детали отчёта</h2>
        <button class="close-btn" onclick="closeModal('reportInfoModal')">&times;</button>
      </div>
      <div id="reportInfoContent" style="padding:20px;max-height:70vh;overflow-y:auto">
      </div>
    </div>
  </div>

  <!-- Модальное окно: Финансовый отчёт -->
  <div id="finReportModal" class="modal" onclick="closeModalOnOutsideClick(event, 'finReportModal')">
    <div class="modal-content" style="max-width:calc(100vw - 48px);width:calc(100vw - 48px);max-height:calc(100vh - 48px)" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h2>📈 Финансовый отчёт</h2>
        <button onclick="showReportSummary()" style="padding:10px 20px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;margin-right:auto;transition:all 0.3s;box-shadow:0 3px 10px rgba(102,126,234,0.3)">📊 Сводная информация</button>
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
  <div class="modal-content" style="max-width:calc(100vw - 48px);width:calc(100vw - 48px);max-height:calc(100vh - 48px)" onclick="event.stopPropagation()">
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
  <div class="modal-content" style="max-width:calc(100vw - 48px);width:calc(100vw - 48px);max-height:calc(100vh - 48px)" onclick="event.stopPropagation()">
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
          <label for="wbApiKey">API ключ Wildberries</label>
          <input type="text" id="wbApiKey" placeholder="Ваш API ключ от WB" />
          <small>API ключ можно получить в личном кабинете WB: Настройки → Доступ к API</small>
          <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="withoutApiKey" onchange="toggleApiKeyField()" />
            <label for="withoutApiKey" style="font-size:13px;color:#636e72">Без API ключа (только ДДС)</label>
          </div>
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
  <div class="modal-content cost-modal-content">
    <div class="modal-header" style="flex-shrink:0">
      <h2>💰 Себестоимость товаров</h2>
      <button class="close-btn" onclick="closeCostModal()">&times;</button>
    </div>
    
    <div style="flex-shrink:0;padding:0 20px 15px;border-bottom:1px solid #dfe6e9">
      <button id="saveCostBtn" onclick="saveCostData()" disabled style="padding:10px 20px;background:#b2bec3;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:not-allowed;font-size:14px">💾 Сохранить</button>
    </div>
    
    <div id="costTableContainer" class="cost-table-container">
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
      <div style="flex:1;padding:20px;border-right:1px solid rgba(148,163,184,0.2);display:flex;flex-direction:column;background:rgba(15,23,42,0.85)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-shrink:0">
          <button onclick="changeCalendarYear(-1)" style="padding:8px 12px;background:#f8f9fa;border:none;border-radius:6px;cursor:pointer;font-size:18px;font-weight:700;color:#2d3436">‹</button>
          <div style="font-weight:700;font-size:18px;color:#2d3436">
            <span id="calendarYear"></span>
          </div>
          <button onclick="changeCalendarYear(1)" style="padding:8px 12px;background:#f8f9fa;border:none;border-radius:6px;cursor:pointer;font-size:18px;font-weight:700;color:#2d3436">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:12px;flex-shrink:0">
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Пн</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Вт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Ср</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Чт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#94a3b8;padding:8px">Пт</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#fca5a5;padding:8px">Сб</div>
          <div style="text-align:center;font-weight:600;font-size:12px;color:#fca5a5;padding:8px">Вс</div>
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
          <button onclick="selectQuickRange('all')" style="padding:10px 16px;background:#fff;border:2px solid #dfe6e9;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;color:#2d3436;transition:all 0.2s;text-align:left">♾️ За всё время</button>
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

// Глобальное хранилище данных финансового отчёта
let currentFinReportData = [];

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
  const apiInput = document.getElementById('wbApiKey');
  const checkbox = document.getElementById('withoutApiKey');
  if (apiInput) {
    apiInput.disabled = false;
    apiInput.style.opacity = '1';
  }
  if (checkbox) {
    checkbox.checked = false;
  }
}

function toggleApiKeyField() {
  const checkbox = document.getElementById('withoutApiKey');
  const apiInput = document.getElementById('wbApiKey');
  if (!checkbox || !apiInput) return;
  if (checkbox.checked) {
    apiInput.value = '';
    apiInput.disabled = true;
    apiInput.style.opacity = '0.6';
  } else {
    apiInput.disabled = false;
    apiInput.style.opacity = '1';
  }
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
      updateCashBusinessOptions();
      
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
            \${business.wb_api_key
              ? '<p style="margin:0 0 4px;font-size:13px;color:#636e72">API: ' + business.wb_api_key.substring(0, 20) + '...</p>'
              : '<p style="margin:0 0 4px;font-size:13px;color:#636e72">Без API ключа (только ДДС)</p>'}
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
  const withoutApi = document.getElementById('withoutApiKey')?.checked;
  const formData = {
    company_name: document.getElementById('companyName').value.trim(),
    wb_api_key: withoutApi ? null : document.getElementById('wbApiKey').value.trim(),
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
  const activeBusinesses = businessList.filter(b => (b.is_active === true || b.is_active === 1) && b.wb_api_key && String(b.wb_api_key).trim());
  
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

function getCostSkeletonHtml() {
  const skeletonRows = Array.from({ length: 6 }).map(() => (
    '<tr style="border-bottom:1px solid #f1f3f5">' +
      '<td style="padding:12px;text-align:center"><div class="skeleton-cell" style="width:50px;height:50px;margin:0 auto;border-radius:8px"></div></td>' +
      '<td style="padding:12px"><div class="skeleton-cell" style="width:70%"></div></td>' +
      '<td style="padding:12px"><div class="skeleton-cell" style="width:60%"></div></td>' +
      '<td style="padding:12px"><div class="skeleton-cell" style="width:90%"></div></td>' +
      '<td style="padding:12px;text-align:right"><div class="skeleton-cell" style="width:120px;margin-left:auto"></div></td>' +
    '</tr>'
  )).join('');

  return '' +
    '<table class="cost-skeleton-table">' +
      '<thead>' +
        '<tr>' +
          '<th style="padding:12px;text-align:center;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:80px">Фото</th>' +
          '<th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:12%">Бренд</th>' +
          '<th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:12%">Артикул WB</th>' +
          '<th style="padding:12px;text-align:left;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:35%">Название товара</th>' +
          '<th style="padding:12px;text-align:right;border-bottom:2px solid #dfe6e9;font-weight:600;color:#2d3436;width:25%">Себестоимость (₽)</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        skeletonRows +
      '</tbody>' +
    '</table>';
}

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
  container.innerHTML = getCostSkeletonHtml();
  
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

// ==================== ДВИЖЕНИЕ ДЕНЕГ ====================
let cashTransactions = [];
let cashDebts = [];

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(amount);
}

function openCashflowModal() {
  document.getElementById('cashflowModal').classList.add('active');
  initCashFormDefaults();
  updateCashBusinessOptions();
  loadCashflowData();
  loadCashDebts();
}

function closeCashflowModal() {
  document.getElementById('cashflowModal').classList.remove('active');
}

function switchCashTab(tab) {
  const transactionsTab = document.getElementById('cashflowTransactionsTab');
  const debtsTab = document.getElementById('cashflowDebtsTab');
  const stocksTab = document.getElementById('cashflowStocksTab');
  const btnTransactions = document.getElementById('cashTabTransactions');
  const btnDebts = document.getElementById('cashTabDebts');
  const btnStocks = document.getElementById('cashTabStocks');

  if (tab === 'debts') {
    transactionsTab.style.display = 'none';
    debtsTab.style.display = 'block';
    stocksTab.style.display = 'none';
    btnTransactions.classList.remove('active');
    btnDebts.classList.add('active');
    btnStocks.classList.remove('active');
  } else if (tab === 'stocks') {
    transactionsTab.style.display = 'none';
    debtsTab.style.display = 'none';
    stocksTab.style.display = 'block';
    btnTransactions.classList.remove('active');
    btnDebts.classList.remove('active');
    btnStocks.classList.add('active');
    const savedStockTab = localStorage.getItem('activeStockSubTab') || 'api';
    switchCashStockSubTab(savedStockTab);
    if (savedStockTab === 'api') {
      loadStocksData();
    }
  } else {
    transactionsTab.style.display = 'block';
    debtsTab.style.display = 'none';
    stocksTab.style.display = 'none';
    btnTransactions.classList.add('active');
    btnDebts.classList.remove('active');
    btnStocks.classList.remove('active');
  }
}

function initCashFormDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('cashTxDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = today;
  }
  const debtDateInput = document.getElementById('cashDebtDueDate');
  if (debtDateInput && !debtDateInput.value) {
    debtDateInput.value = today;
  }
  toggleCashBusinessField();
}

function updateCashBusinessOptions() {
  const businessOptions = ['<option value="">Без привязки</option>'];
  businesses.forEach(b => {
    businessOptions.push(\`<option value="\${b.id}">\${b.company_name}</option>\`);
  });
  const txSelect = document.getElementById('cashTxBusiness');
  const debtSelect = document.getElementById('cashDebtBusiness');
  if (txSelect) txSelect.innerHTML = businessOptions.join('');
  if (debtSelect) debtSelect.innerHTML = businessOptions.join('');
}

function toggleCashBusinessField() {
  const type = document.getElementById('cashTxType')?.value || 'income';
  const select = document.getElementById('cashTxBusiness');
  if (!select) return;
  if (type === 'expense') {
    select.disabled = false;
    select.style.opacity = '1';
  } else {
    select.disabled = true;
    select.style.opacity = '0.6';
    select.value = '';
  }
}

function getBusinessNameById(businessId) {
  if (!businessId) return '—';
  const business = businesses.find(b => b.id === businessId);
  return business ? business.company_name : '—';
}

function loadCashflowData() {
  const dateRange = getDateRange();
  const url = \`/api/cash/transactions?dateFrom=\${dateRange.dateFrom}&dateTo=\${dateRange.dateTo}\`;

  fetch(url, {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка загрузки');
    }
    cashTransactions = data.items || [];
    updateCashSummary();
    const savedSubTab = localStorage.getItem('activeCashTxSubTab') || 'all';
    switchCashTxSubTab(savedSubTab);
  })
  .catch(err => {
    const body = document.getElementById('cashTransactionsBody');
    body.innerHTML = \`<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">❌ \${err.message}</td></tr>\`;
  });
}

function updateCashSummary() {
  let income = 0;
  let expense = 0;
  cashTransactions.forEach(item => {
    const amount = Number(item.amount || 0);
    if (item.tx_type === 'income') {
      income += amount;
    } else if (item.tx_type === 'expense') {
      expense += amount;
    }
  });
  const cashBalance = income - expense;
  
  // Расчёт долгов (только открытые)
  let receivable = 0;
  let payable = 0;
  cashDebts.forEach(debt => {
    if (debt.status === 'open') {
      const amount = Number(debt.amount || 0);
      if (debt.debt_type === 'receivable') {
        receivable += amount;
      } else if (debt.debt_type === 'payable') {
        payable += amount;
      }
    }
  });
  
  const netBalance = cashBalance + receivable - payable;
  
  document.getElementById('cashBalanceTotal').textContent = formatMoney(cashBalance);
  document.getElementById('cashReceivableTotal').textContent = formatMoney(receivable);
  document.getElementById('cashPayableTotal').textContent = formatMoney(payable);
  document.getElementById('cashNetBalanceTotal').textContent = formatMoney(netBalance);
}

function renderCashTransactions() {
  const body = document.getElementById('cashTransactionsBody');
  const activeTab = localStorage.getItem('activeCashTxSubTab') || 'all';
  const filteredTransactions = activeTab === 'all'
    ? cashTransactions
    : cashTransactions.filter(tx => tx.tx_type === activeTab);

  if (!filteredTransactions.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет операций за период</td></tr>';
    updateCashTxSelectAllState();
    return;
  }

  const rows = filteredTransactions.map(item => {
    const dateText = item.tx_date ? new Date(item.tx_date).toLocaleDateString('ru-RU') : '—';
    const createdDate = item.created_at ? new Date(item.created_at) : null;
    const createdText = createdDate ? 
      createdDate.toLocaleDateString('ru-RU') + ' ' + 
      createdDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) + 
      ' <span style="opacity:0.6">(' + createdDate.toLocaleTimeString('ru-RU', {timeZoneName: 'short'}).split(' ').pop() + ')</span>' 
      : '—';
    const typeLabel = item.tx_type === 'income' ? 'Приход' : 'Расход';
    const typeClass = item.tx_type === 'income' ? 'income' : 'expense';
    const businessName = getBusinessNameById(item.business_id);
    return '<tr>' +
      '<td style="text-align:center"><input type="checkbox" class="cash-tx-checkbox" data-id="' + item.id + '" onchange="updateCashTxSelectAllState()" /></td>' +
      '<td>' + dateText + '</td>' +
      '<td><span class="cash-pill ' + typeClass + '">' + typeLabel + '</span></td>' +
      '<td>' + formatMoney(item.amount) + '</td>' +
      '<td>' + (item.category || '—') + '</td>' +
      '<td>' + businessName + '</td>' +
      '<td>' + (item.counterparty || '—') + '</td>' +
      '<td>' + (item.note || '—') + '</td>' +
      '<td style="color:#94a3b8;font-size:12px">' + createdText + '</td>' +
      '<td style="text-align:right;display:flex;justify-content:flex-end;gap:6px">' +
        '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Редактировать" onclick="editCashTransaction(' + item.id + ')">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' +
        '</button>' +
        '<button class="api-btn" style="padding:6px 8px;line-height:0" title="Удалить" onclick="deleteCashTransaction(' + item.id + ')">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
        '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  body.innerHTML = rows;
  updateCashTxSelectAllState();
}

function addCashTransaction() {
  const txDate = document.getElementById('cashTxDate').value;
  const txType = document.getElementById('cashTxType').value;
  const amount = document.getElementById('cashTxAmount').value;
  const category = document.getElementById('cashTxCategory').value.trim();
  const businessId = document.getElementById('cashTxBusiness').value;
  const counterparty = document.getElementById('cashTxCounterparty').value.trim();
  const note = document.getElementById('cashTxNote').value.trim();

  if (!txDate || !amount || Number(amount) <= 0) {
    alert('❌ Укажите дату и сумму');
    return;
  }

  fetch('/api/cash/transactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({
      tx_type: txType,
      amount: Number(amount),
      tx_date: txDate,
      category,
      counterparty,
      note,
      business_id: businessId || null
    })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка сохранения');
    }
    document.getElementById('cashTxAmount').value = '';
    document.getElementById('cashTxCategory').value = '';
    document.getElementById('cashTxCounterparty').value = '';
    document.getElementById('cashTxNote').value = '';
    if (txType === 'expense') {
      document.getElementById('cashTxBusiness').value = businessId;
    }
    closeCashTransactionModal();
    loadCashflowData();
  })
  .catch(err => alert('❌ ' + err.message));
}

function deleteCashTransaction(id) {
  if (!confirm('Удалить операцию?')) return;
  fetch(\`/api/cash/transactions/\${id}\`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка удаления');
    }
    loadCashflowData();
  })
  .catch(err => alert('❌ ' + err.message));
}

function loadCashDebts() {
  fetch('/api/cash/debts', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка загрузки');
    }
    cashDebts = data.items || [];
    restoreDebtOperationsFilters();
    renderCashDebts();
    
    // Восстанавливаем активную подвкладку
    const savedTab = localStorage.getItem('activeDebtSubTab') || 'summary';
    switchDebtSubTab(savedTab);
  })
  .catch(err => {
    const body = document.getElementById('cashDebtsBody');
    body.innerHTML = \`<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">❌ \${err.message}</td></tr>\`;
  });
}

function renderCashDebts() {
  const body = document.getElementById('cashDebtsBody');
  if (!cashDebts.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет записей</td></tr>';
    updateDebtSelectAllState();
    return;
  }

  // Сортировка по дате операции (от новых к старым)
  const sortedDebts = applyDebtOperationsFilters([...cashDebts]).sort((a, b) => {
    const dateA = new Date(a.debt_date || 0);
    const dateB = new Date(b.debt_date || 0);
    return dateB - dateA;
  });

  if (!sortedDebts.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет записей по выбранным фильтрам</td></tr>';
    updateDebtSelectAllState();
    return;
  }

  const rows = sortedDebts.map(item => {
    const debtDate = item.debt_date ? new Date(item.debt_date).toLocaleDateString('ru-RU') : '—';
    const amount = Number(item.amount || 0);
    const isPayment = amount < 0;
    const displayAmount = Math.abs(amount);
    const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
    const typeClass = item.debt_type === 'receivable' ? 'receivable' : 'payable';
    const operationTypeLabel = getDebtOperationLabel(item);
    const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString('ru-RU') : '—';
    const businessName = getBusinessNameById(item.business_id);
    
    return \`
      <tr>
        <td style="text-align:center"><input type="checkbox" class="cash-debt-checkbox" data-id="\${item.id}" onchange="updateDebtSelectAllState()" /></td>
        <td>\${debtDate}</td>
        <td><span class="cash-pill \${typeClass}">\${typeLabel}</span></td>
        <td>\${operationTypeLabel}</td>
        <td>\${isPayment ? '-' : '+'}\${formatMoney(displayAmount)}</td>
        <td>\${item.counterparty || '—'}</td>
        <td>\${dueDate}</td>
        <td>\${businessName}</td>
        <td>\${item.note || '—'}</td>
        <td style="text-align:right;display:flex;justify-content:flex-end;gap:6px">
          <button class="api-btn" style="padding:6px 8px;line-height:0" title="Редактировать" onclick="editCashDebt(\${item.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="api-btn" style="padding:6px 8px;line-height:0" title="Удалить" onclick="deleteCashDebt(\${item.id})">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </td>
      </tr>
    \`;
  }).join('');

  body.innerHTML = rows;
  updateDebtSelectAllState();
}

function addCashDebt() {
  const debtType = document.getElementById('cashDebtType').value;
  const amount = document.getElementById('cashDebtAmount').value;
  const counterparty = document.getElementById('cashDebtCounterparty').value.trim();
  const dueDate = document.getElementById('cashDebtDueDate').value;
  const businessId = document.getElementById('cashDebtBusiness').value;
  const note = document.getElementById('cashDebtNote').value.trim();

  if (!amount || Number(amount) <= 0) {
    alert('❌ Укажите сумму');
    return;
  }

  fetch('/api/cash/debts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({
      debt_type: debtType,
      amount: Number(amount),
      counterparty,
      due_date: dueDate || null,
      business_id: businessId || null,
      note
    })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка сохранения');
    }
    document.getElementById('cashDebtAmount').value = '';
    document.getElementById('cashDebtCounterparty').value = '';
    document.getElementById('cashDebtNote').value = '';
    closeCashDebtModal();
    loadCashDebts();
  })
  .catch(err => alert('❌ ' + err.message));
}

function closeCashDebt(id) {
  fetch(\`/api/cash/debts/\${id}\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('authToken')
    },
    body: JSON.stringify({ status: 'closed' })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка обновления');
    }
    loadCashDebts();
  })
  .catch(err => alert('❌ ' + err.message));
}

function deleteCashDebt(id) {
  if (!confirm('Удалить долг?')) return;
  fetch(\`/api/cash/debts/\${id}\`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      throw new Error(data.error || 'Ошибка удаления');
    }
    loadCashDebts();
  })
  .catch(err => alert('❌ ' + err.message));
}

function editCashDebt(id) {
  const item = cashDebts.find(debt => Number(debt.id) === Number(id));
  if (!item) {
    alert('❌ Запись долга не найдена');
    return;
  }

  currentEditDebtId = Number(id);
  updateCashBusinessOptions();
  updateCounterpartyOptions();

  document.getElementById('editDebtDate').value = item.debt_date ? String(item.debt_date).split('T')[0] : '';
  document.getElementById('editDebtType').value = item.debt_type || 'receivable';
  const amount = Number(item.amount || 0);
  const isPayment = amount < 0;
  const operationType = item.operation_type || (isPayment ? 'decrease' : 'increase');
  document.getElementById('editDebtOperationType').value = operationType;
  document.getElementById('editDebtAmount').value = Math.abs(amount) || '';

  const counterpartySelect = document.getElementById('editDebtCounterparty');
  if (counterpartySelect) {
    if (item.counterparty && !Array.from(counterpartySelect.options).some(o => o.value === item.counterparty)) {
      counterpartySelect.insertAdjacentHTML('beforeend', '<option value="' + escapeHtml(item.counterparty) + '">' + escapeHtml(item.counterparty) + '</option>');
    }
    counterpartySelect.value = item.counterparty || '';
  }

  document.getElementById('editDebtDueDate').value = item.due_date ? String(item.due_date).split('T')[0] : '';

  const businessSelect = document.getElementById('editDebtBusiness');
  if (businessSelect) {
    const businessValue = item.business_id ? String(item.business_id) : '';
    if (businessValue && !Array.from(businessSelect.options).some(o => o.value === businessValue)) {
      businessSelect.insertAdjacentHTML('beforeend', '<option value="' + businessValue + '">' + businessValue + '</option>');
    }
    businessSelect.value = businessValue;
  }

  document.getElementById('editDebtNote').value = item.note || '';

  const modal = document.getElementById('editDebtModal');
  if (modal) modal.classList.add('active');
}

// Показать детальную информацию об отчёте
function showReportSummary() {
  if (!currentFinReportData || currentFinReportData.length === 0) {
    alert('❌ Нет данных финансового отчёта');
    return;
  }
  
  // Берем первую запись для получения общей информации об отчёте
  const reportItem = currentFinReportData[0];
  const reportId = reportItem.realizationreport_id;
  const reportRows = reportId
    ? currentFinReportData.filter(item => item.realizationreport_id === reportId)
    : currentFinReportData;
  
  const currencyCode = reportItem.currency_name || 'RUB';
  const currencySymbol = currencyCode === 'RUB' ? '₽' : currencyCode;
  const formatAmount = (value) => value.toFixed(2) + ' ' + currencySymbol;

  // Считаем итоговые суммы по ВСЕМ записям текущего отчёта
  let totalSales = 0;
  let totalForPay = 0;
  let totalStorage = 0;
  let totalCommission = 0;
  let totalLogistics = 0;
  let totalPenalty = 0;
  let totalAcceptance = 0;
  let totalOtherPayments = 0;
  let totalOtherDeductions = 0;
  
  reportRows.forEach(item => {
    totalSales += Number(item.retail_amount || 0);
    totalForPay += Number(item.ppvz_for_pay || 0);
    totalStorage += Number(item.storage_fee || 0);
    totalCommission += Number(item.ppvz_sales_commission || 0);
    totalLogistics += Number(item.delivery_rub || 0);
    totalPenalty += Number(item.penalty || 0);
    totalAcceptance += Number(item.acceptance || 0);
    totalOtherPayments += Number(item.additional_payment || 0);
    totalOtherDeductions += Number(item.deduction || 0);
  });

  const totalOtherAdjustments = totalOtherDeductions - totalOtherPayments;
  const totalToPay = totalForPay - totalLogistics - totalStorage - totalAcceptance - totalPenalty - totalOtherAdjustments;
  
  // Формируем HTML с информацией
  const content = document.getElementById('reportInfoContent');
  content.innerHTML = 
    '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">' +
      '<div>' +
        '<div style="color:#636e72;font-size:12px;margin-bottom:4px">№ отчета</div>' +
        '<div style="font-size:18px;font-weight:700;color:#2d3436">' + (reportId || '—') + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Юридическое лицо</div>' +
        '<div style="font-size:16px;font-weight:600;color:#2d3436">' + (reportItem.ppvz_supplier_name || '—') + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Период</div>' +
        '<div style="font-size:14px;color:#2d3436">с ' + (reportItem.date_from ? new Date(reportItem.date_from).toLocaleDateString('ru-RU') : '—') + ' по ' + (reportItem.date_to ? new Date(reportItem.date_to).toLocaleDateString('ru-RU') : '—') + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Дата формирования</div>' +
        '<div style="font-size:14px;color:#2d3436">' + (reportItem.create_dt ? new Date(reportItem.create_dt).toLocaleDateString('ru-RU') : '—') + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Тип отчёта</div>' +
        '<div style="font-size:14px;color:#2d3436">' + (reportItem.doc_type_name || 'Основной') + '</div>' +
      '</div>' +
      '<div>' +
        '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Валюта</div>' +
        '<div style="font-size:14px;color:#2d3436">' + (reportItem.currency_name || 'KGS') + '</div>' +
      '</div>' +
    '</div>' +
    
    '<div style="border-top:2px solid #e9ecef;margin:20px 0;padding-top:20px">' +
      '<h3 style="margin:0 0 16px 0;font-size:16px;color:#2d3436">📊 Финансовые показатели</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">' +
        '<div style="background:#e8fff6;padding:16px;border-radius:8px">' +
          '<div style="color:#00b894;font-size:12px;margin-bottom:4px;font-weight:600">Продажа</div>' +
          '<div style="font-size:24px;font-weight:700;color:#00b894">' + formatAmount(totalSales) + '</div>' +
        '</div>' +
        '<div style="background:#e8fff6;padding:16px;border-radius:8px">' +
          '<div style="color:#00b894;font-size:12px;margin-bottom:4px;font-weight:600">К перечислению за товар</div>' +
          '<div style="font-size:24px;font-weight:700;color:#00b894">' + formatAmount(totalForPay) + '</div>' +
        '</div>' +
        '<div style="background:#fff5e8;padding:16px;border-radius:8px">' +
          '<div style="color:#e17055;font-size:12px;margin-bottom:4px;font-weight:600">Стоимость хранения</div>' +
          '<div style="font-size:20px;font-weight:700;color:#e17055">' + formatAmount(totalStorage) + '</div>' +
        '</div>' +
        '<div style="background:#ffe8e8;padding:16px;border-radius:8px">' +
          '<div style="color:#d63031;font-size:12px;margin-bottom:4px;font-weight:600">Комиссия</div>' +
          '<div style="font-size:20px;font-weight:700;color:#d63031">' + formatAmount(totalCommission) + '</div>' +
        '</div>' +
        '<div style="background:#fff5e8;padding:16px;border-radius:8px">' +
          '<div style="color:#e17055;font-size:12px;margin-bottom:4px;font-weight:600">Стоимость логистики</div>' +
          '<div style="font-size:20px;font-weight:700;color:#e17055">' + formatAmount(totalLogistics) + '</div>' +
        '</div>' +
        '<div style="background:#ffe8e8;padding:16px;border-radius:8px">' +
          '<div style="color:#d63031;font-size:12px;margin-bottom:4px;font-weight:600">Общая сумма штрафов</div>' +
          '<div style="font-size:20px;font-weight:700;color:#d63031">' + formatAmount(totalPenalty) + '</div>' +
        '</div>' +
        '<div style="background:#fff5e8;padding:16px;border-radius:8px">' +
          '<div style="color:#e17055;font-size:12px;margin-bottom:4px;font-weight:600">Операции при приемке</div>' +
          '<div style="font-size:20px;font-weight:700;color:#e17055">' + formatAmount(totalAcceptance) + '</div>' +
        '</div>' +
        '<div style="background:#e8f0ff;padding:16px;border-radius:8px">' +
          '<div style="color:#3b82f6;font-size:12px;margin-bottom:4px;font-weight:600">Прочие удержания/выплаты</div>' +
          '<div style="font-size:20px;font-weight:700;color:#3b82f6">' + formatAmount(totalOtherAdjustments) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    '<div style="border-top:2px solid #e9ecef;margin:20px 0;padding-top:20px">' +
      '<h3 style="margin:0 0 12px 0;font-size:16px;color:#2d3436">🏢 Информация о партнёре</h3>' +
      '<div style="display:grid;grid-template-columns:1fr;gap:12px">' +
        '<div>' +
          '<div style="color:#636e72;font-size:12px;margin-bottom:4px">ИНН</div>' +
          '<div style="font-size:14px;color:#2d3436">' + (reportItem.ppvz_inn || '—') + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Номер офиса</div>' +
          '<div style="font-size:14px;color:#2d3436">' + (reportItem.ppvz_office_id || '—') + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Наименование офиса доставки</div>' +
          '<div style="font-size:14px;color:#2d3436">' + (reportItem.ppvz_office_name || '—') + '</div>' +
        '</div>' +
        '<div>' +
          '<div style="color:#636e72;font-size:12px;margin-bottom:4px">Итого к оплате</div>' +
          '<div style="font-size:28px;font-weight:700;color:#00b894">' + formatAmount(totalToPay) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  // Открываем модалку
  document.getElementById('reportInfoModal').style.display = 'flex';
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
  const fallbackImage = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2250%22 height=%2250%22%3E%3Crect width=%2250%22 height=%2250%22 fill=%22%23dfe6e9%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23636e72%22 font-size=%2212%22%3E📦%3C/text%3E%3C/svg%3E";
  
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
          <div class="cost-image-wrap">
            <img 
              src="\${imageUrl}" 
              alt="Товар" 
              class="cost-image"
              onerror="this.src='\${fallbackImage}'"
            />
            <div class="cost-image-preview">
              <img src="\${imageUrl}" alt="Товар" onerror="this.src='\${fallbackImage}'" />
            </div>
          </div>
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
    monthTitle.style.cssText = 'font-weight:700;font-size:14px;color:#cbd5f5;margin-bottom:12px;text-align:center;letter-spacing:0.4px;text-transform:uppercase';
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
      dayElement.style.cssText = 'padding:10px;text-align:center;border-radius:10px;cursor:pointer;font-weight:600;font-size:13px;transition:all 0.2s;border:1px solid transparent;user-select:none';
      
      // Проверяем диапазон
      const isInRange = selectedStartDate && selectedEndDate && 
                        dayDate >= selectedStartDate && dayDate <= selectedEndDate;
      const isStart = selectedStartDate && dayDate.toDateString() === selectedStartDate.toDateString();
      const isEnd = selectedEndDate && dayDate.toDateString() === selectedEndDate.toDateString();
      const dayState = isStart || isEnd ? 'edge' : (isInRange ? 'range' : 'empty');
      dayElement.dataset.state = dayState;
      
      const applyBaseStyles = () => {
        if (dayState === 'edge') {
          dayElement.style.background = 'linear-gradient(135deg,#c7d2fe 0%,#bae6fd 100%)';
          dayElement.style.color = '#0b1220';
          dayElement.style.boxShadow = '0 10px 22px rgba(59,130,246,0.18)';
          dayElement.style.borderColor = 'rgba(147,197,253,0.7)';
        } else if (dayState === 'range') {
          dayElement.style.background = 'rgba(129,140,248,0.22)';
          dayElement.style.color = '#e0e7ff';
          dayElement.style.borderColor = 'rgba(129,140,248,0.35)';
          dayElement.style.boxShadow = 'inset 0 0 0 1px rgba(129,140,248,0.18)';
        } else {
          dayElement.style.background = 'rgba(15,23,42,0.9)';
          dayElement.style.color = '#e2e8f0';
          dayElement.style.boxShadow = 'inset 0 0 0 1px rgba(148,163,184,0.08)';
          dayElement.style.borderColor = 'rgba(148,163,184,0.12)';
        }
      };
      
      applyBaseStyles();
      
      dayElement.onmouseover = () => {
        if (dayState === 'edge') {
          dayElement.style.background = 'linear-gradient(135deg,#bae6fd 0%,#dbeafe 100%)';
          dayElement.style.borderColor = 'rgba(56,189,248,0.75)';
          dayElement.style.boxShadow = '0 12px 26px rgba(56,189,248,0.22)';
          dayElement.style.color = '#0b1220';
        } else if (dayState === 'range') {
          dayElement.style.background = 'rgba(56,189,248,0.18)';
          dayElement.style.borderColor = 'rgba(56,189,248,0.45)';
          dayElement.style.boxShadow = '0 8px 18px rgba(56,189,248,0.18)';
          dayElement.style.color = '#e0f2fe';
        } else {
          dayElement.style.background = 'rgba(56,189,248,0.16)';
          dayElement.style.borderColor = 'rgba(56,189,248,0.4)';
          dayElement.style.boxShadow = '0 6px 16px rgba(56,189,248,0.16)';
          dayElement.style.color = '#e0f2fe';
        }
      };
      dayElement.onmouseout = () => {
        applyBaseStyles();
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
    case 'all':
      selectedStartDate = new Date('2019-01-01');
      break;
  }
  
  updateSelectedDatesDisplay();
  renderCalendar();
}

function resetDateRange() {
  selectedStartDate = null;
  selectedEndDate = null;
  updateSelectedDatesDisplay();
  renderCalendar();
}

async function applyDateRange() {
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

  const isAllTime = toISOString(selectedStartDate) === '2019-01-01';
  if (isAllTime && currentBusinessId && currentBusinessId !== 'all') {
    const shouldSync = await ensureAllTimeData();
    if (shouldSync) {
      loadFinancialData();
      return;
    }
  }

  // Автоматически перезагружаем данные с новым периодом
  loadFinancialData();
}

async function ensureAllTimeData() {
  try {
    const res = await fetch('/api/fin-report-range/' + currentBusinessId, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
    });
    const data = await res.json();
    if (!data.success) return false;
    const minDate = data.range?.minDate ? new Date(data.range.minDate) : null;
    const fullStart = new Date('2019-01-01');
    if (!minDate || minDate > fullStart) {
      const ok = confirm('⚠️ В базе нет данных за весь период. Запустить полную синхронизацию с WB? Это может занять несколько минут.');
      if (!ok) return false;
      const syncRes = await fetch('/api/sync/' + currentBusinessId, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('authToken')
        }
      });
      const syncData = await syncRes.json();
      if (!syncData.success) {
        alert('❌ Ошибка синхронизации: ' + (syncData.error || 'неизвестная ошибка'));
        return false;
      }
      return true;
    }
  } catch (e) {
    console.error('Ошибка проверки all-time:', e);
  }
  return false;
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
    currentFinReportData = []; // Очищаем при отсутствии данных
    return;
  }
  
  // Сохраняем данные глобально для доступа из showReportSummary
  currentFinReportData = data;
  
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
    (appType,dest) => `https://card.wb.ru/cards/v4/detail?appType=${appType}&curr=rub&dest=${dest}&nm=${nm}`,
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
          const products = response?.data?.products || response?.data?.data?.products || [];
          attemptStatuses.push({ url, status: response.status, count: products.length || 0 });
          const product = products.find(p => String(p.id) === String(nm)) || products[0];
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
const IMG_HOST_CACHE = new Map();
app.get('/wb-image', async (req, res) => {
  const nm = req.query.nm;
  const pic = req.query.pic || 1;
  if (!nm) return res.status(400).send('nm required');

  const vol = Math.floor(nm / 100000);
  const part = Math.floor(nm / 1000);
  const cacheKey = String(vol);
  const hostCandidates = [];
  const cachedHost = IMG_HOST_CACHE.get(cacheKey);
  if (cachedHost) hostCandidates.push(cachedHost);
  for (let i = 1; i <= 40; i++) {
    const host = String(i).padStart(2, '0');
    if (!hostCandidates.includes(host)) hostCandidates.push(host);
  }
  
  // Пробуем перебор basket-хостов
  for (const host of hostCandidates) {
    const urls = [
      `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nm}/images/big/${pic}.webp`,
      `https://basket-${host}.wbbasket.ru/vol${vol}/part${part}/${nm}/images/big/${pic}.jpg`
    ];
    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 6000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
          }
        });
        if (response.status >= 200 && response.status < 300) {
          IMG_HOST_CACHE.set(cacheKey, host);
          const contentType = response.headers['content-type'] || 'image/jpeg';
          res.set('Content-Type', contentType);
          res.set('Cache-Control', 'public, max-age=86400');
          return res.send(response.data);
        }
      } catch (e) {
        continue;
      }
    }
  }

  // Фолбэки wbstatic и wb.ru
  const fallbackUrls = [
    `https://images.wbstatic.net/big/new/${vol}0000/${nm}-${pic}.jpg`,
    `https://basket-01.wb.ru/vol${vol}/part${part}/${nm}/images/big/${pic}.jpg`
  ];
  for (const url of fallbackUrls) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
        }
      });
      if (response.status >= 200 && response.status < 300) {
        const contentType = response.headers['content-type'] || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(response.data);
      }
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
    if (!business.wb_api_key || !String(business.wb_api_key).trim()) {
      return res.json({ success: false, error: 'У магазина нет API ключа. Синхронизация недоступна.' });
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

// Диапазон дат финансового отчёта по бизнесу
app.get('/api/fin-report-range/:businessId', requireAuth, async (req, res) => {
  const businessId = parseInt(req.params.businessId);
  const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
  if (!isOwner) {
    return res.json({ success: false, error: 'Доступ запрещён' });
  }
  try {
    const range = await db.getFinancialReportRange(businessId);
    res.json({ success: true, range });
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
    const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nm}`;
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
      (appType,dest) => `https://card.wb.ru/cards/v4/detail?appType=${appType}&curr=rub&dest=${dest}&nm=${nm}`
    ];
    for (const dest of destList) {
      for (const appType of appTypes) {
        for (const buildUrl of endpoints) {
          const url = buildUrl(appType, dest);
          try {
            const response = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0', 'Accept': 'application/json' }, timeout: 10000 });
            const products = response?.data?.products || response?.data?.data?.products || [];
            const product = products.find(p => String(p.id) === String(nm)) || products[0];
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
    const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=${dest}&nm=${nm}`;
    try {
      const r = await axios.get(url, { headers: { 'User-Agent':'WildberriesApp/1.0' }, timeout: 8000 });
      const products = r?.data?.products || r?.data?.data?.products || [];
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
      const products = r?.data?.products || r?.data?.data?.products || [];
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

  // Пробуем v4/detail с разными dest
  for (const d of destCandidates) {
    try {
      const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=${d}&nm=${nm}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'WildberriesApp/1.0', 'Accept': 'application/json' },
        timeout: 10000
      });
      const products = response?.data?.products || response?.data?.data?.products || [];
      if (products.length > 0) {
        product = products.find(p => String(p.id) === String(nm)) || products[0];
        source = `v4/detail`;
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
      const products = response?.data?.products || response?.data?.data?.products || [];
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

  // Главное фото товара - используем прокси, чтобы избежать блокировок CDN
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
    // Проксируем изображение через наш сервер
    mainImage = `/wb-image?nm=${productId}&pic=${picNum}`;
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
        const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=${d}&nm=${nm}`;
        const r = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0' }, timeout: 10000 });
        const products = r?.data?.products || r?.data?.data?.products || [];
        if (products.length) {
          product = products.find(p => String(p.id) === String(nm)) || products[0];
          source = `v4:${d}`;
          break;
        }
      } catch (_) {}
    }

    if (!product) {
      // v1 fallback
      try {
        const url = `https://card.wb.ru/cards/v1/detail?appType=1&curr=rub&nm=${nm}`;
        const r = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0' }, timeout: 10000 });
        const products = r?.data?.products || r?.data?.data?.products || [];
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
    const destUsed = source && source.startsWith('v4:') ? source.split(':')[1] : (dest || '');
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


