import { auth, db, storage } from './firebase-config.js?v=2';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  ref,
  set,
  get,
  child,
  push,
  update,
  remove,
  onValue
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";

// State
let currentUser = null;
let currentRole = null;
let currentProfile = null;

// Categories map for article table rendering
let categoriesMap = {};

// Pending image file for upload
let pendingImageFile = null;

// ─── IMAGE COMPRESSION ─────────────────────────────────────
function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Scale down if wider than maxWidth
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas compression failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── UPLOAD TO FIREBASE STORAGE ────────────────────────────
function uploadImageToStorage(blob, filename) {
  return new Promise((resolve, reject) => {
    const uniqueName = `articles/${Date.now()}_${filename.replace(/\.[^.]+$/, '')}.jpg`;
    const fileRef = storageRef(storage, uniqueName);
    const uploadTask = uploadBytesResumable(fileRef, blob);

    const progressEl = document.getElementById('imageUploadProgress');
    const fillEl = document.getElementById('imageUploadProgressFill');
    const textEl = document.getElementById('imageUploadProgressText');
    if (progressEl) progressEl.classList.remove('hidden');

    uploadTask.on('state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (fillEl) fillEl.style.width = pct + '%';
        if (textEl) textEl.textContent = pct + '%';
      },
      (error) => {
        if (progressEl) progressEl.classList.add('hidden');
        reject(error);
      },
      async () => {
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          if (progressEl) progressEl.classList.add('hidden');
          resolve(url);
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

// ─── IMAGE UPLOAD ZONE HANDLERS ────────────────────────────
function resetImageUploadZone() {
  pendingImageFile = null;
  const placeholder = document.getElementById('imageUploadPlaceholder');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  const progressEl = document.getElementById('imageUploadProgress');
  const fileInput = document.getElementById('imageFileInput');
  const hiddenInput = document.getElementById('articleImage');

  if (placeholder) placeholder.classList.remove('hidden');
  if (previewContainer) previewContainer.classList.add('hidden');
  if (previewImg) previewImg.src = '';
  if (progressEl) progressEl.classList.add('hidden');
  if (fileInput) fileInput.value = '';
  if (hiddenInput) hiddenInput.value = '';
}

function showImagePreview(src) {
  const placeholder = document.getElementById('imageUploadPlaceholder');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');

  if (placeholder) placeholder.classList.add('hidden');
  if (previewContainer) previewContainer.classList.remove('hidden');
  if (previewImg) previewImg.src = src;
}

function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showToast('Please select a valid image file', true);
    return;
  }
  pendingImageFile = file;
  // Show local preview
  const reader = new FileReader();
  reader.onload = (e) => showImagePreview(e.target.result);
  reader.readAsDataURL(file);
}

// Wire up upload zone after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('imageUploadZone');
  const fileInput = document.getElementById('imageFileInput');
  const removeBtn = document.getElementById('imageRemoveBtn');

  if (zone && fileInput) {
    // Click to open file picker
    zone.addEventListener('click', (e) => {
      if (e.target.closest('#imageRemoveBtn')) return;
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleImageFile(e.target.files[0]);
      }
    });

    // Drag and drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('image-upload-zone--dragover');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('image-upload-zone--dragover');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('image-upload-zone--dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleImageFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetImageUploadZone();
    });
  }
});

// DOM Elements - Auth (Selectors moved inside functions for robustness)
function getAuthElements() {
  return {
    authScreen: document.getElementById('authScreen'),
    pendingScreen: document.getElementById('pendingScreen'),
    adminApp: document.getElementById('adminApp'),
    loginForm: document.getElementById('loginForm'),
    signupForm: document.getElementById('signupForm'),
    showSignupBtn: document.getElementById('showSignupBtn'),
    showLoginBtn: document.getElementById('showLoginBtn'),
    authTitle: document.querySelector('.auth-header h2'),
    authSubtitle: document.getElementById('authSubtitle'),
    authAlerts: document.getElementById('authAlerts'),
    logoutBtn: document.getElementById('logoutBtn'),
    pendingLogoutBtn: document.getElementById('pendingLogoutBtn')
  };
}

// ─── AUTH STATE OBSERVER ────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // Check role in RTDB
    const userRef = ref(db, `users/${user.uid}`);
    onValue(userRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        console.log("User profile found:", data);
        currentProfile = data;
        currentRole = data.role;
        handleRoleRedirect(data);
      } else {
        console.warn("User profile not found in database for UID:", user.uid);
        // If profile missing, we should probably allow them to log out or show an error
        const { authScreen, authAlerts } = getAuthElements();
        const btn = document.getElementById('loginBtn');
        if (btn) btn.textContent = 'Sign In';
        showAlert("User profile not found. Please contact an admin or sign up.");
        showAuthScreen();
      }
    }, (error) => {
      console.error("Error fetching user profile:", error);
      const btn = document.getElementById('loginBtn');
      if (btn) btn.textContent = 'Sign In';
      showAlert("Error fetching profile: " + error.message);
    });
  } else {
    console.log("No user authenticated.");
    currentUser = null;
    currentRole = null;
    currentProfile = null;
    showAuthScreen();
  }
});

