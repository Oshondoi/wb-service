const axios = require('axios');

const db = require('../../database');
const syncService = require('../../sync-service');
const { renderFinReportPage } = require('./finReport.page');

module.exports = function createFinReportService(deps) {
	function getFinReportPage(req, res) {
		if (typeof renderFinReportPage === 'function') {
			return renderFinReportPage(req, res);
		}
		return res.status(500).send('fin-report page handler is not configured');
	}

	async function getBusinesses(req, res) {
		try {
			const onlyWithApi = req.query.onlyWithApi === '1' || req.query.onlyWithApi === 'true';
			const businesses = await db.getBusinessesByAccount(req.account.id, false, onlyWithApi);
			const stats = await db.getAccountStats(req.account.id);
			res.json({ success: true, businesses, stats });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function createBusiness(req, res) {
		const { company_name, wb_api_key, description } = req.body;

		if (!company_name) {
			return res.json({ success: false, error: 'Название компании обязательно' });
		}

		try {
			const apiKey = wb_api_key && String(wb_api_key).trim() ? String(wb_api_key).trim() : null;
			const business = await db.createBusiness(req.account.id, company_name, apiKey, description);

			if (apiKey) {
				syncService.syncAllData(business.id, apiKey)
					.then(() => console.log(`✅ Начальная синхронизация завершена для магазина ${business.id}`))
					.catch(err => console.error(`❌ Ошибка начальной синхронизации для магазина ${business.id}:`, err.message));
			}

			res.json({ success: true, business, message: apiKey ? 'Магазин создан, синхронизация данных запущена' : 'Магазин создан' });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function updateBusiness(req, res) {
		const businessId = parseInt(req.params.id);
		const { company_name, wb_api_key, description, is_active } = req.body;

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const updates = {};
			if (company_name !== undefined) updates.company_name = company_name;
			if (wb_api_key !== undefined) {
				const apiKey = wb_api_key && String(wb_api_key).trim() ? String(wb_api_key).trim() : null;
				updates.wb_api_key = apiKey;
			}
			if (description !== undefined) updates.description = description;
			if (is_active !== undefined) updates.is_active = is_active ? true : false;

			const success = await db.updateBusiness(businessId, updates);
			res.json({ success, message: success ? 'Магазин обновлён' : 'Магазин не найден' });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function deleteBusiness(req, res) {
		const businessId = parseInt(req.params.id);

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const success = await db.deleteBusiness(businessId);
			res.json({ success, message: success ? 'Магазин удалён' : 'Магазин не найден' });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getDefaultBusiness(req, res) {
		try {
			const business = await db.getDefaultBusiness(req.account.id);
			if (!business) {
				return res.json({ success: false, error: 'Нет активных магазинов с API ключом. Создайте магазин.' });
			}
			res.json({ success: true, business });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getProductCosts(req, res) {
		const businessId = parseInt(req.params.businessId);

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const costs = await db.getProductCostsByBusiness(businessId);
			res.json({ success: true, costs });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function bulkProductCosts(req, res) {
		const businessId = parseInt(req.params.businessId);
		const { products } = req.body;

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		if (!Array.isArray(products) || products.length === 0) {
			return res.json({ success: false, error: 'Нет данных для сохранения' });
		}

		try {
			const count = await db.bulkUpsertProductCosts(businessId, products);
			res.json({ success: true, count, message: `Сохранено ${count} позиций` });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getProductCost(req, res) {
		const businessId = parseInt(req.params.businessId);
		const nmId = req.params.nmId;

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const cost = await db.getProductCost(businessId, nmId);
			if (!cost) {
				return res.json({ success: false, error: 'Себестоимость не найдена' });
			}
			res.json({ success: true, cost });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function deleteProductCost(req, res) {
		const businessId = parseInt(req.params.businessId);
		const nmId = req.params.nmId;

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const success = await db.deleteProductCost(businessId, nmId);
			res.json({ success, message: success ? 'Себестоимость удалена' : 'Себестоимость не найдена' });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getWbFinance(req, res) {
		const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
		let business;

		if (businessId) {
			business = await db.getBusinessById(businessId);
			if (!business || business.account_id !== req.account.id) {
				return res.json({ error: 'Магазин не найден или доступ запрещён' });
			}
		} else {
			business = await db.getDefaultBusiness(req.account.id);
		}

		if (!business) {
			return res.json({ error: 'Нет активных магазинов. Создайте магазин через интерфейс управления.' });
		}

		try {
			const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
			const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];

			const sales = await db.getSalesFromCache(business.id, dateFromStr, dateToStr);

			const items = sales.map(sale => {
				const forPay = sale.for_pay || 0;
				const commission = (sale.commission_percent || 0) * forPay / 100;
				const logistics = sale.delivery_amount || 0;
				const profit = forPay - commission - logistics;

				return {
					date: sale.sale_dt ? new Date(sale.sale_dt).toLocaleDateString('ru-RU') : '—',
					nmId: sale.nm_id,
					subject: sale.subject,
					forPay: forPay,
					commission: commission,
					logistics: logistics,
					profit: profit,
					type: sale.sale_id ? 'sale' : 'order'
				};
			});

			const stats = {
				totalRevenue: items.reduce((sum, item) => sum + item.forPay, 0),
				totalCommission: items.reduce((sum, item) => sum + item.commission, 0),
				totalLogistics: items.reduce((sum, item) => sum + item.logistics, 0),
				netProfit: items.reduce((sum, item) => sum + item.profit, 0)
			};

			res.json({ items, stats });
		} catch (err) {
			console.error('Ошибка получения финансовых данных:', err.message);
			res.json({ error: 'Ошибка получения данных: ' + err.message });
		}
	}

	async function getWbSales(req, res) {
		const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
		let business;

		if (businessId) {
			business = await db.getBusinessById(businessId);
			if (!business || business.account_id !== req.account.id) {
				return res.json({ error: 'Магазин не найден или доступ запрещён' });
			}
		} else {
			business = await db.getDefaultBusiness(req.account.id);
		}

		if (!business) {
			return res.json({ error: 'Нет активных магазинов' });
		}

		try {
			const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
			const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];

			const salesData = await db.getSalesFromCache(business.id, dateFromStr, dateToStr);
			const sales = salesData.filter(s => s.sale_id);

			const items = sales.map(sale => ({
				date: new Date(sale.sale_dt).toLocaleDateString('ru-RU'),
				nmId: sale.nm_id,
				subject: sale.subject,
				forPay: sale.for_pay || 0,
				commission: (sale.commission_percent || 0) * (sale.for_pay || 0) / 100,
				logistics: sale.delivery_amount || 0,
				profit: (sale.for_pay || 0) - ((sale.commission_percent || 0) * (sale.for_pay || 0) / 100) - (sale.delivery_amount || 0),
				type: 'sale'
			}));

			const stats = {
				totalRevenue: items.reduce((s, i) => s + i.forPay, 0),
				totalCommission: items.reduce((s, i) => s + i.commission, 0),
				totalLogistics: items.reduce((s, i) => s + i.logistics, 0),
				netProfit: items.reduce((s, i) => s + i.profit, 0)
			};

			res.json({ items, stats });
		} catch (err) {
			console.error('Ошибка получения продаж:', err.message);
			res.json({ error: 'Ошибка: ' + err.message });
		}
	}

	async function getWbOrders(req, res) {
		const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
		let business;

		if (businessId) {
			business = await db.getBusinessById(businessId);
			if (!business || business.account_id !== req.account.id) {
				return res.json({ error: 'Магазин не найден или доступ запрещён' });
			}
		} else {
			business = await db.getDefaultBusiness(req.account.id);
		}

		if (!business) {
			return res.json({ error: 'Нет активных магазинов' });
		}

		try {
			const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
			const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];

			const orders = await db.getOrdersFromCache(business.id, dateFromStr, dateToStr);

			const items = orders.map(order => ({
				date: new Date(order.order_dt).toLocaleDateString('ru-RU'),
				nmId: order.nm_id,
				subject: order.subject,
				forPay: order.total_price || 0,
				commission: 0,
				logistics: 0,
				profit: order.total_price || 0,
				type: 'order'
			}));

			const stats = {
				totalRevenue: items.reduce((s, i) => s + i.forPay, 0),
				totalCommission: 0,
				totalLogistics: 0,
				netProfit: items.reduce((s, i) => s + i.profit, 0)
			};

			res.json({ items, stats });
		} catch (err) {
			console.error('Ошибка получения заказов:', err.message);
			res.json({ error: 'Ошибка: ' + err.message });
		}
	}

	async function getWbSalesGrouped(req, res) {
		const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
		let business;

		if (businessId) {
			business = await db.getBusinessById(businessId);
			if (!business || business.account_id !== req.account.id) {
				return res.json({ error: 'Магазин не найден или доступ запрещён' });
			}
		} else {
			business = await db.getDefaultBusiness(req.account.id);
		}

		if (!business) {
			return res.json({ error: 'Нет активных магазинов' });
		}

		try {
			const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
			const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];

			console.log(`📊 Загрузка данных из Supabase для магазина ${business.id}, период ${dateFromStr} - ${dateToStr}`);
			const finReportData = await db.getFinancialReportFromCache(business.id, dateFromStr, dateToStr);

			console.log(`📊 Получено ${finReportData.length} записей из Supabase`);

			const groupedMap = {};

			finReportData.forEach(item => {
				const nmId = item.nm_id;
				if (!nmId) return;

				if (!groupedMap[nmId]) {
					groupedMap[nmId] = {
						nmId: nmId,
						subject: item.subject_name || '—',
						brand: item.brand_name || '—',
						quantity: 0,
						totalRevenue: 0,
						totalCommission: 0,
						totalLogistics: 0,
						totalProfit: 0,
						totalForPay: 0,
						prices: [],
						warehouseName: item.office_name || '—'
					};
				}

				const quantity = Number(item.quantity || 1);
				const retailAmount = Number(item.retail_amount || 0);
				const commission = Number(item.ppvz_sales_commission || 0);
				const logistics = Number(item.delivery_rub || 0) +
												 Number(item.storage_fee || 0) +
												 Number(item.acquiring_fee || 0) +
												 Number(item.penalty || 0) +
												 Number(item.deduction || 0) +
												 Number(item.acceptance || 0);
				const profit = retailAmount - commission - logistics;
				const forPay = Number(item.ppvz_for_pay || 0);

				groupedMap[nmId].quantity += quantity;
				groupedMap[nmId].totalRevenue += retailAmount;
				groupedMap[nmId].totalCommission += commission;
				groupedMap[nmId].totalLogistics += logistics;
				groupedMap[nmId].totalProfit += profit;
				groupedMap[nmId].totalForPay += forPay;
				groupedMap[nmId].prices.push(retailAmount);
			});

			if (Object.keys(groupedMap).length === 0) {
				console.log('📊 FinReport пустой, пробуем загрузить из wb_sales...');
				const salesData = await db.getSalesFromCache(business.id, dateFromStr, dateToStr);

				salesData.forEach(sale => {
					const nmId = sale.nm_id;

					if (!groupedMap[nmId]) {
						groupedMap[nmId] = {
							nmId: nmId,
							subject: sale.subject || '—',
							brand: sale.brand || '—',
							quantity: 0,
							totalRevenue: 0,
							totalCommission: 0,
							totalLogistics: 0,
							totalProfit: 0,
							totalForPay: 0,
							prices: [],
							warehouseName: sale.warehouse_name || '—'
						};
					}

					const retailAmount = sale.total_price || sale.price_with_disc || sale.finished_price || 0;
					const commission = sale.ppvz_sales_commission || 0;
					const logistics = (sale.delivery_rub || 0) +
													 (sale.storage_fee || 0) +
													 (sale.acquiring_fee || 0) +
													 (sale.penalty || 0) +
													 (sale.deduction || 0) +
													 (sale.acceptance || 0);
					const profit = retailAmount - commission - logistics;
					const forPay = sale.ppvz_for_pay || (retailAmount - commission - logistics);

					groupedMap[nmId].quantity += 1;
					groupedMap[nmId].totalRevenue += retailAmount;
					groupedMap[nmId].totalCommission += commission;
					groupedMap[nmId].totalLogistics += logistics;
					groupedMap[nmId].totalProfit += profit;
					groupedMap[nmId].totalForPay += forPay;
					groupedMap[nmId].prices.push(retailAmount);
				});
			}

			const groupedItems = Object.values(groupedMap).map(item => {
				const avgPrice = item.prices.length > 0
					? item.prices.reduce((sum, p) => sum + p, 0) / item.prices.length
					: 0;

				return {
					nmId: item.nmId,
					subject: item.subject,
					brand: item.brand,
					quantity: item.quantity,
					totalRevenue: item.totalRevenue,
					totalCommission: item.totalCommission,
					totalLogistics: item.totalLogistics,
					totalProfit: item.totalProfit,
					totalForPay: item.totalForPay,
					avgPrice: avgPrice,
					warehouseName: item.warehouseName
				};
			});

			groupedItems.sort((a, b) => b.quantity - a.quantity);

			res.json({ data: groupedItems });
		} catch (err) {
			console.error('Ошибка получения сгруппированных продаж:', err.message);
			res.json({ error: 'Ошибка: ' + err.message });
		}
	}

	async function getWbFinReport(req, res) {
		const businessId = req.query.businessId ? parseInt(req.query.businessId) : null;
		let business;

		if (businessId) {
			business = await db.getBusinessById(businessId);
			if (!business || business.account_id !== req.account.id) {
				return res.json({ error: 'Магазин не найден или доступ запрещён' });
			}
		} else {
			business = await db.getDefaultBusiness(req.account.id);
		}

		if (!business) {
			return res.json({ error: 'Нет активных магазинов' });
		}

		try {
			const dateFromStr = req.query.dateFrom || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
			const dateToStr = req.query.dateTo || new Date().toISOString().split('T')[0];

			const data = await db.getFinancialReportFromCache(business.id, dateFromStr, dateToStr);
			res.json({ data });
		} catch (err) {
			console.error('Ошибка получения финансового отчёта:', err.message);
			res.json({ error: 'Ошибка: ' + err.message });
		}
	}

	async function getWbStocks(req, res) {
		try {
			const rawIds = (req.query.businessIds || '').split(',').map(id => parseInt(id, 10)).filter(Boolean);
			const debug = req.query.debug === '1';
			const businesses = await db.getBusinessesByAccount(req.account.id, false, true);
			const filtered = rawIds.length ? businesses.filter(b => rawIds.includes(b.id)) : businesses;

			if (!filtered.length) {
				return res.json({ success: false, error: 'Нет магазинов с API ключом' });
			}

			const dateFrom = req.query.dateFrom || '2019-01-01';
			const itemsMap = new Map();
			const errors = [];

			for (const business of filtered) {
				if (!business.wb_api_key) continue;
				try {
					const url = 'https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=' + dateFrom;
					const response = await axios.get(url, {
						headers: { 'Authorization': business.wb_api_key },
						timeout: 60000
					});

					const stocks = response.data || [];
					stocks.forEach(stock => {
						const nmId = stock.nmId || stock.nm_id;
						if (!nmId) return;

						const key = business.id + ':' + nmId;
						const rawQtyValue = stock.quantity;
						const rawQty = Number(rawQtyValue ?? 0);
						const rawQtyFull = Number(stock.quantityFull || 0);
						const rawQtyNotInOrders = Number(stock.quantityNotInOrders || 0);
						const inWayToClient = Number(stock.inWayToClient || stock.inWayToClientQty || 0);
						const inWayFromClient = Number(stock.inWayFromClient || stock.inWayFromClientQty || 0);

						if (!itemsMap.has(key)) {
							itemsMap.set(key, {
								business_id: business.id,
								nm_id: nmId,
								seller_article: stock.supplierArticle || stock.supplier_article || stock.vendorCode || '',
								brand: stock.brand || stock.tradeMark || '',
								subject: stock.subject || stock.category || '',
								qty: 0,
								in_way_to_client: 0,
								in_way_from_client: 0,
								total_qty: 0,
								qty_full: 0,
								qty_not_in_orders: 0,
								qty_raw: 0,
								qty_raw_seen: false
							});
						}

						const item = itemsMap.get(key);
						if (!item.seller_article) {
							item.seller_article = stock.supplierArticle || stock.supplier_article || stock.vendorCode || '';
						}
						if (rawQtyValue !== undefined && rawQtyValue !== null) {
							item.qty_raw_seen = true;
						}
						item.qty_full += rawQtyFull;
						item.qty_not_in_orders += rawQtyNotInOrders;
						item.qty_raw += rawQty;
						item.in_way_to_client += inWayToClient;
						item.in_way_from_client += inWayFromClient;
					});
				} catch (err) {
					errors.push({ business_id: business.id, error: err.message });
				}
			}

			const items = Array.from(itemsMap.values()).map(item => {
				const baseQty = item.qty_raw_seen
					? item.qty_raw
					: (item.qty_full || item.qty_not_in_orders || 0);
				return {
					...item,
					qty: baseQty,
					total_qty: baseQty + item.in_way_from_client
				};
			});
			return res.json({ success: true, items, errors, debug });
		} catch (err) {
			return res.json({ success: false, error: err.message });
		}
	}

	async function syncAll(req, res) {
		try {
			console.log(`\n🔄 [ADMIN] Запуск ручной синхронизации всех магазинов...`);

			syncService.syncAllBusinesses().catch(err => {
				console.error('❌ Ошибка фоновой синхронизации:', err.message);
			});

			res.json({
				success: true,
				message: 'Синхронизация всех магазинов запущена в фоне. Это может занять несколько минут.'
			});
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function syncByBusiness(req, res) {
		const businessId = parseInt(req.params.businessId);

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const business = await db.getBusinessById(businessId);
			if (!business) {
				return res.json({ success: false, error: 'Магазин не найден' });
			}
			if (!business.wb_api_key || !String(business.wb_api_key).trim()) {
				return res.json({ success: false, error: 'У магазина нет API ключа. Синхронизация недоступна.' });
			}

			console.log(`🔄 Ручной запуск синхронизации для магазина ${business.company_name} (ID: ${businessId})`);
			const results = await syncService.syncAllData(businessId, business.wb_api_key);

			res.json({
				success: true,
				message: 'Синхронизация завершена',
				results
			});
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getFinReportRange(req, res) {
		const businessId = parseInt(req.params.businessId);
		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}
		try {
			const range = await db.getFinancialReportRange(businessId);
			res.json({ success: true, range });
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	async function getSyncStatus(req, res) {
		const businessId = parseInt(req.params.businessId);

		const isOwner = await db.verifyBusinessOwnership(businessId, req.account.id);
		if (!isOwner) {
			return res.json({ success: false, error: 'Доступ запрещён' });
		}

		try {
			const salesSync = await db.getLastSync(businessId, 'sales');
			const ordersSync = await db.getLastSync(businessId, 'orders');
			const financialSync = await db.getLastSync(businessId, 'financial');

			res.json({
				success: true,
				status: {
					sales: salesSync,
					orders: ordersSync,
					financial: financialSync
				}
			});
		} catch (error) {
			res.json({ success: false, error: error.message });
		}
	}

	return {
		getFinReportPage,

		getBusinesses,
		createBusiness,
		updateBusiness,
		deleteBusiness,
		getDefaultBusiness,
		getProductCosts,
		bulkProductCosts,
		getProductCost,
		deleteProductCost,
		getWbFinance,
		getWbSales,
		getWbOrders,
		getWbSalesGrouped,
		getWbFinReport,
		getWbStocks,
		syncAll,
		syncByBusiness,
		getFinReportRange,
		getSyncStatus
	};
};
