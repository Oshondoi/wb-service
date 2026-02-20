
var fboSources=[], fboWarehouses=[], fboShipments=[], fboShipmentWarehouses=[], fboBoxes=[], fboRecentScans=[];
var activeShipmentId=null, activeShipmentWarehouseId=null, activeBoxId=null;

function escapeHtml(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function formatDate(v){if(!v) return '—'; var d=new Date(v); return isNaN(d.getTime())?String(v):d.toLocaleString('ru-RU');}
function authHeaders(json){
  var token = localStorage.getItem('authToken');
  if (!token) {
    var m = document.cookie.match(/(?:^|;s*)authToken=([^;]+)/);
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
async function loadShipments(){const d=await apiGet('/api/fbo/shipments');fboShipments=(d&&d.success&&Array.isArray(d.items))?d.items:[];var b=document.getElementById('shipmentsBody');if(!fboShipments.length){b.innerHTML='<tr><td colspan="5" class="cash-muted" style="text-align:center;padding:10px">Поставок нет</td></tr>';return;}b.innerHTML=fboShipments.map(i=>'<tr><td>'+escapeHtml(i.public_id||('#'+i.id))+'</td><td>'+escapeHtml(i.source_name||'—')+'</td><td><span class="chip">'+escapeHtml(i.status||'draft')+'</span></td><td>'+escapeHtml(i.warehouses_count||0)+'</td><td class="toolbar"><button class="api-btn" onclick="setActiveShipment('+i.id+')">Выбрать</button><button class="api-btn danger" onclick="deleteShipment('+i.id+')">Удалить</button></td></tr>').join('');if(!activeShipmentId&&fboShipments.length)setActiveShipment(fboShipments[0].id);}
async function loadShipmentWarehouses(){var b=document.getElementById('shipmentWarehousesBody');if(!activeShipmentId){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Сначала выбери поставку</td></tr>';fboShipmentWarehouses=[];return;}const d=await apiGet('/api/fbo/shipments/'+activeShipmentId+'/warehouses');fboShipmentWarehouses=(d&&d.success&&Array.isArray(d.items))?d.items:[];if(!fboShipmentWarehouses.length){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Складов в поставке нет</td></tr>';return;}b.innerHTML=fboShipmentWarehouses.map(i=>'<tr><td>'+escapeHtml(i.warehouse_name||'—')+'</td><td>'+escapeHtml(i.wb_code||'—')+'</td><td><button class="api-btn" onclick="setActiveShipmentWarehouse('+i.id+',\''+escapeHtml(i.warehouse_name||('ID '+i.warehouse_id))+'\')">Выбрать</button></td><td><button class="api-btn danger" onclick="removeShipmentWarehouse('+i.id+')">Удалить</button></td></tr>').join('');if(!activeShipmentWarehouseId&&fboShipmentWarehouses.length){var first=fboShipmentWarehouses[0];setActiveShipmentWarehouse(first.id, first.warehouse_name||('ID '+first.warehouse_id));}}
async function loadBoxes(){var b=document.getElementById('boxesBody');if(!activeShipmentWarehouseId){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Сначала выбери склад в поставке</td></tr>';fboBoxes=[];renderScans();return;}const d=await apiGet('/api/fbo/boxes?shipmentWarehouseId='+activeShipmentWarehouseId);fboBoxes=(d&&d.success&&Array.isArray(d.items))?d.items:[];if(!fboBoxes.length){b.innerHTML='<tr><td colspan="4" class="cash-muted" style="text-align:center;padding:10px">Коробов нет</td></tr>';renderScans();return;}b.innerHTML=fboBoxes.map(i=>'<tr><td>Короб №'+escapeHtml(i.box_no)+'</td><td>'+escapeHtml(formatDate(i.created_at))+'</td><td><button class="api-btn" onclick="setActiveBox('+i.id+',\'Короб №'+escapeHtml(i.box_no)+'\')">Выбрать</button></td><td><button class="api-btn danger" onclick="deleteBox('+i.id+')">Удалить</button></td></tr>').join('');if(!activeBoxId&&fboBoxes.length){var first=fboBoxes[0];setActiveBox(first.id,'Короб №'+first.box_no);}else{loadRecentScans();}}
async function loadRecentScans(){if(!activeShipmentId){fboRecentScans=[];renderScans();return;}const d=await apiGet('/api/fbo/scans/recent?shipmentId='+activeShipmentId);fboRecentScans=(d&&d.success&&Array.isArray(d.items))?d.items:[];renderScans();}
function renderScans(){var b=document.getElementById('scanEventsBody');if(!activeShipmentId){b.innerHTML='<tr><td colspan="5" class="cash-muted" style="text-align:center;padding:10px">Выбери поставку</td></tr>';return;}if(!fboRecentScans.length){b.innerHTML='<tr><td colspan="5" class="cash-muted" style="text-align:center;padding:10px">Сканов нет</td></tr>';return;}b.innerHTML=fboRecentScans.map(i=>'<tr><td>'+escapeHtml(i.barcode)+'</td><td>'+escapeHtml(i.box_no?('Короб №'+i.box_no):('ID '+i.box_id))+'</td><td>'+escapeHtml(formatDate(i.created_at))+'</td><td>'+escapeHtml(i.created_by_user_id)+'</td><td><button class="api-btn danger" onclick="deleteScan('+i.id+')">Удалить</button></td></tr>').join('');}

async function createSource(){var n=prompt('Название источника');if(!n||!n.trim())return;const d=await apiPost('/api/fbo/sources',{name:n.trim()});if(!d||!d.success)return alert((d&&d.error)||'Ошибка');await loadSources();}
async function deleteSource(){var id=parseInt(document.getElementById('sourceSelect').value||'0',10);if(!id)return alert('Выбери источник');if(!confirm('Удалить источник?'))return;const d=await apiDelete('/api/fbo/sources/'+id);if(!d.success)return alert(d.error||'Ошибка');await loadSources();}
async function createWarehouse(){var n=prompt('Название склада WB');if(!n||!n.trim())return;const d=await apiPost('/api/fbo/warehouses',{name:n.trim()});if(!d||!d.success)return alert((d&&d.error)||'Ошибка');await loadWarehouses();}
async function deleteWarehouse(){var id=parseInt(document.getElementById('warehouseSelect').value||'0',10);if(!id)return alert('Выбери склад');if(!confirm('Удалить склад?'))return;const d=await apiDelete('/api/fbo/warehouses/'+id);if(!d.success)return alert(d.error||'Ошибка');await loadWarehouses();}
async function createShipment(){var sourceId=parseInt(document.getElementById('sourceSelect').value||'0',10);if(!sourceId)return alert('Выбери источник');const d=await apiPost('/api/fbo/shipments',{source_id:sourceId});if(!d.success)return alert(d.error||'Ошибка');await loadShipments();if(d.item&&d.item.id)setActiveShipment(d.item.id);}
async function deleteShipment(id){if(!confirm('Удалить поставку?'))return;const d=await apiDelete('/api/fbo/shipments/'+id);if(!d.success)return alert(d.error||'Ошибка');if(activeShipmentId===id)setActiveShipment(null);await loadShipments();}
async function attachWarehouseToShipment(){if(!activeShipmentId)return alert('Сначала выбери поставку');var warehouseId=parseInt(document.getElementById('warehouseSelect').value||'0',10);if(!warehouseId)return alert('Выбери склад');const d=await apiPost('/api/fbo/shipments/'+activeShipmentId+'/warehouses',{warehouse_id:warehouseId});if(!d.success)return alert(d.error||'Ошибка');await loadShipmentWarehouses();await loadShipments();}
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
    el.onclick = item[1];
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

async function bootstrapAll(){await loadSources();await loadWarehouses();await loadShipments();if(activeShipmentId){await loadShipmentWarehouses();if(activeShipmentWarehouseId){await loadBoxes();}else{renderScans();}}}
bindShipmentsActions();
bootstrapAll();

