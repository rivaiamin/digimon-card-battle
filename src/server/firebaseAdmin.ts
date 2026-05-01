import admin from "firebase-admin";

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return admin.app();

  // Prefer a full JSON service account in env (easy for hosting),
  // otherwise fall back to GOOGLE_APPLICATION_CREDENTIALS / metadata.
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json && json.trim().length > 0) {
    const serviceAccount = JSON.parse(json);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return admin.app();
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  return admin.app();
}

export function getFirebaseAdminAuth() {
  initFirebaseAdmin();
  return admin.auth();
}

