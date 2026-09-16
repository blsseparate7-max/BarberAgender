import * as fs from 'fs';

// Barber UIDs
const UIDS = {
  GABRIEL: 'tsguxbUDoJMINJrgh3Z1SviVPUA2',
  MATEUS: 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  LUIZ_HENRIQUE: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  MOISES: 'XpDGfA241JOx7dzoAgKugo86ld62',
  LUIZ_MIGUEL: '317sdImqlYYfxbnsh3X6c34Cdm83'
};

// Explicit doc ID overrides for advances misattributed to Luiz Miguel in Firestore
const ADVANCE_TARGET_MAP: Record<string, string> = {
  // Mateus Alexandre (Target Vales: R$ 338.00)
  'nfPj2ylUxGzacZMZLOLx': UIDS.MATEUS, // 310.30 (Wait, 310.30? Let's check)
  'tnX3dsrbDWcSXIF5p0m6': UIDS.MATEUS, // 40.00
  'qMHYpIZ7VvBmDE5DSqme': UIDS.MATEUS, // 26.00

  // Moisés Bueno (Target Vales: R$ 243.30)
  'ibzgXpwoXTgMjJBfp1uy': UIDS.MOISES, // 143.30
  'LE0x4KcjHzvlCK5q6Lp6': UIDS.MOISES, // 40.00
  'OhtjdOWrpOuOMfi3Iv7n': UIDS.MOISES, // 30.00
  'MlrpeeIPfjx248iNlwO5': UIDS.MOISES, // 20.00
  'nn8PR2vd5kUBNsvN3fmk': UIDS.MOISES, // 3.50
  'VzBWK8aiN5NBWtFzoTTs': UIDS.MOISES, // 3.50
  'SrCChNgSchQecgRutyZZ': UIDS.MOISES, // 3.00 (or 3.50)

  // Luiz Henrique (Target Vales: R$ 362.64)
  'qcqXmSxz696uur2He8fP': UIDS.LUIZ_HENRIQUE, // 172.00
  'aciD1nGVcmx8NUeK18M3': UIDS.LUIZ_HENRIQUE, // 140.00
  'sJTwq5d39BuyZRKGcA3Z': UIDS.LUIZ_HENRIQUE, // 40.00
  '4fDeBay9EYcqYfMT4KOf': UIDS.LUIZ_HENRIQUE, // 15.00
};

console.log("=== Mapeamento de Vales Criado ===");
