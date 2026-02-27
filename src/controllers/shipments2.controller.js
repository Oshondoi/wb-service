const createShipments2Service = require('../services/shipments2.service');

module.exports = function createShipments2Controller(deps) {
	const service = createShipments2Service(deps);

	return {
		getShipments2Page: (req, res) => service.getShipments2Page(req, res),
		getFboBusinesses: (req, res) => service.getFboBusinesses(req, res),
		getFboBatches: (req, res) => service.getFboBatches(req, res),
		postFboBatches: (req, res) => service.postFboBatches(req, res),
		getFboSources: (req, res) => service.getFboSources(req, res),
		postFboSources: (req, res) => service.postFboSources(req, res),
		getFboWarehouses: (req, res) => service.getFboWarehouses(req, res),
		postFboWarehouses: (req, res) => service.postFboWarehouses(req, res),
		deleteFboSource: (req, res) => service.deleteFboSource(req, res),
		deleteFboWarehouse: (req, res) => service.deleteFboWarehouse(req, res),
		getFboShipments: (req, res) => service.getFboShipments(req, res),
		postFboShipments: (req, res) => service.postFboShipments(req, res),
		putFboShipments: (req, res) => service.putFboShipments(req, res),
		deleteFboShipments: (req, res) => service.deleteFboShipments(req, res),
		getFboShipmentWarehouses: (req, res) => service.getFboShipmentWarehouses(req, res),
		postFboShipmentWarehouses: (req, res) => service.postFboShipmentWarehouses(req, res),
		deleteFboShipmentWarehouse: (req, res) => service.deleteFboShipmentWarehouse(req, res),
		getFboBoxes: (req, res) => service.getFboBoxes(req, res),
		postFboBoxes: (req, res) => service.postFboBoxes(req, res),
		deleteFboBox: (req, res) => service.deleteFboBox(req, res),
		postFboScans: (req, res) => service.postFboScans(req, res),
		deleteFboScan: (req, res) => service.deleteFboScan(req, res),
		undoLastFboScan: (req, res) => service.undoLastFboScan(req, res),
		getRecentFboScans: (req, res) => service.getRecentFboScans(req, res)
	};
};
