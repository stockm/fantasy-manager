const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

exports.aiAdvice = require('./ai/advice').aiAdvice;
exports.nflWeek = require('./nfl/week').nflWeek;
exports.screenshotImport = require('./screenshot-import').screenshotImport;
exports.accountProfile = require('./lib/billing').accountProfile;
exports.billingCheckout = require('./lib/billing').billingCheckout;
exports.stripeWebhook = require('./lib/billing').stripeWebhook;
Object.assign(exports, require('./scheduled'));
