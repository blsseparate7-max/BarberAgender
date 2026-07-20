import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  Tag, 
  Percent, 
  Calendar, 
  CheckCircle, 
  X, 
  Loader2 
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { toast } from 'sonner';
import { useTenant } from '../contexts/TenantContext';

interface Coupon {
  id: string;
  code: string;
  discount: number;
  expiresAt: string;
  active: boolean;
  tenantId?: string;
}

export function CuponsDesconto() {
  const { tenantId } = useTenant();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(10);
  const [couponExpires, setCouponExpires] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    // 1. Fetch coupons list filtered by tenantId
    const q = query(
      collection(db, 'cupons_desconto'), 
      where('tenantId', '==', tenantId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Coupon));
      docs.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setCoupons(docs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId]);

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode || !couponExpires) {
      toast.error('Preencha os dados do cupom.');
      return;
    }
    const cleanCode = couponCode.toUpperCase().replace(/\s+/g, '');
    try {
      await addDoc(collection(db, 'cupons_desconto'), {
        tenantId,
        code: cleanCode,
        discount: Number(couponDiscount),
        expiresAt: couponExpires,
        active: true
      });
      toast.success(`Cupom ${cleanCode} ativado com sucesso!`);
      setShowModal(false);
      setCouponCode('');
      setCouponExpires('');
    } catch (err) {
      toast.error('Erro ao salvar cupom.');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (confirm('Deseja realmente remover e desativar este cupom de desconto?')) {
      try {
        await deleteDoc(doc(db, 'cupons_desconto', id));
        toast.success('Cupom removido.');
      } catch (err) {
        toast.error('Erro ao deletar cupom.');
      }
    }
  };

  return (
    <div className="space-y-8 pb-12 text-primary font-sans">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">Cupons de Desconto</h1>
          <p className="text-muted text-sm">Gere cupons promocionais para fidelizar clientes no fechamento de comandas.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase"
        >
          <Plus size={16} />
          <span>Novo Cupom</span>
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-accent w-10 h-10" />
        </div>
      ) : coupons.length === 0 ? (
        <div className="py-16 text-center bg-slate-50 border border-dashed rounded-[2rem] text-sm italic text-muted">
          Nenhum cupom de desconto ativo. Crie um novo acima para começar!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {coupons.map(cp => {
            const isExpired = new Date(cp.expiresAt) < new Date();
            return (
              <div key={cp.id} className="relative bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between hover:border-accent/15 transition-all">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full ${
                      isExpired ? 'bg-red-50 text-red-650' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      {isExpired ? 'Expirado' : 'Cupom Ativo'}
                    </span>
                    <button onClick={() => handleDeleteCoupon(cp.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="text-center py-2 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <p className="text-lg font-black tracking-widest text-primary">{cp.code}</p>
                  </div>
                  
                  <div className="text-center">
                    <p className="text-2xl font-black text-slate-800">{cp.discount}% OFF</p>
                    <p className="text-[10px] text-muted font-bold mt-1">Válido para qualquer serviço</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-2 text-[10px] text-muted font-bold justify-between">
                  <span className="truncate">Vence: {new Date(cp.expiresAt).toLocaleDateString('pt-BR')}</span>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coupon Creation Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleCreateCoupon}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <h3 className="text-xl font-black uppercase tracking-tight">Criar Cupom Desconto</h3>
                <button type="button" onClick={() => setShowModal(false)} className="bg-slate-100 p-2 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Código do Cupom</label>
                  <input 
                    type="text" 
                    value={couponCode} 
                    onChange={e => setCouponCode(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold"
                    placeholder="Ex: QUERO15"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Desconto %</label>
                    <input 
                      type="number" 
                      value={couponDiscount} 
                      onChange={e => setCouponDiscount(Number(e.target.value))}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold font-semibold">Data Expiração</label>
                    <input 
                      type="date" 
                      value={couponExpires}  
                      onChange={e => setCouponExpires(e.target.value)}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl cursor-text font-bold"
                    />
                  </div>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-primary text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                Gerar e Ativar Cupom
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
