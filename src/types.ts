
export type TabId = 
  | 'dashboard' | 'dashboard-overview' | 'dashboard-indicators' | 'dashboard-alerts' | 'dashboard-financial' | 'dashboard-agenda'
  | 'agenda' | 'agenda-main' | 'agenda-appointments' | 'agenda-recurring' | 'agenda-availability' | 'agenda-blocks' | 'agenda-operations' | 'agenda-resources'
  | 'cadastros' | 'cadastros-clientes' | 'cadastros-profissionais' | 'cadastros-servicos' | 'cadastros-combos' | 'cadastros-cupons' | 'cadastros-planos' | 'cadastros-produtos' | 'cadastros-categorias' | 'cadastros-metodos-pagamento' | 'cadastros-pacotes' | 'cadastros-tipos' | 'cadastros-mensagens' | 'cadastros-noticias' | 'cadastros-satisfacao' | 'cadastros-lembretes' | 'cadastros-assinaturas' | 'cadastros-assinantes' | 'cadastros-pacotes-meus' | 'cadastros-consumo'
  | 'comandas' | 'comandas-nova' | 'comandas-abertas' | 'comandas-historico' | 'comandas-fiadas' | 'comandas-checkout'
  | 'financeiro' | 'financeiro-caixa' | 'financeiro-historico' | 'financeiro-entradas' | 'financeiro-saidas' | 'financeiro-contas-pagar' | 'financeiro-contas-receber' | 'financeiro-fluxo' | 'financeiro-assinaturas' | 'financeiro-comissoes'
  | 'estoque' | 'estoque-produtos' | 'estoque-movimentacoes' | 'estoque-inventario'
  | 'relatorios' | 'relatorios-geral' | 'relatorios-agendamentos' | 'relatorios-clientes' | 'relatorios-financeiro'
  | 'fidelidade' | 'fidelidade-programa' | 'fidelidade-cashback' | 'fidelidade-vip' | 'fidelidade-campanhas'
  | 'configuracoes' | 'configuracoes-parametros' | 'configuracoes-rodizio' | 'configuracoes-funcionamento' | 'configuracoes-permissoes'
  | 'admin' | 'admin-usuarios' | 'admin-logs' | 'admin-auditoria'
  | 'comissoes' | 'marketing' | 'insights';

export type UserRole = 'admin' | 'gerente' | 'barbeiro' | 'cliente' | 'saas_admin';

export interface UserProfile {
  uid: string;
  email: string;
  nome: string;
  telefone?: string;
  phone?: string; // Mantendo legado para compatibilidade temporária
  tipo: UserRole;
  ativo: boolean; // status (ativo/inativo)
  address?: string;
  observations?: string;
  observacoes?: string; // Nova nomenclatura
  preferences?: string;
  tenantId?: string;
  onboardingCompleted?: boolean;
  
  // Cliente specific
  saldo_atual: number; // Substituindo balance
  total_gasto: number; // Substituindo totalSpent
  total_pago: number; // Substituindo totalPaid
  total_em_aberto: number; // Novo
  balance?: number; // Legado
  totalSpent?: number; // Legado
  totalPaid?: number; // Legado
  
  appointmentsCount?: number;
  lastVisit?: string; // YYYY-MM-DD
  lastServiceAt?: any;
  preferred_profissional_id?: string;
  preferred_profissional_name?: string;
  
  // Profissional specific
  commission_percentage?: number;
  percentual_comissao?: number; // Nova nomenclatura
  specialty?: string;
  especialidade?: string; // Nova nomenclatura
  monthly_goal?: number;
  meta_mensal?: number; // Nova nomenclatura
  startDate?: string;
  is_manager?: boolean;
  is_gestor?: boolean; // Nova nomenclatura
  birthDate?: string; // Adicionado para compatibilidade
  horario_de_trabalho?: WorkingHours[]; // Integrado conforme pedido
  pontos?: number;
  points?: number;
  
