const createIndexService = require('../services/index.service');

module.exports = function createIndexController(deps) {
	const service = createIndexService(deps);

	return {
		getAuthPage: (req, res) => service.getAuthPage(req, res),
		getLoginPage: (req, res) => service.getLoginPage(req, res),
		getRegisterPage: (req, res) => service.getRegisterPage(req, res),
		getLogout: (req, res) => service.getLogout(req, res),
		postLogin: (req, res) => service.postLogin(req, res),
		postRegister: (req, res) => service.postRegister(req, res),
		postAuthResetPasswordConfirm: (req, res) => service.postAuthResetPasswordConfirm(req, res),
		getProfile: (req, res) => service.getProfile(req, res),
		postProfile: (req, res) => service.postProfile(req, res),
		postProfileResetPassword: (req, res) => service.postProfileResetPassword(req, res),
		getCounterparties: (req, res) => service.getCounterparties(req, res),
		postCounterparties: (req, res) => service.postCounterparties(req, res),
		getCashCategories: (req, res) => service.getCashCategories(req, res),
		postCashCategories: (req, res) => service.postCashCategories(req, res),
		getCashTransactions: (req, res) => service.getCashTransactions(req, res),
		postCashTransactions: (req, res) => service.postCashTransactions(req, res),
		putCashTransaction: (req, res) => service.putCashTransaction(req, res),
		deleteCashTransactionsBulk: (req, res) => service.deleteCashTransactionsBulk(req, res),
		deleteCashTransaction: (req, res) => service.deleteCashTransaction(req, res),
		getCashSummary: (req, res) => service.getCashSummary(req, res),
		getCashDebts: (req, res) => service.getCashDebts(req, res),
		postCashDebts: (req, res) => service.postCashDebts(req, res),
		recalculateCashDebts: (req, res) => service.recalculateCashDebts(req, res),
		putCashDebt: (req, res) => service.putCashDebt(req, res),
		deleteCashDebtsBulk: (req, res) => service.deleteCashDebtsBulk(req, res),
		deleteCashDebt: (req, res) => service.deleteCashDebt(req, res),
		exportCashDebtsXlsx: (req, res) => service.exportCashDebtsXlsx(req, res),

		getHomePage: (req, res) => service.getHomePage(req, res)
	};
};
