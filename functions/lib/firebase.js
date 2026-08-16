const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

function db() {
  return admin.firestore();
}

module.exports = { admin, db };
