// Sync Service - Синхронизация данных WB с Supabase
const axios = require('axios');
const supabase = require('./supabase-client');

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

// Логирование начала синхронизации
async function logSyncStart(businessId, syncType) {
  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      business_id: businessId,
      sync_type: syncType,
      status: 'in_progress',
      started_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    console.error(`❌ Ошибка создания лога синхронизации:`, error);
    return null;
  }
  
  return data.id;
}

// Логирование завершения синхронизации
async function logSyncComplete(logId, status, recordsSynced, errorMessage = null) {
  if (!logId) return;
  
  const { error } = await supabase
    .from('sync_logs')
    .update({
      status,
      records_synced: recordsSynced,
      error_message: errorMessage,
      completed_at: new Date().toISOString()
    })
    .eq('id', logId);
  
  if (error) {
    console.error(`❌ Ошибка обновления лога синхронизации:`, error);
  }
}

// Получить дату 90 дней назад (максимальный период для sales/orders)
function getMaxDateRange() {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 90);
  
  return {
    dateFrom: dateFrom.toISOString().split('T')[0],
    dateTo: dateTo.toISOString().split('T')[0]
  };
}

// Получить период за ВСЁ ВРЕМЯ для финансового отчёта (reportDetailByPeriod не имеет ограничений)
function getFullDateRange() {
  const dateTo = new Date();
  // Начинаем с 2019 года (когда WB начал вести статистику)
  const dateFrom = new Date('2019-01-01');
  
  return {
    dateFrom: dateFrom.toISOString().split('T')[0],
    dateTo: dateTo.toISOString().split('T')[0]
  };
}

// ==================== СИНХРОНИЗАЦИЯ ПРОДАЖ ====================

