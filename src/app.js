const express = require('express');
const cors = require('cors');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const registerIndexRoutes = require('./routes/index.routes');
const registerFinReportRoutes = require('./routes/finReport.routes');
const registerProductsRoutes = require('./routes/products.routes');
const registerStocksRoutes = require('./routes/stocks.routes');
const registerShipmentsRoutes = require('./routes/shipments.routes');
const registerShipments2Routes = require('./routes/shipments2.routes');
const { requireAuth } = require('./middleware/auth.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
	secret: 'wb-helper-secret-key-2025',
	resave: false,
	saveUninitialized: false,
	cookie: {
		maxAge: 24 * 60 * 60 * 1000,
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax'
	}
}));

const deps = {
	requireAuth
};

registerIndexRoutes(app, deps);
registerFinReportRoutes(app, deps);
registerProductsRoutes(app, deps);
registerStocksRoutes(app, deps);
registerShipmentsRoutes(app, deps);
registerShipments2Routes(app, deps);

module.exports = app;
