const createProductsService = require('../services/products.service');

module.exports = function createProductsController(deps) {
	const service = createProductsService(deps);

	return {
		getProductsPage: (req, res) => service.getProductsPage(req, res),
		getWbPrice: (req, res) => service.getWbPrice(req, res),
		getWbImage: (req, res) => service.getWbImage(req, res),
		getWbRaw: (req, res) => service.getWbRaw(req, res),
		getWbMax: (req, res) => service.getWbMax(req, res),
		getWbPricePlain: (req, res) => service.getWbPricePlain(req, res),
		getWbPriceCsv: (req, res) => service.getWbPriceCsv(req, res),
		getWbMaxCsv: (req, res) => service.getWbMaxCsv(req, res)
	};
};
