import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin lazily for Vercel Serverless Function
function getAdminDb() {
  try {
    const apps = getApps();
    let adminApp;
    if (apps.length === 0) {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
          raw = raw.slice(1, -1);
        }
        if (!raw.startsWith('{') && !raw.startsWith('[')) {
          try {
            raw = Buffer.from(raw, 'base64').toString('utf-8');
          } catch (_) {}
        }
        const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || "gbagender"
        });
      } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        adminApp = initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID || "gbagender",
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey
          }),
          projectId: process.env.FIREBASE_PROJECT_ID || "gbagender"
        });
      } else {
        adminApp = initializeApp({ projectId: "gbagender" });
      }
    } else {
      adminApp = apps[0];
    }
    return getFirestore(adminApp);
  } catch (err) {
    console.error("Failed to init Firebase Admin in Asaas webhook function:", err);
    return null;
  }
}

export default async function handler(req: any, res: any) {
  // Support CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, access_token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET ping from Asaas
  if (req.method === 'GET') {
    return res.status(200).json({
      status: "ok",
      message: "Webhook Asaas ativo e pronto para receber notificações (Vercel Serverless Function)."
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const eventType = String(body?.event || body?.status || '').toUpperCase();
    const payment = body?.payment || body?.charge || {};
    const subscription = body?.subscription || {};
    
    console.log("🔔 [VERCEL ASAAS WEBHOOK] Event:", eventType, "Payment ID:", payment?.id);

    const dbAdmin = getAdminDb();
    if (!dbAdmin) {
      console.error("❌ [VERCEL ASAAS WEBHOOK] Database not available");
      return res.status(200).json({ received: true, warning: "Database not available" });
    }

    let refId = payment?.externalReference || subscription?.externalReference || body?.external_reference || body?.externalReference;
    const description = payment?.description || subscription?.description || body?.description;
    
    if (!refId && description && typeof description === 'string') {
      const match = description.match(/\(([^)]+)\)/);
      if (match && match[1]) {
        refId = match[1].trim();
      }
    }

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

    if (isActivation && refId) {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // 1. Try to find subscription in Firestore
      let subDoc: any = null;
      let subRef: any = null;

      const subIdFromPayment = payment?.subscription || subscription?.id;
      const paymentIdFromPayment = payment?.id;

      // Strategy A: Check if refId is the Firestore document ID directly
      if (refId) {
        try {
          const directDocRef = dbAdmin.collection('subscriptions').doc(refId);
          const directSnap = await directDocRef.get();
          if (directSnap.exists) {
            subDoc = directSnap;
            subRef = directDocRef;
          }
        } catch (_) {}
      }

      // Strategy B: Query by externalReference
      if (!subDoc && refId) {
        const extQuery = await dbAdmin.collection('subscriptions')
          .where('externalReference', '==', refId)
          .limit(1)
          .get();
        if (!extQuery.empty) {
          subDoc = extQuery.docs[0];
          subRef = subDoc.ref;
        }
      }

      // Strategy C: Query by asaasInvoiceId
      if (!subDoc && paymentIdFromPayment) {
        const invQuery = await dbAdmin.collection('subscriptions')
          .where('asaasInvoiceId', '==', paymentIdFromPayment)
          .limit(1)
          .get();
        if (!invQuery.empty) {
          subDoc = invQuery.docs[0];
          subRef = subDoc.ref;
        }
      }

      // Strategy D: Query by asaasSubscriptionId
      if (!subDoc && subIdFromPayment) {
        const subIdQuery = await dbAdmin.collection('subscriptions')
          .where('asaasSubscriptionId', '==', subIdFromPayment)
          .limit(1)
          .get();
        if (!subIdQuery.empty) {
          subDoc = subIdQuery.docs[0];
          subRef = subDoc.ref;
        }
      }

      // Strategy E: Fallback query by tenantId (for SaaS tenant activation)
      if (!subDoc && refId) {
        const tenantSubQuery = await dbAdmin.collection('subscriptions')
          .where('tenantId', '==', refId)
          .limit(1)
          .get();
        if (!tenantSubQuery.empty) {
          subDoc = tenantSubQuery.docs[0];
          subRef = subDoc.ref;
        }
      }

      if (!subDoc && refId) {
        // Search in tenants for SaaS Plan renewals
        const tenantRef = dbAdmin.collection('tenants').doc(refId);
        const tenantSnap = await tenantRef.get();
        if (tenantSnap.exists) {
          const tenantData = tenantSnap.data() || {};
          let baseDate = new Date();
          const currentExp = tenantData.planExpiresAt || tenantData.planValidUntil;
          if (currentExp && typeof currentExp === 'string') {
            const expDate = new Date(currentExp + (currentExp.includes('T') ? '' : 'T12:00:00'));
            if (!isNaN(expDate.getTime()) && expDate > baseDate) baseDate = expDate;
          }
          const newExpDate = new Date(baseDate);
          newExpDate.setMonth(newExpDate.getMonth() + 1);
          const newExpStr = newExpDate.toISOString().split('T')[0];

          await tenantRef.set({
            planStatus: 'active',
            isActive: true,
            planExpiresAt: newExpStr,
            planValidUntil: newExpStr,
            lastPaymentDate: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });

          if (value > 0) {
            await dbAdmin.collection('saas_payments').add({
              tenantId: refId,
              tenantName: tenantData.name || refId,
              planName: tenantData.plan || description || 'Plano Ultra',
              amount: value,
              paymentMethod: payment?.billingType || 'PIX',
              status: 'pago',
              paidAt: new Date().toISOString(),
              newExpirationDate: newExpStr,
              createdAt: new Date()
            });
          }
          console.log(`✅ [VERCEL ASAAS WEBHOOK] Tenant ${refId} activated successfully until ${newExpStr}`);
        }
      }

      if (subRef && subDoc) {
        const subData = subDoc.data();
        const tenantId = subData.tenantId;
        const newStart = new Date();
        const newEnd = new Date(newStart);
        newEnd.setMonth(newEnd.getMonth() + 1);
        const newEndStr = newEnd.toISOString().split('T')[0];

        await subRef.update({
          status: 'active',
          asaasPaymentStatus: 'received',
          asaasSubscriptionId: subscription?.id || payment?.subscription || null,
          asaasCustomerId: subscription?.customer || payment?.customer || null,
          asaasInvoiceId: payment?.id || null,
          startDate: todayStr,
          endDate: newEndStr,
          haircutsUsed: 0,
          beardsUsed: 0,
          lastRenewalDate: todayStr,
          updatedAt: new Date()
        });

        if (value > 0) {
          await dbAdmin.collection('financial_transactions').add({
            tenantId,
            type: 'income',
            amount: value || subData.amount || 0,
            date: todayStr,
            category: 'Assinaturas',
            description: `Assinatura Confirmada: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
            paymentMethod: 'pix',
            status: 'pago',
            cliente_id: subData.cliente_id,
            cliente_name: subData.cliente_name,
            responsavel_id: subData.cliente_id,
            responsavel_name: subData.cliente_name,
            net_amount: value || subData.amount || 0,
            settlement_date: todayStr,
            is_settled: true,
            createdAt: new Date()
          });
        }
        console.log(`✅ [VERCEL ASAAS WEBHOOK] Subscription ${subDoc.id} activated successfully until ${newEndStr}`);
      }
    }

    return res.status(200).json({ received: true, status: "success" });
  } catch (error: any) {
    console.error("❌ [VERCEL ASAAS WEBHOOK] Error processing webhook:", error);
    // Always return HTTP 200 to Asaas to prevent retries storm
    return res.status(200).json({ received: true, error: error?.message || 'Handled exception' });
  }
}
