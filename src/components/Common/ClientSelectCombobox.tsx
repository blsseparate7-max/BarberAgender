import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, User, Check, ChevronDown, ChevronUp, X, Phone, Plus, UserPlus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { UserProfile } from '../../types';
import { userService } from '../../services/userService';

interface ClientSelectComboboxProps {
  clients: UserProfile[];
  selectedClientId: string;
  onSelectClient: (clientId: string, clientName: string) => void;
  placeholder?: string;
  allowAvulso?: boolean;
  avulsoLabel?: string;
  avulsoValue?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ClientSelectCombobox({
  clients,
  selectedClientId,
  onSelectClient,
  placeholder = 'Selecione ou busque o cliente...',
  allowAvulso = true,
  avulsoLabel = '★ Sem Cadastro (Avulso) ★',
  avulsoValue = 'sem_cadastro',
  required = false,
  disabled = false,
  className = ''
}: ClientSelectComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(5);
  
  // Quick Create Client States
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickObs, setQuickObs] = useState('');
  const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleOpenQuickCreate = () => {
    // Pre-fill name if query looks like name, or phone if numbers
    if (searchQuery.trim()) {
      if (/^\d+$/.test(searchQuery.replace(/\D/g, '')) && searchQuery.replace(/\D/g, '').length >= 8) {
        setQuickPhone(searchQuery);
        setQuickName('');
      } else {
        setQuickName(searchQuery);
        setQuickPhone('');
      }
    } else {
      setQuickName('');
      setQuickPhone('');
    }
    setQuickObs('');
    setIsQuickCreateOpen(true);
  };

