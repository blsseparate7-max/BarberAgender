import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import admin from "firebase-admin";

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
          credential: (admin as any).credential.applicationDefault(),
          projectId: "gbagender"
        });
      } else {
        adminApp = apps[0];
      }
    } catch (err) {
      console.error("Error initializing Firebase Admin SDK with applicationDefault:", err);
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
