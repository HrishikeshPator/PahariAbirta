/* ============================================================
   PAHARI ABIRTA — Main JavaScript (Firebase Integrated)
   Navigation, Search, Likes, Comments, Share, Animations
   ============================================================ */

import { db } from './firebase-config.js';
import { ref, get, onValue, push, set, increment, update } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

// Global Data stores
let ARTICLES = [];
let CATEGORY_LABELS = {};
let CATEGORY_DESCRIPTIONS = {};
let articlePath = (window.location.pathname.includes('.html') || window.location.protocol === 'file:') ? 'article.html' : 'article';
let catPath = (window.location.pathname.includes('.html') || window.location.protocol === 'file:') ? 'category.html' : 'category';

// ─── INITIAL DATA FETCH ──────────────────────────────────────
async function fetchFirebaseData() {
  return new Promise((resolve) => {
    // Listen to Categories
    onValue(ref(db, 'categories'), (snapshot) => {
      CATEGORY_LABELS = { all: 'All Stories' };
      CATEGORY_DESCRIPTIONS = { all: 'Browse the latest stories across all our coverage areas' };
      if (snapshot.exists()) {
        const catArr = [];
        snapshot.forEach(child => {
          catArr.push(child.val());
        });

        catArr.sort((a, b) => {
          const orderA = a.order || 0;
          const orderB = b.order || 0;
          if (orderA !== orderB) return orderA - orderB;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        catArr.forEach(cat => {
          CATEGORY_LABELS[cat.slug] = cat.name;
          CATEGORY_DESCRIPTIONS[cat.slug] = cat.description;
        });
      }

      // Update DOM if needed
      updateHeaderNavCategories();
    });

    // Listen to Articles
    onValue(ref(db, 'articles'), (snapshot) => {
      ARTICLES = [];
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          if (child.val().status === 'published') {
            ARTICLES.push({ id: child.key, ...child.val() });
          }
        });
        ARTICLES.sort((a, b) => b.createdAt - a.createdAt);
      }

      // Re-trigger page initializers dependent on data
      initCategoryPage();
      initSearchPage();
      initArticlePage();
      initCategoryTabs(); // Used on landing page
      resolve();
    }, { onlyOnce: false }); // keep listening for updates
  });
}

function updateHeaderNavCategories() {
  const headerNav = document.querySelector('.header__nav-list');
  const mobileNav = document.querySelector('#mobileNav .mobile-nav__list'); // Assuming mobileNav has a list inside

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
}

// ─── DOM HELPERS ────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ─── NAVIGATION ─────────────────────────────────────────────
function initNav() {
  const menuOpen = $('#menuOpen');
  const menuClose = $('#menuClose');
  const mobileNav = $('#mobileNav');
  const navBackdrop = $('#navBackdrop');
  const searchOpen = $('#searchOpen');
  const searchClose = $('#searchClose');
  const searchOverlay = $('#searchOverlay');

  function openDrawer() {
    if (mobileNav) {
      mobileNav.classList.add('mobile-nav--open');
      document.body.style.overflow = 'hidden';
      if (navBackdrop) {
        navBackdrop.style.opacity = '1';
        navBackdrop.style.pointerEvents = 'all';
      }
    }
  }

  function closeDrawer() {
    if (mobileNav) {
      mobileNav.classList.remove('mobile-nav--open');
      document.body.style.overflow = '';
      if (navBackdrop) {
        navBackdrop.style.opacity = '0';
        navBackdrop.style.pointerEvents = 'none';
      }
    }
  }

  if (menuOpen) menuOpen.addEventListener('click', openDrawer);
  if (menuClose) menuClose.addEventListener('click', closeDrawer);
  if (navBackdrop) navBackdrop.addEventListener('click', closeDrawer);

  if (searchOpen && searchOverlay) {
    searchOpen.addEventListener('click', () => {
      searchOverlay.classList.add('search-overlay--open');
      document.body.style.overflow = 'hidden';
      const input = searchOverlay.querySelector('input');
      if (input) setTimeout(() => input.focus(), 100);
    });
  }

  if (searchClose && searchOverlay) {
    searchClose.addEventListener('click', () => {
      searchOverlay.classList.remove('search-overlay--open');
      document.body.style.overflow = '';
    });
  }

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDrawer();
      if (searchOverlay) searchOverlay.classList.remove('search-overlay--open');
      document.body.style.overflow = '';
    }
  });

  // Close search overlay on background click
  if (searchOverlay) {
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) {
        searchOverlay.classList.remove('search-overlay--open');
        document.body.style.overflow = '';
      }
    });
  }
}

