const DEFAULT_VAPID_PUBLIC_KEY = "BIO6H156g5q-5E-Vaa5ZdAvpK1Gob-Kfduw3Xcp02LHSePKMVQdoJ5ILjVbR52xvawdu2xDBsgh_bxekAFzz-E0";

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
  return res.status(200).json({ publicKey });
}
