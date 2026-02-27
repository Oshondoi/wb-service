const supabase = require('../../supabase-client');
const {
	renderSidebar,
	renderProfileModal,
	renderProfileScript
} = require('./page.shared');

function normalizeFboName(value) {
	return String(value || '').trim().replace(/\s+/g, ' ');
}

const SYSTEM_FBO_WAREHOUSES = [
	'Elektrostal / Электросталь',
	'Koledino / Коледино',
	'Podolsk / Подольск',
	'Podolsk 4 / Подольск 4'
];

const SYSTEM_FBO_WAREHOUSE_ALIASES = [
	'Elektrostal', 'Электросталь',
	'Koledino', 'Коледино',
	'Podolsk', 'Подольск',
	'Podolsk 4', 'Подольск 4',
	...SYSTEM_FBO_WAREHOUSES
];

function normalizeWarehouseToken(value) {
	return normalizeFboName(value)
		.toLowerCase()
		.replace(/\s*\/\s*/g, ' / ')
		.trim();
}

function isSystemWarehouseName(name) {
	const normalized = normalizeWarehouseToken(name);
	return SYSTEM_FBO_WAREHOUSE_ALIASES.some(systemName => normalizeWarehouseToken(systemName) === normalized);
}

async function ensureSystemWarehousesForAccount(ownerAccountId, actorUserId) {
	const { data: existing, error: existingError } = await supabase
		.from('fbo_warehouses')
		.select('id, name')
		.eq('account_id', ownerAccountId)
		.in('name', SYSTEM_FBO_WAREHOUSES);

	if (existingError) throw existingError;

	const existingSet = new Set((existing || []).map(item => normalizeFboName(item.name)));
	const missing = SYSTEM_FBO_WAREHOUSES.filter(name => !existingSet.has(normalizeFboName(name)));
	if (!missing.length) return;

	const rows = missing.map(name => ({
		account_id: ownerAccountId,
		name,
		wb_code: null,
		created_by_user_id: actorUserId || ownerAccountId
	}));

	const { error: insertError } = await supabase
		.from('fbo_warehouses')
		.insert(rows);

	if (insertError) throw insertError;
}

function parseOptionalInt(value) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function pickRpcRow(data) {
	if (Array.isArray(data)) {
		return data[0] || null;
	}
	return data || null;
}

async function resolveFboOwnerAccountId(userAccountId) {
	const { data, error } = await supabase
		.from('account_members')
		.select('account_id, role, is_active')
		.eq('user_account_id', userAccountId)
		.eq('is_active', true)
		.order('role', { ascending: true })
		.limit(1);

	if (error || !Array.isArray(data) || !data.length) return userAccountId;
	const row = data[0];
	return row && row.account_id ? row.account_id : userAccountId;
}

async function getFboScope(req) {
	const ownerAccountId = await resolveFboOwnerAccountId(req.account.id);
	return {
		ownerAccountId,
		actorUserId: req.account.id
	};
}

async function getOwnedBusiness(ownerAccountId, businessId) {
	const { data, error } = await supabase
		.from('businesses')
		.select('id, company_name, account_id, is_active')
		.eq('id', businessId)
		.eq('account_id', ownerAccountId)
		.single();

	if (error || !data) return null;
	return data;
}

async function getOwnedFboShipment(accountId, shipmentId) {
	const { data, error } = await supabase
		.from('fbo_shipments')
		.select('id, status, account_id')
		.eq('id', shipmentId)
		.eq('account_id', accountId)
		.single();

	if (error || !data) return null;
	return data;
}

