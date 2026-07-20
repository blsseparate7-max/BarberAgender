
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, X, ChevronRight } from 'lucide-react';

interface InputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  description: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: string;
  onChange?: (value: string) => void;
}

export function InputModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  placeholder = 'Digite aqui...',
  defaultValue = '',
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  type = 'text',
  onChange
}: InputModalProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  const onChangeRef = React.useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (onChangeRef.current) onChangeRef.current(value);
  }, [value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    onClose();
  };

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
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black text-primary tracking-tight uppercase">{title}</h3>
                <p className="text-muted text-xs font-medium leading-relaxed">
                  {description}
                </p>
              </div>

              <div className="space-y-1">
                <input
                  autoFocus
                  type={type}
                  value={value}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-primary focus:outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent shadow-inner outline-none font-bold text-center"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-4 border border-slate-200 text-muted rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-50 transition-all active:scale-95"
                >
                  {cancelLabel}
                </button>
                <button
                  type="submit"
                  className="py-4 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  {confirmLabel}
                  <ChevronRight size={14} />
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
