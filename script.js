/* ============================================================
   PAHARI ABIRTA — Main JavaScript (Firebase Integrated)
   Navigation, Search, Likes, Comments, Share, Animations
   ============================================================ */

import { db, messaging } from "./firebase-config.js?v=2";
import {
  ref,
  get,
  onValue,
  push,
  set,
  update,
  increment
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import {
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-messaging.js";

// Global Data stores
let ARTICLES = [];
let CATEGORY_LABELS = {};
let CATEGORY_DESCRIPTIONS = {};
let FIREBASE_READY = false;
let articlePath = "/article";
let catPath = "/category";

// ─── INITIAL DATA FETCH ──────────────────────────────────────
async function fetchFirebaseData() {
  return new Promise((resolve) => {
    // Listen to Categories
    onValue(ref(db, "categories"), (snapshot) => {
      CATEGORY_LABELS = { all: "All Stories" };
      CATEGORY_DESCRIPTIONS = {
        all: "Browse the latest stories across all our coverage areas",
      };
      if (snapshot.exists()) {
        const catArr = [];
        snapshot.forEach((child) => {
          catArr.push(child.val());
        });

        catArr.sort((a, b) => {
          const orderA = a.order || 0;
          const orderB = b.order || 0;
          if (orderA !== orderB) return orderA - orderB;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        catArr.forEach((cat) => {
          CATEGORY_LABELS[cat.slug] = cat.name;
          CATEGORY_DESCRIPTIONS[cat.slug] = cat.description;
        });
      }
    });

    // Listen to Articles
    onValue(
      ref(db, "articles"),
      (snapshot) => {
        ARTICLES = [];
        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            if (child.val().status === "published") {
              ARTICLES.push({ id: child.key, ...child.val() });
            }
          });
          // Sort by newest first
          ARTICLES.sort((a, b) => b.createdAt - a.createdAt);
        }

        FIREBASE_READY = true;
        // Re-trigger page initializers dependent on data
        initCategoriesUI();
        initHome();
        initCategoryPage();
        initSearchPage();
        initArticlePage();
        initCategoryTabs(); // Used on landing page
        resolve();
      },
      { onlyOnce: false },
    ); // keep listening for updates
  });
}

// ─── DOM HELPERS ────────────────────────────────────────────
const $ = (sel, ctx = document) => document.querySelector(sel);
const $$ = (sel, ctx = document) => [...document.querySelectorAll(sel)];

// ─── NAVIGATION ─────────────────────────────────────────────
function initNav() {
  const menuOpen = $("#menuOpen");
  const menuClose = $("#menuClose");
  const mobileNav = $("#mobileNav");
  const navBackdrop = $("#navBackdrop");
  const searchOpen = $("#searchOpen");
  const searchClose = $("#searchClose");
  const searchOverlay = $("#searchOverlay");

  function openDrawer() {
    if (mobileNav) {
      mobileNav.classList.add("mobile-nav--open");
      document.body.style.overflow = "hidden";
      if (navBackdrop) {
        navBackdrop.style.opacity = "1";
        navBackdrop.style.pointerEvents = "all";
      }
    }
  }

  function closeDrawer() {
    if (mobileNav) {
      mobileNav.classList.remove("mobile-nav--open");
      document.body.style.overflow = "";
      if (navBackdrop) {
        navBackdrop.style.opacity = "0";
        navBackdrop.style.pointerEvents = "none";
      }
    }
  }

  if (menuOpen) menuOpen.addEventListener("click", openDrawer);
  if (menuClose) menuClose.addEventListener("click", closeDrawer);
  if (navBackdrop) navBackdrop.addEventListener("click", closeDrawer);

  if (searchOpen && searchOverlay) {
    searchOpen.addEventListener("click", () => {
      searchOverlay.classList.add("search-overlay--open");
      document.body.style.overflow = "hidden";
      const input = searchOverlay.querySelector("input");
      if (input) setTimeout(() => input.focus(), 100);
    });
  }

  if (searchClose && searchOverlay) {
    searchClose.addEventListener("click", () => {
      searchOverlay.classList.remove("search-overlay--open");
      document.body.style.overflow = "";
    });
  }

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDrawer();
      if (searchOverlay) searchOverlay.classList.remove("search-overlay--open");
      document.body.style.overflow = "";
    }
  });

  // Close search overlay on background click
  if (searchOverlay) {
    searchOverlay.addEventListener("click", (e) => {
      if (e.target === searchOverlay) {
        searchOverlay.classList.remove("search-overlay--open");
        document.body.style.overflow = "";
      }
    });
  }
}

// ─── PWA & INSTALL ──────────────────────────────────────────
function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.warn('SW registration failed: ', err);
      });
    });
  }

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtns = $$('#installAppBtn');
    installBtns.forEach(btn => btn.style.display = 'flex');
  });

  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('#installAppBtn');
    if (btn && deferredPrompt) {
      const textSpan = btn.querySelector('.install-text');
      const originalText = textSpan ? textSpan.textContent : 'App';
      
      // Update UI for installing state
      if (textSpan) textSpan.textContent = 'Installing...';
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';

      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          deferredPrompt = null;
          $$('#installAppBtn').forEach(b => b.style.display = 'none');
        } else {
          // Reset UI if dismissed
          if (textSpan) textSpan.textContent = originalText;
          btn.style.opacity = '1';
          btn.style.pointerEvents = 'auto';
        }
      } catch (err) {
        console.error('PWA Prompt Error:', err);
        // Reset UI on error
        if (textSpan) textSpan.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      }
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    $$('#installAppBtn').forEach(b => b.style.display = 'none');
  });
}

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────
const VAPID_KEY = 'BFbN3VFxVyyaWnz6aPtEzCcw2nojIrWZN81uOaB_bCkGtLy4JMOSxwv7r9gtaHAbd_NvqQBTqsXmX65Xel-Y_aA';

