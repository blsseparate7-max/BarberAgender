import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles,
  Plus, 
  Trash2, 
  Search, 
  Users, 
  Award, 
  Percent, 
  Calendar,
  Speaker,
  FileText,
  MousePointerClick,
  Loader2,
  X
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { toast } from 'sonner';

interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
  category: string;
}

interface PromoCampaign {
  id: string;
  name: string;
  discount: number;
  targetGroup: string;
  expiresAt: string;
}

export function NoticiasPromocoes() {
  const [activeTab, setActiveTab] = useState<'news' | 'groups'>('news');
  const [news, setNews] = useState<Announcement[]>([]);
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Announcement state
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsContent, setNewsContent] = useState('');
  const [newsCategory, setNewsCategory] = useState('Geral');

  // Promo state
  const [showPromoModal, setShowPromoModal] = useState(false);
  const [promoName, setPromoName] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(15);
  const [promoTarget, setPromoTarget] = useState('Todos');
  const [promoExpires, setPromoExpires] = useState('');

  useEffect(() => {
    // 1. news
    const qNews = query(collection(db, 'noticias_noticias'), orderBy('date', 'desc'));
    const unsubNews = onSnapshot(qNews, (snap) => {
      setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement)));
    });

    // 2. campaigns
    const qCampaigns = query(collection(db, 'noticias_campanhas'), orderBy('expiresAt', 'asc'));
    const unsubC = onSnapshot(qCampaigns, (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as PromoCampaign)));
    });

    // 3. clients
    userService.getAllClients().then(setClients).catch(console.error);

    setLoading(false);

    return () => {
      unsubNews();
      unsubC();
    };
  }, []);

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle || !newsContent) {
      toast.error('Preencha todos os campos!');
      return;
    }
    try {
      await addDoc(collection(db, 'noticias_noticias'), {
        title: newsTitle,
        content: newsContent,
        category: newsCategory,
        date: new Date().toISOString()
      });
      toast.success('Notícia/Novidade publicada com sucesso!');
      setShowNewsModal(false);
      setNewsTitle('');
      setNewsContent('');
    } catch (err) {
      toast.error('Erro ao postar notícia.');
    }
  };

  const handleDeleteNews = async (id: string) => {
    if (confirm('Deseja de fato remover essa postagem?')) {
      try {
        await deleteDoc(doc(db, 'noticias_noticias', id));
        toast.success('Notícia removida.');
      } catch (err) {
        toast.error('Erro ao deletar.');
      }
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoName || !promoExpires) {
      toast.error('Preencha os campos da campanha!');
      return;
    }
    try {
      await addDoc(collection(db, 'noticias_campanhas'), {
        name: promoName,
        discount: Number(promoDiscount),
        targetGroup: promoTarget,
        expiresAt: promoExpires
      });
      toast.success('Campanha de promoção agendada!');
      setShowPromoModal(false);
      setPromoName('');
      setPromoExpires('');
    } catch (err) {
      toast.error('Erro ao programar promoção.');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (confirm('Remover campanha promocional?')) {
      try {
        await deleteDoc(doc(db, 'noticias_campanhas', id));
        toast.success('Campanha arquivada.');
      } catch (err) {
        toast.error('Erro ao deletar campanha.');
      }
    }
  };

  // Group segmentation logic
  const topSpenders = clients.filter(c => (c.total_gasto || c.totalSpent || 0) > 300);
  const inactiveClients = clients.filter(c => !c.ativo);
  const newClients = clients.slice(0, 5); // Simplistic proxy

  return (
    <div className="space-y-8 pb-12 text-primary font-sans">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">Notícias, Promoções & Segmentação</h1>
          <p className="text-muted text-sm">Divulgue novidades e configure campanhas com grupos focados.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowNewsModal(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase"
          >
            <Plus size={16} />
            <span>Nova Notícia</span>
          </button>
          <button 
            onClick={() => setShowPromoModal(true)}
            className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase shadow-md shadow-accent/15"
          >
            <Sparkles size={16} />
            <span>Agendar Campanha</span>
          </button>
        </div>
      </header>

      {/* Tab select bar */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 border border-slate-200 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('news')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
            activeTab === 'news' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'
          }`}
        >
          1. Novidades & Notícias
        </button>
        <button 
          onClick={() => setActiveTab('groups')}
          className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${
            activeTab === 'groups' ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'
          }`}
        >
          2. Segmentos de Clientes & Campanhas
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-accent w-10 h-10" />
        </div>
      ) : activeTab === 'news' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {news.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-slate-50 border border-dashed rounded-3xl text-sm italic text-muted">
              Nenhuma notícia ou promoção publicada recentemente.
            </div>
          ) : (
            news.map(item => (
              <div key={item.id} className="bg-white border p-6 rounded-[2rem] shadow-sm flex flex-col justify-between hover:border-accent/15 transition-all">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="bg-blue-100 text-blue-800 text-[9px] font-black uppercase px-2.5 py-1 rounded-full">
                      {item.category}
                    </span>
                    <button onClick={() => handleDeleteNews(item.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <h3 className="text-lg font-black text-primary leading-tight">{item.title}</h3>
                  <p className="text-xs text-muted font-semibold leading-relaxed">{item.content}</p>
                </div>
                <div className="mt-6 pt-4 border-t text-[10px] text-muted font-bold flex justify-between items-center">
                  <span>BarberElite News</span>
                  <span>Publicado em: {new Date(item.date).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Quick Segment Statistics Box */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl">
              <p className="text-[10px] text-muted uppercase font-black">Base Total</p>
              <p className="text-2xl font-black mt-1">{clients.length} clientes</p>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-5 rounded-2xl">
              <p className="text-[10px] text-amber-800 uppercase font-black">Segmento Inativos (Soft)</p>
              <p className="text-2xl font-black mt-1 text-amber-700">{inactiveClients.length} clientes</p>
            </div>
            <div className="bg-purple-50 border border-purple-100 p-5 rounded-2xl">
              <p className="text-[10px] text-purple-800 uppercase font-black">VVIPs Spending &gt; R$300</p>
              <p className="text-2xl font-black mt-1 text-purple-700">{topSpenders.length} clientes</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl">
              <p className="text-[10px] text-emerald-805 uppercase font-black">Novos Registros</p>
              <p className="text-2xl font-black mt-1 text-emerald-700">{newClients.length} neste mês</p>
            </div>
          </div>

          <div className="bg-white border rounded-[2rem] p-6 shadow-sm space-y-6">
            <div className="border-b pb-4">
              <h3 className="text-sm font-black uppercase text-slate-800 tracking-wider">Campanhas Ativos e Vales-Desconto</h3>
              <p className="text-xs text-muted font-bold mt-0.5">Campanhas programadas para fatias específicas de usuários</p>
            </div>

            {campaigns.length === 0 ? (
              <div className="py-12 text-center text-sm italic text-muted">Ainda não há campanhas ativas. Programe uma acima!</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {campaigns.map(c => (
                  <div key={c.id} className="bg-white border rounded-2xl p-5 shadow-inner border-slate-100 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="bg-purple-100 text-purple-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-full">
                          {c.targetGroup}
                        </span>
                        <button onClick={() => handleDeleteCampaign(c.id)} className="text-slate-300 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <h4 className="font-black text-base text-primary mt-3">{c.name}</h4>
                      <p className="text-xs text-muted font-bold mt-1">Desconto Aplicado: {c.discount}% OFF automático</p>
                    </div>
                    <p className="text-[10px] text-muted font-black uppercase mt-4 pt-2 border-t text-right">
                      Expira: {new Date(c.expiresAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* news modal */}
      <AnimatePresence>
        {showNewsModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleCreateNews}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <h3 className="text-xl font-black uppercase tracking-tight">Postar Notícia</h3>
                <button type="button" onClick={() => setShowNewsModal(false)} className="bg-slate-100 p-2 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Título da Notícia</label>
                  <input 
                    type="text" 
                    value={newsTitle} 
                    onChange={e => setNewsTitle(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold"
                    placeholder="Ex: Novo horário de funcionamento"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Categoria</label>
                  <select 
                    value={newsCategory}
                    onChange={e => setNewsCategory(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="Geral">Notícia Geral</option>
                    <option value="Promoção">Promoção do Mês</option>
                    <option value="Aviso">Aviso Urgente</option>
                    <option value="Evento">Evento Extra</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Corpo / Conteúdo</label>
                  <textarea 
                    rows={4}
                    value={newsContent} 
                    onChange={e => setNewsContent(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold leading-relaxed"
                    placeholder="Ex: A Barbearia agora passará a atender..."
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-primary text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                Publicar Canal Notícias
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* campaign modal */}
      <AnimatePresence>
        {showPromoModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleCreatePromo}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <h3 className="text-xl font-black uppercase tracking-tight">Criar Nova Campanha</h3>
                <button type="button" onClick={() => setShowPromoModal(false)} className="bg-slate-100 p-2 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Nome da Campanha</label>
                  <input 
                    type="text" 
                    value={promoName} 
                    onChange={e => setPromoName(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold"
                    placeholder="Ex: Campanha Retorno VVIP"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Porcentagem Desconto %</label>
                    <input 
                      type="number" 
                      value={promoDiscount} 
                      onChange={e => setPromoDiscount(Number(e.target.value))}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Expiração</label>
                    <input 
                      type="date" 
                      value={promoExpires} 
                      onChange={e => setPromoExpires(e.target.value)}
                      className="w-full bg-slate-50 border p-3.5 rounded-xl cursor-text font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Público de Clientes Destino</label>
                  <select 
                    value={promoTarget}
                    onChange={e => setPromoTarget(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl font-bold cursor-pointer"
                  >
                    <option value="Todos">Todos os clientes cadastrados</option>
                    <option value="Inativos">Clientes Inativos</option>
                    <option value="VIPs">Clientes Spenders VIP (&gt; R$300)</option>
                    <option value="Novos">Novos Clientes (Último mês)</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-accent text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-accent/90 transition-all shadow-xl active:scale-95"
              >
                Ativar Campanha Comercial
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
