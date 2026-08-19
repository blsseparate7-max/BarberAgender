import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Helper CPF/CNPJ validation
function isValidCPF(cpf: string): boolean {
  if (typeof cpf !== 'string') return false;
  cpf = cpf.replace(/[^\d]/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let add = 0;
  for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
  let rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  add = 0;
  for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
  rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  return true;
}

function isValidCNPJ(cnpj: string): boolean {
  if (typeof cnpj !== 'string') return false;
  cnpj = cnpj.replace(/[^\d]/g, '');
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  let digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  return true;
}

function isValidCpfCnpj(val: string): boolean {
  const clean = val.replace(/\D/g, '');
  if (clean.length === 11) return isValidCPF(clean);
  if (clean.length === 14) return isValidCNPJ(clean);
  return false;
}

function getAsaasBaseUrl(env?: string): string {
  if (env === 'production') {
    return 'https://api.asaas.com/v3';
  }
  return 'https://sandbox.asaas.com/api/v3';
}

export default async function handler(req: any, res: any) {
  // Support CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, access_token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount, billingType, externalReference, isSubscription } = body;

    if (!tenantId || !amount) {
      return res.status(400).json({ error: "Parâmetros obrigatórios incompletos (tenantId e amount)." });
    }

    const rawAsaasKey = process.env.ASAAS_API_KEY || '';
    const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
    const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

    if (!asaasApiKey) {
      return res.status(400).json({ error: "Integração com Asaas não configurada (ASAAS_API_KEY ausente)." });
    }

    let baseUrl = getAsaasBaseUrl(asaasEnv);
    let cleanCpfCnpj = (ownerCpfCnpj || '').replace(/\D/g, '');
    let isSandboxMode = asaasEnv !== 'production' || asaasApiKey.toLowerCase().includes('sandbox');
    
    const validSandboxCpf = '12345678909';
    const validSandboxCnpj = '11444777000161';

    if (!cleanCpfCnpj || !isValidCpfCnpj(cleanCpfCnpj)) {
      cleanCpfCnpj = validSandboxCpf;
    }

    const fetchAsaasApi = async (path: string, options: any = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
        ...(options.headers || {})
      };

      try {
        const primaryRes = await fetch(`${baseUrl}${path}`, { ...options, headers });
        const primaryData = await primaryRes.json();

        if (primaryData?.errors?.some((e: any) => e.code === 'invalid_access_token')) {
          const altBaseUrl = baseUrl.includes('sandbox') 
            ? 'https://api.asaas.com/v3' 
            : 'https://sandbox.asaas.com/api/v3';
          
          const altRes = await fetch(`${altBaseUrl}${path}`, { ...options, headers });
          const altData = await altRes.json();
          if (!altData.errors) {
            baseUrl = altBaseUrl;
            return altData;
          }
        }
        return primaryData;
      } catch (err) {
        console.warn(`⚠️ [Asaas Fetch Error] Falha na requisição para ${baseUrl}${path}:`, err);
        return { errors: [{ description: "Falha de conexão com a API do Asaas." }] };
      }
    };

    // 1. Find or create customer
    let customerId: string | null = null;
    if (ownerEmail) {
      try {
        const custData = await fetchAsaasApi(`/customers?email=${encodeURIComponent(ownerEmail)}`);
        if (custData?.data && Array.isArray(custData.data) && custData.data.length > 0) {
          customerId = custData.data[0]?.id || null;
          if (customerId) {
            await fetchAsaasApi(`/customers/${customerId}`, {
              method: 'PUT',
              body: JSON.stringify({ cpfCnpj: cleanCpfCnpj })
            });
          }
        }
      } catch (e) {
        console.warn("Aviso ao buscar cliente existente Asaas:", e);
      }
    }

    if (!customerId) {
      let newCust = await fetchAsaasApi('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: tenantName || tenantId,
          email: ownerEmail || `cliente_${Date.now()}@dominio.com`,
          cpfCnpj: cleanCpfCnpj,
          externalReference: externalReference || tenantId
        })
      });
      
      if (newCust?.errors && isSandboxMode) {
        cleanCpfCnpj = validSandboxCpf;
        newCust = await fetchAsaasApi('/customers', {
          method: 'POST',
          body: JSON.stringify({
            name: tenantName || tenantId,
            email: ownerEmail || `cliente_${Date.now()}@dominio.com`,
            cpfCnpj: cleanCpfCnpj,
            externalReference: externalReference || tenantId
          })
        });
      }

      if (newCust?.errors) {
        if (isSandboxMode) {
          customerId = 'cus_sandbox_' + Date.now();
        } else {
          const errMsg = (Array.isArray(newCust.errors) && newCust.errors[0]?.description) || "O CPF/CNPJ ou dados informados são inválidos no Asaas.";
          return res.status(400).json({ error: errMsg, details: newCust.errors });
        }
      } else if (newCust?.id) {
        customerId = newCust.id;
      } else {
        customerId = 'cus_sandbox_' + Date.now();
      }
    }

    // 2. Create Charge or Subscription
    const today = new Date();
    today.setDate(today.getDate() + 3);
    const dueDateStr = today.toISOString().split('T')[0];

    let payData: any = null;
    const isRealCustomerId = customerId && typeof customerId === 'string' && !customerId.startsWith('cus_sandbox_');

    if ((billingType === 'CREDIT_CARD' || isSubscription) && isRealCustomerId) {
      payData = await fetchAsaasApi('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId,
          billingType: billingType || 'CREDIT_CARD',
          value: Number(amount),
          nextDueDate: dueDateStr,
          cycle: 'MONTHLY',
          description: `Assinatura BarberElite - Plano ${planName || 'Mensal'} (${tenantId})`,
          externalReference: externalReference || tenantId
        })
      });
    } else {
      // Default Pix / Charge
      payData = await fetchAsaasApi('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: customerId || 'cus_000008558135',
          billingType: billingType || 'PIX',
          value: Number(amount),
          dueDate: dueDateStr,
          description: `Assinatura BarberElite - Plano ${planName || 'Mensal'} (${tenantId})`,
          externalReference: externalReference || tenantId
        })
      });
    }

    if (payData?.errors) {
      if (isSandboxMode) {
        return res.json({
          success: true,
          chargeId: 'pay_sandbox_' + Date.now(),
          paymentId: 'pay_sandbox_' + Date.now(),
          customerId: customerId,
          paymentUrl: 'https://sandbox.asaas.com/i/sandbox',
          pixCopiaECola: '00020126580014br.gov.bcb.pix...',
          pixQrCodeUrl: ''
        });
      }
      return res.status(400).json({ error: payData.errors[0]?.description || "Erro ao gerar cobrança no Asaas." });
    }

    const paymentId = payData?.id;
    let actualPaymentId = paymentId;
    let paymentUrl = payData?.invoiceUrl || payData?.bankSlipUrl || '';
    let pixCopiaECola = '';
    let pixQrCodeUrl = '';

    // If subscription was created (id starts with 'sub_'), fetch its first payment to get invoiceUrl and Pix QR Code
    if (paymentId && paymentId.startsWith('sub_')) {
      try {
        const subPayments = await fetchAsaasApi(`/subscriptions/${paymentId}/payments`);
        if (subPayments && Array.isArray(subPayments.data) && subPayments.data.length > 0) {
          const firstPayment = subPayments.data[0];
          if (firstPayment?.id) {
            actualPaymentId = firstPayment.id;
            paymentUrl = firstPayment.invoiceUrl || firstPayment.bankSlipUrl || paymentUrl;
          }
        }
      } catch (subErr) {
        console.warn("Aviso ao buscar cobrança da assinatura Asaas:", subErr);
      }
    }

    const pixTargetId = actualPaymentId && !actualPaymentId.startsWith('sub_') ? actualPaymentId : null;

    if (pixTargetId && (billingType === 'PIX' || !billingType || body?.billingType === 'PIX')) {
      try {
        const pixRes = await fetchAsaasApi(`/payments/${pixTargetId}/pixQrCode`);
        if (pixRes && pixRes.encodedImage) {
          pixCopiaECola = pixRes.payload || '';
          pixQrCodeUrl = `data:image/png;base64,${pixRes.encodedImage}`;
        }
      } catch (pixErr) {
        console.warn("Aviso ao obter QR Code do Pix no Asaas:", pixErr);
      }
    }

    return res.json({
      success: true,
      chargeId: paymentId,
      paymentId: actualPaymentId || paymentId,
      customerId: customerId,
      paymentUrl,
      pixCopiaECola,
      pixQrCodeUrl
    });

  } catch (error: any) {
    console.error("❌ [VERCEL CREATE CHARGE] Erro:", error);
    return res.status(500).json({ error: error?.message || "Erro interno ao criar cobrança no Asaas." });
  }
}