  const handleCreateQuickClient = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e && 'preventDefault' in e) {
      e.preventDefault();
    }
    if (!quickName.trim()) {
      toast.error('Informe o nome do cliente!');
      return;
    }

    // Check duplicate phone if provided
    const cleanPhone = quickPhone.replace(/\D/g, '');
    if (cleanPhone) {
      const existing = clients.find(c => (c.telefone || c.phone || '').replace(/\D/g, '') === cleanPhone);
      if (existing) {
        toast.success(`Cliente "${existing.nome}" encontrado! Selecionado automaticamente.`);
        onSelectClient(existing.uid || existing.id, existing.nome);
        setIsQuickCreateOpen(false);
        setIsOpen(false);
        return;
      }
    }

    setIsSubmittingQuick(true);
    try {
      const newClient = await userService.createUser({
        nome: quickName.trim(),
        telefone: quickPhone.trim(),
        phone: quickPhone.trim(),
        observacoes: quickObs.trim(),
        tipo: 'cliente',
        ativo: true
      });

      toast.success(`Cliente ${quickName.trim()} cadastrado e selecionado!`);
      onSelectClient(newClient.uid, newClient.nome);
      setIsQuickCreateOpen(false);
      setIsOpen(false);
    } catch (error: any) {
      console.error('Erro ao cadastrar cliente rápido:', error);
      toast.error(error.message || 'Erro ao cadastrar cliente.');
    } finally {
      setIsSubmittingQuick(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setVisibleCount(5); // Reset visible count to 5 on open
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Selected client details
  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    if (selectedClientId === avulsoValue || selectedClientId === 'avulso' || selectedClientId === 'sem_cadastro') {
      return { uid: selectedClientId, nome: avulsoLabel, isAvulso: true };
    }
    return clients.find(c => c.uid === selectedClientId || c.id === selectedClientId) || null;
  }, [selectedClientId, clients, avulsoValue, avulsoLabel]);

  // Filter clients based on search query
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const term = searchQuery.toLowerCase().trim();
    return clients.filter(c => {
      const nome = (c.nome || '').toLowerCase();
      const telefone = (c.telefone || '').replace(/\D/g, '');
      const cleanTerm = term.replace(/\D/g, '');
      const matchName = nome.includes(term);
      const matchPhone = cleanTerm ? telefone.includes(cleanTerm) : (c.telefone || '').toLowerCase().includes(term);
      return matchName || matchPhone;
    });
  }, [clients, searchQuery]);

  // Sliced clients based on visible count
  const displayedClients = useMemo(() => {
    return filteredClients.slice(0, visibleCount);
  }, [filteredClients, visibleCount]);

  const hasMore = filteredClients.length > visibleCount;
  const remainingCount = filteredClients.length - visibleCount;

  const handleShowMore = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVisibleCount(prev => prev + 10);
  };

  const handleSelect = (id: string, name: string) => {
    onSelectClient(id, name);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectClient('', '');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Hidden input for HTML form validation if required */}
      {required && (
        <input
          tabIndex={-1}
          required={required}
          value={selectedClientId || ''}
          onChange={() => {}}
          className="absolute inset-0 opacity-0 pointer-events-none h-0 w-0"
        />
      )}

      {/* Main Trigger Button */}
      <div
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full bg-slate-50 border rounded-xl py-3 pl-11 pr-10 text-sm transition-all cursor-pointer flex items-center justify-between select-none ${
          disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 border-slate-200' :
          isOpen ? 'ring-2 ring-accent/20 border-accent bg-white shadow-sm' :
          selectedClient ? 'border-slate-200 hover:border-slate-300 bg-white' : 'border-slate-100 hover:border-slate-200'
        }`}
      >
        <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${
          selectedClient ? 'text-accent' : 'text-slate-400'
        }`} size={18} />

        <div className="flex-1 truncate text-left">
          {selectedClient ? (
            <div className="flex items-center gap-2">
              <span className={`font-bold truncate ${
                (selectedClient as any).isAvulso ? 'text-indigo-600' : 'text-primary'
              }`}>
                {selectedClient.nome}
              </span>
              {(selectedClient as any).telefone && (
                <span className="text-xs text-muted font-medium shrink-0">
                  ({(selectedClient as any).telefone})
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400 font-medium">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {selectedClient && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-slate-100 transition-colors"
              title="Limpar seleção"
            >
              <X size={14} />
            </button>
          )}
          {isOpen ? (
            <ChevronUp size={18} className="text-slate-400" />
          ) : (
            <ChevronDown size={18} className="text-slate-400" />
          )}
        </div>
      </div>

      {/* Dropdown Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100000] overflow-hidden flex flex-col max-h-80"
          >
            {/* Search Input Box */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/50 shrink-0 space-y-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setVisibleCount(5); // Reset visible count to 5 on new search
                  }}
                  placeholder="Digitar nome ou telefone..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs text-primary font-medium focus:outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent shadow-inner transition-all"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Fast Quick Create Button */}
              <button
                type="button"
                onClick={handleOpenQuickCreate}
                className="w-full py-2 px-3 bg-gradient-to-r from-amber-500/10 via-amber-50 to-amber-100/60 hover:from-amber-500/20 hover:to-amber-200/80 text-amber-700 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 border border-amber-200/80 shadow-sm active:scale-98"
              >
                <UserPlus size={15} className="text-amber-600" />
                <span>➕ Cadastrar Novo Cliente Rápido</span>
              </button>
            </div>

            {/* Client List */}
            <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar flex-1">
              {/* Option: Avulso / Sem Cadastro */}
              {allowAvulso && !searchQuery.trim() && (
                <button
                  type="button"
                  onClick={() => handleSelect(avulsoValue, 'Sem Cadastro')}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all group ${
                    selectedClientId === avulsoValue || selectedClientId === 'sem_cadastro' || selectedClientId === 'avulso'
                      ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100'
                      : 'hover:bg-indigo-50/50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0">
                      ★
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-700">{avulsoLabel}</p>
                      <p className="text-[10px] text-indigo-500 font-medium">Atendimento rápido sem cadastro prévio</p>
                    </div>
                  </div>
                  {(selectedClientId === avulsoValue || selectedClientId === 'sem_cadastro' || selectedClientId === 'avulso') && (
                    <Check size={16} className="text-indigo-600 shrink-0" />
                  )}
                </button>
              )}

              {/* Displayed Clients */}
              {displayedClients.map((client, idx) => {
                const isSelected = selectedClientId === client.uid || selectedClientId === client.id;
                return (
                  <button
                    key={`combobox-client-${client.uid || client.id || idx}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(client.uid || client.id, client.nome)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-accent/10 text-accent font-bold border border-accent/20'
                        : 'hover:bg-slate-50 text-primary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-accent text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {(client.nome || 'C').charAt(0).toUpperCase()}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold truncate">{client.nome}</p>
                        {client.telefone && (
                          <div className="flex items-center gap-1 text-[10px] text-muted">
                            <Phone size={10} className="shrink-0" />
                            <span>{client.telefone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check size={16} className="text-accent shrink-0 ml-2" />}
                  </button>
                );
              })}

              {/* Empty Search Results */}
              {filteredClients.length === 0 && (
                <div className="py-6 text-center text-slate-400 space-y-2.5 px-4">
                  <User size={28} className="mx-auto text-slate-300" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Nenhum cliente encontrado</p>
                    <p className="text-[11px] text-slate-400">Deseja cadastrá-lo rapidamente agora?</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenQuickCreate}
                    className="py-2 px-3.5 bg-accent text-white font-black text-xs rounded-xl shadow-md hover:bg-accent/90 transition-all flex items-center justify-center gap-1.5 mx-auto active:scale-95"
                  >
                    <UserPlus size={14} />
                    <span>Cadastrar "{searchQuery.trim() || 'Novo Client'}"</span>
                  </button>
                </div>
              )}

              {/* "Ver mais" / "Mostrar mais" button */}
              {hasMore && (
                <div className="pt-2 pb-1 text-center">
                  <button
                    type="button"
                    onClick={handleShowMore}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-98"
                  >
                    <Plus size={14} />
                    <span>Ver mais (+{remainingCount} clientes)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer summary */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-[10px] text-muted flex items-center justify-between shrink-0 font-medium px-3.5">
              <span>Mostrando {displayedClients.length} de {filteredClients.length} clientes</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-primary font-bold uppercase tracking-wider"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Create Client Modal Overlay */}
      <AnimatePresence>
        {isQuickCreateOpen && (
          <div className="fixed inset-0 z-[100005] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 max-w-sm w-full space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-black">
                    <UserPlus size={18} />
                  </div>
                  <div>
                    <h3 className="font-black text-primary text-base leading-tight">Cadastro Rápido</h3>
                    <p className="text-[11px] text-muted font-medium">Adicione o cliente sem sair do agendamento</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickCreateOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div
                className="space-y-3.5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateQuickClient(e);
                  }
                }}
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nome Completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-primary focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent/15 outline-none transition-all"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    WhatsApp / Telefone <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="tel"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-primary focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent/15 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Observação <span className="text-slate-400 font-normal">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={quickObs}
                    onChange={(e) => setQuickObs(e.target.value)}
                    placeholder="Ex: Prefere corte tesoura..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-primary focus:bg-white focus:border-accent focus:ring-2 focus:ring-accent/15 outline-none transition-all"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQuickCreateOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateQuickClient}
                    disabled={isSubmittingQuick}
                    className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmittingQuick ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Salvando...</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Salvar & Selecionar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