function handleRoleRedirect(profile) {
  const { authScreen, adminApp, pendingScreen, userName, userAvatar, userRoleBadge, navUsersTab } = getAuthElements();
  const userNameEl = document.getElementById('userName');
  const userAvatarEl = document.getElementById('userAvatar');
  const userRoleBadgeEl = document.getElementById('userRoleBadge');
  const navUsersTabEl = document.getElementById('navUsersTab');

  if (profile.role === 'pending') {
    if (authScreen) authScreen.classList.add('hidden');
    if (adminApp) adminApp.classList.add('hidden');
    if (pendingScreen) pendingScreen.classList.remove('hidden');

    const pendingText = pendingScreen ? pendingScreen.querySelector('p') : null;
    if (pendingText) {
      if (currentUser && !currentUser.emailVerified) {
        pendingText.innerHTML = `Your journalist account has been created. <strong>Please check your email (${currentUser.email}) to verify your account.</strong> An admin will approve your account after verification.`;
      } else {
        pendingText.textContent = `Your journalist account is verified and currently pending admin approval.`;
      }
    }

  } else if (profile.role === 'admin' || profile.role === 'journalist') {
    if (authScreen) authScreen.classList.add('hidden');
    if (pendingScreen) pendingScreen.classList.add('hidden');
    if (adminApp) adminApp.classList.remove('hidden');

    // Update Sidebar User Info
    if (userNameEl) userNameEl.textContent = profile.name;
    if (userAvatarEl) userAvatarEl.textContent = profile.name.charAt(0).toUpperCase();
    if (userRoleBadgeEl) {
      userRoleBadgeEl.textContent = profile.role;
      userRoleBadgeEl.className = `badge badge--${profile.role}`;
    }

    // Restrict Admin Tabs
    const navAnalyticsTabEl = document.getElementById('navAnalyticsTab');
    if (profile.role !== 'admin') {
      if (navUsersTabEl) navUsersTabEl.style.display = 'none';
      if (navAnalyticsTabEl) navAnalyticsTabEl.style.display = 'none';
      const activeTab = document.querySelector('.nav-btn.active');
      if (activeTab && (activeTab.dataset.tab === 'users' || activeTab.dataset.tab === 'analytics')) {
        switchTab('dashboard');
      }
    } else {
      if (navUsersTabEl) navUsersTabEl.style.display = 'block';
      if (navAnalyticsTabEl) navAnalyticsTabEl.style.display = 'block';
    }

    initDashboard();
  }
}

function showAuthScreen() {
  const { authScreen, pendingScreen, adminApp } = getAuthElements();
  if (authScreen) authScreen.classList.remove('hidden');
  if (pendingScreen) pendingScreen.classList.add('hidden');
  if (adminApp) adminApp.classList.add('hidden');
}

// ─── AUTH ACTIONS ───────────────────────────────────────────
const { showSignupBtn, showLoginBtn, loginForm, signupForm, authTitle, authSubtitle, authAlerts, logoutBtn, pendingLogoutBtn } = getAuthElements();

if (showSignupBtn) {
  showSignupBtn.addEventListener('click', () => {
    const { loginForm, signupForm, authTitle, authSubtitle } = getAuthElements();
    if (loginForm) loginForm.classList.add('hidden');
    if (signupForm) signupForm.classList.remove('hidden');
    if (authTitle) authTitle.textContent = 'Apply as Journalist';
    if (authSubtitle) authSubtitle.textContent = 'Account will require admin approval';
    hideAlert();
  });
}

if (showLoginBtn) {
  showLoginBtn.addEventListener('click', () => {
    const { loginForm, signupForm, authTitle, authSubtitle } = getAuthElements();
    if (signupForm) signupForm.classList.add('hidden');
    if (loginForm) loginForm.classList.remove('hidden');
    if (authTitle) authTitle.textContent = 'Pahari Abirta Admin';
    if (authSubtitle) authSubtitle.textContent = 'Sign in to manage content';
    hideAlert();
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    if (btn) btn.textContent = 'Signing In...';

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      showAlert(err.message);
      if (btn) btn.textContent = 'Sign In';
    }
  });
}

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const btn = document.getElementById('signupBtn');
  btn.textContent = 'Creating Account...';

  try {
    // All new signups default to pending. 
    // The first user must be manually upgraded to 'admin' in the Firebase Console.
    const role = 'pending';

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await set(ref(db, `users/${user.uid}`), {
      name,
      email,
      role,
      createdAt: Date.now()
    });

    // Send email verification link
    await sendEmailVerification(user);
    showToast('Verification email sent! Please check your inbox.');

  } catch (err) {
    showAlert(err.message);
    btn.textContent = 'Sign Up';
  }
});

