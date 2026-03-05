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
.toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.toolbar-left,.toolbar-right{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.selected-count{font-size:12px;color:#94a3b8;font-weight:700;letter-spacing:0.3px;text-transform:uppercase}
.api-btn.primary{background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.7);color:#86efac;box-shadow:0 8px 18px rgba(34,197,94,0.22)}
.api-btn.primary:hover{border-color:#22c55e;color:#eafff3;box-shadow:0 12px 26px rgba(34,197,94,0.35)}
.api-btn.secondary{background:rgba(56,189,248,0.15);border-color:rgba(56,189,248,0.65);color:#bae6fd;box-shadow:0 8px 18px rgba(56,189,248,0.22)}
.api-btn.secondary:hover{border-color:#38bdf8;color:#e2f2ff;box-shadow:0 12px 26px rgba(56,189,248,0.35)}
.api-btn.create-op{white-space:nowrap;min-width:160px;justify-content:center}
.list-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.filter-menu{position:relative;display:inline-flex}
.filter-dropdown{position:absolute;top:calc(100% + 6px);left:0;min-width:220px;max-height:260px;overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,0.25);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.4);padding:6px;z-index:30;display:none}
.filter-dropdown.open{display:block}
.filter-item{padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.35px;text-transform:uppercase;color:#e2e8f0;cursor:pointer;transition:background 0.2s,color 0.2s}
.filter-item:hover{background:rgba(56,189,248,0.15);color:#fff}
.filter-item.active{background:rgba(56,189,248,0.22);color:#fff}
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
.shipment2-click-cell{cursor:pointer;transition:background-color 0.16s ease,color 0.16s ease,box-shadow 0.16s ease}
.shipment2-row.active-hover .shipment2-click-cell{background:rgba(56,189,248,0.08);color:#f8fafc;box-shadow:inset 0 0 0 1px rgba(56,189,248,0.22)}
.shipment2-row.active-hover .shipment-name{text-shadow:0 0 10px rgba(125,211,252,0.18)}
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
#shipment2BatchWarehouseCount::-webkit-outer-spin-button,
#shipment2BatchWarehouseCount::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
#shipment2BatchWarehouseCount{-moz-appearance:textfield;appearance:textfield}
.edit-static{width:100%;padding:10px 12px;border:1px solid rgba(148,163,184,0.2);border-radius:10px;font-size:12px;font-weight:600;background:rgba(2,6,23,0.55);color:#e2e8f0;min-height:38px;display:flex;align-items:center}
.edit-list{display:flex;flex-wrap:wrap;gap:6px;min-height:38px}
.edit-pill{display:inline-flex;align-items:center;padding:6px 8px;border-radius:999px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.85);color:#cbd5f5;font-size:11px;font-weight:600}
.edit-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}
.batch-modal-note{font-size:12px;color:#94a3b8;line-height:1.45;margin:0 0 12px}
.batch-modal-error{font-size:12px;color:#fca5a5;line-height:1.4;min-height:18px;margin-top:8px}
.batch-modal-content{width:min(900px,calc(100vw - 48px));min-height:560px;display:flex;flex-direction:column}
.batch-modal-body{flex:1;display:flex;flex-direction:column}
.batch-modal-footer{margin-top:auto;border-top:1px solid rgba(148,163,184,0.2);padding-top:14px}
.batch-footer-actions{display:flex;align-items:center;justify-content:space-between;gap:12px}
.wizard-step{display:none}
.wizard-step.active{display:block}
.wizard-title{font-size:12px;font-weight:700;letter-spacing:0.35px;text-transform:uppercase;color:#7dd3fc;margin:0 0 10px}
.wizard-success{font-size:12px;color:#86efac;line-height:1.45;margin:0 0 12px}
.batch-warehouse-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px}
.batch-product-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}
.batch-product-row .edit-field{margin:0}
.batch-icon-btn{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:rgba(12,18,34,0.75);color:#e2e8f0;cursor:pointer;transition:all 0.2s}
.batch-icon-btn svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.batch-icon-btn:hover{border-color:#38bdf8;color:#fff;transform:translateY(-1px)}
.batch-boxes-grid{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:scroll;overflow-y:hidden;padding-bottom:4px;scrollbar-width:thin;scrollbar-gutter:stable}
.batch-box-btn{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:rgba(12,18,34,0.75);color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.25px;text-transform:uppercase;transition:all 0.2s}
.batch-box-btn:hover{border-color:#38bdf8;color:#fff}
.batch-box-btn.active{border-color:#22c55e;background:rgba(34,197,94,0.18);color:#bbf7d0}
.batch-box-icon{width:14px;height:14px;display:inline-block}
.batch-box-icon svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.batch-warehouses-grid{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:scroll;overflow-y:hidden;padding-bottom:4px;scrollbar-width:thin;scrollbar-gutter:stable}
.batch-warehouse-btn{display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;border:1px solid rgba(148,163,184,0.35);background:rgba(12,18,34,0.75);color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:700;letter-spacing:0.25px;text-transform:uppercase;transition:all 0.2s}
.batch-warehouse-btn:hover{border-color:#38bdf8;color:#fff}
.batch-warehouse-btn.active{border-color:#22c55e;background:rgba(34,197,94,0.18);color:#bbf7d0}
.batch-products-list{margin-top:10px;border:1px solid rgba(148,163,184,0.2);border-radius:10px;overflow-y:auto;overflow-x:hidden;max-height:150px}
.batch-products-row{display:flex;justify-content:space-between;gap:12px;padding:9px 11px;border-bottom:1px solid rgba(148,163,184,0.12);font-size:12px;color:#e2e8f0}
.batch-products-row:last-child{border-bottom:none}
.camera-modal-content{width:min(560px,calc(100vw - 48px))}
.camera-video-wrap{background:#020617;border:1px solid rgba(148,163,184,0.25);border-radius:10px;overflow:hidden}
.camera-video-wrap video{display:block;width:100%;height:auto;max-height:52vh;background:#020617}
.camera-hint{font-size:12px;color:#94a3b8;margin-top:8px}
.manage-modal-content{width:min(760px,calc(100vw - 48px));display:flex;flex-direction:column;max-height:calc(100vh - 48px)}
.manage-modal-body{display:flex;flex-direction:column;gap:14px}
.manage-form-row{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;align-items:end}
.manage-list-wrap{border:1px solid rgba(148,163,184,0.2);border-radius:10px;overflow:auto;max-height:52vh}
.manage-list-table{width:100%;border-collapse:collapse}
.manage-list-table th{background:#0b1220;color:#e2e8f0;font-size:11px;text-align:left;padding:9px 10px;border-bottom:1px solid rgba(148,163,184,0.25);position:sticky;top:0;z-index:1;text-transform:uppercase;letter-spacing:0.35px}
.manage-list-table td{padding:9px 10px;border-bottom:1px solid rgba(148,163,184,0.12);font-size:12px;color:#e2e8f0}
.manage-list-table tr:last-child td{border-bottom:none}
.manage-actions-cell{text-align:right;white-space:nowrap;width:120px}
.wizard-step.batch-step5.active{display:flex;flex-direction:column;min-height:300px;gap:6px}
@media (max-width: 900px){.layout{flex-direction:column;padding-left:0}.sidebar{width:100%;height:auto;position:relative}.shipment-name{font-size:16px}.edit-form-grid{grid-template-columns:1fr}}
</style></head><body>
<div class="layout">
	${renderSidebar('/shipments-2')}
	<main class="main">
		<div class="container">
			<div class="section">
				<div class="toolbar">
					<div class="toolbar-left">
						<button type="button" id="btnCreateShipment2Batch" class="api-btn" style="padding:6px 10px">Создать партию</button>
						<button type="button" id="btnCreateShipment2Warehouse" class="api-btn" style="padding:6px 10px">Создать склад</button>
						<button type="button" id="btnCreateShipment2Source" class="api-btn" style="padding:6px 10px">Создать источник</button>
					</div>
				</div>
			</div>

			<div class="section">
				<div class="list-toolbar">
					<div class="toolbar-left">
						<span id="shipments2SelectedCount" class="cash-muted selected-count" style="font-size:12px">Выбрано: 0</span>
						<div class="filter-menu">
							<button type="button" id="shipment2BatchFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px">Партия: Все</button>
							<div id="shipment2BatchFilterDropdown" class="filter-dropdown"></div>
						</div>
						<div class="filter-menu">
							<button type="button" id="shipment2SourceFilterBtn" class="api-btn secondary create-op" style="padding:6px 10px">Поставка: Все</button>
							<div id="shipment2SourceFilterDropdown" class="filter-dropdown"></div>
						</div>
					</div>
					<div class="toolbar-right">
						<button type="button" id="btnDeleteSelectedShipment2" class="api-btn create-op" style="padding:6px 10px" disabled>Удалить выбранные</button>
					</div>
				</div>
				<div class="table-wrap">
					<table class="cash-table">
						<thead>
							<tr>
								<th class="check-col"><input id="shipments2CheckAll" class="head-check" type="checkbox" /></th>
								<th class="date-col">Дата создания</th>
								<th>Партия</th>
								<th>Название поставки</th>
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
<div id="shipment2WarehouseModal" class="modal" onclick="closeShipment2WarehouseModalOnOutsideClick(event)">
	<div class="modal-content manage-modal-content" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Склады</h2>
			<button class="close-btn" type="button" onclick="closeShipment2WarehouseModal()">&times;</button>
		</div>
		<div class="manage-modal-body">
			<div class="manage-form-row">
				<div class="edit-field">
					<label class="edit-label" for="shipment2WarehouseNameInput">Название склада</label>
					<input id="shipment2WarehouseNameInput" class="edit-select" type="text" autocomplete="off" />
				</div>
				<button id="shipment2WarehouseCreateBtn" class="api-btn" type="button" onclick="submitShipment2WarehouseCreate()">Добавить</button>
			</div>
			<div id="shipment2WarehouseModalError" class="batch-modal-error"></div>
			<div class="manage-list-wrap">
				<table class="manage-list-table">
					<thead><tr><th>Склад</th><th class="manage-actions-cell"></th></tr></thead>
					<tbody id="shipment2WarehouseListBody"></tbody>
				</table>
			</div>
		</div>
	</div>
</div>
<div id="shipment2SourceModal" class="modal" onclick="closeShipment2SourceModalOnOutsideClick(event)">
	<div class="modal-content manage-modal-content" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Источники</h2>
			<button class="close-btn" type="button" onclick="closeShipment2SourceModal()">&times;</button>
		</div>
		<div class="manage-modal-body">
			<div class="manage-form-row">
				<div class="edit-field">
					<label class="edit-label" for="shipment2SourceNameInput">Название источника</label>
					<input id="shipment2SourceNameInput" class="edit-select" type="text" autocomplete="off" />
				</div>
				<button id="shipment2SourceCreateBtn" class="api-btn" type="button" onclick="submitShipment2SourceCreate()">Добавить</button>
			</div>
			<div id="shipment2SourceModalError" class="batch-modal-error"></div>
			<div class="manage-list-wrap">
				<table class="manage-list-table">
					<thead><tr><th>Источник</th><th class="manage-actions-cell"></th></tr></thead>
					<tbody id="shipment2SourceListBody"></tbody>
				</table>
			</div>
		</div>
	</div>
</div>
<div id="shipment2BatchModal" class="modal" onclick="closeShipment2BatchModalOnOutsideClick(event)">
	<div class="modal-content batch-modal-content" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Создать партию</h2>
			<button class="close-btn" type="button" onclick="closeShipment2BatchModal()">&times;</button>
		</div>
		<div class="batch-modal-body">
			<div id="shipment2BatchStep1" class="wizard-step active">
				<p class="wizard-title">Этап 1/5</p>
				<div class="edit-field">
					<label class="edit-label" for="shipment2BatchSourceSelect">Источник</label>
					<select id="shipment2BatchSourceSelect" class="edit-select"></select>
				</div>
			</div>
			<div id="shipment2BatchStep2" class="wizard-step">
				<p class="wizard-title">Этап 2/5</p>
				<div class="edit-field">
					<label class="edit-label" for="shipment2BatchBusinessSelect">Магазин</label>
					<select id="shipment2BatchBusinessSelect" class="edit-select"></select>
				</div>
			</div>
			<div id="shipment2BatchStep3" class="wizard-step">
				<p class="wizard-title">Этап 3/5</p>
				<div class="edit-field">
					<label class="edit-label" for="shipment2BatchWarehouseCount">Кол-во складов</label>
					<input id="shipment2BatchWarehouseCount" class="edit-select" type="number" min="0" step="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
				</div>
			</div>
			<div id="shipment2BatchStep4" class="wizard-step">
				<p class="wizard-title">Этап 4/5</p>
				<div id="shipment2BatchWarehousePickers" class="batch-warehouse-grid"></div>
			</div>
			<div id="shipment2BatchStep5" class="wizard-step batch-step5">
				<p class="wizard-title">Этап 5/5</p>
				<div class="batch-product-row">
					<div class="edit-field" style="flex:1 1 250px;min-width:200px">
						<label class="edit-label" for="shipment2BatchBarcodeInput">Товар (штрихкод)</label>
						<input id="shipment2BatchBarcodeInput" class="edit-select" type="text" autocomplete="off" />
					</div>
					<div class="edit-field" style="flex:0 0 auto">
						<label class="edit-label" for="shipment2BatchCameraBtn">Камера</label>
						<button id="shipment2BatchCameraBtn" class="batch-icon-btn" type="button" onclick="openShipment2CameraModal()" aria-label="Сканировать камерой" title="Сканировать камерой"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg></button>
					</div>
					<div class="edit-field" style="flex:0 0 150px;min-width:130px">
						<label class="edit-label" for="shipment2BatchBarcodeQty">Кол-во</label>
						<input id="shipment2BatchBarcodeQty" class="edit-select" type="number" min="1" step="1" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
					</div>
					<div class="edit-field" style="flex:0 0 160px;min-width:140px">
						<label class="edit-label" for="shipment2BatchBoxNoInput">Номер короба</label>
						<input id="shipment2BatchBoxNoInput" class="edit-select" type="number" min="1" step="1" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
					</div>
				</div>
				<div class="edit-field">
					<label class="edit-label">Склады</label>
					<div id="shipment2BatchWarehousesGrid" class="batch-warehouses-grid"></div>
				</div>
				<div class="edit-field">
					<label class="edit-label">Коробы</label>
					<div id="shipment2BatchBoxesGrid" class="batch-boxes-grid"></div>
				</div>
				<div id="shipment2BatchProductError" class="batch-modal-error"></div>
				<div id="shipment2BatchProductsList" class="batch-products-list"></div>
			</div>
		</div>
		<div class="batch-modal-footer">
			<div id="shipment2BatchModalError" class="batch-modal-error"></div>
			<div class="batch-footer-actions">
				<div>
					<button id="shipment2BatchCreateWarehouseBtn" class="api-btn" type="button" onclick="createShipment2WarehouseFromBatchStep()">Создать склад</button>
				</div>
				<div class="edit-actions" style="margin-top:0">
					<button id="shipment2BatchBackBtn" class="api-btn" type="button" onclick="goBackShipment2BatchStep()">Назад</button>
					<button id="shipment2BatchSaveExitBtn" class="api-btn" type="button" onclick="submitShipment2BatchSaveAndExit()">Сохранить и выйти</button>
					<button id="shipment2BatchPrimaryBtn" class="api-btn" type="button" onclick="submitShipment2BatchCreate()">Далее</button>
				</div>
			</div>
		</div>
	</div>
</div>
<div id="shipment2CameraModal" class="modal" onclick="closeShipment2CameraModalOnOutsideClick(event)">
	<div class="modal-content camera-modal-content" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Сканирование штрихкода</h2>
			<button class="close-btn" type="button" onclick="closeShipment2CameraModal()">&times;</button>
		</div>
		<div class="camera-video-wrap">
			<video id="shipment2CameraVideo" autoplay playsinline muted></video>
		</div>
		<div class="camera-hint">Наведите камеру на штрихкод — значение автоматически вставится в поле «Товар (штрихкод)».</div>
		<div id="shipment2CameraError" class="batch-modal-error" style="margin-top:10px"></div>
		<div class="edit-actions">
			<button class="api-btn" type="button" onclick="closeShipment2CameraModal()">Закрыть</button>
		</div>
	</div>
</div>
<div id="shipment2ShipmentEditProductsModal" class="modal" onclick="closeShipment2ShipmentEditProductsModalOnOutsideClick(event)">
	<div class="modal-content batch-modal-content" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Редактировать поставку</h2>
			<button class="close-btn" type="button" onclick="closeShipment2ShipmentEditProductsModal()">&times;</button>
		</div>
		<div class="batch-modal-body">
			<div class="wizard-step batch-step5 active">
				<div class="batch-product-row">
					<div class="edit-field" style="flex:1 1 250px;min-width:200px">
						<label class="edit-label" for="shipment2EditBarcodeInput">Товар (штрихкод)</label>
						<input id="shipment2EditBarcodeInput" class="edit-select" type="text" autocomplete="off" />
					</div>
					<div class="edit-field" style="flex:0 0 auto">
						<label class="edit-label" for="shipment2EditCameraBtn">Камера</label>
						<button id="shipment2EditCameraBtn" class="batch-icon-btn" type="button" onclick="openShipment2CameraModal('shipment2EditBarcodeInput')" aria-label="Сканировать камерой" title="Сканировать камерой"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg></button>
					</div>
					<div class="edit-field" style="flex:0 0 150px;min-width:130px">
						<label class="edit-label" for="shipment2EditBarcodeQty">Кол-во</label>
						<input id="shipment2EditBarcodeQty" class="edit-select" type="number" min="1" step="1" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
					</div>
					<div class="edit-field" style="flex:0 0 160px;min-width:140px">
						<label class="edit-label" for="shipment2EditBoxNoInput">Номер короба</label>
						<input id="shipment2EditBoxNoInput" class="edit-select" type="number" min="1" step="1" value="1" inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
					</div>
				</div>
				<div class="edit-field">
					<label class="edit-label">Склады</label>
					<div id="shipment2EditWarehousesGrid" class="batch-warehouses-grid"></div>
				</div>
				<div class="edit-field">
					<label class="edit-label">Коробы</label>
					<div id="shipment2EditBoxesGrid" class="batch-boxes-grid"></div>
				</div>
				<div id="shipment2EditProductError" class="batch-modal-error"></div>
				<div id="shipment2EditProductsList" class="batch-products-list"></div>
			</div>
		</div>
		<div class="batch-modal-footer">
			<div class="edit-actions" style="margin-top:0">
				<button id="shipment2EditBackBtn" class="api-btn" type="button" onclick="goBackShipment2ShipmentEditModal()">Назад</button>
				<button id="shipment2EditSaveExitBtn" class="api-btn" type="button" onclick="submitShipment2ShipmentEditSaveAndExit()">Сохранить и выйти</button>
				<button id="shipment2EditPrimaryBtn" class="api-btn" type="button" onclick="submitShipment2ShipmentEditProduct()">Добавить товар</button>
			</div>
		</div>
	</div>
</div>
<div id="shipment2EditModal" class="modal" onclick="closeShipment2EditModalOnOutsideClick(event)">
	<div class="modal-content" style="max-width:620px" onclick="event.stopPropagation()">
		<div class="modal-header">
			<h2>Детали поставки</h2>
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
				<div id="shipment2EditSource" class="edit-static">—</div>
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
			<button class="api-btn" type="button" onclick="closeShipment2EditModal()">Закрыть</button>
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
var shipment2BatchBusinesses = [];
var shipment2BatchSources = [];
var shipment2ManageWarehouses = [];
var shipment2ManageSources = [];
var shipment2BatchWizardStep = 1;
var shipment2CreatedBatch = null;
var shipment2AvailableWarehouses = [];
var shipment2BatchWarehouseLinks = [];
var shipment2BatchSelectedWarehouseLinkId = null;
var shipment2BatchBoxes = [];
var shipment2BatchSelectedBoxId = null;
var shipment2BatchAddedProducts = [];
var shipment2BatchCameraStream = null;
var shipment2BatchCameraTimer = null;
var shipment2BarcodeDetector = null;
var shipment2BatchCameraBusy = false;
var shipment2CameraTargetInputId = 'shipment2BatchBarcodeInput';
var shipment2BatchRequestedWarehouseCount = 0;
var shipment2BatchDraft = {
	source_id: null,
	source_name: '',
	business_id: null,
	business_name: '',
	batch_label: '',
	warehouse_count: 0,
	warehouse_ids: [],
	saved_batch_id: null,
	saved_public_id: '',
	saved_shipment_ids: []
};
var shipment2EditTargetShipmentId = null;
var shipment2EditWarehouseLinks = [];
var shipment2EditBoxes = [];
var shipment2EditSelectedWarehouseLinkId = null;
var shipment2EditSelectedBoxId = null;
var shipment2EditAddedProducts = [];
var shipment2TempVirtualBoxId = -1;
var shipment2BatchFilterValue = '__all__';
var shipment2SourceFilterValue = '__all__';

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

function getShipment2BatchStoreName(item){
	var raw = getBatchDisplayName(item);
	if (!raw || raw === '—') return '—';
	var dashIndex = raw.lastIndexOf(' - ');
	if (dashIndex > 0) {
		var maybeStore = String(raw).slice(0, dashIndex).trim();
		if (maybeStore) return maybeStore;
	}
	return String(raw).trim() || '—';
}

function getShipment2SourceName(item){
	if (item && item.source_name) {
		var source = String(item.source_name).trim();
		if (source) return source;
	}
	return '—';
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

function setShipment2WarehouseModalError(message){
	var errorEl = document.getElementById('shipment2WarehouseModalError');
	if (!errorEl) return;
	errorEl.textContent = message ? String(message) : '';
}

function setShipment2SourceModalError(message){
	var errorEl = document.getElementById('shipment2SourceModalError');
	if (!errorEl) return;
	errorEl.textContent = message ? String(message) : '';
}

function renderShipment2WarehouseList(){
	var bodyEl = document.getElementById('shipment2WarehouseListBody');
	if (!bodyEl) return;
	if (!Array.isArray(shipment2ManageWarehouses) || !shipment2ManageWarehouses.length) {
		bodyEl.innerHTML = '<tr><td colspan="2" class="cash-muted" style="text-align:center;padding:12px">Складов нет</td></tr>';
		return;
	}
	bodyEl.innerHTML = shipment2ManageWarehouses.map(function(item){
		var label = item && item.name ? formatWarehouseDisplayName(item.name) : ('ID ' + item.id);
		return '<tr><td>' + escapeHtml(label) + '</td><td class="manage-actions-cell"><button class="row-action-btn" type="button" title="Удалить" onclick="deleteShipment2Warehouse(' + Number(item.id) + ')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td></tr>';
	}).join('');
}

function renderShipment2SourceList(){
	var bodyEl = document.getElementById('shipment2SourceListBody');
	if (!bodyEl) return;
	if (!Array.isArray(shipment2ManageSources) || !shipment2ManageSources.length) {
		bodyEl.innerHTML = '<tr><td colspan="2" class="cash-muted" style="text-align:center;padding:12px">Источников нет</td></tr>';
		return;
	}
	bodyEl.innerHTML = shipment2ManageSources.map(function(item){
		var label = item && item.name ? String(item.name) : ('ID ' + item.id);
		return '<tr><td>' + escapeHtml(label) + '</td><td class="manage-actions-cell"><button class="row-action-btn" type="button" title="Удалить" onclick="deleteShipment2Source(' + Number(item.id) + ')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td></tr>';
	}).join('');
}

async function refreshShipment2WarehouseList(){
	var result = await apiGet('/api/fbo/warehouses');
	shipment2ManageWarehouses = (result && result.success && Array.isArray(result.items)) ? result.items : [];
	renderShipment2WarehouseList();
	if (document.getElementById('shipment2BatchModal') && document.getElementById('shipment2BatchModal').classList.contains('active')) {
		shipment2AvailableWarehouses = shipment2ManageWarehouses.slice();
		setShipment2BatchWarehouseCountHint();
	}
}

async function refreshShipment2SourceList(){
	var result = await apiGet('/api/fbo/sources');
	shipment2ManageSources = (result && result.success && Array.isArray(result.items)) ? result.items : [];
	renderShipment2SourceList();
	if (document.getElementById('shipment2BatchModal') && document.getElementById('shipment2BatchModal').classList.contains('active')) {
		shipment2BatchSources = shipment2ManageSources.slice();
		fillShipment2BatchSourceSelect(shipment2BatchSources);
	}
}

async function openShipment2WarehouseModal(){
	setShipment2WarehouseModalError('');
	var inputEl = document.getElementById('shipment2WarehouseNameInput');
	if (inputEl) inputEl.value = '';
	var modal = document.getElementById('shipment2WarehouseModal');
	if (modal) modal.classList.add('active');
	await refreshShipment2WarehouseList();
	if (inputEl) inputEl.focus();
}

function closeShipment2WarehouseModal(){
	var modal = document.getElementById('shipment2WarehouseModal');
	if (modal) modal.classList.remove('active');
	setShipment2WarehouseModalError('');
}

function closeShipment2WarehouseModalOnOutsideClick(event){
	if (event && event.target && event.target.id === 'shipment2WarehouseModal') {
		closeShipment2WarehouseModal();
	}
}

async function submitShipment2WarehouseCreate(){
	var inputEl = document.getElementById('shipment2WarehouseNameInput');
	var createBtn = document.getElementById('shipment2WarehouseCreateBtn');
	var name = String((inputEl && inputEl.value) ? inputEl.value : '').trim();
	if (!name) {
		setShipment2WarehouseModalError('Название склада обязательно');
		return;
	}
	setShipment2WarehouseModalError('');
	if (createBtn) createBtn.disabled = true;
	try {
		var result = await apiPost('/api/fbo/warehouses', { name: name });
		if (!result || !result.success) {
			setShipment2WarehouseModalError((result && result.error) || 'Ошибка создания склада');
			return;
		}
		if (inputEl) inputEl.value = '';
		await refreshShipment2WarehouseList();
		await loadShipments2();
	} finally {
		if (createBtn) createBtn.disabled = false;
	}
}

async function deleteShipment2Warehouse(id){
	if (!confirm('Удалить склад?')) return;
	var result = await apiDelete('/api/fbo/warehouses/' + Number(id));
	if (!result || !result.success) {
		setShipment2WarehouseModalError((result && result.error) || 'Ошибка удаления склада');
		return;
	}
	setShipment2WarehouseModalError('');
	await refreshShipment2WarehouseList();
	await loadShipments2();
}

async function openShipment2SourceModal(){
	setShipment2SourceModalError('');
	var inputEl = document.getElementById('shipment2SourceNameInput');
	if (inputEl) inputEl.value = '';
	var modal = document.getElementById('shipment2SourceModal');
	if (modal) modal.classList.add('active');
	await refreshShipment2SourceList();
	if (inputEl) inputEl.focus();
}

function closeShipment2SourceModal(){
	var modal = document.getElementById('shipment2SourceModal');
	if (modal) modal.classList.remove('active');
	setShipment2SourceModalError('');
}

function closeShipment2SourceModalOnOutsideClick(event){
	if (event && event.target && event.target.id === 'shipment2SourceModal') {
		closeShipment2SourceModal();
	}
}

async function submitShipment2SourceCreate(){
	var inputEl = document.getElementById('shipment2SourceNameInput');
	var createBtn = document.getElementById('shipment2SourceCreateBtn');
	var name = String((inputEl && inputEl.value) ? inputEl.value : '').trim();
	if (!name) {
		setShipment2SourceModalError('Название источника обязательно');
		return;
	}
	setShipment2SourceModalError('');
	if (createBtn) createBtn.disabled = true;
	try {
		var result = await apiPost('/api/fbo/sources', { name: name });
		if (!result || !result.success) {
			setShipment2SourceModalError((result && result.error) || 'Ошибка создания источника');
			return;
		}
		if (inputEl) inputEl.value = '';
		await refreshShipment2SourceList();
		await loadShipments2();
	} finally {
		if (createBtn) createBtn.disabled = false;
	}
}

async function deleteShipment2Source(id){
	if (!confirm('Удалить источник?')) return;
	var result = await apiDelete('/api/fbo/sources/' + Number(id));
	if (!result || !result.success) {
		setShipment2SourceModalError((result && result.error) || 'Ошибка удаления источника');
		return;
	}
	setShipment2SourceModalError('');
	await refreshShipment2SourceList();
	await loadShipments2();
}

async function createShipment2Warehouse(){
	return openShipment2WarehouseModal();
}

async function createShipment2Source(){
	return openShipment2SourceModal();
}

async function createShipment2Batch(){
	return openShipment2BatchModal();
}

function setShipment2BatchModalError(message){
	var errorEl = document.getElementById('shipment2BatchModalError');
	if (!errorEl) return;
	errorEl.textContent = message ? String(message) : '';
}

function fillShipment2BatchBusinessSelect(items){
	var selectEl = document.getElementById('shipment2BatchBusinessSelect');
	if (!selectEl) return;
	if (!Array.isArray(items) || !items.length) {
		selectEl.innerHTML = '<option value="">Нет активных магазинов</option>';
		selectEl.disabled = true;
		return;
	}
	var placeholderOption = '<option value="">Выберите магазин</option>';
	selectEl.innerHTML = placeholderOption + items.map(function(item){
		var label = item && item.company_name ? String(item.company_name) : ('ID ' + item.id);
		return '<option value="' + item.id + '">' + escapeHtml(label) + '</option>';
	}).join('');
	selectEl.disabled = false;
	selectEl.value = '';
}

function fillShipment2BatchSourceSelect(items){
	var selectEl = document.getElementById('shipment2BatchSourceSelect');
	if (!selectEl) return;
	if (!Array.isArray(items) || !items.length) {
		selectEl.innerHTML = '<option value="">Нет активных источников</option>';
		selectEl.disabled = true;
		return;
	}
	var placeholderOption = '<option value="">Выберите источник</option>';
	selectEl.innerHTML = placeholderOption + items.map(function(item){
		var label = item && item.name ? String(item.name) : ('ID ' + item.id);
		return '<option value="' + item.id + '">' + escapeHtml(label) + '</option>';
	}).join('');
	selectEl.disabled = false;
	selectEl.value = '';
}

function setShipment2BatchWarehouseCountHint(){
	var hintEl = document.getElementById('shipment2BatchWarehouseCountHint');
	if (!hintEl) return;
	var maxCount = Array.isArray(shipment2AvailableWarehouses) ? shipment2AvailableWarehouses.length : 0;
	if (!maxCount) {
		hintEl.textContent = 'Доступно складов: 0.';
		return;
	}
	hintEl.textContent = 'Доступно складов: ' + maxCount + '.';
}

function setShipment2BatchProductError(message){
	var errorEl = document.getElementById('shipment2BatchProductError');
	if (!errorEl) return;
	errorEl.textContent = message ? String(message) : '';
}

function setShipment2EditProductError(message){
	var errorEl = document.getElementById('shipment2EditProductError');
	if (!errorEl) return;
	errorEl.textContent = message ? String(message) : '';
}

function renderShipment2BatchProductsList(){
	var root = document.getElementById('shipment2BatchProductsList');
	if (!root) return;
	if (!Array.isArray(shipment2BatchAddedProducts) || !shipment2BatchAddedProducts.length) {
		root.innerHTML = '';
		return;
	}
	root.innerHTML = shipment2BatchAddedProducts.map(function(item){
		var barcode = item && item.barcode ? String(item.barcode) : '—';
		var qty = Number(item && item.qty ? item.qty : 0);
		var boxNo = Number(item && item.box_no ? item.box_no : 0);
		var warehouseName = item && item.warehouse_name ? String(item.warehouse_name) : '';
		var right = 'Короб №' + escapeHtml(String(boxNo || '—')) + ' · ' + escapeHtml(String(qty || 0)) + ' шт.';
		if (warehouseName) right += ' · ' + escapeHtml(warehouseName);
		return '<div class="batch-products-row"><span>' + escapeHtml(barcode) + '</span><span>' + right + '</span></div>';
	}).join('');
}

function renderShipment2EditProductsList(){
	var root = document.getElementById('shipment2EditProductsList');
	if (!root) return;
	if (!Array.isArray(shipment2EditAddedProducts) || !shipment2EditAddedProducts.length) {
		root.innerHTML = '';
		return;
	}
	root.innerHTML = shipment2EditAddedProducts.map(function(item){
		var barcode = item && item.barcode ? String(item.barcode) : '—';
		var qty = Number(item && item.qty ? item.qty : 0);
		var boxNo = Number(item && item.box_no ? item.box_no : 0);
		var warehouseName = item && item.warehouse_name ? String(item.warehouse_name) : '';
		var right = 'Короб №' + escapeHtml(String(boxNo || '—')) + ' · ' + escapeHtml(String(qty || 0)) + ' шт.';
		if (warehouseName) right += ' · ' + escapeHtml(warehouseName);
		return '<div class="batch-products-row"><span>' + escapeHtml(barcode) + '</span><span>' + right + '</span></div>';
	}).join('');
}

function renderShipment2BatchWarehouses(){
	var root = document.getElementById('shipment2BatchWarehousesGrid');
	if (!root) return;
	if (!Array.isArray(shipment2BatchWarehouseLinks) || !shipment2BatchWarehouseLinks.length) {
		root.innerHTML = '<div class="cash-muted">Склады не найдены</div>';
		return;
	}
	root.innerHTML = shipment2BatchWarehouseLinks.map(function(item){
		var isActive = Number(shipment2BatchSelectedWarehouseLinkId) === Number(item.id);
		var label = item && item.warehouse_name ? formatWarehouseDisplayName(item.warehouse_name) : ('ID ' + item.warehouse_id);
		return '<button type="button" class="batch-warehouse-btn' + (isActive ? ' active' : '') + '" onclick="selectShipment2BatchWarehouse(' + Number(item.id) + ')">' + escapeHtml(String(label || '—').toUpperCase()) + '</button>';
	}).join('');
}

function renderShipment2BatchBoxes(){
	var root = document.getElementById('shipment2BatchBoxesGrid');
	if (!root) return;
	if (!shipment2BatchSelectedWarehouseLinkId) {
		root.innerHTML = '<div class="cash-muted">Сначала выберите склад</div>';
		return;
	}
	var filteredBoxes = (shipment2BatchBoxes || []).filter(function(item){ return Number(item.shipment_warehouse_id) === Number(shipment2BatchSelectedWarehouseLinkId); });
	if (!filteredBoxes.length) {
		root.innerHTML = '';
		return;
	}
	root.innerHTML = filteredBoxes.map(function(item){
		var isActive = Number(shipment2BatchSelectedBoxId) === Number(item.id);
		var boxNo = Number(item && item.box_no ? item.box_no : 0);
		return '<button type="button" class="batch-box-btn' + (isActive ? ' active' : '') + '" onclick="selectShipment2BatchBox(' + Number(item.id) + ')"><span class="batch-box-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg></span><span>' + escapeHtml('№' + (boxNo || item.id)) + '</span></button>';
	}).join('');
}

function renderShipment2EditWarehousesGrid(){
	var root = document.getElementById('shipment2EditWarehousesGrid');
	if (!root) return;
	if (!Array.isArray(shipment2EditWarehouseLinks) || !shipment2EditWarehouseLinks.length) {
		root.innerHTML = '<div class="cash-muted">Склады не найдены</div>';
		return;
	}
	root.innerHTML = shipment2EditWarehouseLinks.map(function(item){
		var isActive = Number(shipment2EditSelectedWarehouseLinkId) === Number(item.id);
		var label = item && item.warehouse_name ? formatWarehouseDisplayName(item.warehouse_name) : ('ID ' + item.warehouse_id);
		return '<button type="button" class="batch-warehouse-btn' + (isActive ? ' active' : '') + '" onclick="selectShipment2EditWarehouse(' + Number(item.id) + ')">' + escapeHtml(String(label || '—').toUpperCase()) + '</button>';
	}).join('');
}

function renderShipment2EditBoxes(){
	var root = document.getElementById('shipment2EditBoxesGrid');
	if (!root) return;
	if (!shipment2EditSelectedWarehouseLinkId) {
		root.innerHTML = '<div class="cash-muted">Сначала выберите склад</div>';
		return;
	}
	var filteredBoxes = (shipment2EditBoxes || []).filter(function(item){ return Number(item.shipment_warehouse_id) === Number(shipment2EditSelectedWarehouseLinkId); });
	if (!filteredBoxes.length) {
		root.innerHTML = '';
		return;
	}
	root.innerHTML = filteredBoxes.map(function(item){
		var isActive = Number(shipment2EditSelectedBoxId) === Number(item.id);
		var boxNo = Number(item && item.box_no ? item.box_no : 0);
		return '<button type="button" class="batch-box-btn' + (isActive ? ' active' : '') + '" onclick="selectShipment2EditBox(' + Number(item.id) + ')"><span class="batch-box-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg></span><span>' + escapeHtml('№' + (boxNo || item.id)) + '</span></button>';
	}).join('');
}

function selectShipment2BatchWarehouse(shipmentWarehouseId){
	shipment2BatchSelectedWarehouseLinkId = Number(shipmentWarehouseId) || null;
	var firstBoxForWarehouse = (shipment2BatchBoxes || []).find(function(item){ return Number(item.shipment_warehouse_id) === Number(shipment2BatchSelectedWarehouseLinkId); });
	shipment2BatchSelectedBoxId = firstBoxForWarehouse ? Number(firstBoxForWarehouse.id) : null;
	var boxNoInput = document.getElementById('shipment2BatchBoxNoInput');
	if (boxNoInput) {
		boxNoInput.value = firstBoxForWarehouse && Number(firstBoxForWarehouse.box_no) > 0 ? String(firstBoxForWarehouse.box_no) : '1';
	}
	renderShipment2BatchWarehouses();
	renderShipment2BatchBoxes();
}

function selectShipment2BatchBox(boxId){
	shipment2BatchSelectedBoxId = Number(boxId) || null;
	var selectedBox = (shipment2BatchBoxes || []).find(function(item){ return Number(item.id) === Number(shipment2BatchSelectedBoxId); });
	if (selectedBox && selectedBox.shipment_warehouse_id) {
		shipment2BatchSelectedWarehouseLinkId = Number(selectedBox.shipment_warehouse_id);
	}
	var boxNoInput = document.getElementById('shipment2BatchBoxNoInput');
	if (boxNoInput && selectedBox && Number(selectedBox.box_no) > 0) {
		boxNoInput.value = String(selectedBox.box_no);
	}
	renderShipment2BatchWarehouses();
	renderShipment2BatchBoxes();
}

function selectShipment2EditWarehouse(shipmentWarehouseId){
	shipment2EditSelectedWarehouseLinkId = Number(shipmentWarehouseId) || null;
	var firstBoxForWarehouse = (shipment2EditBoxes || []).find(function(item){ return Number(item.shipment_warehouse_id) === Number(shipment2EditSelectedWarehouseLinkId); });
	shipment2EditSelectedBoxId = firstBoxForWarehouse ? Number(firstBoxForWarehouse.id) : null;
	var boxNoInput = document.getElementById('shipment2EditBoxNoInput');
	if (boxNoInput) {
		boxNoInput.value = firstBoxForWarehouse && Number(firstBoxForWarehouse.box_no) > 0 ? String(firstBoxForWarehouse.box_no) : '1';
	}
	renderShipment2EditWarehousesGrid();
	renderShipment2EditBoxes();
}

function selectShipment2EditBox(boxId){
	shipment2EditSelectedBoxId = Number(boxId) || null;
	var selectedBox = (shipment2EditBoxes || []).find(function(item){ return Number(item.id) === Number(shipment2EditSelectedBoxId); });
	if (selectedBox && selectedBox.shipment_warehouse_id) {
		shipment2EditSelectedWarehouseLinkId = Number(selectedBox.shipment_warehouse_id);
	}
	var boxNoInput = document.getElementById('shipment2EditBoxNoInput');
	if (boxNoInput && selectedBox && Number(selectedBox.box_no) > 0) {
		boxNoInput.value = String(selectedBox.box_no);
	}
	renderShipment2EditWarehousesGrid();
	renderShipment2EditBoxes();
}

function ensureLocalBoxesUpTo(warehouseBoxes, shipmentWarehouseId, desiredNo, shipmentId){
	var swId = Number(shipmentWarehouseId);
	var targetNo = Number(desiredNo);
	if (!swId || !targetNo || targetNo < 1) {
		throw new Error('Некорректный номер короба');
	}

	if (!Array.isArray(warehouseBoxes)) {
		throw new Error('Не удалось подготовить список коробов');
	}

	var existingForWarehouse = (warehouseBoxes || []).filter(function(item){ return Number(item.shipment_warehouse_id) === swId; });
	var existingExact = existingForWarehouse.find(function(item){ return Number(item.box_no) === targetNo; });
	var existingNumbers = {};
	for (var idx = 0; idx < existingForWarehouse.length; idx += 1) {
		var currentNo = Number(existingForWarehouse[idx] && existingForWarehouse[idx].box_no ? existingForWarehouse[idx].box_no : 0);
		if (currentNo > 0) existingNumbers[currentNo] = true;
	}

	for (var no = 1; no <= targetNo; no += 1) {
		if (existingNumbers[no]) continue;
		warehouseBoxes.push({
			id: shipment2TempVirtualBoxId--,
			box_no: no,
			shipment_id: Number(shipmentId || 0),
			shipment_warehouse_id: swId,
			is_temp: true
		});
		existingNumbers[no] = true;
	}

	warehouseBoxes.sort(function(a, b){
		if (Number(a.shipment_warehouse_id) === Number(b.shipment_warehouse_id)) {
			if (Number(a.box_no) === Number(b.box_no)) return Number(a.id) - Number(b.id);
			return Number(a.box_no) - Number(b.box_no);
		}
		return Number(a.shipment_warehouse_id) - Number(b.shipment_warehouse_id);
	});

	var created = warehouseBoxes.find(function(item){
		return Number(item.shipment_warehouse_id) === swId && Number(item.box_no) === targetNo;
	});
	if (!created) throw new Error('Не удалось подготовить короб №' + targetNo);
	return created;
}

async function ensureShipment2BatchBoxesReady(){
	shipment2BatchWarehouseLinks = [];
	shipment2BatchBoxes = [];
	var shipmentIds = Array.isArray(shipment2BatchDraft.saved_shipment_ids) ? shipment2BatchDraft.saved_shipment_ids.slice() : [];
	for (var i = 0; i < shipmentIds.length; i += 1) {
		var shipmentId = Number(shipmentIds[i]);
		if (!shipmentId) continue;
		var linkRes = await apiGet('/api/fbo/shipments/' + shipmentId + '/warehouses');
		var linkItems = (linkRes && linkRes.success && Array.isArray(linkRes.items)) ? linkRes.items : [];
		for (var j = 0; j < linkItems.length; j += 1) {
			var link = linkItems[j];
			if (!link || !link.id) continue;
			shipment2BatchWarehouseLinks.push({
				id: Number(link.id),
				shipment_id: shipmentId,
				warehouse_id: Number(link.warehouse_id || 0),
				warehouse_name: link.warehouse_name ? String(link.warehouse_name) : ''
			});
			var boxesRes = await apiGet('/api/fbo/boxes?shipmentWarehouseId=' + Number(link.id));
			var boxItems = (boxesRes && boxesRes.success && Array.isArray(boxesRes.items)) ? boxesRes.items : [];
			if (!boxItems.length) {
				var createBoxRes = await apiPost('/api/fbo/boxes', { shipment_warehouse_id: Number(link.id) });
				if (!createBoxRes || !createBoxRes.success) {
					throw new Error((createBoxRes && createBoxRes.error) || 'Не удалось создать короб');
				}
				boxesRes = await apiGet('/api/fbo/boxes?shipmentWarehouseId=' + Number(link.id));
				boxItems = (boxesRes && boxesRes.success && Array.isArray(boxesRes.items)) ? boxesRes.items : [];
			}
			for (var k = 0; k < boxItems.length; k += 1) {
				var box = boxItems[k];
				shipment2BatchBoxes.push({
					id: Number(box.id),
					box_no: Number(box.box_no || 0),
					shipment_id: shipmentId,
					shipment_warehouse_id: Number(link.id)
				});
			}
		}
	}
	shipment2BatchBoxes.sort(function(a, b){
		if (Number(a.box_no) === Number(b.box_no)) return Number(a.id) - Number(b.id);
		return Number(a.box_no) - Number(b.box_no);
	});
	shipment2BatchWarehouseLinks.sort(function(a, b){
		var aa = String(a.warehouse_name || '').toUpperCase();
		var bb = String(b.warehouse_name || '').toUpperCase();
		if (aa === bb) return Number(a.id) - Number(b.id);
		return aa < bb ? -1 : 1;
	});
	if (shipment2BatchWarehouseLinks.length) {
		var hasSelectedWarehouse = shipment2BatchWarehouseLinks.some(function(item){ return Number(item.id) === Number(shipment2BatchSelectedWarehouseLinkId); });
		if (!hasSelectedWarehouse) shipment2BatchSelectedWarehouseLinkId = Number(shipment2BatchWarehouseLinks[0].id);
	} else {
		shipment2BatchSelectedWarehouseLinkId = null;
	}
	if (!shipment2BatchBoxes.length) {
		shipment2BatchSelectedBoxId = null;
		return;
	}
	var filteredForSelectedWarehouse = (shipment2BatchBoxes || []).filter(function(item){ return Number(item.shipment_warehouse_id) === Number(shipment2BatchSelectedWarehouseLinkId); });
	if (filteredForSelectedWarehouse.length) {
		var hasCurrentInWarehouse = filteredForSelectedWarehouse.some(function(item){ return Number(item.id) === Number(shipment2BatchSelectedBoxId); });
		if (!hasCurrentInWarehouse) shipment2BatchSelectedBoxId = Number(filteredForSelectedWarehouse[0].id);
		var boxNoInputEl = document.getElementById('shipment2BatchBoxNoInput');
		if (boxNoInputEl) {
			var selectedBox = filteredForSelectedWarehouse.find(function(item){ return Number(item.id) === Number(shipment2BatchSelectedBoxId); });
			if (selectedBox && Number(selectedBox.box_no) > 0) boxNoInputEl.value = String(selectedBox.box_no);
		}
		return;
	}
	shipment2BatchSelectedBoxId = null;
}

async function ensureShipment2BatchBoxByNumber(shipmentWarehouseId, boxNo){
	var swId = Number(shipmentWarehouseId);
	var desiredNo = Number(boxNo);
	if (!swId || !desiredNo || desiredNo < 1) {
		throw new Error('Некорректный номер короба');
	}

	var existingForWarehouse = (shipment2BatchBoxes || []).filter(function(item){ return Number(item.shipment_warehouse_id) === swId; });
	var existing = existingForWarehouse.find(function(item){ return Number(item.box_no) === desiredNo; });
	if (existing) return existing;

	var maxNo = existingForWarehouse.reduce(function(maxValue, item){
		var currentNo = Number(item && item.box_no ? item.box_no : 0);
		return currentNo > maxValue ? currentNo : maxValue;
	}, 0);

	if (desiredNo <= maxNo) {
		throw new Error('Короб №' + desiredNo + ' отсутствует у выбранного склада');
	}

	var createCount = desiredNo - maxNo;
	for (var i = 0; i < createCount; i += 1) {
		var createRes = await apiPost('/api/fbo/boxes', { shipment_warehouse_id: swId });
		if (!createRes || !createRes.success) {
			throw new Error((createRes && createRes.error) || 'Ошибка создания короба');
		}
	}

	await ensureShipment2BatchBoxesReady();
	renderShipment2BatchWarehouses();
	renderShipment2BatchBoxes();

	var created = (shipment2BatchBoxes || []).find(function(item){
		return Number(item.shipment_warehouse_id) === swId && Number(item.box_no) === desiredNo;
	});
	if (!created) {
		throw new Error('Не удалось найти созданный короб №' + desiredNo);
	}
	return created;
}

async function loadShipment2EditProductsContext(shipmentId){
	shipment2EditWarehouseLinks = [];
	shipment2EditBoxes = [];
	var linkRes = await apiGet('/api/fbo/shipments/' + Number(shipmentId) + '/warehouses');
	var linkItems = (linkRes && linkRes.success && Array.isArray(linkRes.items)) ? linkRes.items : [];
	for (var i = 0; i < linkItems.length; i += 1) {
		var link = linkItems[i];
		if (!link || !link.id) continue;
		shipment2EditWarehouseLinks.push({
			id: Number(link.id),
			shipment_id: Number(shipmentId),
			warehouse_id: Number(link.warehouse_id || 0),
			warehouse_name: link.warehouse_name ? String(link.warehouse_name) : ''
		});
		var boxesRes = await apiGet('/api/fbo/boxes?shipmentWarehouseId=' + Number(link.id));
		var boxItems = (boxesRes && boxesRes.success && Array.isArray(boxesRes.items)) ? boxesRes.items : [];
		if (!boxItems.length) {
			var createBoxRes = await apiPost('/api/fbo/boxes', { shipment_warehouse_id: Number(link.id) });
			if (!createBoxRes || !createBoxRes.success) {
				throw new Error((createBoxRes && createBoxRes.error) || 'Не удалось создать короб');
			}
			boxesRes = await apiGet('/api/fbo/boxes?shipmentWarehouseId=' + Number(link.id));
			boxItems = (boxesRes && boxesRes.success && Array.isArray(boxesRes.items)) ? boxesRes.items : [];
		}
		for (var j = 0; j < boxItems.length; j += 1) {
			var box = boxItems[j];
			shipment2EditBoxes.push({
				id: Number(box.id),
				box_no: Number(box.box_no || 0),
				shipment_id: Number(shipmentId),
				shipment_warehouse_id: Number(link.id)
			});
		}
	}

	shipment2EditBoxes.sort(function(a, b){
		if (Number(a.box_no) === Number(b.box_no)) return Number(a.id) - Number(b.id);
		return Number(a.box_no) - Number(b.box_no);
	});
	shipment2EditWarehouseLinks.sort(function(a, b){
		var aa = String(a.warehouse_name || '').toUpperCase();
		var bb = String(b.warehouse_name || '').toUpperCase();
		if (aa === bb) return Number(a.id) - Number(b.id);
		return aa < bb ? -1 : 1;
	});

	if (shipment2EditWarehouseLinks.length) {
		shipment2EditSelectedWarehouseLinkId = Number(shipment2EditWarehouseLinks[0].id);
		var firstBox = (shipment2EditBoxes || []).find(function(item){ return Number(item.shipment_warehouse_id) === Number(shipment2EditSelectedWarehouseLinkId); });
		shipment2EditSelectedBoxId = firstBox ? Number(firstBox.id) : null;
	} else {
		shipment2EditSelectedWarehouseLinkId = null;
		shipment2EditSelectedBoxId = null;
	}
}

async function ensureShipment2EditBoxByNumber(shipmentWarehouseId, boxNo){
	var swId = Number(shipmentWarehouseId);
	var desiredNo = Number(boxNo);
	if (!swId || !desiredNo || desiredNo < 1) {
		throw new Error('Некорректный номер короба');
	}

	var existingForWarehouse = (shipment2EditBoxes || []).filter(function(item){ return Number(item.shipment_warehouse_id) === swId; });
	var existing = existingForWarehouse.find(function(item){ return Number(item.box_no) === desiredNo; });
	if (existing) return existing;

	var maxNo = existingForWarehouse.reduce(function(maxValue, item){
		var currentNo = Number(item && item.box_no ? item.box_no : 0);
		return currentNo > maxValue ? currentNo : maxValue;
	}, 0);

	if (desiredNo <= maxNo) {
		throw new Error('Короб №' + desiredNo + ' отсутствует у выбранного склада');
	}

	var createCount = desiredNo - maxNo;
	for (var i = 0; i < createCount; i += 1) {
		var createRes = await apiPost('/api/fbo/boxes', { shipment_warehouse_id: swId });
		if (!createRes || !createRes.success) {
			throw new Error((createRes && createRes.error) || 'Ошибка создания короба');
		}
	}

	await loadShipment2EditProductsContext(shipment2EditTargetShipmentId);
	renderShipment2EditWarehousesGrid();
	renderShipment2EditBoxes();

	var created = (shipment2EditBoxes || []).find(function(item){
		return Number(item.shipment_warehouse_id) === swId && Number(item.box_no) === desiredNo;
	});
	if (!created) {
		throw new Error('Не удалось найти созданный короб №' + desiredNo);
	}
	return created;
}

function setShipment2CameraError(message){
	var errorEl = document.getElementById('shipment2CameraError');
	if (!errorEl) return;
	errorEl.textContent = message ? String(message) : '';
}

function stopShipment2CameraStream(){
	if (shipment2BatchCameraTimer) {
		cancelAnimationFrame(shipment2BatchCameraTimer);
		shipment2BatchCameraTimer = null;
	}
	if (shipment2BatchCameraStream) {
		shipment2BatchCameraStream.getTracks().forEach(function(track){ track.stop(); });
		shipment2BatchCameraStream = null;
	}
	var videoEl = document.getElementById('shipment2CameraVideo');
	if (videoEl) videoEl.srcObject = null;
}

function closeShipment2CameraModal(){
	stopShipment2CameraStream();
	setShipment2CameraError('');
	var modal = document.getElementById('shipment2CameraModal');
	if (modal) modal.classList.remove('active');
}

function closeShipment2CameraModalOnOutsideClick(event){
	if (event && event.target && event.target.id === 'shipment2CameraModal') {
		closeShipment2CameraModal();
	}
}

async function detectShipment2BarcodeFromVideo(videoEl){
	if (!videoEl || typeof BarcodeDetector === 'undefined') return null;
	if (!shipment2BarcodeDetector) {
		var preferredFormats = ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'itf', 'code_39', 'codabar'];
		if (BarcodeDetector.getSupportedFormats) {
			try {
				var supported = await BarcodeDetector.getSupportedFormats();
				var usingFormats = preferredFormats.filter(function(format){ return Array.isArray(supported) && supported.indexOf(format) !== -1; });
				shipment2BarcodeDetector = usingFormats.length ? new BarcodeDetector({ formats: usingFormats }) : new BarcodeDetector();
			} catch (supportError) {
				shipment2BarcodeDetector = new BarcodeDetector({ formats: preferredFormats });
			}
		} else {
			shipment2BarcodeDetector = new BarcodeDetector({ formats: preferredFormats });
		}
	}
	var barcodes = [];
	try {
		barcodes = await shipment2BarcodeDetector.detect(videoEl);
	} catch (firstError) {
		try {
			if (!videoEl.videoWidth || !videoEl.videoHeight) return null;
			var canvas = document.createElement('canvas');
			canvas.width = videoEl.videoWidth;
			canvas.height = videoEl.videoHeight;
			var ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) return null;
			ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
			barcodes = await shipment2BarcodeDetector.detect(canvas);
		} catch (secondError) {
			barcodes = [];
		}
	}
	if (!Array.isArray(barcodes) || !barcodes.length) return null;
	var code = barcodes[0] && barcodes[0].rawValue ? String(barcodes[0].rawValue).trim() : '';
	return code || null;
}

function runShipment2CameraScanLoop(videoEl){
	if (!videoEl || !shipment2BatchCameraStream) return;
	shipment2BatchCameraTimer = requestAnimationFrame(async function(){
		if (!shipment2BatchCameraStream) return;
		if (videoEl.readyState >= 2 && !shipment2BatchCameraBusy) {
			shipment2BatchCameraBusy = true;
			try {
				var scannedValue = await detectShipment2BarcodeFromVideo(videoEl);
				if (scannedValue) {
					var barcodeInput = document.getElementById(shipment2CameraTargetInputId || 'shipment2BatchBarcodeInput');
					if (barcodeInput) {
						barcodeInput.value = scannedValue;
						barcodeInput.focus();
					}
					closeShipment2CameraModal();
					shipment2BatchCameraBusy = false;
					return;
				}
			} catch (scanError) {
				setShipment2CameraError((scanError && scanError.message) ? scanError.message : 'Ошибка сканирования');
			}
			shipment2BatchCameraBusy = false;
		}
		runShipment2CameraScanLoop(videoEl);
	});
}

async function openShipment2CameraModal(targetInputId){
	setShipment2CameraError('');
	shipment2BatchCameraBusy = false;
	shipment2CameraTargetInputId = targetInputId ? String(targetInputId) : 'shipment2BatchBarcodeInput';
	if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
		setShipment2CameraError('Камера недоступна в этом браузере');
		return;
	}
	var modal = document.getElementById('shipment2CameraModal');
	var videoEl = document.getElementById('shipment2CameraVideo');
	if (!modal || !videoEl) return;

	try {
		shipment2BatchCameraStream = await navigator.mediaDevices.getUserMedia({
			video: {
				facingMode: { ideal: 'environment' },
				width: { ideal: 1920 },
				height: { ideal: 1080 }
			},
			audio: false
		});
		videoEl.srcObject = shipment2BatchCameraStream;
		try {
			await videoEl.play();
		} catch (playError) {
		}
		modal.classList.add('active');
		if (typeof BarcodeDetector === 'undefined') {
			setShipment2CameraError('Авто-скан в этом браузере не поддерживается. На телефоне (Chrome/Android) обычно работает стабильнее.');
			return;
		}
		if (shipment2BatchCameraTimer) cancelAnimationFrame(shipment2BatchCameraTimer);
		runShipment2CameraScanLoop(videoEl);
	} catch (cameraError) {
		setShipment2CameraError((cameraError && cameraError.message) ? cameraError.message : 'Не удалось включить камеру');
	}
}

function renderShipment2BatchWizard(){
	var step1 = document.getElementById('shipment2BatchStep1');
	var step2 = document.getElementById('shipment2BatchStep2');
	var step3 = document.getElementById('shipment2BatchStep3');
	var step4 = document.getElementById('shipment2BatchStep4');
	var step5 = document.getElementById('shipment2BatchStep5');
	var primaryBtn = document.getElementById('shipment2BatchPrimaryBtn');
	var backBtn = document.getElementById('shipment2BatchBackBtn');
	var saveExitBtn = document.getElementById('shipment2BatchSaveExitBtn');
	var createWhBtn = document.getElementById('shipment2BatchCreateWarehouseBtn');
	if (step1) step1.classList.toggle('active', shipment2BatchWizardStep === 1);
	if (step2) step2.classList.toggle('active', shipment2BatchWizardStep === 2);
	if (step3) step3.classList.toggle('active', shipment2BatchWizardStep === 3);
	if (step4) step4.classList.toggle('active', shipment2BatchWizardStep === 4);
	if (step5) step5.classList.toggle('active', shipment2BatchWizardStep === 5);
	if (backBtn) backBtn.style.visibility = shipment2BatchWizardStep === 1 ? 'hidden' : 'visible';
	if (saveExitBtn) saveExitBtn.style.display = shipment2BatchWizardStep === 5 ? 'inline-flex' : 'none';
	if (createWhBtn) createWhBtn.style.visibility = shipment2BatchWizardStep === 3 ? 'visible' : 'hidden';
	if (primaryBtn) {
		if (shipment2BatchWizardStep === 1) primaryBtn.textContent = 'Далее';
		else if (shipment2BatchWizardStep === 2) primaryBtn.textContent = 'Далее';
		else if (shipment2BatchWizardStep === 3) primaryBtn.textContent = 'Далее';
		else if (shipment2BatchWizardStep === 4) primaryBtn.textContent = 'Сохранить';
		else if (shipment2BatchWizardStep === 5) primaryBtn.textContent = 'Добавить товар';
		else primaryBtn.textContent = 'Далее';
	}
}

function setShipment2BatchCreatedInfo(){
	var infoEl = document.getElementById('shipment2BatchCreatedInfo');
	if (!infoEl) return;
	if (!shipment2CreatedBatch) {
		infoEl.textContent = '';
		return;
	}
	var label = shipment2CreatedBatch.public_id ? String(shipment2CreatedBatch.public_id) : (shipment2BatchDraft.batch_label || 'Черновик партии');
	infoEl.textContent = 'Черновик партии: ' + label;
}

function resetShipment2BatchWizardState(){
	shipment2BatchWizardStep = 1;
	shipment2CreatedBatch = null;
	shipment2BatchSources = [];
	shipment2AvailableWarehouses = [];
	shipment2BatchWarehouseLinks = [];
	shipment2BatchSelectedWarehouseLinkId = null;
	shipment2BatchBoxes = [];
	shipment2BatchSelectedBoxId = null;
	shipment2BatchAddedProducts = [];
	stopShipment2CameraStream();
	shipment2BatchRequestedWarehouseCount = 0;
	shipment2BatchDraft = {
		source_id: null,
		source_name: '',
		business_id: null,
		business_name: '',
		batch_label: '',
		warehouse_count: 0,
		warehouse_ids: [],
		saved_batch_id: null,
		saved_public_id: '',
		saved_shipment_ids: []
	};
	setShipment2BatchSavedInfo('');
	setShipment2BatchCreatedInfo();
	setShipment2BatchProductError('');
	renderShipment2BatchBoxes();
	renderShipment2BatchProductsList();
	renderShipment2BatchWizard();
}

function setShipment2BatchSavedInfo(message){
	var infoEl = document.getElementById('shipment2BatchSavedInfo');
	if (!infoEl) return;
	infoEl.textContent = message ? String(message) : '';
}

function renderShipment2BatchWarehousePickers(count){
	var root = document.getElementById('shipment2BatchWarehousePickers');
	if (!root) return;
	if (!Array.isArray(shipment2AvailableWarehouses) || !shipment2AvailableWarehouses.length) {
		root.innerHTML = '<div class="edit-static" style="width:100%;grid-column:1/-1">Нет доступных складов</div>';
		return;
	}
	var placeholderOption = '<option value="">Выберите склад</option>';
	var options = shipment2AvailableWarehouses.map(function(item){
		var name = item && item.name ? formatWarehouseDisplayName(item.name) : ('ID ' + item.id);
		var upperName = String(name || '').toUpperCase();
		return '<option value="' + item.id + '">' + escapeHtml(upperName) + '</option>';
	}).join('');
	var html = [];
	for (var i = 0; i < count; i += 1) {
		var selectedWarehouseId = Array.isArray(shipment2BatchDraft.warehouse_ids) ? shipment2BatchDraft.warehouse_ids[i] : null;
		var selectedValue = selectedWarehouseId ? String(selectedWarehouseId) : '';
		html.push('<div class="edit-field">'
			+ '<label class="edit-label" for="shipment2BatchWarehousePick' + i + '">Склад ' + (i + 1) + '</label>'
			+ '<select id="shipment2BatchWarehousePick' + i + '" class="edit-select shipment2-batch-wh-select">' + placeholderOption + options + '</select>'
			+ '</div>');
	}
	root.innerHTML = html.join('');
	for (var j = 0; j < count; j += 1) {
		var selectEl = document.getElementById('shipment2BatchWarehousePick' + j);
		if (!selectEl) continue;
		var selectedId = Array.isArray(shipment2BatchDraft.warehouse_ids) ? shipment2BatchDraft.warehouse_ids[j] : null;
		selectEl.value = selectedId ? String(selectedId) : '';
	}
}

function getShipment2BatchSelectedWarehouseIds(count){
	var selected = [];
	for (var i = 0; i < count; i += 1) {
		var selectEl = document.getElementById('shipment2BatchWarehousePick' + i);
		var warehouseId = parseInt((selectEl && selectEl.value) ? selectEl.value : '0', 10);
		if (!warehouseId) return null;
		if (selected.indexOf(warehouseId) !== -1) return 'duplicate';
		selected.push(warehouseId);
	}
	return selected;
}

function closeShipment2BatchModal(){
	if (shouldConfirmCloseShipment2BatchModal()) {
		var approved = confirm('Закрыть модалку? Несохранённые данные по созданию партии будут потеряны.');
		if (!approved) return;
	}
	var modal = document.getElementById('shipment2BatchModal');
	if (modal) modal.classList.remove('active');
	closeShipment2CameraModal();
	setShipment2BatchModalError('');
	setShipment2BatchProductError('');
	resetShipment2BatchWizardState();
}

function shouldConfirmCloseShipment2BatchModal(){
	if (shipment2BatchWizardStep === 5 && Array.isArray(shipment2BatchAddedProducts) && shipment2BatchAddedProducts.length) return true;
	if (shipment2BatchWizardStep === 5 && shipment2BatchDraft && shipment2BatchDraft.saved_batch_id) return false;
	if (shipment2BatchWizardStep > 1) return true;
	if (shipment2BatchDraft && shipment2BatchDraft.source_id) return true;
	if (shipment2BatchDraft && shipment2BatchDraft.business_id) return true;
	if (shipment2BatchDraft && Number(shipment2BatchDraft.warehouse_count || 0) > 0) return true;
	if (shipment2BatchDraft && Array.isArray(shipment2BatchDraft.warehouse_ids) && shipment2BatchDraft.warehouse_ids.length) return true;
	return false;
}

async function createShipment2WarehouseFromBatchStep(){
	if (shipment2BatchWizardStep !== 3) return;
	setShipment2BatchModalError('');
	await openShipment2WarehouseModal();
}

async function recreateShipment2DraftShipments(selectedWarehouseIds, sourceId){
	var normalizedSourceId = Number(sourceId);
	if (!normalizedSourceId) {
		throw new Error('Выберите источник для создания поставок');
	}
	var existingIds = Array.isArray(shipment2BatchDraft.saved_shipment_ids) ? shipment2BatchDraft.saved_shipment_ids.slice() : [];
	for (var i = 0; i < existingIds.length; i += 1) {
		var deleteRes = await apiDelete('/api/fbo/shipments/' + existingIds[i]);
		if (!deleteRes || !deleteRes.success) {
			throw new Error((deleteRes && deleteRes.error) || 'Ошибка обновления набора поставок');
		}
	}

	var createdShipmentIds = [];
	for (var j = 0; j < selectedWarehouseIds.length; j += 1) {
		var warehouseId = Number(selectedWarehouseIds[j]);
		if (!warehouseId) {
			continue;
		}
		var shipmentRes = await apiPost('/api/fbo/shipments', {
			source_id: normalizedSourceId,
			batch_id: shipment2BatchDraft.saved_batch_id
		});
		if (!shipmentRes || !shipmentRes.success || !shipmentRes.item || !shipmentRes.item.id) {
			throw new Error((shipmentRes && shipmentRes.error) || 'Ошибка создания поставки');
		}
		var shipmentId = Number(shipmentRes.item.id);
		var addRes = await apiPost('/api/fbo/shipments/' + shipmentId + '/warehouses', { warehouse_id: warehouseId });
		if (!addRes || !addRes.success) {
			throw new Error((addRes && addRes.error) || 'Ошибка привязки склада к поставке');
		}
		createdShipmentIds.push(shipmentId);
	}
	shipment2BatchDraft.saved_shipment_ids = createdShipmentIds;
}

function getWarehouseDisplayLabelById(warehouseId){
	var item = (shipment2AvailableWarehouses || []).find(function(wh){ return Number(wh.id) === Number(warehouseId); });
	if (!item) return 'ID ' + warehouseId;
	var label = item.name ? formatWarehouseDisplayName(item.name) : ('ID ' + warehouseId);
	return String(label || '').toUpperCase();
}

function closeShipment2BatchModalOnOutsideClick(event){
	if (event && event.target && event.target.id === 'shipment2BatchModal') {
		closeShipment2BatchModal();
	}
}

function closeShipment2ShipmentEditProductsModal(){
	closeShipment2CameraModal();
	var modal = document.getElementById('shipment2ShipmentEditProductsModal');
	if (modal) modal.classList.remove('active');
	shipment2EditTargetShipmentId = null;
	shipment2EditWarehouseLinks = [];
	shipment2EditBoxes = [];
	shipment2EditSelectedWarehouseLinkId = null;
	shipment2EditSelectedBoxId = null;
	shipment2EditAddedProducts = [];
	setShipment2EditProductError('');
	renderShipment2EditProductsList();
}

function closeShipment2ShipmentEditProductsModalOnOutsideClick(event){
	if (event && event.target && event.target.id === 'shipment2ShipmentEditProductsModal') {
		closeShipment2ShipmentEditProductsModal();
	}
}

function goBackShipment2ShipmentEditModal(){
	if (Array.isArray(shipment2EditAddedProducts) && shipment2EditAddedProducts.length) {
		var approved = confirm('Вернуться назад? Несохранённые добавленные товары будут потеряны.');
		if (!approved) return;
	}
	closeShipment2ShipmentEditProductsModal();
}

async function openShipment2ShipmentEditModal(shipmentId){
	shipment2EditTargetShipmentId = Number(shipmentId) || null;
	if (!shipment2EditTargetShipmentId) {
		alert('Поставка не найдена');
		return;
	}
	shipment2EditAddedProducts = [];
	setShipment2EditProductError('');
	try {
		await loadShipment2EditProductsContext(shipment2EditTargetShipmentId);
		renderShipment2EditWarehousesGrid();
		renderShipment2EditBoxes();
		renderShipment2EditProductsList();
		var boxNoInputEl = document.getElementById('shipment2EditBoxNoInput');
		if (boxNoInputEl) {
			var selectedBox = (shipment2EditBoxes || []).find(function(item){ return Number(item.id) === Number(shipment2EditSelectedBoxId); });
			boxNoInputEl.value = selectedBox && Number(selectedBox.box_no) > 0 ? String(selectedBox.box_no) : '1';
		}
		var qtyInputEl = document.getElementById('shipment2EditBarcodeQty');
		if (qtyInputEl) qtyInputEl.value = '1';
		var barcodeInputEl = document.getElementById('shipment2EditBarcodeInput');
		if (barcodeInputEl) barcodeInputEl.value = '';
		var modal = document.getElementById('shipment2ShipmentEditProductsModal');
		if (modal) modal.classList.add('active');
		if (barcodeInputEl) barcodeInputEl.focus();
	} catch (error) {
		alert((error && error.message) ? error.message : 'Ошибка загрузки данных поставки');
	}
}

async function submitShipment2ShipmentEditProduct(){
	setShipment2EditProductError('');
	if (!shipment2EditTargetShipmentId) {
		setShipment2EditProductError('Поставка не выбрана');
		return;
	}
	var barcodeInputEl = document.getElementById('shipment2EditBarcodeInput');
	var qtyInputEl = document.getElementById('shipment2EditBarcodeQty');
	var boxNoInputEl = document.getElementById('shipment2EditBoxNoInput');
	var addBtn = document.getElementById('shipment2EditPrimaryBtn');
	var barcode = String((barcodeInputEl && barcodeInputEl.value) ? barcodeInputEl.value : '').trim();
	var qty = parseInt((qtyInputEl && qtyInputEl.value) ? qtyInputEl.value : '1', 10);
	var boxNo = parseInt((boxNoInputEl && boxNoInputEl.value) ? boxNoInputEl.value : '0', 10);

	if (!barcode) {
		setShipment2EditProductError('Введите штрихкод');
		return;
	}
	if (!qty || qty < 1) {
		setShipment2EditProductError('Укажите корректное количество');
		return;
	}
	if (!boxNo || boxNo < 1) {
		setShipment2EditProductError('Укажите корректный номер короба');
		return;
	}
	if (!shipment2EditSelectedWarehouseLinkId) {
		setShipment2EditProductError('Выберите склад');
		return;
	}

	var selectedWarehouseLink = (shipment2EditWarehouseLinks || []).find(function(item){ return Number(item.id) === Number(shipment2EditSelectedWarehouseLinkId); });
	if (!selectedWarehouseLink) {
		setShipment2EditProductError('Склад недоступен для добавления');
		return;
	}

	if (addBtn) addBtn.disabled = true;
	try {
		var selectedBox = ensureLocalBoxesUpTo(
			shipment2EditBoxes,
			shipment2EditSelectedWarehouseLinkId,
			boxNo,
			shipment2EditTargetShipmentId
		);
		shipment2EditSelectedBoxId = Number(selectedBox.id);
		renderShipment2EditBoxes();
		shipment2EditAddedProducts.unshift({
			barcode: barcode,
			qty: qty,
			box_no: Number(boxNo),
			warehouse_name: selectedWarehouseLink.warehouse_name || '',
			shipment_warehouse_id: Number(shipment2EditSelectedWarehouseLinkId),
			shipment_id: Number(shipment2EditTargetShipmentId)
		});
		if (shipment2EditAddedProducts.length > 30) shipment2EditAddedProducts = shipment2EditAddedProducts.slice(0, 30);
		renderShipment2EditProductsList();
		if (barcodeInputEl) {
			barcodeInputEl.value = '';
			barcodeInputEl.focus();
		}
		if (qtyInputEl) qtyInputEl.value = '1';
		if (boxNoInputEl) boxNoInputEl.value = String(boxNo);
	} catch (error) {
		setShipment2EditProductError((error && error.message) ? error.message : 'Ошибка добавления товара');
	} finally {
		if (addBtn) addBtn.disabled = false;
	}
}

async function submitShipment2ShipmentEditSaveAndExit(){
	setShipment2EditProductError('');
	if (!shipment2EditTargetShipmentId) {
		setShipment2EditProductError('Поставка не выбрана');
		return;
	}
	if (!Array.isArray(shipment2EditAddedProducts) || !shipment2EditAddedProducts.length) {
		var emptyConfirmed = confirm('Товары не добавлены. Сохранить и выйти без изменений?');
		if (!emptyConfirmed) return;
		closeShipment2ShipmentEditProductsModal();
		return;
	}
	var confirmed = confirm('Сохранить и выйти? Все добавленные товары будут записаны в базу данных.');
	if (!confirmed) return;

	var addBtn = document.getElementById('shipment2EditPrimaryBtn');
	var saveBtn = document.getElementById('shipment2EditSaveExitBtn');
	var backBtn = document.getElementById('shipment2EditBackBtn');
	if (addBtn) addBtn.disabled = true;
	if (saveBtn) saveBtn.disabled = true;
	if (backBtn) backBtn.disabled = true;

	try {
		for (var i = 0; i < shipment2EditAddedProducts.length; i += 1) {
			var item = shipment2EditAddedProducts[i];
			if (!item || !item.shipment_warehouse_id || !item.shipment_id) continue;
			var box = await ensureShipment2EditBoxByNumber(Number(item.shipment_warehouse_id), Number(item.box_no || 0));
			for (var scanIndex = 0; scanIndex < Number(item.qty || 0); scanIndex += 1) {
				var scanRes = await apiPost('/api/fbo/scans', {
					shipment_id: Number(item.shipment_id),
					box_id: Number(box.id),
					barcode: String(item.barcode || '')
				});
				if (!scanRes || !scanRes.success) {
					throw new Error((scanRes && scanRes.error) || 'Ошибка сохранения товаров');
				}
			}
		}

		shipment2EditAddedProducts = [];
		renderShipment2EditProductsList();
		closeShipment2ShipmentEditProductsModal();
		await loadShipments2();
	} catch (error) {
		setShipment2EditProductError((error && error.message) ? error.message : 'Ошибка сохранения данных в БД');
	} finally {
		if (addBtn) addBtn.disabled = false;
		if (saveBtn) saveBtn.disabled = false;
		if (backBtn) backBtn.disabled = false;
	}
}

async function openShipment2BatchModal(){
	var createBtn = document.getElementById('shipment2BatchPrimaryBtn');
	var sourceEl = document.getElementById('shipment2BatchSourceSelect');
	var selectEl = document.getElementById('shipment2BatchBusinessSelect');
	resetShipment2BatchWizardState();
	if (sourceEl) {
		sourceEl.innerHTML = '<option value="">Загрузка источников...</option>';
		sourceEl.disabled = true;
	}
	if (selectEl) {
		selectEl.innerHTML = '<option value="">Загрузка магазинов...</option>';
		selectEl.disabled = true;
	}
	if (createBtn) createBtn.disabled = true;
	setShipment2BatchModalError('');

	var sourcesRes = await apiGet('/api/fbo/sources');
	shipment2BatchSources = (sourcesRes && sourcesRes.success && Array.isArray(sourcesRes.items)) ? sourcesRes.items : [];
	var businessesRes = await apiGet('/api/fbo/businesses');
	shipment2BatchBusinesses = (businessesRes && businessesRes.success && Array.isArray(businessesRes.items)) ? businessesRes.items : [];

	fillShipment2BatchSourceSelect(shipment2BatchSources);
	fillShipment2BatchBusinessSelect(shipment2BatchBusinesses);
	if (!shipment2BatchSources.length) {
		setShipment2BatchModalError('Нет активных источников для создания партии');
	}
	if (!shipment2BatchBusinesses.length) {
		setShipment2BatchModalError('Нет активных магазинов для создания партии');
	}
	if (createBtn) createBtn.disabled = !(shipment2BatchSources.length && shipment2BatchBusinesses.length);
	var modal = document.getElementById('shipment2BatchModal');
	if (modal) modal.classList.add('active');
}

function goBackShipment2BatchStep(){
	setShipment2BatchModalError('');
	if (shipment2BatchWizardStep <= 1) return;
	if (shipment2BatchWizardStep === 5) {
		var shouldGoBack = confirm('Вернуться назад? Несохранённые добавленные товары будут потеряны.');
		if (!shouldGoBack) return;
		shipment2BatchAddedProducts = [];
		renderShipment2BatchProductsList();
		setShipment2BatchProductError('');
		shipment2BatchWizardStep = 4;
		renderShipment2BatchWizard();
		return;
	}
	if (shipment2BatchWizardStep === 4) {
		shipment2BatchWizardStep = 3;
		setShipment2BatchProductError('');
		renderShipment2BatchWizard();
		return;
	}
	shipment2BatchWizardStep -= 1;
	renderShipment2BatchWizard();
}

async function submitShipment2BatchCreate(){
	var primaryBtn = document.getElementById('shipment2BatchPrimaryBtn');
	setShipment2BatchModalError('');

	if (shipment2BatchWizardStep === 1) {
		var sourceSelectEl = document.getElementById('shipment2BatchSourceSelect');
		var sourceId = parseInt((sourceSelectEl && sourceSelectEl.value) ? sourceSelectEl.value : '0', 10);
		if (!sourceId) {
			setShipment2BatchModalError('Выберите источник из списка');
			return;
		}
		var selectedSource = (shipment2BatchSources || []).find(function(item){ return Number(item.id) === Number(sourceId); });
		var sourceName = selectedSource && selectedSource.name ? String(selectedSource.name) : ('ID ' + sourceId);
		shipment2BatchDraft.source_id = sourceId;
		shipment2BatchDraft.source_name = sourceName;
		shipment2BatchWizardStep = 2;
		renderShipment2BatchWizard();
		return;
	}

	if (shipment2BatchWizardStep === 2) {
		var selectEl = document.getElementById('shipment2BatchBusinessSelect');
		var businessId = parseInt((selectEl && selectEl.value) ? selectEl.value : '0', 10);
		if (!businessId) {
			setShipment2BatchModalError('Выберите магазин из списка');
			return;
		}
		var selectedBusiness = (shipment2BatchBusinesses || []).find(function(item){ return Number(item.id) === Number(businessId); });
		var businessName = selectedBusiness && selectedBusiness.company_name ? String(selectedBusiness.company_name) : ('ID ' + businessId);
		shipment2BatchDraft.business_id = businessId;
		shipment2BatchDraft.business_name = businessName;
		shipment2BatchDraft.batch_label = businessName + ' - ЧЕРНОВИК';
		shipment2CreatedBatch = { public_id: shipment2BatchDraft.batch_label };
		setShipment2BatchCreatedInfo();

		if (primaryBtn) primaryBtn.disabled = true;
		var warehousesRes = await apiGet('/api/fbo/warehouses');
		shipment2AvailableWarehouses = (warehousesRes && warehousesRes.success && Array.isArray(warehousesRes.items)) ? warehousesRes.items : [];
		var countInput = document.getElementById('shipment2BatchWarehouseCount');
		if (countInput) {
			countInput.value = String(shipment2BatchDraft.warehouse_count || 0);
			countInput.disabled = !shipment2AvailableWarehouses.length;
		}
		setShipment2BatchWarehouseCountHint();
		if (!shipment2AvailableWarehouses.length) {
			setShipment2BatchModalError('Нет доступных складов для выбора на следующих этапах');
		}
		shipment2BatchWizardStep = 3;
		renderShipment2BatchWizard();
		if (primaryBtn) primaryBtn.disabled = false;
		return;
	}

	if (shipment2BatchWizardStep === 3) {
		var warehousesCountEl = document.getElementById('shipment2BatchWarehouseCount');
		var selectedCountRaw = (warehousesCountEl && warehousesCountEl.value) ? warehousesCountEl.value : '';
		var selectedCount = parseInt(String(selectedCountRaw).trim(), 10);
		var maxCount = Array.isArray(shipment2AvailableWarehouses) ? shipment2AvailableWarehouses.length : 0;
		if (!selectedCount) {
			setShipment2BatchModalError('Введите количество складов');
			return;
		}
		if (selectedCount < 1 || selectedCount > maxCount) {
			setShipment2BatchModalError('Количество должно быть от 1 до ' + maxCount);
			return;
		}

		shipment2BatchRequestedWarehouseCount = selectedCount;
		shipment2BatchDraft.warehouse_count = selectedCount;
		renderShipment2BatchWarehousePickers(selectedCount);
		shipment2BatchWizardStep = 4;
		renderShipment2BatchWizard();
		return;
	}

	if (shipment2BatchWizardStep === 4) {
		var selectedWarehouseIds = getShipment2BatchSelectedWarehouseIds(shipment2BatchRequestedWarehouseCount);
		if (!selectedWarehouseIds) {
			setShipment2BatchModalError('Выберите склады во всех полях');
			return;
		}
		if (selectedWarehouseIds === 'duplicate') {
			setShipment2BatchModalError('Нельзя выбирать один и тот же склад несколько раз');
			return;
		}
		shipment2BatchDraft.warehouse_ids = selectedWarehouseIds.slice();
		if (primaryBtn) primaryBtn.disabled = true;
		try {
			if (!shipment2BatchDraft.saved_batch_id) {
				var createResult = await apiPost('/api/fbo/batches', { business_id: shipment2BatchDraft.business_id });
				if (!createResult || !createResult.success || !createResult.item || !createResult.item.id) {
					throw new Error((createResult && createResult.error) || 'Ошибка создания партии');
				}
				shipment2BatchDraft.saved_batch_id = Number(createResult.item.id);
				shipment2BatchDraft.saved_public_id = createResult.item.public_id ? String(createResult.item.public_id) : '';
			}

			await recreateShipment2DraftShipments(selectedWarehouseIds, shipment2BatchDraft.source_id);

			await ensureShipment2BatchBoxesReady();
			renderShipment2BatchWarehouses();
			renderShipment2BatchBoxes();
			setShipment2BatchProductError('');
			renderShipment2BatchProductsList();
			await loadShipments2();
			shipment2BatchWizardStep = 5;
			renderShipment2BatchWizard();
		} catch (saveError) {
			setShipment2BatchModalError((saveError && saveError.message) ? saveError.message : 'Ошибка сохранения');
		} finally {
			if (primaryBtn) primaryBtn.disabled = false;
		}
		return;
	}

	if (shipment2BatchWizardStep === 5) {
		setShipment2BatchModalError('');
		setShipment2BatchProductError('');
		var barcodeInputEl = document.getElementById('shipment2BatchBarcodeInput');
		var qtyInputEl = document.getElementById('shipment2BatchBarcodeQty');
		var boxNoInputEl = document.getElementById('shipment2BatchBoxNoInput');
		var barcode = String((barcodeInputEl && barcodeInputEl.value) ? barcodeInputEl.value : '').trim();
		var qty = parseInt((qtyInputEl && qtyInputEl.value) ? qtyInputEl.value : '1', 10);
		var boxNo = parseInt((boxNoInputEl && boxNoInputEl.value) ? boxNoInputEl.value : '0', 10);
		if (!barcode) {
			setShipment2BatchProductError('Введите штрихкод');
			return;
		}
		if (!qty || qty < 1) {
			setShipment2BatchProductError('Укажите корректное количество');
			return;
		}
		if (!boxNo || boxNo < 1) {
			setShipment2BatchProductError('Укажите корректный номер короба');
			return;
		}
		if (!shipment2BatchSelectedWarehouseLinkId) {
			setShipment2BatchProductError('Выберите склад');
			return;
		}
		var selectedWarehouseLink = (shipment2BatchWarehouseLinks || []).find(function(item){ return Number(item.id) === Number(shipment2BatchSelectedWarehouseLinkId); });
		if (!selectedWarehouseLink || !selectedWarehouseLink.shipment_id) {
			setShipment2BatchProductError('Склад недоступен для добавления');
			return;
		}
		if (primaryBtn) primaryBtn.disabled = true;
		try {
			var selectedBox = ensureLocalBoxesUpTo(
				shipment2BatchBoxes,
				shipment2BatchSelectedWarehouseLinkId,
				boxNo,
				selectedWarehouseLink.shipment_id
			);
			shipment2BatchSelectedBoxId = Number(selectedBox.id);
			renderShipment2BatchBoxes();
			shipment2BatchAddedProducts.unshift({
				barcode: barcode,
				qty: qty,
				box_no: Number(boxNo),
				warehouse_name: selectedWarehouseLink.warehouse_name || '',
				shipment_warehouse_id: Number(shipment2BatchSelectedWarehouseLinkId),
				shipment_id: Number(selectedWarehouseLink.shipment_id)
			});
			if (shipment2BatchAddedProducts.length > 30) shipment2BatchAddedProducts = shipment2BatchAddedProducts.slice(0, 30);
			renderShipment2BatchProductsList();
			if (barcodeInputEl) {
				barcodeInputEl.value = '';
				barcodeInputEl.focus();
			}
			if (qtyInputEl) qtyInputEl.value = '1';
			if (boxNoInputEl) boxNoInputEl.value = String(boxNo);
		} catch (addError) {
			setShipment2BatchProductError((addError && addError.message) ? addError.message : 'Ошибка добавления товара');
		} finally {
			if (primaryBtn) primaryBtn.disabled = false;
		}
		return;
	}
}

async function submitShipment2BatchSaveAndExit(){
	if (shipment2BatchWizardStep !== 5) return;
	setShipment2BatchModalError('');
	setShipment2BatchProductError('');
	if (!shipment2BatchDraft || !shipment2BatchDraft.saved_batch_id) {
		setShipment2BatchModalError('Сначала сохраните шаг выбора складов');
		return;
	}
	if (!Array.isArray(shipment2BatchAddedProducts) || !shipment2BatchAddedProducts.length) {
		var confirmEmpty = confirm('Товары не добавлены. Сохранить и выйти без товаров?');
		if (!confirmEmpty) return;
		closeShipment2BatchModal();
		await loadShipments2();
		return;
	}
	var confirmed = confirm('Сохранить и выйти? Все добавленные товары будут записаны в базу данных.');
	if (!confirmed) return;

	var addBtn = document.getElementById('shipment2BatchPrimaryBtn');
	var saveBtn = document.getElementById('shipment2BatchSaveExitBtn');
	var backBtn = document.getElementById('shipment2BatchBackBtn');
	if (addBtn) addBtn.disabled = true;
	if (saveBtn) saveBtn.disabled = true;
	if (backBtn) backBtn.disabled = true;

	try {
		for (var i = 0; i < shipment2BatchAddedProducts.length; i += 1) {
			var item = shipment2BatchAddedProducts[i];
			if (!item || !item.shipment_warehouse_id || !item.shipment_id) continue;
			var box = await ensureShipment2BatchBoxByNumber(Number(item.shipment_warehouse_id), Number(item.box_no || 0));
			for (var scanIndex = 0; scanIndex < Number(item.qty || 0); scanIndex += 1) {
				var scanRes = await apiPost('/api/fbo/scans', {
					shipment_id: Number(item.shipment_id),
					box_id: Number(box.id),
					barcode: String(item.barcode || '')
				});
				if (!scanRes || !scanRes.success) {
					throw new Error((scanRes && scanRes.error) || 'Ошибка сохранения товаров');
				}
			}
		}

		shipment2BatchAddedProducts = [];
		renderShipment2BatchProductsList();
		closeShipment2BatchModal();
		await loadShipments2();
	} catch (error) {
		setShipment2BatchModalError((error && error.message) ? error.message : 'Ошибка сохранения данных в БД');
	} finally {
		if (addBtn) addBtn.disabled = false;
		if (saveBtn) saveBtn.disabled = false;
		if (backBtn) backBtn.disabled = false;
	}
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
	setElementText('shipment2EditSource', shipment && shipment.source_name ? String(shipment.source_name) : '—');
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
		updateShipment2SelectedCount();
	});
}

function closeShipment2FilterDropdowns(){
	var batchDrop = document.getElementById('shipment2BatchFilterDropdown');
	var sourceDrop = document.getElementById('shipment2SourceFilterDropdown');
	if (batchDrop) batchDrop.classList.remove('open');
	if (sourceDrop) sourceDrop.classList.remove('open');
}

function toggleShipment2FilterDropdown(dropdownId){
	var dropdown = document.getElementById(dropdownId);
	if (!dropdown) return;
	var shouldOpen = !dropdown.classList.contains('open');
	closeShipment2FilterDropdowns();
	if (shouldOpen) dropdown.classList.add('open');
}

function getShipment2BatchFilterOptions(){
	var unique = {};
	(shipments2Items || []).forEach(function(item){
		var name = getShipment2SourceName(item);
		if (!name || name === '—') return;
		unique[name] = true;
	});
	return Object.keys(unique).sort(function(a, b){ return a.localeCompare(b, 'ru'); });
}

function getShipment2SourceFilterOptions(){
	var unique = {};
	(shipments2Items || []).forEach(function(item){
		var name = getShipment2BatchStoreName(item);
		if (!name || name === '—') return;
		unique[name] = true;
	});
	return Object.keys(unique).sort(function(a, b){ return a.localeCompare(b, 'ru'); });
}

function renderShipment2BatchFilter(){
	var button = document.getElementById('shipment2BatchFilterBtn');
	var dropdown = document.getElementById('shipment2BatchFilterDropdown');
	if (!button || !dropdown) return;
	var options = getShipment2BatchFilterOptions();
	if (shipment2BatchFilterValue !== '__all__' && options.indexOf(shipment2BatchFilterValue) === -1) {
		shipment2BatchFilterValue = '__all__';
	}
	button.textContent = shipment2BatchFilterValue === '__all__' ? 'Партия: Все' : ('Партия: ' + shipment2BatchFilterValue);
	var html = '<div class="filter-item' + (shipment2BatchFilterValue === '__all__' ? ' active' : '') + '" data-value="__all__">Все партии</div>';
	html += options.map(function(name){
		var activeClass = shipment2BatchFilterValue === name ? ' active' : '';
		return '<div class="filter-item' + activeClass + '" data-value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</div>';
	}).join('');
	dropdown.innerHTML = html;
	dropdown.querySelectorAll('.filter-item').forEach(function(itemEl){
		itemEl.addEventListener('click', function(){
			shipment2BatchFilterValue = itemEl.getAttribute('data-value') || '__all__';
			closeShipment2FilterDropdowns();
			renderShipment2BatchFilter();
			renderShipments2Table();
		});
	});
}

function renderShipment2SourceFilter(){
	var button = document.getElementById('shipment2SourceFilterBtn');
	var dropdown = document.getElementById('shipment2SourceFilterDropdown');
	if (!button || !dropdown) return;
	var options = getShipment2SourceFilterOptions();
	if (shipment2SourceFilterValue !== '__all__' && options.indexOf(shipment2SourceFilterValue) === -1) {
		shipment2SourceFilterValue = '__all__';
	}
	button.textContent = shipment2SourceFilterValue === '__all__' ? 'Поставка: Все' : ('Поставка: ' + shipment2SourceFilterValue);
	var html = '<div class="filter-item' + (shipment2SourceFilterValue === '__all__' ? ' active' : '') + '" data-value="__all__">Все поставки</div>';
	html += options.map(function(name){
		var activeClass = shipment2SourceFilterValue === name ? ' active' : '';
		return '<div class="filter-item' + activeClass + '" data-value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</div>';
	}).join('');
	dropdown.innerHTML = html;
	dropdown.querySelectorAll('.filter-item').forEach(function(itemEl){
		itemEl.addEventListener('click', function(){
			shipment2SourceFilterValue = itemEl.getAttribute('data-value') || '__all__';
			closeShipment2FilterDropdowns();
			renderShipment2SourceFilter();
			renderShipments2Table();
		});
	});
}

function getFilteredShipments2Items(){
	return (shipments2Items || []).filter(function(item){
		if (shipment2BatchFilterValue !== '__all__') {
			var sourceName = getShipment2SourceName(item);
			if (sourceName !== shipment2BatchFilterValue) return false;
		}
		if (shipment2SourceFilterValue !== '__all__') {
			var storeName = getShipment2BatchStoreName(item);
			if (storeName !== shipment2SourceFilterValue) return false;
		}
		return true;
	});
}

function getSelectedShipment2Ids(){
	return Array.from(document.querySelectorAll('.row-check:checked')).map(function(el){
		return Number(el.getAttribute('data-id') || 0);
	}).filter(function(id){ return id > 0; });
}

function updateShipment2SelectedCount(){
	var selectedIds = getSelectedShipment2Ids();
	var label = document.getElementById('shipments2SelectedCount');
	if (label) label.textContent = 'Выбрано: ' + selectedIds.length;
	var deleteBtn = document.getElementById('btnDeleteSelectedShipment2');
	if (deleteBtn) deleteBtn.disabled = selectedIds.length === 0;

	var head = document.getElementById('shipments2CheckAll');
	var allRows = document.querySelectorAll('.row-check');
	if (head) {
		if (!allRows.length) {
			head.checked = false;
			head.indeterminate = false;
		} else {
			head.checked = selectedIds.length === allRows.length;
			head.indeterminate = selectedIds.length > 0 && selectedIds.length < allRows.length;
		}
	}
}

function renderShipments2Table(){
	var tbody = document.getElementById('shipments2Body');
	if (!tbody) return;
	var items = getFilteredShipments2Items();
	if (!items.length) {
		var emptyText = (shipments2Items || []).length ? 'Поставок по выбранным фильтрам нет' : 'Поставок нет';
		tbody.innerHTML = '<tr><td colspan="10" class="cash-muted" style="text-align:center;padding:12px">' + emptyText + '</td></tr>';
		updateShipment2SelectedCount();
		return;
	}
	tbody.innerHTML = items.map(function(item){
		var title = escapeHtml(formatDashValue(getShipment2BatchStoreName(item)));
		var status = escapeHtml(formatShipmentStatus(item && item.status));
		var statusClass = getShipmentStatusClass(item && item.status);
		var batch = escapeHtml(formatDashValue(getShipment2SourceName(item)));
		var warehouse = escapeHtml(formatDashValue(formatShipmentWarehouse(item)));
		var boxes = escapeHtml(formatDashCount(item.boxes_count));
		var units = escapeHtml(formatDashCount(item.items_count));
		var date = escapeHtml(formatDashValue(formatDateOnly(item.created_at)));
		var author = escapeHtml(formatDashValue(getShipmentAuthor(item)));
		return '<tr id="shipment2Row' + item.id + '" class="shipment2-row">'
			+ '<td class="check-col"><input class="row-check" type="checkbox" data-id="' + item.id + '" onchange="updateShipment2SelectedCount()" /></td>'
			+ '<td class="meta-col date-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)">' + date + '</td>'
			+ '<td class="meta-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)">' + batch + '</td>'
			+ '<td class="shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)"><span class="shipment-name">' + title + '</span></td>'
			+ '<td class="meta-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)">' + warehouse + '</td>'
			+ '<td class="meta-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)">' + boxes + '</td>'
			+ '<td class="meta-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)">' + units + '</td>'
			+ '<td class="meta-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)"><span class="status-text ' + statusClass + '">' + status + '</span></td>'
			+ '<td class="meta-col shipment2-click-cell" onclick="openShipment2InfoModal(' + item.id + ')" onmouseenter="setShipment2RowHover(' + item.id + ', true)" onmouseleave="setShipment2RowHover(' + item.id + ', false)">' + author + '</td>'
			+ '<td class="actions-cell">'
			+ '<button class="icon-btn" type="button" title="Детали" onclick="event.stopPropagation(); openShipment2Details(' + item.id + ')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.5" /></svg></button>'
			+ '<button class="row-action-btn" type="button" title="Редактировать поставку" onclick="event.stopPropagation(); openShipment2ShipmentEditModal(' + item.id + ')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>'
			+ '<button class="row-action-btn" type="button" title="Удалить" onclick="event.stopPropagation(); deleteShipment2(' + item.id + ')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
			+ '</td>'
			+ '</tr>';
	}).join('');
	updateShipment2SelectedCount();
}

async function deleteSelectedShipments2(){
	var ids = getSelectedShipment2Ids();
	if (!ids.length) {
		alert('Сначала выберите поставки');
		return;
	}
	var approved = confirm('Удалить выбранные поставки: ' + ids.length + ' шт.?');
	if (!approved) return;

	var deleteBtn = document.getElementById('btnDeleteSelectedShipment2');
	if (deleteBtn) deleteBtn.disabled = true;
	var failed = 0;
	for (var i = 0; i < ids.length; i += 1) {
		var response = await apiDelete('/api/fbo/shipments/' + ids[i]);
		if (!response || !response.success) failed += 1;
	}
	if (failed) {
		alert('Не удалось удалить ' + failed + ' из ' + ids.length + ' поставок');
	}
	await loadShipments2();
}

function setShipment2RowHover(rowId, active){
	var row = document.getElementById('shipment2Row' + rowId);
	if (!row) return;
	row.classList.toggle('active-hover', !!active);
}

async function loadShipments2(){
	var data = await apiGet('/api/fbo/shipments');
	var items = (data && data.success && Array.isArray(data.items)) ? data.items : [];
	shipments2Items = items;
	renderShipment2BatchFilter();
	renderShipment2SourceFilter();
	renderShipments2Table();
}

async function deleteShipment2(id){
	if (!confirm('Удалить поставку?')) return;
	var d = await apiDelete('/api/fbo/shipments/' + id);
	if (!d || !d.success) return alert((d && d.error) || 'Ошибка удаления');
	await loadShipments2();
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

async function openShipment2InfoModal(id){
	var shipment = (shipments2Items || []).find(function(item){ return Number(item.id) === Number(id); });
	if (!shipment) {
		alert('Поставка не найдена');
		return;
	}
	await loadShipment2EditWarehouses(id);
	shipment2EditingId = Number(id);
	fillShipment2EditReadonly(shipment);
	renderShipment2EditWarehouses();
	var modal = document.getElementById('shipment2EditModal');
	if (modal) modal.classList.add('active');
}

function openShipment2Details(id){
	window.location.href = '/shipments';
}

window.deleteShipment2 = deleteShipment2;
window.openShipment2Details = openShipment2Details;
window.openShipment2InfoModal = openShipment2InfoModal;
window.setShipment2RowHover = setShipment2RowHover;
window.closeShipment2EditModal = closeShipment2EditModal;
window.closeShipment2EditModalOnOutsideClick = closeShipment2EditModalOnOutsideClick;
window.createShipment2Batch = createShipment2Batch;
window.openShipment2BatchModal = openShipment2BatchModal;
window.closeShipment2BatchModal = closeShipment2BatchModal;
window.closeShipment2BatchModalOnOutsideClick = closeShipment2BatchModalOnOutsideClick;
window.createShipment2WarehouseFromBatchStep = createShipment2WarehouseFromBatchStep;
window.goBackShipment2BatchStep = goBackShipment2BatchStep;
window.submitShipment2BatchCreate = submitShipment2BatchCreate;
window.submitShipment2BatchSaveAndExit = submitShipment2BatchSaveAndExit;
window.createShipment2Warehouse = createShipment2Warehouse;
window.createShipment2Source = createShipment2Source;
window.openShipment2WarehouseModal = openShipment2WarehouseModal;
window.closeShipment2WarehouseModal = closeShipment2WarehouseModal;
window.closeShipment2WarehouseModalOnOutsideClick = closeShipment2WarehouseModalOnOutsideClick;
window.submitShipment2WarehouseCreate = submitShipment2WarehouseCreate;
window.deleteShipment2Warehouse = deleteShipment2Warehouse;
window.openShipment2SourceModal = openShipment2SourceModal;
window.closeShipment2SourceModal = closeShipment2SourceModal;
window.closeShipment2SourceModalOnOutsideClick = closeShipment2SourceModalOnOutsideClick;
window.submitShipment2SourceCreate = submitShipment2SourceCreate;
window.deleteShipment2Source = deleteShipment2Source;
window.selectShipment2BatchWarehouse = selectShipment2BatchWarehouse;
window.selectShipment2BatchBox = selectShipment2BatchBox;
window.openShipment2CameraModal = openShipment2CameraModal;
window.closeShipment2CameraModal = closeShipment2CameraModal;
window.closeShipment2CameraModalOnOutsideClick = closeShipment2CameraModalOnOutsideClick;
window.openShipment2ShipmentEditModal = openShipment2ShipmentEditModal;
window.closeShipment2ShipmentEditProductsModal = closeShipment2ShipmentEditProductsModal;
window.closeShipment2ShipmentEditProductsModalOnOutsideClick = closeShipment2ShipmentEditProductsModalOnOutsideClick;
window.submitShipment2ShipmentEditProduct = submitShipment2ShipmentEditProduct;
window.submitShipment2ShipmentEditSaveAndExit = submitShipment2ShipmentEditSaveAndExit;
window.goBackShipment2ShipmentEditModal = goBackShipment2ShipmentEditModal;
window.selectShipment2EditWarehouse = selectShipment2EditWarehouse;
window.selectShipment2EditBox = selectShipment2EditBox;
window.updateShipment2SelectedCount = updateShipment2SelectedCount;
window.deleteSelectedShipments2 = deleteSelectedShipments2;

document.getElementById('btnCreateShipment2Batch').addEventListener('click', function(){ createShipment2Batch(); });
document.getElementById('btnCreateShipment2Warehouse').addEventListener('click', function(){ createShipment2Warehouse(); });
document.getElementById('btnCreateShipment2Source').addEventListener('click', function(){ createShipment2Source(); });
document.getElementById('btnDeleteSelectedShipment2').addEventListener('click', function(){ deleteSelectedShipments2(); });
document.getElementById('shipment2BatchFilterBtn').addEventListener('click', function(event){ event.stopPropagation(); toggleShipment2FilterDropdown('shipment2BatchFilterDropdown'); });
document.getElementById('shipment2SourceFilterBtn').addEventListener('click', function(event){ event.stopPropagation(); toggleShipment2FilterDropdown('shipment2SourceFilterDropdown'); });
document.getElementById('shipment2WarehouseNameInput').addEventListener('keydown', function(event){ if (event.key === 'Enter') { event.preventDefault(); submitShipment2WarehouseCreate(); } });
document.getElementById('shipment2SourceNameInput').addEventListener('keydown', function(event){ if (event.key === 'Enter') { event.preventDefault(); submitShipment2SourceCreate(); } });
document.getElementById('shipment2BatchBoxNoInput').addEventListener('input', function(event){
	var boxNo = parseInt(String(event && event.target && event.target.value ? event.target.value : '').trim(), 10);
	if (!boxNo || !shipment2BatchSelectedWarehouseLinkId) return;
	var selectedWarehouseLink = (shipment2BatchWarehouseLinks || []).find(function(item){ return Number(item.id) === Number(shipment2BatchSelectedWarehouseLinkId); });
	if (!selectedWarehouseLink) return;
	var ensured = ensureLocalBoxesUpTo(shipment2BatchBoxes, shipment2BatchSelectedWarehouseLinkId, boxNo, selectedWarehouseLink.shipment_id);
	shipment2BatchSelectedBoxId = Number(ensured.id);
	renderShipment2BatchBoxes();
});
document.getElementById('shipment2EditBoxNoInput').addEventListener('input', function(event){
	var boxNo = parseInt(String(event && event.target && event.target.value ? event.target.value : '').trim(), 10);
	if (!boxNo || !shipment2EditSelectedWarehouseLinkId) return;
	var ensured = ensureLocalBoxesUpTo(shipment2EditBoxes, shipment2EditSelectedWarehouseLinkId, boxNo, shipment2EditTargetShipmentId);
	shipment2EditSelectedBoxId = Number(ensured.id);
	renderShipment2EditBoxes();
});
document.addEventListener('click', function(event){
	if (event && event.target && event.target.closest && event.target.closest('.filter-menu')) return;
	closeShipment2FilterDropdowns();
});
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
