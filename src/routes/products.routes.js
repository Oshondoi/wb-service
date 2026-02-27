const createProductsController = require('../controllers/products.controller');

module.exports = function productsRoutes(app, deps) {
	const { requireAuth } = deps;
	const controller = createProductsController(deps);

	app.get('/products', requireAuth, controller.getProductsPage);
	app.get('/wb-price', requireAuth, controller.getWbPrice);
	app.get('/wb-image', controller.getWbImage);
	app.get('/wb-raw', requireAuth, controller.getWbRaw);
	app.get('/wb-max', requireAuth, controller.getWbMax);
	app.get('/wb-price-plain', controller.getWbPricePlain);
	app.get('/wb-price-csv', controller.getWbPriceCsv);
	app.get('/wb-max-csv', controller.getWbMaxCsv);
};
