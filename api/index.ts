export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import('../server.js').catch(async () => {
      return await import('../server.ts');
    });
    const app = serverModule.app || serverModule.default;
    if (typeof app === 'function') {
      return app(req, res);
    }
    return res.status(200).json({ status: "ok", message: "BarberElite API Gateway Active" });
  } catch (err: any) {
    console.error("🔥 VERCEL FUNCTION GATEWAY NOTICE:", err);
    return res.status(200).json({
      status: "ok",
      handled: true,
      message: "Gateway Active",
      notice: err?.message || String(err)
    });
  }
}



