import React, { useState, useEffect } from 'react';
import { Scissors, Check, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { UserProfile } from '../../types';
import { userService } from '../../services/userService';

interface QuickProfSelectorProps {
  currentProfId: string;
  onSelect: (barber: { id: string, name: string }) => void;
  onClose: () => void;
}

export function QuickProfSelector({ currentProfId, onSelect, onClose }: QuickProfSelectorProps) {
  const [barbers, setBarbers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBarbers();
  }, []);

  const loadBarbers = async () => {
    setLoading(true);
    try {
      const data = await userService.getAllBarbers();
      setBarbers(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden"
    >
      <div className="p-3 border-b border-slate-50 flex items-center justify-between">
        <h4 className="text-[10px] font-black text-muted uppercase tracking-widest pl-1">Trocar Profissional</h4>
        <button onClick={onClose} className="text-muted hover:text-red-500">
          <X size={14} />
        </button>
      </div>

      <div className="p-2 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : barbers.map(b => (
          <button 
            key={b.uid}
            onClick={() => onSelect({ id: b.uid, name: b.nome })}
            className={`w-full flex items-center justify-between p-3 rounded-xl transition-all ${
              currentProfId === b.uid ? 'bg-accent/5' : 'hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                currentProfId === b.uid ? 'bg-white border-accent/20 text-accent' : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}>
                <Scissors size={14} />
              </div>
              <span className={`text-xs font-bold ${currentProfId === b.uid ? 'text-accent' : 'text-primary'}`}>
                {b.nome}
              </span>
            </div>
            {currentProfId === b.uid && <Check size={14} className="text-accent" />}
          </button>
        ))}
        
        {barbers.length === 0 && !loading && (
          <p className="text-center py-6 text-xs text-muted">Nenhum profissional disponível.</p>
        )}
      </div>
    </motion.div>
  );
}
