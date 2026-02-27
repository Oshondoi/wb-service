const createFinReportService = require('../services/finReport.service');

module.exports = function createFinReportController(deps) {
	const service = createFinReportService(deps);

	return {
		getFinReportPage: (req, res) => service.getFinReportPage(req, res),

		getBusinesses: (req, res) => service.getBusinesses(req, res),
		createBusiness: (req, res) => service.createBusiness(req, res),
		updateBusiness: (req, res) => service.updateBusiness(req, res),
		deleteBusiness: (req, res) => service.deleteBusiness(req, res),
		getDefaultBusiness: (req, res) => service.getDefaultBusiness(req, res),

		getProductCosts: (req, res) => service.getProductCosts(req, res),
		bulkProductCosts: (req, res) => service.bulkProductCosts(req, res),
		getProductCost: (req, res) => service.getProductCost(req, res),
		deleteProductCost: (req, res) => service.deleteProductCost(req, res),

		getWbFinance: (req, res) => service.getWbFinance(req, res),
		getWbSales: (req, res) => service.getWbSales(req, res),
		getWbOrders: (req, res) => service.getWbOrders(req, res),
		getWbSalesGrouped: (req, res) => service.getWbSalesGrouped(req, res),
		getWbFinReport: (req, res) => service.getWbFinReport(req, res),
		getWbStocks: (req, res) => service.getWbStocks(req, res),

		syncAll: (req, res) => service.syncAll(req, res),
		syncByBusiness: (req, res) => service.syncByBusiness(req, res),
		getFinReportRange: (req, res) => service.getFinReportRange(req, res),
		getSyncStatus: (req, res) => service.getSyncStatus(req, res)
	};
};
