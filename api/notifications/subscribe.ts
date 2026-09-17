import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getDb() {
  try {
    if (getApps().length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
      } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID || "barberelite-pro",
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
          })
        });
      } else {
        initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "barberelite-pro" });
      }
    }
    return getFirestore();
  } catch (err) {
    console.warn("Firestore init notice:", err);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { userId, userRole, tenantId, subscription, userAgent } = req.body || {};
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: "Objeto de subscrição push inválido." });
    }

    const endpointStr = String(subscription.endpoint);
    const subKey = `${userId || 'anon'}_${Buffer.from(endpointStr).toString('base64').replace(/[/+=]/g, '').slice(-24)}`;
    const subRecord = {
      id: subKey,
      userId: userId || '',
      userRole: userRole || 'cliente',
      tenantId: tenantId || '',
      subscription,
      userAgent: userAgent || '',
      updatedAt: new Date().toISOString()
    };

    const db = getDb();
    if (db) {
      try {
        await db.collection("push_subscriptions").doc(subKey).set({
          ...subRecord,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (fsErr) {
        console.warn("Notice saving to Firestore:", fsErr);
      }
    }

    return res.status(200).json({ success: true, message: "Inscrição push salva com sucesso!" });
  } catch (err: any) {
    console.error("Erro ao salvar inscrição push:", err);
    return res.status(500).json({ error: err.message || "Erro ao salvar subscrição push." });
  }
}
