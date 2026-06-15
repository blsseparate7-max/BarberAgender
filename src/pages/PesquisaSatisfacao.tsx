import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Star, 
  Smile, 
  Frown, 
  Meh, 
  Plus, 
  Trash2, 
  TrendingUp, 
  ThumbsUp, 
  MessageSquare,
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
import { toast } from 'sonner';

interface SurveyQuestion {
  id: string;
  title: string;
}

interface SurveyResponse {
  id: string;
  clientName: string;
  score: number; // 1-10 NPS rating or 1-5 ratings
  comment: string;
  submittedAt: string;
}

export function PesquisaSatisfacao() {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // States for adding question
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionTitle, setQuestionTitle] = useState('');

  // Pre-seed mock answer if empty
  useEffect(() => {
    // 1. Fetch questions
    const q1 = query(collection(db, 'pesquisa_perguntas'), orderBy('title', 'asc'));
    const unsubQ = onSnapshot(q1, (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SurveyQuestion)));
    });

    // 2. Fetch responses
    const q2 = query(collection(db, 'pesquisa_respostas'), orderBy('submittedAt', 'desc'));
    const unsubR = onSnapshot(q2, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SurveyResponse));
      setResponses(data);
      setLoading(false);

      if (data.length === 0) {
        // Seed database with sample real reviews to showcase dashboards
        const sampleReviews = [
          { clientName: 'Roberto Carlos', score: 10, comment: 'Corte perfeito e excelente atendimento! O barbeiro super pontual.', submittedAt: new Date().toISOString() },
          { clientName: 'Maurício Souza', score: 9, comment: 'Estacionamento fácil e cerveja gelada. Recomendo muito.', submittedAt: new Date().toISOString() },
          { clientName: 'Felipe Camargo', score: 8, comment: 'Ambiente aconchegante, o serviço foi ótimo.', submittedAt: new Date().toISOString() },
          { clientName: 'Igor Santos', score: 5, comment: 'Atrasou 10 minutos mas gostei do cabelo.', submittedAt: new Date().toISOString() }
        ];
        sampleReviews.forEach(sr => {
          addDoc(collection(db, 'pesquisa_respostas'), sr);
        });
      }
    });

    return () => {
      unsubQ();
      unsubR();
    };
  }, []);

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionTitle.trim()) {
      toast.error('Preencha o texto da pergunta.');
      return;
    }
    try {
      await addDoc(collection(db, 'pesquisa_perguntas'), {
        title: questionTitle.trim()
      });
      toast.success('Pergunta adicionada para envio aos clientes!');
      setShowQuestionModal(false);
      setQuestionTitle('');
    } catch (err) {
      toast.error('Erro ao salvar pergunta.');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (confirm('Excluir esta pergunta do formulário ativo?')) {
      try {
        await deleteDoc(doc(db, 'pesquisa_perguntas', id));
        toast.success('Pergunta removida.');
      } catch (err) {
        toast.error('Erro ao deletar.');
      }
    }
  };

  const handleDeleteResponse = async (id: string) => {
    if (confirm('Deletar registro de feedback do histórico administrativo?')) {
      try {
        await deleteDoc(doc(db, 'pesquisa_respostas', id));
        toast.success('Feedback removido.');
      } catch (err) {
        toast.error('Erro ao deletar.');
      }
    }
  };

  // NPS Metrics computations
  // NPS Score = % Promoters (9 or 10) - % Detractors (0 to 6)
  const totalResp = responses.length || 1;
  const promotersCount = responses.filter(r => r.score >= 9).length;
  const detractorsCount = responses.filter(r => r.score <= 6).length;
  
  const pctPromoters = (promotersCount / totalResp) * 100;
  const pctDetractors = (detractorsCount / totalResp) * 100;
  const npsScore = Math.round(pctPromoters - pctDetractors);

  const averageRating = responses.reduce((acc, r) => acc + (r.score > 5 ? r.score / 2 : r.score), 0) / (responses.length || 1);

  return (
    <div className="space-y-8 pb-12 text-primary font-sans">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">Pesquisa de Satisfação & NPS</h1>
          <p className="text-muted text-sm">Monitore a reputação dos seus barbeiros em tempo real.</p>
        </div>
        <button 
          onClick={() => setShowQuestionModal(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase"
        >
          <Plus size={16} />
          <span>Nova Pergunta NPS</span>
        </button>
      </header>

      {/* NPS Dashboard Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border rounded-[2rem] p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-[10px] text-muted font-black uppercase tracking-wider">Índice NPS Geral</p>
            <p className="text-4xl font-black text-slate-800">{npsScore}</p>
            <span className="text-[10px] bg-emerald-150 text-emerald-800 px-2 py-0.5 rounded-full font-black uppercase">
              {npsScore > 70 ? 'Zona de Excelência' : npsScore > 50 ? 'Zona de Qualidade' : 'Zona de Atenção'}
            </span>
          </div>
          <Smile className="text-emerald-500" size={56} />
        </div>

        <div className="bg-white border rounded-[2rem] p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-[10px] text-muted font-black uppercase tracking-wider">Média Estrelas</p>
            <p className="text-4xl font-black text-slate-800">{averageRating.toFixed(1)} / 5.0</p>
            <div className="flex text-amber-500 gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} size={14} fill={s <= Math.round(averageRating) ? 'currentColor' : 'none'} />
              ))}
            </div>
          </div>
          <Star className="text-amber-500" size={50} fill="currentColor" />
        </div>

        <div className="bg-white border rounded-[2rem] p-6 shadow-sm flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-[10px] text-muted font-black uppercase tracking-wider">Detalhamento Respostas</p>
            <p className="text-xs text-emerald-600 font-black">🟢 Promotores: {promotersCount} ({Math.round(pctPromoters)}%)</p>
            <p className="text-xs text-amber-600 font-black">🟡 Neutros: {responses.filter(r => r.score === 7 || r.score === 8).length}</p>
            <p className="text-xs text-red-650 font-black">🔴 Detratores: {detractorsCount} ({Math.round(pctDetractors)}%)</p>
          </div>
          <ThumbsUp className="text-blue-500" size={44} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Section: active questions on survey widget */}
        <div className="bg-white border rounded-[2rem] p-6 shadow-sm space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Perguntas Ativas</h3>
            <p className="text-xs text-muted font-bold mt-0.5">Disparadas aos clientes após cada comanda fechada.</p>
          </div>

          <div className="space-y-3">
            {questions.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted italic">Qual nota de 0 a 10 você daria para o nosso corte? (Padrão)</div>
            ) : (
              questions.map(q => (
                <div key={q.id} className="p-4 border border-slate-100 rounded-2xl flex items-center justify-between shadow-sm hover:border-slate-200">
                  <p className="text-xs font-bold text-slate-800">{q.title}</p>
                  <button onClick={() => handleDeleteQuestion(q.id)} className="text-slate-300 hover:text-red-500 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center & Right sections: historical reviews feed */}
        <div className="lg:col-span-2 bg-white border rounded-[2rem] p-6 shadow-sm space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">Opiniões & Feedbacks dos Clientes</h3>
            <p className="text-xs text-muted font-bold mt-0.5">Acompanhe comentários enviados pelos clientes.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-accent w-8 h-8" />
            </div>
          ) : responses.length === 0 ? (
            <div className="py-12 border border-dashed rounded-3xl text-center italic text-xs text-muted">Vazio.</div>
          ) : (
            <div className="space-y-4 max-h-[480px] overflow-y-auto no-scrollbar">
              {responses.map(resp => {
                const isPromoter = resp.score >= 9;
                const isNeutro = resp.score === 7 || resp.score === 8;
                return (
                  <div key={resp.id} className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col justify-between hover:border-accent/10 transition-all shadow-inner">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black text-slate-800">{resp.clientName}</p>
                          <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                            isPromoter ? 'bg-emerald-150 text-emerald-800' : isNeutro ? 'bg-amber-100 text-amber-800' : 'bg-red-50 text-red-650'
                          }`}>
                            Nota: {resp.score}
                          </span>
                        </div>
                        <p className="text-xs text-slate-650 font-bold leading-relaxed mt-2 italic">"{resp.comment || 'Nenhum comentário adicional.'}"</p>
                      </div>
                      <button onClick={() => handleDeleteResponse(resp.id)} className="text-slate-300 hover:text-red-500 pb-1 flex-shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-[9px] text-muted font-bold mt-4 text-right">
                      Respondido em: {new Date(resp.submittedAt).toLocaleDateString('pt-BR')} às {new Date(resp.submittedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Creation Question Modal */}
      <AnimatePresence>
        {showQuestionModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleCreateQuestion}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <h3 className="text-xl font-black uppercase tracking-tight">Criar Pergunta de Satisfação</h3>
                <button type="button" onClick={() => setShowQuestionModal(false)} className="bg-slate-100 p-2 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Título / Pergunta</label>
                  <input 
                    type="text" 
                    value={questionTitle} 
                    onChange={e => setQuestionTitle(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold"
                    placeholder="Ex: Como você avalia a higiene da barbearia?"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-primary text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                Salvar Nova Pergunta
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
