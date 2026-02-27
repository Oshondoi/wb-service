const {
	renderSidebar,
	renderProfileModal,
	renderProfileScript
} = require('./page.shared');

module.exports = function createStocksService() {
	function getStocksPage(req, res) {
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
.header-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.brand{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(148,163,184,0.18);background:rgba(15,23,42,0.8)}
.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#38bdf8 0%,#22c55e 100%);display:flex;align-items:center;justify-content:center;color:#0b1220;font-weight:800;font-size:14px}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.api-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase}
.api-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.api-btn.primary{background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.7);color:#86efac;box-shadow:0 8px 18px rgba(34,197,94,0.22)}
.api-btn.primary:hover{border-color:#22c55e;color:#eafff3;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
.api-btn.secondary{background:rgba(56,189,248,0.15);border-color:rgba(56,189,248,0.65);color:#bae6fd;box-shadow:0 8px 18px rgba(56,189,248,0.22)}
.api-btn.secondary:hover{border-color:#38bdf8;color:#e2f2ff;box-shadow:0 12px 26px rgba(56,189,248,0.35)}
.filter-menu{position:relative;display:inline-flex}
.filter-dropdown{position:absolute;top:calc(100% + 6px);left:0;min-width:190px;background:#0f172a;border:1px solid rgba(148,163,184,0.25);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.4);padding:6px;z-index:30;display:none}
.filter-dropdown.open{display:block}
.filter-item{padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#e2e8f0;cursor:pointer;transition:background 0.2s,color 0.2s}
.filter-item:hover{background:rgba(56,189,248,0.15);color:#fff}
.filter-item.active{background:rgba(34,197,94,0.18);color:#86efac}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:16px}
.section-header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.section-title{margin:0 0 12px;font-size:14px;font-weight:700;color:#f8fafc;letter-spacing:0.3px}
.section-note{color:#cbd5f5;font-size:12px;line-height:1.6;margin:0}
.cash-table{width:100%;border-collapse:collapse}
.cash-table th{background:#0b1220;color:#e2e8f0;font-size:12px;text-align:left;padding:10px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:10}
.cash-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,0.15);font-size:12px;color:#e2e8f0}
.cash-muted{color:#94a3b8;font-size:12px}
.stocks-table{table-layout:fixed;width:100%}
.stocks-table th,.stocks-table td{white-space:nowrap}
.stocks-spacer{width:100%}
.stocks-table th{line-height:1.2}
.stocks-head-cell{display:flex;align-items:center;justify-content:flex-end;gap:8px}
.stocks-toggle{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.85);color:#e2e8f0;font-weight:800;font-size:12px;cursor:pointer;transition:all 0.2s;box-sizing:border-box}
.stocks-toggle:hover{border-color:#38bdf8;color:#fff;box-shadow:0 6px 16px rgba(56,189,248,0.2)}
#stocksTable{--stock-extra-width:0px;--stock-extra-total-width:0px}
#stocksTable .stock-extra{width:var(--stock-extra-width);min-width:var(--stock-extra-width);max-width:var(--stock-extra-width);overflow:hidden;white-space:nowrap;padding-left:0;padding-right:0;border-left:none;border-right:none;transition:width 1.5s ease,padding 1.5s ease}
#stocksTable .stock-extra-total{width:var(--stock-extra-total-width);min-width:var(--stock-extra-total-width);max-width:var(--stock-extra-total-width)}
#stocksTable.stocks-details-open{--stock-extra-width:140px;--stock-extra-total-width:120px}
#stocksTable.stocks-details-open .stock-extra{padding-left:10px;padding-right:10px}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,6,23,0.8);backdrop-filter:blur(6px);z-index:1000;align-items:center;justify-content:center;padding:24px;overflow:auto}
.modal.active{display:flex}
.modal-content{background:#0f172a;color:#e2e8f0;border:1px solid rgba(148,163,184,0.2);border-radius:16px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,0.5);max-width:calc(100vw - 48px);max-height:calc(100vh - 48px);overflow:auto;margin:0 auto}
.modal-header{display:flex;align-items:center;gap:12px;justify-content:space-between;padding-bottom:12px;margin-bottom:16px;border-bottom:1px solid rgba(148,163,184,0.2)}
.modal-header h2{margin:0;font-size:18px;font-weight:700;color:#f8fafc}
.close-btn{background:rgba(148,163,184,0.12);border:1px solid rgba(148,163,184,0.25);color:#e2e8f0;border-radius:10px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;transition:all 0.2s}
.close-btn:hover{border-color:#38bdf8;color:#fff}
.cash-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
.cash-input{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0}
.cash-input:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
h1{margin:0;font-size:24px;font-weight:700;color:#f8fafc;letter-spacing:-0.3px}
@media (max-width: 900px){
	.layout{flex-direction:column;padding-left:0}
	.sidebar{width:100%;height:auto;position:relative;left:auto;top:auto;bottom:auto;margin-top:0}
}
</style></head><body>
<div class="layout">
	${renderSidebar('/stocks')}
	<main class="main">
		<div class="container">
			<div class="section">
				<div class="section-header">
					<h1>Управление остатками</h1>
					<div class="toolbar">
						<button class="api-btn primary" onclick="openStocksCostModal()">💰 Себестоимость</button>
						<div class="filter-menu">
							<button id="stocksBusinessBtn" class="api-btn secondary" onclick="toggleStocksBusinessMenu(event)">Все магазины</button>
							<div id="stocksBusinessMenu" class="filter-dropdown" onclick="event.stopPropagation()"></div>
						</div>
						<button id="stocksRefreshBtn" class="api-btn" onclick="loadStocksData()">Обновить</button>
					</div>
				</div>
			</div>
			<div class="section">
				<div style="display:flex;align-items:center;justify-content:space-between;margin:0 0 10px 0;flex-wrap:wrap;gap:10px">
					<div class="cash-muted">Позиции: <span id="stocksCount">0</span></div>
					<div id="stocksErrors" class="cash-muted"></div>
				</div>
				<div style="max-height:60vh;overflow:auto;overflow-x:auto">
					<table id="stocksTable" class="cash-table stocks-table">
						<thead>
							<tr>
								<th style="width:160px">Магазин</th>
								<th style="width:120px">Бренд</th>
								<th style="width:200px">Предмет</th>
								<th style="width:140px">Артикул продавца</th>
								<th style="width:110px">Артикул WB</th>
								<th style="text-align:right;width:90px">
									<div class="stocks-head-cell">
										<span>Доступно на складе</span>
										<button type="button" class="stocks-toggle" onclick="toggleStocksColumns()" title="Показать детали">+</button>
									</div>
								</th>
								<th class="stock-extra" style="text-align:right">В пути до получателей</th>
								<th class="stock-extra" style="text-align:right">В пути возвраты на склад WB</th>
								<th class="stock-extra stock-extra-total" style="text-align:right">Всего находится на складах</th>
								<th style="text-align:right;width:140px">Себестоимость</th>
								<th style="text-align:right;width:140px">Сумма</th>
								<th class="stocks-spacer"></th>
							</tr>
						</thead>
						<tbody id="stocksBody">
							<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</main>
</div>
${renderProfileModal()}
<div id="stocksCostModal" class="modal" onclick="closeStocksCostModal()">
	<div class="modal-content" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Себестоимость</h2>
			<button class="close-btn" onclick="closeStocksCostModal()">&times;</button>
		</div>
		<p class="cash-muted">Раздел в разработке. Пока себестоимость отображается в таблице, если она задана.</p>
	</div>
</div>
${renderProfileScript()}
<script>
var businesses = [];
var stocksItems = [];
var stocksCosts = {};

function formatMoney(value) {
	var amount = Number(value || 0);
	return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(amount);
}

function formatQty(value) {
	var amount = Number(value || 0);
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

function openStocksCostModal() {
	var modal = document.getElementById('stocksCostModal');
	if (modal) modal.classList.add('active');
}

function closeStocksCostModal() {
	var modal = document.getElementById('stocksCostModal');
	if (modal) modal.classList.remove('active');
}

function getSelectedStockBusinessIds() {
	var raw = localStorage.getItem('cashStocksBusinessIds');
	if (!raw) return null;
	try {
		var ids = JSON.parse(raw).map(function(id) {
			return parseInt(id, 10);
		}).filter(Boolean);
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
	var btn = document.getElementById('stocksBusinessBtn');
	if (!btn) return;
	if (!businesses.length) {
		btn.textContent = 'Магазины: нет';
		return;
	}
	var selected = getSelectedStockBusinessIds();
	if (!selected || selected.length >= businesses.length) {
		btn.textContent = 'Все магазины';
		return;
	}
	if (selected.length === 1) {
		var found = businesses.find(function(b) { return b.id === selected[0]; });
		btn.textContent = found ? found.company_name : '1 магазин';
		return;
	}
	btn.textContent = 'Магазинов: ' + selected.length;
}

function renderStocksBusinessMenu() {
	var menu = document.getElementById('stocksBusinessMenu');
	if (!menu) return;

	if (!businesses.length) {
		menu.innerHTML = '<div class="filter-item">Нет магазинов</div>';
		return;
	}

	var selected = getSelectedStockBusinessIds();
	var allIds = businesses.map(function(b) { return b.id; });
	var allSelected = !selected || selected.length >= allIds.length;
	var activeIds = selected || allIds;

	var items = [];
	items.push('<div class="filter-item ' + (allSelected ? 'active' : '') + '" onclick="event.stopPropagation(); toggleStockBusinessAll()">Все магазины</div>');
	businesses.forEach(function(b) {
		var isActive = !allSelected && activeIds.indexOf(b.id) >= 0;
		items.push('<div class="filter-item ' + (isActive ? 'active' : '') + '" onclick="event.stopPropagation(); toggleStockBusiness(' + b.id + ')">' + escapeHtml(b.company_name) + '</div>');
	});
	menu.innerHTML = items.join('');
}

function toggleStockBusinessAll() {
	setSelectedStockBusinessIds(null);
	loadStocksData();
}

function toggleStockBusiness(id) {
	var ids = getSelectedStockBusinessIds();
	if (!ids || !ids.length) {
		ids = businesses.map(function(b) { return b.id; });
	}
	var index = ids.indexOf(id);
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
	var menu = document.getElementById('stocksBusinessMenu');
	if (menu) menu.classList.toggle('open');
}

function closeStocksBusinessMenu() {
	var menu = document.getElementById('stocksBusinessMenu');
	if (menu) menu.classList.remove('open');
}

function loadBusinesses() {
	fetch('/api/businesses', {
		headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
	})
	.then(function(res) { return res.json(); })
	.then(function(data) {
		if (!data.success) throw new Error(data.error || 'Ошибка загрузки магазинов');
		businesses = data.businesses || [];
		updateStocksBusinessButton();
		renderStocksBusinessMenu();
		loadStocksData();
	})
	.catch(function() {
		businesses = [];
		updateStocksBusinessButton();
	});
}

function loadStocksData() {
	var body = document.getElementById('stocksBody');
	var countEl = document.getElementById('stocksCount');
	var errorsEl = document.getElementById('stocksErrors');

	if (!body) return;

	var selectedIds = getSelectedStockBusinessIds();
	var availableIds = businesses.filter(function(b) { return b.wb_api_key; }).map(function(b) { return b.id; });
	var ids = (selectedIds && selectedIds.length) ? selectedIds : availableIds;

	if (!ids.length) {
		body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Нет магазинов с API ключом</td></tr>';
		if (countEl) countEl.textContent = '0';
		if (errorsEl) errorsEl.textContent = '';
		return;
	}

	body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Загрузка...</td></tr>';
	if (countEl) countEl.textContent = '0';
	if (errorsEl) errorsEl.textContent = '';

	var query = encodeURIComponent(ids.join(','));
	fetch('/api/wb-stocks?businessIds=' + query, {
		headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
	})
	.then(function(res) { return res.json(); })
	.then(function(data) {
		if (!data.success) throw new Error(data.error || 'Ошибка загрузки остатков');
		stocksItems = data.items || [];
		if (errorsEl && Array.isArray(data.errors) && data.errors.length) {
			errorsEl.textContent = 'Ошибки: ' + data.errors.length;
		}

		var uniqueBusinessIds = Array.from(new Set(stocksItems.map(function(it) { return it.business_id; }))).filter(Boolean);
		return loadStocksCosts(uniqueBusinessIds);
	})
	.then(function(costMap) {
		if (costMap) stocksCosts = costMap;
		renderStocksTable();
	})
	.catch(function(err) {
		body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Ошибка: ' + escapeHtml(err.message) + '</td></tr>';
		if (countEl) countEl.textContent = '0';
	});
}

function loadStocksCosts(businessIds) {
	var costMap = {};
	if (!businessIds || !businessIds.length) return Promise.resolve(costMap);

	return Promise.all(businessIds.map(function(id) {
		return fetch('/api/product-costs/' + id, {
			headers: { 'Authorization': 'Bearer ' + localStorage.getItem('authToken') }
		})
		.then(function(res) { return res.json(); })
		.then(function(data) {
			if (!data.success || !Array.isArray(data.costs)) return;
			data.costs.forEach(function(item) {
				var key = String(id) + ':' + String(item.nm_id);
				costMap[key] = Number(item.cost || 0);
			});
		})
		.catch(function() {});
	})).then(function() {
		return costMap;
	});
}

function renderStocksTable() {
	var body = document.getElementById('stocksBody');
	var countEl = document.getElementById('stocksCount');
	if (!body) return;

	if (!stocksItems.length) {
		body.innerHTML = '<tr><td colspan="12" class="cash-muted" style="text-align:center;padding:16px">Нет данных</td></tr>';
		if (countEl) countEl.textContent = '0';
		return;
	}

	var rows = stocksItems.map(function(item) {
		var business = businesses.find(function(b) { return b.id === item.business_id; });
		var businessName = business ? business.company_name : '—';
		var sellerArticle = item.seller_article || '—';
		var nmId = item.nm_id || '—';
		var brand = item.brand || '—';
		var subject = item.subject || '—';
		var qty = Number(item.qty || 0);
		var inWayToClient = Number(item.in_way_to_client || 0);
		var inWayFromClient = Number(item.in_way_from_client || 0);
		var totalQty = Number(item.total_qty || 0);
		var costKey = String(item.business_id) + ':' + String(item.nm_id);
		var costValue = (costKey in stocksCosts) ? stocksCosts[costKey] : null;
		var sumValue = (costValue !== null) ? totalQty * Number(costValue || 0) : null;

		return '<tr>' +
			'<td>' + escapeHtml(businessName) + '</td>' +
			'<td>' + escapeHtml(brand) + '</td>' +
			'<td>' + escapeHtml(subject) + '</td>' +
			'<td>' + escapeHtml(sellerArticle) + '</td>' +
			'<td>' + escapeHtml(nmId) + '</td>' +
			'<td style="text-align:right">' + formatQty(qty) + '</td>' +
			'<td class="stock-extra" style="text-align:right">' + formatQty(inWayToClient) + '</td>' +
			'<td class="stock-extra" style="text-align:right">' + formatQty(inWayFromClient) + '</td>' +
			'<td class="stock-extra stock-extra-total" style="text-align:right">' + formatQty(totalQty) + '</td>' +
			'<td style="text-align:right">' + (costValue !== null ? formatMoney(costValue) : '—') + '</td>' +
			'<td style="text-align:right">' + (sumValue !== null ? formatMoney(sumValue) : '—') + '</td>' +
			'<td class="stocks-spacer"></td>' +
		'</tr>';
	});

	body.innerHTML = rows.join('');
	if (countEl) countEl.textContent = String(stocksItems.length);
}

document.addEventListener('click', function() {
	closeStocksBusinessMenu();
});

function toggleStocksColumns() {
	var table = document.getElementById('stocksTable');
	var btn = document.querySelector('.stocks-toggle');
	if (!table || !btn) return;
	var isOpen = table.classList.toggle('stocks-details-open');
	btn.textContent = isOpen ? '-' : '+';
	btn.title = isOpen ? 'Скрыть детали' : 'Показать детали';
}

loadBusinesses();
</script>
</body></html>`);
	}

	return {
		getStocksPage
	};
};