  // Dados de Pessoa Física Completos
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  contatoEmergencia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  banco?: string;
  agencia?: string;
  conta?: string;
  chavePix?: string;
  tipoContrato?: string;
  
  createdAt: any;
  updatedAt: any;
}

export interface Service {
  id: string; // servico_id
  nome: string; // name
  descricao?: string; // description
  categoria: string; // category
  duracao_minutos: number; // duration
  preco: number; // price
  active: boolean; // status
  permite_cortesia: boolean; // novo
  tipo_comissao?: 'padrao' | 'percentual' | 'fixo';
  valor_comissao?: number;
  comissoes_por_profissional?: Record<string, { tipo: 'padrao' | 'percentual' | 'fixo'; valor: number }>;
  barbeiros_ids?: string[];
  name?: string; // legado
  duration?: number; // legado
  price?: number; // legado
  category?: string; // legado
  description?: string; // legado
  createdAt?: any;
  updatedAt?: any;
}

export interface ServiceCategory {
  id: string;
  name: string;
  active: boolean;
  order: number;
}

export type AppointmentStatus = 
  | 'agendado' 
  | 'confirmado' 
  | 'em_atendimento' 
  | 'concluído' 
  | 'cancelado' 
  | 'faltou' 
  | 'bloqueado';

export interface WorkingHours {
  dayOfWeek: number;
  isOpen: boolean;
  startTime: string;
  endTime: string;
  lunchStart?: string;
  lunchEnd?: string;
}

export interface ProfessionalSchedule {
  profissional_id: string;
  workingHours: WorkingHours[];
  exceptions: {
    date: string;
    isOpen: boolean;
    startTime?: string;
    endTime?: string;
  }[];
  vacations: {
    startDate: string;
    endDate: string;
    reason?: string;
  }[];
}

export interface AgendaBlock {
  id: string;
  profissional_id: string;
  profissional_name: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  isGeneral: boolean;
  createdAt: any;
}

export type RecurrencePattern = 'weekly' | 'biweekly' | 'monthly';

export interface RecurringAppointment {
  id: string;
  pattern: RecurrencePattern;
  startDate: string;
  endDate?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
  appointmentTemplate: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>;
  excludedDates: string[];
  createdAt: any;
  updatedAt: any;
}

export interface WaitlistEntry {
  id: string;
  cliente_id: string;
  cliente_name: string;
  servico_id: string;
  servico_name: string;
  preferred_profissional_id?: string;
  preferred_date: string;
  preferred_period: 'morning' | 'afternoon' | 'evening' | 'any';
  status: 'waiting' | 'scheduled' | 'cancelled';
  createdAt: any;
}

export interface Appointment {
  id: string;
  cliente_id: string;
  cliente_name: string;
  profissional_id: string;
  profissional_name: string;
  servico_id: string;
  servico_name: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  price: number;
  status: AppointmentStatus;
  origin: 'agenda' | 'encaixe' | 'recorrente' | 'cliente';
  notes?: string;
  tenantId?: string;
  comanda_id?: string;
  comanda_number?: string;
  createdAt: any;
  updatedAt: any;
}

export type PaymentMethod = 'pix' | 'dinheiro' | 'debito' | 'credito' | 'fiado' | 'assinatura' | 'resgate' | 'outros';

export interface PaymentMethodConfig {
  id: string; // metodo_pagamento_id
  nome: string; // name
  tipo: PaymentMethod; // type
  status: 'active' | 'inactive';
  taxa_percentual: number; // feePercentage
  prazo_recebimento: number; // settlementDays
  recebe_na_hora: boolean; // receivesImmediately
  entra_no_caixa: boolean; // entersCashImmediately
  vai_para_recebiveis: boolean; // goesToReceivables
  vai_para_conta_cliente: boolean; // goesToClientAccount
  permite_parcial: boolean; // allowsPartial
  permite_split: boolean; // allowsSplit
  tenantId?: string;
  name?: string; // legado
  type?: PaymentMethod; // legado
  feePercentage?: number; // legado
  settlementDays?: number; // legado
  receivesImmediately?: boolean; // legado
  entersCashImmediately?: boolean; // legado
  goesToReceivables?: boolean; // legado
  goesToClientAccount?: boolean; // legado
  allowsPartial?: boolean; // legado
  allowsSplit?: boolean; // legado
  tipo_legado?: string; // legado
  description?: string;
  internalNotes?: string;
  cardMachine?: string;
  createdAt: any;
  updatedAt: any;
}