function showForegroundToast(title, imageUrl, articleUrl) {
  // Remove any existing toast
  const existing = document.getElementById('notifToast');
  if (existing) existing.remove();

  const toast = document.createElement('a');
  toast.id = 'notifToast';
  toast.className = 'notif-toast';
  toast.href = articleUrl || '/';
  toast.innerHTML = `
    ${imageUrl ? `<img class="notif-toast__img" src="${imageUrl}" alt="">` : ''}
    <div class="notif-toast__body">
      <div class="notif-toast__label">Breaking News</div>
      <div class="notif-toast__title">${title}</div>
    </div>
    <button class="notif-toast__close" aria-label="Close">&times;</button>
  `;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('notif-toast--visible'), 50);

  // Close button
  toast.querySelector('.notif-toast__close').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toast.classList.remove('notif-toast--visible');
    setTimeout(() => toast.remove(), 400);
  });

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    toast.classList.remove('notif-toast--visible');
    setTimeout(() => toast.remove(), 400);
  }, 8000);
}

async function initNotifications() {
  // Only run if FCM is supported
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const DISMISS_KEY = 'pa_notif_dismissed';
  const TOKEN_KEY   = 'pa_notif_token';

  // If user already enabled, refresh token silently and set up foreground listener
  const savedToken = localStorage.getItem(TOKEN_KEY);
  if (Notification.permission === 'granted' && savedToken) {
    // Refresh token on every page load — tokens can expire/rotate
    try {
      const sw = await navigator.serviceWorker.ready;
      const freshToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: sw
      });
      if (freshToken && freshToken !== savedToken) {
        // Token changed — update in DB
        // Remove old token
        await set(ref(db, `fcm_tokens/${savedToken.replace(/[.#$\[\]]/g, '_')}`), null);
        // Save new token
        await set(ref(db, `fcm_tokens/${freshToken.replace(/[.#$\[\]]/g, '_')}`), {
          token: freshToken,
          savedAt: Date.now(),
          ua: navigator.userAgent.substring(0, 100)
        });
        localStorage.setItem(TOKEN_KEY, freshToken);
        console.log('FCM token refreshed');
      } else if (freshToken) {
        // Same token — just update the timestamp
        await set(ref(db, `fcm_tokens/${freshToken.replace(/[.#$\[\]]/g, '_')}`), {
          token: freshToken,
          savedAt: Date.now(),
          ua: navigator.userAgent.substring(0, 100)
        });
      }
    } catch (e) {
      console.warn('Token refresh failed:', e);
    }

    onMessage(messaging, (payload) => {
      const { title, image } = payload.notification || {};
      const url = payload.data?.url || '/';
      showForegroundToast(title, image, url);
    });
    return;
  }

  // If already denied or recently dismissed, don't bother
  if (Notification.permission === 'denied') return;
  if (localStorage.getItem(DISMISS_KEY)) return;

  // Wait 5 seconds before showing the banner
  await new Promise(r => setTimeout(r, 5000));

  // Build banner
  const banner = document.createElement('div');
  banner.className = 'notif-banner';
  banner.id = 'notifBanner';
  banner.innerHTML = `
    <div class="notif-banner__icon">
      <img src="/logo.png" alt="Pahari Abirta">
    </div>
    <div class="notif-banner__body">
      <div class="notif-banner__title">Stay informed</div>
      <div class="notif-banner__text">Get instant alerts when breaking news and new articles are published.</div>
      <div class="notif-banner__actions">
        <button class="notif-banner__enable" id="notifEnableBtn">🔔 Enable Notifications</button>
        <button class="notif-banner__dismiss" id="notifDismissBtn">No thanks</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('notif-banner--visible'), 50);

  function hideBanner() {
    banner.classList.remove('notif-banner--visible');
    setTimeout(() => banner.remove(), 450);
  }

  // Dismiss button
  document.getElementById('notifDismissBtn').addEventListener('click', () => {
    hideBanner();
    // Remember dismissal for 3 days
    const expiry = Date.now() + 3 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, expiry);
  });

  document.getElementById('notifEnableBtn').addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      hideBanner();

      if (permission !== 'granted') return;

      // Rest happens silently in the background
      const sw = await navigator.serviceWorker.ready;
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: sw
      });

      if (token) {
        await set(ref(db, `fcm_tokens/${token.replace(/[.#$\[\]]/g, '_')}`), {
          token,
          savedAt: Date.now(),
          ua: navigator.userAgent.substring(0, 100)
        });
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(DISMISS_KEY);

        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          const { title, image } = payload.notification || {};
          const url = payload.data?.url || '/';
          showForegroundToast(title, image, url);
        });
      }
    } catch (err) {
      console.error('Notification setup failed:', err);
    }
  });
}

// ─── SCROLL ANIMATIONS ─────────────────────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("fade-in--visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
  );

  $$(".fade-in").forEach((el) => observer.observe(el));
}

// ─── LIKE FUNCTIONALITY ─────────────────────────────────────
function initLikes() {
  const articleId = getArticleId();
  if (!articleId) return;
  const storageKey = `pa_likes_${articleId}`;
  const likedKey = `pa_liked_${articleId}`;

  let count = parseInt(localStorage.getItem(storageKey)) || 124;
  let liked = localStorage.getItem(likedKey) === "true";

  const likeBtns = [
    { btn: $("#likeBtn"), count: $("#likeCount") },
    { btn: $("#likeBtnBottom"), count: $("#likeCountBottom") },
  ].filter((b) => b.btn);

  function updateUI() {
    likeBtns.forEach(({ btn, count: countEl }) => {
      if (countEl) countEl.textContent = count;
      if (liked) {
        btn.classList.add("engagement-btn--liked");
        btn.querySelector("svg").setAttribute("fill", "currentColor");
      } else {
        btn.classList.remove("engagement-btn--liked");
        btn.querySelector("svg").setAttribute("fill", "none");
      }
    });
  }

  likeBtns.forEach(({ btn }) => {
    btn.addEventListener("click", () => {
      liked = !liked;
      count += liked ? 1 : -1;
      localStorage.setItem(storageKey, count);
      localStorage.setItem(likedKey, liked);
      updateUI();

      // Micro-animation
      btn.style.transform = "scale(1.2)";
      setTimeout(() => (btn.style.transform = ""), 200);
    });
  });

  updateUI();
}

