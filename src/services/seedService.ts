
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserRole } from '../types';

export const seedService = {
  async createTestUsers() {
    const testUsers = [
      {
        email: 'admin.barber@gmail.com',
        password: 'admin123',
        displayName: 'Administrador Sistema',
        role: 'admin' as UserRole
      },
      {
        email: 'gerente.barber@gmail.com',
        password: 'gerente123',
        displayName: 'Gerente Operacional',
        role: 'gerente' as UserRole
      },
      {
        email: 'cliente.barber@gmail.com',
        password: 'cliente123',
        displayName: 'Cliente Teste',
        role: 'cliente' as UserRole
      }
    ];

    const results = [];

    for (const user of testUsers) {
      try {
        let uid = '';
        try {
          // 1. Create in Auth
          const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
          uid = userCredential.user.uid;
        } catch (error: any) {
          if (error.code === 'auth/email-already-in-use') {
            // If already exists, sign in to get the UID and be authenticated for Firestore write
            const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
            uid = userCredential.user.uid;
          } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            // Account exists but password in Auth is different from our seed password
            results.push({ 
              email: user.email, 
              status: 'error', 
              message: 'A conta já existe no Firebase Auth com uma senha diferente. Por favor, use a senha que você definiu anteriormente para este e-mail.' 
            });
            continue; // Skip Firestore write as we don't have the UID
          } else {
            throw error;
          }
        }

        // 2. Create in Firestore
        try {
          await setDoc(doc(db, 'usuarios', uid), {
            uid,
            email: user.email,
            nome: user.displayName,
            tipo: user.role,
            ativo: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          results.push({ email: user.email, status: 'created' });
        } catch (fsError: any) {
          console.error(`Firestore error for ${user.email}:`, fsError);
          results.push({ 
            email: user.email, 
            status: 'error', 
            message: `Erro no Firestore: ${fsError.message}. Verifique as regras de segurança.` 
          });
        }
      } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
          results.push({ email: user.email, status: 'already exists' });
        } else {
          results.push({ email: user.email, status: 'error', message: error.message });
        }
      }
    }

    // Sign out after seeding to avoid being logged in as the last created user
    await signOut(auth);
    
    return results;
  }
};