export type TransactionType = 'income' | 'expense' | 'sangria' | 'reforco';
export type TransactionStatus = 'pago' | 'pendente' | 'vencido' | 'cancelado';

export interface FinancialTransaction {
  id: string;
  tenantId?: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  net_amount: number;
  fee_amount: number;
  paymentMethod: PaymentMethod;
  metodo_pagamento_id?: string;
  date: string;
  settlement_date: string;
  status: TransactionStatus;
  is_settled: boolean;
  agendamento_id?: string;
  comanda_id?: string;
  cliente_id?: string;
  cliente_name?: string;
  profissional_id?: string;
  profissional_name?: string;
  responsavel_id: string;
  responsavel_name: string;
  createdAt: any;
  updatedAt: any;
}

export interface DailyCash {
  id: string;
  tenantId?: string;
  date: string;
  opening_balance: number;
  closing_balance?: number;
  total_income: number;
  total_expense: number;
  total_sangria: number;
  total_reforco: number;
  total_receivables: number;
  expected_balance: number;
  actual_balance?: number;
  difference?: number;
  status: 'open' | 'closed' | 'reopened';
  aberto_por_id: string;
  aberto_por_name: string;
  fechado_por_id?: string;
  fechado_por_name?: string;
  reopened_at?: any;
  reopened_por_id?: string;
  reopened_por_name?: string;
  reopening_reason?: string;
  openedAt: any;
  closedAt?: any;
  observations?: string;
  updatedAt?: any;
  // Legacy mappings used in UI
  openingBalance?: number;
  totalIncome?: number;
  totalExpense?: number;
  openedByName?: string;
  closedByName?: string;
}

export interface CashMovement {
  id: string;
  caixa_id: string;
  tenantId?: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  is_receivable: boolean;
  settlement_date?: string;
  referencia_id?: string;
  usuario_id: string;
  usuario_name: string;
  date: string;
  createdAt: any;
}

export type ComandaStatus = 
  | 'aberta' 
  | 'em_atendimento' 
  | 'aguardando_pagamento' 
  | 'parcialmente_paga' 
  | 'nao_paga' 
  | 'fechada' 
  | 'cancelada';

export type ComandaOrigin = 'agenda' | 'encaixe' | 'balcao';
export type ComandaItemType = 'servico' | 'produto' | 'ajuste';

export interface ComandaItem {
  id: string;
  type: ComandaItemType;
  referencia_id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isCortesia: boolean;
  generateCommission: boolean;
  profissional_id?: string;
  profissional_name?: string;
  deductType?: 'pacote' | 'assinatura';
  packageSaleId?: string;
  subscriptionId?: string;
  packageUnitPrice?: number;
}

export interface ComandaPayment {
  id: string;
  method: PaymentMethod;
  metodo_pagamento_id?: string;
  amount: number;
  netAmount: number;
  feeAmount: number;
  date: string;
  settlementDate: string;
  pagamento_id?: string; // transactionId
}

export interface ReopenLog {
  userId: string;
  userName: string;
  date: string;
  reason: string;
  previousStatus: ComandaStatus;
}

export interface ComandaLog {
  userId: string;
  userName: string;
  date: string;
  action: string;
  details?: string;
}

export interface Comanda {
  id: string;
  tenantId?: string;
  number: string;
  cliente_id: string;
  cliente_name: string;
  profissional_id: string;
  profissional_name: string;
  agendamento_id?: string;
  origin: ComandaOrigin;
  status: ComandaStatus;
  aberto_por_id?: string;
  aberto_por_name?: string;
  date?: string; // Adding date field to prevent missing property errors on Comanda type in reportService
  