const handleLogout = () => signOut(auth);
if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
if (pendingLogoutBtn) pendingLogoutBtn.addEventListener('click', handleLogout);

function showAlert(msg) {
  const { authAlerts } = getAuthElements();
  if (authAlerts) {
    authAlerts.textContent = msg;
    authAlerts.style.display = 'block';
  }
}
function hideAlert() {
  const { authAlerts } = getAuthElements();
  if (authAlerts) authAlerts.style.display = 'none';
}
function showToast(msg, isError = false) {
  const toastEl = document.getElementById('toast');
  if (toastEl) {
    toastEl.textContent = msg;
    toastEl.style.backgroundColor = isError ? 'var(--color-danger)' : 'var(--color-primary)';
    toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), 3000);
  }
}

// ─── DASHBOARD UI & NAVIGATION ──────────────────────────────
document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchTab(btn.dataset.tab);
  });
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.classList.remove('hidden');

  if (tabId === 'articles') loadArticles();
  if (tabId === 'categories') loadCategories();
  if (tabId === 'opinions') loadOpinions();
  if (tabId === 'ticker') loadTicker();
  if (tabId === 'analytics' && currentRole === 'admin') loadAnalytics();
  if (tabId === 'users' && currentRole === 'admin') loadUsers();
}

// Global modal closer
window.closeModals = function () {
  const overlay = document.getElementById('modalOverlay');
  if (overlay) overlay.classList.add('hidden');
  
  // Hide all modals
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
};

// ─── DASHBOARD INIT ─────────────────────────────────────────
function initDashboard() {
  // Load categories into map for article display translations
  onValue(ref(db, 'categories'), async (snapshot) => {
    categoriesMap = {};
    if (snapshot.exists()) {
      snapshot.forEach(child => {
        categoriesMap[child.key] = child.val().name;
      });
      // Hydrate category selects
      const select = document.getElementById('articleCategory');
      if (select) {
        select.innerHTML = '';
        snapshot.forEach(child => {
          select.innerHTML += `<option value="${child.key}">${child.val().name}</option>`;
        });
      }
    } else {
      // Seed default categories if none exist
      const defaults = [
        { name: 'Politics', slug: 'politics', order: 1 },
        { name: 'Culture', slug: 'culture', order: 2 },
        { name: 'Technology', slug: 'technology', order: 3 },
        { name: 'Local', slug: 'local', order: 4 },
        { name: 'Society', slug: 'society', order: 5 },
        { name: 'Opinion', slug: 'opinion', order: 6 }
      ];
      for (const cat of defaults) {
        await set(ref(db, `categories/${cat.slug}`), { ...cat, description: '' });
      }
    }
  });

  // Load Dashboard Stats
  onValue(ref(db, 'articles'), snap => {
    const el = document.getElementById('statArticleCount');
    if (el) el.textContent = snap.exists() ? Object.keys(snap.val()).length : 0;
  });
  
  if (currentRole === 'admin') {
    onValue(ref(db, 'users'), snap => {
      const el = document.getElementById('statPendingUserCount');
      if (el) {
        let pc = 0;
        if (snap.exists()) {
          snap.forEach(c => { if (c.val().role === 'pending') pc++; });
        }
        el.textContent = pc;
      }
    });
  } else {
    const el = document.getElementById('statPendingUserCount');
    if (el) el.textContent = 'N/A';
  }



  switchTab('dashboard'); // Default
}

// ─── ARTICLES ───────────────────────────────────────────────
function loadArticles() {
  const tbody = document.querySelector('#articlesTable tbody');
  onValue(ref(db, 'articles'), (snapshot) => {
    tbody.innerHTML = '';
    if (!snapshot.exists()) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No articles found.</td></tr>';
      return;
    }

    // Sort array descending setup
    const articlesArr = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (!data.isOpinion) {
        articlesArr.push({ id: child.key, ...data });
      }
    });
    articlesArr.sort((a, b) => b.createdAt - a.createdAt);

    articlesArr.forEach(article => {
      const dateStr = new Date(article.createdAt).toLocaleDateString();
      const catName = categoriesMap[article.category] || article.category;

      let statusBadge = `<span class="badge badge--${article.status}">${article.status}</span>`;
      if (article.isFeatured) statusBadge += ` <span class="badge" style="background:#DAA520;color:#fff;">Featured</span>`;
      if (article.isTrending) statusBadge += ` <span class="badge" style="background:#EF4444;color:#fff;">Trending</span>`;

      tbody.innerHTML += `
        <tr>
          <td><strong>${article.title.substring(0, 40)}${article.title.length > 40 ? '...' : ''}</strong></td>
          <td>${catName}</td>
          <td>${article.author}</td>
          <td>${statusBadge}</td>
          <td>${dateStr}</td>
          <td class="table-actions">
            <button class="action-edit" onclick="editArticle('${article.id}')">Edit</button>
            <button class="action-delete" onclick="deleteArticle('${article.id}')">Delete</button>
          </td>
        </tr>
      `;
    });
  });
}

