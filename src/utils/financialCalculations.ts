import { FinancialTransaction, ClientDebt, Commission, Comanda } from '../types';

export function normalizeDate(d: any): string {
  if (!d) return '';
  if (typeof d === 'string') {
    return d.substring(0, 10);
  }
  if (d.seconds) {
    return new Date(d.seconds * 1000).toISOString().substring(0, 10);
  }
  if (d.toDate && typeof d.toDate === 'function') {
    return d.toDate().toISOString().substring(0, 10);
  }
  if (d instanceof Date) {
    return d.toISOString().substring(0, 10);
  }
  return '';
}

export function isDateInRange(dateValue: any, startDate?: string, endDate?: string): boolean {
  const dateStr = normalizeDate(dateValue);
  if (!dateStr) return false;
  if (startDate && dateStr < startDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

export interface StandardFinancialMetrics {
  totalEntradasBruto: number;
  totalEntradasLiquido: number;
  totalTaxasCartao: number;
  totalEntradasCount: number;
  
  totalSaidasPagas: number;
  totalDespesasOperacionais: number;
  totalSangriasRetiradas: number;
  totalSaidasCount: number;
  
  saldoOperacionalLiquido: number;
  saldoBruto: number;
  
  totalAReceberCartoesBruto: number;
  totalAReceberCartoesLiquido: number;
  fiadosPendentes: number;
  totalPrevisaoReceber: number;
  totalDisponivelImediato: number;
  
  byMethod: Record<string, { label: string; amount: number; net: number; count: number; color: string; icon: string }>;
  byCategory: Record<string, { label: string; total: number; count: number; color: string }>;
}

export function calculateStandardFinancialMetrics(
  transactions: FinancialTransaction[],
  pendingDebts: ClientDebt[] = []
): StandardFinancialMetrics {
  const defaultMethods: Record<string, { label: string; amount: number; net: number; count: number; color: string; icon: string }> = {
    dinheiro: { label: 'Dinheiro', amount: 0, net: 0, count: 0, color: 'emerald', icon: 'banknote' },
    pix: { label: 'PIX', amount: 0, net: 0, count: 0, color: 'teal', icon: 'qr-code' },
    debito: { label: 'Cartão de Débito', amount: 0, net: 0, count: 0, color: 'sky', icon: 'credit-card' },
    credito: { label: 'Cartão de Crédito', amount: 0, net: 0, count: 0, color: 'indigo', icon: 'credit-card' },
    online: { label: 'Pagamento Online', amount: 0, net: 0, count: 0, color: 'purple', icon: 'globe' },
  };

  const itemMap: Record<string, { label: string; total: number; count: number; color: string }> = {
    servicos: { label: 'Serviços', total: 0, count: 0, color: 'indigo' },
    produtos: { label: 'Produtos', total: 0, count: 0, color: 'sky' },
    pacotes: { label: 'Pacotes', total: 0, count: 0, color: 'amber' },
    assinaturas: { label: 'Assinaturas / Planos', total: 0, count: 0, color: 'purple' },
  };

  let totalEntradasBruto = 0;
  let totalEntradasLiquido = 0;
  let totalTaxasCartao = 0;
  let totalEntradasCount = 0;

  let totalSaidasPagas = 0;
  let totalDespesasOperacionais = 0;
  let totalSangriasRetiradas = 0;
  let totalSaidasCount = 0;

  let totalAReceberCartoesBruto = 0;
  let totalAReceberCartoesLiquido = 0;
  let totalDisponivelImediato = 0;

  transactions.forEach(t => {
    const amount = Number(t.amount) || 0;
    const netAmount = Number(t.net_amount !== undefined && t.net_amount !== null ? t.net_amount : amount);
    const statusStr = String(t.status || '').toLowerCase();
    const typeStr = String(t.type || '').toLowerCase();
    const isPaid = statusStr === 'pago' || statusStr === 'liquidado' || statusStr === 'concluido' || statusStr === 'concluído';

    if (typeStr === 'income') {
      if (isPaid) {
        totalEntradasBruto += amount;
        totalEntradasLiquido += netAmount;
        totalTaxasCartao += Math.max(0, amount - netAmount);
        totalEntradasCount += 1;

        // Payment method grouping
        let pmKey = (t.paymentMethod || 'outros').toLowerCase().trim();
        if (pmKey.includes('online') || pmKey === 'asaas' || pmKey === 'pix_online' || pmKey === 'cartao_online' || pmKey === 'pagamento_online') {
          pmKey = 'online';
        } else if (pmKey.includes('pix')) {
          pmKey = 'pix';
        } else if (pmKey.includes('dinheiro')) {
          pmKey = 'dinheiro';
        } else if (pmKey.includes('debito') || pmKey.includes('débito')) {
          pmKey = 'debito';
        } else if (pmKey.includes('credito') || pmKey.includes('crédito')) {
          pmKey = 'credito';
        }

        if (!defaultMethods[pmKey]) {
          let labelName = t.paymentMethod || 'Outros';
          if (pmKey === 'dinheiro') labelName = 'Dinheiro';
          else if (pmKey === 'debito') labelName = 'Cartão de Débito';
          else if (pmKey === 'pix') labelName = 'PIX';
          else if (pmKey === 'credito') labelName = 'Cartão de Crédito';
          else if (pmKey === 'online') labelName = 'Pagamento Online';
          else if (pmKey === 'fiado') labelName = 'Conta Cliente (Fiado)';
          else if (pmKey === 'assinatura') labelName = 'Assinatura';

          defaultMethods[pmKey] = { label: labelName, amount: 0, net: 0, count: 0, color: 'slate', icon: 'wallet' };
        }
        defaultMethods[pmKey].amount += amount;
        defaultMethods[pmKey].net += netAmount;
        defaultMethods[pmKey].count += 1;

        // Immediate liquidity (Dinheiro / PIX)
        if (pmKey === 'dinheiro' || pmKey === 'pix') {
          totalDisponivelImediato += netAmount;
        }

        // Cartões a compensar
        if (t.is_settled === false || pmKey === 'credito') {
          totalAReceberCartoesBruto += amount;
          totalAReceberCartoesLiquido += netAmount;
        }

        // Category breakdown
        const cat = (t.category || '').toLowerCase();
        const desc = (t.description || '').toLowerCase();

        if (t.service_amount !== undefined || t.product_amount !== undefined || t.package_amount !== undefined || t.subscription_amount !== undefined) {
          const sAmt = Number(t.service_amount) || 0;
          const pAmt = Number(t.product_amount) || 0;
          const pacAmt = Number(t.package_amount) || 0;
          const subAmt = Number(t.subscription_amount) || 0;
          const sumParts = sAmt + pAmt + pacAmt + subAmt;

          if (sumParts > 0) {
            const ratio = amount / sumParts;
            if (sAmt > 0) {
              itemMap.servicos.total += sAmt * ratio;
              itemMap.servicos.count += 1;
            }
            if (pAmt > 0) {
              itemMap.produtos.total += pAmt * ratio;
              itemMap.produtos.count += 1;
            }
            if (pacAmt > 0) {
              itemMap.pacotes.total += pacAmt * ratio;
              itemMap.pacotes.count += 1;
            }
            if (subAmt > 0) {
              itemMap.assinaturas.total += subAmt * ratio;
              itemMap.assinaturas.count += 1;
            }
          } else {
            itemMap.servicos.total += amount;
            itemMap.servicos.count += 1;
          }
        } else {
          if (cat.includes('assinat') || desc.includes('assinat') || desc.includes('plano') || pmKey === 'assinatura') {
            itemMap.assinaturas.total += amount;
            itemMap.assinaturas.count += 1;
          } else if (cat.includes('pacote') || desc.includes('pacote')) {
            itemMap.pacotes.total += amount;
            itemMap.pacotes.count += 1;
          } else if (
            (cat === 'produtos' || cat === 'produto' || cat.includes('estoque') || desc.includes('venda de produto') || desc.includes('venda produto')) &&
            !cat.includes('serviço') && !cat.includes('servico')
          ) {
            itemMap.produtos.total += amount;
            itemMap.produtos.count += 1;
          } else {
            itemMap.servicos.total += amount;
            itemMap.servicos.count += 1;
          }
        }
      }
    } else if (typeStr === 'expense' || typeStr === 'saida' || typeStr === 'sangria') {
      if (isPaid || typeStr === 'sangria') {
        totalSaidasPagas += amount;
        totalSaidasCount += 1;

        if (typeStr === 'sangria' || (t.category || '').toLowerCase().includes('sangria')) {
          totalSangriasRetiradas += amount;
        } else {
          totalDespesasOperacionais += amount;
        }
      }
    }
  });

  const fiadosPendentes = pendingDebts
    .filter(d => d.status === 'pendente' || d.status === 'parcial' || d.status === 'vencido')
    .reduce((acc, d) => acc + (Number(d.remainingAmount !== undefined ? d.remainingAmount : d.amount) || 0), 0);

  const totalPrevisaoReceber = totalAReceberCartoesLiquido + fiadosPendentes;
  const saldoOperacionalLiquido = totalEntradasLiquido - totalSaidasPagas;
  const saldoBruto = totalEntradasBruto - totalSaidasPagas;

  return {
    totalEntradasBruto,
    totalEntradasLiquido,
    totalTaxasCartao,
    totalEntradasCount,
    totalSaidasPagas,
    totalDespesasOperacionais,
    totalSangriasRetiradas,
    totalSaidasCount,
    saldoOperacionalLiquido,
    saldoBruto,
    totalAReceberCartoesBruto,
    totalAReceberCartoesLiquido,
    fiadosPendentes,
    totalPrevisaoReceber,
    totalDisponivelImediato,
    byMethod: defaultMethods,
    byCategory: itemMap
  };
}
