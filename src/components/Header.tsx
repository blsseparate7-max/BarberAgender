
import React, { useState, useEffect } from 'react';
import { Search, Bell, Menu, Unlock, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cashService } from '../services/cashService';
import { DailyCash } from '../types';

interface HeaderProps {
  setSidebarOpen: (open: boolean) => void;
  onProfileClick?: () => void;
}

export function Header({ setSidebarOpen, onProfileClick }: HeaderProps) {
  const { profile } = useAuth();
  const [currentCash, setCurrentCash] = useState<DailyCash | null>(null);

  useEffect(() => {
    if (profile?.tipo === 'admin' || profile?.tipo === 'gerente') {
      const unsubscribe = cashService.subscribeToCurrentCash((cash) => {
        setCurrentCash(cash);
      });
      return () => unsubscribe();
    }
  }, [profile?.tipo]);

  return (
    <header className="h-20 border-b border-slate-100 flex items-center justify-between px-6 md:px-10 sticky top-0 bg-white/80 backdrop-blur-md z-30">
      <div className="flex items-center gap-6">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="p-2.5 text-slate-500 hover:text-primary md:hidden bg-slate-50 rounded-xl border border-slate-100 shadow-sm transition-all active:scale-95"
        >
          <Menu size={24} />
        </button>
        <div className="relative hidden sm:block w-72 lg:w-[400px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar inteligência..." 
            className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-12 pr-6 text-sm focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-primary shadow-inner"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        {/* Status do Caixa para Admin/Gerente no Desktop e Tablet */}
        {(profile?.tipo === 'admin' || profile?.tipo === 'gerente') && (
          <div className="hidden md:flex items-center gap-2">
            {currentCash ? (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] uppercase font-black tracking-widest">Caixa Aberto</span>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-[10px] uppercase font-black tracking-widest">Caixa Fechado</span>
              </div>
            )}
          </div>
        )}

        <button className="p-3 text-slate-500 hover:text-primary transition-all relative bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-95">
          <Bell size={20} />
          <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-accent rounded-full border-2 border-white shadow-sm"></span>
        </button>
        
        <div className="h-8 w-[1px] bg-slate-100 mx-1 hidden md:block"></div>
        
        <div 
          onClick={onProfileClick}
          className="flex items-center gap-4 pl-2 group cursor-pointer"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-black text-primary leading-none mb-1.5 tracking-tight group-hover:text-accent transition-colors">{profile?.nome || 'Usuário'}</p>
            <p className="text-[10px] text-muted uppercase tracking-widest font-black opacity-70">{profile?.tipo || 'Perfil'}</p>
          </div>
          <div className="w-11 h-11 bg-primary rounded-2xl border-2 border-white flex-shrink-0 flex items-center justify-center font-black text-white text-base shadow-xl shadow-primary/10 group-hover:scale-105 transition-transform">
            {profile?.nome?.charAt(0) || 'U'}
          </div>
        </div>
      </div>
    </header>
  );
}
