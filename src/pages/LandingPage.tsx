import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Scissors, Calendar, Shield, Sparkles, TrendingUp, Search, User, Briefcase, ArrowRight, Star, Clock, MapPin, ChevronRight, Phone, Mail } from 'lucide-react';
import { tenantService, TenantProfile } from '../services/tenantService';

interface LandingPageProps {
  onSelectRole: (role: 'cliente' | 'profissional' | 'dono-registro') => void;
  activeTenant: TenantProfile | null;
}

export function LandingPage({ onSelectRole, activeTenant }: LandingPageProps) {
  const [tenants, setTenants] = useState<TenantProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [activeTab, setActiveTab] = useState<'inicio' | 'barbearias'>('inicio');

  const isSpecificTenant = activeTenant && activeTenant.id !== 'barber-elite';

  const handleDisconnect = () => {
    localStorage.removeItem('barberelite_tenant_id');
    const url = new URL(window.location.href);
    url.searchParams.delete('tenant');
    url.searchParams.delete('tenantId');
    window.history.pushState({}, '', url.pathname + url.search);
    window.location.reload();
  };

  useEffect(() => {
    tenantService.listTenants()
      .then((list) => {
        // Filter active ones and exclude the default template barber-elite tenant
        setTenants(list.filter(t => t.isActive && t.id !== 'barber-elite'));
      })
      .catch((err) => console.error('Error fetching tenants list:', err))
      .finally(() => setLoadingTenants(false));
  }, []);

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.address?.city && t.address.city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500 selection:text-zinc-950">
      {/* Dynamic Ambient Background Elements */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-indigo-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0" id="landing-header">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button 
            onClick={() => setActiveTab('inicio')} 
            className="flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
          >
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg font-black text-sm text-zinc-950 shrink-0"
              style={{ backgroundColor: isSpecificTenant ? activeTenant.accentColor : '#10B981' }}
            >
              {isSpecificTenant && activeTenant.logoUrl ? (
                <img src={activeTenant.logoUrl} alt={activeTenant.name} className="w-full h-full object-cover rounded-xl" referrerPolicy="no-referrer" />
              ) : (
                <Scissors className="w-5 h-5 text-zinc-950" />
              )}
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent block">
                {isSpecificTenant ? activeTenant.name : 'BarberElite'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] block text-emerald-500 font-bold tracking-widest uppercase">
                  {isSpecificTenant ? 'Unidade Conectada' : 'SaaS Plataforma'}
                </span>
                {isSpecificTenant && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnect();
                    }}
                    title="Desconectar da Unidade e Voltar ao Portal Geral"
                    className="text-[9px] bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black px-1.5 py-0.5 rounded border border-red-500/10 uppercase tracking-wider transition-colors"
                  >
                    Desconectar
                  </button>
                )}
              </div>
            </div>
          </button>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <button 
              onClick={() => setActiveTab('inicio')}
              className={`transition-colors font-bold ${activeTab === 'inicio' ? 'text-emerald-500' : 'hover:text-white'}`}
            >
              Início
            </button>
            <button 
              onClick={() => setActiveTab('barbearias')}
              className={`transition-colors font-bold ${activeTab === 'barbearias' ? 'text-emerald-500' : 'hover:text-white'}`}
            >
              Barbearias que usam
            </button>
            {activeTab === 'inicio' && (
              <>
                <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
                <a href="#beneficios" className="hover:text-white transition-colors">Vantagens</a>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => onSelectRole('profissional')}
              className="px-4 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
            >
              Entrar
            </button>
            <button 
              onClick={() => onSelectRole('dono-registro')}
              className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/10 flex items-center gap-2 hover:scale-[1.02]"
            >
              Registrar Barbearia <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'inicio' ? (
        <>
          {/* Hero Section */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32 text-center" id="landing-hero">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-400">
                <Sparkles className="text-emerald-500 w-3.5 h-3.5" />
                <span>Sistema Multitenant Completo para Barbearias</span>
              </div>

              <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-[1.1] text-white">
                O estilo da sua <span className="text-emerald-500 bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">barbearia</span> levado ao próximo nível
              </h1>

              <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto font-normal">
                Uma plataforma de alta performance com gestão inteligente de comandas, caixa, comissões de profissionais, planos de fidelidade, controle de estoque e agendamentos integrados.
              </p>

              <div className="pt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  onClick={() => onSelectRole('dono-registro')}
                  className="w-full sm:w-auto bg-white text-zinc-950 hover:bg-zinc-200 px-8 py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-3 shadow-xl"
                >
                  <Briefcase size={20} className="text-emerald-600" />
                  Sou Dono de Barbearia
                </button>
                <button
                  onClick={() => setActiveTab('barbearias')}
                  className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 px-8 py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-3"
                >
                  <Calendar size={20} className="text-emerald-400" />
                  Quero Agendar como Cliente
                </button>
              </div>
            </motion.div>

             {/* Dynamic Active Tenant Branding Display */}
            {isSpecificTenant && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="max-w-3xl mx-auto mt-16 bg-zinc-900/60 border border-zinc-850 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden text-left group"
              >
                {/* Accent light decoration */}
                <div 
                  className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] pointer-events-none opacity-25"
                  style={{ backgroundColor: activeTenant.accentColor || '#10B981' }}
                />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div className="flex items-center gap-5">
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-white text-2xl shadow-lg shrink-0"
                      style={{ backgroundColor: activeTenant.accentColor || '#10B981' }}
                    >
                      {activeTenant.logoUrl ? (
                        <img src={activeTenant.logoUrl} alt={activeTenant.name} className="w-full h-full object-cover rounded-2xl" referrerPolicy="no-referrer" />
                      ) : (
                        activeTenant.name.substring(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-500/10">
                        Barbearia Conectada
                      </span>
                      <h3 className="text-2xl font-black text-white mt-2 tracking-tight">{activeTenant.name}</h3>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 text-zinc-400 text-sm md:border-l md:border-zinc-800 md:pl-8 py-1">
                    {activeTenant.address && (
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-zinc-500 shrink-0" />
                        <span>{activeTenant.address.street}, {activeTenant.address.city} - {activeTenant.address.state}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-zinc-800/80 mt-6 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 relative z-10">
                  <p className="text-xs text-zinc-500 font-semibold max-w-sm">
                    Agende seu horário nesta unidade ou desconecte para voltar ao portal geral multitenant.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <button
                      onClick={handleDisconnect}
                      className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-white border border-zinc-800 font-bold px-5 py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2"
                    >
                      Voltar ao Início
                    </button>
                    <button
                      onClick={() => {
                        localStorage.setItem('barberelite_tenant_id', activeTenant.id);
                        onSelectRole('cliente');
                      }}
                      className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black px-6 py-3.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/15"
                    >
                      <Calendar size={16} /> Agendar Agora
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Feature Teasers */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto mt-20" id="landing-stats">
              <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-2xl text-center">
                <h3 className="text-2xl font-extrabold text-white">100% Real</h3>
                <p className="text-xs text-zinc-500 mt-1 uppercase font-semibold tracking-wider">Sem dados fictícios</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-2xl text-center">
                <h3 className="text-2xl font-extrabold text-emerald-500">Agendamentos</h3>
                <p className="text-xs text-zinc-500 mt-1 uppercase font-semibold tracking-wider">Em tempo real</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-2xl text-center">
                <h3 className="text-2xl font-extrabold text-white">Gestão Financeira</h3>
                <p className="text-xs text-zinc-500 mt-1 uppercase font-semibold tracking-wider">Controle de caixa & comissão</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-2xl text-center">
                <h3 className="text-2xl font-extrabold text-emerald-500">Multi-Unidades</h3>
                <p className="text-xs text-zinc-500 mt-1 uppercase font-semibold tracking-wider">Atendimento Multitenant</p>
              </div>
            </div>
          </section>

          {/* Main Portals Section */}
          <section className="relative z-10 bg-zinc-900/20 border-y border-zinc-900 py-20" id="como-funciona">
            <div className="max-w-7xl mx-auto px-6">
              <div className="text-center mb-16 space-y-4">
                <h2 className="text-3xl font-extrabold tracking-tight">Escolha sua Área de Acesso</h2>
                <p className="text-zinc-400 max-w-xl mx-auto">Temos interfaces customizadas otimizadas para o seu papel no ecossistema da barbearia.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
                {/* Business Portal */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl relative overflow-hidden group hover:border-emerald-500/20 transition-all flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-emerald-500/10 transition-colors" />
                  <div className="space-y-6">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                      <Briefcase size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">Painel de Barbearia</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed">
                        Área dedicada a administradores, gerentes e barbeiros. Controle a agenda diária, comissões de profissionais, fluxo de caixa, estoque e comandas de atendimento.
                      </p>
                    </div>
                    <ul className="space-y-3 text-sm text-zinc-500">
                      <li className="flex items-center gap-2"><ChevronRight size={14} className="text-emerald-500" /> Painel Geral de Faturamento</li>
                      <li className="flex items-center gap-2"><ChevronRight size={14} className="text-emerald-500" /> Relatórios Completos e Exportáveis</li>
                      <li className="flex items-center gap-2"><ChevronRight size={14} className="text-emerald-500" /> Fechamento e Sincronização de Comandas</li>
                    </ul>
                  </div>
                  <div className="pt-8 flex gap-3">
                    <button
                      onClick={() => onSelectRole('profissional')}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-3 px-4 rounded-xl font-bold text-sm transition-all"
                    >
                      Entrar no Painel
                    </button>
                    <button
                      onClick={() => onSelectRole('dono-registro')}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/5"
                    >
                      Cadastrar Barbearia
                    </button>
                  </div>
                </div>

                {/* Client Portal */}
                <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl relative overflow-hidden group hover:border-emerald-500/20 transition-all flex flex-col justify-between">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />
                  <div className="space-y-6">
                    <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                      <User size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white mb-2">Área do Cliente</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed">
                        Reserve seus horários em segundos. Escolha seu barbeiro de preferência, selecione serviços, consulte seu histórico de agendamentos, pontos de fidelidade e cashback.
                      </p>
                    </div>
                    <ul className="space-y-3 text-sm text-zinc-500">
                      <li className="flex items-center gap-2"><ChevronRight size={14} className="text-indigo-400" /> Agendamento Online Simplificado</li>
                      <li className="flex items-center gap-2"><ChevronRight size={14} className="text-indigo-400" /> Acompanhamento de Pontos e Cashback</li>
                      <li className="flex items-center gap-2"><ChevronRight size={14} className="text-indigo-400" /> Notificações de confirmação</li>
                    </ul>
                  </div>
                  <div className="pt-8">
                    <button
                      onClick={() => setActiveTab('barbearias')}
                      className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white text-center py-3.5 px-4 rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-600/5"
                    >
                      Fazer Agendamento Online
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Benefits Section */}
          <section className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900" id="beneficios">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl font-extrabold tracking-tight">Feito para o Sucesso</h2>
              <p className="text-zinc-400 max-w-xl mx-auto">Vantagens robustas para automatizar seu dia a dia e atrair mais clientes.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <div className="bg-zinc-900/30 border border-zinc-900/80 p-8 rounded-2xl space-y-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                  <TrendingUp size={20} />
                </div>
                <h4 className="text-lg font-bold">Comissões Precisas</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Cálculo automático das comissões dos barbeiros por serviços e vendas de produtos. Histórico detalhado de faturamento por profissional.
                </p>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900/80 p-8 rounded-2xl space-y-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                  <Shield size={20} />
                </div>
                <h4 className="text-lg font-bold">Segurança e Sincronia</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Fechamentos de comandas integrados ao caixa do dia. Logs de segurança contra alterações e inconsistências.
                </p>
              </div>

              <div className="bg-zinc-900/30 border border-zinc-900/80 p-8 rounded-2xl space-y-4">
                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
                  <Sparkles size={20} />
                </div>
                <h4 className="text-lg font-bold">Fidelização Turbinada</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Campanhas de cashback automático, cartões de fidelidade e assinaturas recorrentes de planos de corte e barba.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : (
        /* Search & Tenants Grid Section - Expanded dynamic screen view for Barbearias directory */
        <section className="relative z-10 max-w-7xl mx-auto px-6 py-12 md:py-20 min-h-[60vh]" id="barbearias">
          <div className="max-w-4xl mx-auto text-center mb-12 space-y-4">
            <span className="text-emerald-500 text-xs font-black uppercase tracking-widest bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
              Diretório de Unidades
            </span>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mt-3 text-white">Barbearias na Plataforma</h2>
            <p className="text-zinc-400 text-base max-w-2xl mx-auto">
              Encontre a sua barbearia para fazer um agendamento ou navegue pelas unidades de elite disponíveis em nossa rede.
            </p>

            <div className="relative max-w-md mx-auto pt-6">
              <Search className="absolute left-4 top-[65%] -translate-y-1/2 text-zinc-500" size={18} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou cidade..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 text-white placeholder-zinc-500 focus:ring-2 focus:ring-emerald-500/10 transition-all"
              />
            </div>
          </div>

          {loadingTenants ? (
            <div className="flex justify-center items-center py-24">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="bg-zinc-900/20 border border-zinc-900 text-center p-16 rounded-3xl max-w-md mx-auto shadow-xl">
              <p className="text-zinc-400 mb-6 font-semibold">Nenhuma barbearia encontrada com este termo.</p>
              <button 
                onClick={() => { setSearchQuery(''); }}
                className="bg-emerald-500 text-zinc-950 font-black text-xs px-5 py-2.5 rounded-xl hover:bg-emerald-400 transition-colors shadow-lg"
              >
                Limpar busca
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {filteredTenants.map((item) => (
                <div 
                  key={item.id}
                  className="bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700 p-6 rounded-3xl flex flex-col justify-between transition-all group relative overflow-hidden hover:scale-[1.02] duration-300 shadow-xl"
                >
                  <div 
                    className="absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl pointer-events-none opacity-5 group-hover:opacity-10 transition-opacity"
                    style={{ backgroundColor: item.accentColor || '#10B981' }}
                  />
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div 
                        className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white text-xl shadow-md shrink-0 border border-zinc-800"
                        style={{ backgroundColor: item.accentColor || '#10B981' }}
                      >
                        {item.logoUrl ? (
                          <img src={item.logoUrl} alt={item.name} className="w-full h-full object-cover rounded-2xl" referrerPolicy="no-referrer" />
                        ) : (
                          item.name.substring(0, 2).toUpperCase()
                        )}
                      </div>
                      {item.id === 'barber-elite' && (
                        <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-full uppercase border border-emerald-500/10 tracking-wider">
                          Principal
                        </span>
                      )}
                    </div>

                    <h4 className="text-xl font-black text-white mb-2 group-hover:text-emerald-400 transition-colors leading-tight">{item.name}</h4>
                    
                    {item.address && (
                      <div className="flex items-start gap-2.5 text-zinc-400 text-xs mb-3.5 leading-relaxed font-medium">
                        <MapPin size={15} className="shrink-0 mt-0.5 text-zinc-500" />
                        <span>{item.address.street}, {item.address.city} - {item.address.state}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      localStorage.setItem('barberelite_tenant_id', item.id);
                      onSelectRole('cliente');
                    }}
                    className="w-full bg-zinc-800 hover:bg-emerald-500 hover:text-zinc-950 text-white font-black py-3.5 rounded-2xl text-xs transition-all flex items-center justify-center gap-2 mt-6 shadow-inner"
                  >
                    <Calendar size={14} /> Fazer Agendamento
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="relative z-10 border-t border-zinc-900 bg-zinc-950 py-12 text-center text-zinc-600 text-xs">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <p>© 2026 BarberElite. Desenvolvido para Barbearias de Alta Performance.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
            <a href="#" className="hover:text-white transition-colors">Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