// ─── SCROLL ANIMATIONS ─────────────────────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in--visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  $$('.fade-in').forEach((el) => observer.observe(el));
}

// ─── LIKE FUNCTIONALITY ─────────────────────────────────────
function initLikes() {
  const articleId = getArticleId();
  if (!articleId) return;
  const storageKey = `pa_likes_${articleId}`;
  const likedKey = `pa_liked_${articleId}`;

  let count = parseInt(localStorage.getItem(storageKey)) || 124;
  let liked = localStorage.getItem(likedKey) === 'true';

  const likeBtns = [
    { btn: $('#likeBtn'), count: $('#likeCount') },
    { btn: $('#likeBtnBottom'), count: $('#likeCountBottom') }
  ].filter(b => b.btn);

  function updateUI() {
    likeBtns.forEach(({ btn, count: countEl }) => {
      if (countEl) countEl.textContent = count;
      if (liked) {
        btn.classList.add('engagement-btn--liked');
        btn.querySelector('svg').setAttribute('fill', 'currentColor');
      } else {
        btn.classList.remove('engagement-btn--liked');
        btn.querySelector('svg').setAttribute('fill', 'none');
      }
    });
  }

  likeBtns.forEach(({ btn }) => {
    btn.addEventListener('click', () => {
      liked = !liked;
      count += liked ? 1 : -1;
      localStorage.setItem(storageKey, count);
      localStorage.setItem(likedKey, liked);
      updateUI();

      // Micro-animation
      btn.style.transform = 'scale(1.2)';
      setTimeout(() => btn.style.transform = '', 200);
    });
  });

  updateUI();
}

// ─── SHARE FUNCTIONALITY ────────────────────────────────────
function initShare() {
  const shareModal = $('#shareModal');
  if (!shareModal) return;

  const shareBtn = $('#shareBtn');
  const shareBtnBottom = $('#shareBtnBottom');
  const shareClose = $('#shareModalClose');
  const url = encodeURIComponent(window.location.href);
  const title = encodeURIComponent(document.title);

  function openModal() {
    shareModal.classList.add('share-modal--open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    shareModal.classList.remove('share-modal--open');
    document.body.style.overflow = '';
  }

  if (shareBtn) shareBtn.addEventListener('click', openModal);
  if (shareBtnBottom) shareBtnBottom.addEventListener('click', openModal);
  if (shareClose) shareClose.addEventListener('click', closeModal);

  shareModal.addEventListener('click', (e) => {
    if (e.target === shareModal) closeModal();
  });

  // Share links
  const fb = $('#shareFacebook');
  const tw = $('#shareTwitter');
  const wa = $('#shareWhatsApp');
  const tg = $('#shareTelegram');
  const copy = $('#shareCopyLink');

  if (fb) fb.href = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  if (tw) tw.href = `https://twitter.com/intent/tweet?url=${url}&text=${title}`;
  if (wa) wa.href = `https://wa.me/?text=${title}%20${url}`;
  if (tg) tg.href = `https://t.me/share/url?url=${url}&text=${title}`;

  if (copy) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const text = $('#copyLinkText');
        if (text) {
          text.textContent = 'Copied!';
          copy.classList.add('copied');
          setTimeout(() => {
            text.textContent = 'Copy Link';
            copy.classList.remove('copied');
          }, 2000);
        }
      } catch {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = window.location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    });
  }
}