// ─── OPINIONS ──────────────────────────────────────────────
function loadOpinions() {
  const tbody = document.querySelector('#opinionsTable tbody');
  onValue(ref(db, 'articles'), (snapshot) => {
    tbody.innerHTML = '';
    if (!snapshot.exists()) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No opinions found.</td></tr>';
      return;
    }
    
    const opinionsArr = [];
    snapshot.forEach(child => {
      const data = child.val();
      if (data.isOpinion) {
        opinionsArr.push({ id: child.key, ...data });
      }
    });
    opinionsArr.sort((a,b) => b.createdAt - a.createdAt);

    if (opinionsArr.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No opinions found.</td></tr>';
      return;
    }

    opinionsArr.forEach(article => {
      const dateStr = new Date(article.createdAt).toLocaleDateString();
      let statusBadge = `<span class="badge badge--${article.status}">${article.status}</span>`;
      
      tbody.innerHTML += `
        <tr>
          <td><strong>${article.title.substring(0,40)}${article.title.length > 40 ? '...' : ''}</strong></td>
          <td>${article.author}</td>
          <td>${statusBadge}</td>
          <td>${dateStr}</td>
          <td class="table-actions">
            <button class="action-edit" onclick="editArticle('${article.id}')">Edit</button>
            <button class="action-delete" onclick="deleteArticle('${article.id}')">Delete</button>
          </td>
        </tr>
      `;
    });
  });
}

const btnNewOpinion = document.getElementById('newOpinionBtn');
if (btnNewOpinion) {
  btnNewOpinion.addEventListener('click', () => {
    const form = document.getElementById('articleForm');
    const modal = document.getElementById('articleModal');
    const overlay = document.getElementById('modalOverlay');
    
    if (form) form.reset();
    const idField = document.getElementById('articleId');
    const opinionField = document.getElementById('articleIsOpinion');
    const titleField = document.getElementById('articleModalTitle');

    if (idField) idField.value = '';
    if (opinionField) opinionField.value = 'true';
    if (titleField) titleField.textContent = 'New Opinion Piece';

    // Auto-set category to opinion for new opinions
    const catField = document.getElementById('articleCategory');
    if (catField) catField.value = 'opinion';

    toggleOpinionFields(true);
    resetImageUploadZone();
    
    if (overlay) overlay.classList.remove('hidden');
    if (modal) modal.classList.remove('hidden');
  });
}

function toggleOpinionFields(isOpinion) {
  const catGroup = document.getElementById('articleCategoryGroup');
  const flagsGroup = document.getElementById('articleFlagsGroup');
  
  if (isOpinion) {
    if (catGroup) catGroup.classList.add('hidden');
    if (flagsGroup) flagsGroup.classList.add('hidden');
  } else {
    if (catGroup) catGroup.classList.remove('hidden');
    if (flagsGroup) flagsGroup.classList.remove('hidden');
  }
}

const btnNewArticle = document.getElementById('newArticleBtn');
if (btnNewArticle) {
  btnNewArticle.addEventListener('click', () => {
    const form = document.getElementById('articleForm');
    const modal = document.getElementById('articleModal');
    const overlay = document.getElementById('modalOverlay');

    if (form) form.reset();
    const idField = document.getElementById('articleId');
    const opinionField = document.getElementById('articleIsOpinion');
    const titleField = document.getElementById('articleModalTitle');

    if (idField) idField.value = '';
    if (opinionField) opinionField.value = 'false';
    if (titleField) titleField.textContent = 'New Article';

    toggleOpinionFields(false);
    resetImageUploadZone();
    
    if (overlay) overlay.classList.remove('hidden');
    if (modal) modal.classList.remove('hidden');
  });
}

