const createFinReportController = require('../controllers/finReport.controller');

module.exports = function finReportRoutes(app, deps) {
	const { requireAuth } = deps;
	const controller = createFinReportController(deps);

	app.get('/fin-report', requireAuth, controller.getFinReportPage);

	app.get('/api/businesses', requireAuth, controller.getBusinesses);
	app.post('/api/businesses', requireAuth, controller.createBusiness);
	app.put('/api/businesses/:id', requireAuth, controller.updateBusiness);
	app.delete('/api/businesses/:id', requireAuth, controller.deleteBusiness);
	app.get('/api/businesses/default', requireAuth, controller.getDefaultBusiness);

	app.get('/api/product-costs/:businessId', requireAuth, controller.getProductCosts);
	app.post('/api/product-costs/:businessId/bulk', requireAuth, controller.bulkProductCosts);
	app.get('/api/product-costs/:businessId/:nmId', requireAuth, controller.getProductCost);
	app.delete('/api/product-costs/:businessId/:nmId', requireAuth, controller.deleteProductCost);

	app.get('/api/wb-finance', requireAuth, controller.getWbFinance);
	app.get('/api/wb-sales', requireAuth, controller.getWbSales);
	app.get('/api/wb-orders', requireAuth, controller.getWbOrders);
	app.get('/api/wb-sales-grouped', requireAuth, controller.getWbSalesGrouped);
	app.get('/api/wb-fin-report', requireAuth, controller.getWbFinReport);
	app.get('/api/wb-stocks', requireAuth, controller.getWbStocks);

	app.post('/api/sync-all', requireAuth, controller.syncAll);
	app.post('/api/sync/:businessId', requireAuth, controller.syncByBusiness);
	app.get('/api/fin-report-range/:businessId', requireAuth, controller.getFinReportRange);
	app.get('/api/sync-status/:businessId', requireAuth, controller.getSyncStatus);
};