// ─── COMMENTS FUNCTIONALITY ─────────────────────────────────
function initComments() {
  const commentList = $('#commentList');
  if (!commentList) return;

  const articleId = getArticleId();
  if (!articleId) return;
  const storageKey = `pa_comments_${articleId}`;
  let comments = JSON.parse(localStorage.getItem(storageKey)) || [];

  function renderComments() {
    commentList.innerHTML = '';
    comments.forEach((comment, index) => {
      commentList.appendChild(createCommentEl(comment, index));
    });
    updateCommentCounts();
  }

  function createCommentEl(comment, index) {
    const div = document.createElement('div');
    div.className = 'comment';

    const initials = comment.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const timeAgo = getTimeAgo(comment.timestamp);

    let repliesHTML = '';
    if (comment.replies && comment.replies.length > 0) {
      repliesHTML = `<div class="comment__replies">
        ${comment.replies.map(reply => {
        const ri = reply.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        return `<div class="comment">
            <div class="comment__header">
              <div class="comment__avatar">${ri}</div>
              <span class="comment__author">${escapeHtml(reply.name)}</span>
              <span class="comment__time">${getTimeAgo(reply.timestamp)}</span>
            </div>
            <p class="comment__text">${escapeHtml(reply.text)}</p>
          </div>`;
      }).join('')}
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
        <button class="comment__reply-btn" data-index="${index}">Reply</button>
      </div>
      <div class="reply-form" id="replyForm-${index}">
        <input type="text" class="reply-form__input" placeholder="Your name" maxlength="50" id="replyName-${index}">
        <input type="text" class="reply-form__input" placeholder="Write a reply..." maxlength="500" id="replyText-${index}" style="margin-bottom:0.5rem;">
        <button class="reply-form__btn" data-index="${index}">Reply</button>
      </div>
      ${repliesHTML}
    `;

    // Reply toggle
    const replyBtn = div.querySelector('.comment__reply-btn');
    const replyForm = div.querySelector('.reply-form');
    replyBtn.addEventListener('click', () => {
      replyForm.classList.toggle('reply-form--open');
      if (replyForm.classList.contains('reply-form--open')) {
        replyForm.querySelector('input').focus();
      }
    });

    // Reply submit
    const replySubmitBtn = div.querySelector('.reply-form__btn');
    replySubmitBtn.addEventListener('click', () => {
      const nameInput = div.querySelector(`#replyName-${index}`);
      const textInput = div.querySelector(`#replyText-${index}`);
      const name = nameInput.value.trim();
      const text = textInput.value.trim();

      if (!name || !text) return;

      if (!comments[index].replies) comments[index].replies = [];
      comments[index].replies.push({
        name,
        text,
        timestamp: Date.now()
      });

      localStorage.setItem(storageKey, JSON.stringify(comments));
      renderComments();
    });

    return div;
  }

  function updateCommentCounts() {
    const total = comments.reduce((sum, c) => sum + 1 + (c.replies ? c.replies.length : 0), 0);
    const countLabel = $('#commentsCountLabel');
    const commentCount = $('#commentCount');
    const commentCountBottom = $('#commentCountBottom');
    if (countLabel) countLabel.textContent = `${total} comment${total !== 1 ? 's' : ''}`;
    if (commentCount) commentCount.textContent = total;
    if (commentCountBottom) commentCountBottom.textContent = total;
  }

  // Comment submit
  const commentSubmit = $('#commentSubmit');
  if (commentSubmit) {
    commentSubmit.addEventListener('click', () => {
      const name = $('#commentName').value.trim();
      const text = $('#commentText').value.trim();

      if (!name || !text) {
        if (!name) $('#commentName').style.borderColor = '#E74C3C';
        if (!text) $('#commentText').style.borderColor = '#E74C3C';
        setTimeout(() => {
          $('#commentName').style.borderColor = '';
          $('#commentText').style.borderColor = '';
        }, 2000);
        return;
      }

      comments.unshift({
        name,
        text,
        timestamp: Date.now(),
        replies: []
      });

      localStorage.setItem(storageKey, JSON.stringify(comments));
      $('#commentName').value = '';
      $('#commentText').value = '';
      renderComments();
    });
  }

  // Comment scroll button
  const scrollBtn = $('#commentScrollBtn');
  if (scrollBtn) {
    scrollBtn.addEventListener('click', () => {
      const section = $('#commentsSection');
      if (section) section.scrollIntoView({ behavior: 'smooth' });
    });
  }

  renderComments();
}

// ─── CATEGORY PAGE ──────────────────────────────────────────
function initCategoryPage() {
  const articlesContainer = $('#categoryArticles');
  const sidebarContainer = $('#categorySidebarTrending');
  const titleEl = $('#categoryTitle');
  const subtitleEl = $('#categorySubtitle');
  const tabs = $('#categoryTabs');

  if (!articlesContainer) return;

  const params = new URLSearchParams(window.location.search);
  const cat = params.get('cat') || 'all';

  // Update page title
  if (titleEl) {
    titleEl.textContent = cat === 'all' ? 'All Stories' : (CATEGORY_LABELS[cat] || 'Category');
  }
  if (subtitleEl) {
    subtitleEl.textContent = cat === 'all'
      ? 'Browse the latest stories across all our coverage areas'
      : (CATEGORY_DESCRIPTIONS[cat] || '');
  }

  // Update document title
  document.title = (cat === 'all' ? 'All Categories' : (CATEGORY_LABELS[cat] || 'Category')) + ' — Pahari Abirta';

  // Active tab
  if (tabs) {
    $$('.category-tabs__btn', tabs).forEach(btn => {
      btn.classList.toggle('category-tabs__btn--active', btn.dataset.cat === cat);
    });
  }

  // Active nav link
  $$('.header__nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.includes(`cat=${cat}`)) {
      link.classList.add('header__nav-link--active');
    }
  });

  // Filter articles
  const filtered = cat === 'all' ? ARTICLES : ARTICLES.filter(a => a.category === cat);

  // Render articles
  articlesContainer.innerHTML = '';
  if (filtered.length === 0) {
    articlesContainer.innerHTML = `
      <div class="no-results">
        <div class="no-results__icon">📰</div>
        <p class="no-results__text">No articles found in this category</p>
        <p class="no-results__hint">Check back soon for new stories</p>
      </div>`;
    return;
  }

  filtered.forEach(article => {
    articlesContainer.innerHTML += `
      <article class="card card--horizontal card--shadow fade-in fade-in--visible">
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
            <time>${article.date}</time>
            <span class="meta__separator"></span>
            <span>${article.readTime}</span>
          </div>
        </div>
      </article>`;
  });

  // Sidebar trending
  if (sidebarContainer) {
    const trending = ARTICLES.slice(0, 5);
    sidebarContainer.innerHTML = '';
    trending.forEach(article => {
      sidebarContainer.innerHTML += `
        <div class="category-sidebar__item">
          <div class="category-sidebar__img">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
          </div>
          <div>
            <a href="${articlePath}?id=${article.id}"><h4 class="category-sidebar__title">${escapeHtml(article.title)}</h4></a>
            <div class="meta"><time style="font-size:0.75rem">${article.date}</time></div>
          </div>
        </div>`;
    });
  }
}

