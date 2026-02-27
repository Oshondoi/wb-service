require('dotenv').config();

const app = require('./app');
const db = require('../database');
const syncService = require('../sync-service');

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
	console.log('WB price service started on port', PORT);
	console.log(`🌍 Server URL: http://localhost:${PORT}`);

	try {
		const hasData = await db.checkIfDataExists();
		if (!hasData) {
			console.log('\n🔄 Первый запуск: данных нет, запускаем синхронизацию всех магазинов в фоне...');
			syncService.syncAllBusinesses().catch(err => {
				console.error('❌ Ошибка первичной синхронизации:', err.message);
			});
		} else {
			console.log('ℹ️ Данные уже есть в базе. Следующая автосинхронизация в 3:30 утра (Бишкек).');
		}
	} catch (error) {
		console.error('⚠️ Ошибка проверки данных:', error.message);
	}
});

module.exports = app;