document.getElementById('articleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById('articleSaveBtn');
  const originalText = saveBtn ? saveBtn.textContent : 'Save Article';

  try {
    // 1. Upload image if a new file was selected
    let imageUrl = document.getElementById('articleImage').value;

    if (pendingImageFile) {
      if (saveBtn) saveBtn.textContent = 'Compressing image...';
      const compressedBlob = await compressImage(pendingImageFile);
      if (saveBtn) saveBtn.textContent = 'Uploading image...';
      imageUrl = await uploadImageToStorage(compressedBlob, pendingImageFile.name);
      document.getElementById('articleImage').value = imageUrl;
      pendingImageFile = null;
    }

    if (!imageUrl) {
      showToast('Please select a cover image', true);
      if (saveBtn) saveBtn.textContent = originalText;
      return;
    }

    // 2. Gather form data
    const id = document.getElementById('articleId').value;
    const title = document.getElementById('articleTitle').value;
    const category = document.getElementById('articleCategory').value;
    const excerpt = document.getElementById('articleExcerpt').value;
    const body = document.getElementById('articleBody').value;
    const readTime = document.getElementById('articleReadTime').value;
    const status = document.getElementById('articleStatus').value;
    const isFeatured = document.getElementById('articleIsFeatured') ? document.getElementById('articleIsFeatured').checked : false;
    const isTrending = document.getElementById('articleIsTrending') ? document.getElementById('articleIsTrending').checked : false;
    const opinionEl = document.getElementById('articleIsOpinion');
    const isOpinion = opinionEl ? (opinionEl.value === 'true') : false;

    if (saveBtn) saveBtn.textContent = 'Saving...';

    const data = {
      title,
      category: isOpinion ? 'opinion' : category,
      excerpt, image: imageUrl, body, readTime, status,
      isFeatured: isOpinion ? false : isFeatured,
      isTrending: isOpinion ? false : isTrending,
      isOpinion,
      updatedAt: Date.now()
    };

    // 3. Save to database
    if (id) {
      await update(ref(db, `articles/${id}`), data);
      showToast('Article updated successfully');
    } else {
      data.author = currentProfile.name;
      data.authorId = currentUser.uid;
      data.createdAt = Date.now();
      data.date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      await push(ref(db, 'articles'), data);
      showToast('Article created successfully');
    }
    closeModals();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (saveBtn) saveBtn.textContent = originalText;
  }
});

window.editArticle = async function (id) {
  const snapshot = await get(child(ref(db), `articles/${id}`));
  if (snapshot.exists()) {
    const data = snapshot.val();
    document.getElementById('articleId').value = id;
    document.getElementById('articleTitle').value = data.title;
    document.getElementById('articleCategory').value = data.category;
    document.getElementById('articleExcerpt').value = data.excerpt;
    document.getElementById('articleImage').value = data.image || '';
    document.getElementById('articleBody').value = data.body;
    document.getElementById('articleReadTime').value = data.readTime;
    document.getElementById('articleStatus').value = data.status;
    const featEl = document.getElementById('articleIsFeatured');
    const trendEl = document.getElementById('articleIsTrending');
    const opinionEl = document.getElementById('articleIsOpinion');
    
    if (featEl) featEl.checked = !!data.isFeatured;
    if (trendEl) trendEl.checked = !!data.isTrending;
    if (opinionEl) opinionEl.value = data.isOpinion ? 'true' : 'false';

    // Show existing image in the upload preview
    resetImageUploadZone();
    if (data.image) {
      document.getElementById('articleImage').value = data.image;
      showImagePreview(data.image);
    }

    const titleField = document.getElementById('articleModalTitle');
    const modal = document.getElementById('articleModal');
    const overlay = document.getElementById('modalOverlay');

    if (titleField) titleField.textContent = data.isOpinion ? 'Edit Opinion' : 'Edit Article';
    toggleOpinionFields(!!data.isOpinion);

    if (overlay) overlay.classList.remove('hidden');
    if (modal) modal.classList.remove('hidden');
  }
};

window.deleteArticle = async function (id) {
  if (confirm('Are you sure you want to delete this article?')) {
    try {
      // 1. Get article data to check for image
      const snap = await get(child(ref(db), `articles/${id}`));
      if (snap.exists()) {
        const article = snap.val();
        // 2. Delete from Storage if it's a storage URL
        if (article.image && article.image.includes('firebasestorage.googleapis.com')) {
          try {
            const imgRef = storageRef(storage, article.image);
            await deleteObject(imgRef);
          } catch (storageErr) {
            console.error("Storage Deletion Error:", storageErr);
            showToast("Storage error: " + storageErr.message, true);
            return; // Halt article deletion so we can see the error
          }
        }
      }

      // 3. Remove from Database
      await remove(ref(db, `articles/${id}`));
      showToast('Article deleted');
    } catch (err) {
      showToast(err.message, true);
    }
  }
};

// ─── INLINE SMART CATEGORY ──────────────────────────────────
const btnInlineCat = document.getElementById('inlineCategoryBtn');
const formInlineCat = document.getElementById('inlineCategoryForm');
if (btnInlineCat && formInlineCat) {
  btnInlineCat.addEventListener('click', () => {
    formInlineCat.classList.remove('hidden');
    document.getElementById('inlineCatName').focus();
  });

  document.getElementById('inlineCategoryCancel').addEventListener('click', () => {
    formInlineCat.classList.add('hidden');
    document.getElementById('inlineCatName').value = '';
  });

  document.getElementById('inlineCategorySave').addEventListener('click', async () => {
    const name = document.getElementById('inlineCatName').value.trim();
    if (!name) return;

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const data = { name, slug, description: '', order: 0 };

    try {
      await set(ref(db, `categories/${slug}`), data);
      showToast('Category created');
      formInlineCat.classList.add('hidden');
      document.getElementById('inlineCatName').value = '';

      // Select the new category in the dropdown
      setTimeout(() => {
        document.getElementById('articleCategory').value = slug;
      }, 500); // small delay to let FB sync UI
    } catch (err) {
      showToast(err.message, true);
    }
  });
}

