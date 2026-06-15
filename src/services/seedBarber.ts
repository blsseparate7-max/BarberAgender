
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const seedBarber = async () => {
  const barberUid = 'barbeiro-teste-uid'; // Em um sistema real, isso viria do Auth
  const barberRef = doc(db, 'usuarios', barberUid);
  
  const barberData = {
    uid: barberUid,
    email: 'barbeiro@gmail.com',
    nome: 'Barbeiro de Teste',
    tipo: 'barbeiro',
    ativo: true,
    phone: '(11) 99999-9999',
    specialty: 'Corte e Barba',
    commission_percentage: 40,
    monthly_goal: 5000,
    startDate: new Date().toISOString().split('T')[0],
    is_manager: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(barberRef, barberData);
  console.log('Barbeiro de teste criado com sucesso!');
};
