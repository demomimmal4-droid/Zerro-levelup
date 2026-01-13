
import { Injectable, signal, computed } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { getDatabase, ref, onValue, set, remove, push, child, update } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'publisher' | 'user';
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  slug: string;
}

export interface Post {
  id: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  categoryId: string;
  publisherId: string;
  publisherName: string;
  date: string;
  views: number;
}

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDeiyumJGtGt9gFTZuLqa2_zlHjEKPaXpM",
  authDomain: "zerro-levelup.firebaseapp.com",
  databaseURL: "https://zerro-levelup-default-rtdb.firebaseio.com",
  projectId: "zerro-levelup",
  storageBucket: "zerro-levelup.firebasestorage.app",
  messagingSenderId: "41787689596",
  appId: "1:41787689596:web:d84f448b2e98a52c07d7f9",
  measurementId: "G-W8DZ7S3YGJ"
};

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private app;
  private db;
  private auth;
  private analytics;

  // --- Signals ---
  readonly categories = signal<Category[]>([]);
  readonly posts = signal<Post[]>([]);
  readonly currentUser = signal<User | null>(null);

  // Computed
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly isPublisher = computed(() => this.currentUser()?.role === 'publisher' || this.currentUser()?.role === 'admin');

  constructor() {
    this.app = initializeApp(firebaseConfig);
    
    // Safely initialize analytics
    isSupported().then(supported => {
      if (supported) {
        this.analytics = getAnalytics(this.app);
      }
    }).catch(err => {
      console.warn('Analytics not supported:', err);
    });

    // Explicitly passing the databaseURL is critical to ensure connection to the correct instance
    this.db = getDatabase(this.app, firebaseConfig.databaseURL);
    this.auth = getAuth(this.app);
    
    this.initData();
    this.initAuth();
  }

  private initData() {
    // Listen to Categories
    const categoriesRef = ref(this.db, 'categories');
    onValue(categoriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // Convert object to array
        const catArray = Object.keys(data).map(key => ({ ...data[key], id: key }));
        this.categories.set(catArray);
      } else {
        this.categories.set([]);
      }
    }, (error) => {
      console.error("Error reading categories:", error);
    });

    // Listen to Posts
    const postsRef = ref(this.db, 'posts');
    onValue(postsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const postsArray = Object.keys(data).map(key => ({ ...data[key], id: key }));
        // Sort by date descending
        postsArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        this.posts.set(postsArray);
      } else {
        this.posts.set([]);
      }
    }, (error) => {
      console.error("Error reading posts:", error);
    });
  }

  private initAuth() {
    onAuthStateChanged(this.auth, (firebaseUser) => {
      if (firebaseUser) {
        // Get user profile from Realtime DB
        const userRef = ref(this.db, `users/${firebaseUser.uid}`);
        onValue(userRef, (snapshot) => {
          const userData = snapshot.val();
          if (userData) {
            this.currentUser.set({ ...userData, id: firebaseUser.uid });
          } else {
            // Fallback (should normally be created on register)
            const fallbackUser: User = {
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: firebaseUser.displayName || 'User',
                role: 'user'
            };
            this.currentUser.set(fallbackUser);
          }
        });
      } else {
        this.currentUser.set(null);
      }
    });
  }

  // --- Actions ---

  async addCategory(name: string, icon: string) {
    const newCatRef = push(ref(this.db, 'categories'));
    await set(newCatRef, {
      name,
      icon,
      slug: name.toLowerCase().replace(/\s+/g, '-')
    });
  }

  async deleteCategory(id: string) {
    await remove(ref(this.db, `categories/${id}`));
  }

  async addPost(postData: Omit<Post, 'id' | 'views' | 'date' | 'publisherId' | 'publisherName'>) {
    const user = this.currentUser();
    if (!user) return;

    const newPostRef = push(ref(this.db, 'posts'));
    const newPost = {
      ...postData,
      views: 0,
      date: new Date().toISOString(),
      publisherId: user.id,
      publisherName: user.name
    };
    await set(newPostRef, newPost);
  }

  async deletePost(id: string) {
    await remove(ref(this.db, `posts/${id}`));
  }

  // --- Auth ---

  async login(email: string, pass: string): Promise<boolean> {
    try {
      await signInWithEmailAndPassword(this.auth, email, pass);
      return true;
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  }

  async logout() {
    await signOut(this.auth);
    this.currentUser.set(null);
  }

  async register(name: string, email: string, pass: string, role: 'publisher' | 'user'): Promise<boolean> {
     try {
       const credential = await createUserWithEmailAndPassword(this.auth, email, pass);
       const uid = credential.user.uid;
       
       // Admin Override Check
       let finalRole: User['role'] = role;
       if (email === 'moinulbd.sk@gmail.com') {
         finalRole = 'admin';
       }

       const newUser: Omit<User, 'id'> = {
         name,
         email,
         role: finalRole
       };

       // Store user profile in DB
       await set(ref(this.db, `users/${uid}`), newUser);
       return true;
     } catch (error) {
       console.error('Registration failed', error);
       throw error;
     }
  }
}
