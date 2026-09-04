import React, { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus, User, X, Check, Loader2, Plus, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile } from '../../types';
import { userService } from '../../services/userService';
import { toast } from 'sonner';

interface QuickClientSelectorProps {
  currentClientId: string;
  onSelect: (client: { id: string, name: string }) => void;
  onClose: () => void;
}

export function QuickClientSelector({ currentClientId, onSelect, onClose }: QuickClientSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await userService.getAllClients();
      setClients(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const term = searchTerm.toLowerCase().trim();
    const cleanTerm = term.replace(/\D/g, '');
    return clients.filter(c => {
      const nome = (c.nome || '').toLowerCase();
      const telefone = (c.telefone || '').replace(/\D/g, '');
      const matchName = nome.includes(term);
      const matchPhone = cleanTerm ? telefone.includes(cleanTerm) : (c.telefone || '').toLowerCase().includes(term);
      return matchName || matchPhone;
    });
  }, [clients, searchTerm]);

  const displayedClients = filteredClients.slice(0, visibleCount);
  const hasMore = filteredClients.length > visibleCount;
  const remainingCount = filteredClients.length - visibleCount;

  const handleCreateClient = async (e?: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    if (e && 'preventDefault' in e) e.preventDefault();
    if (!newName.trim()) return;
    
    setLoading(true);
    try {
      const newClient = await userService.createUser({
        nome: newName,
        telefone: newPhone,
        tipo: 'cliente'
      });
      onSelect({ id: newClient.uid, name: newClient.nome });
      toast.success("Cliente cadastrado e selecionado.");
    } catch (error) {
      toast.error("Erro ao cadastrar cliente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
    >
      {!showNewForm ? (
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input 
              autoFocus
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setVisibleCount(5);
              }}
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
            {!searchTerm.trim() && (
              <button 
                onClick={() => onSelect({ id: '', name: 'Cliente Avulso' })}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors ${
                  !currentClientId ? 'bg-indigo-50/70 border border-indigo-100 font-bold' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xs">
                    ★
                  </div>
                  <div>
                    <span className="text-xs font-bold text-indigo-700">Cliente Avulso</span>
                    <p className="text-[9px] text-indigo-500 font-medium">Sem cadastro prévio</p>
                  </div>
                </div>
                {!currentClientId && <Check size={14} className="text-indigo-600" />}
              </button>
            )}

            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 size={16} className="animate-spin text-slate-300" />
              </div>
            ) : displayedClients.map((c, cIdx) => (
              <button 
                key={`qcli-opt-${c.uid || cIdx}-${cIdx}`}
                onClick={() => onSelect({ id: c.uid, name: c.nome })}
                className={`w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-left transition-colors ${
                  currentClientId === c.uid ? 'bg-accent/10 border border-accent/20' : ''
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <div className="w-7 h-7 bg-accent/10 rounded-full flex items-center justify-center text-accent shrink-0 text-xs font-bold">
                    {(c.nome || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-primary truncate">{c.nome}</p>
                    {c.telefone && (
                      <div className="flex items-center gap-1 text-[9px] text-muted">
                        <Phone size={9} />
                        <span>{c.telefone}</span>
                      </div>
                    )}
                  </div>
                </div>
                {currentClientId === c.uid && <Check size={14} className="text-accent shrink-0 ml-2" />}
              </button>
            ))}

            {searchTerm && filteredClients.length === 0 && !loading && (
              <div className="text-center py-4 text-slate-400 space-y-1">
                <p className="text-xs font-bold">Nenhum cliente encontrado.</p>
                <p className="text-[10px]">Tente outro nome ou cadastre abaixo.</p>
              </div>
            )}

            {/* Ver Mais button */}
            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount(prev => prev + 10)}
                  className="w-full py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                >
                  <Plus size={12} />
                  <span>Ver mais (+{remainingCount} clientes)</span>
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
            <button 
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-accent hover:text-accent-hover"
            >
              <UserPlus size={13} />
              Novo Cliente
            </button>
            <button onClick={onClose} className="text-[10px] text-muted hover:text-red-500 font-bold uppercase tracking-wider">
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleCreateClient(e);
            }
          }}
          className="p-4 space-y-4 animate-in slide-in-from-right duration-200"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-primary uppercase tracking-wider">Novo Cliente</h4>
            <button type="button" onClick={() => setShowNewForm(false)} className="text-muted hover:text-primary">
              <X size={14} />
            </button>
          </div>
          
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-muted uppercase tracking-widest ml-1">Nome Completo</label>
              <input 
                autoFocus
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent"
                placeholder="Ex: João Silva"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-muted uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
              <input 
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-lg text-xs outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent"
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <button 
            type="button"
            onClick={handleCreateClient}
            disabled={loading}
            className="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Cadastrar e Selecionar
          </button>
        </div>
      )}
    </motion.div>
  );
}
