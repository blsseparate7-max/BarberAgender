import React, { useState, useEffect } from 'react';
import { Search, UserPlus, User, X, Check, Loader2 } from 'lucide-react';
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

  const filteredClients = clients.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.telefone || '').includes(searchTerm)
  ).slice(0, 5);

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
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
      className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
    >
      {!showNewForm ? (
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input 
              autoFocus
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none"
            />
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => onSelect({ id: '', name: 'Cliente Avulso' })}
              className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                  <User size={14} />
                </div>
                <span className="text-xs font-medium text-slate-600">Cliente Avulso</span>
              </div>
              {!currentClientId && <Check size={14} className="text-accent" />}
            </button>

            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 size={16} className="animate-spin text-slate-300" />
              </div>
            ) : filteredClients.map(c => (
              <button 
                key={c.uid}
                onClick={() => onSelect({ id: c.uid, name: c.nome })}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 text-left transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 bg-accent/5 rounded-full flex items-center justify-center text-accent">
                    <User size={14} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-primary truncate w-32">{c.nome}</p>
                    {c.telefone && <p className="text-[9px] text-muted">{c.telefone}</p>}
                  </div>
                </div>
                {currentClientId === c.uid && <Check size={14} className="text-accent" />}
              </button>
            ))}

            {searchTerm && filteredClients.length === 0 && !loading && (
              <p className="text-[10px] text-muted text-center py-4">Nenhum cliente encontrado.</p>
            )}
          </div>

          <div className="pt-2 border-t border-slate-50 flex items-center justify-between">
            <button 
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 text-[10px] font-bold text-accent hover:text-accent-hover"
            >
              <UserPlus size={12} />
              Novo Cliente
            </button>
            <button onClick={onClose} className="text-[10px] text-muted hover:text-red-500 font-bold uppercase tracking-wider">
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreateClient} className="p-4 space-y-4 animate-in slide-in-from-right duration-200">
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
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Cadastrar e Selecionar
          </button>
        </form>
      )}
    </motion.div>
  );
}