// ─── SEARCH PAGE ────────────────────────────────────────────
function initSearchPage() {
  const searchInput = $('#searchInput');
  const resultsList = $('#searchResultsList');
  const resultsCount = $('#searchResultsCount');

  if (!searchInput) return;

  // Check URL for query
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') || '';
  if (q) {
    searchInput.value = q;
    performSearch(q);
  }

  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(searchInput.value.trim());
    }, 300);
  });

  function performSearch(query) {
    if (!resultsList || !resultsCount) return;

    if (!query) {
      resultsList.innerHTML = '';
      resultsCount.textContent = '';
      return;
    }

    const q = query.toLowerCase();
    const results = ARTICLES.filter(a => {
      const catLabel = CATEGORY_LABELS[a.category] || a.category;
      return a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.author.toLowerCase().includes(q) ||
        catLabel.toLowerCase().includes(q)
    });

    resultsCount.textContent = `${results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHtml(query)}"`;

    if (results.length === 0) {
      resultsList.innerHTML = `
        <div class="no-results">
          <div class="no-results__icon">🔍</div>
          <p class="no-results__text">No results found for "${escapeHtml(query)}"</p>
          <p class="no-results__hint">Try different keywords or browse our categories</p>
        </div>`;
      return;
    }

    resultsList.innerHTML = '';
    results.forEach(article => {
      resultsList.innerHTML += `
        <div class="search-result">
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
              <time>${article.date}</time>
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
  const articleId = getArticleId();
  if (!articleId) return;

  const article = ARTICLES.find(a => String(a.id) === String(articleId));
  if (!article) return;

  // Update meta
  document.title = `${article.title} — Pahari Abirta`;

  const headerEl = $('#articleHeader');
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
        <span style="color: rgba(255,255,255,0.7);">${article.readTime || '5 min read'}</span>
      </div>
    `;
  }

  const heroImgEl = $('#articleHeroImg');
  if (heroImgEl) {
    heroImgEl.className = 'article-hero__image';
    heroImgEl.innerHTML = `<img src="${article.image}" alt="${escapeHtml(article.title)}" loading="eager">`;
  }

  const contentEl = $('#articleBody');
  if (contentEl && article.body) {
    contentEl.innerHTML = article.body;
  }

  // Active nav link
  $$('.header__nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.includes(`cat=${article.category}`)) {
      link.classList.add('header__nav-link--active');
    }
  });

  // --- Suggested Articles ---
  renderSuggestedArticles(article);
}