module.exports = function createShipments2Service(deps) {
	async function getShipments2Page(req, res) {
		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			await ensureSystemWarehousesForAccount(ownerAccountId, actorUserId);
			const { data: existingShipments, error: shipmentsError } = await supabase
				.from('fbo_shipments')
				.select('id')
				.eq('account_id', ownerAccountId)
				.limit(1);
			if (!shipmentsError && (!existingShipments || existingShipments.length === 0)) {
				const { data: firstBusiness } = await supabase
					.from('businesses')
					.select('id, company_name')
					.eq('account_id', ownerAccountId)
					.eq('is_active', true)
					.order('id', { ascending: true })
					.limit(1)
					.single();

				if (!firstBusiness || !firstBusiness.id) {
					throw new Error('Нет активного магазина для создания партии');
				}

				const { data: existingBatch } = await supabase
					.from('fbo_batches')
					.select('id')
					.eq('account_id', ownerAccountId)
					.eq('business_id', firstBusiness.id)
					.order('created_at', { ascending: false })
					.limit(1)
					.single();

				let batchId = existingBatch && existingBatch.id ? existingBatch.id : null;
				if (!batchId) {
					const { data: batch, error: batchError } = await supabase
						.from('fbo_batches')
						.insert({
							account_id: ownerAccountId,
							business_id: firstBusiness.id,
							name: firstBusiness.company_name,
							created_by_user_id: actorUserId
						})
						.select('id')
						.single();
					if (batchError) throw batchError;
					batchId = batch.id;
				}

				const { data: source, error: sourceError } = await supabase
					.from('fbo_sources')
					.insert({
						account_id: ownerAccountId,
						name: 'Тестовый источник (shipments-2)',
						created_by_user_id: actorUserId
					})
					.select('id')
					.single();
				if (sourceError) throw sourceError;

				const { data: warehouse, error: warehouseError } = await supabase
					.from('fbo_warehouses')
					.select('id')
					.eq('account_id', ownerAccountId)
					.in('name', SYSTEM_FBO_WAREHOUSES)
					.order('id', { ascending: true })
					.limit(1)
					.single();
				if (warehouseError) throw warehouseError;

				const { data: shipment, error: shipmentError } = await supabase
					.from('fbo_shipments')
					.insert({
						account_id: ownerAccountId,
						source_id: source.id,
						batch_id: batchId,
						created_by_user_id: actorUserId
					})
					.select('id')
					.single();
				if (shipmentError) throw shipmentError;

				const { error: linkError } = await supabase
					.from('fbo_shipment_warehouses')
					.insert({
						shipment_id: shipment.id,
						warehouse_id: warehouse.id,
						created_by_user_id: actorUserId
					});
				if (linkError) throw linkError;
			}
		} catch (seedError) {
			console.warn('shipments-2 seed warning:', seedError && seedError.message ? seedError.message : seedError);
		}

		res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper - Отгрузки 2</title>
<style>
*{box-sizing:border-box}
html{overflow-y:scroll}
*{scrollbar-width:thin;scrollbar-color:rgba(56,189,248,0.45) rgba(15,23,42,0.55)}
*::-webkit-scrollbar{width:8px;height:8px}
*::-webkit-scrollbar-track{background:rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.45);border-radius:10px;border:2px solid rgba(15,23,42,0.55)}
*::-webkit-scrollbar-thumb:hover{background:rgba(56,189,248,0.7)}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:24px 24px 24px 0;color:#e2e8f0;background:#0b1220;background-image:radial-gradient(1200px 600px at 10% -10%,rgba(56,189,248,0.25),rgba(0,0,0,0)),radial-gradient(900px 500px at 90% 0%,rgba(34,197,94,0.15),rgba(0,0,0,0)),linear-gradient(180deg,#0b1220 0%,#0f172a 40%,#0b1220 100%);min-height:100vh}
.layout{display:flex;gap:18px;min-height:calc(100vh - 48px);padding-left:110px}
.sidebar{width:92px;flex:0 0 92px;background:rgba(10,16,30,0.92);border:1px solid rgba(148,163,184,0.12);border-radius:0;box-shadow:0 20px 50px rgba(2,6,23,0.45);padding:10px 8px;position:fixed;left:0;top:0;bottom:0;height:100vh;display:flex;flex-direction:column;gap:14px;z-index:30}
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
.sidebar-footer{margin-top:auto}
.main{flex:1;min-width:0}
.container{width:100%;max-width:none;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:26px 26px 30px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:16px 18px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:16px}
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.api-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.2s;letter-spacing:0.4px;text-transform:uppercase}
.api-btn:hover{border-color:#38bdf8}
.filter-menu{position:relative;display:inline-flex}
.filter-dropdown{position:absolute;top:calc(100% + 6px);left:0;min-width:190px;background:#0f172a;border:1px solid rgba(148,163,184,0.25);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.4);padding:6px;z-index:30;display:none}
.filter-dropdown.open{display:block}
.filter-item{padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#e2e8f0;cursor:pointer;transition:background 0.2s,color 0.2s}
.filter-item:hover{background:rgba(56,189,248,0.15);color:#fff}
.filter-item.active{background:rgba(34,197,94,0.2);color:#86efac}
.table-wrap{max-height:60vh;overflow:auto;border:1px solid rgba(148,163,184,0.2);border-radius:10px}
.cash-table{width:100%;border-collapse:collapse}
.cash-table th{background:#0b1220;color:#e2e8f0;font-size:12px;text-align:left;padding:10px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:10}
.cash-table td{padding:10px;border-bottom:1px solid rgba(148,163,184,0.15);font-size:12px;color:#e2e8f0}
.cash-muted{color:#94a3b8;font-size:12px}
.check-col{width:32px;text-align:center}
.date-col{width:1%;white-space:nowrap}
.shipment-name{font-size:12px;font-weight:600;letter-spacing:0;color:#f8fafc}
.meta-col{font-size:12px;color:#cbd5f5;white-space:nowrap}
.status-text{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.status-text::before{content:'●';font-size:10px;line-height:1}
.status-draft{color:#facc15}
.status-done{color:#22c55e}
.status-canceled{color:#ef4444}
.actions-cell{width:170px;text-align:right;white-space:nowrap}
.icon-btn{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid rgba(148,163,184,0.35);background:rgba(12,18,34,0.75);color:#e2e8f0;cursor:pointer;margin-left:6px;transition:all 0.2s}
.icon-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.icon-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.row-action-btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 8px;line-height:0;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:transparent;color:#e2e8f0;cursor:pointer;margin-left:6px;transition:all 0.2s}
.row-action-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.row-action-btn:hover{transform:translateY(-2px);border-color:#38bdf8;color:#fff;box-shadow:0 10px 22px rgba(56,189,248,0.2)}
.row-check,.head-check{accent-color:#38bdf8;cursor:pointer}
.edit-form-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:12px}
.edit-field{display:flex;flex-direction:column;gap:6px}
.edit-field.full{grid-column:1 / -1}
.edit-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.4px;text-transform:uppercase}
.edit-select{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0}
.edit-select:focus{outline:none;border-color:#38bdf8;box-shadow:0 0 0 4px rgba(56,189,248,0.12)}
.edit-static{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.2);border-radius:10px;font-size:12px;font-weight:600;background:rgba(2,6,23,0.55);color:#e2e8f0;min-height:38px;display:flex;align-items:center}
.edit-list{display:flex;flex-wrap:wrap;gap:6px;min-height:38px}
.edit-pill{display:inline-flex;align-items:center;padding:6px 8px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.85);color:#cbd5f5;font-size:11px;font-weight:600}
.edit-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}
@media (max-width: 900px){.layout{flex-direction:column;padding-left:0}.sidebar{width:100%;height:auto;position:relative}.shipment-name{font-size:16px}.edit-form-grid{grid-template-columns:1fr}}
</style></head><body>
<div class="layout">
	${renderSidebar('/shipments-2')}
	<main class="main">
		<div class="container">
			<div class="section">
				<div class="toolbar">
					<button type="button" id="btnCreateShipment2Batch" class="api-btn" style="padding:6px 10px">Создать партию</button>
					<button type="button" id="btnCreateShipment2Warehouse" class="api-btn" style="padding:6px 10px">Создать склад</button>
					<button type="button" id="btnRefreshShipments2" class="api-btn" style="padding:6px 10px">Обновить</button>
				</div>
			</div>

			<div class="section">
				<div class="table-wrap">
					<table class="cash-table">
						<thead>
							<tr>
								<th class="check-col"><input id="shipments2CheckAll" class="head-check" type="checkbox" /></th>
								<th class="date-col">Дата создания</th>
								<th>Название поставки</th>
								<th>Партия</th>
								<th>Склад</th>
								<th>Кол-во коробов</th>
								<th>Кол-во товара</th>
								<th>Статус</th>
								<th>Автор</th>
								<th class="actions-cell"></th>
							</tr>
						</thead>
						<tbody id="shipments2Body"></tbody>
					</table>
				</div>
			</div>
		</div>
	</main>
</div>
${renderProfileModal()}
${renderProfileScript()}
<div id="shipment2EditModal" class="modal" onclick="closeShipment2EditModalOnOutsideClick(event)">
	<div class="modal-content" style="max-width:620px" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Редактировать поставку</h2>
			<button class="close-btn" type="button" onclick="closeShipment2EditModal()">&times;</button>
		</div>
		<div class="edit-form-grid">
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditPublicId">Поставка</label>
				<div id="shipment2EditPublicId" class="edit-static">—</div>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditStatus">Статус</label>
				<div id="shipment2EditStatus" class="edit-static">—</div>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditSource">Источник</label>
				<select id="shipment2EditSource" class="edit-select"></select>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditBatch">Партия</label>
				<div id="shipment2EditBatch" class="edit-static">—</div>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditDate">Дата создания</label>
				<div id="shipment2EditDate" class="edit-static">—</div>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditAuthor">Автор</label>
				<div id="shipment2EditAuthor" class="edit-static">—</div>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditBoxes">Кол-во коробов</label>
				<div id="shipment2EditBoxes" class="edit-static">—</div>
			</div>
			<div class="edit-field">
				<label class="edit-label" for="shipment2EditItems">Кол-во товара</label>
				<div id="shipment2EditItems" class="edit-static">—</div>
			</div>
			<div class="edit-field full">
				<label class="edit-label" for="shipment2EditWarehouses">Склад</label>
				<div id="shipment2EditWarehouses" class="edit-list"></div>
			</div>
		</div>
		<div class="edit-actions">
			<button class="api-btn" type="button" onclick="closeShipment2EditModal()">Отмена</button>
			<button class="api-btn" type="button" onclick="saveShipment2Edit()">Сохранить</button>
		</div>
	</div>
</div>
<script>
function escapeHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}
function authHeaders(json){
	var token = localStorage.getItem('authToken');
	if (!token) {
		var m = document.cookie.match(/(?:^|;\\s*)authToken=([^;]+)/);
		if (m && m[1]) {
			token = decodeURIComponent(m[1]);
			localStorage.setItem('authToken', token);
		}
	}
	var h = token ? { 'Authorization': 'Bearer ' + token } : {};
	if (json) h['Content-Type'] = 'application/json';
	return h;
}
async function apiRequest(path, options){
	try {
		var res = await fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}));
		var ct = (res.headers.get('content-type') || '').toLowerCase();
		var payload = ct.indexOf('application/json') !== -1 ? await res.json() : { success:false, error:'HTTP ' + res.status };
		if (!res.ok) {
			payload = payload && typeof payload === 'object' ? payload : { success:false };
			payload.success = false;
			if (!payload.error) payload.error = 'HTTP ' + res.status;
		}
		return payload;
	} catch (e) {
		return { success:false, error:(e && e.message) ? e.message : 'Сетевая ошибка' };
	}
}
async function apiGet(path){ return apiRequest(path,{ headers: authHeaders(false) }); }
async function apiPost(path, body){ return apiRequest(path,{ method:'POST', headers: authHeaders(true), body: JSON.stringify(body||{}) }); }
async function apiPut(path, body){ return apiRequest(path,{ method:'PUT', headers: authHeaders(true), body: JSON.stringify(body||{}) }); }
async function apiDelete(path){ return apiRequest(path,{ method:'DELETE', headers: authHeaders(false) }); }

var shipments2Items = [];
var shipments2Sources = [];
var shipment2EditingId = null;
var shipment2EditingWarehouses = [];
var shipment2ShowEnglish = true;

function getShipmentDisplayName(item){
	if (item && item.public_id) return item.public_id;
	if (item && item.id) return '#' + item.id;
	return '—';
}

function formatDashValue(value){
	if (value === null || value === undefined) return '—';
	var text = String(value).trim();
	return text ? text : '—';
}

function formatDashCount(value){
	var num = Number(value);
	if (!Number.isFinite(num) || num <= 0) return '—';
	return String(num);
}

function getBatchDisplayName(item){
	if (!item || !item.batch_id) return '—';
	if (item.batch_public_id) return String(item.batch_public_id);
	var batchName = item.batch_name ? String(item.batch_name) : 'Партия';
	var batchCode = item.batch_seq_no ? String(item.batch_seq_no) : String(item.batch_id);
	return batchName + ' - ' + batchCode;
}

function formatDateOnly(value){
	if (!value) return '—';
	var d = new Date(value);
	if (isNaN(d.getTime())) return '—';
	return d.toLocaleDateString('ru-RU');
}

function formatShipmentStatus(status){
	var value = String(status || '').trim().toLowerCase();
	if (value === 'draft') return 'Формируется';
	if (value === 'done') return 'Отгружено';
	if (value === 'canceled') return 'Аннулировано';
	return formatDashValue(status);
}

function formatShipmentWarehouse(item){
	if (!item) return '—';
	if (Array.isArray(item.warehouse_names) && item.warehouse_names.length) {
		return item.warehouse_names.map(function(name){ return formatWarehouseDisplayName(name); }).join(', ');
	}
	if (item.warehouse_name) return formatWarehouseDisplayName(String(item.warehouse_name));
	return '—';
}

function transliterateRuToEn(value){
	var map = {
		'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'
	};
	var source = String(value || '');
	var out = '';
	for (var i = 0; i < source.length; i += 1) {
		var ch = source[i];
		var lower = ch.toLowerCase();
		if (!Object.prototype.hasOwnProperty.call(map, lower)) {
			out += ch;
			continue;
		}
		var latin = map[lower];
		if (!latin) continue;
		var isUpper = ch === ch.toUpperCase() && ch !== ch.toLowerCase();
		if (!isUpper) {
			out += latin;
			continue;
		}
		out += latin.charAt(0).toUpperCase() + latin.slice(1);
	}
	return out;
}

function parseWarehouseNameParts(name){
	var raw = String(name || '').trim();
	if (!raw) return { raw: '—', ru: '', en: '' };
	var chunks = raw.split('/').map(function(part){ return String(part || '').trim(); }).filter(Boolean);
	if (chunks.length >= 2) {
		var left = chunks[0];
		var right = chunks[1];
		var leftHasRu = /[А-Яа-яЁё]/.test(left);
		var rightHasRu = /[А-Яа-яЁё]/.test(right);
		if (!leftHasRu && rightHasRu) return { raw: raw, en: left, ru: right };
		if (leftHasRu && !rightHasRu) return { raw: raw, en: right, ru: left };
		return { raw: raw, en: left, ru: right };
	}
	var hasRu = /[А-Яа-яЁё]/.test(raw);
	if (hasRu) {
		return { raw: raw, ru: raw, en: transliterateRuToEn(raw) };
	}
	return { raw: raw, ru: '', en: raw };
}

function formatWarehouseDisplayName(name){
	var parts = parseWarehouseNameParts(name);
	if (parts.en && parts.ru) {
		return parts.en + ' / ' + parts.ru;
	}
	if (parts.en) return parts.en;
	return parts.raw || '—';
}

function getShipmentStatusClass(status){
	var value = String(status || '').trim().toLowerCase();
	if (value === 'draft') return 'status-draft';
	if (value === 'done') return 'status-done';
	if (value === 'canceled') return 'status-canceled';
	return '';
}

function setElementText(id, value){
	var el = document.getElementById(id);
	if (!el) return;
	el.textContent = formatDashValue(value);
}

async function createShipment2Warehouse(){
	var rawName = prompt('Название склада');
	if (rawName === null) return;
	var name = String(rawName || '').trim();
	if (!name) {
		alert('Название склада обязательно');
		return;
	}
	var result = await apiPost('/api/fbo/warehouses', { name: name });
	if (!result || !result.success) {
		alert((result && result.error) || 'Ошибка создания склада');
		return;
	}
	alert('Склад создан');
	await loadShipments2();
}

async function createShipment2Batch(){
	var businessesRes = await apiGet('/api/fbo/businesses');
	var businesses = (businessesRes && businessesRes.success && Array.isArray(businessesRes.items)) ? businessesRes.items : [];
	if (!businesses.length) {
		alert('Нет активных магазинов для создания партии');
		return;
	}

	var businessId = 0;
	if (businesses.length === 1) {
		businessId = Number(businesses[0].id);
	} else {
		var optionsText = businesses.map(function(item, index){
			var label = item && item.company_name ? String(item.company_name) : ('ID ' + item.id);
			return String(index + 1) + '. ' + label;
		}).join('\\n');
		var rawChoice = prompt('Выберите магазин для партии (номер):\\n' + optionsText, '1');
		if (rawChoice === null) return;
		var choice = parseInt(String(rawChoice || '').trim(), 10);
		if (!Number.isFinite(choice) || choice < 1 || choice > businesses.length) {
			alert('Некорректный номер магазина');
			return;
		}
		businessId = Number(businesses[choice - 1].id);
	}

	if (!businessId) {
		alert('Не удалось определить магазин');
		return;
	}

	var result = await apiPost('/api/fbo/batches', { business_id: businessId });
	if (!result || !result.success) {
		alert((result && result.error) || 'Ошибка создания партии');
		return;
	}

	var batchLabel = (result.item && result.item.public_id) ? String(result.item.public_id) : 'Партия создана';
	alert(batchLabel);
	await loadShipments2();
}

async function loadShipment2EditWarehouses(shipmentId){
	var res = await apiGet('/api/fbo/shipments/' + shipmentId + '/warehouses');
	shipment2EditingWarehouses = (res && res.success && Array.isArray(res.items)) ? res.items : [];
}

function renderShipment2EditWarehouses(){
	var root = document.getElementById('shipment2EditWarehouses');
	if (!root) return;
	if (!shipment2EditingWarehouses.length) {
		root.innerHTML = '<span class="edit-static" style="width:100%">—</span>';
		return;
	}
	root.innerHTML = shipment2EditingWarehouses.map(function(item){
		var name = item && item.warehouse_name ? String(item.warehouse_name) : (item && item.warehouse_id ? ('ID ' + item.warehouse_id) : '—');
		var code = item && item.wb_code ? String(item.wb_code) : null;
		var labelName = formatWarehouseDisplayName(name);
		var label = code ? (labelName + ' · ' + code) : labelName;
		return '<span class="edit-pill">' + escapeHtml(label) + '</span>';
	}).join('');
}

function fillShipment2EditReadonly(shipment){
	setElementText('shipment2EditPublicId', getShipmentDisplayName(shipment));
	setElementText('shipment2EditStatus', formatShipmentStatus(shipment && shipment.status));
	setElementText('shipment2EditBatch', getBatchDisplayName(shipment));
	setElementText('shipment2EditDate', formatDateOnly(shipment && shipment.created_at));
	setElementText('shipment2EditAuthor', getShipmentAuthor(shipment));
	setElementText('shipment2EditBoxes', formatDashCount(shipment && shipment.boxes_count));
	setElementText('shipment2EditItems', formatDashCount(shipment && shipment.items_count));
}

function getShipmentAuthor(item){
	if (!item) return '—';
	if (item.created_by_user_login) return String(item.created_by_user_login);
	return '—';
}

function bindCheckAll(){
	var head = document.getElementById('shipments2CheckAll');
	if (!head) return;
	head.addEventListener('change', function(){
		document.querySelectorAll('.row-check').forEach(function(el){ el.checked = head.checked; });
	});
}

async function loadShipments2(){
	var tbody = document.getElementById('shipments2Body');
	var head = document.getElementById('shipments2CheckAll');
	if (head) head.checked = false;
	var data = await apiGet('/api/fbo/shipments');
	var items = (data && data.success && Array.isArray(data.items)) ? data.items : [];
	shipments2Items = items;
	if (!items.length) {
		tbody.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:12px">Поставок нет</td></tr>';
		return;
	}
	tbody.innerHTML = items.map(function(item){
		var title = escapeHtml(formatDashValue(getShipmentDisplayName(item)));
		var status = escapeHtml(formatShipmentStatus(item && item.status));
		var statusClass = getShipmentStatusClass(item && item.status);
		var batch = escapeHtml(formatDashValue(getBatchDisplayName(item)));
		var warehouse = escapeHtml(formatDashValue(formatShipmentWarehouse(item)));
		var boxes = escapeHtml(formatDashCount(item.boxes_count));
		var units = escapeHtml(formatDashCount(item.items_count));
		var date = escapeHtml(formatDashValue(formatDateOnly(item.created_at)));
		var author = escapeHtml(formatDashValue(getShipmentAuthor(item)));
		return '<tr>'
			+ '<td class="check-col"><input class="row-check" type="checkbox" data-id="' + item.id + '" /></td>'
			+ '<td class="meta-col date-col">' + date + '</td>'
			+ '<td><span class="shipment-name">' + title + '</span></td>'
			+ '<td class="meta-col">' + batch + '</td>'
			+ '<td class="meta-col">' + warehouse + '</td>'
			+ '<td class="meta-col">' + boxes + '</td>'
			+ '<td class="meta-col">' + units + '</td>'
			+ '<td class="meta-col"><span class="status-text ' + statusClass + '">' + status + '</span></td>'
			+ '<td class="meta-col">' + author + '</td>'
			+ '<td class="actions-cell">'
			+ '<button class="icon-btn" type="button" title="Детали" onclick="openShipment2Details(' + item.id + ')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.5" /></svg></button>'
			+ '<button class="row-action-btn" type="button" title="Редактировать" onclick="editShipment2(' + item.id + ')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>'
			+ '<button class="row-action-btn" type="button" title="Удалить" onclick="deleteShipment2(' + item.id + ')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
			+ '</td>'
			+ '</tr>';
	}).join('');
}

async function deleteShipment2(id){
	if (!confirm('Удалить поставку?')) return;
	var d = await apiDelete('/api/fbo/shipments/' + id);
	if (!d || !d.success) return alert((d && d.error) || 'Ошибка удаления');
	await loadShipments2();
}

async function ensureShipment2EditDictionaries(){
	var sourcesRes = await apiGet('/api/fbo/sources');
	shipments2Sources = (sourcesRes && sourcesRes.success && Array.isArray(sourcesRes.items)) ? sourcesRes.items : [];
}

function fillShipment2EditSelects(selectedSourceId){
	var sourceEl = document.getElementById('shipment2EditSource');
	if (!sourceEl) return;

	sourceEl.innerHTML = shipments2Sources.length
		? shipments2Sources.map(function(item){ return '<option value="' + item.id + '">' + escapeHtml(item.name || ('ID ' + item.id)) + '</option>'; }).join('')
		: '<option value="">Нет источников</option>';

	if (selectedSourceId) sourceEl.value = String(selectedSourceId);
}

function closeShipment2EditModal(){
	var modal = document.getElementById('shipment2EditModal');
	if (modal) modal.classList.remove('active');
	shipment2EditingId = null;
	shipment2EditingWarehouses = [];
}

function closeShipment2EditModalOnOutsideClick(event){
	if (event && event.target && event.target.id === 'shipment2EditModal') {
		closeShipment2EditModal();
	}
}

async function editShipment2(id){
	var shipment = (shipments2Items || []).find(function(item){ return Number(item.id) === Number(id); });
	if (!shipment) {
		alert('Поставка не найдена');
		return;
	}
	await ensureShipment2EditDictionaries();
	if (!shipments2Sources.length) {
		alert('Недостаточно данных для редактирования (источники)');
		return;
	}
	await loadShipment2EditWarehouses(id);
	shipment2EditingId = Number(id);
	fillShipment2EditSelects(shipment.source_id);
	fillShipment2EditReadonly(shipment);
	renderShipment2EditWarehouses();
	var modal = document.getElementById('shipment2EditModal');
	if (modal) modal.classList.add('active');
}

async function saveShipment2Edit(){
	if (!shipment2EditingId) return;
	var sourceId = parseInt((document.getElementById('shipment2EditSource') || {}).value || '0', 10);
	if (!sourceId) {
		alert('Выбери источник');
		return;
	}
	var result = await apiPut('/api/fbo/shipments/' + shipment2EditingId, { source_id: sourceId });
	if (!result || !result.success) {
		alert((result && result.error) || 'Ошибка обновления поставки');
		return;
	}
	closeShipment2EditModal();
	await loadShipments2();
}

function openShipment2Details(id){
	window.location.href = '/shipments';
}

window.deleteShipment2 = deleteShipment2;
window.openShipment2Details = openShipment2Details;
window.editShipment2 = editShipment2;
window.closeShipment2EditModal = closeShipment2EditModal;
window.closeShipment2EditModalOnOutsideClick = closeShipment2EditModalOnOutsideClick;
window.saveShipment2Edit = saveShipment2Edit;
window.createShipment2Batch = createShipment2Batch;
window.createShipment2Warehouse = createShipment2Warehouse;

document.getElementById('btnRefreshShipments2').addEventListener('click', function(){ loadShipments2(); });
document.getElementById('btnCreateShipment2Batch').addEventListener('click', function(){ createShipment2Batch(); });
document.getElementById('btnCreateShipment2Warehouse').addEventListener('click', function(){ createShipment2Warehouse(); });
bindCheckAll();
loadShipments2();
</script>
</body></html>`);
	}

	async function getFboBusinesses(req, res) {
		try {
			const { ownerAccountId } = await getFboScope(req);
			const { data, error } = await supabase
				.from('businesses')
				.select('id, company_name, is_active')
				.eq('account_id', ownerAccountId)
				.eq('is_active', true)
				.order('company_name', { ascending: true });

			if (error) throw error;
			res.json({ success: true, items: data || [] });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки магазинов для партий' });
		}
	}

	async function getFboBatches(req, res) {
		try {
			const { ownerAccountId } = await getFboScope(req);
			const { data, error } = await supabase
				.from('fbo_batches')
				.select('id, name, business_id, seq_no, public_id, is_active, created_at, businesses(company_name)')
				.eq('account_id', ownerAccountId)
				.eq('is_active', true)
				.order('created_at', { ascending: false });

			if (error) throw error;

			const items = (data || []).map(item => ({
				id: item.id,
				name: item.name,
				business_id: item.business_id || null,
				business_name: item.businesses && item.businesses.company_name ? item.businesses.company_name : null,
				seq_no: item.seq_no || null,
				public_id: item.public_id || null,
				is_active: item.is_active,
				created_at: item.created_at
			}));

			res.json({ success: true, items });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки партий' });
		}
	}

	async function postFboBatches(req, res) {
		const businessId = parseOptionalInt(req.body && req.body.business_id);
		if (!businessId) {
			return res.json({ success: false, error: 'business_id обязателен для создания партии' });
		}

		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const business = await getOwnedBusiness(ownerAccountId, businessId);
			if (!business) {
				return res.json({ success: false, error: 'Магазин не найден или недоступен' });
			}

			const nextSeq = async () => {
				const { data: last } = await supabase
					.from('fbo_batches')
					.select('seq_no')
					.eq('business_id', business.id)
					.order('seq_no', { ascending: false })
					.limit(1);
				const maxSeq = Array.isArray(last) && last.length && Number.isFinite(Number(last[0].seq_no))
					? Number(last[0].seq_no)
					: 0;
				return maxSeq + 1;
			};

			let created = null;
			let lastError = null;

			for (let attempt = 0; attempt < 3; attempt += 1) {
				const seqNo = await nextSeq();
				const businessName = normalizeFboName(business.company_name);
				const publicId = `${businessName} - ${seqNo}`;

				const { data, error } = await supabase
					.from('fbo_batches')
					.insert({
						account_id: ownerAccountId,
						business_id: business.id,
						name: businessName,
						seq_no: seqNo,
						public_id: publicId,
						created_by_user_id: actorUserId
					})
					.select('id, name, business_id, seq_no, public_id, is_active, created_at')
					.single();

				if (!error) {
					created = data;
					break;
				}

				lastError = error;
				const isDuplicate = error && error.code === '23505';
				if (!isDuplicate) break;
			}

			if (!created) {
				throw lastError || new Error('Ошибка создания партии');
			}

			res.json({ success: true, item: created });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка создания партии' });
		}
	}

	async function getFboSources(req, res) {
		try {
			const { ownerAccountId } = await getFboScope(req);
			const { data, error } = await supabase
				.from('fbo_sources')
				.select('id, name, is_active, created_at')
				.eq('account_id', ownerAccountId)
				.eq('is_active', true)
				.order('name', { ascending: true });

			if (error) throw error;
			res.json({ success: true, items: data || [] });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки источников' });
		}
	}

	async function postFboSources(req, res) {
		const name = normalizeFboName(req.body && req.body.name);
		if (!name) {
			return res.json({ success: false, error: 'Название источника обязательно' });
		}

		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const { data, error } = await supabase
				.from('fbo_sources')
				.insert({
					account_id: ownerAccountId,
					name,
					created_by_user_id: actorUserId
				})
				.select('id, name, is_active, created_at')
				.single();

			if (error) throw error;
			res.json({ success: true, item: data });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка создания источника' });
		}
	}

	async function getFboWarehouses(req, res) {
		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			await ensureSystemWarehousesForAccount(ownerAccountId, actorUserId);
			const { data, error } = await supabase
				.from('fbo_warehouses')
				.select('id, name, wb_code, is_active, created_at')
				.eq('account_id', ownerAccountId)
				.eq('is_active', true)
				.order('name', { ascending: true });

			if (error) throw error;
			res.json({ success: true, items: data || [] });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки складов' });
		}
	}

	async function postFboWarehouses(req, res) {
		const name = normalizeFboName(req.body && req.body.name);
		const wbCodeRaw = req.body && req.body.wb_code ? String(req.body.wb_code) : '';
		const wbCode = wbCodeRaw.trim() || null;

		if (!name) {
			return res.json({ success: false, error: 'Название склада обязательно' });
		}
		if (isSystemWarehouseName(name)) {
			return res.json({ success: false, error: 'Системный склад нельзя добавлять вручную' });
		}

		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const { data, error } = await supabase
				.from('fbo_warehouses')
				.insert({
					account_id: ownerAccountId,
					name,
					wb_code: wbCode,
					created_by_user_id: actorUserId
				})
				.select('id, name, wb_code, is_active, created_at')
				.single();

			if (error) throw error;
			res.json({ success: true, item: data });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка создания склада' });
		}
	}

	async function deleteFboSource(req, res) {
		const sourceId = parseOptionalInt(req.params.id);
		if (!sourceId) return res.json({ success: false, error: 'Некорректный source_id' });

		try {
			const { ownerAccountId } = await getFboScope(req);
			const { error } = await supabase
				.from('fbo_sources')
				.delete()
				.eq('id', sourceId)
				.eq('account_id', ownerAccountId);

			if (error) throw error;
			res.json({ success: true });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка удаления источника' });
		}
	}

	async function deleteFboWarehouse(req, res) {
		const warehouseId = parseOptionalInt(req.params.id);
		if (!warehouseId) return res.json({ success: false, error: 'Некорректный warehouse_id' });

		try {
			const { ownerAccountId } = await getFboScope(req);
			const { data: warehouse, error: warehouseError } = await supabase
				.from('fbo_warehouses')
				.select('id, name')
				.eq('id', warehouseId)
				.eq('account_id', ownerAccountId)
				.single();

			if (warehouseError || !warehouse) {
				return res.json({ success: false, error: 'Склад не найден' });
			}
			if (isSystemWarehouseName(warehouse.name)) {
				return res.json({ success: false, error: 'Системный склад нельзя удалить' });
			}
			const { error } = await supabase
				.from('fbo_warehouses')
				.delete()
				.eq('id', warehouseId)
				.eq('account_id', ownerAccountId);

			if (error) throw error;
			res.json({ success: true });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка удаления склада' });
		}
	}

	async function getFboShipments(req, res) {
		try {
			const { ownerAccountId } = await getFboScope(req);
			const { data, error } = await supabase
				.from('fbo_shipments')
				.select('id, public_id, status, created_at, source_id, batch_id, created_by_user_id, fbo_sources(name), fbo_batches(name, public_id, seq_no, business_id)')
				.eq('account_id', ownerAccountId)
				.order('created_at', { ascending: false })
				.limit(200);

			if (error) throw error;

			const shipmentIds = (data || []).map(item => item.id);
			let whMap = {};
			let whNamesMap = {};
			let whIdsMap = {};
			let boxMap = {};
			let itemMap = {};
			if (shipmentIds.length) {
				const { data: links } = await supabase
					.from('fbo_shipment_warehouses')
					.select('shipment_id, id, warehouse_id, fbo_warehouses(name)')
					.in('shipment_id', shipmentIds);
				(links || []).forEach(link => {
					whMap[link.shipment_id] = (whMap[link.shipment_id] || 0) + 1;
					const warehouseId = parseOptionalInt(link && link.warehouse_id);
					if (warehouseId) {
						if (!Array.isArray(whIdsMap[link.shipment_id])) whIdsMap[link.shipment_id] = [];
						if (!whIdsMap[link.shipment_id].includes(warehouseId)) whIdsMap[link.shipment_id].push(warehouseId);
					}
					const warehouseName = link && link.fbo_warehouses && link.fbo_warehouses.name ? String(link.fbo_warehouses.name).trim() : '';
					if (!warehouseName) return;
					if (!Array.isArray(whNamesMap[link.shipment_id])) whNamesMap[link.shipment_id] = [];
					if (!whNamesMap[link.shipment_id].includes(warehouseName)) whNamesMap[link.shipment_id].push(warehouseName);
				});

				const shipmentWarehouseIds = (links || []).map(link => link.id);
				if (shipmentWarehouseIds.length) {
					const linkToShipmentMap = {};
					(links || []).forEach(link => {
						linkToShipmentMap[link.id] = link.shipment_id;
					});

					const { data: boxes } = await supabase
						.from('fbo_boxes')
						.select('id, shipment_warehouse_id')
						.in('shipment_warehouse_id', shipmentWarehouseIds);

					const boxToShipmentMap = {};
					(boxes || []).forEach(box => {
						const shipmentId = linkToShipmentMap[box.shipment_warehouse_id];
						if (!shipmentId) return;
						boxMap[shipmentId] = (boxMap[shipmentId] || 0) + 1;
						boxToShipmentMap[box.id] = shipmentId;
					});

					const boxIds = (boxes || []).map(box => box.id);
					if (boxIds.length) {
						const { data: scans } = await supabase
							.from('fbo_scan_events')
							.select('box_id')
							.in('box_id', boxIds);

						(scans || []).forEach(scan => {
							const shipmentId = boxToShipmentMap[scan.box_id];
							if (!shipmentId) return;
							itemMap[shipmentId] = (itemMap[shipmentId] || 0) + 1;
						});
					}
				}
			}

			const authorIds = Array.from(new Set((data || [])
				.map(item => parseOptionalInt(item.created_by_user_id))
				.filter(id => Number.isFinite(id))));
			let authorMap = {};
			if (authorIds.length) {
				const { data: authors } = await supabase
					.from('accounts')
					.select('id, username')
					.in('id', authorIds);
				(authors || []).forEach(author => {
					authorMap[author.id] = author && author.username ? author.username : null;
				});
			}

			const items = (data || []).map(item => ({
				id: item.id,
				public_id: item.public_id,
				status: item.status,
				created_at: item.created_at,
				source_id: item.source_id,
				batch_id: item.batch_id || null,
				created_by_user_id: item.created_by_user_id,
				created_by_user_login: authorMap[item.created_by_user_id] || null,
				batch_name: item.fbo_batches && item.fbo_batches.name ? item.fbo_batches.name : null,
				batch_public_id: item.fbo_batches && item.fbo_batches.public_id ? item.fbo_batches.public_id : null,
				batch_seq_no: item.fbo_batches && item.fbo_batches.seq_no ? item.fbo_batches.seq_no : null,
				batch_business_id: item.fbo_batches && item.fbo_batches.business_id ? item.fbo_batches.business_id : null,
				source_name: item.fbo_sources && item.fbo_sources.name ? item.fbo_sources.name : null,
				warehouse_name: whNamesMap[item.id] && whNamesMap[item.id][0] ? whNamesMap[item.id][0] : null,
				warehouse_names: whNamesMap[item.id] || [],
				warehouse_ids: whIdsMap[item.id] || [],
				warehouses_count: whMap[item.id] || 0,
				boxes_count: boxMap[item.id] || 0,
				items_count: itemMap[item.id] || 0
			}));

			res.json({ success: true, items });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки поставок' });
		}
	}

	async function postFboShipments(req, res) {
		const sourceId = parseOptionalInt(req.body && req.body.source_id);
		const batchId = parseOptionalInt(req.body && req.body.batch_id);
		if (!sourceId) {
			return res.json({ success: false, error: 'source_id обязателен' });
		}
		if (!batchId) {
			return res.json({ success: false, error: 'batch_id обязателен' });
		}

		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const { data: batch, error: batchError } = await supabase
				.from('fbo_batches')
				.select('id')
				.eq('id', batchId)
				.eq('account_id', ownerAccountId)
				.single();
			if (batchError || !batch) {
				return res.json({ success: false, error: 'Партия не найдена' });
			}

			const { data, error } = await supabase
				.from('fbo_shipments')
				.insert({
					account_id: ownerAccountId,
					source_id: sourceId,
					batch_id: batchId,
					created_by_user_id: actorUserId
				})
				.select('id, public_id, status, created_at, source_id, batch_id')
				.single();

			if (error) throw error;
			res.json({ success: true, item: data });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка создания поставки' });
		}
	}

	async function putFboShipments(req, res) {
		const shipmentId = parseOptionalInt(req.params.id);
		const sourceId = parseOptionalInt(req.body && req.body.source_id);

		if (!shipmentId) {
			return res.json({ success: false, error: 'Некорректный shipment_id' });
		}
		if (!sourceId) {
			return res.json({ success: false, error: 'source_id обязателен' });
		}

		try {
			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, shipmentId);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') {
				return res.json({ success: false, error: 'Редактирование доступно только для draft поставки' });
			}

			const { data: source, error: sourceError } = await supabase
				.from('fbo_sources')
				.select('id')
				.eq('id', sourceId)
				.eq('account_id', ownerAccountId)
				.single();
			if (sourceError || !source) {
				return res.json({ success: false, error: 'Источник не найден' });
			}

			const { data, error } = await supabase
				.from('fbo_shipments')
				.update({
					source_id: sourceId
				})
				.eq('id', shipmentId)
				.eq('account_id', ownerAccountId)
				.select('id, public_id, status, created_at, source_id, batch_id')
				.single();

			if (error) throw error;
			res.json({ success: true, item: data });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка обновления поставки' });
		}
	}

	async function deleteFboShipments(req, res) {
		const shipmentId = parseOptionalInt(req.params.id);
		if (!shipmentId) return res.json({ success: false, error: 'Некорректный shipment_id' });

		try {
			const { ownerAccountId } = await getFboScope(req);
			const { error } = await supabase
				.from('fbo_shipments')
				.delete()
				.eq('id', shipmentId)
				.eq('account_id', ownerAccountId);

			if (error) throw error;
			res.json({ success: true });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка удаления поставки' });
		}
	}

	async function getFboShipmentWarehouses(req, res) {
		const shipmentId = parseOptionalInt(req.params.shipmentId);
		if (!shipmentId) return res.json({ success: false, error: 'Некорректный shipment_id' });

		try {
			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, shipmentId);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });

			const { data, error } = await supabase
				.from('fbo_shipment_warehouses')
				.select('id, shipment_id, warehouse_id, created_at, fbo_warehouses(name, wb_code)')
				.eq('shipment_id', shipmentId)
				.order('created_at', { ascending: true });

			if (error) throw error;

			const items = (data || []).map(item => ({
				id: item.id,
				shipment_id: item.shipment_id,
				warehouse_id: item.warehouse_id,
				warehouse_name: item.fbo_warehouses && item.fbo_warehouses.name ? item.fbo_warehouses.name : null,
				wb_code: item.fbo_warehouses && item.fbo_warehouses.wb_code ? item.fbo_warehouses.wb_code : null,
				created_at: item.created_at
			}));

			res.json({ success: true, items });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки складов поставки' });
		}
	}

	async function postFboShipmentWarehouses(req, res) {
		const shipmentId = parseOptionalInt(req.params.shipmentId);
		const warehouseId = parseOptionalInt(req.body && req.body.warehouse_id);
		if (!shipmentId || !warehouseId) {
			return res.json({ success: false, error: 'shipment_id и warehouse_id обязательны' });
		}

		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, shipmentId);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Изменения доступны только для draft поставки' });

			const { data: wh, error: whError } = await supabase
				.from('fbo_warehouses')
				.select('id')
				.eq('id', warehouseId)
				.eq('account_id', ownerAccountId)
				.single();
			if (whError || !wh) {
				return res.json({ success: false, error: 'Склад не найден' });
			}

			const { data, error } = await supabase
				.from('fbo_shipment_warehouses')
				.upsert({
					shipment_id: shipmentId,
					warehouse_id: warehouseId,
					created_by_user_id: actorUserId
				}, {
					onConflict: 'shipment_id,warehouse_id'
				})
				.select('id, shipment_id, warehouse_id, created_at')
				.single();

			if (error) throw error;
			res.json({ success: true, item: data });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка добавления склада в поставку' });
		}
	}

	async function deleteFboShipmentWarehouse(req, res) {
		const shipmentWarehouseId = parseOptionalInt(req.params.id);
		if (!shipmentWarehouseId) return res.json({ success: false, error: 'Некорректный id' });

		try {
			const { data: link, error: linkError } = await supabase
				.from('fbo_shipment_warehouses')
				.select('id, shipment_id')
				.eq('id', shipmentWarehouseId)
				.single();

			if (linkError || !link) return res.json({ success: false, error: 'Связка не найдена' });

			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, link.shipment_id);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Изменения доступны только для draft поставки' });

			const { error } = await supabase
				.from('fbo_shipment_warehouses')
				.delete()
				.eq('id', shipmentWarehouseId);

			if (error) throw error;
			res.json({ success: true });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка удаления склада из поставки' });
		}
	}

	async function getFboBoxes(req, res) {
		const shipmentWarehouseId = parseOptionalInt(req.query.shipmentWarehouseId);
		if (!shipmentWarehouseId) {
			return res.json({ success: true, items: [] });
		}

		try {
			const { data: link, error: linkError } = await supabase
				.from('fbo_shipment_warehouses')
				.select('id, shipment_id')
				.eq('id', shipmentWarehouseId)
				.single();

			if (linkError || !link) return res.json({ success: false, error: 'Связка склад-поставка не найдена' });

			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, link.shipment_id);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });

			const { data, error } = await supabase
				.from('fbo_boxes')
				.select('id, shipment_id, shipment_warehouse_id, box_no, created_at')
				.eq('shipment_warehouse_id', shipmentWarehouseId)
				.order('box_no', { ascending: true });

			if (error) throw error;
			res.json({ success: true, items: data || [] });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки коробов' });
		}
	}

	async function postFboBoxes(req, res) {
		const shipmentWarehouseId = parseOptionalInt(req.body && req.body.shipment_warehouse_id);
		if (!shipmentWarehouseId) {
			return res.json({ success: false, error: 'shipment_warehouse_id обязателен' });
		}

		try {
			const { data: link, error: linkError } = await supabase
				.from('fbo_shipment_warehouses')
				.select('id, shipment_id')
				.eq('id', shipmentWarehouseId)
				.single();

			if (linkError || !link) return res.json({ success: false, error: 'Связка склад-поставка не найдена' });

			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, link.shipment_id);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Добавлять короба можно только в draft поставку' });

			const { data, error } = await supabase.rpc('fbo_create_box_v2', {
				p_shipment_warehouse_id: shipmentWarehouseId,
				p_created_by_user_id: actorUserId
			});

			if (error) throw error;

			const item = pickRpcRow(data);
			if (!item) {
				return res.json({ success: false, error: 'Не удалось создать короб' });
			}

			res.json({ success: true, item });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка создания короба' });
		}
	}

	async function deleteFboBox(req, res) {
		const boxId = parseOptionalInt(req.params.id);
		if (!boxId) return res.json({ success: false, error: 'Некорректный box_id' });

		try {
			const { data: box, error: boxError } = await supabase
				.from('fbo_boxes')
				.select('id, shipment_id')
				.eq('id', boxId)
				.single();

			if (boxError || !box) return res.json({ success: false, error: 'Короб не найден' });

			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, box.shipment_id);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Удаление доступно только в draft поставке' });

			const { error } = await supabase
				.from('fbo_boxes')
				.delete()
				.eq('id', boxId);

			if (error) throw error;
			res.json({ success: true });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка удаления короба' });
		}
	}

	async function postFboScans(req, res) {
		const shipmentId = parseOptionalInt(req.body && req.body.shipment_id);
		const boxId = parseOptionalInt(req.body && req.body.box_id);
		const barcode = String((req.body && req.body.barcode) || '').trim();

		if (!shipmentId || !boxId || !barcode) {
			return res.json({ success: false, error: 'shipment_id, box_id, barcode обязательны' });
		}

		try {
			const { ownerAccountId, actorUserId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, shipmentId);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Сканирование доступно только для draft поставки' });

			const { data: box, error: boxError } = await supabase
				.from('fbo_boxes')
				.select('id, shipment_id')
				.eq('id', boxId)
				.eq('shipment_id', shipmentId)
				.single();

			if (boxError || !box) return res.json({ success: false, error: 'Короб не найден в указанной поставке' });

			const { data, error } = await supabase
				.from('fbo_scan_events')
				.insert({
					shipment_id: shipmentId,
					box_id: boxId,
					barcode,
					created_by_user_id: actorUserId
				})
				.select('*')
				.single();

			if (error) throw error;
			res.json({ success: true, item: data });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка сохранения скана' });
		}
	}

	async function deleteFboScan(req, res) {
		const scanId = parseOptionalInt(req.params.id);
		if (!scanId) return res.json({ success: false, error: 'Некорректный scan_id' });

		try {
			const { data: scan, error: scanError } = await supabase
				.from('fbo_scan_events')
				.select('id, shipment_id')
				.eq('id', scanId)
				.single();

			if (scanError || !scan) return res.json({ success: false, error: 'Скан не найден' });

			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, scan.shipment_id);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Удаление доступно только в draft поставке' });

			const { error } = await supabase
				.from('fbo_scan_events')
				.delete()
				.eq('id', scanId);

			if (error) throw error;
			res.json({ success: true });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка удаления скана' });
		}
	}

	async function undoLastFboScan(req, res) {
		const shipmentId = parseOptionalInt(req.body && req.body.shipment_id);
		if (!shipmentId) {
			return res.json({ success: false, error: 'shipment_id обязателен' });
		}

		try {
			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, shipmentId);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });
			if (shipment.status !== 'draft') return res.json({ success: false, error: 'Отмена доступна только в draft поставке' });

			const { data, error } = await supabase.rpc('fbo_undo_last_scan', {
				p_shipment_id: shipmentId,
				p_user_id: null
			});

			if (error) throw error;

			const item = pickRpcRow(data);
			if (!item) {
				return res.json({ success: false, error: 'Нет сканов для отмены' });
			}

			res.json({ success: true, item });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка отмены скана' });
		}
	}

	async function getRecentFboScans(req, res) {
		const shipmentId = parseOptionalInt(req.query.shipmentId);
		if (!shipmentId) {
			return res.json({ success: true, items: [] });
		}

		try {
			const { ownerAccountId } = await getFboScope(req);
			const shipment = await getOwnedFboShipment(ownerAccountId, shipmentId);
			if (!shipment) return res.json({ success: false, error: 'Поставка не найдена' });

			const { data, error } = await supabase
				.from('fbo_scan_events')
				.select('id, barcode, created_at, created_by_user_id, box_id, fbo_boxes(box_no, shipment_warehouse_id)')
				.eq('shipment_id', shipmentId)
				.order('created_at', { ascending: false })
				.limit(50);

			if (error) throw error;

			const items = (data || []).map(item => ({
				id: item.id,
				barcode: item.barcode,
				created_at: item.created_at,
				created_by_user_id: item.created_by_user_id,
				box_id: item.box_id,
				box_no: item.fbo_boxes && item.fbo_boxes.box_no ? item.fbo_boxes.box_no : null,
				shipment_warehouse_id: item.fbo_boxes && item.fbo_boxes.shipment_warehouse_id ? item.fbo_boxes.shipment_warehouse_id : null
			}));

			res.json({ success: true, items });
		} catch (error) {
			res.json({ success: false, error: error.message || 'Ошибка загрузки сканов' });
		}
	}

	return {
		getShipments2Page,
		getFboBusinesses,
		getFboBatches,
		postFboBatches,
		getFboSources,
		postFboSources,
		getFboWarehouses,
		postFboWarehouses,
		deleteFboSource,
		deleteFboWarehouse,
		getFboShipments,
		postFboShipments,
		putFboShipments,
		deleteFboShipments,
		getFboShipmentWarehouses,
		postFboShipmentWarehouses,
		deleteFboShipmentWarehouse,
		getFboBoxes,
		postFboBoxes,
		deleteFboBox,
		postFboScans,
		deleteFboScan,
		undoLastFboScan,
		getRecentFboScans
	};
};
