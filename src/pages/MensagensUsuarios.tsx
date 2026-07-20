import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Send, 
  Search, 
  Filter, 
  Loader2, 
  Calendar, 
  Sparkles, 
  User, 
  Plus, 
  Trash2, 
  CheckCircle, 
  X 
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { UserProfile } from '../types';
import { userService } from '../services/userService';
import { toast } from 'sonner';
import { useTenant } from '../contexts/TenantContext';

interface MessageTemplate {
  id: string;
  title: string;
  body: string;
  tenantId?: string;
}

export function MensagensUsuarios() {
  const { tenantId } = useTenant();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [clients, setClients] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchClient, setSearchClient] = useState('');
  
  // Custom draft creation state
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');

  // Selected dynamic configuration
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [customMessageBody, setCustomMessageBody] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    // 1. Fetch template messages
    const q = query(
      collection(db, 'mensagens_modelos'), 
      where('tenantId', '==', tenantId)
    );
    const unsubTemplates = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as MessageTemplate));
      docs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      setTemplates(docs);
      
      // Auto seed some templates if empty
      if (docs.length === 0) {
        const sampleDrafts = [
          { tenantId, title: 'Lembrete de Agendamento', body: 'Olá [NOME], passando para lembrar do seu horário hoje na BarberElite às [HORA]. Te esperamos!' },
          { tenantId, title: 'Promoção Especial da Semana', body: 'Olá [NOME]! Combo premium (Corte + Barba + Toalha Quente) com 20% OFF de Terça à Quinta nesta semana. Agende já!' },
          { tenantId, title: 'Clube de Assinaturas', body: 'Fala [NOME], venha assinar o nosso Clube Barbearia e tenha cortes ilimitados todo mês com parcelas fixas!' }
        ];
        sampleDrafts.forEach(sd => {
          addDoc(collection(db, 'mensagens_modelos'), sd);
        });
      }
    });

    // 2. Fetch Clients
    userService.getAllClients().then(setClients).catch(console.error);
    setLoading(false);

    return () => unsubTemplates();
  }, [tenantId]);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle || !draftBody) {
      toast.error('Preencha o título e corpo do modelo.');
      return;
    }
    try {
      await addDoc(collection(db, 'mensagens_modelos'), {
        tenantId,
        title: draftTitle,
        body: draftBody
      });
      toast.success('Modelo de mensagem salvo!');
      setShowDraftModal(false);
      setDraftTitle('');
      setDraftBody('');
    } catch (err) {
      toast.error('Erro ao salvar modelo.');
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Deletar este modelo permanentemente?')) {
      try {
        await deleteDoc(doc(db, 'mensagens_modelos', id));
        toast.success('Modelo exluído.');
        if (selectedTemplateId === id) {
          setSelectedTemplateId('');
          setCustomMessageBody('');
        }
      } catch (err) {
        toast.error('Erro ao deletar modelo.');
      }
    }
  };

  const handleSelectTemplate = (tpl: MessageTemplate) => {
    setSelectedTemplateId(tpl.id);
    let substituted = tpl.body;
    if (selectedClientId) {
      const cl = clients.find(c => c.uid === selectedClientId);
      if (cl) {
        substituted = substituted.replace(/\[NOME\]/gi, cl.nome);
      }
    }
    setCustomMessageBody(substituted);
  };

  const handleSelectClient = (cId: string) => {
    setSelectedClientId(cId);
    const cl = clients.find(c => c.uid === cId);
    if (cl && selectedTemplateId) {
      const tpl = templates.find(t => t.id === selectedTemplateId);
      if (tpl) {
        setCustomMessageBody(tpl.body.replace(/\[NOME\]/gi, cl.nome));
      }
    }
  };

  const handleSendWhatsApp = () => {
    if (!selectedClientId) {
      toast.error('Selecione o destinatário!');
      return;
    }
    if (!customMessageBody) {
      toast.error('Escreva ou selecione uma mensagem!');
      return;
    }
    const client = clients.find(c => c.uid === selectedClientId);
    if (!client) return;

    const rawPhone = client.telefone || client.phone || '';
    const phoneClean = rawPhone.replace(/\D/g, '');
    if (!phoneClean) {
      toast.error('Cliente selecionado não possui telefone cadastrado.');
      return;
    }

    const encoded = encodeURIComponent(customMessageBody);
    window.open(`https://api.whatsapp.com/send?phone=55${phoneClean}&text=${encoded}`, '_blank');
    toast.success('Redirecionado para o WhatsApp com sucesso!');
  };

  const filteredClients = clients.filter(c => 
    c.nome.toLowerCase().includes(searchClient.toLowerCase()) ||
    (c.telefone || '').includes(searchClient)
  ).slice(0, 10);

  return (
    <div className="space-y-8 pb-12 text-primary">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-primary">Mensagens para Usuários & Clientes</h1>
          <p className="text-muted text-sm">Dispare mensagens de forma ágil com modelos prontos pelo WhatsApp.</p>
        </div>
        <button 
          onClick={() => setShowDraftModal(true)}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase"
        >
          <Plus size={16} />
          <span>Novo Modelo</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left section: templates list */}
        <div className="bg-white border rounded-[2rem] p-6 shadow-sm space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">1. Modelos Salvos</h3>
            <p className="text-xs text-muted font-bold mt-0.5">Clique em um modelo para usá-lo</p>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto no-scrollbar">
            {templates.length === 0 ? (
              <div className="py-12 text-center italic text-xs text-muted">Buscando modelos...</div>
            ) : (
              templates.map(tpl => (
                <div 
                  key={tpl.id}
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all space-y-2 hover:bg-slate-50 relative group ${
                    selectedTemplateId === tpl.id ? 'border-accent bg-accent/5' : 'border-slate-100'
                  }`}
                >
                  <div className="flex justify-between items-center pr-6">
                    <p className="font-bold text-xs text-slate-800">{tpl.title}</p>
                    <button 
                      onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                      className="absolute right-3 top-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <p className="text-[11px] text-muted line-clamp-2 font-medium">{tpl.body}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center section: recipient list */}
        <div className="bg-white border rounded-[2rem] p-6 shadow-sm space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">2. Selecionar Destinatário</h3>
            <p className="text-xs text-muted font-bold mt-0.5">Selecione o cliente de destino</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar cliente..." 
              value={searchClient}
              onChange={e => setSearchClient(e.target.value)}
              className="w-full bg-slate-50 border p-3 pl-10 rounded-xl font-bold text-xs"
            />
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar">
            {filteredClients.map((c, index) => (
              <div 
                key={`msg-client-${c.uid || index}-${index}`}
                onClick={() => handleSelectClient(c.uid)}
                className={`p-3.5 border rounded-2xl cursor-pointer transition-all flex items-center justify-between ${
                  selectedClientId === c.uid ? 'bg-primary text-white border-primary shadow-lg shadow-primary/10' : 'border-slate-100 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div>
                  <p className="font-black text-xs">{c.nome}</p>
                  <p className={`text-[10px] ${selectedClientId === c.uid ? 'text-white/80' : 'text-slate-400'} font-bold mt-0.5`}>
                    📞 {c.telefone || c.phone || 'Sem fone'}
                  </p>
                </div>
                {selectedClientId === c.uid && <CheckCircle size={16} className="text-white" />}
              </div>
            ))}
          </div>
        </div>

        {/* Right section: customizer & trigger action */}
        <div className="bg-white border rounded-[2rem] p-6 shadow-sm space-y-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">3. Mensagem Pronta</h3>
              <p className="text-xs text-muted font-bold mt-0.5">Edite e dispare a mensagem final</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-muted uppercase font-black tracking-wide block">Edição do Corpo da Mensagem</label>
              <textarea 
                rows={7}
                value={customMessageBody}
                onChange={e => setCustomMessageBody(e.target.value)}
                placeholder="Selecione um cliente e modelo ao lado, ou digite uma mensagem personalizada aqui..."
                className="w-full bg-slate-50 border p-4 rounded-2xl font-bold text-xs leading-relaxed"
              />
            </div>
          </div>

          <div className="pt-4 border-t">
            <button 
              onClick={handleSendWhatsApp}
              className="w-full py-4.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-emerald-600/10 flex items-center justify-center gap-3.5"
            >
              <Send size={16} />
              Enviar pelo WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Model Creation Modal */}
      <AnimatePresence>
        {showDraftModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.form 
              onSubmit={handleCreateDraft}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md space-y-6 text-primary outline-none"
            >
              <div className="flex justify-between items-center pb-4 border-b">
                <h3 className="text-xl font-black uppercase tracking-tight">Criar Modelo Mensagem</h3>
                <button type="button" onClick={() => setShowDraftModal(false)} className="bg-slate-100 p-2 rounded-xl">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 font-bold text-sm">
                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Título do Modelo</label>
                  <input 
                    type="text" 
                    value={draftTitle} 
                    onChange={e => setDraftTitle(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold"
                    placeholder="Ex: Lembrete Retorno"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase text-muted tracking-wider block mb-1.5 font-bold">Corpo da Mensagem (Dica: Use [NOME] para o nome automático do cliente)</label>
                  <textarea 
                    rows={4}
                    value={draftBody} 
                    onChange={e => setDraftBody(e.target.value)}
                    className="w-full bg-slate-50 border p-3.5 rounded-xl text-xs font-bold leading-relaxed"
                    placeholder="Olá [NOME], faz tempo que não nos vemos!"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-4 bg-primary text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                Salvar Modelo
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