// ─── SHARE FUNCTIONALITY ────────────────────────────────────
function initShare() {
  const shareModal = $("#shareModal");
  if (!shareModal) return;

  const shareBtn = $("#shareBtn");
  const shareBtnBottom = $("#shareBtnBottom");
  const shareClose = $("#shareModalClose");
  const url = encodeURIComponent(window.location.href);
  const title = encodeURIComponent(document.title);

  function openModal() {
    shareModal.classList.add("share-modal--open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    shareModal.classList.remove("share-modal--open");
    document.body.style.overflow = "";
  }

  if (shareBtn) shareBtn.addEventListener("click", openModal);
  if (shareBtnBottom) shareBtnBottom.addEventListener("click", openModal);
  if (shareClose) shareClose.addEventListener("click", closeModal);

  shareModal.addEventListener("click", (e) => {
    if (e.target === shareModal) closeModal();
  });

  // Share links
  const fb = $("#shareFacebook");
  const tw = $("#shareTwitter");
  const wa = $("#shareWhatsApp");
  const tg = $("#shareTelegram");
  const copy = $("#shareCopyLink");

  if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  if (tw) tw.href = `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
  if (wa) wa.href = `https://wa.me/?text=${title}%20${url}`;
  if (tg) tg.href = `https://t.me/share/url?url=${url}&text=${title}`;

  if (copy) {
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const text = $("#copyLinkText");
        if (text) {
          text.textContent = "Copied!";
          copy.classList.add("copied");
          setTimeout(() => {
            text.textContent = "Copy Link";
            copy.classList.remove("copied");
          }, 2000);
        }
      } catch {
        // Fallback
        const ta = document.createElement("textarea");
        ta.value = window.location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
    });
  }
}

// ─── COMMENTS FUNCTIONALITY ─────────────────────────────────
function initComments() {
  const commentList = $("#commentList");
  if (!commentList) return;

  const articleId = getArticleId();
  if (!articleId) return;
  
  let comments = {};

  // Listen for real-time updates from Firebase
  onValue(ref(db, `comments/${articleId}`), (snapshot) => {
    comments = snapshot.val() || {};
    renderComments();
  });

  function renderComments() {
    commentList.innerHTML = "";
    // Sort comments descending by timestamp
    const sorted = Object.entries(comments).sort((a, b) => b[1].timestamp - a[1].timestamp);
    sorted.forEach(([key, comment]) => {
      commentList.appendChild(createCommentEl(key, comment));
    });
    updateCommentCounts();
  }

  function createCommentEl(key, comment) {
    const div = document.createElement("div");
    div.className = "comment";

    const initials = comment.name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
    const timeAgo = getTimeAgo(comment.timestamp);

    let repliesHTML = "";
    const repliesMap = comment.replies || {};
    const sortedReplies = Object.entries(repliesMap).sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    if (sortedReplies.length > 0) {
      repliesHTML = `<div class="comment__replies">
        ${sortedReplies
          .map(([rKey, reply]) => {
            const ri = reply.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);
            return `<div class="comment">
            <div class="comment__header">
              <div class="comment__avatar">${ri}</div>
              <span class="comment__author">${escapeHtml(reply.name)}</span>
              <span class="comment__time">${getTimeAgo(reply.timestamp)}</span>
            </div>
            <p class="comment__text">${escapeHtml(reply.text)}</p>
          </div>`;
          })
          .join("")}
      </div>`;
    }

    div.innerHTML = `
      <div class="comment__header">
        <div class="comment__avatar">${initials}</div>
        <span class="comment__author">${escapeHtml(comment.name)}</span>
        <span class="comment__time">${timeAgo}</span>
      </div>
      <p class="comment__text">${escapeHtml(comment.text)}</p>
      <div class="comment__actions">
        <button class="comment__reply-btn" data-key="${key}">Reply</button>
      </div>
      <div class="reply-form" id="replyForm-${key}">
        <input type="text" class="reply-form__input" placeholder="Your name" maxlength="50" id="replyName-${key}">
        <input type="text" class="reply-form__input" placeholder="Write a reply..." maxlength="500" id="replyText-${key}" style="margin-bottom:0.5rem;">
        <button class="reply-form__btn" data-key="${key}">Reply</button>
      </div>
      ${repliesHTML}
    `;

    // Reply toggle
    const replyBtn = div.querySelector(".comment__reply-btn");
    const replyForm = div.querySelector(".reply-form");
    replyBtn.addEventListener("click", () => {
      replyForm.classList.toggle("reply-form--open");
      if (replyForm.classList.contains("reply-form--open")) {
        replyForm.querySelector("input").focus();
      }
    });

    // Reply submit
    const replySubmitBtn = div.querySelector(".reply-form__btn");
    replySubmitBtn.addEventListener("click", () => {
      const nameInput = div.querySelector(`#replyName-${key}`);
      const textInput = div.querySelector(`#replyText-${key}`);
      const name = nameInput.value.trim();
      const text = textInput.value.trim();

      if (!name || !text) return;

      // Push reply directly to Firebase mapping
      const replyRef = push(ref(db, `comments/${articleId}/${key}/replies`));
      set(replyRef, {
        name,
        text,
        timestamp: Date.now()
      }).catch(e => console.error("Reply commit failed:", e));
    });

    return div;
  }

  function updateCommentCounts() {
    let total = 0;
    Object.values(comments).forEach(c => {
      total += 1;
      if (c.replies) {
        total += Object.keys(c.replies).length;
      }
    });

    const countLabel = $("#commentsCountLabel");
    const commentCount = $("#commentCount");
    const commentCountBottom = $("#commentCountBottom");
    if (countLabel) countLabel.textContent = `${total} comment${total !== 1 ? "s" : ""}`;
    if (commentCount) commentCount.textContent = total;
    if (commentCountBottom) commentCountBottom.textContent = total;
  }

  // Top Level Comment submit
  const commentSubmit = $("#commentSubmit");
  if (commentSubmit) {
    commentSubmit.addEventListener("click", () => {
      const name = $("#commentName").value.trim();
      const text = $("#commentText").value.trim();

      if (!name || !text) {
        if (!name) $("#commentName").style.borderColor = "#E74C3C";
        if (!text) $("#commentText").style.borderColor = "#E74C3C";
        setTimeout(() => {
          $("#commentName").style.borderColor = "";
          $("#commentText").style.borderColor = "";
        }, 2000);
        return;
      }

      // Push comment directly to Firebase
      const newCommentRef = push(ref(db, `comments/${articleId}`));
      set(newCommentRef, {
        name,
        text,
        timestamp: Date.now()
      }).then(() => {
        $("#commentName").value = "";
        $("#commentText").value = "";
      }).catch(e => console.error("Comment commit failed:", e));
    });
  }

  // Comment scroll button
  const scrollBtn = $("#commentScrollBtn");
  if (scrollBtn) {
    scrollBtn.addEventListener("click", () => {
      const section = $("#commentsSection");
      if (section) section.scrollIntoView({ behavior: "smooth" });
    });
  }

  renderComments();
}

