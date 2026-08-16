const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

exports.aiAdvice = require('./ai/advice').aiAdvice;
exports.nflWeek = require('./nfl/week').nflWeek;
exports.screenshotImport = require('./screenshot-import').screenshotImport;
exports.precomputeFantasyCaches = require('./cache/derived').precomputeFantasyCaches;
exports.refreshDerivedCache = require('./cache/derived').refreshDerivedCache;