  subtotalServices: number;
  subtotalProducts: number;
  discount: number;
  tip: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  
  items: ComandaItem[];
  payments: ComandaPayment[];
  
  observations?: string;
  logs?: ComandaLog[];
  reopenHistory?: ReopenLog[];
  openedAt: any;
  closedAt?: any;
  createdAt: any;
  updatedAt: any;
}

export interface ClientDebt {
  id: string;
  cliente_id: string;
  cliente_name: string;
  comanda_id: string;
  amount: number;
  remainingAmount: number;
  status: 'pago' | 'pendente' | 'vencido' | 'parcial';
  dueDate?: string;
  date: string;
  createdAt: any;
  updatedAt: any;
}

export interface DebtPayment {
  id: string;
  tenantId?: string;
  divida_id: string;
  cliente_id: string;
  amount: number;
  paymentMethod: PaymentMethod;
  date: string;
  pagamento_id?: string;
  createdAt: any;
}

export interface FinancialCategory {
  id: string;
  name: string;
  type: TransactionType;
  active: boolean;
}

export type CommissionStatus = 'pendente' | 'pago' | 'parcial';

export interface Commission {
  id: string;
  tenantId?: string;
  profissional_id: string;
  profissional_name: string;
  agendamento_id?: string;
  comanda_id?: string;
  comanda_number?: string;
  cliente_id?: string;
  cliente_name?: string;
  servico_id?: string;
  servico_name: string;
  base_value: number;
  commission_percentage: number;
  commission_value: number;
  status: CommissionStatus;
  commission_type?: 'servico' | 'venda' | 'gorjeta' | 'assinatura';
  repasse_id?: string;
  date: string;
  createdAt: any;
  updatedAt: any;
}

export interface ProfessionalAdvance {
  id: string;
  profissional_id: string;
  profissional_name: string;
  amount: number;
  date: string;
  description: string;
  status?: 'pendente' | 'pago' | 'deduzido';
  repasse_id?: string;
  responsible_id: string;
  responsible_name: string;
  createdAt: any;
}

export interface ProfessionalPayment {
  id: string;
  profissional_id: string;
  profissional_name: string;
  amount: number;
  date: string;
  period_start: string;
  period_end: string;
  responsible_id: string;
  responsible_name: string;
  transaction_id: string;
  notes?: string;
  createdAt: any;
}

export interface CommissionPayout {
  id: string;
  profissional_id: string;
  profissional_name: string;
  amount: number;
  commission_ids: string[];
  date: string;
  responsavel_id: string;
  responsavel_name: string;
  notes?: string;
  createdAt: any;
}

export type ProductType = 'venda' | 'uso_interno' | 'ambos';
export type MovementType = 'entrada' | 'saida' | 'consumo_interno' | 'venda' | 'ajuste';

export interface Product {
  id: string;
  name: string;
  description?: string;
  categoria_id: string;
  categoryName: string;
  costPrice: number;
  salePrice: number;
  currentStock: number;
  minStock: number;
  type: ProductType;
  status: 'active' | 'inactive';
  fornecedor_id?: string;
  fornecedor_name?: string;
  createdAt: any;
  updatedAt: any;
}

export interface ProductCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface InventoryMovement {
  id: string;
  produto_id: string;
  productName: string;
  type: MovementType;
  quantity: number;
  reason: string;
  referencia_id?: string;
  profissional_id: string;
  profissional_name: string;
  date: string;
  financialId?: string;
  createdAt: any;
}

export interface Stats {
  revenue: number;
  appointments: number;
  newClients: number;
  averageTicket: number;
  faturamentoDia?: number;
  faturamentoMes?: number;
  ticketMedio?: number;
  clientesAtendidos?: number;
  previsaoFaturamento?: number;
  rankingBarbeiros?: { nome: string; atendimentos: number; faturamento: number }[];
}

