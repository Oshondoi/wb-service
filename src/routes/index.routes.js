const createIndexController = require('../controllers/index.controller');

module.exports = function indexRoutes(app, deps) {
	const { requireAuth } = deps;
	const controller = createIndexController(deps);

	app.get('/auth', controller.getAuthPage);
	app.get('/login', controller.getLoginPage);
	app.get('/register', controller.getRegisterPage);
	app.get('/api/logout', controller.getLogout);
	app.post('/api/login', controller.postLogin);
	app.post('/api/register', controller.postRegister);
	app.post('/api/auth/reset-password-confirm', controller.postAuthResetPasswordConfirm);
	app.get('/api/profile', requireAuth, controller.getProfile);
	app.post('/api/profile', requireAuth, controller.postProfile);
	app.post('/api/profile/reset-password', requireAuth, controller.postProfileResetPassword);
	app.get('/api/counterparties', requireAuth, controller.getCounterparties);
	app.post('/api/counterparties', requireAuth, controller.postCounterparties);
	app.get('/api/cash-categories', requireAuth, controller.getCashCategories);
	app.post('/api/cash-categories', requireAuth, controller.postCashCategories);
	app.get('/api/cash/transactions', requireAuth, controller.getCashTransactions);
	app.post('/api/cash/transactions', requireAuth, controller.postCashTransactions);
	app.put('/api/cash/transactions/:id', requireAuth, controller.putCashTransaction);
	app.delete('/api/cash/transactions/bulk', requireAuth, controller.deleteCashTransactionsBulk);
	app.delete('/api/cash/transactions/:id', requireAuth, controller.deleteCashTransaction);
	app.get('/api/cash/summary', requireAuth, controller.getCashSummary);
	app.get('/api/cash/debts', requireAuth, controller.getCashDebts);
	app.post('/api/cash/debts', requireAuth, controller.postCashDebts);
	app.post('/api/cash/debts/recalculate', requireAuth, controller.recalculateCashDebts);
	app.put('/api/cash/debts/:id', requireAuth, controller.putCashDebt);
	app.delete('/api/cash/debts/bulk', requireAuth, controller.deleteCashDebtsBulk);
	app.delete('/api/cash/debts/:id', requireAuth, controller.deleteCashDebt);
	app.post('/api/cash/debts/export-xlsx', requireAuth, controller.exportCashDebtsXlsx);

	app.get('/', requireAuth, controller.getHomePage);
};
