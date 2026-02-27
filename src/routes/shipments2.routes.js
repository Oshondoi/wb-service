const createShipments2Controller = require('../controllers/shipments2.controller');

module.exports = function shipments2Routes(app, deps) {
	const { requireAuth } = deps;
	const controller = createShipments2Controller(deps);

	app.get('/shipments-2', requireAuth, controller.getShipments2Page);
	app.get('/api/fbo/businesses', requireAuth, controller.getFboBusinesses);
	app.get('/api/fbo/batches', requireAuth, controller.getFboBatches);
	app.post('/api/fbo/batches', requireAuth, controller.postFboBatches);
	app.get('/api/fbo/sources', requireAuth, controller.getFboSources);
	app.post('/api/fbo/sources', requireAuth, controller.postFboSources);
	app.get('/api/fbo/warehouses', requireAuth, controller.getFboWarehouses);
	app.post('/api/fbo/warehouses', requireAuth, controller.postFboWarehouses);
	app.delete('/api/fbo/sources/:id', requireAuth, controller.deleteFboSource);
	app.delete('/api/fbo/warehouses/:id', requireAuth, controller.deleteFboWarehouse);
	app.get('/api/fbo/shipments', requireAuth, controller.getFboShipments);
	app.post('/api/fbo/shipments', requireAuth, controller.postFboShipments);
	app.put('/api/fbo/shipments/:id', requireAuth, controller.putFboShipments);
	app.delete('/api/fbo/shipments/:id', requireAuth, controller.deleteFboShipments);
	app.get('/api/fbo/shipments/:shipmentId/warehouses', requireAuth, controller.getFboShipmentWarehouses);
	app.post('/api/fbo/shipments/:shipmentId/warehouses', requireAuth, controller.postFboShipmentWarehouses);
	app.delete('/api/fbo/shipment-warehouses/:id', requireAuth, controller.deleteFboShipmentWarehouse);
	app.get('/api/fbo/boxes', requireAuth, controller.getFboBoxes);
	app.post('/api/fbo/boxes', requireAuth, controller.postFboBoxes);
	app.delete('/api/fbo/boxes/:id', requireAuth, controller.deleteFboBox);
	app.post('/api/fbo/scans', requireAuth, controller.postFboScans);
	app.delete('/api/fbo/scans/:id', requireAuth, controller.deleteFboScan);
	app.post('/api/fbo/scans/undo-last', requireAuth, controller.undoLastFboScan);
	app.get('/api/fbo/scans/recent', requireAuth, controller.getRecentFboScans);
};
