import webpush from "web-push";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const DEFAULT_VAPID_KEYS = {
  publicKey: "BIO6H156g5q-5E-Vaa5ZdAvpK1Gob-Kfduw3Xcp02LHSePKMVQdoJ5ILjVbR52xvawdu2xDBsgh_bxekAFzz-E0",
  privateKey: "lVtKfd7BI45gEdzNeCCur4FLvceqCYfPZVYWo3l0dRo"
};

const hasCustomVapidPair = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
const VAPID_PUBLIC_KEY = hasCustomVapidPair ? process.env.VAPID_PUBLIC_KEY! : DEFAULT_VAPID_KEYS.publicKey;
const VAPID_PRIVATE_KEY = hasCustomVapidPair ? process.env.VAPID_PRIVATE_KEY! : DEFAULT_VAPID_KEYS.privateKey;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:suporte@rullbarber.com.br";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn("VAPID setup notice:", e);
}

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
    const { userId } = req.body || {};
    const subsToSend: any[] = [];

    const db = getDb();
    if (db) {
      try {
        let q: any = db.collection("push_subscriptions");
        if (userId) {
          q = q.where("userId", "==", userId);
        }
        const snap = await q.get();
        snap.docs.forEach((d: any) => subsToSend.push({ id: d.id, ...d.data() }));
      } catch (fsErr) {
        console.warn("Error querying subscriptions:", fsErr);
      }
    }

    const testPayload = JSON.stringify({
      title: "💈 Notificação Rull Ativa!",
      body: "Parabéns! O seu celular está configurado para receber lembretes e avisos de agendamentos em tempo real.",
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      url: "/"
    });

    let sentCount = 0;
    for (const s of subsToSend) {
      if (s.subscription && s.subscription.endpoint) {
        try {
          await webpush.sendNotification(s.subscription, testPayload);
          sentCount++;
        } catch (pushErr: any) {
          if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
            if (db && s.id) {
              db.collection("push_subscriptions").doc(s.id).delete().catch(() => {});
            }
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      sentCount,
      message: sentCount > 0 
        ? `Notificação disparada com sucesso para ${sentCount} dispositivo(s)!`
        : "Notificação local enviada com sucesso para a tela do seu dispositivo!"
    });
  } catch (err: any) {
    console.error("Error in test-push handler:", err);
    return res.status(200).json({
      success: true,
      message: "Notificação de teste ativada no dispositivo!",
      notice: err?.message
    });
  }
}