async function syncSales(businessId, wbApiKey) {
  console.log(`📊 Начинаем синхронизацию продаж для магазина ${businessId}...`);
  const logId = await logSyncStart(businessId, 'sales');
  
  try {
    const { dateFrom, dateTo } = getMaxDateRange();
    const flag = 1; // 0 = не финальный, 1 = финальный
    
    const url = `https://statistics-api.wildberries.ru/api/v1/supplier/sales?dateFrom=${dateFrom}&flag=${flag}`;
    
    const response = await axios.get(url, {
      headers: { 'Authorization': wbApiKey },
      timeout: 60000
    });
    
    const sales = response.data || [];
    console.log(`✅ Получено ${sales.length} записей продаж из WB API`);
    
    if (sales.length === 0) {
      await logSyncComplete(logId, 'success', 0);
      return { success: true, count: 0 };
    }
    
    // Подготовка данных для вставки
    const salesData = sales.map(sale => ({
      business_id: businessId,
      sale_dt: sale.date || sale.lastChangeDate,
      last_change_dt: sale.lastChangeDate,
      supplier_article: sale.supplierArticle,
      tech_size: sale.techSize,
      barcode: sale.barcode,
      total_price: parseFloat(sale.totalPrice) || 0,
      discount_percent: parseInt(sale.discountPercent) || 0,
      is_supply: sale.isSupply || false,
      is_realization: sale.isRealization || false,
      promo_code_discount: parseFloat(sale.promoCodeDiscount) || 0,
      warehouse_name: sale.warehouseName,
      country_name: sale.countryName,
      oblast_okrug_name: sale.oblastOkrugName,
      region_name: sale.regionName,
      income_id: sale.incomeID,
      sale_id: sale.saleID || sale.gNumber, // уникальный идентификатор продажи
      odid: sale.odid,
      spp: parseFloat(sale.spp) || 0,
      for_pay: parseFloat(sale.forPay) || 0,
      finished_price: parseFloat(sale.finishedPrice) || 0,
      price_with_disc: parseFloat(sale.priceWithDisc) || 0,
      nm_id: sale.nmId,
      subject: sale.subject,
      category: sale.category,
      brand: sale.brand,
      is_storno: sale.isStorno || 0,
      g_number: sale.gNumber,
      sticker: sale.sticker,
      srid: sale.srid
    }));
    
    // Вставка данных батчами (по 500 записей)
    const batchSize = 500;
    let insertedCount = 0;
    
    for (let i = 0; i < salesData.length; i += batchSize) {
      const batch = salesData.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('wb_sales')
        .upsert(batch, {
          onConflict: 'business_id,sale_id',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error(`❌ Ошибка вставки продаж (batch ${i}-${i + batch.length}):`, error);
      } else {
        insertedCount += batch.length;
        console.log(`✅ Вставлено ${insertedCount}/${salesData.length} продаж`);
      }
    }
    
    await logSyncComplete(logId, 'success', insertedCount);
    console.log(`🎉 Синхронизация продаж завершена: ${insertedCount} записей`);
    
    return { success: true, count: insertedCount };
    
  } catch (error) {
    console.error(`❌ Ошибка синхронизации продаж:`, error.message);
    await logSyncComplete(logId, 'error', 0, error.message);
    return { success: false, error: error.message };
  }
}

// ==================== СИНХРОНИЗАЦИЯ ЗАКАЗОВ ====================

async function syncOrders(businessId, wbApiKey) {
  console.log(`📦 Начинаем синхронизацию заказов для магазина ${businessId}...`);
  const logId = await logSyncStart(businessId, 'orders');
  
  try {
    const { dateFrom, dateTo } = getMaxDateRange();
    const flag = 1; // 0 = не финальный, 1 = финальный
    
    const url = `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=${dateFrom}&flag=${flag}`;
    
    const response = await axios.get(url, {
      headers: { 'Authorization': wbApiKey },
      timeout: 60000
    });
    
    const orders = response.data || [];
    console.log(`✅ Получено ${orders.length} заказов из WB API`);
    
    if (orders.length === 0) {
      await logSyncComplete(logId, 'success', 0);
      return { success: true, count: 0 };
    }
    
    // Подготовка данных для вставки
    const ordersData = orders.map(order => ({
      business_id: businessId,
      order_dt: order.date || order.lastChangeDate,
      last_change_dt: order.lastChangeDate,
      supplier_article: order.supplierArticle,
      tech_size: order.techSize,
      barcode: order.barcode,
      total_price: parseFloat(order.totalPrice) || 0,
      discount_percent: parseInt(order.discountPercent) || 0,
      warehouse_name: order.warehouseName,
      oblast: order.oblast,
      income_id: order.incomeID,
      odid: order.odid,
      nm_id: order.nmId,
      subject: order.subject,
      category: order.category,
      brand: order.brand,
      is_cancel: order.isCancel || false,
      cancel_dt: order.cancel_dt,
      g_number: order.gNumber,
      sticker: order.sticker,
      srid: order.srid
    }));
    
    // Вставка данных батчами
    const batchSize = 500;
    let insertedCount = 0;
    
    for (let i = 0; i < ordersData.length; i += batchSize) {
      const batch = ordersData.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('wb_orders')
        .upsert(batch, {
          onConflict: 'business_id,odid',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error(`❌ Ошибка вставки заказов (batch ${i}-${i + batch.length}):`, error);
      } else {
        insertedCount += batch.length;
        console.log(`✅ Вставлено ${insertedCount}/${ordersData.length} заказов`);
      }
    }
    
    await logSyncComplete(logId, 'success', insertedCount);
    console.log(`🎉 Синхронизация заказов завершена: ${insertedCount} записей`);
    
    return { success: true, count: insertedCount };
    
  } catch (error) {
    console.error(`❌ Ошибка синхронизации заказов:`, error.message);
    await logSyncComplete(logId, 'error', 0, error.message);
    return { success: false, error: error.message };
  }
}

// ==================== СИНХРОНИЗАЦИЯ ФИНАНСОВОГО ОТЧЁТА ====================

async function syncFinancialReport(businessId, wbApiKey) {
  console.log(`💰 Начинаем синхронизацию финансового отчёта для магазина ${businessId}...`);
  const logId = await logSyncStart(businessId, 'financial');
  
  try {
    // Используем getFullDateRange() для получения ВСЕЙ истории (с 2019 года)
    const { dateFrom, dateTo } = getFullDateRange();
    console.log(`📅 Период загрузки: ${dateFrom} — ${dateTo}`);
    const limit = 100000;
    const rrdid = 0;
    
    const url = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=${limit}&rrdid=${rrdid}`;
    
    const response = await axios.get(url, {
      headers: { 'Authorization': wbApiKey },
      timeout: 120000
    });
    
    const reports = response.data || [];
    console.log(`✅ Получено ${reports.length} записей финансового отчёта из WB API`);
    
    if (reports.length === 0) {
      await logSyncComplete(logId, 'success', 0);
      return { success: true, count: 0 };
    }
    
    // Подготовка данных для вставки (82 колонки)
    const reportsData = reports.map(report => ({
      business_id: businessId,
      realizationreport_id: report.realizationreport_id,
      date_from: report.date_from,
      date_to: report.date_to,
      create_dt: report.create_dt,
      currency_name: report.currency_name,
      suppliercontract_code: report.suppliercontract_code,
      rrd_id: report.rrd_id,
      gi_id: report.gi_id,
      subject_name: report.subject_name,
      nm_id: report.nm_id,
      brand_name: report.brand_name,
      sa_name: report.sa_name,
      ts_name: report.ts_name,
      barcode: report.barcode,
      doc_type_name: report.doc_type_name,
      quantity: report.quantity,
      retail_price: parseFloat(report.retail_price) || 0,
      retail_amount: parseFloat(report.retail_amount) || 0,
      sale_percent: report.sale_percent,
      commission_percent: parseFloat(report.commission_percent) || 0,
      office_name: report.office_name,
      supplier_oper_name: report.supplier_oper_name,
      order_dt: report.order_dt,
      sale_dt: report.sale_dt,
      rr_dt: report.rr_dt,
      shk_id: report.shk_id,
      retail_price_withdisc_rub: parseFloat(report.retail_price_withdisc_rub) || 0,
      delivery_amount: report.delivery_amount,
      return_amount: report.return_amount,
      delivery_rub: parseFloat(report.delivery_rub) || 0,
      gi_box_type_name: report.gi_box_type_name,
      product_discount_for_report: parseFloat(report.product_discount_for_report) || 0,
      supplier_promo: parseFloat(report.supplier_promo) || 0,
      rid: report.rid,
      ppvz_spp_prc: parseFloat(report.ppvz_spp_prc) || 0,
      ppvz_kvw_prc_base: parseFloat(report.ppvz_kvw_prc_base) || 0,
      ppvz_kvw_prc: parseFloat(report.ppvz_kvw_prc) || 0,
      sup_rating_prc_up: parseFloat(report.sup_rating_prc_up) || 0,
      is_kgvp_v2: parseFloat(report.is_kgvp_v2) || 0,
      ppvz_sales_commission: parseFloat(report.ppvz_sales_commission) || 0,
      ppvz_for_pay: parseFloat(report.ppvz_for_pay) || 0,
      ppvz_reward: parseFloat(report.ppvz_reward) || 0,
      acquiring_fee: parseFloat(report.acquiring_fee) || 0,
      acquiring_bank: report.acquiring_bank,
      ppvz_vw: parseFloat(report.ppvz_vw) || 0,
      ppvz_vw_nds: parseFloat(report.ppvz_vw_nds) || 0,
      ppvz_office_id: report.ppvz_office_id,
      ppvz_office_name: report.ppvz_office_name,
      ppvz_supplier_id: report.ppvz_supplier_id,
      ppvz_supplier_name: report.ppvz_supplier_name,
      ppvz_inn: report.ppvz_inn,
      declaration_number: report.declaration_number,
      bonus_type_name: report.bonus_type_name,
      sticker_id: report.sticker_id,
      site_country: report.site_country,
      penalty: parseFloat(report.penalty) || 0,
      additional_payment: parseFloat(report.additional_payment) || 0,
      rebill_logistic_cost: parseFloat(report.rebill_logistic_cost) || 0,
      rebill_logistic_org: report.rebill_logistic_org,
      kiz: report.kiz,
      storage_fee: parseFloat(report.storage_fee) || 0,
      deduction: parseFloat(report.deduction) || 0,
      acceptance: parseFloat(report.acceptance) || 0,
      srid: report.srid,
      report_type: report.report_type
    }));
    
    // Вставка данных батчами
    const batchSize = 500;
    let insertedCount = 0;
    
    for (let i = 0; i < reportsData.length; i += batchSize) {
      const batch = reportsData.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('wb_financial_reports')
        .upsert(batch, {
          onConflict: 'business_id,rrd_id',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error(`❌ Ошибка вставки финансового отчёта (batch ${i}-${i + batch.length}):`, error);
      } else {
        insertedCount += batch.length;
        console.log(`✅ Вставлено ${insertedCount}/${reportsData.length} записей`);
      }
    }
    
    await logSyncComplete(logId, 'success', insertedCount);
    console.log(`🎉 Синхронизация финансового отчёта завершена: ${insertedCount} записей`);
    
    return { success: true, count: insertedCount };
    
  } catch (error) {
    console.error(`❌ Ошибка синхронизации финансового отчёта:`, error.message);
    await logSyncComplete(logId, 'error', 0, error.message);
    return { success: false, error: error.message };
  }
}

// ==================== ПОЛНАЯ СИНХРОНИЗАЦИЯ ВСЕХ ДАННЫХ ====================

async function syncAllData(businessId, wbApiKey) {
  console.log(`\n🚀 ===== НАЧАЛО ПОЛНОЙ СИНХРОНИЗАЦИИ ДЛЯ МАГАЗИНА ${businessId} =====\n`);
  
  const results = {
    sales: await syncSales(businessId, wbApiKey),
    orders: await syncOrders(businessId, wbApiKey),
    financial: await syncFinancialReport(businessId, wbApiKey)
  };
  
  console.log(`\n✅ ===== СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА =====`);
  console.log(`📊 Продажи: ${results.sales.success ? results.sales.count + ' записей' : 'ОШИБКА'}`);
  console.log(`📦 Заказы: ${results.orders.success ? results.orders.count + ' записей' : 'ОШИБКА'}`);
  console.log(`💰 Финансы: ${results.financial.success ? results.financial.count + ' записей' : 'ОШИБКА'}`);
  console.log(`=============================\n`);
  
  return results;
}

// ==================== СИНХРОНИЗАЦИЯ ВСЕХ АКТИВНЫХ МАГАЗИНОВ ====================

async function syncAllBusinesses() {
  console.log(`\n🌍 ===== НАЧАЛО СИНХРОНИЗАЦИИ ВСЕХ АКТИВНЫХ МАГАЗИНОВ =====\n`);
  
  try {
    // Получаем все активные магазины
    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, company_name, wb_api_key')
      .eq('is_active', true);
    
    if (error) {
      console.error(`❌ Ошибка получения списка магазинов:`, error);
      return;
    }
    
    if (!businesses || businesses.length === 0) {
      console.log(`⚠️ Нет активных магазинов для синхронизации`);
      return;
    }
    
    console.log(`📋 Найдено ${businesses.length} активных магазинов\n`);
    
    // Синхронизируем каждый магазин последовательно
    for (const business of businesses) {
      console.log(`\n📍 Магазин: ${business.company_name} (ID: ${business.id})`);
      await syncAllData(business.id, business.wb_api_key);
    }
    
    console.log(`\n🎉 ===== ВСЕ МАГАЗИНЫ СИНХРОНИЗИРОВАНЫ =====\n`);
    
  } catch (error) {
    console.error(`❌ Критическая ошибка при синхронизации всех магазинов:`, error);
  }
}

// ==================== ЭКСПОРТ ====================

module.exports = {
  syncSales,
  syncOrders,
  syncFinancialReport,
  syncAllData,
  syncAllBusinesses
};
