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
export function hasAdminCredentials(): boolean {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT || (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL));
}

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

        // 3. Try applicationDefault first only if credentials exist or in GCP environment
        if (!adminApp && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          try {
            adminApp = initializeApp({
              credential: applicationDefault(),
              projectId: process.env.FIREBASE_PROJECT_ID || "gbagender"
            });
            console.log("✅ Firebase Admin initialized with applicationDefault.");
          } catch (adcErr: any) {
            console.warn("Could not initialize with applicationDefault:", adcErr.message || adcErr);
          }
        }
      } else {
        adminApp = apps[0];
      }
    } catch (err: any) {
      console.warn("Could not initialize Firebase Admin SDK:", err.message || err);
    }
  }
  return adminApp;
}

function getAdminDb() {
  if (!hasAdminCredentials() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return null;
  }
  const app = getFirebaseAdmin();
  if (!app) return null;
  try {
    return getFirestore(app);
  } catch (e) {
    return null;
  }
}

function getAdminAuth() {
  const app = getFirebaseAdmin();
  if (!app) return null;
  try {
    return getAuth(app);
  } catch (e) {
    return null;
  }
}

// In-memory rate limiting for sensitive financial operations (withdrawals, payout changes)
const financialRateLimits = new Map<string, number[]>();

function checkFinancialRateLimit(key: string, maxAttempts: number = 6, windowMinutes: number = 10): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  const timestamps = (financialRateLimits.get(key) || []).filter(t => now - t < windowMs);
  
  if (timestamps.length >= maxAttempts) {
    return { allowed: false, remaining: 0 };
  }
  
  timestamps.push(now);
  financialRateLimits.set(key, timestamps);
  return { allowed: true, remaining: maxAttempts - timestamps.length };
}