export type SubscriptionStatus = 'active' | 'expired' | 'canceled' | 'paused' | 'pending';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  haircutsPerMonth: number;
  beardsPerMonth: number;
  extraBenefits: string[];
  status: 'active' | 'inactive';
  createdAt: any;
  updatedAt: any;
}

export interface Subscription {
  id: string;
  cliente_id: string;
  cliente_name: string;
  plano_id: string;
  planName: string;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  autoRenew: boolean;
  haircutsUsed: number;
  beardsUsed: number;
  lastRenewalDate: string;
  createdAt: any;
  updatedAt: any;
}

export interface SubscriptionUsage {
  id: string;
  assinatura_id: string;
  cliente_id: string;
  type: 'haircut' | 'beard';
  date: string;
  agendamento_id?: string;
  createdAt: any;
}

export interface MarketingCampaign {
  id: string;
  title: string;
  description: string;
  targetAudience: 'all' | 'inactive' | 'loyal' | 'new';
  status: 'active' | 'paused' | 'completed';
  startDate: string;
  endDate: string;
  impactedCount: number;
  createdAt: any;
  updatedAt: any;
}

export interface MarketingAutomation {
  id: string;
  name: string;
  trigger: 'inactive_days' | 'birthday' | 'first_visit';
  triggerValue: number; // e.g., 20 days
  messageTemplate: string;
  active: boolean;
  createdAt: any;
}

export interface MarketingHistory {
  id: string;
  cliente_id: string;
  cliente_name: string;
  clientPhone: string;
  campanha_id?: string;
  automacao_id?: string;
  message: string;
  sentAt: any;
  status: 'sent' | 'failed';
}

export interface LoyaltyConfig {
  id: string;
  pointsPerReal: number;
  pointsPerAppointment: number;
  cashbackPercentage: number;
  minRedemptionPoints: number;
  vipThreshold: number; // points to become VIP
  updatedAt: any;
}

export interface LoyaltyPoints {
  cliente_id: string;
  points: number;
  cashback: number;
  isVip: boolean;
  updatedAt: any;
}

export interface LoyaltyHistory {
  id: string;
  cliente_id: string;
  type: 'earn' | 'redeem';
  source: 'appointment' | 'manual' | 'purchase';
  points: number;
  cashback: number;
  description: string;
  date: string;
  createdAt: any;
}

export interface Automation {
  id: string;
  name: string;
  trigger: 'inactive_days' | 'birthday' | 'empty_agenda' | 'subscription_expiring' | 'pending_payment';
  triggerValue: any;
  active: boolean;
  messageTemplate: string;
  createdAt: any;
}

export interface AutomationLog {
  id: string;
  automacao_id: string;
  automationName: string;
  cliente_id: string;
  cliente_name: string;
  executedAt: any;
  status: 'success' | 'error';
}

export interface SystemInsight {
  id: string;
  type: 'inactive_client' | 'revenue_drop' | 'low_production' | 'idle_time' | 'top_service';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  data: any;
  date: string;
  createdAt: any;
}

export interface AccountPayable {
  id: string;
  tenantId?: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  supplier: string;
  recurrence: 'none' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  status: 'pending' | 'paid' | 'overdue';
  paidAt?: any;
  paymentMethod?: string;
  transactionId?: string;
  movementId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface AccountReceivable {
  id: string;
  tenantId?: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  clientOrPartner: string;
  recurrence: 'none' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  status: 'pending' | 'paid' | 'overdue';
  receivedAt?: any;
  paymentMethod?: string;
  transactionId?: string;
  movementId?: string;
  createdAt: any;
  updatedAt: any;
}

export interface Combo {
  id: string;
  nome: string;
  descricao?: string;
  preco: number;
  servicos_ids: string[];
  produtos_ids: string[];
  active: boolean;
  tenantId?: string;
  createdAt: any;
  updatedAt: any;
}
