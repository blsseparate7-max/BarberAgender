import express from "express";
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
        // 1. Check if service account JSON string is provided in env
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          try {
            let raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
            // Handle quotes added by some environment variable interfaces
            if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
              raw = raw.slice(1, -1);
            }
            // Handle base64 encoded string if provided in base64
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
            console.log("✅ Firebase Admin initialized with FIREBASE_SERVICE_ACCOUNT JSON credentials.");
          } catch (jsonErr) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", jsonErr);
          }
        }
        // 2. Check if individual credentials are provided
        else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
          const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
          adminApp = initializeApp({
            credential: cert({
              projectId: process.env.FIREBASE_PROJECT_ID || "gbagender",
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: privateKey
            }),
            projectId: process.env.FIREBASE_PROJECT_ID || "gbagender"
          });
          console.log("✅ Firebase Admin initialized with FIREBASE_PRIVATE_KEY & CLIENT_EMAIL.");
        }

        // 3. Try applicationDefault first for standard GCP/Cloud Run context
        if (!adminApp) {
          try {
            adminApp = initializeApp({
              credential: applicationDefault(),
              projectId: "gbagender"
            });
            console.log("✅ Firebase Admin initialized with applicationDefault.");
          } catch (adcErr: any) {
            console.warn("Could not initialize with applicationDefault:", adcErr.message || adcErr);
          }
        }

        // 4. Fallback try basic initialization
        if (!adminApp) {
          adminApp = initializeApp({
            projectId: "gbagender"
          });
          console.log("⚠️ Firebase Admin initialized with basic projectId fallback.");
        }
      } else {
        adminApp = apps[0];
      }
    } catch (err: any) {
      console.warn("Could not initialize Firebase Admin SDK, attempting fallback:", err.message || err);
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

export const app = express();

// Middlewares essenciais
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de CORS para permitir chamadas seguras da Vercel e navegadores
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, access_token");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

  // API Route to reset another user's password (e.g. barber) using Firebase Admin
  app.post(["/api/admin/reset-password", "/admin/reset-password"], async (req, res) => {
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
  app.post(["/api/admin/create-user-auth", "/admin/create-user-auth"], async (req, res) => {
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
  app.post(["/api/admin/update-user-auth", "/admin/update-user-auth"], async (req, res) => {
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
  app.post(["/api/admin/generate-reset-link", "/admin/generate-reset-link"], async (req, res) => {
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
  app.post(["/api/saas/insights", "/saas/insights"], async (req, res) => {
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
function getAsaasBaseUrl(env?: string): string {
  const cleanEnv = (env || process.env.ASAAS_ENVIRONMENT || 'sandbox').toLowerCase().trim();
  if (cleanEnv === 'production' || cleanEnv === 'prod') {
    return 'https://api.asaas.com/v3';
  }
  return 'https://sandbox.asaas.com/api/v3';
}

  // SAAS PAYMENT GATEWAY ROUTES (Asaas / MP / Pix)
  // ==========================================

  // Endpoint to create a SaaS Subscription/Payment Charge
  app.post(["/api/saas/payment/create-charge", "/saas/payment/create-charge", "/payment/create-charge", "/create-charge"], async (req, res) => {
    try {
      const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount, billingType, externalReference } = req.body;

      if (!tenantId || !amount) {
        return res.status(400).json({ error: "Parâmetros obrigatórios incompletos (tenantId e amount)." });
      }

      const rawAsaasKey = process.env.ASAAS_API_KEY || '';
      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
      const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

      // 1. ASAAS GATEWAY INTEGRATION
      if (asaasApiKey) {
        let baseUrl = getAsaasBaseUrl(asaasEnv);

        let cleanCpfCnpj = (ownerCpfCnpj || '').replace(/\D/g, '');
        let isSandboxMode = asaasEnv !== 'production' || (asaasApiKey && asaasApiKey.toLowerCase().includes('sandbox'));
        
        const validSandboxCpf = '12345678909';
        const validSandboxCnpj = '11444777000161';

        if (!cleanCpfCnpj || !isValidCpfCnpj(cleanCpfCnpj)) {
          cleanCpfCnpj = validSandboxCpf;
        }

        // Helper to fetch from Asaas with auto-fallback between sandbox and production URLs on token error
        const fetchAsaasApi = async (path: string, options: any = {}) => {
          const headers = {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey,
            ...(options.headers || {})
          };

          try {
            const primaryRes = await fetch(`${baseUrl}${path}`, { ...options, headers });
            const primaryData = await primaryRes.json();

            // If invalid_access_token, try the alternate Asaas URL (prod vs sandbox)
            if (primaryData?.errors?.some((e: any) => e.code === 'invalid_access_token')) {
              const altBaseUrl = baseUrl.includes('sandbox') 
                ? 'https://api.asaas.com/v3' 
                : 'https://sandbox.asaas.com/api/v3';
              console.warn(`⚠️ [Asaas Token Error] Tentando URL alternativa: ${altBaseUrl}${path}`);
              
              const altRes = await fetch(`${altBaseUrl}${path}`, { ...options, headers });
              const altData = await altRes.json();
              if (!altData.errors) {
                baseUrl = altBaseUrl; // switch baseUrl if alt URL worked
                isSandboxMode = altBaseUrl.includes('sandbox');
                return altData;
              }
            }
            return primaryData;
          } catch (err) {
            console.warn(`⚠️ [Asaas Fetch Error] Falha na requisição para ${baseUrl}${path}:`, err);
            return { errors: [{ description: "Falha de conexão com a API do Asaas." }] };
          }
        };

        // a) Create or Find Customer in Asaas
        let customerId: string | null = null;
        if (ownerEmail) {
          try {
            const custData = await fetchAsaasApi(`/customers?email=${encodeURIComponent(ownerEmail)}`);
            if (custData?.data && Array.isArray(custData.data) && custData.data.length > 0) {
              customerId = custData.data[0]?.id || null;
              // Try updating customer CPF in Asaas if valid
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
            const hasInvalidToken = Array.isArray(newCust.errors) && newCust.errors.some((e: any) => e.code === 'invalid_access_token');
            if (isSandboxMode || hasInvalidToken) {
              console.warn("[Asaas Sandbox] Token inválido ou erro no Asaas Sandbox, utilizando fallback para testes local:", newCust.errors);
              customerId = 'cus_sandbox_' + Date.now();
            } else {
              const errMsg = (Array.isArray(newCust.errors) && newCust.errors[0]?.description) || "O CPF/CNPJ ou dados informados são inválidos no Asaas.";
              console.error("[Asaas Error] Falha ao criar cliente:", newCust.errors);
              return res.status(400).json({ error: errMsg, details: newCust.errors });
            }
          } else if (newCust?.id) {
            customerId = newCust.id;
          } else {
            customerId = 'cus_sandbox_' + Date.now();
          }
        }

        // b) Create Payment Charge or Recurring Subscription in Asaas
        const today = new Date();
        today.setDate(today.getDate() + 3); // 3 days due date
        const dueDateStr = today.toISOString().split('T')[0];

        let payData: any = null;

        const ensureCustomerCpfCnpjValid = async (useCnpj = false) => {
          if (isSandboxMode && customerId && typeof customerId === 'string' && !customerId.startsWith('cus_sandbox_')) {
            cleanCpfCnpj = useCnpj ? validSandboxCnpj : validSandboxCpf;
            await fetchAsaasApi(`/customers/${customerId}`, {
              method: 'PUT',
              body: JSON.stringify({ cpfCnpj: cleanCpfCnpj })
            });
          }
        };

        const isRealCustomerId = customerId && typeof customerId === 'string' && !customerId.startsWith('cus_sandbox_');

        // If CREDIT_CARD, create a recurring MONTHLY subscription in Asaas
        if ((billingType === 'CREDIT_CARD' || req.body?.isSubscription) && isRealCustomerId) {
          try {
            const createSub = async () => fetchAsaasApi('/subscriptions', {
              method: 'POST',
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

            let subData = await createSub();

            if (subData?.errors && isSandboxMode) {
              await ensureCustomerCpfCnpjValid(true);
              subData = await createSub();
            }

            if (subData && !subData.errors && subData.id) {
              payData = subData;
            } else if (subData?.errors) {
              console.warn("Retorno de erro ao criar assinatura no Asaas:", subData.errors);
              payData = subData;
            }
          } catch (subErr) {
            console.warn("Falha ao criar assinatura em /subscriptions, tentando /payments:", subErr);
          }
        }

        // Fallback to single payment charge if subscription was not created or billingType is PIX
        if ((!payData || payData?.errors) && isRealCustomerId) {
          const createPayment = async () => fetchAsaasApi('/payments', {
            method: 'POST',
            body: JSON.stringify({
              customer: customerId,
              billingType: billingType || 'PIX',
              value: Number(amount),
              dueDate: dueDateStr,
              description: `Assinatura Rull - Plano ${planName || 'Mensal'} (${tenantId})`,
              externalReference: externalReference || tenantId
            })
          });

          payData = await createPayment();

          if (payData?.errors && isSandboxMode) {
            await ensureCustomerCpfCnpjValid(true);
            payData = await createPayment();
          }
        }

        if (!payData || payData?.errors) {
          if (isSandboxMode || !isRealCustomerId) {
            console.warn("[Asaas Sandbox] Utilizando cobrança simulada para testes no Sandbox.");
            payData = {
              id: 'pay_sandbox_' + Date.now(),
              invoiceUrl: `https://sandbox.asaas.com/i/${Date.now()}`,
              status: 'PENDING'
            };
          } else {
            const hasInvalidToken = Array.isArray(payData?.errors) && payData.errors.some((e: any) => e.code === 'invalid_access_token');
            let errMsg = (Array.isArray(payData?.errors) && payData.errors[0]?.description) || "Erro ao gerar cobrança no Asaas. Verifique os dados fornecidos.";
            if (hasInvalidToken) {
              errMsg = "A chave de API do Asaas é inválida ou você inseriu o Token de Webhook. No painel do Asaas, acesse Configurações -> Integrações -> Chaves de API para copiar a Chave de API correta.";
            }
            console.error("[Asaas Error] Falha ao criar cobrança/assinatura:", payData?.errors);
            return res.status(400).json({ error: errMsg, details: payData?.errors });
          }
        }

        // If it's a subscription, retrieve the actual first payment to get its QR code or checkout link
        let paymentIdForPixOrLink = payData?.id;
        let invoiceUrl = payData?.invoiceUrl;
        let bankSlipUrl = payData?.bankSlipUrl;

        if (payData?.id && typeof payData.id === 'string' && payData.id.startsWith('sub_')) {
          try {
            console.log(`[Subscription] Buscando primeiro pagamento para a assinatura ${payData.id}...`);
            const subPaymentsData = await fetchAsaasApi(`/subscriptions/${payData.id}/payments`);
            if (subPaymentsData?.data && Array.isArray(subPaymentsData.data) && subPaymentsData.data.length > 0) {
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
        let pixCopiaECola = invoiceUrl || payData?.invoiceUrl || '';
        let pixQrCodeUrl = '';

        if (paymentIdForPixOrLink && typeof paymentIdForPixOrLink === 'string' && !paymentIdForPixOrLink.startsWith('sub_') && (billingType === 'PIX' || !billingType)) {
          try {
            const pixData = await fetchAsaasApi(`/payments/${paymentIdForPixOrLink}/pixQrCode`);
            if (pixData?.payload) pixCopiaECola = pixData.payload;
            if (pixData?.encodedImage) pixQrCodeUrl = `data:image/png;base64,${pixData.encodedImage}`;
          } catch (pixErr) {
            console.warn("Aviso ao obter QR Code do Pix no Asaas:", pixErr);
          }
        }

        // Always guarantee a QR code image URL if pixCopiaECola or invoiceUrl is available
        const finalPaymentUrl = bankSlipUrl || invoiceUrl || payData?.bankSlipUrl || payData?.invoiceUrl || '';
        const qrTarget = pixCopiaECola || finalPaymentUrl;
        if (!pixQrCodeUrl && qrTarget) {
          pixQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrTarget)}`;
        }

        return res.json({
          success: true,
          chargeId: payData?.id || 'charge_' + Date.now(),
          paymentId: paymentIdForPixOrLink,
          customerId: customerId,
          paymentUrl: finalPaymentUrl,
          pixCopiaECola: pixCopiaECola || finalPaymentUrl,
          pixQrCodeUrl: pixQrCodeUrl,
          status: payData?.status === 'RECEIVED' || payData?.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
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
  app.post(["/api/saas/payment/simulate-receive", "/saas/payment/simulate-receive", "/payment/simulate-receive", "/simulate-receive"], async (req, res) => {
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

      const baseUrl = getAsaasBaseUrl(asaasEnv);

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

  // Helper to find Tenant in Firestore by ID, slug, subdomain, or email
  async function findTenantInFirestore(dbAdmin: any, refId: string) {
    if (!refId || !dbAdmin) return null;
    const cleanRef = refId.trim();

    // 1. Direct doc lookup
    try {
      const docSnap = await dbAdmin.collection('tenants').doc(cleanRef).get();
      if (docSnap.exists) {
        return { ref: docSnap.ref, snap: docSnap, data: docSnap.data(), id: docSnap.id };
      }
    } catch (e) {
      // ignore
    }

    // 2. Query by 'id', 'slug', 'subdomain', 'email'
    const fields = ['id', 'slug', 'subdomain', 'email'];
    for (const field of fields) {
      try {
        const q = await dbAdmin.collection('tenants').where(field, '==', cleanRef).limit(1).get();
        if (!q.empty) {
          const snap = q.docs[0];
          return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
        }
      } catch (e) {
        // ignore
      }
    }

    // 3. Query by lowercase cleanRef
    const lowerRef = cleanRef.toLowerCase();
    if (lowerRef !== cleanRef) {
      for (const field of fields) {
        try {
          const q = await dbAdmin.collection('tenants').where(field, '==', lowerRef).limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
          }
        } catch (e) {
          // ignore
        }
      }
    }

    return null;
  }

  // Helper to find subscription in Firestore by any available Asaas identifier or docId
  async function findSubscriptionInFirestore(dbAdmin: any, params: {
    paymentId?: string;
    subscriptionId?: string;
    customerId?: string;
    externalReference?: string;
    docId?: string;
  }) {
    const { paymentId, subscriptionId, customerId, externalReference, docId } = params;

    // 1. Direct document ID lookup
    const directDocIds = Array.from(new Set([docId, externalReference].filter(Boolean))) as string[];
    for (const id of directDocIds) {
      if (id && !id.startsWith('sub_') && !id.startsWith('pay_') && !id.startsWith('cus_')) {
        try {
          const docSnap = await dbAdmin.collection('subscriptions').doc(id).get();
          if (docSnap.exists) {
            return { ref: docSnap.ref, snap: docSnap, data: docSnap.data(), id: docSnap.id };
          }
        } catch (e) {
          // ignore doc ID syntax issues
        }
      }
    }

    // 2. Search by asaasInvoiceId, asaasSubscriptionId, externalReference
    const searchIds = Array.from(new Set([paymentId, subscriptionId, externalReference].filter(Boolean))) as string[];
    if (searchIds.length > 0) {
      try {
        let q = await dbAdmin.collection('subscriptions').where('asaasInvoiceId', 'in', searchIds).limit(1).get();
        if (!q.empty) {
          const snap = q.docs[0];
          return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
        }
      } catch (e) { /* ignore */ }

      try {
        let q = await dbAdmin.collection('subscriptions').where('asaasSubscriptionId', 'in', searchIds).limit(1).get();
        if (!q.empty) {
          const snap = q.docs[0];
          return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
        }
      } catch (e) { /* ignore */ }

      try {
        let q = await dbAdmin.collection('subscriptions').where('externalReference', 'in', searchIds).limit(1).get();
        if (!q.empty) {
          const snap = q.docs[0];
          return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
        }
      } catch (e) { /* ignore */ }
    }

    // 3. Search by asaasCustomerId (prioritizing pending status first)
    if (customerId) {
      try {
        let q = await dbAdmin.collection('subscriptions')
          .where('asaasCustomerId', '==', customerId)
          .where('asaasPaymentStatus', '==', 'pending')
          .limit(1).get();
        if (!q.empty) {
          const snap = q.docs[0];
          return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
        }
      } catch (e) {
        // ignore index errors
      }

      try {
        let q = await dbAdmin.collection('subscriptions')
          .where('asaasCustomerId', '==', customerId)
          .limit(1).get();
        if (!q.empty) {
          const snap = q.docs[0];
          return { ref: snap.ref, snap, data: snap.data(), id: snap.id };
        }
      } catch (e) {
        // ignore
      }
    }

    return null;
  }

  // Active Payment Status Check endpoint (to sync automatically without relying solely on webhooks)
  app.post(["/api/saas/payment/check-status", "/saas/payment/check-status", "/payment/check-status", "/check-status"], async (req, res) => {
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

      const baseUrl = getAsaasBaseUrl(asaasEnv);

      const dbAdmin = getAdminDb();
      let realAsaasPaymentId = paymentId;
      let existingSub: any = null;

      if (dbAdmin) {
        existingSub = await findSubscriptionInFirestore(dbAdmin, {
          docId: paymentId,
          externalReference: paymentId,
          paymentId,
          subscriptionId: paymentId
        });

        if (existingSub) {
          const sData = existingSub.data;
          realAsaasPaymentId = sData.asaasInvoiceId || sData.asaasSubscriptionId || paymentId;
        }
      }

      let targetPaymentId = realAsaasPaymentId;

      if (targetPaymentId.startsWith('sub_')) {
        const subPaymentsRes = await fetch(`${baseUrl}/subscriptions/${targetPaymentId}/payments`, {
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
            else targetPaymentId = subPaymentsData.data[0].id;
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

      if (isPaid && dbAdmin) {
        let subMatch = existingSub;
        if (!subMatch) {
          subMatch = await findSubscriptionInFirestore(dbAdmin, {
            paymentId: paymentData.id,
            subscriptionId: paymentData.subscription,
            customerId: paymentData.customer,
            externalReference: paymentData.externalReference || paymentId,
            docId: paymentId
          });
        }

        if (subMatch) {
          const subRef = subMatch.ref;
          const subData = subMatch.data;

          if (subData.asaasPaymentStatus !== 'received' || subData.status !== 'active') {
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
            console.log(`[Sync Ativo] Assinatura ${subMatch.id} ativada com sucesso via check-status!`);
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
  app.post(["/api/saas/payment/update-credit-card", "/saas/payment/update-credit-card", "/payment/update-credit-card", "/update-credit-card"], async (req, res) => {
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

      const baseUrl = getAsaasBaseUrl(asaasEnv);

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
  app.post(["/api/saas/payment/generate-pix", "/saas/payment/generate-pix", "/payment/generate-pix", "/generate-pix"], async (req, res) => {
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

      const baseUrl = getAsaasBaseUrl(asaasEnv);

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
      let pixData: any = {};
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${targetPaymentId}/pixQrCode`, {
          headers: { 'access_token': asaasApiKey }
        });
        pixData = await pixRes.json();
      } catch (pixErr) {
        console.warn("Aviso ao buscar QR Code no Asaas em generate-pix:", pixErr);
      }

      let payDetail: any = {};
      try {
        const payDetailRes = await fetch(`${baseUrl}/payments/${targetPaymentId}`, {
          headers: { 'access_token': asaasApiKey }
        });
        payDetail = await payDetailRes.json();
      } catch (payErr) {
        console.warn("Aviso ao buscar detalhe no Asaas em generate-pix:", payErr);
      }

      const pixCopiaECola = pixData.payload || payDetail.invoiceUrl || '';
      let pixQrCodeUrl = pixData.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : '';

      if (!pixQrCodeUrl && pixCopiaECola) {
        pixQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCopiaECola)}`;
      }

      return res.json({
        success: true,
        paymentId: targetPaymentId,
        invoiceUrl: payDetail.invoiceUrl,
        pixCopiaECola: pixCopiaECola,
        pixQrCodeUrl: pixQrCodeUrl
      });
    } catch (error: any) {
      console.error("Erro ao gerar PIX alternativo:", error);
      res.status(500).json({ error: error.message || "Falha ao gerar PIX." });
    }
  });

  // Webhook Receiver for Asaas / Mercado Pago / Stripe
  const webhookPaths = [
    "/api/webhooks/asaas",
    "/api/webhook/asaas",
    "/webhooks/asaas",
    "/webhook/asaas",
    "/api/webhooks",
    "/webhooks",
    "/api/webhook",
    "/webhook",
    "/api/saas/payment/webhook",
    "/saas/payment/webhook",
    "/payment/webhook"
  ];

  // 1. Endpoint GET para validação/teste de conectividade da URL pelo Asaas
  app.get(webhookPaths, (req, res) => {
    console.log("🌐 [ASAAS WEBHOOK] Validação GET / Ping de conectividade recebido do Asaas.");
    return res.status(200).json({ status: "ok", message: "Webhook Asaas ativo e pronto para receber notificações." });
  });

  // 2. Endpoint POST para processamento dos eventos de pagamento / assinatura do Asaas
  app.post(webhookPaths, async (req, res) => {
    try {
      const timestamp = new Date().toISOString();
      let event: any = {};
      try {
        event = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      } catch (pErr) {
        event = req.body || {};
      }

      const subscription = event.subscription || {};
      const payment = event.payment || event.charge || {};
      const targetObj = event.payment || event.subscription || event || {};
      const eventType = String(event?.event || event?.status || targetObj?.status || 'UNKNOWN_EVENT').toUpperCase();

      console.log("\n==================================================");
      console.log("WEBHOOK ASAAS RECEBIDO");
      console.log(`📅 Data/Hora: ${timestamp}`);
      console.log(`⚡ Evento: ${eventType}`);
      console.log(`🆔 Payment/Sub ID: ${payment?.id || subscription?.id || 'N/A'}`);
      console.log(`📊 Status: ${payment?.status || subscription?.status || 'N/A'}`);
      console.log(`👤 Customer: ${payment?.customer || subscription?.customer || 'N/A'}`);
      console.log(`🔗 ExternalReference: ${payment?.externalReference || subscription?.externalReference || event?.external_reference || event?.externalReference || 'N/A'}`);
      console.log("==================================================");

      let refId = payment?.externalReference || subscription?.externalReference || event.external_reference || event.externalReference;
      
      // Fallback: extract tenantId from description if present, e.g., "... (gbcortes7)"
      const description = payment?.description || subscription?.description || event.description;
      if (!refId && description && typeof description === 'string') {
        const match = description.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          refId = match[1].trim();
          console.log(`🔍 [ASAAS AUDIT] Tenant ID extraído da descrição: ${refId}`);
        }
      }

      const value = Number(payment?.value || subscription?.value || payment?.transaction_amount || 0);

      // Handle subscription or payment activation events
      const isActivationEvent = (
        eventType.includes('RECEIVED') ||
        eventType.includes('CONFIRMED') ||
        eventType.includes('CREATED') ||
        eventType.includes('UPDATED') ||
        eventType.includes('APPROVED') ||
        eventType.includes('ACTIVE') ||
        payment?.status === 'RECEIVED' ||
        payment?.status === 'CONFIRMED' ||
        subscription?.status === 'ACTIVE'
      );

      if (isActivationEvent) {
        console.log(`🔍 [ASAAS AUDIT] Processing activation event -> Event: ${eventType}, Ref: ${refId}, Valor: ${value}`);

        const dbAdmin = getAdminDb();
        if (!dbAdmin) {
          console.warn("⚠️ [ASAAS AUDIT] Banco de dados Firebase Admin não disponível. Webhook respondido com HTTP 200.");
          return res.status(200).json({ received: true, warning: "Database not available" });
        }

        let subMatch: any = null;
        let tenantMatch: any = null;

        // 1. Search Client Subscription in Firestore FIRST (using paymentId, subscriptionId, customerId, or refId)
        try {
          subMatch = await findSubscriptionInFirestore(dbAdmin, {
            paymentId: payment?.id,
            subscriptionId: subscription?.id || payment?.subscription,
            customerId: subscription?.customer || payment?.customer,
            externalReference: refId,
            docId: refId
          });

          if (subMatch) {
            console.log(`📋 [ASAAS AUDIT] Assinatura de cliente localizada no Firestore: ${subMatch.id} (Cliente: ${subMatch.data?.cliente_name || 'N/A'})`);
          }
        } catch (fErr) {
          console.warn("Erro ao buscar assinatura de cliente no Firestore:", fErr);
        }

        // 2. If no Client Subscription was found directly by IDs, but refId exists (e.g. 'gbcortes7'),
        // search if there is a pending subscription in 'subscriptions' collection for this tenantId
        if (!subMatch && refId) {
          try {
            const pendingSubSnap = await dbAdmin.collection('subscriptions')
              .where('tenantId', '==', refId)
              .where('status', '==', 'pending')
              .limit(1)
              .get();
            if (!pendingSubSnap.empty) {
              const snap = pendingSubSnap.docs[0];
              subMatch = { ref: snap.ref, snap, data: snap.data(), id: snap.id };
              console.log(`📋 [ASAAS AUDIT] Assinatura de cliente pendente encontrada por tenantId (${refId}): ${subMatch.id}`);
            }
          } catch (pErr) {
            console.warn("Erro ao buscar assinatura pendente por tenantId:", pErr);
          }
        }

        // 3. Search Tenant (Barbearia/SaaS) in Firestore ONLY IF no Client Subscription matched
        if (!subMatch && refId) {
          try {
            tenantMatch = await findTenantInFirestore(dbAdmin, refId);
            if (tenantMatch) {
              console.log(`👤 [ASAAS AUDIT] Barbearia / Tenant localizada no Firestore: ${tenantMatch.id}`);
            }
          } catch (tErr) {
            console.warn("Erro ao buscar tenant no Firestore:", tErr);
          }
        }

        // 4. Process Client Subscription Activation
        if (subMatch) {
          const subData = subMatch.data;
          const subRef = subMatch.ref;
          const tenantId = subData.tenantId;
          const todayStr = new Date().toISOString().split('T')[0];

          let newStartStr = todayStr;
          let newEndStr = '';

          // If nextDueDate is sent in subscription payload, use it or calculate 1 month
          const nextDueDate = subscription?.nextDueDate || payment?.dueDate;
          if (nextDueDate && typeof nextDueDate === 'string') {
            newEndStr = nextDueDate.split('T')[0];
          } else {
            let currentEnd = subData.endDate ? new Date(subData.endDate + 'T12:00:00') : new Date();
            if (!subData.endDate || currentEnd < new Date()) {
              newStartStr = todayStr;
            } else {
              newStartStr = subData.endDate;
            }
            const newStart = new Date(newStartStr + 'T12:00:00');
            const newEnd = new Date(newStart);
            newEnd.setMonth(newEnd.getMonth() + 1);
            newEndStr = newEnd.toISOString().split('T')[0];
          }

          console.log(`🔄 [ASAAS AUDIT] Ativando assinatura de cliente ${subMatch.id}`);
          await subRef.update({
            status: 'active',
            asaasPaymentStatus: 'received',
            asaasSubscriptionId: subscription?.id || payment?.subscription || subData.asaasSubscriptionId || null,
            asaasCustomerId: subscription?.customer || payment?.customer || subData.asaasCustomerId || null,
            asaasInvoiceId: payment?.id || subData.asaasInvoiceId || null,
            startDate: newStartStr,
            endDate: newEndStr,
            haircutsUsed: 0,
            beardsUsed: 0,
            lastRenewalDate: todayStr,
            updatedAt: new Date()
          });

          // Only record financial transaction if payment value > 0 or if PAYMENT_RECEIVED/CONFIRMED
          if (value > 0 && (eventType.includes('RECEIVED') || eventType.includes('CONFIRMED') || eventType.includes('APPROVED'))) {
            try {
              await dbAdmin.collection('financial_transactions').add({
                tenantId,
                type: 'income',
                amount: value || subData.amount || 0,
                date: todayStr,
                category: 'Assinaturas',
                description: `Assinatura Confirmada: ${subData.planName || 'Plano'} - ${subData.cliente_name}`,
                paymentMethod: (payment?.billingType || subscription?.billingType || '').toLowerCase() === 'credit_card' ? 'cartao' : 'pix',
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
            } catch (ftErr) {
              console.warn("Could not record financial transaction:", ftErr);
            }
          }

          console.log(`✅ [ASAAS AUDIT] Assinatura do cliente ${subData.cliente_name} (${subMatch.id}) ativada com sucesso! Válida até ${newEndStr}`);
        }
        // 5. Process Tenant Activation
        else if (tenantMatch) {
          const data = tenantMatch.data || {};
          let baseDate = new Date();
          const currentExp = data.planExpiresAt || data.planValidUntil;
          if (currentExp && typeof currentExp === 'string') {
            const expDate = new Date(currentExp + (currentExp.includes('T') ? '' : 'T12:00:00'));
            if (!isNaN(expDate.getTime()) && expDate > baseDate) baseDate = expDate;
          }
          const newExpDate = new Date(baseDate);
          newExpDate.setMonth(newExpDate.getMonth() + 1);
          const newExpStr = newExpDate.toISOString().split('T')[0];

          console.log(`🔄 [ASAAS AUDIT] Ativando Tenant ${tenantMatch.id} até ${newExpStr}`);
          
          try {
            await tenantMatch.ref.update({
              planStatus: 'active',
              isActive: true,
              planExpiresAt: newExpStr,
              planValidUntil: newExpStr,
              lastPaymentDate: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          } catch (uErr) {
            await tenantMatch.ref.set({
              planStatus: 'active',
              isActive: true,
              planExpiresAt: newExpStr,
              planValidUntil: newExpStr,
              lastPaymentDate: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }

          if (value > 0) {
            try {
              await dbAdmin.collection('saas_payments').add({
                tenantId: tenantMatch.id,
                tenantName: data.name || tenantMatch.id,
                planName: data.plan || description || 'Plano Ultra',
                amount: value,
                paymentMethod: payment?.billingType || subscription?.billingType || 'PIX',
                status: 'pago',
                paidAt: new Date().toISOString(),
                newExpirationDate: newExpStr,
                createdAt: new Date()
              });
            } catch (pErr) {
              console.warn("Could not record saas_payment:", pErr);
            }
          }

          console.log(`✅ [ASAAS AUDIT] Barbearia ${tenantMatch.id} ativada com sucesso! Válida até ${newExpStr}`);
        } else {
          console.warn(`⚠️ [ASAAS AUDIT] Nenhuma barbearia ou assinatura encontrada para refId: ${refId}, SubID: ${subscription?.id}, PayID: ${payment?.id}`);
        }
      } else {
        console.log(`ℹ️ [ASAAS AUDIT] Evento ignorado ou informativo: ${eventType}`);
      }

      // Always return HTTP 200 so Asaas considers the webhook successfully delivered
      return res.status(200).json({ received: true });
    } catch (error: any) {
      console.error("❌ [ASAAS AUDIT] Exceção capturada no Webhook:", error);
      // Always return HTTP 200 to Asaas to prevent spam retries / penalization
      return res.status(200).json({ received: true, error: error?.message || 'Handled error' });
    }
  });

  // API Routes (Exemplos iniciais para o Dashboard)
  app.get(["/api/stats", "/stats"], (req, res) => {
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

  // Fallback para rotas de API não encontradas
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/saas') || req.path.startsWith('/admin') || req.path.startsWith('/payment')) {
      return res.status(404).json({ error: "Endpoint da API não encontrado.", path: req.path, method: req.method });
    }
    next();
  });

  // Global Express Error Middleware (captures JSON parse errors or internal route crashes)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("🔥 Global Express Error Handler caught an error:", err);
    if (req.path.includes('/webhook')) {
      return res.status(200).json({ received: true, error: err?.message || 'Handled webhook exception' });
    }
    return res.status(err?.status || 500).json({ error: err?.message || 'Internal Server Error' });
  });

  // Configuração do Vite como Middleware (somente em dev/prod container)
  async function startServer() {
    const PORT = 3000;
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      try {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
      } catch (viteErr) {
        console.warn("Could not start Vite middleware:", viteErr);
      }
    } else if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`BarberElite Server running on http://localhost:${PORT}`);
      });
    }
  }

  if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
    startServer();
  }

export default app;