// ─── CATEGORIES ─────────────────────────────────────────────
function loadCategories() {
  const tbody = document.querySelector('#categoriesTable tbody');
  onValue(ref(db, 'categories'), (snapshot) => {
    tbody.innerHTML = '';
    if (!snapshot.exists()) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No categories found.</td></tr>';
      return;
    }

    const arr = [];
    snapshot.forEach(child => { arr.push({ id: child.key, ...child.val() }); });
    arr.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    arr.forEach(cat => {
      tbody.innerHTML += `
        <tr>
          <td><strong>${cat.name}</strong></td>
          <td><code>${cat.slug}</code></td>
          <td>${cat.description || '-'}</td>
          <td>${cat.order}</td>
          <td class="table-actions">
            <button class="action-edit" onclick="editCategory('${cat.id}')">Edit</button>
            <button class="action-delete" onclick="deleteCategory('${cat.id}')">Delete</button>
          </td>
        </tr>
      `;
    });
  });
}

document.getElementById('newCategoryBtn').addEventListener('click', () => {
  document.getElementById('categoryForm').reset();
  document.getElementById('categoryId').value = '';
  document.getElementById('categoryModalTitle').textContent = 'New Category';
  modalOverlay.classList.remove('hidden');
  categoryModal.classList.remove('hidden');
});

document.getElementById('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const name = document.getElementById('catName').value;
  const slug = document.getElementById('catSlug').value.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const description = document.getElementById('catDesc').value;
  const order = parseInt(document.getElementById('catOrder').value) || 0;

  const data = { name, slug, description, order };

  try {
    if (id) { // Not updating key name since we rely on push ID
      await update(ref(db, `categories/${id}`), data);
      showToast('Category updated');
    } else {
      // Instead of push, we can use the slug as the key for categories to make URLs nicer
      await set(ref(db, `categories/${slug}`), data);
      showToast('Category created');
    }
    closeModals();
  } catch (err) {
    showToast(err.message, true);
  }
});

window.editCategory = async function (id) {
  const snap = await get(child(ref(db), `categories/${id}`));
  if (snap.exists()) {
    const data = snap.val();
    document.getElementById('categoryId').value = id;
    document.getElementById('catName').value = data.name;
    document.getElementById('catSlug').value = data.slug;
    document.getElementById('catDesc').value = data.description;
    document.getElementById('catOrder').value = data.order;

    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    modalOverlay.classList.remove('hidden');
    categoryModal.classList.remove('hidden');
  }
};

window.deleteCategory = async function (id) {
  if (confirm('Delete this category?')) {
    await remove(ref(db, `categories/${id}`));
    showToast('Category deleted');
  }
};

// ─── TICKER ─────────────────────────────────────────────────
function loadTicker() {
  const tbody = document.querySelector('#tickerTable tbody');
  onValue(ref(db, 'ticker'), (snapshot) => {
    tbody.innerHTML = '';
    if (!snapshot.exists()) {
      tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No alerts found.</td></tr>';
      return;
    }

    const arr = [];
    snapshot.forEach(child => { arr.push({ id: child.key, ...child.val() }); });
    arr.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    arr.forEach(item => {
      const activeBadge = item.active
        ? '<span class="badge badge--published">Active</span>'
        : '<span class="badge badge--draft">Inactive</span>';

      tbody.innerHTML += `
        <tr>
          <td>${item.text}</td>
          <td>${activeBadge}</td>
          <td>${item.order}</td>
          <td class="table-actions">
            <button class="action-edit" onclick="editTicker('${item.id}')">Edit</button>
            <button class="action-delete" onclick="deleteTicker('${item.id}')">Delete</button>
          </td>
        </tr>
      `;
    });
  });
}

document.getElementById('newTickerBtn').addEventListener('click', () => {
  document.getElementById('tickerForm').reset();
  document.getElementById('tickerId').value = '';
  document.getElementById('tickerModalTitle').textContent = 'New Breaking Alert';
  modalOverlay.classList.remove('hidden');
  tickerModal.classList.remove('hidden');
});

document.getElementById('tickerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('tickerId').value;
  const text = document.getElementById('tickerText').value;
  const active = document.getElementById('tickerActive').value === 'true';
  const order = parseInt(document.getElementById('tickerOrder').value) || 0;

  const data = { text, active, order, updatedAt: Date.now() };

  try {
    if (id) {
      await update(ref(db, `ticker/${id}`), data);
    } else {
      data.createdAt = Date.now();
      await push(ref(db, 'ticker'), data);
    }
    showToast('Alert saved');
    closeModals();
  } catch (err) {
    showToast(err.message, true);
  }
});

