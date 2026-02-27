const createStocksController = require('../controllers/stocks.controller');

module.exports = function stocksRoutes(app, deps) {
	const { requireAuth } = deps;
	const controller = createStocksController(deps);

	app.get('/stocks', requireAuth, controller.getStocksPage);
};
