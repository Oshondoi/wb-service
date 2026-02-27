const {
	renderSidebar,
	renderProfileModal,
	renderProfileScript
} = require('./page.shared');

module.exports = function createShipmentsService() {
	function getShipmentsPage(req, res) {
		res.send(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>WB Helper - Отгрузки</title>
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
.container{width:100%;margin:0;background:rgba(15,23,42,0.78);backdrop-filter:blur(14px);border:1px solid rgba(148,163,184,0.18);border-radius:20px;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,0.5)}
.section{background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.18);border-radius:16px;padding:14px 16px;box-shadow:0 16px 40px rgba(0,0,0,0.35);margin-bottom:14px;position:relative;overflow:visible}
.section h2{margin:0 0 12px;font-size:16px}
.step{display:flex;align-items:center;gap:10px;margin:0 0 10px}
.step-index{width:24px;height:24px;border-radius:999px;background:rgba(56,189,248,0.2);display:inline-flex;align-items:center;justify-content:center;font-weight:800}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;position:relative;z-index:40}
.api-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:transparent;color:#e2e8f0;border:1px solid rgba(148,163,184,0.35);border-radius:10px;font-weight:700;font-size:12px;cursor:pointer;position:relative;z-index:45;pointer-events:auto}
.api-btn.primary{background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.7);color:#86efac}
.api-btn.danger{background:rgba(239,68,68,0.14);border-color:rgba(239,68,68,0.5);color:#fecaca}
.cash-input{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.3);border-radius:10px;font-size:12px;font-weight:600;background:rgba(15,23,42,0.85);color:#e2e8f0;position:relative;z-index:30}
.cash-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px}
.grid{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;position:relative;z-index:20}
.table-wrap{max-height:32vh;overflow:auto;border:1px solid rgba(148,163,184,0.2);border-radius:10px;position:relative;z-index:1}
.cash-table{width:100%;border-collapse:collapse}
.cash-table th{background:#0b1220;color:#e2e8f0;font-size:12px;text-align:left;padding:8px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:2}
.cash-table td{padding:8px;border-bottom:1px solid rgba(148,163,184,0.15);font-size:12px;color:#e2e8f0}
.cash-muted{color:#94a3b8;font-size:12px}
.chip{display:inline-block;padding:4px 8px;border-radius:999px;font-size:11px;background:rgba(56,189,248,0.15);color:#7dd3fc;font-weight:700}
@media (max-width: 900px){.layout{flex-direction:column;padding-left:0}.sidebar{width:100%;height:auto;position:relative}.grid{grid-template-columns:1fr}}
</style></head><body>
<div class="layout">
	${renderSidebar('/shipments')}
	<main class="main">
		<div class="container">
			<div class="section">
				<div class="toolbar" style="justify-content:space-between"><h1 style="margin:0;font-size:24px">Отгрузки (пошагово)</h1><button id="btnRefreshShipments" type="button" class="api-btn" onclick="bootstrapAll()">Обновить</button></div>
			</div>

			<div class="section">
				<div class="step"><span class="step-index">1</span><h2>Создать / выбрать поставку</h2></div>
				<div class="grid" style="grid-template-columns:1fr 1fr 1fr auto;">
					<div><div class="cash-label">Источник</div><select id="sourceSelect" class="cash-input"></select></div>
					<div><div class="cash-label">Магазин для партии</div><select id="batchBusinessSelect" class="cash-input"></select></div>
					<div><div class="cash-label">Партия</div><select id="batchSelect" class="cash-input"></select></div>
					<div class="toolbar"><button id="btnCreateSource" type="button" class="api-btn" onclick="createSource()">+ Источник</button><button id="btnDeleteSource" type="button" class="api-btn danger" onclick="deleteSource()">Удалить источник</button><button id="btnCreateBatch" type="button" class="api-btn" onclick="createBatch()">+ Партия (из магазина)</button><button id="btnCreateShipment" type="button" class="api-btn primary" onclick="createShipment()">Создать поставку</button></div>
				</div>
				<div class="table-wrap" style="margin-top:10px"><table class="cash-table"><thead><tr><th>Поставка</th><th>Партия</th><th>Источник</th><th>Статус</th><th>Складов</th><th></th></tr></thead><tbody id="shipmentsBody"></tbody></table></div>
				<div class="cash-muted" style="margin-top:8px">Активная поставка: <span id="activeShipmentLabel">—</span></div>
			</div>

			<div class="section">
				<div class="step"><span class="step-index">2</span><h2>Склады: список и добавление в поставку</h2></div>
				<div class="cash-muted" style="margin:0 0 10px">1) «+ Пополнить список складов» добавляет склад только в общий список. 2) «Добавить выбранный в поставку» добавляет в активную поставку только выбранный склад из списка.</div>
				<div class="grid">
					<div><div class="cash-label">Склад WB</div><select id="warehouseSelect" class="cash-input"></select></div>
					<div class="toolbar"><button id="btnCreateWarehouse" type="button" class="api-btn" onclick="createWarehouse()">+ Пополнить список складов</button><button id="btnDeleteWarehouse" type="button" class="api-btn danger" onclick="deleteWarehouse()">Удалить из списка</button></div>
					<button id="btnAttachWarehouse" type="button" class="api-btn primary" onclick="attachWarehouseToShipment()">Добавить выбранный в поставку</button>
				</div>
				<div class="table-wrap" style="margin-top:10px"><table class="cash-table"><thead><tr><th>Склад</th><th>WB code</th><th></th><th></th></tr></thead><tbody id="shipmentWarehousesBody"></tbody></table></div>
				<div class="cash-muted" style="margin-top:8px">Активный склад в поставке: <span id="activeShipmentWarehouseLabel">—</span></div>
			</div>

			<div class="section">
				<div class="step"><span class="step-index">3</span><h2>Короба внутри выбранного склада</h2></div>
				<div class="toolbar"><button id="btnCreateBox" type="button" class="api-btn primary" onclick="createBox()">+ Новый короб</button></div>
				<div class="table-wrap" style="margin-top:10px"><table class="cash-table"><thead><tr><th>Короб</th><th>Создан</th><th></th><th></th></tr></thead><tbody id="boxesBody"></tbody></table></div>
				<div class="cash-muted" style="margin-top:8px">Активный короб: <span id="activeBoxLabel">—</span></div>
			</div>

			<div class="section">
				<div class="step"><span class="step-index">4</span><h2>Сканирование в выбранный короб</h2></div>
				<div class="grid"><div><div class="cash-label">Штрихкод</div><input id="scanBarcodeInput" class="cash-input" type="text" placeholder="Сканируй и Enter" /></div><div></div><button id="btnUndoLastScan" type="button" class="api-btn" onclick="undoLastScan()">Отменить последний скан</button></div>
				<div class="table-wrap" style="margin-top:10px"><table class="cash-table"><thead><tr><th>ШК</th><th>Короб</th><th>Время</th><th>Кто</th><th></th></tr></thead><tbody id="scanEventsBody"></tbody></table></div>
			</div>
		</div>
	</main>
</div>
${renderProfileModal()}
${renderProfileScript()}
<script>
var fboSources=[], fboWarehouses=[], fboShipments=[], fboShipmentWarehouses=[], fboBoxes=[], fboRecentScans=[], fboBatches=[], fboBatchBusinesses=[];
var activeShipmentId=null, activeShipmentWarehouseId=null, activeBoxId=null;

function escapeHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function formatShipmentStatus(status){var value=String(status||'').trim().toLowerCase();if(value==='draft')return 'Формируется';if(value==='done')return 'Отгружено';if(value==='canceled')return 'Аннулировано';return status||'—';}
function formatDate(v){if(!v) return '—'; var d=new Date(v); return isNaN(d.getTime())?String(v):d.toLocaleString('ru-RU');}
function authHeaders(json){
	var token = localStorage.getItem('authToken');
	if (!token) {
		var m = document.cookie.match(/(?:^|;\s*)authToken=([^;]+)/);
		if (m && m[1]) {
			token = decodeURIComponent(m[1]);
			localStorage.setItem('authToken', token);
		}
	}
	var h = token ? { 'Authorization': 'Bearer ' + token } : {};
	if (json) h['Content-Type'] = 'application/json';
	return h;
}
async function apiRequest(p, options){
	try {
		var opts = options || {};
		var res = await fetch(p, Object.assign({ credentials: 'same-origin' }, opts));
		var ct = (res.headers.get('content-type') || '').toLowerCase();
		var payload;
		if (ct.indexOf('application/json') !== -1) {
			payload = await res.json();
		} else {
			await res.text();
			payload = { success: false, error: res.status === 401 ? 'Необходима авторизация' : ('HTTP ' + res.status) };
		}
		if (!res.ok) {
			if (!payload || typeof payload !== 'object') payload = { success: false };
			payload.success = false;
			if (!payload.error) payload.error = 'HTTP ' + res.status;
		}
		return payload;
	} catch (e) {
		return { success: false, error: (e && e.message) ? e.message : 'Сетевая ошибка' };
	}
}
async function apiGet(p){return apiRequest(p,{headers:authHeaders(false)});}
async function apiPost(p,b){return apiRequest(p,{method:'POST',headers:authHeaders(true),body:JSON.stringify(b||{})});}
async function apiDelete(p){return apiRequest(p,{method:'DELETE',headers:authHeaders(false)});}

function setActiveShipment(id){activeShipmentId=id||null;activeShipmentWarehouseId=null;activeBoxId=null;document.getElementById('activeShipmentLabel').textContent=id?('#'+id):'—';document.getElementById('activeShipmentWarehouseLabel').textContent='—';document.getElementById('activeBoxLabel').textContent='—';loadShipmentWarehouses();renderScans();}
function setActiveShipmentWarehouse(id,label){activeShipmentWarehouseId=id||null;activeBoxId=null;document.getElementById('activeShipmentWarehouseLabel').textContent=label||'—';document.getElementById('activeBoxLabel').textContent='—';loadBoxes();}
function setActiveBox(id,label){activeBoxId=id||null;document.getElementById('activeBoxLabel').textContent=label||'—';loadRecentScans();}

async function loadSources(){const d=await apiGet('/api/fbo/sources');fboSources=(d&&d.success&&Array.isArray(d.items))?d.items:[];var s=document.getElementById('sourceSelect');s.innerHTML=fboSources.length?fboSources.map(i=>'<option value="'+i.id+'">'+escapeHtml(i.name)+'</option>').join(''):'<option value="">Нет источников</option>';}
async function loadWarehouses(){const d=await apiGet('/api/fbo/warehouses');fboWarehouses=(d&&d.success&&Array.isArray(d.items))?d.items:[];var s=document.getElementById('warehouseSelect');s.innerHTML=fboWarehouses.length?fboWarehouses.map(i=>'<option value="'+i.id+'">'+escapeHtml(i.name)+'</option>').join(''):'<option value="">Нет складов</option>';}
async function loadBatchBusinesses(){const d=await apiGet('/api/fbo/businesses');fboBatchBusinesses=(d&&d.success&&Array.isArray(d.items))?d.items:[];var s=document.getElementById('batchBusinessSelect');if(!s)return;if(!fboBatchBusinesses.length){s.innerHTML='<option value="">Нет активных магазинов</option>';return;}s.innerHTML=fboBatchBusinesses.map(i=>'<option value="'+i.id+'">'+escapeHtml(i.company_name||('ID '+i.id))+'</option>').join('');}
async function loadBatches(){const d=await apiGet('/api/fbo/batches');fboBatches=(d&&d.success&&Array.isArray(d.items))?d.items:[];var s=document.getElementById('batchSelect');if(!s)return;if(!fboBatches.length){s.innerHTML='<option value="">Нет партий</option>';return;}s.innerHTML=fboBatches.map(i=>{var batchIdLabel=i.public_id?String(i.public_id):((i.name?String(i.name):'Партия')+' - '+(i.seq_no||i.id));return '<option value="'+i.id+'">'+escapeHtml(batchIdLabel)+'</option>';}).join('');}
async function loadShipments(){const d=await apiGet('/api/fbo/shipments');fboShipments=(d&&d.success&&Array.isArray(d.items))?d.items:[];var b=document.getElementById('shipmentsBody');if(!fboShipments.length){b.innerHTML='<tr><td colspan="6" class="cash-muted" style="text-align:center;padding:10px">Поставок нет</td></tr>';return;}b.innerHTML=fboShipments.map(i=>{var batchLabel=i.batch_public_id?String(i.batch_public_id):(((i.batch_name?String(i.batch_name):'Партия')+' - '+(i.batch_seq_no||i.batch_id||'—')));return '<tr><td>'+escapeHtml(i.public_id||('#'+i.id))+'</td><td>'+escapeHtml(batchLabel)+'</td><td>'+escapeHtml(i.source_name||'—')+'</td><td><span class="chip">'+escapeHtml(formatShipmentStatus(i.status||'draft'))+'</span></td><td>'+escapeHtml(i.warehouses_count||0)+'</td><td class="toolbar"><button class="api-btn" onclick="setActiveShipment('+i.id+')">Выбрать</button><button class="api-btn danger" onclick="deleteShipment('+i.id+')">Удалить</button></td></tr>';}).join('');if(!activeShipmentId&&fboShipments.length)setActiveShipment(fboShipments[0].id);}
async function loadShipmentWarehouses(){var b=document.getElementById('shipmentWarehousesBody');if(!activeShipmentId){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Сначала выбери поставку</td></tr>';fboShipmentWarehouses=[];return;}const d=await apiGet('/api/fbo/shipments/'+activeShipmentId+'/warehouses');fboShipmentWarehouses=(d&&d.success&&Array.isArray(d.items))?d.items:[];if(!fboShipmentWarehouses.length){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Складов в поставке нет</td></tr>';return;}b.innerHTML=fboShipmentWarehouses.map(i=>'<tr><td>'+escapeHtml(i.warehouse_name||'—')+'</td><td>'+escapeHtml(i.wb_code||'—')+'</td><td><button class="api-btn" onclick="setActiveShipmentWarehouse('+i.id+',\\''+escapeHtml(i.warehouse_name||('ID '+i.warehouse_id))+'\\')">Выбрать</button></td><td><button class="api-btn danger" onclick="removeShipmentWarehouse('+i.id+')">Удалить</button></td></tr>').join('');if(!activeShipmentWarehouseId&&fboShipmentWarehouses.length){var first=fboShipmentWarehouses[0];setActiveShipmentWarehouse(first.id, first.warehouse_name||('ID '+first.warehouse_id));}}
async function loadBoxes(){var b=document.getElementById('boxesBody');if(!activeShipmentWarehouseId){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Сначала выбери склад в поставке</td></tr>';fboBoxes=[];renderScans();return;}const d=await apiGet('/api/fbo/boxes?shipmentWarehouseId='+activeShipmentWarehouseId);fboBoxes=(d&&d.success&&Array.isArray(d.items))?d.items:[];if(!fboBoxes.length){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Коробов нет</td></tr>';renderScans();return;}b.innerHTML=fboBoxes.map(i=>'<tr><td>Короб №'+escapeHtml(i.box_no)+'</td><td>'+escapeHtml(formatDate(i.created_at))+'</td><td><button class="api-btn" onclick="setActiveBox('+i.id+',\\'Короб №'+escapeHtml(i.box_no)+'\\')">Выбрать</button></td><td><button class="api-btn danger" onclick="deleteBox('+i.id+')">Удалить</button></td></tr>').join('');if(!activeBoxId&&fboBoxes.length){var first=fboBoxes[0];setActiveBox(first.id,'Короб №'+first.box_no);}else{loadRecentScans();}}
async function loadRecentScans(){if(!activeShipmentId){fboRecentScans=[];renderScans();return;}const d=await apiGet('/api/fbo/scans/recent?shipmentId='+activeShipmentId);fboRecentScans=(d&&d.success&&Array.isArray(d.items))?d.items:[];renderScans();}
function renderScans(){var b=document.getElementById('scanEventsBody');if(!activeShipmentId){b.innerHTML='<tr><td colspan="5" class="cash-muted" style="text-align:center;padding:10px">Выбери поставку</td></tr>';return;}if(!fboRecentScans.length){b.innerHTML='<tr><td colspan="5" class="cash-muted" style="text-align:center;padding:10px">Сканов нет</td></tr>';return;}b.innerHTML=fboRecentScans.map(i=>'<tr><td>'+escapeHtml(i.barcode)+'</td><td>'+escapeHtml(i.box_no?('Короб №'+i.box_no):('ID '+i.box_id))+'</td><td>'+escapeHtml(formatDate(i.created_at))+'</td><td>'+escapeHtml(i.created_by_user_id)+'</td><td><button class="api-btn danger" onclick="deleteScan('+i.id+')">Удалить</button></td></tr>').join('');}

async function createSource(){var n=prompt('Название источника');if(!n||!n.trim())return;const d=await apiPost('/api/fbo/sources',{name:n.trim()});if(!d||!d.success)return alert((d&&d.error)||'Ошибка');await loadSources();}
async function deleteSource(){var id=parseInt(document.getElementById('sourceSelect').value||'0',10);if(!id)return alert('Выбери источник');if(!confirm('Удалить источник?'))return;const d=await apiDelete('/api/fbo/sources/'+id);if(!d.success)return alert(d.error||'Ошибка');await loadSources();}
async function createBatch(){var businessId=parseInt(document.getElementById('batchBusinessSelect').value||'0',10);if(!businessId)return alert('Выбери магазин для партии');const d=await apiPost('/api/fbo/batches',{business_id:businessId});if(!d||!d.success)return alert((d&&d.error)||'Ошибка');await loadBatches();if(d.item&&d.item.id){var s=document.getElementById('batchSelect');if(s)s.value=String(d.item.id);}}
async function createWarehouse(){var n=prompt('Название склада WB (добавится только в общий список)');if(!n||!n.trim())return;const d=await apiPost('/api/fbo/warehouses',{name:n.trim()});if(!d||!d.success)return alert((d&&d.error)||'Ошибка');await loadWarehouses();}
async function deleteWarehouse(){var id=parseInt(document.getElementById('warehouseSelect').value||'0',10);if(!id)return alert('Выбери склад');if(!confirm('Удалить склад?'))return;const d=await apiDelete('/api/fbo/warehouses/'+id);if(!d.success)return alert(d.error||'Ошибка');await loadWarehouses();}
async function createShipment(){var sourceId=parseInt(document.getElementById('sourceSelect').value||'0',10);var batchId=parseInt(document.getElementById('batchSelect').value||'0',10);if(!sourceId)return alert('Выбери источник');if(!batchId)return alert('Выбери партию');const d=await apiPost('/api/fbo/shipments',{source_id:sourceId,batch_id:batchId});if(!d.success)return alert(d.error||'Ошибка');await loadShipments();if(d.item&&d.item.id)setActiveShipment(d.item.id);}
async function deleteShipment(id){if(!confirm('Удалить поставку?'))return;const d=await apiDelete('/api/fbo/shipments/'+id);if(!d.success)return alert(d.error||'Ошибка');if(activeShipmentId===id)setActiveShipment(null);await loadShipments();}
async function attachWarehouseToShipment(){if(!activeShipmentId)return alert('Сначала выбери поставку');var warehouseId=parseInt(document.getElementById('warehouseSelect').value||'0',10);if(!warehouseId)return alert('Выбери склад из списка');if(!Array.isArray(fboWarehouses)||!fboWarehouses.some(function(w){return Number(w.id)===warehouseId;}))return alert('Можно добавить только склад из списка');const d=await apiPost('/api/fbo/shipments/'+activeShipmentId+'/warehouses',{warehouse_id:warehouseId});if(!d.success)return alert(d.error||'Ошибка');await loadShipmentWarehouses();await loadShipments();}
async function removeShipmentWarehouse(id){if(!confirm('Удалить склад из поставки?'))return;const d=await apiDelete('/api/fbo/shipment-warehouses/'+id);if(!d.success)return alert(d.error||'Ошибка');if(activeShipmentWarehouseId===id){activeShipmentWarehouseId=null;activeBoxId=null;}await loadShipmentWarehouses();await loadShipments();}
async function createBox(){if(!activeShipmentWarehouseId)return alert('Сначала выбери склад в поставке');const d=await apiPost('/api/fbo/boxes',{shipment_warehouse_id:activeShipmentWarehouseId});if(!d.success)return alert(d.error||'Ошибка');await loadBoxes();}
async function deleteBox(id){if(!confirm('Удалить короб?'))return;const d=await apiDelete('/api/fbo/boxes/'+id);if(!d.success)return alert(d.error||'Ошибка');if(activeBoxId===id)activeBoxId=null;await loadBoxes();}
async function deleteScan(id){if(!confirm('Удалить скан?'))return;const d=await apiDelete('/api/fbo/scans/'+id);if(!d.success)return alert(d.error||'Ошибка');await loadRecentScans();}
async function undoLastScan(){if(!activeShipmentId)return alert('Выбери поставку');const d=await apiPost('/api/fbo/scans/undo-last',{shipment_id:activeShipmentId});if(!d.success)return alert(d.error||'Ошибка');await loadRecentScans();}

function bindShipmentsActions(){
	var map = [
		['btnRefreshShipments', bootstrapAll],
		['btnCreateSource', createSource],
		['btnDeleteSource', deleteSource],
		['btnCreateBatch', createBatch],
		['btnCreateShipment', createShipment],
		['btnCreateWarehouse', createWarehouse],
		['btnDeleteWarehouse', deleteWarehouse],
		['btnAttachWarehouse', attachWarehouseToShipment],
		['btnCreateBox', createBox],
		['btnUndoLastScan', undoLastScan]
	];
	map.forEach(function(item){
		var el = document.getElementById(item[0]);
		if (!el || typeof item[1] !== 'function') return;
		if (el.dataset.boundClick === '1') return;
		el.dataset.boundClick = '1';
		el.removeAttribute('onclick');
		el.addEventListener('click', function(ev){
			ev.preventDefault();
			item[1]();
		});
	});
}

window.createSource = createSource;
window.deleteSource = deleteSource;
window.createWarehouse = createWarehouse;
window.deleteWarehouse = deleteWarehouse;
window.createShipment = createShipment;
window.deleteShipment = deleteShipment;
window.attachWarehouseToShipment = attachWarehouseToShipment;
window.removeShipmentWarehouse = removeShipmentWarehouse;
window.createBox = createBox;
window.deleteBox = deleteBox;
window.deleteScan = deleteScan;
window.undoLastScan = undoLastScan;
window.setActiveShipment = setActiveShipment;
window.setActiveShipmentWarehouse = setActiveShipmentWarehouse;
window.setActiveBox = setActiveBox;

document.getElementById('scanBarcodeInput').addEventListener('keydown', async function(e){if(e.key!=='Enter')return; e.preventDefault(); var barcode=String(e.target.value||'').trim(); if(!barcode)return; if(!activeShipmentId)return alert('Сначала выбери поставку'); if(!activeShipmentWarehouseId)return alert('Сначала выбери склад в поставке'); if(!activeBoxId)return alert('Сначала выбери короб'); var d=await apiPost('/api/fbo/scans',{shipment_id:activeShipmentId,box_id:activeBoxId,barcode:barcode}); if(!d.success)return alert(d.error||'Ошибка'); e.target.value=''; await loadRecentScans();});

async function bootstrapAll(){await loadSources();await loadBatchBusinesses();await loadBatches();await loadWarehouses();await loadShipments();if(activeShipmentId){await loadShipmentWarehouses();if(activeShipmentWarehouseId){await loadBoxes();}else{renderScans();}}}
bindShipmentsActions();
bootstrapAll();
</script>
</body></html>`);
	}

	return {
		getShipmentsPage
	};
};