function renderSuggestedArticles(currentArticle) {
  const categoryList = $('#categorySuggestionsList');
  const latestList = $('#latestSuggestionsList');
  const categoryTitle = $('#categorySuggestionsTitle');

  if (!categoryList || !latestList || !FIREBASE_READY) return;

  // 1. Category Suggestions
  const categoryArticles = ARTICLES.filter(a =>
    a.category === currentArticle.category && String(a.id) !== String(currentArticle.id)
  ).slice(0, 3);

  if (categoryTitle) {
    categoryTitle.textContent = `More from ${CATEGORY_LABELS[currentArticle.category] || currentArticle.category}`;
  }

  if (categoryArticles.length > 0) {
    categoryList.innerHTML = categoryArticles.map(article => `
      <article class="card card--shadow fade-in fade-in--visible">
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
    `).join('');
  } else {
    const section = categoryList.closest('.suggested-articles');
    if (section) section.style.display = 'none';
  }

  // 2. Latest Suggestions (excluding current)
  const latestArticles = ARTICLES.filter(a => String(a.id) !== String(currentArticle.id)).slice(0, 3);

  if (latestArticles.length > 0) {
    latestList.innerHTML = latestArticles.map(article => `
      <article class="card card--shadow fade-in fade-in--visible">
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
    `).join('');
  }
}


// ─── CATEGORY TABS (LANDING PAGE) ───────────────────────────
function initCategoryTabs() {
  const tabs = $$('.category-tabs__btn[data-cat]');
  const mainEl = $('#categoryMain');

  if (!tabs.length || !mainEl) return;

  tabs.forEach(tab => {
    if (tab.tagName === 'A') return;

    // We recreate listener to avoid duplicates
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);

    newTab.addEventListener('click', () => {
      const currentTabs = $$('.category-tabs__btn[data-cat]');
      currentTabs.forEach(t => t.classList.remove('category-tabs__btn--active'));
      newTab.classList.add('category-tabs__btn--active');

      const cat = newTab.dataset.cat;
      const filtered = cat === 'all' ? ARTICLES : ARTICLES.filter(a => a.category === cat);
      const article = filtered[0];

      if (!article) {
        mainEl.innerHTML = '<p style="padding:2rem;color:#6B6B6B;">No articles in this category.</p>';
        return;
      }

      mainEl.innerHTML = `
        <article class="card card--horizontal card--shadow fade-in fade-in--visible">
          <a href="${articlePath}?id=${article.id}" class="card__image">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
          </a>
          <div class="card__body">
            <span class="tag tag--${article.category}" style="margin-bottom:0.5rem;">${CATEGORY_LABELS[article.category] || article.category}</span>
            <a href="${articlePath}?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
            <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="meta card__meta">
              <span>${escapeHtml(article.author)}</span><span class="meta__separator"></span><time>${article.date}</time>
            </div>
          </div>
        </article>`;
    });
  });

  // Trigger click on active tab to populate initial content
  const activeTab = $('.category-tabs__btn--active');
  if (activeTab && activeTab.tagName !== 'A') {
    activeTab.click();
  }
}

