import { db } from '../src/firebase';
import { collection, getDocs } from 'firebase/firestore';

async function auditLiveRick() {
  console.log("=== LENDO DADOS AO VIVO DO FIRESTORE PARA RICK / LUIZ HENRIQUE ===");

  const rickUid = '3Xxfoflp1aW5gAutZ2MuDW0jjDF3'; // Rick bolado email rickbolado@gbcortes7.com

  // 1. Fetch all comandas
  const comandasSnap = await getDocs(collection(db, 'comandas'));
  console.log(`\nTotal de Comandas no Firestore: ${comandasSnap.size}`);

  let totalComissaoRickComandas = 0;
  let totalFaturamentoRickComandas = 0;
  let countComandas = 0;

  comandasSnap.docs.forEach((d) => {
    const data = d.data();
    const cDate = (data.created_at || data.createdAt || data.date || data.data || '').toString();
    const dateOnly = (data.data_comanda || data.data || data.date || cDate).substring(0, 10);

    // Filter Sept 1 to Sept 14
    if (dateOnly >= '2026-09-01' && dateOnly <= '2026-09-14') {
      const barberId = data.barber_id || data.profissional_id || data.barbeiro_id || '';
      const barberName = (data.barber_name || data.profissional_name || data.barbeiro_nome || '').toLowerCase();
      const clientName = data.cliente_nome || data.cliente_name || data.client_name || '';

      const items = data.items || data.itens || [];
      let comandaHasRick = false;

      // Check main barber or items
      if (barberId === rickUid || barberName.includes('rick') || barberName.includes('luiz henrique')) {
        comandaHasRick = true;
      }

      // Check each item inside comanda
      items.forEach((item: any) => {
        const itemProfId = item.profissional_id || item.barber_id || barberId;
        const itemProfName = (item.profissional_name || item.barber_name || barberName).toLowerCase();
        if (itemProfId === rickUid || itemProfName.includes('rick') || itemProfName.includes('luiz henrique')) {
          comandaHasRick = true;
        }
      });

      if (comandaHasRick) {
        countComandas++;
        const total = data.total || data.valor_total || data.total_amount || 0;
        const commRate = data.commission_rate || 50;
        const commVal = data.valor_comissao || data.commission_value || (total * commRate / 100);

        totalFaturamentoRickComandas += total;
        totalComissaoRickComandas += commVal;

        console.log(`Comanda #${data.numero || data.code || d.id} | Data: ${dateOnly} | Cliente: ${clientName} | Total: R$ ${total} | Comiss: R$ ${commVal} | Status: ${data.status}`);
      }
    }
  });

  console.log(`\n--> Total Comandas do Rick em Setembro (01-14): ${countComandas}`);
  console.log(`--> Faturamento Total Comandas: R$ ${totalFaturamentoRickComandas.toFixed(2)}`);
  console.log(`--> Comissão Total Comandas: R$ ${totalComissaoRickComandas.toFixed(2)}`);

  // 2. Fetch all appointments
  const apptsSnap = await getDocs(collection(db, 'appointments'));
  console.log(`\nTotal de Agendamentos no Firestore: ${apptsSnap.size}`);

  apptsSnap.docs.forEach((d) => {
    const data = d.data();
    const aDate = (data.data || data.date || '').toString().substring(0, 10);
    if (aDate >= '2026-09-01' && aDate <= '2026-09-14') {
      const bId = data.barber_id || data.profissional_id;
      const bName = (data.barber_name || data.profissional_name || '').toLowerCase();
      if (bId === rickUid || bName.includes('rick') || bName.includes('luiz henrique')) {
        console.log(`Agendamento #${d.id} | Data: ${aDate} | Cliente: ${data.cliente_nome || data.client_name} | Serviço: ${data.servico_nome} | Valor: R$ ${data.valor || data.price} | Status: ${data.status}`);
      }
    }
  });

  // 3. Fetch all commissions collection
  const commsSnap = await getDocs(collection(db, 'commissions'));
  console.log(`\nTotal de Documentos de Comissão no Firestore: ${commsSnap.size}`);

  let commDocTotal = 0;
  commsSnap.docs.forEach((d) => {
    const data = d.data();
    const dateOnly = (data.date || data.data || '').toString().substring(0, 10);
    if (dateOnly >= '2026-09-01' && dateOnly <= '2026-09-14') {
      const pId = data.profissional_id;
      const pName = (data.profissional_name || '').toLowerCase();
      if (pId === rickUid || pName.includes('rick') || pName.includes('luiz henrique')) {
        commDocTotal += (data.commission_value || data.amount || 0);
        console.log(`Doc Comissão #${d.id} | Data: ${dateOnly} | Base: R$ ${data.base_value} | Comissão: R$ ${data.commission_value} | Status: ${data.status} | Cliente: ${data.client_name}`);
      }
    }
  });
  console.log(`--> Total acumulado na coleção commissions: R$ ${commDocTotal.toFixed(2)}`);

  process.exit(0);
}

auditLiveRick();
