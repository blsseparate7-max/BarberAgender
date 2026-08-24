import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { initializeApp as initClientApp, getApps as getClientApps } from "firebase/app";
import { getFirestore as getClientFirestore, doc, getDoc, setDoc, collection, query, where, getDocs, addDoc } from "firebase/firestore";

const FIREBASE_CONFIG = {
  projectId: process.env.FIREBASE_PROJECT_ID || "gbagender",
  appId: process.env.FIREBASE_APP_ID || "1:529968557136:web:a9dc6fb8578141ae68f555",
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAcrEPPYvEChBs_oXc4tFpos2oDwWV96Rs",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "gbagender.firebaseapp.com",
  firestoreDatabaseId: "(default)",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "gbagender.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "529968557136"
};

function getAdminDb() {
  try {
    const apps = getAdminApps();
    if (apps.length > 0) return getAdminFirestore(apps[0]);

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
        raw = raw.slice(1, -1);
      }
      if (!raw.startsWith('{') && !raw.startsWith('[')) {
        try { raw = Buffer.from(raw, 'base64').toString('utf-8'); } catch (_) {}
      }
      const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      const app = initAdminApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id || "gbagender" });
      return getAdminFirestore(app);
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      const app = initAdminApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID || "gbagender",
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        projectId: process.env.FIREBASE_PROJECT_ID || "gbagender"
      });
      return getAdminFirestore(app);
    } else {
      // Basic initialization fallback for serverless container context
      const app = initAdminApp({ projectId: process.env.FIREBASE_PROJECT_ID || "gbagender" });
      return getAdminFirestore(app);
    }
  } catch (err) {
    console.warn("⚠️ [VERCEL WEBHOOK] Admin SDK init error, fallback to Client SDK:", err);
  }
  return null;
}

function getClientDb() {
  try {
    const apps = getClientApps();
    const app = apps.length > 0 ? apps[0] : initClientApp(FIREBASE_CONFIG as any);
    return getClientFirestore(app, FIREBASE_CONFIG.firestoreDatabaseId || "(default)");
  } catch (err) {
    console.error("❌ [VERCEL WEBHOOK] Client SDK init error:", err);
    return null;
  }
}

async function getDocById(collName: string, docId: string) {
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      const snap = await adminDb.collection(collName).doc(docId).get();
      if (snap.exists) {
        return { id: snap.id, data: snap.data(), type: 'admin' };
      }
    } catch (_) {}
  }

  const clientDb = getClientDb();
  if (clientDb) {
    try {
      const docRef = doc(clientDb, collName, docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, data: snap.data(), type: 'client' };
      }
    } catch (e) {
      console.error(`Client getDoc error on ${collName}/${docId}:`, e);
    }
  }
  return null;
}

async function queryCollection(collName: string, field: string, op: any, value: any) {
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      const snap = await adminDb.collection(collName).where(field, op, value).get();
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, data: d.data(), type: 'admin' }));
      }
    } catch (_) {}
  }

  const clientDb = getClientDb();
  if (clientDb) {
    try {
      const q = query(collection(clientDb, collName), where(field, op, value));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, data: d.data(), type: 'client' }));
      }
    } catch (e) {
      console.error(`Client query error on ${collName}.${field}:`, e);
    }
  }
  return [];
}

async function updateDocById(collName: string, docId: string, updateFields: any) {
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      await adminDb.collection(collName).doc(docId).set(updateFields, { merge: true });
      return true;
    } catch (e) {
      console.warn(`Admin updateDoc error on ${collName}/${docId}:`, e);
    }
  }

  const clientDb = getClientDb();
  if (clientDb) {
    try {
      const docRef = doc(clientDb, collName, docId);
      await setDoc(docRef, updateFields, { merge: true });
      return true;
    } catch (e) {
      console.error(`Client updateDoc error on ${collName}/${docId}:`, e);
    }
  }
  return false;
}

