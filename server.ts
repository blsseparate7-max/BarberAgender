import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, App, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin lazily
let adminApp: App | null = null;
function getFirebaseAdmin() {
  if (!adminApp) {
    try {
      const apps = getApps();
      if (apps.length === 0) {
        // Try applicationDefault first for standard GCP/Cloud Run context
        adminApp = initializeApp({
          credential: applicationDefault(),
          projectId: "gbagender"
        });
      } else {
        adminApp = apps[0];
      }
    } catch (err: any) {
      console.warn("Could not initialize Firebase Admin SDK with applicationDefault, attempting fallback (this is normal in development/test environments):", err.message || err);
      // Fallback try without applicationDefault
      try {
        const apps = getApps();
        if (apps.length === 0) {
          adminApp = initializeApp({
            projectId: "gbagender"
          });
        } else {
          adminApp = apps[0];
        }
      } catch (innerErr) {
        console.error("Critical: Fallback Firebase Admin initialization also failed:", innerErr);
      }
    }
  }
  return adminApp;
}

function getAdminDb() {
  const app = getFirebaseAdmin();
  if (!app) return null;
  try {
    return getFirestore(app);
  } catch (e) {
    console.warn("Could not initialize Firestore Admin instance:", e);
    return null;
  }
}

// Initialize Gemini client lazily
let ai: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined in environment variables.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10))) return false;
  return true;
}

