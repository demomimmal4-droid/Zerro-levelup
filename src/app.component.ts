
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, Post, Category } from './services/data.service';

type ViewState = 'home' | 'login' | 'register' | 'publisher-dashboard' | 'admin-dashboard';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styles: []
})
export class AppComponent {
  dataService = inject(DataService);

  // UI State
  currentView = signal<ViewState>('home');
  searchQuery = signal('');
  selectedCategory = signal<string>('all');
  selectedPost = signal<Post | null>(null);
  
  // Forms State
  loginForm = { email: '', password: '' };
  registerForm = { name: '', email: '', password: '', role: 'user' as 'user' | 'publisher' };
  
  // Publisher Form
  postForm = {
    title: '',
    description: '',
    url: '',
    imageUrl: '',
    categoryId: ''
  };

  // Admin Form
  categoryForm = { name: '', icon: '' };

  // Derived Data for Home View
  filteredPosts = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    const posts = this.dataService.posts();

    return posts.filter(post => {
      const matchesSearch = post.title.toLowerCase().includes(query) || 
                            post.publisherName.toLowerCase().includes(query);
      const matchesCat = cat === 'all' || post.categoryId === cat;
      return matchesSearch && matchesCat;
    });
  });

  // Derived Data for Publisher View
  myPosts = computed(() => {
    const user = this.dataService.currentUser();
    if (!user) return [];
    return this.dataService.posts().filter(p => p.publisherId === user.id);
  });

  constructor() {
    // Sync view with user state changes
  }

  // --- Navigation Methods ---
  setView(view: ViewState) {
    this.currentView.set(view);
    this.selectedPost.set(null); // Close modal when changing views
    window.scrollTo(0, 0);
  }

  async logout() {
    await this.dataService.logout();
    this.setView('home');
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
    // Prevent background scrolling
    document.body.style.overflow = 'hidden';
  }

  closePost() {
    this.selectedPost.set(null);
    document.body.style.overflow = '';
  }

  // --- Action Methods ---

  async handleLogin() {
    try {
      await this.dataService.login(this.loginForm.email, this.loginForm.password);
      this.loginForm = { email: '', password: '' }; // Reset
      
      setTimeout(() => {
          const user = this.dataService.currentUser();
          if (user?.role === 'admin') this.setView('admin-dashboard');
          else if (user?.role === 'publisher') this.setView('publisher-dashboard');
          else this.setView('home');
      }, 500);

    } catch (error: any) {
      // Helper for Demo: If the demo admin user doesn't exist yet, create it on the fly.
      const isDemoAdmin = this.loginForm.email === 'moinulbd.sk@gmail.com';
      const isCredentialError = error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.message?.includes('invalid-credential');

      if (isDemoAdmin && isCredentialError) {
         try {
           // Auto-register the demo admin
           await this.dataService.register('Demo Admin', this.loginForm.email, this.loginForm.password, 'user');
           // Register automatically signs in. 
           // The DataService.register logic handles the 'admin' role assignment for this specific email.
            setTimeout(() => {
                this.setView('admin-dashboard');
            }, 500);
            return;
         } catch (regError: any) {
            alert('Login failed. Attempted to auto-create demo admin but failed: ' + regError.message);
         }
      } else {
        alert('Login failed: ' + (error.message || 'Check your credentials'));
      }
    }
  }

  async handleRegister() {
    if (!this.registerForm.name || !this.registerForm.email || !this.registerForm.password) {
      alert('Please fill all fields');
      return;
    }
    try {
      await this.dataService.register(
        this.registerForm.name, 
        this.registerForm.email, 
        this.registerForm.password, 
        this.registerForm.role
      );
      
      setTimeout(() => {
          if (this.registerForm.email === 'moinulbd.sk@gmail.com') this.setView('admin-dashboard');
          else if (this.registerForm.role === 'publisher') this.setView('publisher-dashboard');
          else this.setView('home');
      }, 500);
      
    } catch (error: any) {
       alert('Registration failed: ' + (error.message || 'Unknown error'));
    }
  }

  createPost() {
    if (!this.postForm.title || !this.postForm.url || !this.postForm.categoryId) {
      alert('Title, URL and Category are required');
      return;
    }
    
    // Use placeholder if no image
    const img = this.postForm.imageUrl || `https://picsum.photos/400/200?random=${Math.random()}`;

    this.dataService.addPost({
      title: this.postForm.title,
      description: this.postForm.description,
      url: this.postForm.url,
      imageUrl: img,
      categoryId: this.postForm.categoryId
    }).then(() => {
        alert('Post published successfully!');
        this.postForm = { title: '', description: '', url: '', imageUrl: '', categoryId: '' };
    }).catch(err => alert('Error publishing: ' + err.message));
  }

  createCategory() {
    if(!this.categoryForm.name) return;
    this.dataService.addCategory(this.categoryForm.name, this.categoryForm.icon || '#');
    this.categoryForm = { name: '', icon: '' };
  }

  deletePost(id: string) {
    if(confirm('Are you sure you want to delete this post?')) {
      this.dataService.deletePost(id);
    }
  }

  deleteCategory(id: string) {
    if(confirm('Delete this category?')) {
      this.dataService.deleteCategory(id);
    }
  }

  getCategoryName(id: string): string {
    const cat = this.dataService.categories().find(c => c.id === id);
    return cat ? cat.name : 'Unknown';
  }

  getCategoryIcon(id: string): string {
    const cat = this.dataService.categories().find(c => c.id === id);
    return cat ? cat.icon : '•';
  }
}
