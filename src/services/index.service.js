const crypto = require('crypto');
const XLSX = require('xlsx');

const db = require('../../database');
const supabase = require('../../supabase-client');
const { ensureAccountFromAuthUser } = require('../middleware/auth.middleware');
const { renderSidebar, renderProfileModal, renderProfileScript } = require('./page.shared');

module.exports = function createIndexService(deps) {
	function getAuthPage(req, res) {
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
      <form id="resetForm" class="auth-form">
        <div class="form-group">
          <label for="resetPassword">Новый пароль</label>
          <input type="password" id="resetPassword" name="resetPassword" autocomplete="new-password" />
        </div>
        <div class="form-group">
          <label for="resetPasswordConfirm">Повторите пароль</label>
          <input type="password" id="resetPasswordConfirm" name="resetPasswordConfirm" autocomplete="new-password" />
          <div class="hint">Минимум 6 символов</div>
        </div>
        <button type="submit">Сохранить новый пароль</button>
      </form>
	</div>
</div>
<script>
  var recoveryToken = '';

function setActiveTab(tab) {
	var loginTab = document.getElementById('tabLogin');
	var registerTab = document.getElementById('tabRegister');
    var tabSwitch = document.querySelector('.tab-switch');
	var loginForm = document.getElementById('loginForm');
	var registerForm = document.getElementById('registerForm');
    var resetForm = document.getElementById('resetForm');
	var subtitle = document.getElementById('subtitle');
	var err = document.getElementById('error');
	var ok = document.getElementById('success');
	var isLogin = tab === 'login';
    var isRecovery = tab === 'recovery';

    if (tabSwitch) tabSwitch.style.display = isRecovery ? 'none' : 'flex';
    loginTab.classList.toggle('active', isLogin && !isRecovery);
    registerTab.classList.toggle('active', !isLogin && !isRecovery);
    loginForm.classList.toggle('active', isLogin);
    registerForm.classList.toggle('active', !isLogin && !isRecovery);
    if (resetForm) resetForm.classList.toggle('active', isRecovery);
    subtitle.textContent = isRecovery
      ? 'Установите новый пароль'
      : (isLogin
		? 'Войдите для доступа к сервису'
      : 'Создайте аккаунт для доступа к сервису');
	err.style.display = 'none';
	ok.style.display = 'none';
}

  function parseHashParams() {
    var raw = (window.location.hash || '').replace(/^#/, '');
    var result = {};
    if (!raw) return result;
    raw.split('&').forEach(function(pair) {
      if (!pair) return;
      var idx = pair.indexOf('=');
      var key = idx >= 0 ? pair.slice(0, idx) : pair;
      var val = idx >= 0 ? pair.slice(idx + 1) : '';
      result[decodeURIComponent(key)] = decodeURIComponent(val || '');
    });
    return result;
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
	var username = (document.getElementById('regUsername').value || '').trim();
	var email = (document.getElementById('regEmail').value || '').trim();
	var password = (document.getElementById('regPassword').value || '').trim();
	if (!username) {
		var err = document.getElementById('error');
		err.textContent = 'Логин обязателен';
		err.style.display = 'block';
		return;
	}
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

document.getElementById('resetForm').onsubmit = function(e) {
  e.preventDefault();
  var password = String((document.getElementById('resetPassword') || {}).value || '');
  var confirm = String((document.getElementById('resetPasswordConfirm') || {}).value || '');
  var err = document.getElementById('error');
  var ok = document.getElementById('success');

  if (!recoveryToken) {
    err.textContent = 'Ссылка восстановления недействительна или устарела';
    err.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    err.textContent = 'Пароль должен быть не короче 6 символов';
    err.style.display = 'block';
    return;
  }
  if (password !== confirm) {
    err.textContent = 'Пароли не совпадают';
    err.style.display = 'block';
    return;
  }

  fetch('/api/auth/reset-password-confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + recoveryToken
    },
    body: JSON.stringify({ password: password })
  })
  .then(function(r){return r.json();})
  .then(function(data){
    if (data.success) {
      err.style.display = 'none';
      ok.textContent = data.message || 'Пароль обновлён. Войдите с новым паролем.';
      ok.style.display = 'block';
      history.replaceState(null, '', '/auth');
      recoveryToken = '';
      setActiveTab('login');
    } else {
      ok.style.display = 'none';
      err.textContent = data.error || 'Не удалось обновить пароль';
      err.style.display = 'block';
    }
  })
  .catch(function(){
    err.textContent = 'Ошибка соединения';
    err.style.display = 'block';
  });
};

var params = new URLSearchParams(window.location.search);
var hash = parseHashParams();
var mode = params.get('mode');
if ((hash.type === 'recovery' || mode === 'recovery') && hash.access_token) {
  recoveryToken = hash.access_token;
  setActiveTab('recovery');
} else {
  setActiveTab(params.get('tab') === 'register' ? 'register' : 'login');
}
</script></body></html>`);
	}

	function getLoginPage(req, res) {
		res.redirect('/auth');
	}

	function getRegisterPage(req, res) {
		res.redirect('/auth?tab=register');
	}

	function getLogout(req, res) {
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
	}

	async function postLogin(req, res) {
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
	}

	async function postRegister(req, res) {
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

			const { error } = await supabase.auth.signUp({
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
	}

	function getProfile(req, res) {
		return (async () => {
			try {
				const account = await db.getAccountById(req.account.id);
				if (!account) {
					return res.json({ success: false, error: 'Аккаунт не найден' });
				}
				res.json({
					success: true,
					profile: {
						id: account.id,
						username: account.username || '',
						email: account.email || ''
					}
				});
			} catch (error) {
				res.json({ success: false, error: error.message });
			}
		})();
	}

	function postProfile(req, res) {
		return (async () => {
			const emailRaw = String(req.body?.email || '').trim();
			const email = emailRaw || null;

			try {
				await db.updateAccountProfile(req.account.id, { email });
				const account = await db.getAccountById(req.account.id);
				res.json({
					success: true,
					profile: {
						id: account.id,
						username: account.username || '',
						email: account.email || ''
					}
				});
			} catch (error) {
				res.json({ success: false, error: error.message });
			}
		})();
	}

  function postProfileResetPassword(req, res) {
    return (async () => {
      try {
        const account = await db.getAccountById(req.account.id);
        if (!account) {
          return res.json({ success: false, error: 'Аккаунт не найден' });
        }

        const email = String(req.body?.email || account.email || '').trim();
        if (!email || !email.includes('@')) {
          return res.json({ success: false, error: 'Укажите корректный email' });
        }

        const origin = `${req.protocol}://${req.get('host')}`;
        const redirectTo = `${origin}/auth?mode=recovery`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
          return res.json({ success: false, error: error.message || 'Не удалось отправить письмо' });
        }

        res.json({
          success: true,
          message: 'Письмо для сброса пароля отправлено на email'
        });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    })();
  }

	function getCounterparties(req, res) {
		return (async () => {
			const search = req.query.q || null;
			try {
				const items = await db.getCounterparties(req.account.id, search);
				res.json({ success: true, items });
			} catch (error) {
				res.json({ success: false, error: error.message });
			}
		})();
	}

  function postAuthResetPasswordConfirm(req, res) {
    return (async () => {
      try {
        const authHeader = String(req.headers.authorization || '');
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!token) {
          return res.status(401).json({ success: false, error: 'Токен восстановления не найден' });
        }

        const password = String(req.body?.password || '');
        if (password.length < 6) {
          return res.json({ success: false, error: 'Пароль должен быть не короче 6 символов' });
        }

        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData?.user?.id) {
          return res.status(401).json({ success: false, error: 'Ссылка восстановления недействительна или истекла' });
        }

        const { error: updateError } = await supabase.auth.admin.updateUserById(userData.user.id, {
          password
        });
        if (updateError) {
          return res.json({ success: false, error: updateError.message || 'Не удалось обновить пароль' });
        }

        res.json({ success: true, message: 'Пароль успешно обновлён. Теперь войдите с новым паролем.' });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    })();
  }

	function postCounterparties(req, res) {
		return (async () => {
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
		})();
	}

	function getCashCategories(req, res) {
		return (async () => {
			const search = req.query.q || null;
			try {
				const items = await db.getCashCategories(req.account.id, search);
				res.json({ success: true, items });
			} catch (error) {
				res.json({ success: false, error: error.message });
			}
		})();
	}

	function postCashCategories(req, res) {
		return (async () => {
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
		})();
	}

	async function getCashTransactions(req, res) {
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
	}

	async function postCashTransactions(req, res) {
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
	}

	async function putCashTransaction(req, res) {
		const txId = parseInt(req.params.id);
		const updates = { ...req.body };

		if (updates.business_id) {
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
	}

	async function deleteCashTransactionsBulk(req, res) {
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
	}

	async function deleteCashTransaction(req, res) {
		const txId = parseInt(req.params.id);

		try {
			const success = await db.deleteCashTransaction(req.account.id, txId);
			res.json({ success });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getCashSummary(req, res) {
		const dateFrom = req.query.dateFrom || null;
		const dateTo = req.query.dateTo || null;

		try {
			const summary = await db.getCashSummary(req.account.id, dateFrom, dateTo);
			res.json({ success: true, summary });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getCashDebts(req, res) {
		const status = req.query.status || null;

		try {
			await db.normalizeCashDebtGroups(req.account.id);
			const items = await db.getCashDebts(req.account.id, status);
			res.json({ success: true, items });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function postCashDebts(req, res) {
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
			const openDebtGroup = await db.findOpenDebtGroup(req.account.id, counterparty, debt_type, business_id);
			const amountValue = Number(amount);

			if (openDebtGroup && amountValue !== 0) {
				const currentBalance = Number(openDebtGroup.balance || 0);
				const newBalance = currentBalance + amountValue;

				if (currentBalance !== 0 && Math.sign(currentBalance) !== Math.sign(newBalance) && Math.abs(newBalance) > 0.01) {
					const closeAmount = -currentBalance;
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
				debt_group_id: openDebtGroup ? openDebtGroup.debt_group_id : null
			});
			res.json({ success: true, item });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function recalculateCashDebts(req, res) {
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
	}

	async function putCashDebt(req, res) {
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
	}

	async function deleteCashDebtsBulk(req, res) {
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
	}

	async function deleteCashDebt(req, res) {
		const debtId = parseInt(req.params.id);

		try {
			const success = await db.deleteCashDebt(req.account.id, debtId);
			res.json({ success });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function exportCashDebtsXlsx(req, res) {
		try {
			const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
			if (!rows.length) {
				return res.status(400).json({ success: false, error: 'Нет данных для экспорта' });
			}

			const headers = ['Дата операции', 'Тип', 'Операция', 'Сумма', 'Контрагент', 'Срок', 'Магазин', 'Комментарий'];

			const normalizedRows = rows.map((row) => ({
				'Дата операции': row && row['Дата операции'] != null ? String(row['Дата операции']) : '—',
				'Тип': row && row['Тип'] != null ? String(row['Тип']) : '—',
				'Операция': row && row['Операция'] != null ? String(row['Операция']) : '—',
				'Сумма': row && row['Сумма'] != null ? String(row['Сумма']) : '—',
				'Контрагент': row && row['Контрагент'] != null ? String(row['Контрагент']) : '—',
				'Срок': row && row['Срок'] != null ? String(row['Срок']) : '—',
				'Магазин': row && row['Магазин'] != null ? String(row['Магазин']) : '—',
				'Комментарий': row && row['Комментарий'] != null ? String(row['Комментарий']) : '—'
			}));

			const worksheet = XLSX.utils.json_to_sheet(normalizedRows, { header: headers });

			const widthMatrix = [headers].concat(
				normalizedRows.map((row) => headers.map((header) => {
					const value = row[header] == null ? '' : String(row[header]);
					return value;
				}))
			);

			const minWidths = {
				'Дата операции': 14,
				'Тип': 14,
				'Операция': 14,
				'Сумма': 14,
				'Контрагент': 18,
				'Срок': 10,
				'Магазин': 12,
				'Комментарий': 24
			};

			worksheet['!cols'] = headers.map((header, colIdx) => {
				const maxLen = widthMatrix.reduce((max, row) => {
					const len = (row[colIdx] || '').length;
					return len > max ? len : max;
				}, 0);
				const bounded = Math.max(minWidths[header] || 10, Math.min(maxLen + 2, 60));
				return { wch: bounded };
			});

			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Долги');
			const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
			const date = new Date().toISOString().slice(0, 10);

			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', `attachment; filename="debt-operations-${date}.xlsx"`);
			return res.send(fileBuffer);
		} catch (error) {
			return res.status(500).json({ success: false, error: error.message || 'Ошибка экспорта XLSX' });
		}
	}

  async function exportCashDebtSummaryXlsx(req, res) {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length) {
        return res.status(400).json({ success: false, error: 'Нет данных для экспорта' });
      }

      const headers = ['Контрагент', 'Тип', 'Прогресс', 'Магазин', 'Всего', 'Оплачено', 'Остаток', 'Статус'];

      const normalizedRows = rows.map((row) => ({
        'Контрагент': row && row['Контрагент'] != null ? String(row['Контрагент']) : '—',
        'Тип': row && row['Тип'] != null ? String(row['Тип']) : '—',
        'Прогресс': row && row['Прогресс'] != null ? String(row['Прогресс']) : '—',
        'Магазин': row && row['Магазин'] != null ? String(row['Магазин']) : '—',
        'Всего': row && row['Всего'] != null ? String(row['Всего']) : '—',
        'Оплачено': row && row['Оплачено'] != null ? String(row['Оплачено']) : '—',
        'Остаток': row && row['Остаток'] != null ? String(row['Остаток']) : '—',
        'Статус': row && row['Статус'] != null ? String(row['Статус']) : '—'
      }));

      const worksheet = XLSX.utils.json_to_sheet(normalizedRows, { header: headers });

      const widthMatrix = [headers].concat(
        normalizedRows.map((row) => headers.map((header) => {
          const value = row[header] == null ? '' : String(row[header]);
          return value;
        }))
      );

      const minWidths = {
        'Контрагент': 20,
        'Тип': 14,
        'Прогресс': 12,
        'Магазин': 14,
        'Всего': 14,
        'Оплачено': 14,
        'Остаток': 14,
        'Статус': 12
      };

      worksheet['!cols'] = headers.map((header, colIdx) => {
        const maxLen = widthMatrix.reduce((max, row) => {
          const len = (row[colIdx] || '').length;
          return len > max ? len : max;
        }, 0);
        const bounded = Math.max(minWidths[header] || 10, Math.min(maxLen + 2, 60));
        return { wch: bounded };
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Список контрагентов');
      const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const date = new Date().toISOString().slice(0, 10);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="debt-summary-${date}.xlsx"`);
      return res.send(fileBuffer);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message || 'Ошибка экспорта XLSX' });
    }
  }

	function getHomePage(req, res) {
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
.layout{display:flex;gap:18px;min-height:calc(100vh - 48px);padding-left:110px}
.sidebar{width:92px;flex:0 0 92px;background:rgba(10,16,30,0.92);border:1px solid rgba(148,163,184,0.12);border-radius:0;box-shadow:0 20px 50px rgba(2,6,23,0.45);padding:10px 8px;position:fixed;left:0;top:0;bottom:0;align-self:flex-start;height:100vh;display:flex;flex-direction:column;gap:14px;z-index:30;margin-top:0}
.sidebar-footer{margin-top:auto}
.sidebar-top{display:flex;justify-content:center;padding:6px 0 2px;position:relative;z-index:31}
.sidebar-top-icon{width:38px;height:38px;border-radius:14px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:12px;letter-spacing:0.3px;border:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
.sidebar-top-icon:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(56,189,248,0.28)}
.sidebar-top-icon svg{width:18px;height:18px;stroke:#0b1220;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.profile-modal-content{width:min(920px,calc(100vw - 48px));max-height:calc(100vh - 48px);overflow:auto}
.profile-layout{display:grid;grid-template-columns:170px 1fr;gap:22px;align-items:start}
.profile-avatar{width:150px;height:150px;border-radius:50%;border:6px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 28px rgba(0,0,0,0.35)}
.profile-avatar svg{width:72px;height:72px;stroke:#94a3b8;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.profile-form-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px 16px}
.profile-field{display:flex;flex-direction:column;gap:6px}
.profile-field.full{grid-column:1 / -1}
.profile-actions{display:flex;justify-content:flex-end;margin-top:14px}
.main{flex:1;min-width:0;position:relative;z-index:2}
.sidebar-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:66px;padding:8px 4px;border-radius:16px;border:1px solid rgba(148,163,184,0.16);background:rgba(12,18,34,0.7);color:#e2e8f0;text-decoration:none;text-align:center;transition:all 0.2s;box-shadow:0 10px 22px rgba(2,6,23,0.35)}
.sidebar-icon{width:28px;height:28px;border-radius:10px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);display:flex;align-items:center;justify-content:center}
.sidebar-icon svg{width:16px;height:16px;stroke:#7dd3fc;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.sidebar-text{font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:#cbd5f5;line-height:1.2}
.sidebar-link:hover{border-color:rgba(56,189,248,0.55);background:rgba(15,23,42,0.85)}
.sidebar-link:hover .sidebar-icon{background:rgba(56,189,248,0.18);border-color:rgba(56,189,248,0.55)}
.sidebar-link:hover .sidebar-text{color:#fff}
.sidebar-link.logout .sidebar-icon{background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.35)}
.sidebar-link.logout .sidebar-icon svg{stroke:#fca5a5}
.sidebar-link.logout:hover{border-color:rgba(239,68,68,0.55);background:rgba(15,23,42,0.85);box-shadow:0 10px 22px rgba(239,68,68,0.2)}
.sidebar-link.logout:hover .sidebar-text{color:#fff}
.sidebar-link.logout:hover .sidebar-icon{background:rgba(239,68,68,0.18);border-color:rgba(239,68,68,0.55)}
.sidebar-link.logout:hover .sidebar-icon svg{stroke:#fecaca}
.main{flex:1;min-width:0}
.container{width:100%;max-width:none;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:26px 26px 30px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
@media (max-width: 900px){
  .layout{flex-direction:column;padding-left:0}
  .sidebar{width:100%;height:auto;position:relative;left:auto;top:auto;bottom:auto;margin-top:0}
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
.cash-tabs-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.cash-tabs{display:flex;gap:8px;margin-bottom:0}
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
.debt-summary-table{table-layout:fixed}
.debt-summary-table th:nth-child(2),.debt-summary-table td:nth-child(2){width:260px;min-width:260px;max-width:260px}
.debt-summary-counterparty{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
  ${renderSidebar('/')}
  <main class="main">
    <div class="container">
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

  <div class="cash-tabs-row">
    <div class="cash-tabs">
      <button id="cashTabTransactions" class="cash-tab-btn active" onclick="switchCashTab('transactions')">Движение</button>
      <button id="cashTabDebts" class="cash-tab-btn" onclick="switchCashTab('debts')">Долги</button>
      <button id="cashTabStocks" class="cash-tab-btn" onclick="switchCashTab('stocks')">Запасы</button>
    </div>
    <button id="cashDateRangeBtn" onclick="openCashDateRangePicker()" class="range-btn">
      <span style="font-size:16px">📅</span>
      <span>Период:</span>
      <span id="cashDateRangeDisplay" class="range-value">—</span>
    </button>
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
          <div class="filter-menu">
            <button id="debtSummaryTypeFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtSummaryTypeMenu(event)">Все типы</button>
            <div id="debtSummaryTypeMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all" onclick="setDebtSummaryTypeFilter('all')">Все типы</div>
              <div class="filter-item" data-value="receivable" onclick="setDebtSummaryTypeFilter('receivable')">Нам должны</div>
              <div class="filter-item" data-value="payable" onclick="setDebtSummaryTypeFilter('payable')">Мы должны</div>
            </div>
          </div>
          <div class="filter-menu">
            <button id="debtSummaryCounterpartyFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtSummaryCounterpartyMenu(event)">Все контрагенты</button>
            <div id="debtSummaryCounterpartyMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all">Все контрагенты</div>
            </div>
          </div>
          <div class="filter-menu">
            <button id="debtSummaryBusinessFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtSummaryBusinessMenu(event)">Все магазины</button>
            <div id="debtSummaryBusinessMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all">Все магазины</div>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button id="debtSummaryExportBtn" class="api-btn" style="padding:6px 10px" onclick="exportDebtSummaryToExcel()">Скачать Excel</button>
          <button id="debtSummaryBulkDeleteBtn" class="api-btn" style="padding:6px 10px" onclick="deleteSelectedDebtSummaries()" disabled>Удалить выбранные</button>
        </div>
      </div>
      <div style="max-height:60vh;overflow:auto">
        <table class="cash-table debt-summary-table">
          <thead>
            <tr>
              <th style="width:32px;text-align:center"><input type="checkbox" id="debtSummarySelectAll" onclick="toggleAllDebtSummaryCheckboxes(this)" /></th>
              <th>Контрагент</th>
              <th>Тип</th>
              <th style="min-width:80px;text-align:center">Прогресс</th>
              <th>Магазин</th>
              <th>Всего</th>
              <th>Оплачено</th>
              <th>Остаток</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="debtSummaryBody">
            <tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
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
          <div class="filter-menu">
            <button id="cashDebtCounterpartyFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtCounterpartyMenu(event)">Все контрагенты</button>
            <div id="cashDebtCounterpartyMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all">Все контрагенты</div>
            </div>
          </div>
          <div class="filter-menu">
            <button id="cashDebtBusinessFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px" onclick="toggleDebtBusinessMenu(event)">Все магазины</button>
            <div id="cashDebtBusinessMenu" class="filter-dropdown">
              <div class="filter-item" data-value="all">Все магазины</div>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button id="cashDebtExportBtn" class="api-btn" style="padding:6px 10px" onclick="exportCashDebtOperationsToExcel()">Скачать Excel</button>
          <button id="cashDebtBulkDeleteBtn" class="api-btn" style="padding:6px 10px" onclick="deleteSelectedCashDebts()" disabled>Удалить выбранные</button>
        </div>
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
              <th>Создана</th>
              <th style="text-align:right">Действия</th>
            </tr>
          </thead>
          <tbody id="cashDebtsBody">
            <tr><td colspan="11" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
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
              <th>Артикул продавца</th>
              <th>Артикул WB</th>
              <th style="text-align:right">Доступно на складе</th>
              <th style="text-align:right">В пути до получателей</th>
              <th style="text-align:right">В пути возвраты на склад WB</th>
              <th style="text-align:right">Всего находится на складах</th>
              <th style="text-align:right">Себестоимость</th>
              <th style="text-align:right">Сумма</th>
            </tr>
          </thead>
          <tbody id="cashStocksBody">
            <tr><td colspan="11" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
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

${renderProfileModal()}

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

${renderProfileScript()}
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
  renderCashDebts();
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
    body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Нет магазинов с API ключом</td></tr>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>';
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
    body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Ошибка: ' + escapeHtml(err.message) + '</td></tr>';
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
    body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Нет данных</td></tr>';
    if (countEl) countEl.textContent = '0';
    return;
  }

  const rows = cashStocksItems.map(item => {
    const business = businesses.find(b => b.id === item.business_id);
    const businessName = business ? business.company_name : '—';
    const sellerArticle = item.seller_article || '—';
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
      '<td>' + escapeHtml(sellerArticle) + '</td>' +
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
    restoreDebtSummaryFilters();
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

  const filteredSummaries = applyDebtSummaryFilters(summaries);

  const nextSummaryIndex = {};
  filteredSummaries.forEach(item => {
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
  filteredSummaries.sort((a, b) => {
    // Сначала по статусу (открытые выше)
    if (!a.isClosed && b.isClosed) return -1;
    if (a.isClosed && !b.isClosed) return 1;
    
    // Внутри каждой группы - по проценту выполнения (больше процент = выше)
    return b.percent - a.percent;
  });
  
  if (!filteredSummaries.length) {
    body.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:16px">Нет долгов по выбранным фильтрам</td></tr>';
    updateDebtSummarySelectAllState();
    return;
  }
  
  const rows = filteredSummaries.map(item => {
    const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
    const typeClass = item.debt_type === 'receivable' ? 'receivable' : 'payable';
    const counterpartyText = item.counterparty || '—';
    const counterpartyTitle = String(counterpartyText)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
      '<td><span class="debt-summary-counterparty" title="' + counterpartyTitle + '">' + counterpartyText + '</span></td>' +
      '<td><span class="cash-pill ' + typeClass + '">' + typeLabel + '</span></td>' +
      '<td style="text-align:center;vertical-align:middle">' + progressBar + '</td>' +
      '<td>' + businessName + '</td>' +
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

async function exportDebtSummaryToExcel() {
  if (!Array.isArray(cashDebts) || !cashDebts.length) {
    alert('❌ Нет данных для экспорта');
    return;
  }

  const summary = {};
  cashDebts.forEach(debt => {
    const groupId = (debt.debt_group_id && debt.debt_group_id !== 'null') ? debt.debt_group_id : debt.id;
    if (!summary[groupId]) {
      summary[groupId] = {
        group_id: groupId,
        counterparty: debt.counterparty || 'Без контрагента',
        debt_type: debt.debt_type,
        total_amount: 0,
        paid_amount: 0,
        business_id: debt.business_id
      };
    }
    const amount = Number(debt.amount || 0);
    if (amount > 0) {
      summary[groupId].total_amount += amount;
    } else {
      summary[groupId].paid_amount += Math.abs(amount);
    }
  });

  const summaries = Object.values(summary).map(item => {
    const remainder = item.total_amount - item.paid_amount;
    const isClosed = Math.abs(remainder) < 0.01;
    const percent = item.total_amount > 0 ? (item.paid_amount / item.total_amount) * 100 : 0;
    return {
      ...item,
      remainder,
      isClosed,
      statusLabel: isClosed ? 'Закрыт' : 'Открыт',
      percent
    };
  });

  const filteredSummaries = applyDebtSummaryFilters(summaries).sort((a, b) => {
    if (!a.isClosed && b.isClosed) return -1;
    if (a.isClosed && !b.isClosed) return 1;
    return b.percent - a.percent;
  });

  const selectedGroupIds = new Set(
    Array.from(document.querySelectorAll('#debtSummaryBody .debt-summary-checkbox:checked'))
      .map(cb => String(cb.dataset.groupId || ''))
      .filter(Boolean)
  );

  const rowsToExport = selectedGroupIds.size
    ? filteredSummaries.filter(item => selectedGroupIds.has(String(item.group_id)))
    : filteredSummaries;

  if (!rowsToExport.length) {
    alert('❌ Нет данных для экспорта по текущим фильтрам/выбору');
    return;
  }

  const exportRows = rowsToExport.map(item => {
    const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
    const businessName = getBusinessNameById(item.business_id);
    const percent = item.total_amount > 0 ? Math.max(0, Math.min(100, Math.round((item.paid_amount / item.total_amount) * 100))) : 0;

    return {
      'Контрагент': item.counterparty || '—',
      'Тип': typeLabel,
      'Прогресс': percent + '%',
      'Магазин': businessName || '—',
      'Всего': formatMoney(item.total_amount),
      'Оплачено': formatMoney(item.paid_amount),
      'Остаток': formatMoney(item.remainder),
      'Статус': item.statusLabel || '—'
    };
  });

  try {
    const response = await fetch('/api/cash/debts/summary-export-xlsx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({ rows: exportRows })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || ('HTTP ' + response.status));
    }

    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    link.download = 'debt-summary-' + date + '.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert('❌ ' + (err && err.message ? err.message : 'Ошибка экспорта XLSX'));
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
  const counterpartyValue = localStorage.getItem('cashDebtCounterpartyFilter') || 'all';
  const businessValue = localStorage.getItem('cashDebtBusinessFilter') || 'all';
  return { operationValue, typeValue, counterpartyValue, businessValue };
}

function restoreDebtOperationsFilters() {
  localStorage.setItem('cashDebtOperationFilter', 'all');
  localStorage.setItem('cashDebtTypeFilter', 'all');
  localStorage.setItem('cashDebtCounterpartyFilter', 'all');
  localStorage.setItem('cashDebtBusinessFilter', 'all');
  rebuildDebtCounterpartyMenu();
  rebuildDebtBusinessMenu();
  updateDebtFilterButtons();
}

function getDebtSummaryFilterValues() {
  const typeValue = localStorage.getItem('debtSummaryTypeFilter') || 'all';
  const counterpartyValue = localStorage.getItem('debtSummaryCounterpartyFilter') || 'all';
  const businessValue = localStorage.getItem('debtSummaryBusinessFilter') || 'all';
  return { typeValue, counterpartyValue, businessValue };
}

function applyDebtSummaryFilters(items) {
  const { typeValue, counterpartyValue, businessValue } = getDebtSummaryFilterValues();
  return (items || []).filter(item => {
    if (typeValue !== 'all' && item.debt_type !== typeValue) return false;
    if (counterpartyValue !== 'all' && String(item.counterparty || '') !== counterpartyValue) return false;
    if (businessValue !== 'all') {
      const itemBusiness = item && item.business_id != null ? String(item.business_id) : '__none__';
      if (itemBusiness !== businessValue) return false;
    }
    return true;
  });
}

function restoreDebtSummaryFilters() {
  localStorage.setItem('debtSummaryTypeFilter', 'all');
  localStorage.setItem('debtSummaryCounterpartyFilter', 'all');
  localStorage.setItem('debtSummaryBusinessFilter', 'all');
  rebuildDebtSummaryCounterpartyMenu();
  rebuildDebtSummaryBusinessMenu();
  updateDebtSummaryFilterButtons();
}

function rebuildDebtSummaryCounterpartyMenu() {
  const menu = document.getElementById('debtSummaryCounterpartyMenu');
  if (!menu) return;

  const uniqueCounterparties = Array.from(new Set(
    (cashDebts || []).map(item => String(item && item.counterparty ? item.counterparty : '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'ru'));

  const html = ['<div class="filter-item" data-value="all">Все контрагенты</div>'];
  uniqueCounterparties.forEach(name => {
    const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
    html.push('<div class="filter-item" data-value="' + safeName + '">' + safeName + '</div>');
  });

  menu.innerHTML = html.join('');
  menu.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', () => {
      setDebtSummaryCounterpartyFilter(item.dataset.value || 'all');
    });
  });
}

function rebuildDebtSummaryBusinessMenu() {
  const menu = document.getElementById('debtSummaryBusinessMenu');
  if (!menu) return;

  const uniqueBusinessIds = Array.from(new Set(
    (cashDebts || [])
      .map(item => (item && item.business_id != null ? String(item.business_id) : '__none__'))
  ));

  const html = ['<div class="filter-item" data-value="all">Все магазины</div>'];
  uniqueBusinessIds.forEach(idValue => {
    if (idValue === 'all') return;
    const label = idValue === '__none__' ? 'Без магазина' : getBusinessNameById(Number(idValue));
    const safeLabel = String(label || 'Без магазина')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
    html.push('<div class="filter-item" data-value="' + idValue + '">' + safeLabel + '</div>');
  });

  menu.innerHTML = html.join('');
  menu.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', () => {
      setDebtSummaryBusinessFilter(item.dataset.value || 'all');
    });
  });
}

function updateDebtSummaryFilterButtons() {
  const typeBtn = document.getElementById('debtSummaryTypeFilterBtn');
  const counterpartyBtn = document.getElementById('debtSummaryCounterpartyFilterBtn');
  const businessBtn = document.getElementById('debtSummaryBusinessFilterBtn');
  const typeMenu = document.getElementById('debtSummaryTypeMenu');
  const counterpartyMenu = document.getElementById('debtSummaryCounterpartyMenu');
  const businessMenu = document.getElementById('debtSummaryBusinessMenu');
  const { typeValue, counterpartyValue, businessValue } = getDebtSummaryFilterValues();

  if (typeBtn) {
    typeBtn.textContent = typeValue === 'receivable' ? 'Нам должны' : typeValue === 'payable' ? 'Мы должны' : 'Все типы';
  }
  if (counterpartyBtn) {
    counterpartyBtn.textContent = counterpartyValue === 'all' ? 'Все контрагенты' : counterpartyValue;
  }
  if (businessBtn) {
    if (businessValue === 'all') {
      businessBtn.textContent = 'Все магазины';
    } else if (businessValue === '__none__') {
      businessBtn.textContent = 'Без магазина';
    } else {
      businessBtn.textContent = getBusinessNameById(Number(businessValue));
    }
  }
  if (typeMenu) {
    typeMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === typeValue);
    });
  }
  if (counterpartyMenu) {
    counterpartyMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === counterpartyValue);
    });
  }
  if (businessMenu) {
    businessMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === businessValue);
    });
  }
}

function rebuildDebtCounterpartyMenu() {
  const menu = document.getElementById('cashDebtCounterpartyMenu');
  if (!menu) return;
  const uniqueCounterparties = Array.from(new Set(
    (cashDebts || []).map(item => String(item && item.counterparty ? item.counterparty : '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'ru'));

  const html = ['<div class="filter-item" data-value="all">Все контрагенты</div>'];
  uniqueCounterparties.forEach(name => {
    const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
    html.push('<div class="filter-item" data-value="' + safeName + '">' + safeName + '</div>');
  });
  menu.innerHTML = html.join('');
  menu.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', () => {
      setDebtCounterpartyFilter(item.dataset.value || 'all');
    });
  });
}

function rebuildDebtBusinessMenu() {
  const menu = document.getElementById('cashDebtBusinessMenu');
  if (!menu) return;

  const uniqueBusinessIds = Array.from(new Set(
    (cashDebts || [])
      .map(item => (item && item.business_id != null ? String(item.business_id) : '__none__'))
  ));

  const html = ['<div class="filter-item" data-value="all">Все магазины</div>'];
  uniqueBusinessIds.forEach(idValue => {
    if (idValue === 'all') return;
    const label = idValue === '__none__' ? 'Без магазина' : getBusinessNameById(Number(idValue));
    const safeLabel = String(label || 'Без магазина')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
    html.push('<div class="filter-item" data-value="' + idValue + '">' + safeLabel + '</div>');
  });

  menu.innerHTML = html.join('');
  menu.querySelectorAll('.filter-item').forEach(item => {
    item.addEventListener('click', () => {
      setDebtBusinessFilter(item.dataset.value || 'all');
    });
  });
}

function updateDebtFilterButtons() {
  const operationBtn = document.getElementById('cashDebtOperationFilterBtn');
  const typeBtn = document.getElementById('cashDebtTypeFilterBtn');
  const counterpartyBtn = document.getElementById('cashDebtCounterpartyFilterBtn');
  const businessBtn = document.getElementById('cashDebtBusinessFilterBtn');
  const operationMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const counterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  const operationValue = localStorage.getItem('cashDebtOperationFilter') || 'all';
  const typeValue = localStorage.getItem('cashDebtTypeFilter') || 'all';
  const counterpartyValue = localStorage.getItem('cashDebtCounterpartyFilter') || 'all';
  const businessValue = localStorage.getItem('cashDebtBusinessFilter') || 'all';
  if (operationBtn) {
    operationBtn.textContent = operationValue === 'increase' ? 'Начисления' : operationValue === 'decrease' ? 'Погашения' : 'Все операции';
  }
  if (typeBtn) {
    typeBtn.textContent = typeValue === 'receivable' ? 'Нам должны' : typeValue === 'payable' ? 'Мы должны' : 'Все типы';
  }
  if (counterpartyBtn) {
    counterpartyBtn.textContent = counterpartyValue === 'all' ? 'Все контрагенты' : counterpartyValue;
  }
  if (businessBtn) {
    if (businessValue === 'all') {
      businessBtn.textContent = 'Все магазины';
    } else if (businessValue === '__none__') {
      businessBtn.textContent = 'Без магазина';
    } else {
      businessBtn.textContent = getBusinessNameById(Number(businessValue));
    }
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
  if (counterpartyMenu) {
    counterpartyMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === counterpartyValue);
    });
  }
  if (businessMenu) {
    businessMenu.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.value === businessValue);
    });
  }
}

function toggleDebtOperationMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const counterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  if (typeMenu) typeMenu.classList.remove('open');
  if (counterpartyMenu) counterpartyMenu.classList.remove('open');
  if (businessMenu) businessMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtTypeMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashDebtTypeMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const counterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  if (opMenu) opMenu.classList.remove('open');
  if (counterpartyMenu) counterpartyMenu.classList.remove('open');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  if (businessMenu) businessMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtCounterpartyMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashDebtCounterpartyMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  if (opMenu) opMenu.classList.remove('open');
  if (typeMenu) typeMenu.classList.remove('open');
  if (businessMenu) businessMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtBusinessMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('cashDebtBusinessMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const counterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  if (opMenu) opMenu.classList.remove('open');
  if (typeMenu) typeMenu.classList.remove('open');
  if (counterpartyMenu) counterpartyMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtSummaryTypeMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('debtSummaryTypeMenu');
  const counterpartyMenu = document.getElementById('debtSummaryCounterpartyMenu');
  const summaryBusinessMenu = document.getElementById('debtSummaryBusinessMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const debtCounterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  if (counterpartyMenu) counterpartyMenu.classList.remove('open');
  if (summaryBusinessMenu) summaryBusinessMenu.classList.remove('open');
  if (opMenu) opMenu.classList.remove('open');
  if (typeMenu) typeMenu.classList.remove('open');
  if (debtCounterpartyMenu) debtCounterpartyMenu.classList.remove('open');
  if (businessMenu) businessMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtSummaryCounterpartyMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('debtSummaryCounterpartyMenu');
  const typeMenu = document.getElementById('debtSummaryTypeMenu');
  const summaryBusinessMenu = document.getElementById('debtSummaryBusinessMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const debtTypeMenu = document.getElementById('cashDebtTypeMenu');
  const debtCounterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  if (typeMenu) typeMenu.classList.remove('open');
  if (summaryBusinessMenu) summaryBusinessMenu.classList.remove('open');
  if (opMenu) opMenu.classList.remove('open');
  if (debtTypeMenu) debtTypeMenu.classList.remove('open');
  if (debtCounterpartyMenu) debtCounterpartyMenu.classList.remove('open');
  if (businessMenu) businessMenu.classList.remove('open');
  if (menu) menu.classList.toggle('open');
}

function toggleDebtSummaryBusinessMenu(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('debtSummaryBusinessMenu');
  const typeMenu = document.getElementById('debtSummaryTypeMenu');
  const summaryCounterpartyMenu = document.getElementById('debtSummaryCounterpartyMenu');
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const debtTypeMenu = document.getElementById('cashDebtTypeMenu');
  const debtCounterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  if (typeMenu) typeMenu.classList.remove('open');
  if (summaryCounterpartyMenu) summaryCounterpartyMenu.classList.remove('open');
  if (opMenu) opMenu.classList.remove('open');
  if (debtTypeMenu) debtTypeMenu.classList.remove('open');
  if (debtCounterpartyMenu) debtCounterpartyMenu.classList.remove('open');
  if (businessMenu) businessMenu.classList.remove('open');
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

function setDebtCounterpartyFilter(value) {
  localStorage.setItem('cashDebtCounterpartyFilter', value || 'all');
  const menu = document.getElementById('cashDebtCounterpartyMenu');
  if (menu) menu.classList.remove('open');
  updateDebtFilterButtons();
  renderCashDebts();
}

function setDebtBusinessFilter(value) {
  localStorage.setItem('cashDebtBusinessFilter', value || 'all');
  const menu = document.getElementById('cashDebtBusinessMenu');
  if (menu) menu.classList.remove('open');
  updateDebtFilterButtons();
  renderCashDebts();
}

function setDebtSummaryTypeFilter(value) {
  localStorage.setItem('debtSummaryTypeFilter', value || 'all');
  const menu = document.getElementById('debtSummaryTypeMenu');
  if (menu) menu.classList.remove('open');
  updateDebtSummaryFilterButtons();
  renderDebtSummary();
}

function setDebtSummaryCounterpartyFilter(value) {
  localStorage.setItem('debtSummaryCounterpartyFilter', value || 'all');
  const menu = document.getElementById('debtSummaryCounterpartyMenu');
  if (menu) menu.classList.remove('open');
  updateDebtSummaryFilterButtons();
  renderDebtSummary();
}

function setDebtSummaryBusinessFilter(value) {
  localStorage.setItem('debtSummaryBusinessFilter', value || 'all');
  const menu = document.getElementById('debtSummaryBusinessMenu');
  if (menu) menu.classList.remove('open');
  updateDebtSummaryFilterButtons();
  renderDebtSummary();
}

document.addEventListener('click', (event) => {
  const opMenu = document.getElementById('cashDebtOperationMenu');
  const typeMenu = document.getElementById('cashDebtTypeMenu');
  const counterpartyMenu = document.getElementById('cashDebtCounterpartyMenu');
  const businessMenu = document.getElementById('cashDebtBusinessMenu');
  const summaryTypeMenu = document.getElementById('debtSummaryTypeMenu');
  const summaryCounterpartyMenu = document.getElementById('debtSummaryCounterpartyMenu');
  const summaryBusinessMenu = document.getElementById('debtSummaryBusinessMenu');
  const stocksMenu = document.getElementById('cashStocksBusinessMenu');
  const stocksBtn = document.getElementById('cashStocksBusinessBtn');
  if (stocksMenu && (stocksMenu.contains(event.target) || (stocksBtn && stocksBtn.contains(event.target)))) {
    return;
  }
  if (opMenu) opMenu.classList.remove('open');
  if (typeMenu) typeMenu.classList.remove('open');
  if (counterpartyMenu) counterpartyMenu.classList.remove('open');
  if (businessMenu) businessMenu.classList.remove('open');
  if (summaryTypeMenu) summaryTypeMenu.classList.remove('open');
  if (summaryCounterpartyMenu) summaryCounterpartyMenu.classList.remove('open');
  if (summaryBusinessMenu) summaryBusinessMenu.classList.remove('open');
  if (stocksMenu) stocksMenu.classList.remove('open');
});

function applyDebtOperationsFilters(items) {
  const { operationValue, typeValue, counterpartyValue, businessValue } = getDebtOperationsFilterValues();
  return items.filter(item => {
    const rangeFrom = document.getElementById('cashDateFrom')?.value;
    const rangeTo = document.getElementById('cashDateTo')?.value;
    if (rangeFrom && rangeTo) {
      const debtDate = String(item?.debt_date || '').slice(0, 10);
      if (debtDate && (debtDate < rangeFrom || debtDate > rangeTo)) return false;
    }
    if (operationValue !== 'all' && getDebtOperationKey(item) !== operationValue) return false;
    if (typeValue !== 'all' && item.debt_type !== typeValue) return false;
    if (counterpartyValue !== 'all' && String(item.counterparty || '') !== counterpartyValue) return false;
    if (businessValue !== 'all') {
      const itemBusiness = item && item.business_id != null ? String(item.business_id) : '__none__';
      if (itemBusiness !== businessValue) return false;
    }
    return true;
  });
}

function renderCashDebts() {
  const body = document.getElementById('cashDebtsBody');
  if (!cashDebts.length) {
    body.innerHTML = '<tr><td colspan="11" class="cash-muted" style="text-align:center;padding:16px">Нет записей</td></tr>';
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
    body.innerHTML = '<tr><td colspan="11" class="cash-muted" style="text-align:center;padding:16px">Нет записей по выбранным фильтрам</td></tr>';
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
    const createdDate = item.created_at ? new Date(item.created_at) : null;
    const createdText = createdDate ?
      createdDate.toLocaleDateString('ru-RU') + ' ' +
      createdDate.toLocaleTimeString('ru-RU', {hour: '2-digit', minute: '2-digit'}) +
      ' <span style="opacity:0.6">(' + createdDate.toLocaleTimeString('ru-RU', {timeZoneName: 'short'}).split(' ').pop() + ')</span>'
      : '—';
    
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
      '<td style="color:#94a3b8;font-size:12px">' + createdText + '</td>' +
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

async function exportCashDebtOperationsToExcel() {
  if (!Array.isArray(cashDebts) || !cashDebts.length) {
    alert('❌ Нет данных для экспорта');
    return;
  }

  const selectedIds = new Set(
    Array.from(document.querySelectorAll('#cashDebtsBody .cash-debt-checkbox:checked'))
      .map(cb => Number(cb.dataset.id))
      .filter(id => Number.isFinite(id))
  );

  const sortedDebts = applyDebtOperationsFilters([...cashDebts]).sort((a, b) => {
    const dateA = new Date(a.debt_date || 0);
    const dateB = new Date(b.debt_date || 0);
    return dateB - dateA;
  });

  const rowsToExport = selectedIds.size
    ? sortedDebts.filter(item => selectedIds.has(Number(item.id)))
    : sortedDebts;

  if (!rowsToExport.length) {
    alert('❌ Нет данных для экспорта по текущим фильтрам/выбору');
    return;
  }

  const exportRows = rowsToExport.map(item => {
    const debtDate = item.debt_date ? new Date(item.debt_date).toLocaleDateString('ru-RU') : '—';
    const dueDate = item.due_date ? new Date(item.due_date).toLocaleDateString('ru-RU') : '—';
    const amount = Number(item.amount || 0);
    const isPayment = amount < 0;
    const displayAmount = (isPayment ? '-' : '+') + formatMoney(Math.abs(amount));
    const typeLabel = item.debt_type === 'receivable' ? 'Нам должны' : 'Мы должны';
    const operationTypeLabel = getDebtOperationLabel(item);
    const businessName = getBusinessNameById(item.business_id);

    return {
      'Дата операции': debtDate,
      'Тип': typeLabel,
      'Операция': operationTypeLabel,
      'Сумма': displayAmount,
      'Контрагент': item.counterparty || '—',
      'Срок': dueDate,
      'Магазин': businessName || '—',
      'Комментарий': item.note || '—'
    };
  });

  try {
    const response = await fetch('/api/cash/debts/export-xlsx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('authToken')
      },
      body: JSON.stringify({ rows: exportRows })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || ('HTTP ' + response.status));
    }

    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    link.download = 'debt-operations-' + date + '.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  } catch (err) {
    alert('❌ ' + (err && err.message ? err.message : 'Ошибка экспорта XLSX'));
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
}

	return {
		getAuthPage,
		getLoginPage,
		getRegisterPage,
		getLogout,
		postLogin,
		postRegister,
		getProfile,
		postProfile,
    postProfileResetPassword,
    postAuthResetPasswordConfirm,
		getCounterparties,
		postCounterparties,
		getCashCategories,
		postCashCategories,
		getCashTransactions,
		postCashTransactions,
		putCashTransaction,
		deleteCashTransactionsBulk,
		deleteCashTransaction,
		getCashSummary,
		getCashDebts,
		postCashDebts,
		recalculateCashDebts,
		putCashDebt,
		deleteCashDebtsBulk,
		deleteCashDebt,
		exportCashDebtsXlsx,
    exportCashDebtSummaryXlsx,

		getHomePage
	};
};
