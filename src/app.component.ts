
import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService, Post, Category, User } from './services/data.service';

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
  
  // Edit State
  editingPostId = signal<string | null>(null);
  
  // Forms State
  loginForm = { email: '', password: '' };
  registerForm = { name: '', email: '', password: '', role: 'user' as 'user' | 'publisher' };
  
  // Publisher/Admin Post Form
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

  // Derived Data for Admin (User Management)
  publishersList = computed(() => {
      return this.dataService.allUsers().filter(u => u.role === 'publisher');
  });

  constructor() { }

  // --- Navigation Methods ---
  setView(view: ViewState) {
    this.currentView.set(view);
    this.selectedPost.set(null);
    this.resetPostForm(); // Reset form when changing views
    window.scrollTo(0, 0);
  }

  async logout() {
    await this.dataService.logout();
    this.setView('home');
  }

  openPost(post: Post) {
    this.selectedPost.set(post);
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
      this.loginForm = { email: '', password: '' };
      
      setTimeout(() => {
          const user = this.dataService.currentUser();
          if (user?.role === 'admin') this.setView('admin-dashboard');
          else if (user?.role === 'publisher') this.setView('publisher-dashboard');
          else this.setView('home');
      }, 500);

    } catch (error: any) {
      const isDemoAdmin = this.loginForm.email === 'moinulbd.sk@gmail.com';
      const isCredentialError = error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.message?.includes('invalid-credential');

      if (isDemoAdmin && isCredentialError) {
         try {
           await this.dataService.register('Demo Admin', this.loginForm.email, this.loginForm.password, 'user');
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

  // Unified Create/Edit Method
  async savePost() {
    if (!this.dataService.canEdit()) {
        alert('You have been restricted from editing or creating posts by the Admin.');
        return;
    }

    if (!this.postForm.title || !this.postForm.url || !this.postForm.categoryId) {
      alert('Title, URL and Category are required');
      return;
    }
    
    const img = this.postForm.imageUrl || `https://picsum.photos/400/200?random=${Math.random()}`;
    const postData = {
      title: this.postForm.title,
      description: this.postForm.description,
      url: this.postForm.url,
      imageUrl: img,
      categoryId: this.postForm.categoryId
    };

    try {
        if (this.editingPostId()) {
            // Update Existing
            await this.dataService.updatePost(this.editingPostId()!, postData);
            alert('Post updated successfully!');
        } else {
            // Create New
            await this.dataService.addPost(postData);
            alert('Post published successfully!');
        }
        this.resetPostForm();
    } catch (err: any) {
        alert('Error saving post: ' + err.message);
    }
  }

  editPost(post: Post) {
      // Check permission before loading form
      if (!this.dataService.canEdit()) {
          alert('You do not have permission to edit.');
          return;
      }

      this.editingPostId.set(post.id);
      this.postForm = {
          title: post.title,
          description: post.description,
          url: post.url,
          imageUrl: post.imageUrl,
          categoryId: post.categoryId
      };

      // Ensure we are in a dashboard view to see the form
      const user = this.dataService.currentUser();
      if (user?.role === 'admin') {
          // If admin is browsing home or other, bring to dashboard? 
          // Actually admin dashboard has the list, so we might stay there. 
          // If admin clicks edit from home, we should ideally go to dashboard.
          this.setView('admin-dashboard');
          // For UX, scroll to form
          setTimeout(() => window.scrollTo(0, 0), 100);
      } else if (user?.role === 'publisher') {
          this.setView('publisher-dashboard');
          setTimeout(() => window.scrollTo(0, 0), 100);
      }
  }

  resetPostForm() {
      this.editingPostId.set(null);
      this.postForm = { title: '', description: '', url: '', imageUrl: '', categoryId: '' };
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
  
  // Admin: Toggle User Permission
  togglePublisherEdit(user: User) {
      const newStatus = user.canEdit === false ? true : false;
      this.dataService.updateUserPermission(user.id, newStatus);
  }

  // Admin: Seed Defaults
  async seedData() {
      if(confirm('This will add default Facebook, Telegram, WhatsApp posts. Continue?')) {
          await this.dataService.seedDefaults();
          alert('Default posts added!');
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
