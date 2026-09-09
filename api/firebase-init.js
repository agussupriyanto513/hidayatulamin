// api/firebase-init.js
// Init Firebase Admin untuk project hidayatulamin-e6f22, dipakai backend
// (bukan project portal-sagatama milik Mart/Games — ini project terpisah).
import admin from 'firebase-admin';

let app;

function cleanKey(v) {
  return (v || '').replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

export function getFirebaseApp() {
  if (app) return app;
  if (admin.apps.length) {
    app = admin.apps[0];
    return app;
  }
  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: cleanKey(process.env.FIREBASE_PROJECT_ID),
      clientEmail: cleanKey(process.env.FIREBASE_CLIENT_EMAIL),
      privateKey: cleanKey(process.env.FIREBASE_PRIVATE_KEY)
    })
  });
  return app;
}

export { admin };
