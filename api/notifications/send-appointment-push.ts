import webpush from "web-push";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
    const { eventType, appointment } = req.body || {};
    if (!appointment) return res.status(400).json({ error: "Dados do agendamento ausentes." });

    const clientName = appointment.cliente_name || "Cliente";
    const barberName = appointment.profissional_name || "Barbeiro";
    const serviceName = appointment.servico_name || "Serviço";
    const dateStr = appointment.date || "";
    const timeStr = appointment.startTime || "";
    const barberId = appointment.profissional_id;
    const clientId = appointment.cliente_id;

    let barberTitle = "🔔 Atualização na sua Agenda";
    let barberBody = `${clientName} tem uma atualização no agendamento às ${timeStr}.`;
    let clientTitle = "📅 Seu Agendamento";
    let clientBody = `Seu horário com ${barberName} para ${serviceName} foi atualizado.`;

    if (eventType === 'created') {
      barberTitle = "📅 Novo Agendamento Recebido!";
      barberBody = `${clientName} agendou ${serviceName} para o dia ${dateStr} às ${timeStr}.`;
      clientTitle = "✅ Agendamento Confirmado!";
      clientBody = `Seu horário de ${serviceName} com ${barberName} está marcado para ${dateStr} às ${timeStr}.`;
    } else if (eventType === 'rescheduled') {
      barberTitle = "🔄 Horário Reagendado!";
      barberBody = `O horário de ${clientName} foi alterado para ${dateStr} às ${timeStr}.`;
      clientTitle = "🔄 Horário Alterado!";
      clientBody = `Seu agendamento com ${barberName} foi alterado para ${dateStr} às ${timeStr}.`;
    } else if (eventType === 'cancelled') {
      barberTitle = "🚨 Agendamento Cancelado";
      barberBody = `O agendamento de ${clientName} às ${timeStr} do dia ${dateStr} foi cancelado.`;
      clientTitle = "🚨 Horário Cancelado";
      clientBody = `Seu agendamento com ${barberName} do dia ${dateStr} às ${timeStr} foi cancelado.`;
    }

    const db = getDb();
    if (db) {
      const sendToUser = async (userId: string, title: string, body: string, url: string) => {
        try {
          const snap = await db.collection("push_subscriptions").where("userId", "==", userId).get();
          const jsonPayload = JSON.stringify({
            title,
            body,
            icon: "/icon-192.png",
            badge: "/badge-72.png",
            url
          });
          for (const d of snap.docs) {
            const data = d.data();
            if (data.subscription?.endpoint) {
              await webpush.sendNotification(data.subscription, jsonPayload).catch(() => {});
            }
          }
        } catch (_) {}
      };

      if (barberId && barberId !== 'admin') {
        await sendToUser(barberId, barberTitle, barberBody, '/portal-barbeiro');
      }
      if (clientId) {
        await sendToUser(clientId, clientTitle, clientBody, '/portal');
      }
    }

    return res.status(200).json({ success: true, message: "Push disparado com sucesso." });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Falha ao enviar push." });
  }
}
