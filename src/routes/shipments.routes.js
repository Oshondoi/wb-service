const createShipmentsController = require('../controllers/shipments.controller');

module.exports = function shipmentsRoutes(app, deps) {
	const { requireAuth } = deps;
	const controller = createShipmentsController(deps);

	app.get('/shipments', requireAuth, controller.getShipmentsPage);
};
