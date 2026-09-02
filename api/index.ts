import { app } from '../server';

export default function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (err: any) {
    console.error("🔥 CRITICAL VERCEL FUNCTION STARTUP ERROR:", err);
    return res.status(500).json({
      error: "Vercel Serverless Function Startup Failed",
      message: err?.message || String(err),
      details: err?.stack || null
    });
  }
}



