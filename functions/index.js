const { onValueCreated } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

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
          icon: 'https://pahariabirta.web.app/logo.png',
          badge: 'https://pahariabirta.web.app/logo.png',
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