// ─── CATEGORY PAGE ──────────────────────────────────────────
function initCategoryPage() {
  const articlesContainer = $("#categoryArticles");
  const sidebarContainer = $("#categorySidebarTrending");
  const titleEl = $("#categoryTitle");
  const subtitleEl = $("#categorySubtitle");
  const tabs = $("#categoryTabs");

  if (!articlesContainer || !FIREBASE_READY) return;

  const params = new URLSearchParams(window.location.search);
  let cat = params.get("cat") || "all";

  // Fallback: If URL is something like /category?cat=politics but the parameters stripped, we can try to extract manually if needed, but the true fix is preventing the redirect.
  // We'll rely on the updated href linking to ensure the query wasn't dropped.

  // Update page title
  if (titleEl) {
    titleEl.textContent =
      cat === "all" ? "All Stories" : CATEGORY_LABELS[cat] || "Category";
  }
  if (subtitleEl) {
    subtitleEl.textContent =
      cat === "all"
        ? "Browse the latest stories across all our coverage areas"
        : CATEGORY_DESCRIPTIONS[cat] || "";
  }

  // Update document title
  document.title =
    (cat === "all" ? "All Categories" : CATEGORY_LABELS[cat] || "Category") +
    " — Pahari Abirta";

  // Active tab
  if (tabs) {
    $$(".category-tabs__btn", tabs).forEach((btn) => {
      btn.classList.toggle(
        "category-tabs__btn--active",
        btn.dataset.cat === cat,
      );
    });
  }

  // Active nav link
  $$(".header__nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    if (href && href.includes(`cat=${cat}`)) {
      link.classList.add("header__nav-link--active");
    }
  });

  // Filter articles
  const filtered =
    cat === "all" ? ARTICLES : ARTICLES.filter((a) => a.category === cat);

  // Render articles
  articlesContainer.innerHTML = "";
  if (filtered.length === 0) {
    articlesContainer.innerHTML = `
      <div class="no-results">
        <div class="no-results__icon">📰</div>
        <p class="no-results__text">No articles found in this category</p>
        <p class="no-results__hint">Check back soon for new stories</p>
      </div>`;
  } else {
    filtered.forEach((article) => {
      articlesContainer.innerHTML += `
        <article class="card card--horizontal card--shadow fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
          <a href="${articlePath}?id=${article.id}" class="card__image">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
            <span class="tag tag--${article.category} card__tag">${CATEGORY_LABELS[article.category] || article.category}</span>
          </a>
          <div class="card__body">
            <a href="${articlePath}?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
            <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="meta card__meta">
              <span>${escapeHtml(article.author)}</span>
              <span class="meta__separator"></span>
              <time>${getTimeAgo(article.createdAt)}</time>
              <span class="meta__separator"></span>
              <span>${article.readTime}</span>
            </div>
          </div>
        </article>`;
    });
  }

  // Sidebar trending
  if (sidebarContainer) {
    const trending = ARTICLES.filter((a) => a.isTrending).slice(0, 5);
    sidebarContainer.innerHTML = "";

    if (trending.length > 0) {
      trending.forEach((article) => {
        sidebarContainer.innerHTML += `
          <div class="category-sidebar__item">
            <div class="category-sidebar__img">
              <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
            </div>
            <div>
              <a href="${articlePath}?id=${article.id}"><h4 class="category-sidebar__title">${escapeHtml(article.title)}</h4></a>
              <div class="meta"><time style="font-size:0.75rem">${getTimeAgo(article.createdAt)}</time></div>
            </div>
          </div>`;
      });
    } else {
      sidebarContainer.innerHTML =
        '<p style="color:var(--color-text-muted);font-size:0.875rem;">No trending stories right now.</p>';
    }
  }
}

// ─── SEARCH PAGE ────────────────────────────────────────────
function initSearchPage() {
  const searchInput = $("#searchInput");
  const resultsList = $("#searchResultsList");
  const resultsCount = $("#searchResultsCount");

  if (!searchInput || !FIREBASE_READY) return;

  // Check URL for query
  const params = new URLSearchParams(window.location.search);
  const q = params.get("q") || "";
  if (q) {
    searchInput.value = q;
    performSearch(q);
  }

  let debounceTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(searchInput.value.trim());
    }, 300);
  });

  function performSearch(query) {
    if (!resultsList || !resultsCount) return;

    if (!query) {
      resultsList.innerHTML = "";
      resultsCount.textContent = "";
      return;
    }

    const q = query.toLowerCase();
    const results = ARTICLES.filter((a) => {
      const catLabel = CATEGORY_LABELS[a.category] || a.category;
      return (
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q)
      );
    });

    resultsCount.textContent = `${results.length} result${results.length !== 1 ? "s" : ""} for "${escapeHtml(query)}"`;

    if (results.length === 0) {
      resultsList.innerHTML = `
        <div class="no-results">
          <div class="no-results__icon">🔍</div>
          <p class="no-results__text">No results found for "${escapeHtml(query)}"</p>
          <p class="no-results__hint">Try different keywords or browse our categories</p>
        </div>`;
      return;
    }

    resultsList.innerHTML = "";
    results.forEach((article) => {
      resultsList.innerHTML += `
        <div class="search-result" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
          <a href="${articlePath}?id=${article.id}" class="search-result__image">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
          </a>
          <div class="search-result__body">
            <span class="tag tag--${article.category}" style="margin-bottom:0.5rem;">${CATEGORY_LABELS[article.category] || article.category}</span>
            <a href="${articlePath}?id=${article.id}"><h3 class="search-result__title">${highlightQuery(article.title, query)}</h3></a>
            <p class="search-result__excerpt">${highlightQuery(article.excerpt, query)}</p>
            <div class="meta">
              <span>${escapeHtml(article.author)}</span>
              <span class="meta__separator"></span>
              <time>${getTimeAgo(article.createdAt)}</time>
              <span class="meta__separator"></span>
              <span>${article.readTime}</span>
            </div>
          </div>
        </div>`;
    });
  }
}

