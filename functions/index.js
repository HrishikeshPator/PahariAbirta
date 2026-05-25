const { onValueCreated } = require('firebase-functions/v2/database');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const fs = require('fs');
const path = require('path');

initializeApp();

// ─── ARTICLE META (OG TAGS FOR SOCIAL SHARING) ─────────────
// This function intercepts requests to /article and injects
// Open Graph meta tags so Facebook, WhatsApp, Telegram etc.
// show a rich preview with image, title, and description.

// Cache the article.html template in memory (read once per cold start)
let cachedTemplate = null;

function getTemplate() {
  if (cachedTemplate) return cachedTemplate;
  // The article.html is bundled alongside the function via the predeploy copy
  const templatePath = path.join(__dirname, 'article.html');
  if (fs.existsSync(templatePath)) {
    cachedTemplate = fs.readFileSync(templatePath, 'utf8');
    return cachedTemplate;
  }
  return null;
}

exports.articleMeta = onRequest(
  { region: 'us-central1' },
  async (req, res) => {
    const articleId = req.query.id;

    // Read the template
    let html = getTemplate();

    if (!articleId || !html) {
      if (html) {
        res.status(200).send(html);
      } else {
        res.status(404).send('Not found');
      }
      return;
    }

    try {
      const db = getDatabase();
      const snapshot = await db.ref(`articles/${articleId}`).once('value');

      if (!snapshot.exists()) {
        res.status(200).send(html);
        return;
      }

      const article = snapshot.val();
      const title = escapeHtml(article.title || 'Pahari Abirta');
      const description = escapeHtml(article.excerpt || 'Read the latest news from Pahari Abirta.');
      const imageUrl = article.image || 'https://www.pahariabirtanews.in/logo.png';
      const articleUrl = `https://www.pahariabirtanews.in/article?id=${articleId}`;

      // Build the OG meta tags to inject
      const ogTags = `
    <link rel="canonical" href="${articleUrl}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${imageUrl}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${articleUrl}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Pahari Abirta">
    <meta property="og:locale" content="as_IN">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${imageUrl}">
    <meta name="description" content="${description}">`;

      // Replace existing static meta tags with dynamic ones
      // Remove old tags that will be in our new injected block
      html = html.replace(/<meta property="og:type"[^>]*>\s*/g, '');
      html = html.replace(/<meta property="og:site_name"[^>]*>\s*/g, '');
      html = html.replace(/<meta property="og:image"[^>]*>\s*/g, '');
      html = html.replace(/<meta property="og:locale"[^>]*>\s*/g, '');
      html = html.replace(/<meta name="twitter:card"[^>]*>\s*/g, '');
      html = html.replace(/<meta name="description"[^>]*>\s*/g, '');
      html = html.replace(/<link rel="canonical"[^>]*>\s*/g, '');

      // Update the <title> tag
      html = html.replace(
        /<title>.*?<\/title>/,
        `<title>${title} — Pahari Abirta</title>`
      );

      // Inject OG tags right after the viewport meta tag
      html = html.replace(
        /(<meta name="viewport"[^>]*>)/,
        `$1${ogTags}`
      );

      res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
      res.status(200).send(html);
    } catch (error) {
      console.error('articleMeta error:', error);
      res.status(200).send(html);
    }
  }
);

// Helper: escape HTML for safe meta tag injection
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}

// ─── PUSH NOTIFICATION ON NEW ARTICLE ───────────────────────
exports.notifyNewArticle = onValueCreated(
  {
    ref: '/articles/{articleId}',
    region: 'us-central1',
    database: 'https://pahariabirta-default-rtdb.firebaseio.com'
  },
  async (event) => {
    const article = event.data.val();

    if (!article || article.status !== 'published') {
      console.log('Skipping: not published');
      return null;
    }

    const articleId = event.params.articleId;
    const title = article.title || 'New Article';
    const excerpt = (article.excerpt || '').substring(0, 100);
    const imageUrl = article.image || '';
    const articleUrl = `https://pahariabirta.web.app/article?id=${articleId}`;

    const db = getDatabase();
    const snapshot = await db.ref('fcm_tokens').once('value');

    if (!snapshot.exists()) {
      console.log('No tokens registered');
      return null;
    }

    const tokens = [];
    const tokenKeys = [];
    snapshot.forEach((child) => {
      const data = child.val();
      if (data && data.token) {
        tokens.push(data.token);
        tokenKeys.push(child.key);
      }
    });

    if (tokens.length === 0) return null;

    console.log(`Sending to ${tokens.length} device(s): "${title}"`);

    // Use sendEachForMulticast with BOTH top-level notification AND webpush
    // Top-level notification = maximum compatibility across all platforms
    // webpush = web-specific overrides (image, click URL, urgency)
    const message = {
      notification: {
        title: title,
        body: excerpt,
        imageUrl: imageUrl || undefined
      },
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '86400'
        },
        notification: {
          title: title,
          body: excerpt,
          icon: 'https://pahariabirta.web.app/favicon-192.png',
          badge: 'https://pahariabirta.web.app/favicon-192.png',
          image: imageUrl || undefined,
          requireInteraction: 'true'
        },
        fcm_options: {
          link: articleUrl
        }
      },
      data: {
        url: articleUrl,
        articleId: articleId,
        title: title,
        body: excerpt,
        image: imageUrl || ''
      },
      tokens: tokens
    };

    try {
      const response = await getMessaging().sendEachForMulticast(message);
      console.log(`Results: ${response.successCount} success, ${response.failureCount} failures`);

      response.responses.forEach((res, idx) => {
        if (res.success) {
          console.log(`Token ${idx}: delivered (messageId: ${res.messageId})`);
        } else {
          console.error(`Token ${idx} FAILED: ${res.error?.code} - ${res.error?.message}`);
        }
      });

      // Clean up invalid tokens
      const invalidKeys = [];
      response.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            invalidKeys.push(tokenKeys[idx]);
          }
        }
      });

      if (invalidKeys.length > 0) {
        console.log(`Removing ${invalidKeys.length} stale token(s)`);
        const updates = {};
        invalidKeys.forEach(key => { updates[`fcm_tokens/${key}`] = null; });
        await db.ref().update(updates);
      }
    } catch (err) {
      console.error('FCM send error:', err);
    }

    return null;
  }
);