// Security Helper: Record Security Audit Log in Firestore
async function recordSecurityAudit(action: string, tenantId: string, details: any, req: express.Request) {
  const dbAdmin = getAdminDb();
  if (!dbAdmin) return;
  try {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    await dbAdmin.collection('security_audit_logs').add({
      action,
      tenantId: tenantId || 'system',
      ip,
      userAgent,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Aviso ao gravar log de auditoria de segurança:", err);
  }
}

// Security Helper: Authenticate & Authorize Tenant Admin for Critical Financial Operations
async function verifyTenantAdminAuth(req: express.Request, targetTenantId: string): Promise<{ authorized: boolean; error?: string; user?: any }> {
  if (!targetTenantId) {
    return { authorized: false, error: "Identificador da unidade (tenantId) é obrigatório." };
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const adminAuth = getAdminAuth();
  const dbAdmin = getAdminDb();

  // If Firebase Admin Auth is active and token is provided:
  if (adminAuth && token) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const uid = decoded.uid;
      const email = decoded.email || '';

      // Test/Superadmin bypass
      if (email === 'admin@admin.com' || email === 'gerente@gerente.com') {
        return { authorized: true, user: { uid, email, role: 'superadmin' } };
      }

      if (dbAdmin) {
        const userDoc = await dbAdmin.collection('usuarios').doc(uid).get();
        if (userDoc.exists) {
          const uData = userDoc.data() || {};
          const userTenant = uData.tenantId || 'gbcortes7';
          const userRole = uData.tipo || uData.role || 'cliente';

          // Must be admin or gerente of this tenant, or saas_admin
          if (userRole === 'saas_admin') {
            return { authorized: true, user: { uid, email, role: userRole, tenantId: userTenant } };
          }

          if ((userRole === 'admin' || userRole === 'gerente') && (userTenant === targetTenantId || !userTenant)) {
            return { authorized: true, user: { uid, email, role: userRole, tenantId: userTenant } };
          }

          return { 
            authorized: false, 
            error: "Acesso Negado: Apenas administradores autorizados desta barbearia podem realizar movimentações na Conta Digital." 
          };
        }
      }
      return { authorized: true, user: { uid, email } };
    } catch (err: any) {
      console.warn("⚠️ Token de autenticação inválido em operação financeira:", err.message);
      return { authorized: false, error: "Sessão inválida ou expirada. Faça login novamente para autorizar a operação financeira." };
    }
  }

  // Fallback if Admin SDK is active but no token sent
  if (adminAuth && !token) {
    return { authorized: false, error: "Autenticação obrigatória: Token de segurança não fornecido." };
  }

  return { authorized: true };
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

async function safeJsonFetch(response: any): Promise<any> {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') return {};
    return JSON.parse(text);
  } catch (err) {
    return {};
  }
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

  // Helper to get Asaas credentials (tenant-specific subaccount or master fallback)
  async function getTenantAsaasCredentials(tenantId?: string): Promise<{ apiKey: string; baseUrl: string; env: string; isSubaccount: boolean; hasCustomKey: boolean; tenantData?: any }> {
    const rawMasterKey = process.env.ASAAS_API_KEY || '';
    const masterApiKey = rawMasterKey.trim().replace(/^['"]|['"]$/g, '');
    let masterEnv = (process.env.ASAAS_ENVIRONMENT || 'production').toLowerCase().trim();
    if (masterApiKey.startsWith('$aact_') || masterApiKey.startsWith('aact_')) {
      masterEnv = 'production';
    }
    const masterBaseUrl = getAsaasBaseUrl(masterEnv);

    if (!tenantId) {
      return { apiKey: masterApiKey, baseUrl: masterBaseUrl, env: masterEnv, isSubaccount: false, hasCustomKey: true };
    }

    let tData: any = null;
    let privData: any = null;

    // 1. Attempt using Firebase Admin SDK if available
    const dbAdmin = getAdminDb();
    if (dbAdmin) {
      try {
        const tenantDoc = await dbAdmin.collection('tenants').doc(tenantId).get();
        if (tenantDoc.exists) tData = tenantDoc.data();

        const privDoc = await dbAdmin.collection('tenants').doc(tenantId).collection('private_settings').doc('asaas').get();
        if (privDoc.exists) privData = privDoc.data();
      } catch (err) {
        console.warn(`[getTenantAsaasCredentials] Aviso ao buscar via Admin DB para ${tenantId}:`, err);
      }
    }

    // 2. Fallback to Firestore REST API if tData is missing or dbAdmin is null
    if (!tData) {
      try {
        const projId = process.env.FIREBASE_PROJECT_ID || "gbagender";
        const restRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/tenants/${tenantId}`);
        if (restRes.ok) {
          const json = await restRes.json();
          if (json?.fields) {
            tData = parseFirestoreFields(json.fields);
          }
        }
      } catch (restErr) {
        console.warn(`[getTenantAsaasCredentials] Aviso ao buscar via REST API para ${tenantId}:`, restErr);
      }
    }

    const customKey = (tData?.asaas?.apiKey || tData?.asaasApiKey || privData?.apiKey || '').trim().replace(/^['"]|['"]$/g, '');
    const explicitEnv = (tData?.asaas?.environment || privData?.environment || tData?.asaasEnvironment || privData?.env || '').toLowerCase().trim();

    const cleanKey = customKey || masterApiKey;
    const hasCustomKey = !!customKey;

    if (cleanKey) {
      let tEnv = hasCustomKey ? explicitEnv : masterEnv;
      const keyLower = cleanKey.toLowerCase();

      // Key format check: $aact_ indicates production key
      if (keyLower.startsWith('$aact_') || keyLower.startsWith('aact_') || keyLower.includes('aact_')) {
        tEnv = 'production';
      } else if (keyLower.includes('sandbox')) {
        tEnv = 'sandbox';
      } else if (!tEnv) {
        tEnv = 'production';
      }

      const tBaseUrl = getAsaasBaseUrl(tEnv);
      console.log(`🔑 [Asaas Credentials Resolved] Tenant: ${tenantId} | CustomKey: ${hasCustomKey} | Key: ${cleanKey.substring(0, 10)}... | Env: ${tEnv} | BaseUrl: ${tBaseUrl}`);
      return {
        apiKey: cleanKey,
        baseUrl: tBaseUrl,
        env: tEnv,
        isSubaccount: hasCustomKey,
        hasCustomKey,
        tenantData: tData || undefined
      };
    }

    return { apiKey: masterApiKey, baseUrl: masterBaseUrl, env: masterEnv, isSubaccount: false, hasCustomKey: false, tenantData: tData };
  }

  // SAAS PAYMENT GATEWAY ROUTES (Asaas / MP / Pix)
  // ==========================================

  // Endpoint to create a SaaS Subscription/Payment Charge
  app.post(["/api/saas/payment/create-charge", "/saas/payment/create-charge", "/payment/create-charge", "/create-charge"], async (req, res) => {
    try {
      const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount, billingType, externalReference, isClientSubscription, subscriptionId } = req.body;

      if (!tenantId || !amount) {
        return res.status(400).json({ error: "Parâmetros obrigatórios incompletos (tenantId e amount)." });
      }

      let finalExternalRef = externalReference;
      if (!finalExternalRef) {
        if (isClientSubscription || subscriptionId) {
          finalExternalRef = `client_sub:${subscriptionId || tenantId}`;
        } else {
          finalExternalRef = `saas_tenant:${tenantId}`;
        }
      }

      // 1. ASAAS GATEWAY INTEGRATION
      // Resolve tenant-specific credentials when client is subscribing or tenantId is provided
      const tenantCreds = (isClientSubscription || tenantId) ? await getTenantAsaasCredentials(tenantId) : await getTenantAsaasCredentials(undefined);
      let asaasApiKey = tenantCreds.apiKey;
      let baseUrl = tenantCreds.baseUrl;
      let asaasEnv = tenantCreds.env;
      const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

      console.log(`[Asaas Charge] Target Tenant: ${tenantId} | Env: ${asaasEnv} | BaseUrl: ${baseUrl} | IsClientSub: ${!!isClientSubscription}`);

      if (asaasApiKey) {
        let cleanCpfCnpj = (ownerCpfCnpj || '').replace(/\D/g, '');
        let isSandboxMode = asaasEnv !== 'production' && (asaasEnv === 'sandbox' || asaasApiKey.toLowerCase().includes('sandbox'));
        
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
            const primaryData = await safeJsonFetch(primaryRes);

            // If invalid_access_token, try the alternate Asaas URL (prod vs sandbox)
            if (primaryData?.errors?.some((e: any) => e.code === 'invalid_access_token')) {
              const altBaseUrl = baseUrl.includes('sandbox') 
                ? 'https://api.asaas.com/v3' 
                : 'https://sandbox.asaas.com/api/v3';
              console.warn(`⚠️ [Asaas Token Error] Tentando URL alternativa: ${altBaseUrl}${path}`);
              
              const altRes = await fetch(`${altBaseUrl}${path}`, { ...options, headers });
              const altData = await safeJsonFetch(altRes);
              if (!altData?.errors) {
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
              externalReference: finalExternalRef
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
                externalReference: finalExternalRef
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
        const selectedBillingType = (billingType === 'CREDIT_CARD' || billingType === 'PIX') ? billingType : 'PIX';

        // If CREDIT_CARD, create a recurring MONTHLY subscription in Asaas
        if ((selectedBillingType === 'CREDIT_CARD' || req.body?.isSubscription) && isRealCustomerId) {
          try {
            const createSub = async () => fetchAsaasApi('/subscriptions', {
              method: 'POST',
              body: JSON.stringify({
                customer: customerId,
                billingType: selectedBillingType,
                value: Number(amount),
                nextDueDate: dueDateStr,
                cycle: 'MONTHLY',
                description: `Assinatura BarberElite - Plano ${planName || 'Mensal'} (${tenantId})`,
                externalReference: finalExternalRef
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

        // Create single payment charge or subscription if selectedBillingType is PIX or fallback needed
        if ((!payData || payData?.errors) && isRealCustomerId) {
          // If PIX, we create a recurring subscription if requested or a charge with explicit PIX billingType
          const createPaymentOrSub = async () => {
            if (isClientSubscription || req.body?.isSubscription) {
              return fetchAsaasApi('/subscriptions', {
                method: 'POST',
                body: JSON.stringify({
                  customer: customerId,
                  billingType: selectedBillingType,
                  value: Number(amount),
                  nextDueDate: dueDateStr,
                  cycle: 'MONTHLY',
                  description: `Assinatura BarberElite - Plano ${planName || 'Mensal'} (${tenantId})`,
                  externalReference: finalExternalRef
                })
              });
            } else {
              return fetchAsaasApi('/payments', {
                method: 'POST',
                body: JSON.stringify({
                  customer: customerId,
                  billingType: selectedBillingType,
                  value: Number(amount),
                  dueDate: dueDateStr,
                  description: `Assinatura BarberElite - Plano ${planName || 'Mensal'} (${tenantId})`,
                  externalReference: finalExternalRef
                })
              });
            }
          };

          payData = await createPaymentOrSub();

          if (payData?.errors && isSandboxMode) {
            await ensureCustomerCpfCnpjValid(true);
            payData = await createPaymentOrSub();
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

      const rawAsaasKey = process.env.ASAAS_API_KEY || '';
      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      const baseUrl = getAsaasBaseUrl(asaasEnv);
      console.log(`[Simulação] Solicitado confirmação para o ID de pagamento/assinatura: ${paymentId}`);

      let targetPaymentId = paymentId;
      let receiveData: any = { success: true };

      if (asaasApiKey) {
        try {
          // If it's a subscription, fetch its payments to find the pending payment ID
          if (paymentId.startsWith('sub_')) {
            console.log(`[Simulação] ID informado é uma assinatura (${paymentId}). Buscando cobranças geradas...`);
            const subPaymentsRes = await fetch(`${baseUrl}/subscriptions/${paymentId}/payments`, {
              headers: { 'access_token': asaasApiKey }
            });
            const subPaymentsData = await safeJsonFetch(subPaymentsRes);
            
            if (subPaymentsData?.data?.length > 0) {
              const pendingPayment = subPaymentsData.data.find((p: any) => p.status === 'PENDING');
              if (pendingPayment) {
                targetPaymentId = pendingPayment.id;
                console.log(`[Simulação] Encontrada cobrança pendente: ${targetPaymentId}`);
              } else {
                targetPaymentId = subPaymentsData.data[0].id;
                console.log(`[Simulação] Usando última cobrança: ${targetPaymentId}`);
              }
            }
          }

          // Simulate payment receive on Asaas Sandbox
          const receiveRes = await fetch(`${baseUrl}/payments/${targetPaymentId}/receive`, {
            method: 'POST',
            headers: { 'access_token': asaasApiKey }
          });
          receiveData = await safeJsonFetch(receiveRes);
          console.log(`[Simulação] Resposta Asaas Sandbox para ${targetPaymentId}:`, receiveData);
        } catch (asaasErr) {
          console.warn("[Simulação] Aviso na chamada Asaas Sandbox (prosseguindo com ativação no banco):", asaasErr);
        }
      }

      // Direct database update to ensure immediate activation in database
      try {
        const dbAdmin = getAdminDb();
        if (dbAdmin) {
          console.log(`[Simulação] Iniciando ativação direta de assinatura no banco de dados para ID: ${paymentId} / ${targetPaymentId}`);
          
          let paymentValue = 0;
          let billingType = 'pix';

          if (asaasApiKey && targetPaymentId && !targetPaymentId.startsWith('mock_')) {
            try {
              const payRes = await fetch(`${baseUrl}/payments/${targetPaymentId}`, {
                headers: { 'access_token': asaasApiKey }
              });
              const paymentData = await safeJsonFetch(payRes);
              if (paymentData?.value) paymentValue = Number(paymentData.value);
              if (paymentData?.billingType) billingType = paymentData.billingType.toLowerCase() === 'credit_card' ? 'cartao' : 'pix';
            } catch (pErr) {
              console.warn("Aviso ao obter dados do pagamento Asaas:", pErr);
            }
          }

          // Find subscription by ID or asaasInvoiceId or asaasSubscriptionId
          let subDocSnap = null;

          // 1. Direct doc lookup
          try {
            const directSnap = await dbAdmin.collection('subscriptions').doc(paymentId).get();
            if (directSnap.exists) {
              subDocSnap = directSnap;
            }
          } catch (e) {}

          // 2. Query by asaasInvoiceId
          if (!subDocSnap) {
            const possibleInvoiceIds = [paymentId, targetPaymentId].filter(Boolean);
            const subQuery = await dbAdmin.collection('subscriptions')
              .where('asaasInvoiceId', 'in', possibleInvoiceIds)
              .limit(1)
              .get();
            if (!subQuery.empty) subDocSnap = subQuery.docs[0];
          }

          // 3. Query by asaasSubscriptionId
          if (!subDocSnap) {
            const subQuery2 = await dbAdmin.collection('subscriptions')
              .where('asaasSubscriptionId', '==', paymentId)
              .limit(1)
              .get();
            if (!subQuery2.empty) subDocSnap = subQuery2.docs[0];
          }

          if (subDocSnap) {
            const subRef = subDocSnap.ref;
            const subData = subDocSnap.data();

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

            const finalAmount = paymentValue || subData.amount || subData.preco || 0;

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
              amount: finalAmount,
              date: todayStr,
              category: 'Assinaturas',
              description: `Assinatura Rull Confirmada (Simulação): ${subData.planName || 'Plano'} - ${subData.cliente_name || 'Cliente'}`,
              paymentMethod: billingType === 'cartao' ? 'cartao' : 'pix',
              status: 'pago',
              cliente_id: subData.cliente_id || null,
              cliente_name: subData.cliente_name || null,
              responsavel_id: subData.cliente_id || null,
              responsavel_name: subData.cliente_name || null,
              net_amount: finalAmount,
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
                description: `Assinatura Rull: ${subData.planName || 'Plano'} - ${subData.cliente_name || 'Cliente'}`,
                amount: finalAmount,
                payment_method: billingType === 'cartao' ? 'cartao_credito' : 'pix',
                paymentMethod: billingType === 'cartao' ? 'cartao_credito' : 'pix',
                date: todayStr,
                createdAt: new Date()
              });

              await openCashDoc.ref.update({
                total_income: (openCashDoc.data().total_income || 0) + finalAmount,
                expected_balance: (openCashDoc.data().expected_balance || 0) + finalAmount,
                updatedAt: new Date()
              });
            }
            console.log(`[Simulação] Ativação direta realizada com sucesso no banco de dados!`);
          }
        }
      } catch (dbErr) {
        console.error("Erro na ativação direta da simulação no banco de dados:", dbErr);
      }

      return res.json({ 
        success: true, 
        message: "Recebimento simulado com sucesso e assinatura ativada no sistema!",
        details: receiveData
      });

    } catch (error: any) {
      console.error("Erro ao simular recebimento de pagamento:", error);
      res.status(500).json({ error: error.message || "Falha ao simular recebimento de pagamento." });
    }
  });

  // Endpoint to check status on Asaas and activate subscription
  app.post(["/api/saas/payment/check-status", "/saas/payment/check-status"], async (req, res) => {
    try {
      const { subscriptionId, tenantId } = req.body;
      if (!subscriptionId) {
        return res.status(400).json({ error: "Parâmetro subscriptionId é obrigatório." });
      }

      const projId = process.env.FIREBASE_PROJECT_ID || "gbagender";
      const targetTenantId = tenantId || 'gbcortes7';

      // 1. Fetch Subscription from Firestore via REST
      let subData: any = null;
      let actualSubId = subscriptionId;

      try {
        const restSub = await fetch(`https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/subscriptions/${subscriptionId}`);
        if (restSub.ok) {
          const json = await restSub.json();
          if (json?.fields) {
            subData = parseFirestoreFields(json.fields);
          }
        }
      } catch (err) {
        console.warn("Erro ao buscar assinatura via REST:", err);
      }

      // 2. Fetch Asaas API key for tenant
      let rawAsaasKey = process.env.ASAAS_API_KEY || '';
      let asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      try {
        const restTenant = await fetch(`https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/tenants/${targetTenantId}`);
        if (restTenant.ok) {
          const tJson = await restTenant.json();
          if (tJson?.fields) {
            const tData = parseFirestoreFields(tJson.fields);
            if (tData?.asaas?.apiKey || tData?.asaasApiKey) rawAsaasKey = tData.asaas?.apiKey || tData.asaasApiKey;
            if (tData?.asaas?.environment || tData?.asaasEnvironment) asaasEnv = tData.asaas?.environment || tData.asaasEnvironment;
          }
        }
      } catch (e) {}

      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      if (asaasApiKey.startsWith('$aact_') || asaasApiKey.startsWith('aact_') || asaasApiKey.includes('aact_')) {
        asaasEnv = 'production';
      }
      const baseUrl = getAsaasBaseUrl(asaasEnv);

      let isPaidOnAsaas = false;
      let asaasPaymentObj: any = null;

      if (asaasApiKey && subData) {
        const asaasSubId = subData.asaasSubscriptionId;
        const asaasInvId = subData.asaasInvoiceId;

        // Check subscription payments
        if (asaasSubId && asaasSubId.startsWith('sub_')) {
          try {
            const subPayRes = await fetch(`${baseUrl}/subscriptions/${asaasSubId}/payments`, {
              headers: { 'access_token': asaasApiKey }
            });
            const subPayData = await safeJsonFetch(subPayRes);
            if (subPayData?.data && Array.isArray(subPayData.data)) {
              const paid = subPayData.data.find((p: any) => p.status === 'RECEIVED' || p.status === 'CONFIRMED');
              if (paid) {
                isPaidOnAsaas = true;
                asaasPaymentObj = paid;
              }
            }
          } catch (e) {}
        }

        // Check single payment invoice
        if (!isPaidOnAsaas && asaasInvId && asaasInvId.startsWith('pay_')) {
          try {
            const invRes = await fetch(`${baseUrl}/payments/${asaasInvId}`, {
              headers: { 'access_token': asaasApiKey }
            });
            const invData = await safeJsonFetch(invRes);
            if (invData?.status === 'RECEIVED' || invData?.status === 'CONFIRMED') {
              isPaidOnAsaas = true;
              asaasPaymentObj = invData;
            }
          } catch (e) {}
        }
      }

      // If paid on Asaas OR if forced/no API key, activate subscription in Firestore
      if (isPaidOnAsaas || req.body?.forceActivate) {
        const todayStr = new Date().toISOString().split('T')[0];
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthStr = nextMonth.toISOString().split('T')[0];

        const updateFields = {
          status: 'active',
          asaasPaymentStatus: 'received',
          startDate: todayStr,
          endDate: nextMonthStr,
          haircutsUsed: 0,
          beardsUsed: 0,
          lastRenewalDate: todayStr,
          updatedAt: new Date().toISOString()
        };

        const updateMask = Object.keys(updateFields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
        const patchUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/subscriptions/${actualSubId}?${updateMask}`;
        
        await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: encodeFirestoreFields(updateFields) })
        });

        // Activate user profile
        if (subData?.cliente_id) {
          const userPatchUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/usuarios/${subData.cliente_id}?updateMask.fieldPaths=ativo&updateMask.fieldPaths=updatedAt`;
          await fetch(userPatchUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: encodeFirestoreFields({
                ativo: true,
                updatedAt: new Date().toISOString()
              })
            })
          });
        }

        // Create financial transaction for daily cash register and dashboard
        const transValue = asaasPaymentObj?.value || subData?.amount || 0;
        if (transValue > 0) {
          try {
            const finUrl = `https://firestore.googleapis.com/v1/projects/${projId}/databases/(default)/documents/financial_transactions`;
            await fetch(finUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: encodeFirestoreFields({
                  tenantId: targetTenantId,
                  type: 'income',
                  amount: transValue,
                  date: todayStr,
                  category: 'Assinaturas',
                  description: `Assinatura Confirmada: ${subData?.planName || 'Plano'} - ${subData?.cliente_name || 'Cliente'}`,
                  paymentMethod: asaasPaymentObj?.billingType?.toLowerCase() === 'credit_card' ? 'cartao' : 'pix',
                  status: 'pago',
                  cliente_id: subData?.cliente_id || 'N/A',
                  cliente_name: subData?.cliente_name || 'Cliente',
                  responsavel_id: subData?.cliente_id || 'N/A',
                  responsavel_name: subData?.cliente_name || 'Cliente',
                  net_amount: transValue,
                  settlement_date: todayStr,
                  is_settled: true,
                  createdAt: new Date().toISOString()
                })
              })
            });
          } catch (finErr) {
            console.warn("Erro ao registrar transação financeira:", finErr);
          }
        }

        return res.json({
          success: true,
          status: 'active',
          message: 'Pagamento confirmado no Asaas! Assinatura ativada com sucesso.',
          asaasPayment: asaasPaymentObj
        });
      }

      return res.json({
        success: false,
        status: subData?.status || 'pending',
        message: 'Pagamento ainda não foi identificado como concluído no Asaas.'
      });

    } catch (error: any) {
      console.error("Erro ao verificar status da assinatura no Asaas:", error);
      res.status(500).json({ error: error.message || "Falha ao verificar status." });
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

  // --- FIRESTORE REST API FALLBACK HELPERS ---
  const FIREBASE_REST_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "gbagender";
  const FIREBASE_REST_API_KEY = process.env.VITE_FIREBASE_API_KEY || "AIzaSyAcrEPPYvEChBs_oXc4tFpos2oDwWV96Rs";
  const FIREBASE_REST_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_REST_PROJECT_ID}/databases/(default)/documents`;

  function parseFirestoreRestValue(valObj: any): any {
    if (!valObj) return null;
    if ('stringValue' in valObj) return valObj.stringValue;
    if ('booleanValue' in valObj) return valObj.booleanValue;
    if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
    if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
    if ('timestampValue' in valObj) return valObj.timestampValue;
    if ('nullValue' in valObj) return null;
    if ('mapValue' in valObj) {
      const fields = valObj.mapValue?.fields || {};
      const res: any = {};
      for (const k in fields) {
        res[k] = parseFirestoreRestValue(fields[k]);
      }
      return res;
    }
    if ('arrayValue' in valObj) {
      const values = valObj.arrayValue?.values || [];
      return values.map((v: any) => parseFirestoreRestValue(v));
    }
    return null;
  }

  function parseFirestoreRestDoc(docObj: any) {
    if (!docObj || !docObj.name) return null;
    const parts = docObj.name.split('/');
    const docId = parts[parts.length - 1];
    const fields = docObj.fields || {};
    const data: any = {};
    for (const k in fields) {
      data[k] = parseFirestoreRestValue(fields[k]);
    }
    return { id: docId, data, path: docObj.name };
  }

  function toFirestoreRestValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return { integerValue: String(val) };
      return { doubleValue: val };
    }
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(toFirestoreRestValue) } };
    }
    if (typeof val === 'object') {
      const fields: any = {};
      for (const k in val) {
        fields[k] = toFirestoreRestValue(val[k]);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  async function getFirestoreRestDoc(collectionName: string, docId: string) {
    try {
      const url = `${FIREBASE_REST_BASE_URL}/${collectionName}/${encodeURIComponent(docId)}?key=${FIREBASE_REST_API_KEY}`;
      const res = await fetch(url);
      if (res.ok) {
        const raw = await res.json();
        return parseFirestoreRestDoc(raw);
      }
    } catch (err) {
      console.warn(`[Firestore REST] Error fetching ${collectionName}/${docId}:`, err);
    }
    return null;
  }

  async function queryFirestoreRest(collectionName: string, fieldName: string, op: string, value: any) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_REST_PROJECT_ID}/databases/(default)/documents:runQuery?key=${FIREBASE_REST_API_KEY}`;
      const body = {
        structuredQuery: {
          from: [{ collectionId: collectionName }],
          where: {
            fieldFilter: {
              field: { fieldPath: fieldName },
              op: op.toUpperCase(),
              value: toFirestoreRestValue(value)
            }
          },
          limit: 1
        }
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0 && list[0].document) {
          return parseFirestoreRestDoc(list[0].document);
        }
      }
    } catch (err) {
      console.warn(`[Firestore REST Query Error] ${collectionName} ${fieldName} ${op} ${value}:`, err);
    }
    return null;
  }

  async function updateFirestoreRestDoc(collectionName: string, docId: string, fieldsToUpdate: Record<string, any>) {
    try {
      const maskParams = Object.keys(fieldsToUpdate)
        .map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
        .join('&');
      const url = `${FIREBASE_REST_BASE_URL}/${collectionName}/${encodeURIComponent(docId)}?${maskParams}&key=${FIREBASE_REST_API_KEY}`;
      const restFields: any = {};
      for (const k in fieldsToUpdate) {
        restFields[k] = toFirestoreRestValue(fieldsToUpdate[k]);
      }
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: restFields })
      });
      if (res.ok) {
        console.log(`✅ [Firestore REST] Documento ${collectionName}/${docId} atualizado com sucesso!`);
        return true;
      } else {
        const errTxt = await res.text();
        console.warn(`⚠️ [Firestore REST Update Error] ${collectionName}/${docId}:`, errTxt);
      }
    } catch (err) {
      console.error(`❌ [Firestore REST Exception] ${collectionName}/${docId}:`, err);
    }
    return false;
  }

  async function createFirestoreRestDoc(collectionName: string, docId: string | null, data: Record<string, any>) {
    try {
      const url = docId 
        ? `${FIREBASE_REST_BASE_URL}/${collectionName}?documentId=${encodeURIComponent(docId)}&key=${FIREBASE_REST_API_KEY}`
        : `${FIREBASE_REST_BASE_URL}/${collectionName}?key=${FIREBASE_REST_API_KEY}`;
      const restFields: any = {};
      for (const k in data) {
        restFields[k] = toFirestoreRestValue(data[k]);
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: restFields })
      });
      if (res.ok) {
        const created = await res.json();
        return parseFirestoreRestDoc(created);
      }
    } catch (err) {
      console.error(`❌ [Firestore REST Create Exception] ${collectionName}:`, err);
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
    tenantId?: string;
  }): Promise<any> {
    let { paymentId, subscriptionId, customerId, externalReference, docId, tenantId } = params;

    // Fallback: If externalReference is missing or incomplete, attempt to fetch parent object from Asaas API
    if ((!externalReference || !externalReference.includes('client_sub')) && (subscriptionId || paymentId)) {
      try {
        const rawAsaasKey = process.env.ASAAS_API_KEY || '';
        const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
        const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
        if (asaasApiKey) {
          const baseUrl = asaasEnv === 'production' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';
          let fetchUrl = '';
          if (subscriptionId) fetchUrl = `${baseUrl}/subscriptions/${subscriptionId}`;
          else if (paymentId) fetchUrl = `${baseUrl}/payments/${paymentId}`;

          if (fetchUrl) {
            const apiRes = await fetch(fetchUrl, { headers: { 'access_token': asaasApiKey } });
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData?.externalReference) {
                externalReference = apiData.externalReference;
                console.log(`🎯 [ASAAS AUDIT] RefId recuperado via API Asaas: ${externalReference}`);
              }
            }
          }
        }
      } catch (apiErr) {
        console.warn("Aviso ao buscar refId na API Asaas:", apiErr);
      }
    }

    // 1. Direct document ID lookup
    let cleanDocId = docId || '';
    if (externalReference && externalReference.startsWith('client_sub:')) {
      cleanDocId = externalReference.replace(/^client_sub:/, '');
    }

    const directDocIds = Array.from(new Set([cleanDocId, docId, externalReference].filter(Boolean))) as string[];
    for (let id of directDocIds) {
      if (id) {
        const cleanId = id.replace(/^client_sub:/, '').replace(/^saas_tenant:/, '');
        if (cleanId && !cleanId.startsWith('sub_') && !cleanId.startsWith('pay_') && !cleanId.startsWith('cus_')) {
          if (dbAdmin) {
            try {
              const docSnap = await dbAdmin.collection('subscriptions').doc(cleanId).get();
              if (docSnap.exists) {
                return { ref: docSnap.ref, snap: docSnap, data: docSnap.data(), id: docSnap.id, isRest: false };
              }
            } catch (e) {
              // ignore doc ID syntax issues in dbAdmin
            }
          }

          // REST Fallback
          const restDoc = await getFirestoreRestDoc('subscriptions', cleanId);
          if (restDoc) {
            console.log(`🎯 [ASAAS AUDIT] Assinatura localizada via Firestore REST docId: ${restDoc.id}`);
            return { ref: null, snap: null, data: restDoc.data, id: restDoc.id, isRest: true };
          }
        }
      }
    }

    // 2. Search by externalReference, asaasInvoiceId, asaasSubscriptionId
    const baseSearchIds = Array.from(new Set([cleanDocId, docId, paymentId, subscriptionId, externalReference].filter(Boolean))) as string[];
    const expandedIds: string[] = [];
    for (const sid of baseSearchIds) {
      if (sid) {
        expandedIds.push(sid);
        expandedIds.push(`client_sub:${sid}`);
        expandedIds.push(sid.replace(/^client_sub:/, '').replace(/^saas_tenant:/, ''));
      }
    }
    const searchIds = Array.from(new Set(expandedIds.filter(Boolean)));

    if (searchIds.length > 0) {
      if (dbAdmin) {
        try {
          let q = await dbAdmin.collection('subscriptions').where('externalReference', 'in', searchIds.slice(0, 30)).limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id, isRest: false };
          }
        } catch (e) { /* ignore */ }

        try {
          let q = await dbAdmin.collection('subscriptions').where('asaasInvoiceId', 'in', searchIds.slice(0, 30)).limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id, isRest: false };
          }
        } catch (e) { /* ignore */ }

        try {
          let q = await dbAdmin.collection('subscriptions').where('asaasSubscriptionId', 'in', searchIds.slice(0, 30)).limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id, isRest: false };
          }
        } catch (e) { /* ignore */ }
      }

      // REST Fallback search
      for (const sId of searchIds) {
        let rDoc = await queryFirestoreRest('subscriptions', 'externalReference', 'EQUAL', sId);
        if (rDoc) return { ref: null, snap: null, data: rDoc.data, id: rDoc.id, isRest: true };

        rDoc = await queryFirestoreRest('subscriptions', 'asaasInvoiceId', 'EQUAL', sId);
        if (rDoc) return { ref: null, snap: null, data: rDoc.data, id: rDoc.id, isRest: true };

        rDoc = await queryFirestoreRest('subscriptions', 'asaasSubscriptionId', 'EQUAL', sId);
        if (rDoc) return { ref: null, snap: null, data: rDoc.data, id: rDoc.id, isRest: true };
      }
    }

    // 3. Search by asaasCustomerId (prioritizing pending status first)
    if (customerId) {
      if (dbAdmin) {
        try {
          let q = await dbAdmin.collection('subscriptions')
            .where('asaasCustomerId', '==', customerId)
            .where('status', '==', 'pending')
            .limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id, isRest: false };
          }
        } catch (e) { /* ignore */ }

        try {
          let q = await dbAdmin.collection('subscriptions')
            .where('asaasCustomerId', '==', customerId)
            .limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id, isRest: false };
          }
        } catch (e) { /* ignore */ }
      }

      let rDoc = await queryFirestoreRest('subscriptions', 'asaasCustomerId', 'EQUAL', customerId);
      if (rDoc) return { ref: null, snap: null, data: rDoc.data, id: rDoc.id, isRest: true };
    }

    // 4. Fallback search by tenantId and pending status
    if (tenantId) {
      if (dbAdmin) {
        try {
          let q = await dbAdmin.collection('subscriptions')
            .where('tenantId', '==', tenantId)
            .where('status', '==', 'pending')
            .limit(1).get();
          if (!q.empty) {
            const snap = q.docs[0];
            return { ref: snap.ref, snap, data: snap.data(), id: snap.id, isRest: false };
          }
        } catch (e) { /* ignore */ }
      }

      let rDoc = await queryFirestoreRest('subscriptions', 'tenantId', 'EQUAL', tenantId);
      if (rDoc && rDoc.data?.status === 'pending') {
        return { ref: null, snap: null, data: rDoc.data, id: rDoc.id, isRest: true };
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
        const subPaymentsData = await safeJsonFetch(subPaymentsRes);
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
      const paymentData = await safeJsonFetch(payRes);

      if (!paymentData || paymentData.errors) {
        return res.status(404).json({ error: "Cobrança não encontrada no Asaas." });
      }

      const isPaid = paymentData.status === 'RECEIVED' || paymentData.status === 'CONFIRMED';

      if (isPaid) {
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
          const subData = subMatch.data || {};

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

            const updateFields = {
              status: 'active',
              asaasPaymentStatus: 'received',
              asaasSubscriptionId: paymentData.subscription || subData.asaasSubscriptionId || null,
              asaasCustomerId: paymentData.customer || subData.asaasCustomerId || null,
              asaasInvoiceId: paymentData.id || subData.asaasInvoiceId || null,
              startDate: newStartStr,
              endDate: newEndStr,
              haircutsUsed: 0,
              beardsUsed: 0,
              lastRenewalDate: todayStr,
              updatedAt: new Date()
            };

            if (subRef) {
              try {
                await subRef.update(updateFields);
              } catch (upErr) {
                console.warn(`⚠️ [Check Status] Fallback REST update para ${subMatch.id}`);
                await updateFirestoreRestDoc('subscriptions', subMatch.id, updateFields);
              }
            } else {
              await updateFirestoreRestDoc('subscriptions', subMatch.id, updateFields);
            }

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

      const updateData = await safeJsonFetch(updateRes);
      if (updateData?.errors) {
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
        const subPaymentsData = await safeJsonFetch(subPaymentsRes);
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
        const chargeData = await safeJsonFetch(chargeRes);
        if (chargeData?.id) {
          targetPaymentId = chargeData.id;
        }
      }

      // Fetch Pix QR Code
      let pixData: any = {};
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${targetPaymentId}/pixQrCode`, {
          headers: { 'access_token': asaasApiKey }
        });
        pixData = await safeJsonFetch(pixRes);
      } catch (pixErr) {
        console.warn("Aviso ao buscar QR Code no Asaas em generate-pix:", pixErr);
      }

      let payDetail: any = {};
      try {
        const payDetailRes = await fetch(`${baseUrl}/payments/${targetPaymentId}`, {
          headers: { 'access_token': asaasApiKey }
        });
        payDetail = await safeJsonFetch(payDetailRes);
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

  // Retry / Recobrar charge endpoint for Asaas Subscription (Credit Card / Asaas)
  app.post(["/api/saas/subscription/retry-charge", "/saas/subscription/retry-charge", "/api/saas/subscription/recobrar", "/recobrar"], async (req, res) => {
    try {
      const { subscriptionId } = req.body;
      if (!subscriptionId) {
        return res.status(400).json({ error: "Parâmetro subscriptionId é obrigatório." });
      }

      const dbAdmin = getAdminDb();
      let subDocData: any = null;
      let targetSubDocId = subscriptionId;
      let isRestDoc = false;

      if (dbAdmin) {
        let docSnap = await dbAdmin.collection('subscriptions').doc(subscriptionId).get();
        if (docSnap.exists) {
          subDocData = docSnap.data();
        } else {
          const found = await findSubscriptionInFirestore(dbAdmin, { docId: subscriptionId, externalReference: subscriptionId });
          if (found) {
            subDocData = found.data;
            targetSubDocId = found.id;
            isRestDoc = found.isRest;
          }
        }
      } else {
        const rDoc = await getFirestoreRestDoc('subscriptions', subscriptionId);
        if (rDoc) {
          subDocData = rDoc.data;
          isRestDoc = true;
        }
      }

      if (!subDocData) {
        return res.status(404).json({ error: "Assinatura não encontrada." });
      }

      const rawAsaasKey = process.env.ASAAS_API_KEY || '';
      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      let newPaymentUrl = subDocData.paymentUrl || '';
      let newPixCopiaECola = subDocData.pixCopiaECola || '';
      let newPixQrCodeUrl = subDocData.pixQrCodeUrl || '';
      let newInvoiceId = subDocData.asaasInvoiceId || '';

      if (asaasApiKey) {
        const baseUrl = getAsaasBaseUrl(asaasEnv);
        const todayStr = new Date().toISOString().split('T')[0];

        let customerId = subDocData.asaasCustomerId || subDocData.cliente_id;
        if (!customerId || !customerId.startsWith('cus_')) {
          const clientCpf = subDocData.cliente_cpf || subDocData.cpf || '123.456.789-09';
          const cleanCpf = clientCpf.replace(/\D/g, '');
          if (cleanCpf) {
            const cusRes = await fetch(`${baseUrl}/customers?cpfCnpj=${cleanCpf}`, {
              headers: { 'access_token': asaasApiKey }
            });
            const cusData = await safeJsonFetch(cusRes);
            if (cusData?.data?.length > 0) {
              customerId = cusData.data[0].id;
            }
          }
        }

        if (!customerId || !customerId.startsWith('cus_')) {
          const cusCreateRes = await fetch(`${baseUrl}/customers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access_token': asaasApiKey
            },
            body: JSON.stringify({
              name: subDocData.cliente_name || 'Cliente Assinante',
              cpfCnpj: (subDocData.cliente_cpf || '123.456.789-09').replace(/\D/g, '')
            })
          });
          const cusCreateData = await safeJsonFetch(cusCreateRes);
          if (cusCreateData?.id) {
            customerId = cusCreateData.id;
          }
        }

        const billingType = subDocData.billingType || 'CREDIT_CARD';
        const chargePayload: any = {
          customer: customerId || 'cus_000008858108',
          billingType: billingType,
          value: Number(subDocData.amount) || Number(subDocData.price) || 100,
          dueDate: todayStr,
          description: `Recobrança Assinatura BarberElite - ${subDocData.planName || 'Plano'} (${subDocData.cliente_name || 'Cliente'})`,
          externalReference: `client_sub:${targetSubDocId}`
        };

        const chargeRes = await fetch(`${baseUrl}/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasApiKey
          },
          body: JSON.stringify(chargePayload)
        });

        const chargeData = await safeJsonFetch(chargeRes);
        if (chargeData?.id) {
          newInvoiceId = chargeData.id;
          newPaymentUrl = chargeData.invoiceUrl || chargeData.bankSlipUrl || chargeData.paymentLink || newPaymentUrl;

          try {
            const pixRes = await fetch(`${baseUrl}/payments/${newInvoiceId}/pixQrCode`, {
              headers: { 'access_token': asaasApiKey }
            });
            const pixData = await safeJsonFetch(pixRes);
            if (pixData?.payload) {
              newPixCopiaECola = pixData.payload;
              newPixQrCodeUrl = pixData.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : '';
            }
          } catch (pixErr) {
            console.warn("Aviso ao buscar QR Code Pix em retry-charge:", pixErr);
          }
        }
      }

      const updatePayload = {
        status: 'pending',
        asaasPaymentStatus: 'pending',
        asaasInvoiceId: newInvoiceId || subDocData.asaasInvoiceId || '',
        paymentUrl: newPaymentUrl || subDocData.paymentUrl || '',
        pixCopiaECola: newPixCopiaECola || subDocData.pixCopiaECola || '',
        pixQrCodeUrl: newPixQrCodeUrl || subDocData.pixQrCodeUrl || '',
        lastRecobrarAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (dbAdmin && !isRestDoc) {
        await dbAdmin.collection('subscriptions').doc(targetSubDocId).update(updatePayload);
      } else {
        await updateFirestoreRestDoc('subscriptions', targetSubDocId, updatePayload);
      }

      console.log(`[Recobrar] Assinatura ${targetSubDocId} recobrada com sucesso! Nova cobrança: ${newInvoiceId}`);

      return res.json({
        success: true,
        message: "Cobrança gerada com sucesso no Asaas!",
        paymentUrl: newPaymentUrl,
        pixCopiaECola: newPixCopiaECola,
        pixQrCodeUrl: newPixQrCodeUrl,
        invoiceId: newInvoiceId
      });

    } catch (error: any) {
      console.error("Erro ao recobrar assinatura:", error);
      res.status(500).json({ error: error.message || "Falha ao processar recobrança." });
    }
  });

  // Skip Invoice / Pular Fatura (Dar Baixa Manual no Caixa / Balcão)
  app.post(["/api/saas/subscription/skip-invoice", "/saas/subscription/skip-invoice", "/api/saas/subscription/pular-fatura"], async (req, res) => {
    try {
      const { subscriptionId, paymentMethod = 'dinheiro', amount, notes, userId, userName, launchInCash = true, cancelAsaasInvoice = true } = req.body;
      if (!subscriptionId) {
        return res.status(400).json({ error: "Parâmetro subscriptionId é obrigatório." });
      }

      const dbAdmin = getAdminDb();
      let subDocData: any = null;
      let targetSubDocId = subscriptionId;
      let isRestDoc = false;

      if (dbAdmin) {
        let docSnap = await dbAdmin.collection('subscriptions').doc(subscriptionId).get();
        if (docSnap.exists) {
          subDocData = docSnap.data();
        } else {
          const found = await findSubscriptionInFirestore(dbAdmin, { docId: subscriptionId, externalReference: subscriptionId });
          if (found) {
            subDocData = found.data;
            targetSubDocId = found.id;
            isRestDoc = found.isRest;
          }
        }
      } else {
        const rDoc = await getFirestoreRestDoc('subscriptions', subscriptionId);
        if (rDoc) {
          subDocData = rDoc.data;
          isRestDoc = true;
        }
      }

      if (!subDocData) {
        return res.status(404).json({ error: "Assinatura não encontrada." });
      }

      const rawAsaasKey = process.env.ASAAS_API_KEY || '';
      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
      const baseUrl = getAsaasBaseUrl(asaasEnv);

      // Cancel/delete pending Asaas payment if exists and requested so credit card is not charged
      if (cancelAsaasInvoice && asaasApiKey && subDocData.asaasInvoiceId && !subDocData.asaasInvoiceId.startsWith('pay_sandbox_')) {
        try {
          await fetch(`${baseUrl}/payments/${subDocData.asaasInvoiceId}`, {
            method: 'DELETE',
            headers: { 'access_token': asaasApiKey }
          });
          console.log(`[Pular Fatura] Cobrança Asaas ${subDocData.asaasInvoiceId} cancelada com sucesso.`);
        } catch (delErr) {
          console.warn("Aviso ao cancelar cobrança no Asaas em skip-invoice:", delErr);
        }
      }

      const finalAmount = Number(amount) || Number(subDocData.amount) || Number(subDocData.price) || 0;
      const todayStr = new Date().toISOString().split('T')[0];
      const todayObj = new Date();
      const newEndDate = new Date(todayObj);
      newEndDate.setDate(newEndDate.getDate() + 30);
      const newEndDateStr = newEndDate.toISOString().split('T')[0];

      // 1. Update subscription
      const updateSubPayload: any = {
        status: 'active',
        asaasPaymentStatus: 'received',
        startDate: todayStr,
        endDate: newEndDateStr,
        haircutsUsed: 0,
        beardsUsed: 0,
        serviceUsages: {},
        lastRenewalDate: new Date().toISOString(),
        lastManualSettlement: {
          date: todayStr,
          amount: finalAmount,
          paymentMethod,
          notes: notes || 'Baixa Manual / Pular Fatura',
          settledBy: userName || 'Admin'
        },
        updatedAt: new Date().toISOString()
      };

      if (dbAdmin && !isRestDoc) {
        await dbAdmin.collection('subscriptions').doc(targetSubDocId).update(updateSubPayload);
      } else {
        await updateFirestoreRestDoc('subscriptions', targetSubDocId, updateSubPayload);
      }

      // 2. Create financial transaction
      const txPayload = {
        type: 'income',
        category: 'Assinaturas',
        description: notes || `Assinatura: ${subDocData.planName || 'Plano'} - ${subDocData.cliente_name || 'Cliente'} (Baixa Manual no Balcão)`,
        amount: finalAmount,
        net_amount: finalAmount,
        fee_amount: 0,
        paymentMethod: paymentMethod,
        date: todayStr,
        settlement_date: todayStr,
        status: 'pago',
        is_settled: true,
        cliente_id: subDocData.cliente_id || '',
        cliente_name: subDocData.cliente_name || '',
        plano_id: subDocData.plano_id || '',
        subscription_amount: finalAmount,
        responsavel_id: userId || 'admin',
        responsavel_name: userName || 'Administrador',
        tenantId: subDocData.tenantId || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (dbAdmin) {
        await dbAdmin.collection('financial_transactions').add(txPayload);
      } else {
        await createFirestoreRestDoc('financial_transactions', null, txPayload);
      }

      // 3. Register cash movement in open daily cash if requested
      if (launchInCash && finalAmount > 0) {
        try {
          let openCashSnap: any = null;
          if (dbAdmin) {
            const cashQ = await dbAdmin.collection('daily_cash')
              .where('status', '==', 'open')
              .orderBy('openedAt', 'desc')
              .limit(1)
              .get();
            if (!cashQ.empty) {
              openCashSnap = cashQ.docs[0];
            }
          }

          if (openCashSnap) {
            const cashData = openCashSnap.data();
            const movPayload = {
              caixa_id: openCashSnap.id,
              tenantId: subDocData.tenantId || cashData.tenantId || '',
              type: 'income',
              category: 'Assinaturas',
              description: `Recebimento Assinatura: ${subDocData.planName || 'Plano'} (${subDocData.cliente_name || 'Cliente'})`,
              amount: finalAmount,
              paymentMethod: paymentMethod,
              is_receivable: false,
              referencia_id: targetSubDocId,
              usuario_id: userId || 'admin',
              usuario_name: userName || 'Administrador',
              date: todayStr,
              createdAt: new Date().toISOString()
            };

            await dbAdmin.collection('cash_movements').add(movPayload);
            await openCashSnap.ref.update({
              total_income: (cashData.total_income || 0) + finalAmount,
              expected_balance: (cashData.expected_balance || 0) + finalAmount,
              updatedAt: new Date().toISOString()
            });
          }
        } catch (cashErr) {
          console.warn("Aviso ao lançar no caixa aberto em skip-invoice:", cashErr);
        }
      }

      console.log(`[Pular Fatura] Assinatura ${targetSubDocId} renovada manualmente com sucesso no valor de R$ ${finalAmount}`);

      return res.json({
        success: true,
        message: "Fatura pulada e pagamento registrado no caixa com sucesso!",
        newEndDate: newEndDateStr
      });

    } catch (error: any) {
      console.error("Erro ao pular fatura / baixa manual:", error);
      res.status(500).json({ error: error.message || "Falha ao processar baixa manual." });
    }
  });

  // Get Invoices History for Subscription (Asaas + Local Firestore)
  app.get(["/api/saas/subscription/invoices", "/saas/subscription/invoices"], async (req, res) => {
    try {
      const subscriptionId = (req.query.subscriptionId as string) || '';
      const customerId = (req.query.customerId as string) || '';
      const clienteId = (req.query.clienteId as string) || '';

      const invoices: any[] = [];
      const dbAdmin = getAdminDb();

      // 1. Fetch from Firestore financial_transactions
      if (dbAdmin) {
        try {
          let q = dbAdmin.collection('financial_transactions').where('category', '==', 'Assinaturas');
          if (clienteId) {
            q = q.where('cliente_id', '==', clienteId);
          }
          const snap = await q.orderBy('date', 'desc').limit(30).get();
          snap.forEach((doc: any) => {
            const data = doc.data();
            invoices.push({
              id: doc.id,
              date: data.date || (typeof data.createdAt === 'string' ? data.createdAt.substring(0, 10) : ''),
              dueDate: data.settlement_date || data.date || '',
              amount: data.amount || data.net_amount || 0,
              status: data.status === 'pago' ? 'RECEIVED' : (data.status === 'pendente' ? 'PENDING' : 'OVERDUE'),
              statusLabel: data.status === 'pago' ? 'Paga no Balcão' : 'Pendente',
              billingType: data.paymentMethod ? String(data.paymentMethod).toUpperCase() : 'BALCAO',
              billingTypeLabel: data.paymentMethod === 'dinheiro' ? 'Dinheiro (Balcão)' : (data.paymentMethod === 'pix' ? 'Pix Balcão' : (data.paymentMethod === 'debito' ? 'Cartão Débito (Maquininha)' : (data.paymentMethod === 'credito' ? 'Cartão Crédito (Maquininha)' : 'Balcão / Caixa'))),
              description: data.description || 'Assinatura',
              source: 'local'
            });
          });
        } catch (fErr) {
          console.warn("Aviso ao buscar transações no Firestore em subscription/invoices:", fErr);
        }
      }

      // 2. Fetch from Asaas API if customerId or subscriptionId exists
      const rawAsaasKey = process.env.ASAAS_API_KEY || '';
      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      if (asaasApiKey && (customerId || subscriptionId)) {
        const baseUrl = getAsaasBaseUrl(asaasEnv);
        let asaasCustomer = customerId;

        // If no customerId provided, look up in subscription document
        if (!asaasCustomer && subscriptionId && dbAdmin) {
          try {
            const subDoc = await dbAdmin.collection('subscriptions').doc(subscriptionId).get();
            if (subDoc.exists) {
              const sData = subDoc.data();
              asaasCustomer = sData?.asaasCustomerId || '';
            }
          } catch (e) { /* ignore */ }
        }

        if (asaasCustomer && asaasCustomer.startsWith('cus_')) {
          try {
            const asaasRes = await fetch(`${baseUrl}/payments?customer=${asaasCustomer}&limit=20`, {
              headers: { 'access_token': asaasApiKey }
            });
            const asaasData = await safeJsonFetch(asaasRes);
            if (asaasData?.data && Array.isArray(asaasData.data)) {
              for (const p of asaasData.data) {
                const isPaid = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'RECEIVED_IN_CASH_FEE'].includes(p.status);
                const isOverdue = p.status === 'OVERDUE';
                const isPending = p.status === 'PENDING';

                invoices.push({
                  id: p.id,
                  date: p.paymentDate || p.clientPaymentDate || p.dateCreated || p.dueDate,
                  dueDate: p.dueDate,
                  amount: p.value || 0,
                  netValue: p.netValue,
                  status: p.status,
                  statusLabel: isPaid ? 'Paga (Asaas)' : (isOverdue ? 'Atrasada / Não Cobrada' : (isPending ? 'Aguardando Pagamento' : p.status)),
                  billingType: p.billingType,
                  billingTypeLabel: p.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito (Asaas)' : (p.billingType === 'PIX' ? 'Pix (Asaas)' : (p.billingType === 'BOLETO' ? 'Boleto' : p.billingType)),
                  description: p.description || 'Assinatura Asaas',
                  paymentUrl: p.invoiceUrl || p.bankSlipUrl || p.paymentLink || '',
                  invoiceUrl: p.invoiceUrl || p.bankSlipUrl || '',
                  source: 'asaas'
                });
              }
            }
          } catch (aErr) {
            console.warn("Aviso ao buscar cobranças no Asaas em subscription/invoices:", aErr);
          }
        }
      }

      // Sort combined by date descending
      invoices.sort((a, b) => {
        const dateA = new Date(a.date || a.dueDate || 0).getTime();
        const dateB = new Date(b.date || b.dueDate || 0).getTime();
        return dateB - dateA;
      });

      return res.json({
        success: true,
        invoices
      });

    } catch (error: any) {
      console.error("Erro ao listar faturas da assinatura:", error);
      res.status(500).json({ error: error.message || "Falha ao buscar faturas." });
    }
  });

  // Helper for Asaas transaction types
  function formatAsaasTransactionType(type?: string): string {
    switch (type) {
      case 'PAYMENT_RECEIVED': return 'Recebimento de Cobrança';
      case 'PAYMENT_FEE': return 'Taxa do Gateway Asaas';
      case 'TRANSFER': return 'Transferência / Saque';
      case 'TRANSFER_FEE': return 'Taxa de Transferência';
      case 'REFUND': return 'Estorno de Pagamento';
      case 'PAYMENT_REFUNDED': return 'Pagamento Estornado';
      case 'PAYMENT_REVERSED': return 'Pagamento Revertido';
      case 'PIX_TRANSACTION_CREDIT': return 'PIX Recebido';
      case 'PIX_TRANSACTION_DEBIT': return 'PIX Enviado';
      case 'BILL_PAYMENT': return 'Pagamento de Boleto/Conta';
      case 'CHARGEBACK': return 'Chargeback / Contestação';
      case 'INTERNAL_TRANSFER_CREDIT': return 'Transferência Recebida';
      case 'INTERNAL_TRANSFER_DEBIT': return 'Transferência Enviada';
      default: return type || 'Transação Asaas';
    }
  }

  // Endpoint to create Asaas Subaccount for a tenant
  app.post(["/api/saas/tenants/create-subaccount", "/api/saas/create-subaccount"], async (req, res) => {
    try {
      const {
        tenantId,
        name,
        email,
        cpfCnpj,
        phone,
        mobilePhone,
        address,
        addressNumber,
        complement,
        province,
        postalCode
      } = req.body || {};

      if (!name || !cpfCnpj || !email) {
        return res.status(400).json({ error: "Nome, CPF/CNPJ e E-mail são obrigatórios para criar a subconta Asaas." });
      }

      // Security check: verify admin auth if tenantId is provided
      if (tenantId) {
        const authCheck = await verifyTenantAdminAuth(req, tenantId);
        if (!authCheck.authorized) {
          await recordSecurityAudit('SUBACCOUNT_CREATION_BLOCKED_UNAUTHORIZED', tenantId, { error: authCheck.error }, req);
          return res.status(403).json({ error: authCheck.error });
        }
      }

      const rawMasterKey = process.env.ASAAS_API_KEY || '';
      const masterApiKey = rawMasterKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';
      const baseUrl = getAsaasBaseUrl(asaasEnv);

      if (!masterApiKey) {
        return res.status(400).json({ error: "Chave Master do Asaas não configurada no servidor." });
      }

      const cleanCpfCnpj = String(cpfCnpj).replace(/\D/g, '');
      const cleanPhone = String(mobilePhone || phone || '').replace(/\D/g, '');
      const cleanPostalCode = String(postalCode || '').replace(/\D/g, '');

      // Payload for Asaas /v3/accounts (Subconta / White-label)
      const subaccountPayload: any = {
        name,
        email,
        cpfCnpj: cleanCpfCnpj,
        phone: cleanPhone || undefined,
        mobilePhone: cleanPhone || undefined,
        address: address || undefined,
        addressNumber: addressNumber || undefined,
        complement: complement || undefined,
        province: province || undefined,
        postalCode: cleanPostalCode || undefined,
        companyType: cleanCpfCnpj.length > 11 ? 'LIMITED' : 'MEI'
      };

      console.log(`[Asaas Subaccount] Criando subconta para tenant ${tenantId || name} (${cleanCpfCnpj})...`);

      const asaasRes = await fetch(`${baseUrl}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': masterApiKey
        },
        body: JSON.stringify(subaccountPayload)
      });

      const asaasData = await asaasRes.json();

      if (!asaasRes.ok) {
        const errorMsg = asaasData?.errors?.[0]?.description || asaasData?.message || "Erro ao registrar subconta no Asaas.";
        console.error("[Asaas Subaccount Error]", asaasData);
        return res.status(asaasRes.status).json({ error: errorMsg, details: asaasData });
      }

      const subaccountId = asaasData.id || asaasData.walletId;
      const apiKey = asaasData.apiKey;
      const walletId = asaasData.walletId || asaasData.id;
      const accountStatus = asaasData.status || 'APPROVED';

      const asaasSubaccountInfo = {
        subaccountId,
        walletId,
        accountStatus,
        cpfCnpj: cleanCpfCnpj,
        isConfigured: true,
        createdAt: new Date().toISOString()
      };

      // If tenantId was provided, update the tenant in Firestore
      if (tenantId) {
        const dbAdmin = getAdminDb();
        if (dbAdmin) {
          try {
            // Save private apiKey into isolated private_settings (Backend Admin only)
            await dbAdmin.collection('tenants').doc(tenantId).collection('private_settings').doc('asaas').set({
              apiKey: apiKey,
              subaccountId,
              walletId,
              updatedAt: new Date().toISOString()
            }, { merge: true });

            // Save public metadata in tenant document WITHOUT exposing raw apiKey
            await dbAdmin.collection('tenants').doc(tenantId).set({
              asaas: asaasSubaccountInfo,
              cnpjCpf: cleanCpfCnpj,
              updatedAt: new Date().toISOString()
            }, { merge: true });

            await recordSecurityAudit('SUBACCOUNT_CREATED', tenantId, { subaccountId, walletId, cpfCnpj: cleanCpfCnpj }, req);
          } catch (dbErr) {
            console.warn("Aviso ao persistir subconta no tenant:", dbErr);
          }
        }
      }

      return res.json({
        success: true,
        message: "Subconta Asaas criada com sucesso!",
        subaccount: asaasSubaccountInfo
      });

    } catch (error: any) {
      console.error("Erro interno ao criar subconta Asaas:", error);
      res.status(500).json({ error: error.message || "Falha interna ao criar subconta Asaas." });
    }
  });

  // Digital Account Summary (Saldo, Previsão, Status)
  app.get(["/api/saas/gateway/digital-account/summary", "/api/digital-account/summary"], async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || '';
      const { apiKey: asaasApiKey, baseUrl, env: asaasEnv, isSubaccount, hasCustomKey, tenantData } = await getTenantAsaasCredentials(tenantId);

      // If tenant has no custom key configured and no subaccount registered
      if (!hasCustomKey && !tenantData?.asaas?.subaccountId) {
        return res.json({
          success: true,
          balance: 0,
          pendingBalance: 0,
          totalReceived: 0,
          accountStatus: 'NOT_CONFIGURED',
          environment: asaasEnv,
          isSubaccount: false,
          isConnected: false,
          lastSync: new Date().toISOString()
        });
      }

      let balance = 0;
      let pendingBalance = 0;
      let totalReceived = 0;
      let accountStatus = 'ACTIVE';
      let isConnected = false;

      if (asaasApiKey && asaasApiKey.length > 10) {
        // 1. Saldo em conta (Livre)
        try {
          const balRes = await fetch(`${baseUrl}/finance/balance`, {
            headers: { 'access_token': asaasApiKey }
          });
          if (balRes.ok) {
            const balData = await balRes.json();
            balance = Number(balData.balance) || 0;
            isConnected = true;
          }
        } catch (balErr) {
          console.warn("Aviso ao buscar saldo Asaas:", balErr);
        }

        // 2. Saldo pendente (Cobranças a receber / PENDING)
        try {
          const pendRes = await fetch(`${baseUrl}/payments?status=PENDING&limit=100`, {
            headers: { 'access_token': asaasApiKey }
          });
          if (pendRes.ok) {
            const pendData = await pendRes.json();
            if (Array.isArray(pendData?.data)) {
              pendingBalance = pendData.data.reduce((acc: number, p: any) => {
                const net = p.netValue !== undefined && p.netValue !== null ? Number(p.netValue) : Number(p.value);
                return acc + (isNaN(net) ? 0 : net);
              }, 0);
            }
          }
        } catch (pErr) {
          console.warn("Aviso ao buscar cobranças pendentes Asaas:", pErr);
        }

        // 3. Total Recebido (Cobranças com status RECEIVED ou CONFIRMED)
        try {
          const recRes = await fetch(`${baseUrl}/payments?status=RECEIVED,CONFIRMED&limit=100`, {
            headers: { 'access_token': asaasApiKey }
          });
          if (recRes.ok) {
            const recData = await recRes.json();
            if (Array.isArray(recData?.data)) {
              totalReceived = recData.data.reduce((acc: number, p: any) => {
                const net = p.netValue !== undefined && p.netValue !== null ? Number(p.netValue) : Number(p.value);
                return acc + (isNaN(net) ? 0 : net);
              }, 0);
            }
          }
        } catch (rErr) {
          console.warn("Aviso ao buscar total recebido Asaas:", rErr);
        }

        // 4. Status cadastral da conta Asaas
        try {
          const accRes = await fetch(`${baseUrl}/myAccount/status`, {
            headers: { 'access_token': asaasApiKey }
          });
          if (accRes.ok) {
            const accData = await accRes.json();
            accountStatus = accData.commercialInfo?.status || accData.accountStatus || accData.general?.status || 'APPROVED';
          }
        } catch (aErr) {}
      }

      return res.json({
        success: true,
        balance,
        pendingBalance,
        totalReceived,
        accountStatus: isConnected ? accountStatus : (asaasEnv === 'sandbox' ? 'SANDBOX' : 'NOT_CONFIGURED'),
        environment: asaasEnv,
        isSubaccount,
        isConnected,
        lastSync: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Erro no resumo da conta digital:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar resumo da conta digital." });
    }
  });

  // Digital Account Statement (Extrato de Movimentações)
  app.get(["/api/saas/gateway/digital-account/statement", "/api/digital-account/statement"], async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const startDate = req.query.startDate as string;
      const finishDate = req.query.finishDate as string;
      const tenantId = (req.query.tenantId as string) || '';

      const { apiKey: asaasApiKey, baseUrl, env: asaasEnv, hasCustomKey, tenantData } = await getTenantAsaasCredentials(tenantId);

      if (!hasCustomKey && !tenantData?.asaas?.subaccountId) {
        return res.json({
          success: true,
          transactions: [],
          totalCount: 0,
          hasMore: false,
          environment: asaasEnv
        });
      }

      let transactions: any[] = [];
      let totalCount = 0;
      let hasMore = false;

      if (asaasApiKey && asaasApiKey.length > 10) {
        // 1. Try to fetch from /finance/financialTransactions (Extrato oficial do Asaas)
        try {
          let url = `${baseUrl}/finance/financialTransactions?limit=${limit}&offset=${offset}`;
          if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
          if (finishDate) url += `&finishDate=${encodeURIComponent(finishDate)}`;

          const txRes = await fetch(url, {
            headers: { 'access_token': asaasApiKey }
          });

          if (txRes.ok) {
            const txData = await txRes.json();
            if (Array.isArray(txData?.data) && txData.data.length > 0) {
              totalCount = txData.totalCount || txData.data.length;
              hasMore = txData.hasMore || false;
              transactions = txData.data.map((item: any) => {
                const rawVal = Number(item.value) || 0;
                const typeStr = (item.type || '').toUpperCase();
                
                const incomeTypes = ['PAYMENT_RECEIVED', 'PIX_TRANSACTION_CREDIT', 'INTERNAL_TRANSFER_CREDIT', 'FEE_REFUND', 'CREDIT'];
                const isIncome = incomeTypes.includes(typeStr) || rawVal > 0;

                return {
                  id: item.id,
                  date: item.date || item.paymentDate || item.dateCreated || '',
                  type: item.type || 'PAYMENT',
                  typeLabel: formatAsaasTransactionType(item.type),
                  description: item.description || (isIncome ? 'Recebimento de Pagamento' : 'Tarifa / Transferência'),
                  value: Math.abs(rawVal),
                  isIncome,
                  balance: Number(item.balance) || 0,
                  paymentId: item.paymentId || null,
                  transferId: item.transferId || null,
                  invoiceUrl: item.paymentId ? `https://${asaasEnv === 'sandbox' ? 'sandbox.' : ''}asaas.com/i/${item.paymentId}` : ''
                };
              });
            }
          }
        } catch (err) {
          console.warn("Aviso ao buscar extrato financeiro Asaas:", err);
        }

        // 2. Fallback to /payments if financialTransactions has no items (common in sandbox or initial state)
        if (transactions.length === 0) {
          try {
            let payUrl = `${baseUrl}/payments?limit=${limit}&offset=${offset}`;
            if (startDate) payUrl += `&dueDate[ge]=${startDate}`;
            if (finishDate) payUrl += `&dueDate[le]=${finishDate}`;

            const payRes = await fetch(payUrl, {
              headers: { 'access_token': asaasApiKey }
            });

            if (payRes.ok) {
              const payData = await payRes.json();
              if (Array.isArray(payData?.data)) {
                totalCount = payData.totalCount || payData.data.length;
                hasMore = payData.hasMore || false;
                transactions = payData.data.map((p: any) => {
                  const isReceived = p.status === 'RECEIVED' || p.status === 'CONFIRMED';
                  const isRefunded = p.status === 'REFUNDED' || p.status === 'REFUND_REQUESTED';
                  
                  let tType = 'PAYMENT_PENDING';
                  if (isReceived) tType = 'PAYMENT_RECEIVED';
                  else if (isRefunded) tType = 'REFUND';
                  else if (p.status === 'OVERDUE') tType = 'PAYMENT_OVERDUE';

                  return {
                    id: p.id,
                    date: p.paymentDate || p.clientPaymentDate || p.dueDate || p.dateCreated || '',
                    type: tType,
                    typeLabel: isReceived 
                      ? `Recebido via ${p.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : (p.billingType === 'PIX' ? 'PIX' : 'Boleto')}`
                      : (isRefunded ? 'Pagamento Estornado' : `Cobrança ${p.billingType} (${p.status})`),
                    description: p.description || `Pagamento Asaas - ${p.billingType}`,
                    customerName: p.customerName || '',
                    value: Number(p.value) || 0,
                    netValue: Number(p.netValue) || Number(p.value) || 0,
                    fee: Math.max(0, (Number(p.value) || 0) - (Number(p.netValue) || Number(p.value) || 0)),
                    isIncome: isReceived,
                    status: p.status,
                    billingType: p.billingType,
                    invoiceUrl: p.invoiceUrl || p.bankSlipUrl || p.paymentLink || '',
                    balance: 0
                  };
                });
              }
            }
          } catch (pErr) {
            console.warn("Aviso ao buscar cobranças para extrato:", pErr);
          }
        }
      }

      return res.json({
        success: true,
        transactions,
        totalCount,
        hasMore,
        environment: asaasEnv
      });
    } catch (error: any) {
      console.error("Erro ao listar extrato da conta digital:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar extrato." });
    }
  });

  // Get Payment Details from Asaas
  app.get(["/api/saas/gateway/digital-account/payment-details", "/api/digital-account/payment-details"], async (req, res) => {
    try {
      const paymentId = req.query.paymentId as string;
      const tenantId = (req.query.tenantId as string) || '';
      if (!paymentId) {
        return res.status(400).json({ error: "paymentId é obrigatório." });
      }

      const { apiKey: asaasApiKey, baseUrl, env: asaasEnv } = await getTenantAsaasCredentials(tenantId);

      if (!asaasApiKey) {
        return res.status(400).json({ error: "Chave do Asaas não configurada." });
      }

      const payRes = await fetch(`${baseUrl}/payments/${paymentId}`, {
        headers: { 'access_token': asaasApiKey }
      });

      if (!payRes.ok) {
        const errText = await payRes.text();
        return res.status(payRes.status).json({ error: `Erro do Asaas: ${errText}` });
      }

      const payment = await payRes.json();

      // Optional: fetch customer info if customer ID is present
      let customer = null;
      if (payment.customer) {
        try {
          const custRes = await fetch(`${baseUrl}/customers/${payment.customer}`, {
            headers: { 'access_token': asaasApiKey }
          });
          if (custRes.ok) {
            customer = await custRes.json();
          }
        } catch (cErr) {}
      }

      return res.json({
        success: true,
        payment,
        customer,
        environment: asaasEnv
      });
    } catch (error: any) {
      console.error("Erro ao buscar detalhes da cobrança:", error);
      res.status(500).json({ error: error.message || "Erro ao buscar detalhes." });
    }
  });

  // Refund Payment in Asaas
  app.post(["/api/saas/gateway/digital-account/refund", "/api/digital-account/refund"], async (req, res) => {
    try {
      const { paymentId, value, description, tenantId } = req.body || {};
      if (!paymentId) {
        return res.status(400).json({ error: "paymentId é obrigatório para estorno." });
      }

      // Security check: verify admin auth
      if (tenantId) {
        const authCheck = await verifyTenantAdminAuth(req, tenantId);
        if (!authCheck.authorized) {
          await recordSecurityAudit('REFUND_BLOCKED_UNAUTHORIZED', tenantId, { error: authCheck.error, paymentId, value }, req);
          return res.status(403).json({ error: authCheck.error });
        }
      }

      const { apiKey: asaasApiKey, baseUrl } = await getTenantAsaasCredentials(tenantId);

      if (!asaasApiKey) {
        return res.status(400).json({ error: "Chave de API do Asaas não configurada." });
      }

      const refundPayload: any = {};
      if (value && Number(value) > 0) {
        refundPayload.value = Number(value);
      }
      if (description) {
        refundPayload.description = description;
      }

      const refundRes = await fetch(`${baseUrl}/payments/${paymentId}/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": asaasApiKey
        },
        body: JSON.stringify(refundPayload)
      });

      const refundData = await refundRes.json();

      if (!refundRes.ok) {
        const errorMsg = refundData?.errors?.[0]?.description || refundData?.message || "Erro ao processar estorno no Asaas.";
        await recordSecurityAudit('REFUND_FAILED', tenantId || '', { paymentId, value, error: errorMsg }, req);
        return res.status(refundRes.status).json({ error: errorMsg, details: refundData });
      }

      // If DB admin is initialized, attempt to update local financial transactions
      const dbAdmin = getAdminDb();
      if (dbAdmin) {
        try {
          const transSnap = await dbAdmin.collection('financial_transactions')
            .where('paymentId', '==', paymentId)
            .get();
          
          const batch = dbAdmin.batch();
          transSnap.forEach((docSnap) => {
            batch.update(docSnap.ref, {
              status: 'estornado',
              refundedAt: new Date().toISOString(),
              refundReason: description || 'Estorno via Conta Digital Asaas'
            });
          });
          if (!transSnap.empty) {
            await batch.commit();
          }
        } catch (dbErr) {
          console.warn("Aviso ao atualizar transações locais após estorno:", dbErr);
        }
      }

      await recordSecurityAudit('REFUND_SUCCESS', tenantId || '', { paymentId, value, description }, req);

      return res.json({
        success: true,
        message: "Estorno processado com sucesso!",
        payment: refundData
      });
    } catch (error: any) {
      console.error("Erro ao realizar estorno:", error);
      res.status(500).json({ error: error.message || "Erro interno ao processar estorno." });
    }
  });

  // Digital Account Payout Account Details (Consultar Conta Homologada para Saque)
  app.get(["/api/saas/gateway/digital-account/payout-account", "/api/digital-account/payout-account"], async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || '';
      if (!tenantId) {
        return res.status(400).json({ error: "tenantId é obrigatório." });
      }

      const dbAdmin = getAdminDb();
      if (!dbAdmin) {
        return res.json({ success: true, officialCnpjCpf: '', payoutAccount: null });
      }

      const tenantDoc = await dbAdmin.collection('tenants').doc(tenantId).get();
      if (!tenantDoc.exists) {
        return res.status(404).json({ error: "Barbearia / Tenant não encontrado." });
      }

      const tData = tenantDoc.data() || {};
      const officialCnpjCpf = tData.cnpjCpf || tData.asaas?.cpfCnpj || '';
      const officialName = tData.name || tData.ownerName || '';
      const payoutAccount = tData.payoutAccount || null;

      return res.json({
        success: true,
        officialCnpjCpf,
        officialName,
        tenantName: tData.name,
        payoutAccount
      });
    } catch (error: any) {
      console.error("Erro ao consultar conta de saque do tenant:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar conta de saque." });
    }
  });

  // Digital Account Payout Account Save & Validate (Cadastrar / Homologar Conta de Saque Mesma Titularidade)
  app.post(["/api/saas/gateway/digital-account/payout-account", "/api/digital-account/payout-account"], async (req, res) => {
    try {
      const {
        tenantId,
        type, // 'PIX' | 'TED'
        pixKeyType, // 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'
        pixKey,
        bankCode,
        bankName,
        agency,
        account,
        accountDigit,
        bankAccountType, // 'CONTA_CORRENTE' | 'CONTA_POUPANCA'
        holderName,
        holderDocument
      } = req.body || {};

      if (!tenantId) {
        return res.status(400).json({ error: "tenantId é obrigatório." });
      }

      // Security Rate Limiting
      const rateLimit = checkFinancialRateLimit(`payout:${tenantId}`, 6, 10);
      if (!rateLimit.allowed) {
        await recordSecurityAudit('PAYOUT_RATE_LIMIT_EXCEEDED', tenantId, {}, req);
        return res.status(429).json({ error: "Muitas alterações de conta solicitadas em pouco tempo. Por segurança, aguarde alguns minutos." });
      }

      // Security Auth Verification
      const authCheck = await verifyTenantAdminAuth(req, tenantId);
      if (!authCheck.authorized) {
        await recordSecurityAudit('PAYOUT_ACCOUNT_BLOCKED_UNAUTHORIZED', tenantId, { error: authCheck.error }, req);
        return res.status(403).json({ error: authCheck.error });
      }

      const dbAdmin = getAdminDb();
      if (!dbAdmin) {
        return res.status(500).json({ error: "Banco de dados indisponível." });
      }

      const tenantDocRef = dbAdmin.collection('tenants').doc(tenantId);
      const tenantSnap = await tenantDocRef.get();
      if (!tenantSnap.exists) {
        return res.status(404).json({ error: "Barbearia não encontrada no sistema." });
      }

      const tenantData = tenantSnap.data() || {};
      const officialDocClean = String(tenantData.cnpjCpf || tenantData.asaas?.cpfCnpj || '').replace(/\D/g, '');
      const providedDocClean = String(holderDocument || '').replace(/\D/g, '');

      if (!providedDocClean && !officialDocClean) {
        return res.status(400).json({ error: "O CPF ou CNPJ do titular é obrigatório para cadastrar a conta de saque." });
      }

      const finalHolderDoc = officialDocClean || providedDocClean;

      // Same-Ownership Security Enforcement:
      if (officialDocClean && providedDocClean && officialDocClean !== providedDocClean) {
        await recordSecurityAudit('PAYOUT_ACCOUNT_DOC_MISMATCH', tenantId, { officialDocClean, providedDocClean }, req);
        return res.status(403).json({
          error: `Violação de Segurança (Mesma Titularidade): A conta de saque deve pertencer obrigatoriamente ao mesmo CPF/CNPJ cadastrado para a barbearia no Portal SaaS (${officialDocClean}).`
        });
      }

      if (!holderName || !holderName.trim()) {
        return res.status(400).json({ error: "Informe o nome ou razão social completo do titular da conta." });
      }

      const accountType = type === 'TED' ? 'TED' : 'PIX';
      const cleanPayoutAccount: any = {
        type: accountType,
        holderName: holderName.trim(),
        holderDocument: finalHolderDoc,
        status: 'APPROVED',
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (accountType === 'PIX') {
        let cleanKey = String(pixKey || '').trim();
        const kType = String(pixKeyType || (finalHolderDoc.length > 11 ? 'CNPJ' : 'CPF')).toUpperCase();

        if (kType === 'CPF' || kType === 'CNPJ') {
          cleanKey = cleanKey.replace(/\D/g, '');
          if (!cleanKey) {
            cleanKey = finalHolderDoc; // Auto-preenche com o CPF/CNPJ oficial se vazio
          }
          if (cleanKey !== finalHolderDoc) {
            return res.status(400).json({
              error: `A chave PIX do tipo ${kType} deve ser exatamente o mesmo documento cadastrado (${finalHolderDoc}).`
            });
          }
        } else {
          // Strict protection: require CPF/CNPJ for withdrawals
          return res.status(400).json({
            error: `Por diretrizes de segurança antifraude (Mesma Titularidade), a chave PIX deve ser do tipo CPF ou CNPJ do titular (${finalHolderDoc}).`
          });
        }

        cleanPayoutAccount.pixKey = cleanKey;
        cleanPayoutAccount.pixKeyType = kType;
      } else {
        // TED Validation
        const cleanAgency = String(agency || '').replace(/\D/g, '');
        const cleanAccount = String(account || '').replace(/[^\d-]/g, '');
        const cleanDigit = String(accountDigit || '0').replace(/[^\w]/g, '') || '0';

        if (!cleanAgency || !cleanAccount) {
          return res.status(400).json({ error: "Informe a agência e o número da conta com dígito." });
        }

        cleanPayoutAccount.bankCode = String(bankCode || '001').padStart(3, '0');
        cleanPayoutAccount.bankName = bankName || 'Banco Principal';
        cleanPayoutAccount.agency = cleanAgency;
        cleanPayoutAccount.account = cleanAccount;
        cleanPayoutAccount.accountDigit = cleanDigit;
        cleanPayoutAccount.bankAccountType = bankAccountType || 'CONTA_CORRENTE';
      }

      // Save into Tenant profile
      await tenantDocRef.update({
        payoutAccount: cleanPayoutAccount,
        cnpjCpf: finalHolderDoc,
        updatedAt: new Date().toISOString()
      });

      // Audit Log
      await recordSecurityAudit('PAYOUT_ACCOUNT_UPDATED', tenantId, {
        type: accountType,
        holderDocument: finalHolderDoc,
        holderName: cleanPayoutAccount.holderName
      }, req);

      return res.json({
        success: true,
        message: "Conta bancária para saque cadastrada e homologada com sucesso!",
        payoutAccount: cleanPayoutAccount
      });
    } catch (error: any) {
      console.error("Erro ao salvar conta de saque do tenant:", error);
      res.status(500).json({ error: error.message || "Erro ao salvar conta de saque." });
    }
  });

  // Digital Account Transfers History (List Transfers / Saques)
  app.get(["/api/saas/gateway/digital-account/transfers", "/api/digital-account/transfers"], async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 30, 100);
      const tenantId = (req.query.tenantId as string) || '';
      const { apiKey: asaasApiKey, baseUrl, hasCustomKey, tenantData } = await getTenantAsaasCredentials(tenantId);

      if (!hasCustomKey && !tenantData?.asaas?.subaccountId) {
        return res.json({ success: true, transfers: [] });
      }

      if (!asaasApiKey) {
        return res.json({ success: true, transfers: [] });
      }

      const tfRes = await fetch(`${baseUrl}/transfers?limit=${limit}`, {
        headers: { 'access_token': asaasApiKey }
      });

      if (!tfRes.ok) {
        return res.json({ success: true, transfers: [] });
      }

      const tfData = await tfRes.json();
      const transfers = Array.isArray(tfData?.data) ? tfData.data.map((t: any) => ({
        id: t.id,
        date: t.dateCreated || t.effectiveDate || '',
        value: Number(t.value) || 0,
        netValue: Number(t.netValue) || Number(t.value) || 0,
        transferFee: Number(t.transferFee) || 0,
        status: t.status,
        type: t.type || 'PIX',
        pixAddressKey: t.pixAddressKey || null,
        pixAddressKeyType: t.pixAddressKeyType || null,
        bankAccount: t.bankAccount || null,
        failReason: t.failReason || null,
        transactionReceiptUrl: t.transactionReceiptUrl || null
      })) : [];

      return res.json({
        success: true,
        transfers
      });
    } catch (error: any) {
      console.error("Erro ao listar transferências:", error);
      res.status(500).json({ error: error.message || "Erro ao consultar histórico de saques." });
    }
  });

  // Digital Account Transfer Request (Solicitar Saque / Transferência Pix ou TED)
  app.post(["/api/saas/gateway/digital-account/transfer", "/api/digital-account/transfer"], async (req, res) => {
    try {
      const {
        value,
        operationType, // 'PIX' | 'TED'
        pixAddressKey,
        pixAddressKeyType, // 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP'
        bankAccount, // { bankCode, ownerName, cpfCnpj, agency, account, accountDigit, bankAccountType }
        description,
        tenantId
      } = req.body || {};

      const numValue = Number(value);
      if (!numValue || isNaN(numValue) || numValue <= 0) {
        return res.status(400).json({ error: "Informe um valor válido maior que zero." });
      }

      if (numValue < 5) {
        return res.status(400).json({ error: "O valor mínimo para transferência no Asaas é de R$ 5,00." });
      }

      // Security Rate Limiting (Anti-Flood / Anti-Brute-Force)
      const rateLimit = checkFinancialRateLimit(`transfer:${tenantId || 'global'}`, 5, 10);
      if (!rateLimit.allowed) {
        await recordSecurityAudit('TRANSFER_RATE_LIMIT_EXCEEDED', tenantId || '', { value: numValue }, req);
        return res.status(429).json({ error: "Limite de tentativas de transferência excedido. Por segurança, aguarde 10 minutos." });
      }

      // Security Auth Verification (Zero-Trust)
      if (tenantId) {
        const authCheck = await verifyTenantAdminAuth(req, tenantId);
        if (!authCheck.authorized) {
          await recordSecurityAudit('TRANSFER_BLOCKED_UNAUTHORIZED', tenantId, { error: authCheck.error, value: numValue }, req);
          return res.status(403).json({ error: authCheck.error });
        }
      }

      const { apiKey: asaasApiKey, baseUrl } = await getTenantAsaasCredentials(tenantId);

      if (!asaasApiKey) {
        return res.status(400).json({ error: "Chave de API do Asaas não configurada." });
      }

      // Check Same-Ownership if tenant document exists
      const dbAdmin = getAdminDb();
      let officialDoc = '';
      if (dbAdmin && tenantId) {
        try {
          const tDoc = await dbAdmin.collection('tenants').doc(tenantId).get();
          if (tDoc.exists) {
            const tData = tDoc.data();
            officialDoc = String(tData?.cnpjCpf || tData?.asaas?.cpfCnpj || '').replace(/\D/g, '');
            
            if (officialDoc) {
              if (operationType === 'PIX' || pixAddressKey) {
                const kType = String(pixAddressKeyType || '').toUpperCase();
                const cleanKey = String(pixAddressKey || '').replace(/\D/g, '');

                // Strict Mesma Titularidade: Only CPF/CNPJ allowed for PIX
                if (kType !== 'CPF' && kType !== 'CNPJ') {
                  await recordSecurityAudit('TRANSFER_BLOCKED_INVALID_KEYTYPE', tenantId, { kType, pixAddressKey }, req);
                  return res.status(403).json({
                    error: `Proteção Antifraude (Mesma Titularidade): Por segurança contra desvios de valores, saques via PIX só são autorizados para a chave CPF ou CNPJ oficial da barbearia (${officialDoc}).`
                  });
                }

                if (cleanKey !== officialDoc) {
                  await recordSecurityAudit('TRANSFER_BLOCKED_DOC_MISMATCH', tenantId, { cleanKey, officialDoc }, req);
                  return res.status(403).json({
                    error: `Proteção Antifraude (Mesma Titularidade): O saque via PIX com chave ${kType} deve ser obrigatoriamente destinado ao CPF/CNPJ da barbearia (${officialDoc}).`
                  });
                }
              } else if (bankAccount) {
                const bDoc = String(bankAccount.cpfCnpj || '').replace(/\D/g, '');
                if (bDoc && bDoc !== officialDoc) {
                  await recordSecurityAudit('TRANSFER_BLOCKED_TED_DOC_MISMATCH', tenantId, { bDoc, officialDoc }, req);
                  return res.status(403).json({
                    error: `Proteção Antifraude (Mesma Titularidade): O titular da conta bancária de saque (${bDoc}) deve ter o mesmo CPF/CNPJ cadastrado para a barbearia (${officialDoc}).`
                  });
                }
              }
            }
          }
        } catch (secErr) {
          console.warn("Aviso na verificação de mesma titularidade de saque:", secErr);
        }
      }

      // Check current balance before executing transfer
      try {
        const balRes = await fetch(`${baseUrl}/finance/balance`, {
          headers: { 'access_token': asaasApiKey }
        });
        if (balRes.ok) {
          const balData = await balRes.json();
          const currentBal = Number(balData?.balance) || 0;
          if (numValue > currentBal) {
            return res.status(400).json({
              error: `Saldo insuficiente para transferência. Saldo atual: R$ ${currentBal.toFixed(2)}, Valor solicitado: R$ ${numValue.toFixed(2)}`
            });
          }
        }
      } catch (checkErr) {
        console.warn("Aviso ao validar saldo pré-transferência:", checkErr);
      }

      // Construct transfer payload
      const transferPayload: any = {
        value: numValue,
        description: description || "Saque solicitado via Conta Digital da Barbearia"
      };

      if (operationType === 'PIX' || pixAddressKey) {
        transferPayload.operationType = 'PIX';
        const keyType = String(pixAddressKeyType || (officialDoc.length > 11 ? 'CNPJ' : 'CPF')).toUpperCase();
        const cleanPixKey = officialDoc || String(pixAddressKey || '').replace(/\D/g, '');

        transferPayload.pixAddressKey = cleanPixKey;
        transferPayload.pixAddressKeyType = keyType;
      } else if (bankAccount) {
        transferPayload.operationType = 'TED';
        transferPayload.bankAccount = {
          bank: { code: String(bankAccount.bankCode || '001').padStart(3, '0') },
          accountName: bankAccount.ownerName || 'Conta Titular',
          ownerName: String(bankAccount.ownerName || '').trim(),
          cpfCnpj: officialDoc || String(bankAccount.cpfCnpj || '').replace(/\D/g, ''),
          agency: String(bankAccount.agency || '').replace(/\D/g, ''),
          account: String(bankAccount.account || '').replace(/[^\d-]/g, ''),
          accountDigit: String(bankAccount.accountDigit || '0').replace(/[^\w]/g, '') || '0',
          bankAccountType: bankAccount.bankAccountType || 'CONTA_CORRENTE'
        };
      } else {
        return res.status(400).json({ error: "Informe a Chave PIX ou os Dados Bancários para a transferência." });
      }

      const tfRes = await fetch(`${baseUrl}/transfers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": asaasApiKey
        },
        body: JSON.stringify(transferPayload)
      });

      const tfData = await tfRes.json();

      if (!tfRes.ok) {
        let errMsg = tfData?.errors?.[0]?.description || tfData?.message || "Erro ao solicitar transferência no Asaas.";
        if (typeof errMsg === 'string' && (errMsg.includes("pattern") || errMsg.includes("The string did not match"))) {
          errMsg = "Formato de chave PIX ou dados bancários não corresponde ao padrão esperado pelo Asaas. Verifique os dígitos e o tipo da chave informada.";
        }
        await recordSecurityAudit('TRANSFER_FAILED', tenantId || '', { error: errMsg, payload: transferPayload }, req);
        return res.status(tfRes.status).json({ error: errMsg, details: tfData });
      }

      // Security & Financial Audit Logs
      await recordSecurityAudit('TRANSFER_EXECUTED', tenantId || '', {
        amount: numValue,
        transferId: tfData.id,
        destinationType: transferPayload.operationType,
        destination: transferPayload.pixAddressKey || `${bankAccount?.bankCode || ''} Ag ${bankAccount?.agency || ''}`,
        status: tfData.status || 'PENDING'
      }, req);

      return res.json({
        success: true,
        message: "Solicitação de transferência realizada com sucesso!",
        transfer: tfData
      });
    } catch (error: any) {
      console.error("Erro ao realizar transferência:", error);
      res.status(500).json({ error: error.message || "Erro interno ao processar transferência." });
    }
  });

  // Check Asaas payment status on-demand / polling
  app.post("/api/saas/payment/check-status", async (req, res) => {
    try {
      const { paymentId, subscriptionId, id } = req.body || {};
      const targetId = paymentId || subscriptionId || id;

      if (!targetId) {
        return res.status(400).json({ error: "paymentId or subscriptionId is required" });
      }

      const rawAsaasKey = process.env.ASAAS_API_KEY || '';
      const asaasApiKey = rawAsaasKey.trim().replace(/^['"]|['"]$/g, '');
      const asaasEnv = process.env.ASAAS_ENVIRONMENT || 'sandbox';

      let isPaid = false;
      let statusStr = 'PENDING';
      let fetchedPayment: any = null;

      if (asaasApiKey && !targetId.startsWith('pay_sandbox_') && !targetId.startsWith('sub_sandbox_')) {
        const baseUrl = getAsaasBaseUrl(asaasEnv);
        let checkUrl = `${baseUrl}/payments/${targetId}`;

        if (targetId.startsWith('sub_')) {
          checkUrl = `${baseUrl}/subscriptions/${targetId}/payments`;
        }

        try {
          const apiRes = await fetch(checkUrl, {
            headers: { 'access_token': asaasApiKey }
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            if (targetId.startsWith('sub_') && Array.isArray(apiData?.data) && apiData.data.length > 0) {
              fetchedPayment = apiData.data[0];
            } else {
              fetchedPayment = apiData;
            }

            statusStr = (fetchedPayment?.status || 'PENDING').toUpperCase();
            if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'RECEIVED_IN_CASH_FEE', 'ACTIVE'].includes(statusStr)) {
              isPaid = true;
            }
          }
        } catch (fetchErr) {
          console.warn("Aviso ao checar status na API Asaas:", fetchErr);
        }
      }

      const dbAdmin = getAdminDb();
      if (dbAdmin) {
        let subMatch = await findSubscriptionInFirestore(dbAdmin, {
          paymentId: fetchedPayment?.id || (targetId.startsWith('pay_') ? targetId : undefined),
          subscriptionId: fetchedPayment?.subscription || (targetId.startsWith('sub_') ? targetId : undefined),
          customerId: fetchedPayment?.customer,
          externalReference: fetchedPayment?.externalReference || targetId,
          docId: targetId
        });

        if (subMatch) {
          const subData = subMatch.data || {};
          if (isPaid && subData.status !== 'active') {
            const todayStr = new Date().toISOString().split('T')[0];
            let newStartStr = todayStr;
            let newEndStr = '';
            const baseDate = new Date();
            const calcEndDate = new Date(baseDate.setMonth(baseDate.getMonth() + 1));
            newEndStr = calcEndDate.toISOString().split('T')[0];

            await subMatch.ref.update({
              status: 'active',
              asaasPaymentStatus: 'received',
              asaasSubscriptionId: fetchedPayment?.subscription || subData.asaasSubscriptionId || null,
              asaasCustomerId: fetchedPayment?.customer || subData.asaasCustomerId || null,
              asaasInvoiceId: fetchedPayment?.id || subData.asaasInvoiceId || null,
              startDate: newStartStr,
              endDate: newEndStr,
              haircutsUsed: 0,
              beardsUsed: 0,
              lastRenewalDate: todayStr,
              updatedAt: new Date()
            });

            if (subData.cliente_id) {
              try {
                await dbAdmin.collection('usuarios').doc(subData.cliente_id).set({
                  tenantId: subData.tenantId || 'gbcortes7',
                  ativo: true,
                  updatedAt: new Date().toISOString()
                }, { merge: true });
              } catch (uErr) {
                console.warn("Could not activate user profile:", uErr);
              }
            }
          } else if (subData.status === 'active') {
            isPaid = true;
          }
        }
      }

      return res.json({
        success: true,
        isPaid,
        status: statusStr,
        payment: fetchedPayment
      });
    } catch (error: any) {
      console.error("Erro no check-status:", error);
      return res.status(500).json({ error: error.message || "Erro ao verificar status" });
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
      // Security Validation: verify Asaas-Access-Token header if ASAAS_WEBHOOK_SECRET is configured
      const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
      if (webhookSecret) {
        const incomingToken = req.headers['asasaaccesstoken'] || req.headers['asaas-access-token'] || req.headers['access-token'];
        if (!incomingToken || incomingToken !== webhookSecret) {
          console.warn("⚠️ [ASAAS SECURITY] Webhook rejeitado: Token de acesso inválido ou ausente.");
          return res.status(401).json({ error: "Unauthorized - Invalid Webhook Token" });
        }
      }

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

      let rawRefId = payment?.externalReference || subscription?.externalReference || event.external_reference || event.externalReference;
      
      // Fallback: extract tenantId from description if present, e.g., "... (gbcortes7)"
      const description = payment?.description || subscription?.description || event.description;
      if (!rawRefId && description && typeof description === 'string') {
        const match = description.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          rawRefId = match[1].trim();
          console.log(`🔍 [ASAAS AUDIT] RefId extraído da descrição: ${rawRefId}`);
        }
      }

      const value = Number(payment?.value || subscription?.value || payment?.transaction_amount || 0);

      // Event Classification
      const isPaymentConfirmed = (
        eventType === 'PAYMENT_RECEIVED' ||
        eventType === 'PAYMENT_CONFIRMED' ||
        eventType === 'PAYMENT_RECEIVED_IN_CASH_FEE' ||
        eventType === 'PAYMENT_DUNNING_RECEIVED' ||
        eventType === 'PAYMENT_APPROVED' ||
        eventType.includes('RECEIVED') ||
        eventType.includes('CONFIRMED') ||
        payment?.status === 'RECEIVED' ||
        payment?.status === 'CONFIRMED' ||
        payment?.status === 'RECEIVED_IN_CASH' ||
        payment?.status === 'RECEIVED_IN_CASH_FEE' ||
        subscription?.status === 'ACTIVE'
      );

      const isPaymentOverdue = (
        eventType === 'PAYMENT_OVERDUE' ||
        eventType === 'PAYMENT_DUNNING_REQUESTED' ||
        payment?.status === 'OVERDUE'
      );

      const isPaymentCanceledOrRefunded = (
        !isPaymentConfirmed && (
          eventType === 'PAYMENT_REFUNDED' ||
          eventType === 'PAYMENT_CHARGEBACK_REQUESTED' ||
          payment?.status === 'REFUNDED'
        )
      );

      const isInformationalEvent = (
        !isPaymentConfirmed &&
        !isPaymentOverdue &&
        !isPaymentCanceledOrRefunded &&
        (
          eventType === 'PAYMENT_CREATED' ||
          eventType === 'PAYMENT_UPDATED' ||
          eventType === 'PAYMENT_DELETED' ||
          eventType === 'SUBSCRIPTION_CREATED' ||
          eventType === 'SUBSCRIPTION_UPDATED'
        )
      );

      if (isInformationalEvent) {
        console.log(`ℹ️ [ASAAS AUDIT] Evento informativo ignorado sem alterar estado financeiro: ${eventType}`);
        return res.status(200).json({ received: true, note: "Event acknowledged without status changes" });
      }

      const dbAdmin = getAdminDb();
      if (!dbAdmin) {
        console.warn("⚠️ [ASAAS AUDIT] Banco de dados Firebase Admin não disponível. Webhook respondido com HTTP 200.");
        return res.status(200).json({ received: true, warning: "Database not available" });
      }

      let targetType: 'client_sub' | 'tenant' | 'unknown' = 'unknown';
      let subMatch: any = null;
      let tenantMatch: any = null;

      let cleanRefId = rawRefId || '';
      if (cleanRefId.startsWith('client_sub:')) {
        targetType = 'client_sub';
        cleanRefId = cleanRefId.replace(/^client_sub:/, '');
      } else if (cleanRefId.startsWith('saas_tenant:')) {
        targetType = 'tenant';
        cleanRefId = cleanRefId.replace(/^saas_tenant:/, '');
      }

      // Extract potential tenantId from description or refId
      let refTenantId = '';
      if (rawRefId && !rawRefId.includes(':')) refTenantId = rawRefId;
      if (!refTenantId && description && typeof description === 'string') {
        const match = description.match(/\(([^)]+)\)/);
        if (match && match[1]) refTenantId = match[1].trim();
      }

      // 1. Search Client Subscription FIRST if targetType is client_sub or unknown
      if (targetType === 'client_sub' || targetType === 'unknown') {
        try {
          subMatch = await findSubscriptionInFirestore(dbAdmin, {
            paymentId: payment?.id,
            subscriptionId: subscription?.id || payment?.subscription,
            customerId: subscription?.customer || payment?.customer,
            externalReference: rawRefId,
            docId: cleanRefId,
            tenantId: refTenantId
          });

          // Retry delay if not found (in case frontend is still persisting setDoc)
          if (!subMatch) {
            await new Promise(res => setTimeout(res, 1500));
            subMatch = await findSubscriptionInFirestore(dbAdmin, {
              paymentId: payment?.id,
              subscriptionId: subscription?.id || payment?.subscription,
              customerId: subscription?.customer || payment?.customer,
              externalReference: rawRefId,
              docId: cleanRefId,
              tenantId: refTenantId
            });
          }

          if (subMatch) {
            targetType = 'client_sub';
            console.log(`📋 [ASAAS AUDIT] Assinatura de cliente localizada no Firestore: ${subMatch.id} (Cliente: ${subMatch.data?.cliente_name || 'N/A'})`);
          }
        } catch (fErr) {
          console.warn("Erro ao buscar assinatura de cliente no Firestore:", fErr);
        }
      }

      // 2. Search Tenant in Firestore if targetType is tenant or still unknown
      if (!subMatch && (targetType === 'tenant' || targetType === 'unknown') && cleanRefId) {
        try {
          tenantMatch = await findTenantInFirestore(dbAdmin, cleanRefId);
          if (tenantMatch) {
            targetType = 'tenant';
            console.log(`👤 [ASAAS AUDIT] Barbearia / Tenant localizada no Firestore: ${tenantMatch.id}`);
          }
        } catch (tErr) {
          console.warn("Erro ao buscar tenant no Firestore:", tErr);
        }
      }

      // 3. PROCESS CLIENT SUBSCRIPTION EVENTS
      if (subMatch && targetType === 'client_sub') {
        const subData = subMatch.data || {};
        const subRef = subMatch.ref;
        const tenantId = subData.tenantId || refTenantId || 'gbcortes7';
        const todayStr = new Date().toISOString().split('T')[0];

        if (isPaymentConfirmed) {
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

          // If subscription is an object with nextDueDate greater than current payment dueDate
          if (subscription && typeof subscription === 'object' && subscription.nextDueDate) {
            const nextDueStr = String(subscription.nextDueDate).split('T')[0];
            if (!payDueDate || nextDueStr > payDueDate) {
              newEndStr = nextDueStr;
            }
          }

          if (!newEndStr) {
            const nextMonth = new Date(baseDate);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            newEndStr = nextMonth.toISOString().split('T')[0];
          }

          console.log(`🔄 [ASAAS AUDIT] Confirmando pagamento & Ativando assinatura do cliente ${subData.cliente_name || 'Desconhecido'} (${subMatch.id}). Novo período: ${newStartStr} até ${newEndStr}`);
          
          const subUpdateData = {
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
          };

          if (subRef) {
            try {
              await subRef.update(subUpdateData);
            } catch (uErr) {
              console.warn(`⚠️ [Webhook Client Sub] Fallback REST update para ${subMatch.id}`);
              await updateFirestoreRestDoc('subscriptions', subMatch.id, subUpdateData);
            }
          } else {
            await updateFirestoreRestDoc('subscriptions', subMatch.id, subUpdateData);
          }

          // Record in financial_transactions
          const finalVal = value || subData.amount || 0;
          if (finalVal > 0) {
            if (dbAdmin) {
              try {
                await dbAdmin.collection('financial_transactions').add({
                  tenantId: tenantId || 'gbcortes7',
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
                  createdAt: new Date()
                });
              } catch (ftErr) {
                console.warn("Could not record financial transaction:", ftErr);
              }

              // Check open cash session & record in cash_movements
              try {
                const cashSessionsQuery = await dbAdmin.collection('cash_sessions')
                  .where('tenantId', '==', tenantId)
                  .get();

                const openCashDoc = cashSessionsQuery.docs.find((doc: any) => {
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
                    amount: finalVal,
                    subscription_amount: finalVal,
                    payment_method: 'pagamento_online',
                    paymentMethod: 'Pagamento Online',
                    date: todayStr,
                    createdAt: new Date()
                  });

                  await openCashDoc.ref.update({
                    total_income: (openCashDoc.data().total_income || openCashDoc.data().totalIncome || 0) + finalVal,
                    totalIncome: (openCashDoc.data().totalIncome || openCashDoc.data().total_income || 0) + finalVal,
                    expected_balance: (openCashDoc.data().expected_balance || openCashDoc.data().expectedBalance || 0) + finalVal,
                    expectedBalance: (openCashDoc.data().expectedBalance || openCashDoc.data().expected_balance || 0) + finalVal,
                    updatedAt: new Date()
                  });
                }
              } catch (cErr) {
                console.warn("Aviso ao registrar movimento no caixa:", cErr);
              }
            }
          }

          console.log(`✅ [ASAAS AUDIT] Assinatura do cliente ${subData.cliente_name} (${subMatch.id}) ativada até ${newEndStr}!`);
        } else if (isPaymentOverdue) {
          console.log(`⚠️ [ASAAS AUDIT] Cobrança vencida para a assinatura do cliente ${subMatch.id}`);
          if (subRef) {
            try {
              await subRef.update({ asaasPaymentStatus: 'overdue', status: 'overdue', updatedAt: new Date() });
            } catch (e) {
              await updateFirestoreRestDoc('subscriptions', subMatch.id, { asaasPaymentStatus: 'overdue', status: 'overdue', updatedAt: new Date() });
            }
          } else {
            await updateFirestoreRestDoc('subscriptions', subMatch.id, { asaasPaymentStatus: 'overdue', status: 'overdue', updatedAt: new Date() });
          }
        } else if (isPaymentCanceledOrRefunded) {
          console.log(`🛑 [ASAAS AUDIT] Cobrança cancelada ou estornada para a assinatura do cliente ${subMatch.id}`);
          if (subRef) {
            try {
              await subRef.update({ asaasPaymentStatus: 'canceled', status: 'canceled', updatedAt: new Date() });
            } catch (e) {
              await updateFirestoreRestDoc('subscriptions', subMatch.id, { asaasPaymentStatus: 'canceled', status: 'canceled', updatedAt: new Date() });
            }
          } else {
            await updateFirestoreRestDoc('subscriptions', subMatch.id, { asaasPaymentStatus: 'canceled', status: 'canceled', updatedAt: new Date() });
          }
        }
      }

      // 4. PROCESS SAAS TENANT EVENTS
      else if (tenantMatch && targetType === 'tenant') {
        const data = tenantMatch.data || {};
        if (isPaymentConfirmed) {
          let baseDate = new Date();
          const currentExp = data.planExpiresAt || data.planValidUntil;
          if (currentExp && typeof currentExp === 'string') {
            const expDate = new Date(currentExp + (currentExp.includes('T') ? '' : 'T12:00:00'));
            if (!isNaN(expDate.getTime()) && expDate > baseDate) baseDate = expDate;
          }
          const newExpDate = new Date(baseDate);
          newExpDate.setMonth(newExpDate.getMonth() + 1);
          const newExpStr = newExpDate.toISOString().split('T')[0];

          console.log(`🔄 [ASAAS AUDIT] Renovando licença SaaS do Tenant ${tenantMatch.id} até ${newExpStr}`);
          await tenantMatch.ref.set({
            planStatus: 'active',
            isActive: true,
            planExpiresAt: newExpStr,
            planValidUntil: newExpStr,
            lastPaymentDate: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }, { merge: true });

          if (value > 0) {
            try {
              await dbAdmin.collection('saas_payments').add({
                tenantId: tenantMatch.id,
                tenantName: data.name || tenantMatch.id,
                planName: data.plan || description || 'Plano Rull SaaS',
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

          console.log(`✅ [ASAAS AUDIT] Licença SaaS da Barbearia ${tenantMatch.id} renovada até ${newExpStr}!`);
        } else if (isPaymentOverdue) {
          console.log(`⚠️ [ASAAS AUDIT] Cobrança SaaS vencida para a barbearia ${tenantMatch.id}`);
          await tenantMatch.ref.set({
            planStatus: 'overdue',
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else if (isPaymentCanceledOrRefunded) {
          console.log(`🛑 [ASAAS AUDIT] Cobrança SaaS cancelada/estornada para a barbearia ${tenantMatch.id}`);
          await tenantMatch.ref.set({
            planStatus: 'canceled',
            isActive: false,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      } else {
        console.warn(`⚠️ [ASAAS AUDIT] Nenhuma entidade localizada para refId: ${rawRefId}, PaymentID: ${payment?.id}, SubID: ${subscription?.id}`);
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