// ─── ARTICLE PAGE DYNAMIC CONTENT ───────────────────────────
function initArticlePage() {
  if (!FIREBASE_READY) return;

  const articleId = getArticleId();
  if (!articleId) return;

  const article = ARTICLES.find((a) => String(a.id) === String(articleId));
  if (!article) return;

  // Update meta
  document.title = `${article.title} — Pahari Abirta`;

  const headerEl = $("#articleHeader");
  if (headerEl) {
    headerEl.innerHTML = `
      <a href="${catPath}?cat=${article.category}" class="tag tag--${article.category} article-header__tag" style="color: #ffffff;">${escapeHtml(CATEGORY_LABELS[article.category] || article.category)}</a>
      <h1 class="article-header__title" style="color: #ffffff;">${escapeHtml(article.title)}</h1>
      <p class="article-header__excerpt" style="color: rgba(255,255,255,0.9);">${escapeHtml(article.excerpt)}</p>
      <div class="meta article-header__meta" style="color: rgba(255,255,255,0.7);">
        <a href="#" style="color: #ffffff; font-weight: 500;">${escapeHtml(article.author)}</a>
        <span class="meta__separator" style="background: rgba(255,255,255,0.4);"></span>
        <time style="color: rgba(255,255,255,0.7);">${getTimeAgo(article.createdAt)}</time>
        <span class="meta__separator" style="background: rgba(255,255,255,0.4);"></span>
        <span style="color: rgba(255,255,255,0.7);">${article.readTime || "5 min read"}</span>
      </div>
    `;
  }

  const heroImgEl = $("#articleHeroImg");
  if (heroImgEl) {
    heroImgEl.className = "article-hero__image";
    heroImgEl.innerHTML = `<img src="${article.image}" alt="${escapeHtml(article.title)}" loading="eager">`;
  }

  const contentEl = $("#articleBody");
  if (contentEl && article.body) {
    contentEl.innerHTML = article.body;
  }

  // Active nav link
  $$(".header__nav-link").forEach((link) => {
    const href = link.getAttribute("href");
    if (href && href.includes(`cat=${article.category}`)) {
      link.classList.add("header__nav-link--active");
    }
  });

  // --- Suggested Articles ---
  renderSuggestedArticles(article);
}

function renderSuggestedArticles(currentArticle) {
  const categoryList = $("#categorySuggestionsList");
  const latestList = $("#latestSuggestionsList");
  const categoryTitle = $("#categorySuggestionsTitle");

  if (!categoryList || !latestList || !FIREBASE_READY) return;

  // 1. Category Suggestions
  const categoryArticles = ARTICLES.filter(
    (a) =>
      a.category === currentArticle.category &&
      String(a.id) !== String(currentArticle.id),
  ).slice(0, 3);

  if (categoryTitle) {
    categoryTitle.textContent = `More from ${CATEGORY_LABELS[currentArticle.category] || currentArticle.category}`;
  }

  if (categoryArticles.length > 0) {
    categoryList.innerHTML = categoryArticles
      .map(
        (article) => `
      <article class="card card--shadow fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
        <a href="${articlePath}?id=${article.id}" class="card__image">
          <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
          <span class="tag tag--${article.category} card__tag">${CATEGORY_LABELS[article.category] || article.category}</span>
        </a>
        <div class="card__body">
          <a href="${articlePath}?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
          <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
          <div class="meta card__meta">
            <span>${escapeHtml(article.author)}</span>
            <span class="meta__separator"></span>
            <time>${getTimeAgo(article.createdAt)}</time>
          </div>
        </div>
      </article>
    `,
      )
      .join("");
  } else {
    const section = categoryList.closest(".suggested-articles");
    if (section) section.style.display = "none";
  }

  // 2. Latest Suggestions (excluding current)
  const latestArticles = ARTICLES.filter(
    (a) => String(a.id) !== String(currentArticle.id),
  ).slice(0, 3);

  if (latestArticles.length > 0) {
    latestList.innerHTML = latestArticles
      .map(
        (article) => `
      <article class="card card--shadow fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
        <a href="${articlePath}?id=${article.id}" class="card__image">
          <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
          <span class="tag tag--${article.category} card__tag">${CATEGORY_LABELS[article.category] || article.category}</span>
        </a>
        <div class="card__body">
          <a href="${articlePath}?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
          <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
          <div class="meta card__meta">
            <span>${escapeHtml(article.author)}</span>
            <span class="meta__separator"></span>
            <time>${getTimeAgo(article.createdAt)}</time>
          </div>
        </div>
      </article>
    `,
      )
      .join("");
  }
}


// ─── CATEGORY TABS (LANDING PAGE & CATEGORY PAGE) ───────────
function initCategoryTabs() {
  const tabsContainer = $("#categoryTabs");

  if (tabsContainer) {
    // Check if we are on category page (it has actual links, not JS swappers)
    const isCategoryPage = window.location.pathname.includes("category");

    if (isCategoryPage) {
      const params = new URLSearchParams(window.location.search);
      const activeCat = params.get("cat") || "all";

      const catPath =
        false ||
        window.location.protocol === "file:"
          ? "category.html"
          : "category";

      const catSlugs = Object.keys(CATEGORY_LABELS).filter((c) => c !== "all");
      let tabsHtml = `<a href="${catPath}?cat=all" class="category-tabs__btn ${activeCat === "all" ? "category-tabs__btn--active" : ""}">All</a>`;
      tabsHtml += catSlugs
        .map(
          (slug) => `
        <a href="${catPath}?cat=${slug}" class="category-tabs__btn ${activeCat === slug ? "category-tabs__btn--active" : ""}">${escapeHtml(CATEGORY_LABELS[slug])}</a>
      `,
        )
        .join("");
      tabsContainer.innerHTML = tabsHtml;
      return; // Stop here, links handle navigation natively
    }
  }

  // Landing page logic (JS swappers)
  const tabs = $$(".category-tabs__btn[data-cat]");
  const mainEl = $("#categoryMain");

  if (!tabs.length || !mainEl || !FIREBASE_READY) return;

  tabs.forEach((tab) => {
    if (tab.tagName === "A") return;

    // We recreate listener to avoid duplicates
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);

    newTab.addEventListener("click", () => {
      const currentTabs = $$(".category-tabs__btn[data-cat]");
      currentTabs.forEach((t) =>
        t.classList.remove("category-tabs__btn--active"),
      );
      newTab.classList.add("category-tabs__btn--active");

      const cat = newTab.dataset.cat;
      const filtered =
        cat === "all" ? ARTICLES : ARTICLES.filter((a) => a.category === cat);
      const article = filtered[0];

      if (!article) {
        mainEl.innerHTML =
          '<p style="padding:2rem;color:#6B6B6B;">No articles in this category.</p>';
        return;
      }

      mainEl.innerHTML = `
        <article class="card card--horizontal card--shadow fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
          <a href="${articlePath}?id=${article.id}" class="card__image">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
          </a>
          <div class="card__body">
            <span class="tag tag--${article.category}" style="margin-bottom:0.5rem;">${CATEGORY_LABELS[article.category] || article.category}</span>
            <a href="${articlePath}?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
            <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="meta card__meta">
              <span>${escapeHtml(article.author)}</span><span class="meta__separator"></span><time>${getTimeAgo(article.createdAt)}</time>
            </div>
          </div>
        </article>`;
    });
  });

  // Trigger click on active tab to populate initial content
  const activeTab = $(".category-tabs__btn--active");
  if (activeTab && activeTab.tagName !== "A") {
    activeTab.click();
  }
}

