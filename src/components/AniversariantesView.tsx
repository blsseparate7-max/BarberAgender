import React, { useState, useEffect } from 'react';
import { UserProfile, LoyaltyConfig } from '../types';
import { loyaltyService } from '../services/loyaltyService';
import { 
  Gift, 
  Cake, 
  Calendar, 
  MessageSquare, 
  CheckCircle2, 
  Sparkles, 
  Search, 
  Loader2, 
  Award, 
  Coins, 
  Settings,
  PartyPopper,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

interface AniversariantesViewProps {
  customers: UserProfile[];
  loyaltyConfig: LoyaltyConfig | null;
  onNavigateToConfig?: () => void;
  onReloadCustomers?: () => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export function getBirthdayInfo(rawDate?: string) {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const cleaned = rawDate.split('T')[0].trim();
  
  let day: number | null = null;
  let month: number | null = null;
  let year: number | undefined = undefined;

  // YYYY-MM-DD
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-');
    if (parts.length >= 3) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
  } 
  // DD/MM/YYYY
  else if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    if (parts.length >= 2) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      if (parts[2]) year = parseInt(parts[2], 10);
    }
  } else {
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      day = parsed.getDate();
      month = parsed.getMonth() + 1;
      year = parsed.getFullYear();
    }
  }

  if (!day || !month || isNaN(day) || isNaN(month)) return null;

  const currentYear = new Date().getFullYear();
  let age: number | null = null;
  if (year && !isNaN(year) && year > 1900 && year <= currentYear) {
    age = currentYear - year;
  }

  return { day, month, year, age };
}

