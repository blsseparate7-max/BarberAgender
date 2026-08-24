import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Sparkles, 
  MessageSquare, 
  HelpCircle, 
  TrendingUp, 
  CreditCard, 
  DollarSign, 
  Scissors, 
  Smartphone, 
  CheckCircle2, 
  ChevronRight, 
  ChevronDown, 
  ThumbsUp, 
  BookOpen, 
  Send,
  Phone,
  ShieldCheck,
  Zap
} from 'lucide-react';

interface ForumTopic {
  id: string;
  category: 'assinaturas' | 'comissoes' | 'agendamento' | 'financeiro' | 'crescimento';
  title: string;
  excerpt: string;
  content: string[];
  author: string;
  authorRole: string;
  tags: string[];
  lastUpdated: string;
}

const WHATSAPP_NUMBER = '5543999227226';
const WHATSAPP_BASE_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

const FORUM_TOPICS: ForumTopic[] = [
  {
    id: 'clube-assinatura-passo-a-passo',
    category: 'assinaturas',
    title: 'Como funciona o Clube de Assinaturas e a cobrança automática no Cartão?',
    excerpt: 'Entenda como o sistema cobra os clientes mensalmente no cartão sem você precisar cobrar ninguém manualmente.',
    content: [
      'O Clube de Assinaturas do sistema Rull utiliza a infraestrutura de pagamentos integrada com o Asaas para realizar cobranças recorrentes automáticas diretamente na fatura do cartão de crédito do seu cliente.',
      '1. Você cadastra os planos da sua barbearia (Ex: "Clube Cabelo VIP - R$ 119/mês" ou "Clube Cabelo & Barba - R$ 189/mês").',
      '2. O cliente assina pelo link exclusivo ou diretamente no balcão da sua barbearia digitando os dados do cartão.',
      '3. A cada 30 dias, o valor é debitado automaticamente do cartão do cliente e creditado na conta da barbearia.',
      '4. O sistema controla a quantidade de cortes/serviços disponíveis no mês. Ao realizar o atendimento, o barbeiro apenas seleciona "Abater do Clube" e o saldo é atualizado na hora.'
    ],
    author: 'Equipe de Engenharia Rull',
    authorRole: 'Especialista em Recorrência',
    tags: ['Recorrência', 'Cartão de Crédito', 'Asaas', 'Faturamento Fixo'],
    lastUpdated: 'Atualizado recentemente'
  },
  {
    id: 'precificacao-assinaturas-lucro',
    category: 'assinaturas',
    title: 'Como precificar o plano do Clube para ter lucro máximo sem canibalizar cortes avulsos?',
    excerpt: 'A regra de ouro da matemática de barbearia para fidelizar o cliente e dobrar o ticket médio anual.',
    content: [
      'Muitos donos erram ao colocar um preço muito baixo no plano. O segredo da assinatura não é dar desconto exagerado, mas sim garantir a recorrência do cliente que cortava a cada 30 ou 40 dias para vir a cada 10 ou 15 dias.',
      '• Regra dos 2,5x a 3x: O valor da assinatura de 4 cortes/mês deve ser equivalente ao valor de 2,5 a 3 cortes avulsos. Exemplo: se o corte avulso é R$ 45, o plano mensal pode ser entre R$ 110 e R$ 130.',
      '• Mais consumo no balcão: O cliente assinante já não paga pelo corte no dia, logo ele compra mais pomada, cerveja, minoxidil e consome serviços adicionais como sobrancelha e barba.',
      '• Dias de chuva e início de mês: O dinheiro cai no caixa mesmo que o cliente viaje ou fique doente, garantindo a folha de pagamento.'
    ],
    author: 'Consultoria de Negócios Rull',
    authorRole: 'Consultor Financeiro de Barbearias',
    tags: ['Precificação', 'Lucratividade', 'Ticket Médio'],
    lastUpdated: 'Atualizado recentemente'
  },
  {
    id: 'divisao-comissao-barbeiros-sem-erro',
    category: 'comissoes',
    title: 'Como o sistema calcula as comissões dos barbeiros e evita conflitos no fechamento?',
    excerpt: 'Defina porcentagens personalizadas por serviço, taxas de cartão e vales com extrato em tempo real.',
    content: [
      'A falta de transparência nas comissões é o principal motivo de desligamento de bons barbeiros. O sistema Rull elimina completamente esse problema:',
      '• Cada barbeiro tem um login próprio no celular e vê imediatamente quanto ganhou após cada corte finalizado.',
      '• Você pode definir comissões diferentes: ex: 50% em corte, 40% em química, 15% na venda de pomadas/produtos.',
      '• Divisão inteligente das taxas de máquina de cartão e adiantamentos (vales) lançados ao longo da semana.',
      '• Relatório de fechamento em 1 clique em PDF/Excel pronto para pagamento.'
    ],
    author: 'Gestão de Pessoas Rull',
    authorRole: 'Especialista em Gestão de Equipes',
    tags: ['Comissões', 'Barbeiros', 'Fechamento', 'Transparência'],
    lastUpdated: 'Atualizado recentemente'
  },
  {
    id: 'link-agendamento-instagram-whatsapp',
    category: 'agendamento',
    title: 'Como colocar o link de agendamento na Bio do Instagram e no WhatsApp?',
    excerpt: 'Passo a passo simples para receber agendamentos no automático sem parar o atendimento.',
    content: [
      'Sua barbearia recebe um link exclusivo e personalizado (ex: app.rull.com.br/suabarbearia).',
      '1. Copie seu link no painel administrativo.',
      '2. Cole na seção "Links / Site" do perfil do Instagram da barbearia.',
      '3. Configure uma mensagem automática no WhatsApp Business: "Olá! Para escolher seu barbeiro e marcar seu horário em 10 segundos, clique aqui: [SEU LINK]".',
      '4. Os clientes recebem lembretes e confirmações, reduzindo as faltas (no-shows) em até 80%.'
    ],
    author: 'Suporte Técnico Rull',
    authorRole: 'Especialista em Suporte',
    tags: ['Agendamento', 'Instagram Bio', 'WhatsApp', 'Automação'],
    lastUpdated: 'Atualizado recentemente'
  },
  {
    id: 'frente-de-caixa-comandas-produtos',
    category: 'financeiro',
    title: 'Como usar as comandas e frente de caixa para controlar estoque e vendas de bebidas/produtos?',
    excerpt: 'Lance cortes, produtos e consumações em uma comanda unificada com múltiplos métodos de pagamento.',
    content: [
      'O PDV (Ponto de Venda) do Rull foi desenhado para ser ultra rápido:',
      '• Ao abrir o agendamento, uma comanda é gerada automaticamente com o serviço e o barbeiro responsável.',
      '• Durante o atendimento, lance refrigerantes, cervejas, ceras modeladoras e shampoos com baixa instantânea no estoque.',
      '• O cliente pode pagar com Dinheiro, Pix, Cartão de Débito, Cartão de Crédito ou abater do Clube de Assinaturas.',
      '• Alerta automático quando o estoque de um produto atinge a quantidade mínima de segurança.'
    ],
    author: 'Operações Rull',
    authorRole: 'Especialista em Caixa & Estoque',
    tags: ['Frente de Caixa', 'Estoque', 'Comandas', 'Vendas'],
    lastUpdated: 'Atualizado recentemente'
  },
  {
    id: 'estrategia-lotar-dias-lentos',
    category: 'crescimento',
    title: 'Estratégia comprovada: Como acabar com a barbearia vazia nas terças e quartas-feiras?',
    excerpt: 'Como usar o sistema para incentivar clientes a cortarem no início da semana.',
    content: [
      'O maior desperdício de uma barbearia é a cadeira ociosa no início da semana e a fila insuportável na sexta e sábado.',
      '• Plano do Clube "Dias Úteis": Crie um plano de assinatura exclusivo para atendimentos de terça a quinta com valor promocional. Isso atrai clientes flexíveis e alivia a sexta-feira.',
      '• Lembrete de retorno inteligente: O sistema identifica clientes que não cortam há mais de 20 dias e facilita o contato proativo.',
      '• Previsibilidade de receita: Com as assinaturas ativas, mesmo que chova em uma terça-feira, o seu faturamento mensal já está 100% garantido no caixa.'
    ],
    author: 'Growth & Marketing Rull',
    authorRole: 'Consultor de Crescimento',
    tags: ['Crescimento', 'Horários de Pico', 'Marketing', 'Fidelização'],
    lastUpdated: 'Atualizado recentemente'
  }
];

