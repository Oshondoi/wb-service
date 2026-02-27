function renderSidebar(activePath = '/') {
	return `
  <aside class="sidebar">
    <div class="sidebar-top">
      <button type="button" class="sidebar-top-icon" onclick="openProfileModal()" title="Профиль">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
      </button>
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
    <a class="sidebar-link" href="/shipments">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M8 12h8" /></svg>
      </span>
      <span class="sidebar-text">Отгрузки</span>
    </a>
    <a class="sidebar-link" href="/shipments-2">
      <span class="sidebar-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 9v6" /><path d="M9 12h6" /></svg>
      </span>
      <span class="sidebar-text">Отгрузки 2</span>
    </a>
    <div class="sidebar-footer">
      <a class="sidebar-link logout" href="/api/logout" onclick="localStorage.removeItem('authToken')">
        <span class="sidebar-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M13 4H5v16h8" /></svg>
        </span>
        <span class="sidebar-text">Выход</span>
      </a>
    </div>
  </aside>`;
}

function renderProfileModal() {
	return `
<style id="profileModalSharedStyles">
#profileModal .profile-modal-content{width:min(920px,calc(100vw - 48px));max-height:calc(100vh - 48px);overflow:auto}
#profileModal .profile-layout{display:grid;grid-template-columns:170px 1fr;gap:22px;align-items:start}
#profileModal .profile-avatar{width:150px;height:150px;border-radius:50%;border:6px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 12px 28px rgba(0,0,0,0.35)}
#profileModal .profile-avatar svg{width:72px;height:72px;stroke:#94a3b8;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#profileModal .profile-form-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px 16px}
#profileModal .profile-field{display:flex;flex-direction:column;gap:6px}
#profileModal .profile-field.full{grid-column:1 / -1}
#profileModal .profile-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:14px}
#profileModal .profile-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
#profileModal .profile-input{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0}
#profileModal .profile-input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
#profileModal .profile-save-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(34,197,94,0.18);color:#86efac;border:1px solid rgba(34,197,94,0.7);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase;box-shadow:0 8px 18px rgba(34,197,94,0.22)}
#profileModal .profile-save-btn:hover{border-color:#22c55e;color:#eafff3;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
#profileModal .profile-reset-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(14,165,233,0.18);color:#7dd3fc;border:1px solid rgba(56,189,248,0.7);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase;box-shadow:0 8px 18px rgba(56,189,248,0.18)}
#profileModal .profile-reset-btn:hover{border-color:#38bdf8;color:#e0f2fe;box-shadow:0 12px 26px rgba(56,189,248,0.3)}
</style>
<div id="profileModal" class="modal" onclick="closeProfileModalOnOutsideClick(event)">
  <div class="modal-content profile-modal-content" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h2>Настройки профиля</h2>
      <button class="close-btn" onclick="closeProfileModal()">&times;</button>
    </div>
    <div class="profile-layout">
      <div class="profile-avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
      </div>
      <div>
        <div class="profile-form-grid">
          <div class="profile-field full">
            <label class="profile-label" for="profileUserId">ID пользователя</label>
            <input id="profileUserId" class="profile-input" type="text" readonly />
          </div>
          <div class="profile-field">
            <label class="profile-label" for="profileLogin">Логин</label>
            <input id="profileLogin" class="profile-input" type="text" placeholder="Логин нельзя изменить" readonly />
          </div>
          <div class="profile-field">
            <label class="profile-label" for="profileName">Имя</label>
            <input id="profileName" class="profile-input" type="text" placeholder="Введите имя" />
          </div>
          <div class="profile-field">
            <label class="profile-label" for="profilePhone">Телефон</label>
            <input id="profilePhone" class="profile-input" type="text" placeholder="Введите телефон" />
          </div>
          <div class="profile-field">
            <label class="profile-label" for="profileEmail">Email</label>
            <input id="profileEmail" class="profile-input" type="email" placeholder="Введите email" />
          </div>
        </div>
        <div class="profile-actions">
          <button type="button" class="profile-reset-btn" onclick="resetProfilePassword()">Сбросить пароль на почту</button>
          <button type="button" class="profile-save-btn" onclick="saveProfile()">Сохранить</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function renderProfileScript() {
	return `
<script>
function getProfileStorageKey(userId) {
  return 'profileLocal:' + String(userId || 'anon');
}

function fillProfileForm(profile) {
  var idEl = document.getElementById('profileUserId');
  var loginEl = document.getElementById('profileLogin');
  var nameEl = document.getElementById('profileName');
  var phoneEl = document.getElementById('profilePhone');
  var emailEl = document.getElementById('profileEmail');
  if (idEl) idEl.value = profile.id || '';
  if (loginEl) loginEl.value = profile.login || '';
  if (nameEl) nameEl.value = profile.name || '';
  if (phoneEl) phoneEl.value = profile.phone || '';
  if (emailEl) emailEl.value = profile.email || '';
}

function getAuthTokenForProfile() {
  var token = localStorage.getItem('authToken');
  if (token) return token;
  var match = document.cookie.match(/(?:^|;\\s*)authToken=([^;]+)/);
  if (match && match[1]) {
    token = decodeURIComponent(match[1]);
    localStorage.setItem('authToken', token);
    return token;
  }
  return '';
}

async function loadProfileData() {
  var token = getAuthTokenForProfile();
  if (!token) throw new Error('Необходима авторизация');
  var res = await fetch('/api/profile', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  var data = await res.json();
  if (!data.success) throw new Error(data.error || 'Ошибка загрузки профиля');
  var profile = data.profile || {};
  var localData = {};
  try {
    localData = JSON.parse(localStorage.getItem(getProfileStorageKey(profile.id)) || '{}') || {};
  } catch (_) {
    localData = {};
  }
  return {
    id: profile.id || '',
    login: profile.username || '',
    name: localData.name || '',
    email: profile.email || '',
    phone: localData.phone || '',
    
  };
}

async function openProfileModal() {
  var modal = document.getElementById('profileModal');
  if (!modal) return;
  modal.classList.add('active');
  try {
    var profile = await loadProfileData();
    fillProfileForm(profile);
  } catch (err) {
    alert('❌ ' + err.message);
  }
}

function closeProfileModal() {
  var modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('active');
}

function closeProfileModalOnOutsideClick(event) {
  if (event && event.target && event.target.id === 'profileModal') {
    closeProfileModal();
  }
}

async function saveProfile() {
  var token = getAuthTokenForProfile();
  if (!token) {
    alert('❌ Необходима авторизация');
    return;
  }

  var id = (document.getElementById('profileUserId') || {}).value || '';
  var login = ((document.getElementById('profileLogin') || {}).value || '').trim();
  var name = ((document.getElementById('profileName') || {}).value || '').trim();
  var email = ((document.getElementById('profileEmail') || {}).value || '').trim();
  var phone = ((document.getElementById('profilePhone') || {}).value || '').trim();

  var res = await fetch('/api/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ email: email })
  });

  var data = await res.json();
  if (!data.success) {
    alert('❌ ' + (data.error || 'Ошибка сохранения'));
    return;
  }

  var savedProfile = data.profile || {};
  localStorage.setItem(getProfileStorageKey(savedProfile.id || id), JSON.stringify({
    name: name,
    phone: phone
  }));
  fillProfileForm({
    id: savedProfile.id || id,
    login: savedProfile.username || login,
    name: name,
    email: savedProfile.email || email,
    phone: phone
  });
  alert('✅ Профиль сохранён');
}

async function resetProfilePassword() {
  var token = getAuthTokenForProfile();
  if (!token) {
    alert('❌ Необходима авторизация');
    return;
  }

  var email = ((document.getElementById('profileEmail') || {}).value || '').trim();
  if (!email) {
    alert('❌ Укажите email в профиле');
    return;
  }

  var res = await fetch('/api/profile/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ email: email })
  });

  var data = await res.json();
  if (!data.success) {
    alert('❌ ' + (data.error || 'Ошибка отправки письма'));
    return;
  }

  alert('✅ ' + (data.message || 'Письмо для сброса пароля отправлено'));
}
</script>`;
}

module.exports = {
	renderSidebar,
	renderProfileModal,
	renderProfileScript
};