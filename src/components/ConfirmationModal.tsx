
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary'
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white border border-slate-200 w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden"
          >
            <div className="p-8 text-center space-y-6">
              <div className={`w-16 h-16 rounded-3xl mx-auto flex items-center justify-center border shadow-sm ${
                variant === 'danger' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-accent/5 text-accent border-accent/10'
              }`}>
                <AlertCircle size={32} />
              </div>
              
              <div>
                <h3 className="text-xl font-black text-primary tracking-tight mb-2 uppercase">{title}</h3>
                <p className="text-muted text-sm font-medium leading-relaxed">
                  {description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="py-4 border border-slate-200 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all active:scale-95"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 shadow-lg ${
                    variant === 'danger' 
                      ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20' 
                      : 'bg-primary hover:bg-slate-800 shadow-primary/20'
                  }`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
