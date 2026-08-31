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

function parseFirestoreFields(fields: any): any {
  const result: any = {};
  if (!fields || typeof fields !== 'object') return result;
  for (const key of Object.keys(fields)) {
    const valObj = fields[key];
    if (!valObj || typeof valObj !== 'object') continue;
    if ('stringValue' in valObj) result[key] = valObj.stringValue;
    else if ('integerValue' in valObj) result[key] = Number(valObj.integerValue);
    else if ('doubleValue' in valObj) result[key] = Number(valObj.doubleValue);
    else if ('booleanValue' in valObj) result[key] = valObj.booleanValue;
    else if ('mapValue' in valObj && valObj.mapValue?.fields) result[key] = parseFirestoreFields(valObj.mapValue.fields);
    else if ('arrayValue' in valObj) result[key] = (valObj.arrayValue?.values || []).map((v: any) => parseFirestoreFields({ temp: v }).temp);
    else if ('nullValue' in valObj) result[key] = null;
  }
  return result;
}

function encodeFirestoreFields(data: any): any {
  const fields: any = {};
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val === null || val === undefined) fields[key] = { nullValue: null };
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
    else if (typeof val === 'number') {
      if (Number.isInteger(val)) fields[key] = { integerValue: String(val) };
      else fields[key] = { doubleValue: val };
    }
    else if (typeof val === 'string') fields[key] = { stringValue: val };
    else if (typeof val === 'object' && !Array.isArray(val)) {
      fields[key] = { mapValue: { fields: encodeFirestoreFields(val) } };
    }
  }
  return fields;
}

const PROJ_ID = process.env.FIREBASE_PROJECT_ID || "gbagender";

async function restGetDocById(collName: string, docId: string) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJ_ID}/databases/(default)/documents/${collName}/${docId}`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json?.fields) {
        return { id: docId, data: parseFirestoreFields(json.fields), type: 'rest' };
      }
    }
  } catch (err) {
    console.warn(`REST getDoc error on ${collName}/${docId}:`, err);
  }
  return null;
}

async function restQueryCollection(collName: string, field: string, op: any, value: any) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJ_ID}/databases/(default)/documents:runQuery`;
    const body = {
      structuredQuery: {
        from: [{ collectionId: collName }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: typeof value === 'number' ? { doubleValue: value } : { stringValue: String(value) }
          }
        }
      }
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const list = await res.json();
      const results: any[] = [];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item.document && item.document.fields) {
            const parts = item.document.name.split('/');
            const docId = parts[parts.length - 1];
            results.push({ id: docId, data: parseFirestoreFields(item.document.fields), type: 'rest' });
          }
        }
      }
      return results;
    }
  } catch (err) {
    console.warn(`REST queryCollection error on ${collName}.${field}:`, err);
  }
  return [];
}

async function restUpdateDocById(collName: string, docId: string, updateFields: any) {
  try {
    const keys = Object.keys(updateFields);
    const updateMask = keys.map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${PROJ_ID}/databases/(default)/documents/${collName}/${docId}?${updateMask}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreFields(updateFields) })
    });
    return res.ok;
  } catch (err) {
    console.warn(`REST updateDoc error on ${collName}/${docId}:`, err);
  }
  return false;
}

async function restAddDocToCollection(collName: string, docData: any) {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJ_ID}/databases/(default)/documents/${collName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFirestoreFields(docData) })
    });
    return res.ok;
  } catch (err) {
    console.warn(`REST addDoc error on ${collName}:`, err);
  }
  return false;
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

  return await restGetDocById(collName, docId);
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

  return await restQueryCollection(collName, field, op, value);
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

  return await restUpdateDocById(collName, docId, updateFields);
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

  return await restAddDocToCollection(collName, docData);
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

        const finalVal = value || subData.amount || 0;
        if (finalVal > 0) {
          await addDocToCollection('financial_transactions', {
            tenantId,
            type: 'income',
            amount: finalVal,
            subscription_amount: finalVal,
            service_amount: 0,
            product_amount: 0,
            package_amount: 0,
            date: todayStr,
            category: 'Assinaturas',
            description: `Assinatura Confirmada: ${subData.planName || 'Plano'} - ${subData.cliente_name || 'Cliente'}`,
            paymentMethod: 'Pagamento Online',
            status: 'pago',
            cliente_id: subData.cliente_id || 'N/A',
            cliente_name: subData.cliente_name || 'Cliente',
            responsavel_id: subData.cliente_id || 'N/A',
            responsavel_name: subData.cliente_name || 'Cliente',
            net_amount: finalVal,
            settlement_date: todayStr,
            is_settled: true,
            createdAt: new Date().toISOString()
          });

          // Sync with open cash session
          try {
            const openSessions = await queryCollection('cash_sessions', 'tenantId', '==', tenantId);
            const activeCash = openSessions.find((s: any) => s.data?.status === 'open' || s.data?.status === 'reopened');
            if (activeCash) {
              await addDocToCollection('cash_movements', {
                tenantId,
                caixa_id: activeCash.id,
                type: 'income',
                category: 'Assinaturas',
                description: `Assinatura Rull: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
                amount: finalVal,
                subscription_amount: finalVal,
                payment_method: 'pagamento_online',
                paymentMethod: 'Pagamento Online',
                date: todayStr,
                createdAt: new Date().toISOString()
              });

              const cData = activeCash.data || {};
              await updateDocById('cash_sessions', activeCash.id, {
                total_income: (cData.total_income || cData.totalIncome || 0) + finalVal,
                totalIncome: (cData.totalIncome || cData.total_income || 0) + finalVal,
                expected_balance: (cData.expected_balance || cData.expectedBalance || 0) + finalVal,
                expectedBalance: (cData.expectedBalance || cData.expected_balance || 0) + finalVal,
                updatedAt: new Date().toISOString()
              });
            }
          } catch (cErr) {
            console.warn("⚠️ [ASAAS WEBHOOK] Error syncing cash session:", cErr);
          }
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
