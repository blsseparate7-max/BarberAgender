
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  Timestamp,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { SystemInsight } from '../types';
import { subDays, format, isBefore, parseISO } from 'date-fns';

const COLLECTION = 'system_insights';

export const intelligenceService = {
  async getInsights() {
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(10));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Generate initial insights if empty
      await this.generateInsights();
      return this.getInsights();
    }
    
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemInsight));
  },

  async generateInsights() {
    // This would normally be a cloud function, but we simulate it here
    const insights: Omit<SystemInsight, 'id' | 'createdAt'>[] = [
      {
        type: 'inactive_client',
        title: 'Clientes Inativos',
        description: 'Há 15 clientes que não visitam a barbearia há mais de 30 dias.',
        severity: 'medium',
        data: { count: 15 },
        date: format(new Date(), 'yyyy-MM-dd')
      },
      {
        type: 'top_service',
        title: 'Serviço em Alta',
        description: 'O serviço "Corte + Barba" teve um aumento de 25% na procura esta semana.',
        severity: 'low',
        data: { increase: 25 },
        date: format(new Date(), 'yyyy-MM-dd')
      },
      {
        type: 'revenue_drop',
        title: 'Queda de Faturamento',
        description: 'O faturamento desta terça-feira está 10% abaixo da média das últimas 4 semanas.',
        severity: 'high',
        data: { drop: 10 },
        date: format(new Date(), 'yyyy-MM-dd')
      }
    ];

    for (const insight of insights) {
      await addDoc(collection(db, COLLECTION), {
        ...insight,
        createdAt: serverTimestamp()
      });
    }
  }
};
