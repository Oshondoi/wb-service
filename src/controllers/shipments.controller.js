const createShipmentsService = require('../services/shipments.service');

module.exports = function createShipmentsController(deps) {
	const service = createShipmentsService(deps);

	return {
		getShipmentsPage: (req, res) => service.getShipmentsPage(req, res)
	};
};
