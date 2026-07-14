import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