// ─── TICKER ──────────────────────────────────────────────────
function initTicker() {
  const tickerWrap = $("#tickerContent");
  if (!tickerWrap) return;

  onValue(ref(db, "ticker"), (snapshot) => {
    if (!snapshot.exists()) return;
    const items = [];
    snapshot.forEach((child) => {
      if (child.val().active) items.push(child.val());
    });
    items.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (items.length > 0) {
      const tickerHtml = items
        .map(
          (item) => `
        <div class="ticker__item">
          <span class="ticker__dot"></span>
          <span>${escapeHtml(item.text)}</span>
        </div>
      `,
        )
        .join("");

      // Duplicate the content so the -50% CSS translation creates a seamless infinite loop
      // We repeat it 4 times just in case there's only 1 short breaking news item,
      // ensuring it fills ultra-wide screens, while the -50% CSS transform still loops perfectly.
      tickerWrap.innerHTML = tickerHtml.repeat(4);
    }
  });
}

// ─── LANDING PAGE HOME RENDER (Dynamic Sections) ────────────
function initHome() {
  if (!FIREBASE_READY) return;
  const heroSection = $("#hero");
  const latestList = $("#latestList");
  const featuredList = $("#featuredList");
  const trendingList = $("#trendingList");
  const opinionList = $("#opinionList");

  // Featured Articles (isFeatured: true)
  const featuredArticles = ARTICLES.filter((a) => a.isFeatured);

  // 1. HERO (Takes all featured articles, horizontally scrolls)
  if (heroSection) {
    const heroArticles =
      featuredArticles.length > 0
        ? featuredArticles
        : ARTICLES.length > 0
          ? [ARTICLES[0]]
          : [];
    if (heroArticles.length > 0) {
      const slides = heroArticles
        .map(
          (heroArticle, index) => `
        <div class="hero__slide" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${heroArticle.id}'">
          <div class="hero__image">
            <img src="${heroArticle.image}" alt="${escapeHtml(heroArticle.title)}" loading="${index === 0 ? "eager" : "lazy"}">
          </div>
          <div class="hero__overlay"></div>
          <div class="container hero__content fade-in fade-in--visible">
            <a href="${articlePath}?id=${heroArticle.id}" class="tag tag--accent hero__tag">Featured</a>
            <h1 class="hero__title">${escapeHtml(heroArticle.title)}</h1>
            <p class="hero__excerpt">${escapeHtml(heroArticle.excerpt)}</p>
            <div class="meta hero__meta">
              <a href="#">${escapeHtml(heroArticle.author)}</a>
              <span class="meta__separator"></span>
              <time>${getTimeAgo(heroArticle.createdAt)}</time>
              <span class="meta__separator"></span>
              <span>${heroArticle.readTime || "5 min read"}</span>
            </div>
          </div>
        </div>
      `,
        )
        .join("");

      heroSection.innerHTML = `
        <div class="hero__slider" id="heroSlider">
          ${slides}
        </div>
      `;

      if (heroArticles.length > 1) {
        let currentIndex = 0;
        const slider = $("#heroSlider");
        setHeroAutoScroll(slider, heroArticles.length);
      }
    }
  }

  // 2. LATEST NEWS (Next 3 newest articles, skipping the hero one)
  if (latestList) {
    const heroId = (
      featuredArticles.length > 0 ? featuredArticles[0] : ARTICLES[0]
    )?.id;
    const latestArticles = ARTICLES.filter(
      (a) => String(a.id) !== String(heroId),
    ).slice(0, 16);

    if (latestArticles.length > 0) {
      latestList.innerHTML = latestArticles
        .map(
          (article) => `
        <article class="card card--shadow fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
          <a href="${articlePath}?id=${article.id}" class="card__image">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
            <span class="tag tag--${article.category} card__tag">${CATEGORY_LABELS[article.category] || article.category}</span>
          </a>
          <div class="card__body">
            <a href="${articlePath}?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
            <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="meta card__meta">
              <span>${escapeHtml(article.author)}</span>
              <span class="meta__separator"></span>
              <time>${getTimeAgo(article.createdAt)}</time>
            </div>
          </div>
        </article>
      `,
        )
        .join("");
    } else {
      latestList.innerHTML = "<p>No latest news yet.</p>";
    }
  }

  // 3. FEATURED STORIES LIST (Takes the next featured articles)
  if (featuredList) {
    const heroId = featuredArticles.length > 0 ? featuredArticles[0].id : null;
    let featuredSecondary = featuredArticles
      .filter((a) => String(a.id) !== String(heroId))
      .slice(0, 3);

    // Pad with latest articles if not enough featured are marked
    if (featuredSecondary.length < 3) {
      const existingIds = [heroId, ...featuredSecondary.map((a) => a.id)];
      const fillers = ARTICLES.filter((a) => !existingIds.includes(a.id));
      featuredSecondary = [...featuredSecondary, ...fillers].slice(0, 3);
    }

    if (featuredSecondary.length > 0) {
      const mainFeature = featuredSecondary[0];
      const sideFeatures = featuredSecondary.slice(1);

      let html = `
        <div class="featured-grid__main fade-in fade-in--visible">
          <article class="card card--featured" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${mainFeature.id}'">
            <a href="${articlePath}?id=${mainFeature.id}" class="card__image">
              <img src="${mainFeature.image}" alt="${escapeHtml(mainFeature.title)}" loading="lazy">
            </a>
            <div class="card__body">
              <a href="${catPath}?cat=${mainFeature.category}" class="tag tag--accent" style="position:relative;margin-bottom:0.75rem;">${CATEGORY_LABELS[mainFeature.category] || mainFeature.category}</a>
              <a href="${articlePath}?id=${mainFeature.id}"><h3 class="card__title">${escapeHtml(mainFeature.title)}</h3></a>
              <p class="card__excerpt">${escapeHtml(mainFeature.excerpt)}</p>
              <div class="meta">
                <span>${escapeHtml(mainFeature.author)}</span>
                <span class="meta__separator"></span>
                <time>${getTimeAgo(mainFeature.createdAt)}</time>
              </div>
            </div>
          </article>
        </div>
      `;

      if (sideFeatures.length > 0) {
        html += `<div class="featured-grid__side">`;
        html += sideFeatures
          .map(
            (sf) => `
          <article class="card card--horizontal card--shadow fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${sf.id}'">
            <a href="${articlePath}?id=${sf.id}" class="card__image">
              <img src="${sf.image}" alt="${escapeHtml(sf.title)}" loading="lazy">
            </a>
            <div class="card__body">
              <span class="tag tag--${sf.category}" style="margin-bottom:0.5rem;display:inline-block;">${CATEGORY_LABELS[sf.category] || sf.category}</span>
              <a href="${articlePath}?id=${sf.id}"><h3 class="card__title" style="font-size:1.1rem;margin-bottom:0.5rem;">${escapeHtml(sf.title)}</h3></a>
              <div class="meta card__meta" style="margin-top:0;">
                <span>${escapeHtml(sf.author)}</span>
                <span class="meta__separator"></span>
                <time>${getTimeAgo(sf.createdAt)}</time>
              </div>
            </div>
          </article>
        `,
          )
          .join("");
        html += `</div>`;
      }
      featuredList.innerHTML = html;
    } else {
      featuredList.innerHTML = "<p>No additional featured stories.</p>";
    }
  }

  // 4. TRENDING NOW (isTrending: true)
  if (trendingList) {
    const trendingArticles = ARTICLES.filter((a) => a.isTrending).slice(0, 6);
    if (trendingArticles.length > 0) {
      trendingList.innerHTML = trendingArticles
        .map(
          (article, index) => `
        <div class="trending-item fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
          <div class="trending-item__number">0${index + 1}</div>
          <div class="trending-item__content">
            <a href="${articlePath}?id=${article.id}"><h3 class="trending-item__title">${escapeHtml(article.title)}</h3></a>
            <div class="meta"><span>${escapeHtml(article.author)}</span><span class="meta__separator"></span><time>${getTimeAgo(article.createdAt)}</time></div>
          </div>
        </div>
      `,
        )
        .join("");
    } else {
      trendingList.innerHTML = "<p>No trending stories right now.</p>";
    }
  }

  // 5. OPINION
  if (opinionList) {
    const opinionArticles = ARTICLES.filter(
      (a) => a.category === "opinion",
    ).slice(0, 3);
    if (opinionArticles.length > 0) {
      opinionList.innerHTML = opinionArticles
        .map((article) => {
          const initials = article.author
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();
          return `
        <article class="opinion-card fade-in fade-in--visible" style="cursor: pointer;" onclick="window.location.href='${articlePath}?id=${article.id}'">
          <a href="${articlePath}?id=${article.id}"><h3 class="opinion-card__title">${escapeHtml(article.title)}</h3></a>
          <div class="opinion-card__author">
            <div class="opinion-card__avatar">${initials}</div>
            <div>
              <div class="opinion-card__author-name">${escapeHtml(article.author)}</div>
              <div class="opinion-card__author-title">Pahari Abirta Contributor</div>
            </div>
          </div>
        </article>
      `;
        })
        .join("");
    } else {
      opinionList.innerHTML = "<p>No opinion pieces available.</p>";
    }
  }
}