export const AniversariantesView: React.FC<AniversariantesViewProps> = ({
  customers,
  loyaltyConfig,
  onNavigateToConfig,
  onReloadCustomers
}) => {
  const today = new Date();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentDay = today.getDate();
  const currentYear = today.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [searchTerm, setSearchTerm] = useState('');
  const [grantedMap, setGrantedMap] = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Filter customers that have valid birth dates
  const customersWithBirthdays = customers.map(c => {
    const birthRaw = c.birthDate || c.dataNascimento || (c as any).data_nascimento || (c as any).aniversario;
    const bInfo = getBirthdayInfo(birthRaw);
    return { ...c, birthdayInfo: bInfo };
  }).filter(c => c.birthdayInfo !== null);

  // Check which clients in selected month already received bonus
  useEffect(() => {
    let isMounted = true;
    const checkGrantedStatus = async () => {
      setLoadingInitial(true);
      const newGrantedMap: Record<string, boolean> = {};

      const monthList = customersWithBirthdays.filter(
        c => c.birthdayInfo && c.birthdayInfo.month === selectedMonth
      );

      for (const client of monthList) {
        if (!client.uid) continue;
        try {
          const isGranted = await loyaltyService.checkBirthdayBonusGranted(client.uid, currentYear);
          newGrantedMap[client.uid] = isGranted;
        } catch (err) {
          console.warn(`Error checking birthday bonus for ${client.uid}:`, err);
        }
      }

      if (isMounted) {
        setGrantedMap(prev => ({ ...prev, ...newGrantedMap }));
        setLoadingInitial(false);
      }
    };

    checkGrantedStatus();
    return () => { isMounted = false; };
  }, [selectedMonth, customers.length]);

  // Statistics
  const todayBirthdays = customersWithBirthdays.filter(
    c => c.birthdayInfo?.month === currentMonth && c.birthdayInfo?.day === currentDay
  );

  const monthBirthdays = customersWithBirthdays.filter(
    c => c.birthdayInfo?.month === selectedMonth
  ).sort((a, b) => (a.birthdayInfo?.day || 0) - (b.birthdayInfo?.day || 0));

  const filteredMonthList = monthBirthdays.filter(c => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (c.nome || '').toLowerCase().includes(term) ||
      (c.telefone || c.phone || '').includes(term)
    );
  });

  const isSaldoMode = loyaltyConfig?.loyaltyMode !== 'pontos';
  const bonusValueFormatted = isSaldoMode
    ? `R$ ${(loyaltyConfig?.birthdayBonusCashback ?? 10).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cashback`
    : `${loyaltyConfig?.birthdayBonusPoints ?? 100} Pontos`;

  const handleGrantBonus = async (client: UserProfile) => {
    if (!client.uid) return;

    setLoadingMap(prev => ({ ...prev, [client.uid]: true }));
    try {
      const customPts = loyaltyConfig?.birthdayBonusPoints ?? 100;
      const customCb = loyaltyConfig?.birthdayBonusCashback ?? 10;

      const result = await loyaltyService.grantBirthdayBonus(client.uid, customPts, customCb, currentYear);
      
      setGrantedMap(prev => ({ ...prev, [client.uid]: true }));
      
      const textCredited = isSaldoMode
        ? `+R$ ${result.cashback.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} Cashback`
        : `+${result.points} Pontos`;

      toast.success(`Presente de Aniversário (${textCredited}) creditado para ${client.nome}! 🎂🎉`);
      
      if (onReloadCustomers) {
        onReloadCustomers();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao creditar presente de aniversário.');
    } finally {
      setLoadingMap(prev => ({ ...prev, [client.uid]: false }));
    }
  };

  const handleSendWhatsApp = (client: UserProfile) => {
    const rawPhone = client.telefone || client.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');

    if (!cleanPhone) {
      toast.error('Este cliente não possui telefone/WhatsApp cadastrado.');
      return;
    }

    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const clientName = (client.nome || 'Cliente').split(' ')[0];

    let customMsg = loyaltyConfig?.birthdayBonusMessage || 
      'Parabéns pelo seu aniversário, {nome}! 🎂🎁 Ganhou um presente especial no nosso Clube de Fidelidade. Venha celebrar conosco!';

    customMsg = customMsg.replace(/{nome}/g, clientName);
    if (!customMsg.includes(bonusValueFormatted)) {
      customMsg += `\n\n🎁 Seu presente: ${bonusValueFormatted}!`;
    }

    const encodedMsg = encodeURIComponent(customMsg);
    window.open(`https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedMsg}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Banner de Destaque se houver aniversariante HOJE */}
      {todayBirthdays.length > 0 && (
        <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="absolute -right-6 -bottom-6 opacity-15 pointer-events-none">
            <Cake size={180} />
          </div>
          <div className="space-y-2 relative z-10 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-black uppercase tracking-wider">
              <PartyPopper size={14} />
              <span>Aniversariante(s) de Hoje!</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">
              {todayBirthdays.length === 1 
                ? `${todayBirthdays[0].nome} está fazendo aniversário hoje!`
                : `Temos ${todayBirthdays.length} clientes comemorando hoje!`}
            </h2>
            <p className="text-white/90 text-xs max-w-xl font-medium">
              Envie parabéns no WhatsApp e credite o presente do Clube de Fidelidade para garantir o retorno na barbearia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 relative z-10 shrink-0">
            {todayBirthdays.map(c => (
              <button
                key={c.uid}
                onClick={() => handleSendWhatsApp(c)}
                className="px-4 py-2.5 bg-white text-rose-600 rounded-2xl font-black text-xs hover:bg-rose-50 transition-all shadow-md flex items-center gap-2 active:scale-95"
              >
                <MessageSquare size={14} />
                <span>Parabéns {c.nome.split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards de Métricas e Regras */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Aniversariantes de Hoje */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-pink-50 border border-pink-100 flex items-center justify-center text-pink-600 shrink-0">
            <Cake size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aniversariantes Hoje</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{todayBirthdays.length}</p>
          </div>
        </div>

        {/* Card 2: Aniversariantes no Mês Selecionado */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shrink-0">
            <Calendar size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Em {MONTH_NAMES[selectedMonth - 1]}</p>
            <p className="text-2xl font-black text-slate-900 mt-0.5">{monthBirthdays.length} clientes</p>
          </div>
        </div>

        {/* Card 3: Regra de Bônus de Aniversário */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Gift size={24} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Presente do Clube</p>
              <p className="text-sm font-black text-slate-900 mt-0.5">{bonusValueFormatted}</p>
            </div>
          </div>
          {onNavigateToConfig && (
            <button
              onClick={onNavigateToConfig}
              title="Configurar Regras de Aniversário"
              className="p-2.5 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-xl transition-all"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Filtro de Meses e Barra de Busca */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Seletor de Mês (Abas/Scroll) */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 lg:pb-0 scrollbar-none w-full lg:w-auto">
            {MONTH_NAMES.map((mName, idx) => {
              const mNum = idx + 1;
              const isSelected = selectedMonth === mNum;
              const isCurrentRealMonth = currentMonth === mNum;

              return (
                <button
                  key={mName}
                  onClick={() => setSelectedMonth(mNum)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  <span>{mName.slice(0, 3)}</span>
                  {isCurrentRealMonth && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-pink-400' : 'bg-pink-500'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Busca por Nome */}
          <div className="relative w-full lg:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar aniversariante..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Lista de Aniversariantes do Mês */}
      {filteredMonthList.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-3">
          <div className="w-16 h-16 bg-pink-50 rounded-2xl mx-auto flex items-center justify-center text-pink-400">
            <Cake size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-800">Nenhum aniversariante encontrado em {MONTH_NAMES[selectedMonth - 1]}</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Certifique-se de que a data de nascimento está cadastrada no perfil dos clientes para exibir nesta lista.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMonthList.map(client => {
            const b = client.birthdayInfo!;
            const isToday = b.month === currentMonth && b.day === currentDay;
            const isGranted = grantedMap[client.uid || ''];
            const isLoadingBonus = loadingMap[client.uid || ''];

            const formattedDayMonth = `${String(b.day).padStart(2, '0')}/${String(b.month).padStart(2, '0')}`;

            return (
              <div 
                key={client.uid || client.id} 
                className={`bg-white border rounded-3xl p-5 shadow-xs transition-all relative overflow-hidden flex flex-col justify-between gap-4 ${
                  isToday 
                    ? 'border-pink-300 ring-2 ring-pink-500/10 bg-gradient-to-b from-pink-50/20 to-white' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {client.fotoUrl || client.avatarUrl || client.foto ? (
                        <img 
                          src={client.fotoUrl || client.avatarUrl || client.foto} 
                          alt={client.nome} 
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-400 to-purple-600 text-white font-black text-base flex items-center justify-center shadow-xs">
                          {client.nome ? client.nome.charAt(0).toUpperCase() : 'C'}
                        </div>
                      )}
                      {isToday && (
                        <span className="absolute -top-1 -right-1 text-base animate-bounce">
                          🎂
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 line-clamp-1">{client.nome}</h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {client.telefone || client.phone || 'Sem telefone'}
                      </p>
                    </div>
                  </div>

                  {/* Badge da Data */}
                  <div className={`px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0 ${
                    isToday 
                      ? 'bg-pink-600 text-white shadow-xs' 
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {isToday ? 'É HOJE! 🎉' : formattedDayMonth}
                  </div>
                </div>

                {/* Detalhes de Idade / Saldo do Cliente */}
                <div className="bg-slate-50/80 rounded-2xl p-3 border border-slate-100/80 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Cake size={14} className="text-pink-500" />
                    <span>{b.age ? `${b.age} anos` : 'Dia ' + b.day}</span>
                  </span>
                  <span className="flex items-center gap-1 text-slate-700 font-bold">
                    {isSaldoMode ? (
                      <>
                        <Coins size={14} className="text-amber-500" />
                        <span>R$ {(client.cashback || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </>
                    ) : (
                      <>
                        <Award size={14} className="text-indigo-500" />
                        <span>{client.pontos ?? client.points ?? 0} pts</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Status do Bônus de Aniversário */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {isGranted ? (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded-xl text-xs font-black w-full justify-center">
                      <CheckCircle2 size={14} />
                      <span>Bônus Concedido ({currentYear})</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGrantBonus(client)}
                      disabled={isLoadingBonus}
                      className="flex-1 bg-pink-600 hover:bg-pink-700 text-white rounded-xl py-2 px-3 text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 active:scale-95"
                    >
                      {isLoadingBonus ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <>
                          <Gift size={14} />
                          <span>Dar Presente</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => handleSendWhatsApp(client)}
                    title="Enviar Parabéns no WhatsApp"
                    className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200/60 rounded-xl transition-all font-bold shrink-0 active:scale-95 flex items-center gap-1 text-xs"
                  >
                    <MessageSquare size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