// ─── TICKER ──────────────────────────────────────────────────
function initTicker() {
  const tickerWrap = $('#breakingTicker');
  if (!tickerWrap) return;

  onValue(ref(db, 'ticker'), (snapshot) => {
    if (!snapshot.exists()) return;
    const items = [];
    snapshot.forEach(child => {
      if (child.val().active) items.push(child.val());
    });
    items.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    if (items.length > 0) {
      tickerWrap.innerHTML = items.map(item => `
        <div class="ticker__item">
          <span class="ticker__dot"></span>
          <span>${escapeHtml(item.text)}</span>
        </div>
      `).join('');
    }
  });
}

// ─── LANDING PAGE HOME RENDER ───────────────────────────────
// ─── LANDING PAGE HOME RENDER ───────────────────────────────
function initHome() {
  const heroSection = document.getElementById('hero');
  const latestList = document.getElementById('latestList');
  const featuredList = document.getElementById('featuredList');
  const trendingList = document.getElementById('trendingList');
  const opinionList = document.getElementById('opinionList');

  if (!heroSection && !latestList && !featuredList && !trendingList && !opinionList) return;

  // Split News and Opinions
  const news = ARTICLES.filter(a => !a.isOpinion);
  const opinions = ARTICLES.filter(a => a.isOpinion);

  // 1. Hero & Latest News
  if (news.length > 0) {
    // Hero
    if (heroSection) {
      const featured = news[0];
      heroSection.innerHTML = `
        <div class="container hero__grid">
          <div class="hero-left">
            <article class="card card--featured fade-in fade-in--visible">
              <a href="/article?id=${featured.id}" class="card__image">
                <img src="${featured.image}" alt="${escapeHtml(featured.title)}">
                <span class="badge" style="position: absolute; top: 1rem; left: 1rem; background: var(--color-accent); color: #fff;">LATEST</span>
              </a>
              <div class="card__body">
                <a href="/article?id=${featured.id}"><h2 class="card__title">${escapeHtml(featured.title)}</h2></a>
                <p class="card__excerpt">${escapeHtml(featured.excerpt)}</p>
                <div class="meta">
                  <span>${escapeHtml(featured.author)}</span>
                  <span class="meta__separator"></span>
                  <time>${getTimeAgo(featured.createdAt)}</time>
                  <span class="meta__separator"></span>
                  <span>${featured.readTime}</span>
                </div>
              </div>
            </article>
          </div>
          <div class="hero-right">
            <div class="hero-right-list">
              ${news.slice(1, 4).map(article => `
                <article class="card card--compact fade-in fade-in--visible">
                  <div class="card__body">
                    <span class="tag tag--${article.category}" style="margin-bottom:0.5rem;">${CATEGORY_LABELS[article.category] || article.category}</span>
                    <a href="/article?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
                    <div class="meta">
                      <time>${getTimeAgo(article.createdAt)}</time>
                    </div>
                  </div>
                </article>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    // Latest News Grid (items 4-10)
    if (latestList) {
      const latestItems = news.slice(1, 7); // Show 6 items in the grid
      latestList.innerHTML = latestItems.map(article => `
        <article class="card card--shadow fade-in fade-in--visible">
          <a href="/article?id=${article.id}" class="card__image">
            <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
            <span class="tag tag--${article.category} card__tag">${CATEGORY_LABELS[article.category] || article.category}</span>
          </a>
          <div class="card__body">
            <a href="/article?id=${article.id}"><h3 class="card__title">${escapeHtml(article.title)}</h3></a>
            <p class="card__excerpt">${escapeHtml(article.excerpt)}</p>
            <div class="meta card__meta">
              <span>${escapeHtml(article.author)}</span>
              <span class="meta__separator"></span>
              <time>${getTimeAgo(article.createdAt)}</time>
            </div>
          </div>
        </article>
      `).join('');
    }
  }

  // 2. Featured Stories (using isFeatured flag)
  if (featuredList) {
    const featuredStories = news.filter(a => a.isFeatured).slice(0, 3);
    if (featuredStories.length > 0) {
      const main = featuredStories[0];
      const side = featuredStories.slice(1, 3);

      featuredList.innerHTML = `
        <div class="featured-grid__main fade-in fade-in--visible">
          <article class="card card--featured">
            <a href="/article?id=${main.id}" class="card__image">
              <img src="${main.image}" alt="${escapeHtml(main.title)}">
              <span class="tag tag--${main.category} card__tag">${CATEGORY_LABELS[main.category] || main.category}</span>
            </a>
            <div class="card__body">
              <a href="/article?id=${main.id}"><h3 class="card__title">${escapeHtml(main.title)}</h3></a>
              <p class="card__excerpt">${escapeHtml(main.excerpt)}</p>
              <div class="meta">
                <span>${escapeHtml(main.author)}</span>
                <span class="meta__separator"></span>
                <time>${getTimeAgo(main.createdAt)}</time>
              </div>
            </div>
          </article>
        </div>
        <div class="featured-grid__side">
          ${side.map(article => `
            <article class="card card--shadow fade-in fade-in--visible">
              <a href="/article?id=${article.id}" class="card__image" style="min-height:120px;">
                <img src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">
                <span class="tag tag--${article.category} card__tag">${CATEGORY_LABELS[article.category] || article.category}</span>
              </a>
              <div class="card__body">
                <a href="/article?id=${article.id}"><h4 class="card__title" style="font-size:0.95rem;">${escapeHtml(article.title)}</h4></a>
              </div>
            </article>
          `).join('')}
        </div>
      `;
    }
  }

  // 3. Trending (using isTrending flag)
  if (trendingList) {
    const trending = news.filter(a => a.isTrending).slice(0, 5);
    trendingList.innerHTML = trending.map((article, idx) => `
      <div class="trending-item fade-in fade-in--visible">
        <div class="trending-item__number">${idx + 1}</div>
        <div class="trending-item__content">
          <span class="tag tag--${article.category}" style="font-size:0.7rem; margin-bottom:0.25rem;">${CATEGORY_LABELS[article.category] || article.category}</span>
          <a href="/article?id=${article.id}"><h3 class="trending-item__title">${escapeHtml(article.title)}</h3></a>
          <div class="meta"><time style="font-size:0.7rem;">${getTimeAgo(article.createdAt)}</time></div>
        </div>
      </div>
    `).join('');
  }

  // 4. Opinions
  if (opinionList) {
    opinionList.innerHTML = opinions.slice(0, 3).map(article => {
      const initials = article.author.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
      return `
        <article class="opinion-card fade-in fade-in--visible">
          <a href="/article?id=${article.id}"><h3 class="opinion-card__title">${escapeHtml(article.title)}</h3></a>
          <div class="opinion-card__author">
            <div class="opinion-card__avatar">${initials}</div>
            <div class="opinion-card__author-info">
              <div class="opinion-card__author-name">${escapeHtml(article.author)}</div>
              <div class="opinion-card__author-title">Pahari Abirta Columnist</div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }
}

// ─── HELPERS ────────────────────────────────────────────────
function getArticleId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || null;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function highlightQuery(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(regex, '<mark style="background:#C9A227;color:#fff;padding:0 2px;border-radius:2px;">$1</mark>');
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
      console.log("Tracking new visit today...");
      update(ref(db, 'analytics/visits'), {
        [today]: increment(1),
        [month]: increment(1),
        'total': increment(1)
      })
      .then(() => console.log("Visit tracked globally."))
      .catch(e => console.error("Analytics Visit Error:", e));
      sessionStorage.setItem('visited_today', 'true');
    } else {
      console.log("Already visited today.");
    }

    const articleId = getArticleId();
    if (articleId) {
      if (!sessionStorage.getItem(`viewed_${articleId}`)) {
        console.log(`Tracking view for article: ${articleId}`);
        update(ref(db, 'analytics/article_views'), {
          [articleId]: increment(1)
        })
        .then(() => console.log("Article view tracked."))
        .catch(e => console.error("Analytics View Error:", e));
        sessionStorage.setItem(`viewed_${articleId}`, 'true');
      } else {
        console.log(`Already viewed article: ${articleId}`);
      }
    }
  } catch (err) {
    console.error("Analytics error:", err);
  }
}

// ─── INIT ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  trackAnalytics();
  initNav();
  initScrollAnimations();


  // Wait for initial Firebase data load before populating content
  await fetchFirebaseData();

  initTicker();
  initSectionPills();  // For index.html
  initHome();          // For index.html
  initCategoryTabs();  // For index.html
  initArticlePage();   // For article.html
  initLikes();
  initShare();
  initComments();
  initCategoryPage();  // For category.html
  initSearchPage();    // For search.html
});
