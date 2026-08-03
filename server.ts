import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, App, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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
      const { tenantId, tenantName, ownerEmail, ownerCpfCnpj, planName, amount, billingType } = req.body;

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

        // a) Create or Find Customer in Asaas
        const custRes = await fetch(`${baseUrl}/customers?email=${encodeURIComponent(ownerEmail || '')}`, {
          headers: { 'access_token': asaasApiKey }
        });
        const custData = await custRes.json();
        
        let customerId = custData?.data?.[0]?.id;
        if (!customerId) {
          const createCustRes = await fetch(`${baseUrl}/customers`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access_token': asaasApiKey
            },
            body: JSON.stringify({
              name: tenantName || tenantId,
              email: ownerEmail || `financeiro@${tenantId}.com`,
              cpfCnpj: ownerCpfCnpj || undefined,
              externalReference: tenantId
            })
          });
          const newCust = await createCustRes.json();
          customerId = newCust.id;
        }

        // b) Create Payment Charge in Asaas
        const today = new Date();
        today.setDate(today.getDate() + 3); // 3 days due date
        const dueDateStr = today.toISOString().split('T')[0];

        const payRes = await fetch(`${baseUrl}/payments`, {
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
            description: `Assinatura BarberElite SaaS - Plano ${planName || 'Mensal'} (${tenantId})`,
            externalReference: tenantId
          })
        });

        const payData = await payRes.json();

        if (payData.errors) {
          throw new Error(payData.errors[0]?.description || "Erro no gateway Asaas");
        }

        // c) If PIX, fetch Pix QR Code
        let pixCopiaECola = payData.invoiceUrl;
        let pixQrCodeUrl = '';

        if (payData.id && (billingType === 'PIX' || !billingType)) {
          const pixRes = await fetch(`${baseUrl}/payments/${payData.id}/pixQrCode`, {
            headers: { 'access_token': asaasApiKey }
          });
          const pixData = await pixRes.json();
          if (pixData.payload) pixCopiaECola = pixData.payload;
          if (pixData.encodedImage) pixQrCodeUrl = `data:image/png;base64,${pixData.encodedImage}`;
        }

        return res.json({
          success: true,
          chargeId: payData.id,
          paymentUrl: payData.bankSlipUrl || payData.invoiceUrl,
          pixCopiaECola: pixCopiaECola || payData.invoiceUrl,
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
            description: `Assinatura BarberElite - ${planName || 'SaaS'}`,
            payment_method_id: 'pix',
            payer: { email: ownerEmail || 'cliente@barberelite.com' },
            external_reference: tenantId
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
      const mockPixPayload = `00020126580014BR.GOV.BCB.PIX0136barberelite.saas.pix@gateway.com.br520400005303986540${cleanAmount.length}${cleanAmount}5802BR5915BarberElite SaaS6008LONDRINA62070503***6304`;
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

  // Webhook Receiver for Asaas / Mercado Pago / Stripe
  app.post("/api/saas/payment/webhook", async (req, res) => {
    try {
      const event = req.body;
      console.log("Recebido Webhook de Pagamento SaaS:", JSON.stringify(event));

      // Handle Asaas event
      if (event?.event === 'PAYMENT_RECEIVED' || event?.event === 'PAYMENT_CONFIRMED') {
        const tenantId = event.payment?.externalReference;
        if (tenantId) {
          console.log(`[Webhook] Ativando plano SaaS para o tenant: ${tenantId}`);
          // Note: Frontend and Server sync tenant doc upon status poll
        }
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("Erro ao processar Webhook SaaS:", error);
      res.status(500).json({ error: error.message });
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
