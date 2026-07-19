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

  // Cara 1 (disarankan, kebal dari masalah paste/newline): satu env var
  // FIREBASE_SERVICE_ACCOUNT_B64 berisi seluruh isi file JSON service
  // account (hidayatulamin-e6f22) yang di-encode base64.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    const json = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
    );
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: json.project_id,
        clientEmail: json.client_email,
        privateKey: json.private_key
      })
    });
    return app;
  }

  // Cara 2 (fallback lama): 3 env var terpisah — rawan rusak kalau
  // private key di-paste manual lewat form web.
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
