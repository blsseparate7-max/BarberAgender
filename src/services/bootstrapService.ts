
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserRole } from '../types';

const USERS_COLLECTION = 'usuarios';

interface BootstrapUser {
  nome: string;
  email: string;
  senha: string;
  tipo: UserRole;
}

const TEST_USERS: BootstrapUser[] = [
  {
    nome: 'Admin',
    email: 'admin@admin.com',
    senha: 'admin123',
    tipo: 'admin'
  },
  {
    nome: 'Gerente',
    email: 'gerente@gerente.com',
    senha: 'gerente',
    tipo: 'gerente'
  },
  {
    nome: 'Cliente',
    email: 'cliente@cliente.com',
    senha: 'cliente',
    tipo: 'cliente'
  },
  {
    nome: 'Barbeiro',
    email: 'barbeiro@gmail.com',
    senha: 'barbeiro',
    tipo: 'barbeiro'
  }
];

export const bootstrapService = {
  async bootstrap() {
    console.log('Starting bootstrap process...');
    const results = [];

    for (const testUser of TEST_USERS) {
      try {
        console.log(`Checking user: ${testUser.email}`);
        
        let uid = '';
        try {
          // Try to sign in to see if user exists
          const userCred = await signInWithEmailAndPassword(auth, testUser.email, testUser.senha);
          uid = userCred.user.uid;
          console.log(`User ${testUser.email} already exists in Auth.`);
        } catch (authError: any) {
          if (authError.code === 'auth/user-not-found' || authError.code === 'auth/wrong-password' || authError.code === 'auth/invalid-credential') {
            // Try creating
            try {
              const userCred = await createUserWithEmailAndPassword(auth, testUser.email, testUser.senha);
              uid = userCred.user.uid;
              console.log(`User ${testUser.email} created in Auth.`);
            } catch (createError: any) {
               if (createError.code === 'auth/email-already-in-use') {
                 console.log(`User ${testUser.email} already exists in Auth (detected during creation attempt).`);
                 // Since we can't get UID without a successful login or Admin SDK, 
                 // we skip Firestore check for this user if we can't sign in.
                 results.push({ 
                   email: testUser.email, 
                   status: 'warning', 
                   message: 'Usuário já existe mas a senha atual não confere com a nova senha de teste. Tente usar a senha anterior ou resetar no Console.' 
                 });
                 continue;
               }
               console.error(`Error creating user ${testUser.email}:`, createError);
               results.push({ email: testUser.email, status: 'error', message: createError.message });
               continue;
            }
          } else {
            console.error(`Auth error for ${testUser.email}:`, authError);
            results.push({ email: testUser.email, status: 'error', message: authError.message });
            continue;
          }
        }

        // Now check Firestore
        const docRef = doc(db, USERS_COLLECTION, uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          console.log(`Creating Firestore document for ${testUser.email}...`);
          await setDoc(docRef, {
            uid,
            nome: testUser.nome,
            email: testUser.email,
            tipo: testUser.tipo,
            ativo: true,
            balance: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          results.push({ email: testUser.email, status: 'created/restored' });
        } else {
          // Check if it needs correction (e.g. missing fields)
          const data = docSnap.data();
          if (!data.tipo || !data.nome || data.ativo === undefined) {
             console.log(`Updating/Correcting Firestore document for ${testUser.email}...`);
             await setDoc(docRef, {
               ...data,
               uid,
               nome: data.nome || testUser.nome,
               email: data.email || testUser.email,
               tipo: data.tipo || testUser.tipo,
               ativo: data.ativo !== undefined ? data.ativo : true,
               updatedAt: serverTimestamp()
             }, { merge: true });
             results.push({ email: testUser.email, status: 'corrected' });
          } else {
             results.push({ email: testUser.email, status: 'ok' });
          }
        }

        // Sign out to not leave a mess
        await signOut(auth);

      } catch (error: any) {
        console.error(`Unexpected error for ${testUser.email}:`, error);
        results.push({ email: testUser.email, status: 'error', message: error.message });
      }
    }

    console.log('Bootstrap finished. Results:', results);
    return results;
  }
};
