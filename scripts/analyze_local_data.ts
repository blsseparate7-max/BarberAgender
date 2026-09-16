import * as fs from 'fs';

async function analyzeLocalData() {
  if (!fs.existsSync('./audit_raw_data.json')) {
    console.log("File audit_raw_data.json not found!");
    return;
  }

  const raw = JSON.parse(fs.readFileSync('./audit_raw_data.json', 'utf-8'));
  console.log("=== ANÁLISE DETALHADA DOS DADOS BRUTOS ARMAZENADOS ===\n");

  const usuarios = raw.usuarios || [];
  const comms = raw.commissions || [];
  const advs = raw.professional_advances || [];
  const payables = raw.accounts_payable || [];
  const cashMovs = raw.cash_movements || [];
  const comandas = raw.comandas || [];

  const barbers = usuarios.filter((u: any) => ['barbeiro', 'gerente', 'admin'].includes(u.tipo));

  console.log(`Barbeiros encontrados no BD (${barbers.length}):`);
  barbers.forEach((b: any) => console.log(`  - ${b.nome} | UID: ${b.uid || b.id} | Tipo: ${b.tipo} | Ativo: ${b.ativo}`));
  console.log("");

  barbers.forEach((barber: any) => {
    const bUid = barber.uid || barber.id;
    const bName = (barber.nome || '').toLowerCase().trim();
    const bFirstName = bName.split(' ')[0] || '';

    console.log(`================================================================`);
    console.log(`BARBEIRO: ${barber.nome} (UID: ${bUid})`);
    console.log(`================================================================`);

    // Comissões
    const bComms = comms.filter((c: any) => {
      if (c.status === 'cancelado' || c.status === 'estornado') return false;
      if (c.profissional_id === bUid || c.barbeiro_id === bUid) return true;
      const cName = (c.profissional_name || c.barbeiro_nome || '').toLowerCase();
      if (cName && bName && (cName.includes(bName) || bName.includes(cName))) return true;
      return false;
    });

    const bCommsPeriod = bComms.filter((c: any) => {
      const d = (c.date || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    let comsByStatus: Record<string, { count: number; commission: number; base: number }> = {};
    bCommsPeriod.forEach((c: any) => {
      const st = c.status || 'sem_status';
      if (!comsByStatus[st]) comsByStatus[st] = { count: 0, commission: 0, base: 0 };
      comsByStatus[st].count += 1;
      comsByStatus[st].commission += Number(c.commission_value) || 0;
      comsByStatus[st].base += Number(c.base_value) || Number(c.amount) || 0;
    });

    console.log(`\n1. COMISSÕES (01/09 a 14/09) - Total de docs: ${bCommsPeriod.length}:`);
    for (const [st, val] of Object.entries(comsByStatus)) {
      console.log(`   * Status [${st}]: ${val.count} itens | Base Bruta: R$ ${val.base.toFixed(2)} | Comissão: R$ ${val.commission.toFixed(2)}`);
    }

    // Professional Advances
    const bAdvs = advs.filter((a: any) => {
      if (a.profissional_id === bUid || a.barber_id === bUid) return true;
      const pName = (a.profissional_name || '').toLowerCase();
      const desc = (a.description || '').toLowerCase();
      if (pName && (pName.includes(bName) || bName.includes(pName))) return true;
      if (!a.profissional_id && desc.includes(bFirstName)) return true;
      return false;
    });

    const bAdvsPeriod = bAdvs.filter((a: any) => {
      const d = (a.date || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    console.log(`\n2. VALES em 'professional_advances' (01/09 a 14/09) - Total: ${bAdvsPeriod.length}:`);
    let advsTotal = 0;
    bAdvsPeriod.forEach((a: any) => {
      advsTotal += Number(a.amount) || 0;
      console.log(`   - DocID: ${a.id} | Data: ${a.date} | Valor: R$ ${a.amount} | Status: ${a.status} | ProfID: ${a.profissional_id} | ProfNome: ${a.profissional_name} | Desc: "${a.description}"`);
    });
    console.log(`   -> Soma Vales 'professional_advances': R$ ${advsTotal.toFixed(2)}`);

    // Accounts Payable (vales)
    const bPayables = payables.filter((p: any) => {
      if (p.status === 'cancelado' || p.is_deleted === true) return false;
      const cat = (p.category || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const sup = (p.supplier || '').toLowerCase();
      const isRepasse = cat.includes('repasse') || desc.includes('repasse') || desc.includes('pagamento de comiss');
      const isVale = (p.type === 'vale' || cat.includes('adiantamento') || cat.includes('vale') || desc.includes('adiantamento') || desc.includes('vale')) && !isRepasse;
      if (!isVale) return false;

      if (p.profissional_id === bUid || p.barber_id === bUid) return true;
      if (sup.includes(bName) || desc.includes(bName) || desc.includes(bFirstName)) return true;
      return false;
    });

    const bPayablesPeriod = bPayables.filter((p: any) => {
      const d = p.paidAt ? p.paidAt.substring(0, 10) : (p.dueDate || '').substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    console.log(`\n3. VALES em 'accounts_payable' (01/09 a 14/09) - Total: ${bPayablesPeriod.length}:`);
    let payablesTotal = 0;
    bPayablesPeriod.forEach((p: any) => {
      payablesTotal += Number(p.amount) || 0;
      console.log(`   - DocID: ${p.id} | Data: ${p.paidAt || p.dueDate} | Valor: R$ ${p.amount} | Status: ${p.status} | ProfID: ${p.profissional_id} | Supplier: "${p.supplier}" | Desc: "${p.description}"`);
    });
    console.log(`   -> Soma Vales 'accounts_payable': R$ ${payablesTotal.toFixed(2)}`);

    // Cash movements (vales)
    const bCashMovs = cashMovs.filter((c: any) => {
      if (c.is_deleted === true || c.status === 'cancelado' || c.status === 'excluido') return false;
      const cat = (c.category || '').toLowerCase();
      const desc = (c.description || '').toLowerCase();
      const isRepasse = cat.includes('repasse') || desc.includes('repasse') || desc.includes('pagamento de comiss');
      const isVale = (cat.includes('vale') || cat.includes('adiantamento') || desc.includes('vale') || desc.includes('adiantamento')) && !isRepasse;
      if (!isVale) return false;

      if (c.profissional_id === bUid || c.barber_id === bUid) return true;
      const cProName = (c.profissional_name || '').toLowerCase();
      if (cProName.includes(bName) || desc.includes(bName) || desc.includes(bFirstName)) return true;
      return false;
    });

    const bCashMovsPeriod = bCashMovs.filter((c: any) => {
      const d = c.date || (c.createdAt ? new Date(c.createdAt.seconds * 1000).toISOString().substring(0, 10) : '');
      return d >= '2026-09-01' && d <= '2026-09-14';
    });

    console.log(`\n4. VALES em 'cash_movements' (01/09 a 14/09) - Total: ${bCashMovsPeriod.length}:`);
    let cashMovsTotal = 0;
    bCashMovsPeriod.forEach((c: any) => {
      cashMovsTotal += Number(c.amount) || 0;
      console.log(`   - DocID: ${c.id} | Data: ${c.date} | Valor: R$ ${c.amount} | Status: ${c.status} | ProfID: ${c.profissional_id} | Desc: "${c.description}"`);
    });
    console.log(`   -> Soma Vales 'cash_movements': R$ ${cashMovsTotal.toFixed(2)}`);

    console.log("\n");
  });
}

analyzeLocalData();
