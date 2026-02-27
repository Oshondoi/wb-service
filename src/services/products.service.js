const IMG_HOST_CACHE = new Map();
const axios = require('axios');
const {
	renderSidebar,
	renderProfileModal,
	renderProfileScript
} = require('./page.shared');

function extractPrice(product) {
	const candidates = [];
	['salePriceU','clientSalePriceU','basicPriceU','priceU'].forEach(k => {
		if (typeof product[k] === 'number' && product[k] > 0) candidates.push(product[k]);
	});
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

async function tryBasket(nm) {
	const vol = Math.floor(nm / 100000);
	const part = Math.floor(nm / 1000);
	const domains = [];
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
			continue;
		}

		let nuxtBlock = null;
		const nuxtScriptMatch = html.match(/window.__NUXT__=(.*?);<\/script>/s);
		if (nuxtScriptMatch) nuxtBlock = nuxtScriptMatch[1];
		if (!nuxtBlock) {
			const altMatch = html.match(/window.__NUXT__=(\{.*?\});/s);
			if (altMatch) nuxtBlock = altMatch[1];
		}
		if (nuxtBlock) {
			try {
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
			} catch (_) {}
		}

		const numMatch = html.match(/salePriceU":(\d+)/) || html.match(/priceU":(\d+)/);
		if (numMatch) {
			return { price: parseInt(numMatch[1],10)/100, currency: htmlUrl.includes('.kg') ? 'KGS' : htmlUrl.includes('.kz') ? 'KZT' : 'RUB', name:'', brand:'', source: htmlUrl.includes('.kg') ? 'html-regex-kg' : htmlUrl.includes('.kz') ? 'html-regex-kz' : 'html-regex' };
		}

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

module.exports = function createProductsService(deps) {
	function getProductsPage(req, res) {
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
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(6px);z-index:1000;align-items:center;justify-content:center;padding:24px;overflow:auto}
.modal.active{display:flex}
.modal-content{background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.2);border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,0.5);max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow:auto;margin:0 auto}
.modal-header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid rgba(148,163,184,0.2)}
.modal-header h2{margin:0;font-size:18px;font-weight:700;color:#f8fafc}
.close-btn{background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:all 0.2s}
.close-btn:hover{border-color:#38bdf8;color:#fff}
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
	${renderSidebar('/products')}
	<main class="main">
		<div class="container">
<div class="header-bar">
	<div class="brand"></div>
	<div class="toolbar"></div>
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
${renderProfileModal()}
${renderProfileScript()}
<script>
function getCookie(name) {
	const value = '; ' + document.cookie;
	const parts = value.split('; ' + name + '=');
	if (parts.length === 2) return parts.pop().split(';').shift();
	return null;
}

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
				'206348': true,
				'120762': true,
				'301760': true,
				'507': true,
				'117986': true,
				'206828': true,
				'204151': true,
				'204163': true,
				'203490': true,
				'205362': true
			};
			var modelText = '-';
		if(data.warehouses && data.warehouses.length > 0){
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
		var sellerName = data.sellerName || '-';
		var storeName = data.storeName || '-';

		var sellerDisplay = '-';
		if (sellerName !== '-' && sellerId !== '-') {
			sellerDisplay = sellerName + ' (' + sellerId + ')';
		} else if (sellerName !== '-') {
			sellerDisplay = sellerName;
		} else if (sellerId !== '-') {
			sellerDisplay = 'ID: ' + sellerId;
		}

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
			if(i === 0 || i === 1 || i === 14 || i === 19){
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
	}

	async function getWbPrice(req, res) {
		const nm = req.query.nm;
		if (!nm) return res.status(400).json({ error: 'nm (артикул) обязателен' });

		const destList = [-1257786, -1029256, -1059509];
		const appTypes = [1];
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

		const htmlData = await fetchFromHtml(nm);
		if (htmlData && htmlData.price > 0) {
			return res.json({ nm, ...htmlData, source: 'html' });
		}

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
	}

	async function getWbImage(req, res) {
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

		res.set('Content-Type', 'image/svg+xml');
		res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
		<rect fill="#ddd" width="100" height="100"/>
		<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="#999">Нет фото</text>
	</svg>`);
	}

	async function getWbRaw(req, res) {
		const nm = req.query.nm;
		if (!nm) return res.status(400).json({ error: 'nm обязателен' });
		try {
			const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nm}`;
			const response = await axios.get(url, { headers: { 'User-Agent': 'WildberriesApp/1.0', 'Accept': 'application/json' }, timeout: 10000 });
			res.json(response.data);
		} catch (e) {
			res.status(500).json({ error: 'raw fetch failed', details: e.message, status: e.response?.status });
		}
	}

	async function getWbMax(req, res) {
		const nm = String(req.query.nm || '').trim();
		const dest = String(req.query.dest || '').trim();
		const domain = String(req.query.domain || 'ru').trim();

		if (!nm) {
			return res.status(400).json({ error: 'Артикул (nm) обязателен' });
		}

		const destCandidates = [];
		if (dest) destCandidates.push(dest);
		destCandidates.push('-1257786', '-1029256', '-1059509', '-59208', '-364763');

		let product = null;
		let source = null;
		let destUsed = null;

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

		let priceU = extractPrice(product);
		if (basketPrice > 0 && priceU === 0) priceU = basketPrice;

		const name = product.name || product.imt_name || '';
		const brand = product.brand || product.selling?.brand_name || '';
		const sellerId = product.sellerId || product.supplierId || '';

		let sellerName = '';
		let storeName = product.supplier || '';

		let category = product.entity || '';
		if (category && category.length > 0) {
			category = category.charAt(0).toUpperCase() + category.slice(1);
		}

		let color = '';
		if (Array.isArray(product.colors) && product.colors.length > 0) {
			color = product.colors[0].name || '';
		}

		const rating = product.rating || 0;
		const feedbacks = product.feedbacks || 0;
		const images = Array.isArray(product.pics) ? product.pics.length : (Array.isArray(product.images) ? product.images.length : 0);

		let mainImage = '';
		if (product.id || nm) {
			const productId = product.id || nm;
			let picNum = 1;
			if (Array.isArray(product.pics) && product.pics.length > 0) {
				picNum = product.pics[0];
			} else if (Array.isArray(product.colors) && product.colors.length > 0 && Array.isArray(product.colors[0].pics)) {
				picNum = product.colors[0].pics[0] || 1;
			}
			mainImage = `/wb-image?nm=${productId}&pic=${picNum}`;
		}

		const { totalQty, warehouses, warehousesQty } = summarizeStocks(product);

		let currency = 'RUB';
		if (domain === 'kg') currency = 'KGS';
		else if (domain === 'kz') currency = 'KZT';

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
	}

	async function getWbPricePlain(req, res) {
		try {
			const nm = req.query.nm;
			if (!nm) return res.status(400).send('nm required');
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
						} catch (_) {}
					}
				}
			}
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
	}

	async function getWbPriceCsv(req, res) {
		const nmRaw = req.query.nm;
		const domain = (req.query.domain || 'ru').trim();
		if (!nmRaw) return res.status(400).type('text/csv').send('price,name\n,');
		const nm = String(nmRaw).trim();

		const destList = ['-1257786','-1029256','-1059509'];
		let product = null;
		let priceU = 0;

		for (const dest of destList) {
			const url = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=${dest}&nm=${nm}`;
			try {
				const r = await axios.get(url, { headers: { 'User-Agent':'WildberriesApp/1.0' }, timeout: 8000 });
				const products = r?.data?.products || r?.data?.data?.products || [];
				if (!products.length) continue;
				product = products.find(p => String(p.id) === nm) || products[0];
				priceU = extractPrice(product);
				if (priceU > 0) break;
			} catch (_) {}
		}

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

		if ((!product || priceU <= 0)) {
			const basketData = await tryBasket(Number(nm));
			if (basketData && basketData.price > 0) {
				return res.type('text/csv').send('price,name\n' + String(basketData.price) + ',"' + (basketData.name || '') + '"');
			}
		}

		if (priceU <= 0) {
			const htmlData = await fetchFromHtml(nm);
			if (htmlData && htmlData.price > 0) {
				return res.type('text/csv').send('price,name\n' + String(htmlData.price) + ',""');
			}
		}

		if (!product) {
			return res.status(404).type('text/csv').send('price,name\n,');
		}

		const name = product.name || product.imt_name || '';
		const price = priceU > 0 ? (priceU / 100) : 0;
		const safeName = String(name).replace(/"/g,'""');

		res.type('text/csv').send('price,name\n' + String(price) + ',"' + safeName + '"');
	}

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

	function currencyByDomain(d) {
		if (d === 'kg') return 'KGS';
		if (d === 'kz') return 'KZT';
		return 'RUB';
	}

	async function getWbMaxCsv(req, res) {
		const nm = String(req.query.nm || '').trim();
		const dest = String(req.query.dest || '').trim();
		const domain = String(req.query.domain || 'ru').trim();
		if (!nm) {
			res.status(400).type('text/csv').send('error,message\n400,Missing nm');
			return;
		}

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

			let sellerName = '';
			let storeName = safeGet(product, 'supplier', '') || '';

			let category = '';
			if (product && product.entity) {
				category = product.entity;
				if (category.length > 0) {
					category = category.charAt(0).toUpperCase() + category.slice(1);
				}
			}

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
	}

	return {
		getProductsPage,
		getWbPrice,
		getWbImage,
		getWbRaw,
		getWbMax,
		getWbPricePlain,
		getWbPriceCsv,
		getWbMaxCsv
	};
};