export function LandingForum() {
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const categories = [
    { id: 'todos', label: 'Todos os Tópicos', icon: BookOpen },
    { id: 'assinaturas', label: 'Clube de Assinaturas', icon: Sparkles },
    { id: 'comissoes', label: 'Comissões & Barbeiros', icon: Scissors },
    { id: 'agendamento', label: 'Agendamento & Bio', icon: Smartphone },
    { id: 'financeiro', label: 'Caixa & Estoque', icon: DollarSign },
    { id: 'crescimento', label: 'Crescimento & Lucro', icon: TrendingUp }
  ];

  const filteredTopics = FORUM_TOPICS.filter((topic) => {
    const matchesCategory = selectedCategory === 'todos' || topic.category === selectedCategory;
    const matchesSearch = 
      topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      topic.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      topic.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const getWhatsAppLink = (message: string) => {
    return `${WHATSAPP_BASE_URL}?text=${encodeURIComponent(message)}`;
  };

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-6 py-16" id="forum-section">
      {/* Header do Fórum & Central */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs text-emerald-400 font-bold">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Fórum Oficial, Base de Conhecimento & Assinaturas</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          Central de Conhecimento & Dúvidas
        </h2>
        <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
          Aprenda como implementar o Clube de Assinaturas, automatizar comissões da sua equipe e escalar o faturamento da sua barbearia com a plataforma Rull.
        </p>
      </div>

      {/* Barra de Busca e Categorias */}
      <div className="max-w-4xl mx-auto space-y-6 mb-12">
        {/* Input de Busca */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Pesquise dúvidas sobre assinaturas, cartão de crédito, comissões, agendamento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-emerald-500 rounded-2xl pl-12 pr-4 py-4 text-sm text-white placeholder-zinc-500 outline-none transition-all shadow-lg"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-white bg-zinc-800 px-2 py-1 rounded-md"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Pílulas de Categoria */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 ${
                  isSelected
                    ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20 scale-[1.02]'
                    : 'bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-800/80'
                }`}
              >
                <Icon size={14} className={isSelected ? 'text-zinc-950' : 'text-emerald-400'} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Tópicos e Artigos */}
      <div className="max-w-4xl mx-auto space-y-4">
        {filteredTopics.length > 0 ? (
          filteredTopics.map((topic) => {
            const isExpanded = expandedTopicId === topic.id;

            return (
              <motion.div
                key={topic.id}
                layout
                className={`bg-zinc-900/50 border rounded-2xl sm:rounded-3xl overflow-hidden transition-all ${
                  isExpanded ? 'border-emerald-500/60 shadow-xl shadow-emerald-500/5 bg-zinc-900/80' : 'border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                {/* Header do Tópico (Clicável) */}
                <div
                  onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                  className="p-6 cursor-pointer space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {topic.category.toUpperCase()}
                      </span>
                      <span className="text-xs text-zinc-500">• {topic.lastUpdated}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                      <BookOpen size={13} />
                      <span>Guia Prático</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {topic.title}
                    </h3>
                    <ChevronDown
                      size={20}
                      className={`text-zinc-400 transition-transform duration-200 shrink-0 mt-1 ${
                        isExpanded ? 'rotate-180 text-emerald-400' : ''
                      }`}
                    />
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    {topic.excerpt}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {topic.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-md">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Conteúdo Expandido do Artigo */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="px-6 pb-6 pt-2 border-t border-zinc-800/80 space-y-4">
                        <div className="space-y-3 pt-2 text-sm text-zinc-300 leading-relaxed">
                          {topic.content.map((paragraph, pIdx) => (
                            <p key={pIdx} className="bg-zinc-950/40 p-3.5 rounded-xl border border-zinc-800/40 text-xs sm:text-sm">
                              {paragraph}
                            </p>
                          ))}
                        </div>

                        {/* Autor & CTA de Dúvidas */}
                        <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-800/40">
                          <div className="flex items-center gap-2.5 self-start sm:self-auto">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-black">
                              R
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white leading-tight">{topic.author}</p>
                              <p className="text-[10px] text-zinc-400">{topic.authorRole}</p>
                            </div>
                          </div>

                          <a
                            href={getWhatsAppLink(`Olá! Li o tópico "${topic.title}" no fórum e gostaria de tirar uma dúvida com a equipe técnica.`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-zinc-950 border border-emerald-500/30 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 w-full sm:w-auto justify-center"
                          >
                            <Phone size={13} />
                            <span>Tirar Dúvida no WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        ) : (
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-12 text-center space-y-3">
            <HelpCircle size={36} className="text-zinc-500 mx-auto" />
            <h4 className="text-base font-bold text-white">Nenhum tópico encontrado</h4>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Não encontrou o que procurava? Fale diretamente com o nosso time de suporte especializado.
            </p>
            <a
              href={getWhatsAppLink(`Olá! Estava no fórum buscando por "${searchTerm}" e gostaria de ajuda com o sistema.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-500 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs mt-2"
            >
              <Phone size={14} />
              <span>Chamar Suporte</span>
            </a>
          </div>
        )}
      </div>

      {/* Caixa de Ação: Não encontrou o que precisa? */}
      <div className="max-w-4xl mx-auto mt-12 bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-900 border border-emerald-500/20 p-8 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl">
        <div className="space-y-2 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 text-emerald-400 text-xs font-bold">
            <Zap size={14} />
            <span>Suporte Humanizado em Tempo Real</span>
          </div>
          <h3 className="text-xl font-extrabold text-white">Tem alguma dúvida específica sobre a sua barbearia?</h3>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-lg">
            Nossos consultores ajudam você a configurar a tabela de comissões e criar a estratégia de assinaturas sob medida.
          </p>
        </div>

        <a
          href={getWhatsAppLink("Olá! Gostaria de conversar com um especialista sobre como implantar o sistema na minha barbearia.")}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black px-6 py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 shrink-0 hover:scale-[1.02]"
        >
          <Phone size={16} />
          <span>Falar com Especialista</span>
        </a>
      </div>
    </section>
  );
}