window.editTicker = async function (id) {
  const snap = await get(child(ref(db), `ticker/${id}`));
  if (snap.exists()) {
    const data = snap.val();
    document.getElementById('tickerId').value = id;
    document.getElementById('tickerText').value = data.text;
    document.getElementById('tickerActive').value = data.active ? 'true' : 'false';
    document.getElementById('tickerOrder').value = data.order;

    document.getElementById('tickerModalTitle').textContent = 'Edit Alert';
    modalOverlay.classList.remove('hidden');
    tickerModal.classList.remove('hidden');
  }
};

window.deleteTicker = async function (id) {
  if (confirm('Delete this alert?')) {
    await remove(ref(db, `ticker/${id}`));
    showToast('Alert deleted');
  }
};

// ─── USERS / ROLE MANAGEMENT ────────────────────────────────
function loadUsers() {
  const tbody = document.querySelector('#usersTable tbody');
  onValue(ref(db, 'users'), (snapshot) => {
    tbody.innerHTML = '';
    if (!snapshot.exists()) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No users found.</td></tr>';
      return;
    }

    const arr = [];
    snapshot.forEach(child => { arr.push({ uid: child.key, ...child.val() }); });
    arr.sort((a, b) => b.createdAt - a.createdAt);

    arr.forEach(user => {
      const dateStr = new Date(user.createdAt).toLocaleDateString();
      const roleBadge = `<span class="badge badge--${user.role}">${user.role}</span>`;

      let actions = '';
      if (user.role === 'pending' && currentRole === 'admin') {
        actions = `<button class="action-approve" onclick="approveUser('${user.uid}')">Approve Journalist</button>`;
      } else if (user.role === 'journalist' && currentRole === 'admin') {
        actions = `<button class="action-delete" onclick="revokeUser('${user.uid}')">Revoke Access</button>`;
      } else if (user.uid === currentUser.uid) {
        actions = `<span style="color:var(--color-text-muted);font-size:0.8rem;">(You)</span>`;
      }

      tbody.innerHTML += `
        <tr>
          <td><strong>${user.name}</strong></td>
          <td>${user.email}</td>
          <td>${roleBadge}</td>
          <td>${dateStr}</td>
          <td class="table-actions">${actions}</td>
        </tr>
      `;
    });
  });
}

window.approveUser = async function (uid) {
  if (confirm('Approve this user as a Journalist? They will be able to publish and edit articles.')) {
    try {
      await update(ref(db, `users/${uid}`), { role: 'journalist', approvedAt: Date.now(), approvedBy: currentUser.uid });
      showToast('User approved as Journalist');
    } catch (e) { showToast(e.message, true); }
  }
};

window.revokeUser = async function (uid) {
  if (confirm('Revoke access? This user will revert to pending status and lose CMS access.')) {
    try {
      await update(ref(db, `users/${uid}`), { role: 'pending' });
      showToast('User access revoked');
    } catch (e) { showToast(e.message, true); }
  }
};

// ─── ANALYTICS ──────────────────────────────────────────────
let cachedViewsData = {};
let cachedArticlesData = {};

document.addEventListener('DOMContentLoaded', () => {
  const timeFilter = document.getElementById('analyticsTimeFilter');
  const dateInput = document.getElementById('analyticsDateInput');
  const monthInput = document.getElementById('analyticsMonthInput');
  
  if (timeFilter) {
    timeFilter.addEventListener('change', () => {
      dateInput.classList.add('hidden');
      monthInput.classList.add('hidden');
      if (timeFilter.value === 'custom_date') dateInput.classList.remove('hidden');
      if (timeFilter.value === 'custom_month') monthInput.classList.remove('hidden');
      renderAnalyticsTable();
    });
  }
  if (dateInput) dateInput.addEventListener('change', renderAnalyticsTable);
  if (monthInput) monthInput.addEventListener('change', renderAnalyticsTable);
});

