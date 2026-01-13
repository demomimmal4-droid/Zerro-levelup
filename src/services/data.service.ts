
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
  canEdit?: boolean; // Controls if a publisher can edit/post
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
  readonly allUsers = signal<User[]>([]); // For Admin to manage users

  // Computed
  readonly isAdmin = computed(() => this.currentUser()?.role === 'admin');
  readonly isPublisher = computed(() => this.currentUser()?.role === 'publisher' || this.currentUser()?.role === 'admin');
  
  // Check if current user is allowed to edit/post
  readonly canEdit = computed(() => {
      const user = this.currentUser();
      if (!user) return false;
      if (user.role === 'admin') return true;
      // Default to true if undefined, otherwise use the flag
      return user.canEdit !== false;
  });

  constructor() {
    this.app = initializeApp(firebaseConfig);
    
    isSupported().then(supported => {
      if (supported) {
        this.analytics = getAnalytics(this.app);
      }
    }).catch(err => {
      console.warn('Analytics not supported:', err);
    });

    this.db = getDatabase(this.app, firebaseConfig.databaseURL);
    this.auth = getAuth(this.app);
    
    this.initData();
    this.initAuth();
  }

  private initData() {
    // Listen to Categories
    onValue(ref(this.db, 'categories'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const catArray = Object.keys(data).map(key => ({ ...data[key], id: key }));
        this.categories.set(catArray);
      } else {
        this.categories.set([]);
      }
    });

    // Listen to Posts
    onValue(ref(this.db, 'posts'), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const postsArray = Object.keys(data).map(key => ({ ...data[key], id: key }));
        postsArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        this.posts.set(postsArray);
      } else {
        this.posts.set([]);
      }
    });

    // Listen to All Users (For Admin)
    onValue(ref(this.db, 'users'), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const usersArray = Object.keys(data).map(key => ({ ...data[key], id: key }));
            this.allUsers.set(usersArray);
        } else {
            this.allUsers.set([]);
        }
    });
  }

  private initAuth() {
    onAuthStateChanged(this.auth, (firebaseUser) => {
      if (firebaseUser) {
        const userRef = ref(this.db, `users/${firebaseUser.uid}`);
        onValue(userRef, (snapshot) => {
          const userData = snapshot.val();
          if (userData) {
            this.currentUser.set({ ...userData, id: firebaseUser.uid });
          } else {
            const fallbackUser: User = {
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: firebaseUser.displayName || 'User',
                role: 'user',
                canEdit: true
            };
            this.currentUser.set(fallbackUser);
          }
        });
      } else {
        this.currentUser.set(null);
      }
    });
  }

  // --- Data Management Actions ---

  async addCategory(name: string, icon: string) {
    const newCatRef = push(ref(this.db, 'categories'));
    await set(newCatRef, {
      name,
      icon,
      slug: name.toLowerCase().replace(/\s+/g, '-')
    });
    return newCatRef.key;
  }

  async deleteCategory(id: string) {
    await remove(ref(this.db, `categories/${id}`));
  }

  async addPost(postData: Omit<Post, 'id' | 'views' | 'date' | 'publisherId' | 'publisherName'>) {
    const user = this.currentUser();
    if (!user) return;
    if (!this.canEdit()) throw new Error("You do not have permission to post.");

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

  async updatePost(id: string, postData: Partial<Post>) {
      const user = this.currentUser();
      if (!user) return;
      // Admin can update any. Publisher can update only if allowed.
      if (!this.canEdit()) throw new Error("Permission denied: You cannot edit posts.");
      
      await update(ref(this.db, `posts/${id}`), postData);
  }

  async deletePost(id: string) {
    // Validation logic is typically UI side, but rules can be enforced in Firebase Rules
    await remove(ref(this.db, `posts/${id}`));
  }

  async updateUserPermission(userId: string, canEdit: boolean) {
      await update(ref(this.db, `users/${userId}`), { canEdit });
  }

  // --- Seed Default Data ---
  async seedDefaults() {
      // 1. Create Default Categories if they don't exist
      const socialCatId = await this.addCategory('Social Media', '🌐');
      const msgCatId = await this.addCategory('Messaging', '💬');

      const adminUser = this.currentUser();
      const adminId = adminUser ? adminUser.id : 'system';
      const adminName = adminUser ? adminUser.name : 'System Admin';

      // 2. Create Default Posts
      const defaults = [
          {
              title: 'Facebook Official',
              description: 'Connect with friends, family and other people you know.',
              url: 'https://facebook.com',
              imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg',
              categoryId: socialCatId
          },
          {
              title: 'WhatsApp Web',
              description: 'Quickly send and receive WhatsApp messages right from your computer.',
              url: 'https://web.whatsapp.com',
              imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
              categoryId: msgCatId
          },
          {
              title: 'Telegram Web',
              description: 'A new era of messaging. Fast. Secure. Powerful.',
              url: 'https://web.telegram.org',
              imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
              categoryId: msgCatId
          },
          {
              title: 'YouTube',
              description: 'Enjoy the videos and music you love, upload original content, and share it all with friends.',
              url: 'https://youtube.com',
              imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg',
              categoryId: socialCatId
          }
      ];

      for (const d of defaults) {
          // Push directly to bypass checks just in case, though addPost would work if admin
          const newRef = push(ref(this.db, 'posts'));
          await set(newRef, {
              ...d,
              views: 0,
              date: new Date().toISOString(),
              publisherId: adminId,
              publisherName: adminName
          });
      }
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
       
       let finalRole: User['role'] = role;
       if (email === 'moinulbd.sk@gmail.com') {
         finalRole = 'admin';
       }

       const newUser: Omit<User, 'id'> = {
         name,
         email,
         role: finalRole,
         canEdit: true // Default to true
       };

       await set(ref(this.db, `users/${uid}`), newUser);
       return true;
     } catch (error) {
       console.error('Registration failed', error);
       throw error;
     }
  }
}
