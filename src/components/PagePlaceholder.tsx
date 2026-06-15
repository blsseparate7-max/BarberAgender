
import React from 'react';
import { motion } from 'motion/react';
import { Construction, ArrowLeft } from 'lucide-react';
import { TabId } from '../types';

interface PagePlaceholderProps {
  title: string;
  tabId: TabId;
  onBack?: () => void;
}

export function PagePlaceholder({ title, tabId, onBack }: PagePlaceholderProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: 'spring' }}
        className="w-24 h-24 bg-amber-50 rounded-3xl flex items-center justify-center text-amber-500 mb-8 border border-amber-100 shadow-sm"
      >
        <Construction size={48} strokeWidth={1.5} />
      </motion.div>
      
      <h2 className="text-3xl font-black text-primary mb-4 tracking-tight">
        {title} <span className="text-amber-500 italic">Em Breve</span>
      </h2>
      
      <p className="text-muted max-w-md mx-auto font-medium leading-relaxed mb-10">
        Estamos trabalhando para disponibilizar o módulo de <span className="font-bold text-slate-900">{title}</span>. 
        Este item já está mapeado em nosso plano de estabilização estrutural.
      </p>

      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-slate-800 transition-all active:scale-95 text-sm uppercase tracking-widest"
        >
          <ArrowLeft size={18} />
          Voltar ao Início
        </button>
      )}

      <div className="mt-12 text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em]">
        ID do Módulo: {tabId}
      </div>
    </div>
  );
}
