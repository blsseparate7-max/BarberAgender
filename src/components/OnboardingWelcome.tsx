import React, { useState } from 'react';
import { 
  Sparkles, 
  Calendar, 
  DollarSign, 
  Users, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Settings, 
  Scissors, 
  Gift, 
  PartyPopper,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { userService } from '../services/userService';
import { UserProfile } from '../types';

interface OnboardingWelcomeProps {
  profile: UserProfile;
  onClose: () => void;
  onNavigate: (tabId: string) => void;
}

export function OnboardingWelcome({ profile, onClose, onNavigate }: OnboardingWelcomeProps) {
  const [step, setStep] = useState(1);
  const [isFinishing, setIsFinishing] = useState(false);
  const totalSteps = 3;

  const handleFinish = async () => {
    setIsFinishing(true);
    try {
      await userService.updateUserProfile(profile.uid, {
        onboardingCompleted: true
      });
      onClose();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      // Fallback close if Firestore write fails
      onClose();
    } finally {
      setIsFinishing(false);
    }
  };

  const stepsContent = [
    {
      title: "Boas-vindas ao seu Novo Sistema!",
      subtitle: `Olá, ${profile.nome.split(' ')[0]}! É um prazer ter você conosco.`,
      icon: <PartyPopper className="text-amber-500 w-12 h-12" />,
      content: (
        <div className="space-y-4 text-slate-600 text-sm font-semibold">
          <p className="leading-relaxed">
            Parabéns! Você acaba de dar o passo mais importante para modernizar e escalar sua barbearia. Nosso sistema foi desenvolvido sob medida para facilitar sua rotina e aumentar seus lucros.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 font-bold text-slate-700">
            <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="bg-amber-100 p-2.5 rounded-xl text-amber-600 mt-0.5">
                <Calendar size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-900 font-extrabold">Agenda Inteligente</p>
                <p className="text-[11px] text-slate-500 mt-1">Sincronização instantânea e agendamentos online para seus clientes.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600 mt-0.5">
                <DollarSign size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-900 font-extrabold">Financeiro & Comandas</p>
                <p className="text-[11px] text-slate-500 mt-1">Controle de caixa, fluxo diário, comissões de profissionais e DRE.</p>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-amber-600 font-extrabold bg-amber-50/50 p-3 rounded-xl border border-amber-100/50 mt-2">
            💡 Dica: Agora que limpamos os dados de demonstração, o sistema está pronto para ser configurado com a sua identidade!
          </p>
        </div>
      )
    },
    {
      title: "Como o Sistema Funciona",
      subtitle: "Um tour rápido pelas principais abas de gestão",
      icon: <Sparkles className="text-indigo-500 w-12 h-12" />,
      content: (
        <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
          <div className="space-y-2.5">
            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
              <span className="bg-indigo-50 text-indigo-600 text-xs font-black px-2.5 py-1 rounded-lg mt-0.5">1</span>
              <div>
                <h4 className="text-xs font-black text-slate-800">Painel Geral (Dashboard)</h4>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Visão geral do faturamento, novos clientes, ocupação da agenda e insights automáticos.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
              <span className="bg-rose-50 text-rose-600 text-xs font-black px-2.5 py-1 rounded-lg mt-0.5">2</span>
              <div>
                <h4 className="text-xs font-black text-slate-800">Agenda & Comandas</h4>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">A agenda gerencia os horários. Ao finalizar um atendimento, abra a comanda para registrar pagamentos e calcular comissões.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
              <span className="bg-emerald-50 text-emerald-600 text-xs font-black px-2.5 py-1 rounded-lg mt-0.5">3</span>
              <div>
                <h4 className="text-xs font-black text-slate-800">Fidelidade & Marketing</h4>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Crie cupons, pacotes de cortes, planos de assinatura, cashback personalizado e envie lembretes automáticos de retorno.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100">
              <span className="bg-amber-50 text-amber-600 text-xs font-black px-2.5 py-1 rounded-lg mt-0.5">4</span>
              <div>
                <h4 className="text-xs font-black text-slate-800">Controle de Estoque</h4>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">Gerencie os produtos para venda e de uso interno, receba avisos de estoque baixo e controle fornecedores.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Seus Primeiros Passos Recomentados",
      subtitle: "Faça essas 3 tarefas para deixar sua barbearia pronta para uso",
      icon: <CheckCircle2 className="text-emerald-500 w-12 h-12" />,
      content: (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            Sugerimos que você siga a ordem abaixo para configurar seu negócio rapidamente:
          </p>

          <div className="space-y-3">
            <button 
              onClick={() => { onNavigate('configuracoes-perfil'); onClose(); }}
              className="w-full text-left flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-slate-200/60 p-2 rounded-xl text-slate-700 group-hover:bg-amber-100 group-hover:text-amber-600 transition-all">
                  <Settings size={18} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">1. Perfil da Barbearia</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Defina endereço, contato, horários e link personalizado de agendamento.</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={() => { onNavigate('cadastros-servicos'); onClose(); }}
              className="w-full text-left flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-slate-200/60 p-2 rounded-xl text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                  <Scissors size={18} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">2. Seus Serviços</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Adicione os cortes, barbas, combos de serviços, preços e tempos de execução.</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button 
              onClick={() => { onNavigate('cadastros-profissionais'); onClose(); }}
              className="w-full text-left flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 hover:border-slate-200 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="bg-slate-200/60 p-2 rounded-xl text-slate-700 group-hover:bg-rose-100 group-hover:text-rose-600 transition-all">
                  <Users size={18} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">3. Equipe de Barbeiros</p>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Adicione sua equipe, defina comissões personalizadas e as jornadas de trabalho.</p>
                </div>
              </div>
              <ArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = stepsContent[step - 1];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-white rounded-[36px] shadow-2xl border border-slate-100 max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header Illustration & Indicator */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 p-8 text-white relative overflow-hidden flex items-center gap-5">
          <div className="absolute top-0 right-0 w-44 h-44 bg-accent/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-xl -ml-10 -mb-10 pointer-events-none" />
          
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-3xl border border-white/10 flex-shrink-0">
            {currentStepData.icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black tracking-widest uppercase text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                Passo {step} de {totalSteps}
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight mt-1 truncate">{currentStepData.title}</h2>
            <p className="text-xs text-slate-400 font-medium truncate mt-0.5">{currentStepData.subtitle}</p>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 flex">
          {[...Array(totalSteps)].map((_, i) => (
            <div 
              key={i} 
              className={`h-full flex-1 transition-all duration-300 ${
                i < step ? 'bg-accent' : 'bg-slate-100'
              } ${i > 0 ? 'border-l border-white' : ''}`}
            />
          ))}
        </div>

        {/* Content Area */}
        <div className="p-8 flex-1 overflow-y-auto">
          {currentStepData.content}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 rounded-b-[36px]">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-2 px-5 py-3 text-xs font-black text-slate-600 hover:text-slate-900 transition-all bg-white hover:bg-slate-100 rounded-2xl border border-slate-200"
            >
              <ArrowLeft size={16} />
              Voltar
            </button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-2 px-6 py-3 text-xs font-black bg-accent text-white hover:bg-accent/90 transition-all rounded-2xl shadow-lg shadow-accent/10 ml-auto"
            >
              Avançar
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={isFinishing}
              className="flex items-center gap-2 px-8 py-3.5 text-xs font-black bg-emerald-600 text-white hover:bg-emerald-700 transition-all rounded-2xl shadow-lg shadow-emerald-600/10 ml-auto disabled:opacity-50"
            >
              {isFinishing ? (
                <span>Carregando...</span>
              ) : (
                <>
                  <Check size={16} />
                  Entendido, Começar!
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
