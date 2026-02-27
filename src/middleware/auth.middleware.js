const crypto = require('crypto');

const db = require('../../database');
const supabase = require('../../supabase-client');

function isLikelyJwt(token) {
	return typeof token === 'string' && token.split('.').length === 3;
}

async function ensureAccountFromAuthUser(user) {
	if (!user || !user.email) {
		return null;
	}

	const existing = await db.getAccountByEmail(user.email);
	if (existing) {
		return existing;
	}

	const rawUsername = user.user_metadata && user.user_metadata.username
		? String(user.user_metadata.username)
		: String(user.email).split('@')[0];
	const baseUsername = rawUsername.trim() || 'user';
	let candidate = baseUsername;
	let suffix = 1;

	while (await db.getAccountByUsername(candidate)) {
		candidate = `${baseUsername}${suffix}`;
		suffix += 1;
	}

	const randomPassword = crypto.randomBytes(16).toString('hex');
	return db.createAccount(candidate, randomPassword, user.email);
}

async function getAccountFromAuthToken(token) {
	if (!token) {
		return null;
	}

	if (isLikelyJwt(token)) {
		const { data, error } = await supabase.auth.getUser(token);
		if (error || !data || !data.user) {
			return null;
		}
		return ensureAccountFromAuthUser(data.user);
	}

	const accountId = parseInt(token, 10);
	if (!Number.isNaN(accountId)) {
		return db.getAccountById(accountId);
	}

	return null;
}

async function requireAuth(req, res, next) {
	const token = req.cookies?.authToken;
	const accountFromCookie = await getAccountFromAuthToken(token);
	if (accountFromCookie) {
		req.account = accountFromCookie;
		return next();
	}

	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.startsWith('Bearer ')) {
		const bearerToken = authHeader.substring(7);
		const accountFromHeader = await getAccountFromAuthToken(bearerToken);
		if (accountFromHeader) {
			req.account = accountFromHeader;
			return next();
		}
	}

	if (req.path.startsWith('/api/')) {
		return res.status(401).json({ success: false, error: 'Необходима авторизация' });
	}

	res.redirect('/login');
}

module.exports = {
	requireAuth,
	isLikelyJwt,
	ensureAccountFromAuthUser,
	getAccountFromAuthToken
};