async function loadAnalytics() {
  const tbody = document.querySelector('#analyticsTable tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4">Loading analytics...</td></tr>';

  try {
    const [visitsSnap, viewsSnap, articlesSnap] = await Promise.all([
      get(ref(db, 'analytics/visits')),
      get(ref(db, 'analytics/article_views')),
      get(ref(db, 'articles'))
    ]);

    // Handle visits
    if (visitsSnap.exists()) {
      const visits = visitsSnap.val();
      const now = new Date();
      const yy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const today = `${yy}-${mm}-${dd}`;
      const month = `${yy}-${mm}`;

      const tEl = document.getElementById('statVisitsToday');
      const mEl = document.getElementById('statVisitsMonth');
      const totalEl = document.getElementById('statVisitsTotal');

      if (tEl) tEl.textContent = visits[today] || 0;
      if (mEl) mEl.textContent = visits[month] || 0;
      if (totalEl) totalEl.textContent = visits['total'] || 0;
    } else {
      const tEl = document.getElementById('statVisitsToday');
      const mEl = document.getElementById('statVisitsMonth');
      const totalEl = document.getElementById('statVisitsTotal');
      if (tEl) tEl.textContent = 0;
      if (mEl) mEl.textContent = 0;
      if (totalEl) totalEl.textContent = 0;
    }

    // Cache views and articles
    cachedViewsData = viewsSnap.exists() ? viewsSnap.val() : {};
    cachedArticlesData = articlesSnap.exists() ? articlesSnap.val() : {};

    renderAnalyticsTable();

  } catch (err) {
    console.error("Failed to load analytics: ", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="table-empty text-danger" style="color:var(--color-danger)">Error loading data: ${err.message}</td></tr>`;
  }
}

function renderAnalyticsTable() {
  const timeFilter = document.getElementById('analyticsTimeFilter').value;
  const dateInput = document.getElementById('analyticsDateInput');
  const monthInput = document.getElementById('analyticsMonthInput');
  const header = document.getElementById('analyticsViewsHeader');
  
  let targetKey = 'total';
  let columnText = 'Total Views';

  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  if (timeFilter === 'today') {
    targetKey = `${yy}-${mm}-${dd}`;
    columnText = 'Views (Today)';
  } else if (timeFilter === 'month') {
    targetKey = `${yy}-${mm}`;
    columnText = 'Views (This Month)';
  } else if (timeFilter === 'custom_date') {
    targetKey = dateInput.value || 'NO_DATE';
    columnText = dateInput.value ? `Views (${dateInput.value})` : 'Select a date';
  } else if (timeFilter === 'custom_month') {
    targetKey = monthInput.value || 'NO_MONTH';
    columnText = monthInput.value ? `Views (${monthInput.value})` : 'Select a month';
  }

  if (header) header.textContent = columnText;

  const tbody = document.querySelector('#analyticsTable tbody');
  const rowsData = [];

  Object.keys(cachedViewsData).forEach(articleId => {
    let rawData = cachedViewsData[articleId];
    let viewsCount = 0;
    
    // BACKWARDS COMPATIBILITY: If it's a number, treat it as 'total'
    if (typeof rawData === 'number') {
      if (targetKey === 'total') viewsCount = rawData;
    } else if (rawData && typeof rawData === 'object') {
      viewsCount = rawData[targetKey] || 0;
    }

    if (viewsCount > 0 || targetKey === 'total') {
      const articleMeta = cachedArticlesData[articleId];
      if (articleMeta) {
        rowsData.push({
          id: articleId,
          title: articleMeta.title,
          author: articleMeta.author,
          published: new Date(articleMeta.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          views: viewsCount
        });
      } else {
        rowsData.push({
          id: articleId,
          title: 'Unknown / Deleted Article',
          author: '-',
          published: '-',
          views: viewsCount
        });
      }
    }
  });

  // Sort descending
  rowsData.sort((a, b) => b.views - a.views);

  if (tbody) {
    tbody.innerHTML = '';
    // Only filter out rows that have 0 views if we're not examining 'total'. For 'total', we can show everything tracked.
    const hasData = rowsData.length > 0 && rowsData.some(r => r.views > 0);
    
    if (!hasData && timeFilter !== 'total') {
      tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No article views recorded yet for this period.</td></tr>';
    } else if (rowsData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No article views recorded yet.</td></tr>';
    } else {
      rowsData.forEach(row => {
        if(timeFilter !== 'total' && row.views === 0) return; // Skip zero-views for specific ranges to declutter
        tbody.innerHTML += `
          <tr>
            <td><strong>${row.title}</strong></td>
            <td>${row.author}</td>
            <td>${row.published}</td>
            <td><span class="badge" style="background:var(--color-primary); color:white;">${row.views} Views</span></td>
          </tr>
        `;
      });
    }
  }
}

// --- MOBILE SIDEBAR TOGGLE ---
const sidebarToggleBtn = document.getElementById('sidebarToggle');
const adminSidebar = document.getElementById('adminSidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

function openSidebar() {
  if (adminSidebar) adminSidebar.classList.add('sidebar--open');
  if (sidebarBackdrop) sidebarBackdrop.classList.add('sidebar-backdrop--visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  if (adminSidebar) adminSidebar.classList.remove('sidebar--open');
  if (sidebarBackdrop) sidebarBackdrop.classList.remove('sidebar-backdrop--visible');
  document.body.style.overflow = '';
}

if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', openSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

// Auto-close sidebar when a nav button is clicked on mobile
document.querySelectorAll('.sidebar .nav-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeSidebar();
  });
});
