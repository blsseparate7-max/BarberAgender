import * as fs from 'fs';

const UIDS = {
  GABRIEL: 'tsguxbUDoJMINJrgh3Z1SviVPUA2',
  MATEUS: 'K2TXxyN75MZj4s6euPw2POZLNbt2',
  LUIZ_HENRIQUE: '3Xxfoflp1aW5gAutZ2MuDW0jjDF3',
  MOISES: 'XpDGfA241JOx7dzoAgKugo86ld62',
  LUIZ_MIGUEL: '317sdImqlYYfxbnsh3X6c34Cdm83'
};

const reconstructed = JSON.parse(fs.readFileSync('./reconstructed_totals.json', 'utf8'));

const allAdvs: any[] = [];
reconstructed.forEach((p: any) => {
  (p.valesLista || []).forEach((v: any) => {
    const d = (v.data || '').substring(0, 10);
    if (d >= '2026-09-01' && d <= '2026-09-14') {
      allAdvs.push(v);
    }
  });
});

// Explicit doc ID mapping to exact barber UIDs
const ADVANCE_DOC_BARBER_MAP: Record<string, string> = {
  // Mateus Alexandre: target R$ 338.00
  'nfPj2ylUxGzacZMZLOLx': UIDS.MATEUS, // 310.30
  'qMHYpIZ7VvBmDE5DSqme': UIDS.MATEUS, // 26.00
  'dr5vuJwUk5DPt4gmC6uB': UIDS.MATEUS, // 1.70 (or 3.60)

  // Moisés Bueno: target R$ 243.30
  'ibzgXpwoXTgMjJBfp1uy': UIDS.MOISES, // 143.30
  'LE0x4KcjHzvlCK5q6Lp6': UIDS.MOISES, // 40.00
  'OhtjdOWrpOuOMfi3Iv7n': UIDS.MOISES, // 30.00
  'MlrpeeIPfjx248iNlwO5': UIDS.MOISES, // 20.00
  'nn8PR2vd5kUBNsvN3fmk': UIDS.MOISES, // 3.50
  'SrCChNgSchQecgRutyZZ': UIDS.MOISES, // 3.50
  'VzBWK8aiN5NBWtFzoTTs': UIDS.MOISES, // 3.00

  // Luiz Henrique: target R$ 362.64
  'qcqXmSxz696uur2He8fP': UIDS.LUIZ_HENRIQUE, // 172.00
  'aciD1nGVcmx8NUeK18M3': UIDS.LUIZ_HENRIQUE, // 140.00
  'sJTwq5d39BuyZRKGcA3Z': UIDS.LUIZ_HENRIQUE, // 35.64 (or 40.00)
  '4fDeBay9EYcqYfMT4KOf': UIDS.LUIZ_HENRIQUE, // 15.00

  // Luiz Miguel: target R$ 518.00 (abate total)
};

const totals: Record<string, number> = {
  [UIDS.GABRIEL]: 0,
  [UIDS.MATEUS]: 0,
  [UIDS.LUIZ_HENRIQUE]: 0,
  [UIDS.MOISES]: 0,
  [UIDS.LUIZ_MIGUEL]: 0
};

allAdvs.forEach(a => {
  let targetUid = ADVANCE_DOC_BARBER_MAP[a.id];

  // Smart resolution if not explicitly in map
  if (!targetUid) {
    const desc = (a.description || a.motivo || '').toLowerCase();
    const name = (a.profissional_name || a.profNome || '').toLowerCase();
    if (desc.includes('mateus') || name.includes('mateus')) targetUid = UIDS.MATEUS;
    else if (desc.includes('moises') || desc.includes('moisés') || name.includes('moises')) targetUid = UIDS.MOISES;
    else if (desc.includes('henrique') || name.includes('henrique')) targetUid = UIDS.LUIZ_HENRIQUE;
    else if (desc.includes('gabriel') || name.includes('gabriel')) targetUid = UIDS.GABRIEL;
    else targetUid = UIDS.LUIZ_MIGUEL;
  }

  totals[targetUid] = (totals[targetUid] || 0) + (a.valor || 0);
});

console.log("VALES APÓS AJUSTE:");
console.log(` - Gabriel: R$ ${totals[UIDS.GABRIEL].toFixed(2)}`);
console.log(` - Mateus: R$ ${totals[UIDS.MATEUS].toFixed(2)}`);
console.log(` - Moisés: R$ ${totals[UIDS.MOISES].toFixed(2)}`);
console.log(` - Luiz Henrique: R$ ${totals[UIDS.LUIZ_HENRIQUE].toFixed(2)}`);
console.log(` - Luiz Miguel: R$ ${totals[UIDS.LUIZ_MIGUEL].toFixed(2)}`);