// ─── HELPERS ────────────────────────────────────────────────
function setHeroAutoScroll(slider, totalSlides) {
  if (totalSlides <= 1) return;

  // --- CLONING FOR INFINITE LOOP ---
  const firstClone = slider.children[0].cloneNode(true);
  const lastClone = slider.children[totalSlides - 1].cloneNode(true);
  
  firstClone.classList.add('hero-clone');
  lastClone.classList.add('hero-clone');

  slider.appendChild(firstClone);
  slider.insertBefore(lastClone, slider.children[0]);

  let currentIndex = 1; // Start at first actual slide
  
  // Initial position
  slider.style.transition = 'none';
  slider.style.transform = `translateX(-${currentIndex * 100}%)`;
  slider.offsetHeight; // Force reflow

  let interval;

  const moveToSlide = (index) => {
    currentIndex = index;
    slider.style.transition = ''; // Restore CSS defined transition
    slider.style.transform = `translateX(-${currentIndex * 100}%)`;
  };

  const startAutoScroll = () => {
    clearInterval(interval);
    interval = setInterval(() => {
      // Pause automatic sliding if the user is on another tab to prevent transition desync
      if (document.hidden) return;
      moveToSlide(currentIndex + 1);
    }, 5000); // 5 seconds interval
  };

  startAutoScroll(); // Start initially

  slider.addEventListener('transitionend', () => {
    // Silent jump when reaching edge clones
    if (currentIndex <= 0) {
      slider.style.transition = 'none';
      currentIndex = totalSlides;
      slider.style.transform = `translateX(-${currentIndex * 100}%)`;
      slider.offsetHeight; // Force reflow
    } else if (currentIndex >= totalSlides + 1) {
      slider.style.transition = 'none';
      currentIndex = 1;
      slider.style.transform = `translateX(-${currentIndex * 100}%)`;
      slider.offsetHeight; // Force reflow
    }
  });

  // --- MANUAL SWIPE / DRAG LOGIC ---
  let isDragging = false;
  let startPos = 0;
  let hasDragged = false;

  const getPos = (e) => e.type.includes("mouse") ? e.pageX : e.touches[0].clientX;

  const touchStart = (e) => {
    if (e.type.includes("mouse") && e.button !== 0) return; // Only left click
    
    // Jump instantly if we were currently resting on a clone before starting drag
    if (currentIndex === 0) {
      currentIndex = totalSlides;
    } else if (currentIndex === totalSlides + 1) {
      currentIndex = 1;
    }
    
    slider.style.transition = 'none';
    slider.style.transform = `translateX(-${currentIndex * 100}%)`;
    slider.offsetHeight; // Force reflow

    isDragging = true;
    hasDragged = false;
    startPos = getPos(e);
    clearInterval(interval); // Pause auto scroll
  };

  const touchMove = (e) => {
    if (!isDragging) return;
    const diff = getPos(e) - startPos;
    if (Math.abs(diff) > 10) hasDragged = true; // Threshold to differentiate click vs drag
    
    slider.style.transform = `translateX(calc(-${currentIndex * 100}% + ${diff}px))`;
  };

  const touchEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    let diff = 0;
    if (e.type.includes("mouse")) {
      diff = e.pageX - startPos;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      diff = e.changedTouches[0].clientX - startPos;
    }

    // Threshold to change slide
    if (diff < -50) {
      moveToSlide(currentIndex + 1);
    } else if (diff > 50) {
      moveToSlide(currentIndex - 1);
    } else {
      moveToSlide(currentIndex); // Snap back to current
    }
    
    startAutoScroll(); // Resume auto scroll
  };

  // Touch Events
  slider.addEventListener("touchstart", touchStart, { passive: true });
  slider.addEventListener("touchmove", touchMove, { passive: true });
  slider.addEventListener("touchend", touchEnd);
  
  // Mouse Events
  slider.addEventListener("mousedown", touchStart);
  window.addEventListener("mousemove", touchMove);
  window.addEventListener("mouseup", touchEnd);

  // Prevent simulated clicks or default link behavior if a drag occurred
  slider.addEventListener("click", (e) => {
    if (hasDragged) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true); // Use capture phase to intercept early
}

