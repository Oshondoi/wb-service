
function getProfileStorageKey(userId) {
  return 'profileLocal:' + String(userId || 'anon');
}

function fillProfileForm(profile) {
  var idEl = document.getElementById('profileUserId');
  var langEl = document.getElementById('profileLanguage');
  var nameEl = document.getElementById('profileName');
  var phoneEl = document.getElementById('profilePhone');
  var emailEl = document.getElementById('profileEmail');
  if (idEl) idEl.value = profile.id || '';
  if (langEl) langEl.value = profile.language || 'Русский';
  if (nameEl) nameEl.value = profile.username || '';
  if (phoneEl) phoneEl.value = profile.phone || '';
  if (emailEl) emailEl.value = profile.email || '';
}

function getAuthTokenForProfile() {
  var token = localStorage.getItem('authToken');
  if (token) return token;
  var match = document.cookie.match(/(?:^|;\s*)authToken=([^;]+)/);
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
    username: localData.username || profile.username || '',
    email: profile.email || '',
    phone: localData.phone || '',
    language: localData.language || 'Русский'
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
  var username = ((document.getElementById('profileName') || {}).value || '').trim();
  var email = ((document.getElementById('profileEmail') || {}).value || '').trim();
  var phone = ((document.getElementById('profilePhone') || {}).value || '').trim();
  var language = ((document.getElementById('profileLanguage') || {}).value || 'Русский').trim();

  if (!username) {
    alert('❌ Укажите имя');
    return;
  }

  var res = await fetch('/api/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ username: username, email: email })
  });

  var data = await res.json();
  if (!data.success) {
    alert('❌ ' + (data.error || 'Ошибка сохранения'));
    return;
  }

  var savedProfile = data.profile || {};
  localStorage.setItem(getProfileStorageKey(savedProfile.id || id), JSON.stringify({
    username: username,
    phone: phone,
    language: language
  }));
  fillProfileForm({
    id: savedProfile.id || id,
    username: savedProfile.username || username,
    email: savedProfile.email || email,
    phone: phone,
    language: language
  });
  alert('✅ Профиль сохранён');
}

