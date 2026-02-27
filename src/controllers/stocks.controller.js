const createStocksService = require('../services/stocks.service');

module.exports = function createStocksController(deps) {
	const service = createStocksService(deps);

	return {
		getStocksPage: (req, res) => service.getStocksPage(req, res)
	};
};