function getArticleId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || null;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function highlightQuery(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  return escaped.replace(
    regex,
    '<mark style="background:#C9A227;color:#fff;padding:0 2px;border-radius:2px;">$1</mark>',
  );
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── CATEGORY UI (Dynamic Navs & Pills) ─────────────────────
function initCategoriesUI() {
  if (!FIREBASE_READY) return;

  const headerNav = $(".header__nav-list");
  const mobileNav = $(".mobile-nav__list");
  const mobilePills = $("#mobilePills");

  // We skip 'all' for standard nav
  const catSlugs = Object.keys(CATEGORY_LABELS).filter((c) => c !== "all");

  const renderNavItems = (isMobile) => {
    let html = isMobile
      ? `<li><a href="/" class="mobile-nav__link">Home</a></li>`
      : "";
    html += catSlugs
      .map(
        (slug) => `
      <li><a href="${catPath}?cat=${slug}" class="${isMobile ? "mobile-nav__link" : "header__nav-link"}">${escapeHtml(CATEGORY_LABELS[slug])}</a></li>
    `,
      )
      .join("");
    if (isMobile)
      html += `<li><a href="/search" class="mobile-nav__link">Search</a></li>`;
    return html;
  };

  if (headerNav) {
    headerNav.innerHTML = `
      <li><a href="/#latest" class="header__nav-link">Latest News</a></li>
      <li><a href="/#featured" class="header__nav-link">Featured Stories</a></li>
      <li><a href="/#trending" class="header__nav-link">Trending Now</a></li>
      <li><a href="/#opinion" class="header__nav-link">Opinion</a></li>
    `;
  }

  if (mobileNav) {
    mobileNav.innerHTML = `
      <li><a href="/#latest" class="mobile-nav__link">Latest News</a></li>
      <li><a href="/#featured" class="mobile-nav__link">Featured Stories</a></li>
      <li><a href="/#trending" class="mobile-nav__link">Trending Now</a></li>
      <li><a href="/#opinion" class="mobile-nav__link">Opinion</a></li>
    `;
  }

  if (mobilePills) {
    const isHome =
      window.location.pathname.endsWith("index.html") ||
      window.location.pathname === "/" ||
      window.location.pathname.endsWith("pahariabirta/");
    let pillsHtml = `<a href="/" class="mobile-pills__item ${isHome ? "mobile-pills__item--active" : ""}">Top Stories</a>`;

    // check URL for active pillar
    const params = new URLSearchParams(window.location.search);
    const activeCat = params.get("cat");

    pillsHtml += catSlugs
      .map(
        (slug) => `
      <a href="${catPath}?cat=${slug}" class="mobile-pills__item ${activeCat === slug ? "mobile-pills__item--active" : ""}">${escapeHtml(CATEGORY_LABELS[slug])}</a>
    `,
      )
      .join("");

    mobilePills.innerHTML = pillsHtml;
  }
}

// ─── ANALYTICS ──────────────────────────────────────────────
async function trackAnalytics() {
  try {
    const now = new Date();
    // Use local Date to match Indian time for local context, padding zeros:
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const today = `${yy}-${mm}-${dd}`;
    const month = `${yy}-${mm}`;

    if (!sessionStorage.getItem('visited_today')) {
      update(ref(db, 'analytics/visits'), {
        [today]: increment(1),
        [month]: increment(1),
        'total': increment(1)
      }).catch(e => console.error("Analytics Visit Error:", e));
      sessionStorage.setItem('visited_today', 'true');
    }

    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('id') || null;

    if (articleId && !sessionStorage.getItem(`viewed_${articleId}`)) {
      update(ref(db, `analytics/article_views/${articleId}`), {
        [today]: increment(1),
        [month]: increment(1),
        'total': increment(1)
      }).catch(e => console.error("Analytics View Error:", e));
      sessionStorage.setItem(`viewed_${articleId}`, 'true');
    }
  } catch (err) {
    console.error("Analytics error:", err);
  }
}

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  trackAnalytics();
  initNav();
  initPWA();
  initScrollAnimations();


  // Wait for initial Firebase data load before populating content
  await fetchFirebaseData();

  initTicker();
  initLikes();
  initShare();
  initComments();
  initNotifications();
});