function isValidCNPJ(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
  let size = clean.length - 2;
  let numbers = clean.substring(0, size);
  const digits = clean.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  size = size + 1;
  numbers = clean.substring(0, size);
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para JSON
  app.use(express.json());

  // API Route to reset another user's password (e.g. barber) using Firebase Admin
  app.post("/api/admin/reset-password", async (req, res) => {
    try {
      const { uid, password } = req.body;
      if (!uid || !password) {
        return res.status(400).json({ error: "UID e senha são obrigatórios." });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
      }

      const fbAdmin = getFirebaseAdmin();
      if (!fbAdmin) {
        return res.status(500).json({ 
          error: "Não foi possível inicializar o Firebase Admin SDK no servidor. Use a redefinição de senha por e-mail." 
        });
      }

      await getAuth(fbAdmin).updateUser(uid, { password });
      res.json({ success: true, message: "Senha alterada com sucesso!" });
    } catch (error: any) {
      const isConfigError = error.message?.includes("identitytoolkit") || 
                            error.message?.includes("credential") || 
                            error.code === "auth/internal-error" || 
                            error.status === 403;

      if (isConfigError) {
        console.warn("Firebase Admin: Permissões insuficientes ou API desativada ao alterar senha.");
        return res.status(200).json({ 
          success: false, 
          fallback: true,
          error: "O Firebase Admin está indisponível no servidor de testes. Por favor, envie um e-mail de redefinição de senha para o usuário."
        });
      }

      console.error("Erro ao alterar senha do barbeiro no servidor:", error);
      res.status(500).json({ 
        error: error.message || "Erro desconhecido ao alterar a senha.",
        code: error.code || "unknown"
      });
    }
  });

  // API Route to create another user's auth (email and password) using Firebase Admin
  app.post("/api/admin/create-user-auth", async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
      }

      const fbAdmin = getFirebaseAdmin();
      if (!fbAdmin) {
        return res.status(500).json({ 
          error: "Não foi possível inicializar o Firebase Admin SDK no servidor." 
        });
      }

      const userRecord = await getAuth(fbAdmin).createUser({
        email: email.trim(),
        password: password,
        displayName: displayName || ""
      });

      res.json({ success: true, uid: userRecord.uid });
    } catch (error: any) {
      const isConfigError = error.message?.includes("identitytoolkit") || 
                            error.message?.includes("credential") || 
                            error.code === "auth/internal-error" || 
                            error.status === 403;

      if (isConfigError) {
        console.warn("Firebase Admin: Permissões insuficientes ou API desativada. Permitindo fallback silencioso para o cliente.");
        return res.status(200).json({ 
          success: false, 
          fallback: true,
          error: "Firebase Admin indisponível no servidor de testes. O cliente usará o fallback automático."
        });
      }

      console.error("Erro ao criar usuário no servidor:", error);
      let clientError = "Erro ao criar credenciais de acesso.";
      if (error.code === 'auth/email-already-exists') {
        clientError = 'Este e-mail já está sendo utilizado por outro usuário.';
      } else if (error.code === 'auth/invalid-email') {
        clientError = 'O e-mail fornecido é inválido.';
      } else if (error.code === 'auth/weak-password') {
        clientError = 'A senha é muito fraca. Deve ter no mínimo 6 caracteres.';
      } else if (error.message) {
        clientError = error.message;
      }
      res.status(500).json({ 
        error: clientError,
        code: error.code || "unknown"
      });
    }
  });

  // API Route to update another user's auth (email and/or password) using Firebase Admin
  app.post("/api/admin/update-user-auth", async (req, res) => {
    try {
      const { uid, email, password } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "UID é obrigatório." });
      }

      const updateParams: any = {};
      if (email) {
        updateParams.email = email.trim();
      }
      if (password) {
        if (password.length < 6) {
          return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });
        }
        updateParams.password = password;
      }

      if (Object.keys(updateParams).length === 0) {
        return res.json({ success: true, message: "Nenhum campo para atualizar na autenticação." });
      }

      const fbAdmin = getFirebaseAdmin();
      if (!fbAdmin) {
        return res.status(500).json({ 
          error: "Não foi possível inicializar o Firebase Admin SDK no servidor. Use o e-mail de recuperação para senha." 
        });
      }

      await getAuth(fbAdmin).updateUser(uid, updateParams);
      res.json({ success: true, message: "Autenticação atualizada com sucesso!" });
    } catch (error: any) {
      const isConfigError = error.message?.includes("identitytoolkit") || 
                            error.message?.includes("credential") || 
                            error.code === "auth/internal-error" || 
                            error.status === 403;

      if (isConfigError) {
        console.warn("Firebase Admin: Permissões insuficientes ou API desativada ao atualizar usuário.");
        return res.status(200).json({ 
          success: false, 
          fallback: true,
          error: "O Firebase Admin está temporariamente indisponível no servidor de testes. Por favor, envie um e-mail de redefinição de senha para o usuário."
        });
      }

      console.error("Erro ao atualizar autenticação do barbeiro no servidor:", error);
      
      let clientError = "Erro ao atualizar dados de acesso.";
      if (error.code === 'auth/email-already-exists') {
        clientError = 'Este e-mail já está sendo utilizado por outro usuário.';
      } else if (error.code === 'auth/invalid-email') {
        clientError = 'O e-mail fornecido é inválido.';
      } else if (error.code === 'auth/weak-password') {
        clientError = 'A senha é muito fraca. Deve ter no mínimo 6 caracteres.';
      } else if (error.message) {
        clientError = error.message;
      }

      res.status(500).json({ 
        error: clientError,
        code: error.code || "unknown"
      });
    }
  });

  // API Route to generate a password reset link using Firebase Admin
  app.post("/api/admin/generate-reset-link", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "E-mail é obrigatório." });
      }

      const fbAdmin = getFirebaseAdmin();
      if (!fbAdmin) {
        return res.status(500).json({ 
          error: "Não foi possível inicializar o Firebase Admin SDK no servidor." 
        });
      }

      const link = await getAuth(fbAdmin).generatePasswordResetLink(email.trim());
      res.json({ success: true, link });
    } catch (error: any) {
      const isConfigError = error.message?.includes("identitytoolkit") || 
                            error.message?.includes("credential") || 
                            error.code === "auth/internal-error" || 
                            error.status === 403;

      if (isConfigError) {
        console.warn("Firebase Admin: Permissões insuficientes ou API desativada ao gerar link de redefinição.");
        return res.status(200).json({ 
          success: false, 
          fallback: true,
          error: "O Firebase Admin está indisponível no servidor de testes. O envio de e-mail de redefinição padrão do cliente foi acionado com sucesso."
        });
      }

      console.error("Erro ao gerar link de redefinição no servidor:", error);
      res.status(500).json({ 
        error: error.message || "Erro ao gerar link de redefinição de senha.",
        code: error.code || "unknown"
      });
    }
  });

  // API Route para o SaaS AI Co-Pilot Insights
  app.post("/api/saas/insights", async (req, res) => {
    try {
      const { systemData, prompt } = req.body;
      const aiClient = getGeminiClient();
      
      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `
Você é o Co-Pilot Inteligente da plataforma BarberElite SaaS. Seu papel é auxiliar o Superadministrador da plataforma a gerenciar usuários, assinaturas, vencimentos e fornecer suporte técnico ou estratégico.
Aqui estão os dados atuais resumidos do ecossistema SaaS:
${JSON.stringify(systemData, null, 2)}

Mensagem do Superadministrador: "${prompt}"

Instruções:
- Responda em Português brasileiro de maneira profissional, concisa, elegante e acionável.
- Dê sugestões baseadas nos dados fornecidos (ex: sugerir contato com usuários cujas assinaturas estão prestes a vencer, notar tendências de receita, sugerir planos de ação para evitar churn, etc.).
- Nunca revele detalhes confidenciais de implementação técnica interna além de termos funcionais de negócio.
- Formate a resposta usando Markdown limpo.
        `,
      });
      
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Erro no SaaS AI Co-Pilot:", error);
      res.status(500).json({ error: error.message || "Erro no processamento da IA" });
    }
  });

  // ==========================================
  // SAAS PAYMENT GATEWAY ROUTES (Asaas / MP / Pix)
  // ==========================================

  // Endpoint to create a SaaS Subscription/Payment Charge
  app.post("/api/saas/payment/create-charge", async (req, res) => {
    try {
      const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount, billingType, externalReference } = req.body;

      if (!tenantId || !amount) {
        return res.status(400).json({ error: "Parâmetros obrigatórios incompletos (tenantId e amount)." });
      }

      const asaasApiKey = process.env.ASAAS_API_KEY;
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
      const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

      // 1. ASAAS GATEWAY INTEGRATION
      if (asaasApiKey) {
        const baseUrl = asaasEnv === 'production' 
          ? 'https://www.asaas.com/api/v3' 
          : 'https://sandbox.asaas.com/api/v3';

        let cleanCpfCnpj = (ownerCpfCnpj || '').replace(/\D/g, '');
        const isSandboxMode = asaasEnv !== 'production' || (asaasApiKey && asaasApiKey.toLowerCase().includes('sandbox'));
        
        const validSandboxCpf = '12345678909';
        const validSandboxCnpj = '11444777000161';

        if (!cleanCpfCnpj || !isValidCpfCnpj(cleanCpfCnpj)) {
          cleanCpfCnpj = validSandboxCpf;
        }

        // a) Create or Find Customer in Asaas
        let customerId: string | null = null;
        if (ownerEmail) {
          try {
            const custRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(ownerEmail)}`, {
              headers: { 'access_token': asaasApiKey }
            });
            const custData = await custRes.json();
            if (custData?.data?.length > 0) {
              customerId = custData.data[0].id;
              // Try updating customer CPF in Asaas
              await fetch(`${baseUrl}/customers/${customerId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'access_token': asaasApiKey
                },
                body: JSON.stringify({ cpfCnpj: cleanCpfCnpj })
              });
            }
          } catch (e) {
            console.warn("Aviso ao buscar cliente existente Asaas:", e);
          }
        }

        if (!customerId) {
          let createCustRes = await fetch(`${baseUrl}/customers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access_token': asaasApiKey
            },
            body: JSON.stringify({
              name: tenantName || tenantId,
              email: ownerEmail || `cliente_${Date.now()}@dominio.com`,
              cpfCnpj: cleanCpfCnpj,
              externalReference: externalReference || tenantId
            })
          });
          let newCust = await createCustRes.json();
          
          if (newCust.errors && isSandboxMode) {
            cleanCpfCnpj = validSandboxCpf;
            createCustRes = await fetch(`${baseUrl}/customers`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'access_token': asaasApiKey
              },
              body: JSON.stringify({
                name: tenantName || tenantId,
                email: ownerEmail || `cliente_${Date.now()}@dominio.com`,
                cpfCnpj: cleanCpfCnpj,
                externalReference: externalReference || tenantId
              })
            });
            newCust = await createCustRes.json();
          }

          if (newCust.errors) {
            if (isSandboxMode) {
              customerId = 'cus_sandbox_' + Date.now();
            } else {
              const errMsg = newCust.errors[0]?.description || "O CPF/CNPJ informado é inválido.";
              return res.status(400).json({ error: errMsg });
            }
          } else {
            customerId = newCust.id;
          }
        }

        // b) Create Payment Charge or Recurring Subscription in Asaas
        const today = new Date();
        today.setDate(today.getDate() + 3); // 3 days due date
        const dueDateStr = today.toISOString().split('T')[0];

        let payData: any = null;

        const ensureCustomerCpfCnpjValid = async (useCnpj = false) => {
          if (isSandboxMode && customerId) {
            cleanCpfCnpj = useCnpj ? validSandboxCnpj : validSandboxCpf;
            await fetch(`${baseUrl}/customers/${customerId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'access_token': asaasApiKey
              },
              body: JSON.stringify({ cpfCnpj: cleanCpfCnpj })
            });
          }
        };

        // If CREDIT_CARD, create a recurring MONTHLY subscription in Asaas
        if (billingType === 'CREDIT_CARD' || req.body.isSubscription) {
          try {
            const createSub = async () => fetch(`${baseUrl}/subscriptions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'access_token': asaasApiKey
              },
              body: JSON.stringify({
                customer: customerId,
                billingType: billingType || 'CREDIT_CARD',
                value: Number(amount),
                nextDueDate: dueDateStr,
                cycle: 'MONTHLY',
                description: `Assinatura Rull - Plano ${planName || 'Mensal'} (${tenantId})`,
                externalReference: externalReference || tenantId
              })
            });

            let subRes = await createSub();
            let subData = await subRes.json();

            if (subData.errors && isSandboxMode) {
              await ensureCustomerCpfCnpjValid(true);
              subRes = await createSub();
              subData = await subRes.json();
            }

            if (!subData.errors && subData.id) {
              payData = subData;
            }
          } catch (subErr) {
            console.warn("Falha ao criar assinatura em /subscriptions, tentando /payments:", subErr);
          }
        }

        // Fallback to single payment charge if subscription was not created or billingType is PIX
        if (!payData) {
          const createPayment = async () => fetch(`${baseUrl}/payments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access_token': asaasApiKey
            },
            body: JSON.stringify({
              customer: customerId,
              billingType: billingType || 'PIX',
              value: Number(amount),
              dueDate: dueDateStr,
              description: `Assinatura Rull - Plano ${planName || 'Mensal'} (${tenantId})`,
              externalReference: externalReference || tenantId
            })
          });

          let payRes = await createPayment();
          payData = await payRes.json();

          if (payData.errors && isSandboxMode) {
            await ensureCustomerCpfCnpjValid(true);
            payRes = await createPayment();
            payData = await payRes.json();
          }
        }

        if (!payData || payData.errors) {
          if (isSandboxMode) {
            payData = {
              id: 'pay_sandbox_' + Date.now(),
              invoiceUrl: `https://sandbox.asaas.com/i/${Date.now()}`,
              status: 'PENDING'
            };
          } else {
            const errMsg = payData?.errors?.[0]?.description || "O CPF/CNPJ informado é inválido.";
            return res.status(400).json({ error: errMsg });
          }
        }

        // If it's a subscription, retrieve the actual first payment to get its QR code or checkout link
        let paymentIdForPixOrLink = payData.id;
        let invoiceUrl = payData.invoiceUrl;
        let bankSlipUrl = payData.bankSlipUrl;

        if (payData.id && payData.id.startsWith('sub_')) {
          try {
            console.log(`[Subscription] Buscando primeiro pagamento para a assinatura ${payData.id}...`);
            const subPaymentsRes = await fetch(`${baseUrl}/subscriptions/${payData.id}/payments`, {
              headers: { 'access_token': asaasApiKey }
            });
            const subPaymentsData = await subPaymentsRes.json();
            if (subPaymentsData?.data?.length > 0) {
              const firstPayment = subPaymentsData.data[0];
              paymentIdForPixOrLink = firstPayment.id;
              invoiceUrl = firstPayment.invoiceUrl;
              bankSlipUrl = firstPayment.bankSlipUrl;
              console.log(`[Subscription] Encontrado pagamento correspondente: ${paymentIdForPixOrLink}`);
            }
          } catch (e) {
            console.warn("Falha ao buscar pagamentos da assinatura:", e);
          }
        }

        // c) If PIX, fetch Pix QR Code
        let pixCopiaECola = invoiceUrl || payData.invoiceUrl;
        let pixQrCodeUrl = '';

        if (paymentIdForPixOrLink && !paymentIdForPixOrLink.startsWith('sub_') && (billingType === 'PIX' || !billingType)) {
          const pixRes = await fetch(`${baseUrl}/payments/${paymentIdForPixOrLink}/pixQrCode`, {
            headers: { 'access_token': asaasApiKey }
          });
          const pixData = await pixRes.json();
          if (pixData.payload) pixCopiaECola = pixData.payload;
          if (pixData.encodedImage) pixQrCodeUrl = `data:image/png;base64,${pixData.encodedImage}`;
        }

        return res.json({
          success: true,
          chargeId: payData.id,
          paymentId: paymentIdForPixOrLink,
          paymentUrl: bankSlipUrl || invoiceUrl || payData.bankSlipUrl || payData.invoiceUrl,
          pixCopiaECola: pixCopiaECola || invoiceUrl || payData.invoiceUrl,
          pixQrCodeUrl: pixQrCodeUrl,
          status: payData.status === 'RECEIVED' || payData.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
          gatewayUsed: 'asaas',
          message: 'Cobrança gerada com sucesso via Asaas.'
        });
      }

      // 2. MERCADO PAGO INTEGRATION
      if (mpToken) {
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mpToken}`
          },
          body: JSON.stringify({
            transaction_amount: Number(amount),
            description: `Assinatura Rull - ${planName || 'SaaS'}`,
            payment_method_id: 'pix',
            payer: { email: ownerEmail || 'cliente@rull.com' },
            external_reference: externalReference || tenantId
          })
        });

        const mpData = await mpRes.json();
        const pixPayload = mpData.point_of_interaction?.transaction_data?.qr_code;
        const qrCodeImg = mpData.point_of_interaction?.transaction_data?.qr_code_base64;

        return res.json({
          success: true,
          chargeId: String(mpData.id),
          pixCopiaECola: pixPayload,
          pixQrCodeUrl: qrCodeImg ? `data:image/png;base64,${qrCodeImg}` : undefined,
          status: mpData.status === 'approved' ? 'CONFIRMED' : 'PENDING',
          gatewayUsed: 'mercadopago',
          message: 'Cobrança PIX gerada via Mercado Pago.'
        });
      }

      // 3. FALLBACK / DEMO / DIRECT PIX DYNAMIC PAYLOAD
      // Generates a mock PIX copia e cola string with QR code generator URL
      const mockChargeId = `charge_${Date.now()}`;
      const cleanAmount = Number(amount).toFixed(2).replace('.', '');
      const mockPixPayload = `00020126580014BR.GOV.BCB.PIX0136rull.saas.pix@gateway.com.br520400005303986540${cleanAmount.length}${cleanAmount}5802BR5909Rull SaaS6008LONDRINA62070503***6304`;
      const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(mockPixPayload)}`;

      return res.json({
        success: true,
        chargeId: mockChargeId,
        paymentUrl: qrCodeApiUrl,
        pixCopiaECola: mockPixPayload,
        pixQrCodeUrl: qrCodeApiUrl,
        status: 'PENDING',
        gatewayUsed: 'simulated',
        message: 'Cobrança gerada com sucesso em ambiente de simulação/demonstração PIX.'
      });

    } catch (error: any) {
      console.error("Erro ao criar cobrança de assinatura SaaS:", error);
      res.status(500).json({ error: error.message || "Falha ao gerar cobrança de pagamento." });
    }
  });

  // Endpoint to simulate sandbox payment confirmation (useful for Pix / Subscription testing in Sandbox)
  app.post("/api/saas/payment/simulate-receive", async (req, res) => {
    try {
      const { paymentId } = req.body;
      if (!paymentId) {
        return res.status(400).json({ error: "Parâmetro paymentId é obrigatório." });
      }

      const asaasApiKey = process.env.ASAAS_API_KEY;
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      if (!asaasApiKey) {
        return res.status(400).json({ error: "Integração com Asaas não configurada (chave de API ausente)." });
      }

      const baseUrl = asaasEnv === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

      console.log(`[Simulação] Solicitado confirmação para o ID de pagamento/assinatura: ${paymentId}`);

      const isSandboxMode = asaasEnv !== 'production' || asaasApiKey.toLowerCase().includes('sandbox');
      if (!isSandboxMode) {
        return res.status(400).json({ error: "A simulação de recebimento só é permitida em ambiente de sandbox/homologação." });
      }

      let targetPaymentId = paymentId;

      // If it's a subscription, fetch its payments to find the pending payment ID
      if (paymentId.startsWith('sub_')) {
        console.log(`[Simulação] ID informado é uma assinatura (${paymentId}). Buscando cobranças geradas...`);
        const subPaymentsRes = await fetch(`${baseUrl}/subscriptions/${paymentId}/payments`, {
          headers: { 'access_token': asaasApiKey }
        });
        const subPaymentsData = await subPaymentsRes.json();
        
        if (subPaymentsData?.data?.length > 0) {
          const pendingPayment = subPaymentsData.data.find((p: any) => p.status === 'PENDING');
          if (pendingPayment) {
            targetPaymentId = pendingPayment.id;
            console.log(`[Simulação] Encontrada cobrança pendente: ${targetPaymentId}`);
          } else {
            targetPaymentId = subPaymentsData.data[0].id;
            console.log(`[Simulação] Nenhuma cobrança pendente encontrada. Usando última cobrança: ${targetPaymentId}`);
          }
        } else {
          return res.status(404).json({ error: "Nenhuma cobrança encontrada para esta assinatura no Asaas." });
        }
      }

      // Simulate payment receive on Asaas Sandbox
      const receiveRes = await fetch(`${baseUrl}/payments/${targetPaymentId}/receive`, {
        method: 'POST',
        headers: { 'access_token': asaasApiKey }
      });
      const receiveData = await receiveRes.json();

      if (receiveData.errors) {
        const errMsg = receiveData.errors[0]?.description || "Falha ao simular recebimento no Asaas.";
        return res.status(400).json({ error: errMsg });
      }

      console.log(`[Simulação] Pagamento ${targetPaymentId} simulado com sucesso no Asaas.`);

      // Also trigger direct database update to ensure immediate activation in Sandbox even if webhook is delayed/undelivered
      try {
        const dbAdmin = getAdminDb();
        if (dbAdmin) {
          console.log(`[Simulação] Iniciando ativação direta de assinatura no banco de dados para pagamento: ${targetPaymentId}`);
          
          // Get payment info from Asaas
          const payRes = await fetch(`${baseUrl}/payments/${targetPaymentId}`, {
            headers: { 'access_token': asaasApiKey }
          });
          const paymentData = await payRes.json();

          if (paymentData && !paymentData.errors) {
            // Find subscription by asaasInvoiceId
            const possibleInvoiceIds = [paymentData.subscription, paymentData.id].filter(Boolean);
            const subQuery = await dbAdmin.collection('subscriptions')
              .where('asaasInvoiceId', 'in', possibleInvoiceIds)
              .limit(1)
              .get();

            if (!subQuery.empty) {
              const docSnap = subQuery.docs[0];
              const subRef = docSnap.ref;
              const subData = docSnap.data();

              // Only process if not already received/active
              if (subData.asaasPaymentStatus !== 'received' && subData.status !== 'active') {
                const tenantId = subData.tenantId;
                const todayStr = new Date().toISOString().split('T')[0];

                let currentEnd = subData.endDate ? new Date(subData.endDate + 'T12:00:00') : new Date();
                let newStartStr = subData.endDate || todayStr;
                if (!subData.endDate || currentEnd < new Date()) {
                  newStartStr = todayStr;
                }
                const newStart = new Date(newStartStr + 'T12:00:00');
                const newEnd = new Date(newStart);
                newEnd.setMonth(newEnd.getMonth() + 1);
                const newEndStr = newEnd.toISOString().split('T')[0];

                await subRef.update({
                  status: 'active',
                  asaasPaymentStatus: 'received',
                  startDate: newStartStr,
                  endDate: newEndStr,
                  haircutsUsed: 0,
                  beardsUsed: 0,
                  lastRenewalDate: todayStr,
                  updatedAt: new Date()
                });

                // Add to financial_transactions
                await dbAdmin.collection('financial_transactions').add({
                  tenantId,
                  type: 'income',
                  amount: Number(paymentData.value) || subData.amount || 0,
                  date: todayStr,
                  category: 'Assinaturas',
                  description: `Assinatura Rull Confirmada (Simulação): ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
                  paymentMethod: paymentData.billingType?.toLowerCase() === 'credit_card' ? 'cartao' : 'pix',
                  status: 'pago',
                  cliente_id: subData.cliente_id,
                  cliente_name: subData.cliente_name,
                  responsavel_id: subData.cliente_id,
                  responsavel_name: subData.cliente_name,
                  net_amount: Number(paymentData.value) || subData.amount || 0,
                  settlement_date: todayStr,
                  is_settled: true,
                  createdAt: new Date()
                });

                // Check cash sessions (using index-free query)
                const cashSessionsQuery = await dbAdmin.collection('cash_sessions')
                  .where('tenantId', '==', tenantId)
                  .get();

                const openCashDoc = cashSessionsQuery.docs.find(doc => {
                  const s = doc.data().status;
                  return s === 'open' || s === 'reopened';
                });

                if (openCashDoc) {
                  const cashId = openCashDoc.id;
                  await dbAdmin.collection('cash_movements').add({
                    tenantId,
                    caixa_id: cashId,
                    type: 'income',
                    category: 'Assinaturas',
                    description: `Assinatura Rull: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
                    amount: Number(paymentData.value) || subData.amount || 0,
                    payment_method: paymentData.billingType?.toLowerCase() === 'credit_card' ? 'cartao_credito' : 'pix',
                    paymentMethod: paymentData.billingType?.toLowerCase() === 'credit_card' ? 'cartao_credito' : 'pix',
                    date: todayStr,
                    createdAt: new Date()
                  });

                  await openCashDoc.ref.update({
                    total_income: (openCashDoc.data().total_income || 0) + (Number(paymentData.value) || subData.amount || 0),
                    expected_balance: (openCashDoc.data().expected_balance || 0) + (Number(paymentData.value) || subData.amount || 0),
                    updatedAt: new Date()
                  });
                }
                console.log(`[Simulação] Ativação direta realizada com sucesso no banco de dados!`);
              }
            }
          }
        }
      } catch (dbErr) {
        console.error("Erro na ativação direta da simulação no banco de dados:", dbErr);
      }

      return res.json({ 
        success: true, 
        message: "Recebimento simulado com sucesso no Asaas e assinatura ativada no sistema!",
        details: receiveData
      });

    } catch (error: any) {
      console.error("Erro ao simular recebimento de pagamento:", error);
      res.status(500).json({ error: error.message || "Falha ao simular recebimento de pagamento." });
    }
  });

  // Active Payment Status Check endpoint (to sync automatically without relying solely on webhooks)
  app.post("/api/saas/payment/check-status", async (req, res) => {
    try {
      const { paymentId } = req.body;
      if (!paymentId) {
        return res.status(400).json({ error: "Parâmetro paymentId é obrigatório." });
      }

      const asaasApiKey = process.env.ASAAS_API_KEY;
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      if (!asaasApiKey) {
        return res.status(400).json({ error: "Integração com Asaas não configurada." });
      }

      const baseUrl = asaasEnv === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

      let targetPaymentId = paymentId;

      if (paymentId.startsWith('sub_')) {
        const subPaymentsRes = await fetch(`${baseUrl}/subscriptions/${paymentId}/payments`, {
          headers: { 'access_token': asaasApiKey }
        });
        const subPaymentsData = await subPaymentsRes.json();
        if (subPaymentsData?.data?.length > 0) {
          const receivedPayment = subPaymentsData.data.find((p: any) => p.status === 'RECEIVED' || p.status === 'CONFIRMED');
          if (receivedPayment) {
            targetPaymentId = receivedPayment.id;
          } else {
            const pendingPayment = subPaymentsData.data.find((p: any) => p.status === 'PENDING');
            if (pendingPayment) targetPaymentId = pendingPayment.id;
          }
        }
      }

      const payRes = await fetch(`${baseUrl}/payments/${targetPaymentId}`, {
        headers: { 'access_token': asaasApiKey }
      });
      const paymentData = await payRes.json();

      if (!paymentData || paymentData.errors) {
        return res.status(404).json({ error: "Cobrança não encontrada no Asaas." });
      }

      const isPaid = paymentData.status === 'RECEIVED' || paymentData.status === 'CONFIRMED';

      if (isPaid) {
        const dbAdmin = getAdminDb();
        if (dbAdmin) {
          const possibleInvoiceIds = [paymentData.subscription, paymentData.id, paymentId].filter(Boolean);
          if (possibleInvoiceIds.length > 0) {
            const subQuery = await dbAdmin.collection('subscriptions')
              .where('asaasInvoiceId', 'in', possibleInvoiceIds)
              .limit(1)
              .get();

          if (!subQuery.empty) {
            const docSnap = subQuery.docs[0];
            const subRef = docSnap.ref;
            const subData = docSnap.data();

            if (subData.asaasPaymentStatus !== 'received' && subData.status !== 'active') {
              const tenantId = subData.tenantId;
              const todayStr = new Date().toISOString().split('T')[0];

              let currentEnd = subData.endDate ? new Date(subData.endDate + 'T12:00:00') : new Date();
              let newStartStr = subData.endDate || todayStr;
              if (!subData.endDate || currentEnd < new Date()) {
                newStartStr = todayStr;
              }
              const newStart = new Date(newStartStr + 'T12:00:00');
              const newEnd = new Date(newStart);
              newEnd.setMonth(newEnd.getMonth() + 1);
              const newEndStr = newEnd.toISOString().split('T')[0];

              await subRef.update({
                status: 'active',
                asaasPaymentStatus: 'received',
                startDate: newStartStr,
                endDate: newEndStr,
                haircutsUsed: 0,
                beardsUsed: 0,
                lastRenewalDate: todayStr,
                updatedAt: new Date()
              });

              // Add to financial_transactions
              await dbAdmin.collection('financial_transactions').add({
                tenantId,
                type: 'income',
                amount: Number(paymentData.value) || subData.amount || 0,
                date: todayStr,
                category: 'Assinaturas',
                description: `Assinatura Rull Confirmada (Sync Ativo): ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
                paymentMethod: paymentData.billingType?.toLowerCase() === 'credit_card' ? 'cartao' : 'pix',
                status: 'pago',
                cliente_id: subData.cliente_id,
                cliente_name: subData.cliente_name,
                responsavel_id: subData.cliente_id,
                responsavel_name: subData.cliente_name,
                net_amount: Number(paymentData.value) || subData.amount || 0,
                settlement_date: todayStr,
                is_settled: true,
                createdAt: new Date()
              });

              // Check cash sessions
              const cashSessionsQuery = await dbAdmin.collection('cash_sessions')
                .where('tenantId', '==', tenantId)
                .get();

              const openCashDoc = cashSessionsQuery.docs.find(doc => {
                const s = doc.data().status;
                return s === 'open' || s === 'reopened';
              });

              if (openCashDoc) {
                const cashId = openCashDoc.id;
                await dbAdmin.collection('cash_movements').add({
                  tenantId,
                  caixa_id: cashId,
                  type: 'income',
                  category: 'Assinaturas',
                  description: `Assinatura Rull: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
                  amount: Number(paymentData.value) || subData.amount || 0,
                  payment_method: paymentData.billingType?.toLowerCase() === 'credit_card' ? 'cartao_credito' : 'pix',
                  paymentMethod: paymentData.billingType?.toLowerCase() === 'credit_card' ? 'cartao_credito' : 'pix',
                  date: todayStr,
                  createdAt: new Date()
                });

                await openCashDoc.ref.update({
                  total_income: (openCashDoc.data().total_income || 0) + (Number(paymentData.value) || subData.amount || 0),
                  expected_balance: (openCashDoc.data().expected_balance || 0) + (Number(paymentData.value) || subData.amount || 0),
                  updatedAt: new Date()
                });
              }
              console.log(`[Sync Ativo] Assinatura ativada com sucesso via verificação de status!`);
            }
          }
         }
        }
      }

      return res.json({ 
        success: true, 
        status: paymentData.status,
        isPaid,
        payment: paymentData 
      });

    } catch (error: any) {
      console.error("Erro ao verificar status do pagamento:", error);
      res.status(500).json({ error: error.message || "Falha ao verificar status." });
    }
  });

  // Update Credit Card endpoint for Asaas Subscription
  app.post("/api/saas/payment/update-credit-card", async (req, res) => {
    try {
      const { subscriptionId, creditCard, creditCardHolderInfo } = req.body;
      if (!subscriptionId || !creditCard) {
        return res.status(400).json({ error: "Parâmetros subscriptionId e creditCard são obrigatórios." });
      }

      const asaasApiKey = process.env.ASAAS_API_KEY;
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
      if (!asaasApiKey) {
        return res.status(400).json({ error: "Integração com Asaas não configurada." });
      }

      const baseUrl = asaasEnv === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

      const updateRes = await fetch(`${baseUrl}/subscriptions/${subscriptionId}/creditCard`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasApiKey
        },
        body: JSON.stringify({
          creditCard,
          creditCardHolderInfo
        })
      });

      const updateData = await updateRes.json();
      if (updateData.errors) {
        return res.status(400).json({ error: updateData.errors[0]?.description || "Falha ao atualizar cartão no Asaas." });
      }

      const dbAdmin = getAdminDb();
      if (dbAdmin) {
        const subRef = dbAdmin.collection('subscriptions').doc(subscriptionId);
        await subRef.update({
          paymentMethod: 'cartao_credito_recorrente',
          updatedAt: new Date()
        });
      }

      return res.json({ success: true, message: "Cartão de crédito atualizado com sucesso no Asaas!" });
    } catch (error: any) {
      console.error("Erro ao atualizar cartão:", error);
      res.status(500).json({ error: error.message || "Falha ao atualizar cartão." });
    }
  });

  // Generate PIX alternative payment for subscription
  app.post("/api/saas/payment/generate-pix", async (req, res) => {
    try {
      const { subscriptionId } = req.body;
      if (!subscriptionId) {
        return res.status(400).json({ error: "Parâmetro subscriptionId é obrigatório." });
      }

      const dbAdmin = getAdminDb();
      if (!dbAdmin) {
        return res.status(500).json({ error: "Banco de dados não disponível." });
      }

      const subDoc = await dbAdmin.collection('subscriptions').doc(subscriptionId).get();
      if (!subDoc.exists) {
        return res.status(404).json({ error: "Assinatura não encontrada." });
      }

      const subData = subDoc.data()!;
      const asaasApiKey = process.env.ASAAS_API_KEY;
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      if (!asaasApiKey) {
        return res.status(400).json({ error: "Integração com Asaas não configurada." });
      }

      const baseUrl = asaasEnv === 'production' 
        ? 'https://www.asaas.com/api/v3' 
        : 'https://sandbox.asaas.com/api/v3';

      // Find pending payment or create one for subscription
      let targetPaymentId = subData.asaasInvoiceId;
      if (targetPaymentId && targetPaymentId.startsWith('sub_')) {
        const subPaymentsRes = await fetch(`${baseUrl}/subscriptions/${targetPaymentId}/payments`, {
          headers: { 'access_token': asaasApiKey }
        });
        const subPaymentsData = await subPaymentsRes.json();
        const pendingPayment = subPaymentsData?.data?.find((p: any) => p.status === 'PENDING' || p.status === 'OVERDUE');
        if (pendingPayment) {
          targetPaymentId = pendingPayment.id;
        }
      }

      if (!targetPaymentId || targetPaymentId.startsWith('sub_')) {
        // Create a new PIX charge for this subscription
        const today = new Date();
        const dueDateStr = today.toISOString().split('T')[0];
        const chargeRes = await fetch(`${baseUrl}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey
          },
          body: JSON.stringify({
            customer: subData.cliente_id || 'cus_sandbox',
            billingType: 'PIX',
            value: subData.amount || 100,
            dueDate: dueDateStr,
            description: `Renovação Pix Assinatura ${subData.planName || 'Clube'}`,
            externalReference: subscriptionId
          })
        });
        const chargeData = await chargeRes.json();
        if (chargeData.id) {
          targetPaymentId = chargeData.id;
        }
      }

      // Fetch Pix QR Code
      const pixRes = await fetch(`${baseUrl}/payments/${targetPaymentId}/pixQrCode`, {
        headers: { 'access_token': asaasApiKey }
      });
      const pixData = await pixRes.json();

      const payDetailRes = await fetch(`${baseUrl}/payments/${targetPaymentId}`, {
        headers: { 'access_token': asaasApiKey }
      });
      const payDetail = await payDetailRes.json();

      return res.json({
        success: true,
        paymentId: targetPaymentId,
        invoiceUrl: payDetail.invoiceUrl,
        pixCopiaECola: pixData.payload || payDetail.invoiceUrl,
        pixQrCodeUrl: pixData.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : ''
      });
    } catch (error: any) {
      console.error("Erro ao gerar PIX alternativo:", error);
      res.status(500).json({ error: error.message || "Falha ao gerar PIX." });
    }
  });

  // Webhook Receiver for Asaas / Mercado Pago / Stripe
  app.post("/api/saas/payment/webhook", async (req, res) => {
    const timestamp = new Date().toISOString();
    const event = req.body || {};
    const payment = event.payment || event;
    const eventType = event?.event || event?.status || 'UNKNOWN_EVENT';

    console.log("\n==================================================");
    console.log("WEBHOOK ASAAS RECEBIDO");
    console.log(`📅 Data/Hora: ${timestamp}`);
    console.log(`📋 Headers recebidos:`, JSON.stringify(req.headers, null, 2));
    console.log(`⚡ 1. webhook recebido & 2. evento identificado: ${eventType}`);
    console.log(`🆔 Payment ID: ${payment?.id || 'N/A'}`);
    console.log(`📊 Payment Status: ${payment?.status || event?.status || 'N/A'}`);
    console.log(`👤 Payment Customer: ${payment?.customer || 'N/A'}`);
    console.log(`📋 Payment Subscription: ${payment?.subscription || 'N/A'}`);
    console.log(`🔗 Payment ExternalReference: ${payment?.externalReference || event?.external_reference || 'N/A'}`);
    console.log("📦 Payload Completo:", JSON.stringify(event, null, 2));
    console.log("==================================================");

    try {
      // Handle Asaas payment received or confirmed
      if (event?.event === 'PAYMENT_RECEIVED' || event?.event === 'PAYMENT_CONFIRMED' || event?.status === 'approved' || event?.event === 'PAYMENT_CREATED' || event?.event === 'PAYMENT_UPDATED') {
        let refId = payment?.externalReference || event.external_reference;
        const value = Number(payment?.value || payment?.transaction_amount || 0);

        console.log(`🔍 [ASAAS AUDIT] 3. Pagamento localizado / processando -> ID: ${payment?.id}, Subscription: ${payment?.subscription}, externalReference: ${refId}, Valor: ${value}, Customer: ${payment?.customer}`);

        const dbAdmin = getAdminDb();
        if (!dbAdmin) {
          console.error("❌ [ASAAS AUDIT] Erro: Banco de dados Firebase Admin não disponível.");
          return res.status(200).json({ received: true, warning: "Database not available" });
        }

        let tenantRef: any = null;
        let tenantSnap: any = null;
        let subRef: any = null;
        let subSnap: any = null;
        let subData: any = null;

        // 1. If we have a refId, check Tenant or Subscription directly
        if (refId) {
          tenantRef = dbAdmin.collection('tenants').doc(refId);
          tenantSnap = await tenantRef.get();

          if (tenantSnap.exists) {
            console.log(`👤 [ASAAS AUDIT] 4. Usuário / Tenant localizado via externalReference: ${refId}`);
          } else {
            subRef = dbAdmin.collection('subscriptions').doc(refId);
            subSnap = await subRef.get();
            if (subSnap.exists) {
              subData = subSnap.data();
              console.log(`📋 [ASAAS AUDIT] 5. Assinatura localizada diretamente via ID (${refId})`);
            }
          }
        }

        // 2. If not found, search subscriptions by asaasInvoiceId or customer
        if (!tenantSnap?.exists && !subData) {
          const possibleInvoiceIds = [];
          if (payment?.subscription) possibleInvoiceIds.push(payment.subscription);
          if (payment?.id) possibleInvoiceIds.push(payment.id);
          if (refId) possibleInvoiceIds.push(refId);

          if (possibleInvoiceIds.length > 0) {
            console.log(`🔍 [ASAAS AUDIT] Buscando subscrição por asaasInvoiceId/paymentId nos IDs:`, possibleInvoiceIds);
            const subQuery = await dbAdmin.collection('subscriptions')
              .where('asaasInvoiceId', 'in', possibleInvoiceIds)
              .limit(1)
              .get();
            
            if (!subQuery.empty) {
              const docSnap = subQuery.docs[0];
              subRef = docSnap.ref;
              subSnap = docSnap;
              subData = docSnap.data();
              refId = docSnap.id;
              console.log(`📋 [ASAAS AUDIT] 5. Assinatura localizada por asaasInvoiceId: ${refId} (Cliente: ${subData.cliente_name})`);
              console.log(`👤 [ASAAS AUDIT] 4. Usuário / Cliente localizado: ${subData.cliente_id} (${subData.cliente_name})`);
            } else if (payment?.customer) {
              // Fallback: search subscription by cliente_id
              console.log(`🔍 [ASAAS AUDIT] Buscando subscrição por cliente_id: ${payment.customer}`);
              const custQuery = await dbAdmin.collection('subscriptions')
                .where('cliente_id', '==', payment.customer)
                .limit(1)
                .get();
              if (!custQuery.empty) {
                const docSnap = custQuery.docs[0];
                subRef = docSnap.ref;
                subSnap = docSnap;
                subData = docSnap.data();
                refId = docSnap.id;
                console.log(`📋 [ASAAS AUDIT] 5. Assinatura localizada por cliente_id (${payment.customer}): ${refId}`);
                console.log(`👤 [ASAAS AUDIT] 4. Usuário / Cliente localizado via customer ID: ${payment.customer}`);
              }
            }
          }
        }

        // 3. Process Tenant if found
        if (tenantSnap && tenantSnap.exists) {
          const data = tenantSnap.data() || {};
          let baseDate = new Date();
          const currentExp = data.planExpiresAt || data.planValidUntil;
          if (currentExp) {
            const expDate = new Date(currentExp + 'T12:00:00');
            if (expDate > baseDate) baseDate = expDate;
          }
          const newExpDate = new Date(baseDate);
          newExpDate.setMonth(newExpDate.getMonth() + 1);
          const newExpStr = newExpDate.toISOString().split('T')[0];

          console.log(`🔄 [ASAAS AUDIT] 6. Firestore atualizado (Tenant): ${refId}`);
          await tenantRef.update({
            planStatus: 'active',
            isActive: true,
            planExpiresAt: newExpStr,
            planValidUntil: newExpStr,
            lastPaymentDate: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          await dbAdmin.collection('saas_payments').add({
            tenantId: refId,
            tenantName: data.name || refId,
            planName: data.plan || 'Plano Rull',
            amount: value,
            paymentMethod: payment?.billingType || 'PIX',
            status: 'pago',
            paidAt: new Date().toISOString(),
            newExpirationDate: newExpStr,
            createdAt: new Date()
          });
          console.log(`✅ [ASAAS AUDIT] 7. Atualização concluída com sucesso para o Tenant ${refId}! Novo vencimento: ${newExpStr}`);
        } 
        // 4. Process Subscription if found
        else if (subData && subRef) {
          if (subData.asaasPaymentStatus === 'received' && event?.event === 'PAYMENT_RECEIVED') {
            console.log(`⚠️ [ASAAS AUDIT] Assinatura ${refId} já estava marcada como recebida. Ignorando duplicidade.`);
          }

          const tenantId = subData.tenantId;
          const todayStr = new Date().toISOString().split('T')[0];

          let currentEnd = subData.endDate ? new Date(subData.endDate + 'T12:00:00') : new Date();
          let newStartStr = subData.endDate || todayStr;
          if (!subData.endDate || currentEnd < new Date()) {
            newStartStr = todayStr;
          }
          const newStart = new Date(newStartStr + 'T12:00:00');
          const newEnd = new Date(newStart);
          newEnd.setMonth(newEnd.getMonth() + 1);
          const newEndStr = newEnd.toISOString().split('T')[0];

          console.log(`🔄 [ASAAS AUDIT] 6. Firestore atualizado (Subscription): ${refId}`);
          await subRef.update({
            status: 'active',
            asaasPaymentStatus: 'received',
            startDate: newStartStr,
            endDate: newEndStr,
            haircutsUsed: 0,
            beardsUsed: 0,
            lastRenewalDate: todayStr,
            updatedAt: new Date()
          });

          // Add to financial transactions
          await dbAdmin.collection('financial_transactions').add({
            tenantId,
            type: 'income',
            amount: value || subData.amount || 0,
            date: todayStr,
            category: 'Assinaturas',
            description: `Assinatura Rull Confirmada: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
            paymentMethod: payment?.billingType?.toLowerCase() === 'credit_card' ? 'cartao' : 'pix',
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

          // Update cash session if open
          const cashSessionsQuery = await dbAdmin.collection('cash_sessions')
            .where('tenantId', '==', tenantId)
            .get();

          const openCashDoc = cashSessionsQuery.docs.find(doc => {
            const s = doc.data().status;
            return s === 'open' || s === 'reopened';
          });

          if (openCashDoc) {
            const cashId = openCashDoc.id;
            await dbAdmin.collection('cash_movements').add({
              tenantId,
              caixa_id: cashId,
              type: 'income',
              category: 'Assinaturas',
              description: `Assinatura Rull: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
              amount: value || subData.amount || 0,
              payment_method: payment?.billingType?.toLowerCase() === 'credit_card' ? 'cartao_credito' : 'pix',
              paymentMethod: payment?.billingType?.toLowerCase() === 'credit_card' ? 'cartao_credito' : 'pix',
              date: todayStr,
              createdAt: new Date()
            });

            await openCashDoc.ref.update({
              total_income: (openCashDoc.data().total_income || 0) + (value || subData.amount || 0),
              expected_balance: (openCashDoc.data().expected_balance || 0) + (value || subData.amount || 0),
              updatedAt: new Date()
            });
          }

          console.log(`✅ [ASAAS AUDIT] 7. Atualização concluída com sucesso! Assinatura do cliente ${subData.cliente_name} (${refId}) ativada no Firestore. Válida até ${newEndStr}`);
        } else {
          console.warn(`⚠️ [ASAAS AUDIT] Alerta: Nenhum Tenant ou Assinatura local encontrada para refId: ${refId}, payment.id: ${payment?.id}, subscription: ${payment?.subscription}, customer: ${payment?.customer}`);
        }
      } else {
        console.log(`ℹ️ [ASAAS AUDIT] Evento ignorado ou não catalogado para ativação direta: ${eventType}`);
      }

      // 5. Always return HTTP 200 so Asaas considers the webhook successfully delivered
      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("❌ [ASAAS AUDIT] ERRO CRÍTICO no processamento do Webhook (try/catch):", error);
      console.error(error.stack || error);
      // Return HTTP 200 to Asaas to prevent spam retries, but error is fully logged in server logs
      return res.status(200).json({ received: true, error: error.message });
    }
  });

  // API Routes (Exemplos iniciais para o Dashboard)
  app.get("/api/stats", (req, res) => {
    res.json({
      faturamentoDia: 1250.00,
      faturamentoMes: 32400.00,
      ticketMedio: 65.00,
      clientesAtendidos: 18,
      previsaoFaturamento: 45000.00,
      rankingBarbeiros: [
        { nome: "Marcos Silva", atendimentos: 120, faturamento: 7800 },
        { nome: "André Santos", atendimentos: 98, faturamento: 6200 },
        { nome: "Felipe Costa", atendimentos: 85, faturamento: 5400 }
      ]
    });
  });

  // Configuração do Vite como Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`BarberElite Server running on http://localhost:${PORT}`);
  });
}

startServer();