async function addDocToCollection(collName: string, docData: any) {
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      await adminDb.collection(collName).add(docData);
      return true;
    } catch (e) {
      console.warn(`Admin addDoc error on ${collName}:`, e);
    }
  }

  const clientDb = getClientDb();
  if (clientDb) {
    try {
      await addDoc(collection(clientDb, collName), docData);
      return true;
    } catch (e) {
      console.error(`Client addDoc error on ${collName}:`, e);
    }
  }
  return false;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, access_token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    return res.status(200).json({
      status: "ok",
      message: "Webhook Asaas ativo e pronto para receber notificações (Vercel Serverless Function)."
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const eventType = String(body?.event || body?.status || '').toUpperCase();
    const payment = body?.payment || body?.charge || {};
    const subscription = body?.subscription || {};

    console.log("🔔 [VERCEL ASAAS WEBHOOK] Event:", eventType, "Payment ID:", payment?.id, "Sub ID:", payment?.subscription);

    let rawRefId = payment?.externalReference || subscription?.externalReference || body?.external_reference || body?.externalReference || '';
    const description = payment?.description || subscription?.description || body?.description;

    if (!rawRefId && description && typeof description === 'string') {
      const match = description.match(/\(([^)]+)\)/);
      if (match && match[1]) rawRefId = match[1].trim();
    }

    const cleanRefId = rawRefId.replace(/^client_sub:/, '').replace(/^saas_tenant:/, '').trim();

    const value = Number(payment?.value || subscription?.value || 0);
    const isActivation = (
      eventType.includes('RECEIVED') ||
      eventType.includes('CONFIRMED') ||
      eventType.includes('APPROVED') ||
      eventType.includes('ACTIVE') ||
      payment?.status === 'RECEIVED' ||
      payment?.status === 'CONFIRMED' ||
      subscription?.status === 'ACTIVE'
    );

    if (isActivation) {
      const todayStr = new Date().toISOString().split('T')[0];
      const subIdFromPayment = payment?.subscription || (typeof subscription === 'string' ? subscription : subscription?.id);
      const paymentIdFromPayment = payment?.id;

      let targetSubDoc: any = null;

      // Strategy 0: Fetch parent subscription from Asaas API to extract externalReference
      if (subIdFromPayment) {
        try {
          const rawAsaasKey = process.env.ASAAS_API_KEY || '';
          const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
          const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
          let baseUrl = asaasEnv === 'production' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';

          if (asaasApiKey) {
            let parentRes = await fetch(`${baseUrl}/subscriptions/${subIdFromPayment}`, {
              headers: { 'access_token': asaasApiKey }
            });
            let parentData = await parentRes.json();
            if (parentData?.errors?.some((e: any) => e.code === 'invalid_access_token')) {
              const altBaseUrl = baseUrl.includes('sandbox') ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
              parentRes = await fetch(`${altBaseUrl}/subscriptions/${subIdFromPayment}`, {
                headers: { 'access_token': asaasApiKey }
              });
              parentData = await parentRes.json();
            }

            const parentExtRef = parentData?.externalReference;
            if (parentExtRef) {
              const cleanParentRef = parentExtRef.replace(/^client_sub:/, '').replace(/^saas_tenant:/, '').trim();
              for (const pRef of Array.from(new Set([cleanParentRef, parentExtRef]))) {
                const matchDoc = await getDocById('subscriptions', pRef);
                if (matchDoc) {
                  targetSubDoc = matchDoc;
                  console.log(`🎯 [ASAAS WEBHOOK] Parent ExtRef direct match in subscriptions: ${pRef}`);
                  break;
                }
              }
              if (!targetSubDoc) {
                const qRes = await queryCollection('subscriptions', 'externalReference', '==', parentExtRef);
                if (qRes.length > 0) targetSubDoc = qRes[0];
              }
            }
          }
        } catch (subErr) {
          console.warn("⚠️ [ASAAS WEBHOOK] Parent sub fetch error:", subErr);
        }
      }

      // Strategy A: Check cleanRefId & rawRefId as direct doc IDs in subscriptions
      if (!targetSubDoc) {
        for (const idToCheck of Array.from(new Set([cleanRefId, rawRefId].filter(Boolean)))) {
          const matchDoc = await getDocById('subscriptions', idToCheck);
          if (matchDoc) {
            targetSubDoc = matchDoc;
            console.log(`🎯 [ASAAS WEBHOOK] Direct doc match in subscriptions: ${idToCheck}`);
            break;
          }
        }
      }

      // Strategy B: Query externalReference in subscriptions
      if (!targetSubDoc) {
        for (const extRef of Array.from(new Set([rawRefId, cleanRefId, `client_sub:${cleanRefId}`].filter(Boolean)))) {
          const qRes = await queryCollection('subscriptions', 'externalReference', '==', extRef);
          if (qRes.length > 0) {
            targetSubDoc = qRes[0];
            console.log(`🎯 [ASAAS WEBHOOK] externalReference query match in subscriptions: ${extRef}`);
            break;
          }
        }
      }

      // Strategy C: Query asaasInvoiceId
      if (!targetSubDoc && paymentIdFromPayment) {
        const qRes = await queryCollection('subscriptions', 'asaasInvoiceId', '==', paymentIdFromPayment);
        if (qRes.length > 0) targetSubDoc = qRes[0];
      }

      // Strategy D: Query asaasSubscriptionId
      if (!targetSubDoc && subIdFromPayment) {
        const qRes = await queryCollection('subscriptions', 'asaasSubscriptionId', '==', subIdFromPayment);
        if (qRes.length > 0) {
          const pending = qRes.filter((item: any) => item.data.status === 'pending');
          targetSubDoc = pending.length > 0 ? pending[0] : qRes[0];
        }
      }

      // Strategy E: Fallback query tenantId for pending subscriptions
      if (!targetSubDoc && cleanRefId) {
        const qRes = await queryCollection('subscriptions', 'tenantId', '==', cleanRefId);
        const pending = qRes.filter((item: any) => item.data.status === 'pending');
        if (pending.length > 0) targetSubDoc = pending[0];
      }

      // IF CLIENT CLUB SUBSCRIPTION FOUND:
      if (targetSubDoc) {
        const subData = targetSubDoc.data || {};
        const tenantId = subData.tenantId || cleanRefId || 'gbcortes7';
        
        let newStartStr = todayStr;
        let newEndStr = '';

        const payDueDate = payment?.dueDate ? String(payment.dueDate).split('T')[0] : null;
        let baseDate = new Date();

        if (payDueDate) {
          baseDate = new Date(payDueDate + 'T12:00:00');
          newStartStr = payDueDate;
        } else if (subData.endDate) {
          baseDate = new Date(subData.endDate + 'T12:00:00');
          newStartStr = subData.endDate;
        } else {
          newStartStr = todayStr;
        }

        const nextMonth = new Date(baseDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        newEndStr = nextMonth.toISOString().split('T')[0];

        await updateDocById('subscriptions', targetSubDoc.id, {
          status: 'active',
          asaasPaymentStatus: 'received',
          asaasSubscriptionId: subIdFromPayment || subData.asaasSubscriptionId || null,
          asaasCustomerId: subscription?.customer || payment?.customer || subData.asaasCustomerId || null,
          asaasInvoiceId: payment?.id || subData.asaasInvoiceId || null,
          startDate: newStartStr,
          endDate: newEndStr,
          haircutsUsed: 0,
          beardsUsed: 0,
          lastRenewalDate: todayStr,
          updatedAt: new Date().toISOString()
        });

        if (subData.cliente_id) {
          await updateDocById('usuarios', subData.cliente_id, {
            tenantId,
            ativo: true,
            updatedAt: new Date().toISOString()
          });
        }

        if (value > 0) {
          await addDocToCollection('financial_transactions', {
            tenantId,
            type: 'income',
            amount: value || subData.amount || 0,
            date: todayStr,
            category: 'Assinaturas',
            description: `Assinatura Confirmada: ${subData.planName || 'Plano'} - ${subData.cliente_name || 'Cliente'}`,
            paymentMethod: payment?.billingType?.toLowerCase() === 'credit_card' ? 'cartao' : 'pix',
            status: 'pago',
            cliente_id: subData.cliente_id || 'N/A',
            cliente_name: subData.cliente_name || 'Cliente',
            responsavel_id: subData.cliente_id || 'N/A',
            responsavel_name: subData.cliente_name || 'Cliente',
            net_amount: value || subData.amount || 0,
            settlement_date: todayStr,
            is_settled: true,
            createdAt: new Date().toISOString()
          });
        }

        console.log(`✅ [ASAAS WEBHOOK] Client subscription ${targetSubDoc.id} activated successfully!`);
        return res.status(200).json({ received: true, success: true, activated: "client_subscription", docId: targetSubDoc.id });
      }

      // ELSE IF TENANT SAAS PLAN:
      const tenantSearchIds = Array.from(new Set([cleanRefId, rawRefId].filter(Boolean)));
      for (const tId of tenantSearchIds) {
        const tenantDoc = await getDocById('tenants', tId);
        if (tenantDoc) {
          const tenantData = tenantDoc.data || {};
          let baseDate = new Date();
          const currentExp = tenantData.planExpiresAt || tenantData.planValidUntil;
          if (currentExp && typeof currentExp === 'string') {
            const expDate = new Date(currentExp + (currentExp.includes('T') ? '' : 'T12:00:00'));
            if (!isNaN(expDate.getTime()) && expDate > baseDate) baseDate = expDate;
          }
          const newExpDate = new Date(baseDate);
          newExpDate.setMonth(newExpDate.getMonth() + 1);
          const newExpStr = newExpDate.toISOString().split('T')[0];

          await updateDocById('tenants', tId, {
            planStatus: 'active',
            isActive: true,
            planExpiresAt: newExpStr,
            planValidUntil: newExpStr,
            lastPaymentDate: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          if (value > 0) {
            await addDocToCollection('saas_payments', {
              tenantId: tId,
              tenantName: tenantData.name || tId,
              planName: tenantData.plan || description || 'Plano Ultra',
              amount: value,
              paymentMethod: payment?.billingType || 'PIX',
              status: 'pago',
              paidAt: new Date().toISOString(),
              newExpirationDate: newExpStr,
              createdAt: new Date().toISOString()
            });
          }

          console.log(`✅ [ASAAS WEBHOOK] Tenant SaaS ${tId} activated successfully!`);
          return res.status(200).json({ received: true, success: true, activated: "saas_tenant", tenantId: tId });
        }
      }
    }

    return res.status(200).json({ received: true, processed: true });
  } catch (error: any) {
    console.error("❌ [VERCEL ASAAS WEBHOOK] Error handling event:", error);
    return res.status(200).json({ received: true, warning: String(error?.message || error) });
  }
}
