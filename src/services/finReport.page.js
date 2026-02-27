const {
  renderSidebar,
  renderProfileModal,
  renderProfileScript
} = require('./page.shared');

function renderFinReportPage(req, res) {
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
  ${renderSidebar('/fin-report')}
  <main class="main">
    <div class="container">
  <div class="section">
    <div class="section-header">
      <h1>📈 Финансовый отчет</h1>
      <div class="toolbar">
        <button class="api-btn" onclick="openBusinessManager()">🏢 Управление магазинами</button>
        <div id="businessSelector" style="display:flex;gap:10px;align-items:center">
          <span class="selector-label">Магазин:</span>
          <select id="currentBusiness" onchange="switchBusiness()" class="select-control">
            <option value="">Загрузка...</option>
          </select>
        </div>
        <button class="update-btn" onclick="syncWithWB()" title="Принудительная синхронизация с WB API">🔄 Синхронизация с WB</button>
      </div>
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

${renderProfileModal()}

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

${renderProfileScript()}
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
}

module.exports = {
  renderFinReportPage
};
