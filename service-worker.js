// service-worker.js - Service Worker for Simple Reminder App
const CACHE_NAME = 'simple-reminders-v1';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './manifest.json'
];

// Install Service Worker
self.addEventListener('install', event => {
    console.log('🔧 SW: Installing Simple Reminder Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('📦 SW: Caching app files');
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

// Activate Service Worker
self.addEventListener('activate', event => {
    console.log('✅ SW: Activating Simple Reminder Service Worker');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ SW: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('🎯 SW: Taking control of all pages');
            return self.clients.claim();
        })
    );
});

// Fetch Strategy - Network first for Pi server, cache first for app files
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // Don't intercept Pi server requests - let them go through directly
    if (url.hostname.includes('192.168.') || url.port === '3001') {
        console.log('🔄 SW: Bypassing cache for Pi server request:', url.pathname);
        return; // Let the request go through without interception
    }
    
    // Cache strategy for app files
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) {
                console.log('📦 SW: Serving from cache:', event.request.url);
                return response;
            }
            
            console.log('🌐 SW: Fetching from network:', event.request.url);
            return fetch(event.request).then(response => {
                // Cache successful responses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            });
        }).catch(error => {
            console.error('❌ SW: Fetch failed:', error);
            // Return a basic offline page or message
            return new Response(JSON.stringify({
                error: 'Network error',
                message: 'Please check your connection and try again'
            }), {
                status: 408,
                headers: { 'Content-Type': 'application/json' }
            });
        })
    );
});

// Push notification handler - Real-time reminders from Pi server
self.addEventListener('push', event => {
    console.log('📱 SW: Push notification received from Pi server!');
    
    let notificationData = {
        title: '⏰ Reminder',
        body: 'You have a scheduled reminder!',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%233b82f6"/><text x="50" y="65" text-anchor="middle" font-size="30" fill="white">⏰</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23ef4444"/><text x="50" y="65" text-anchor="middle" font-size="30" fill="white">🔔</text></svg>',
        tag: 'reminder-notification',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200],
        data: { 
            url: self.location.origin,
            timestamp: Date.now(),
            source: 'pi-reminder-server'
        }
    };

    // Parse push data if available
    if (event.data) {
        try {
            const pushData = event.data.json();
            console.log('📦 SW: Parsed Pi server data:', pushData);
            
            // Merge with default data, prioritizing server data
            notificationData = { 
                ...notificationData, 
                ...pushData,
                // Ensure we always have these iOS-friendly properties
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200]
            };
            
        } catch (e) {
            console.log('📝 SW: Push data as text:', event.data.text());
            notificationData.body = event.data.text();
        }
    }

    // iOS-specific optimizations
    const userAgent = self.navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    
    if (isIOS) {
        console.log('🍎 SW: iOS device detected - optimizing notification');
        // Remove actions for iOS (limited support)
        delete notificationData.actions;
        // Simpler vibration pattern for iOS
        notificationData.vibrate = [200, 100, 200];
        // Ensure interaction required for iOS
        notificationData.requireInteraction = true;
        // iOS-friendly badge
        notificationData.badge = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="40" fill="%23ef4444"/><text x="48" y="65" text-anchor="middle" font-size="24" fill="white">🔔</text></svg>';
    } else {
        // Add action buttons for desktop/Android
        notificationData.actions = [
            { 
                action: 'open', 
                title: '📱 Open App',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>'
            },
            { 
                action: 'dismiss', 
                title: '✕ Dismiss',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
            }
        ];
    }

    console.log('📱 SW: Showing Pi reminder notification:', notificationData.title);
    console.log('📋 SW: Notification body:', notificationData.body);

    // Show the notification
    event.waitUntil(
        self.registration.showNotification(notificationData.title, notificationData)
            .then(() => {
                console.log('✅ SW: Pi reminder notification displayed successfully');
                
                // Notify app if it's open
                return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
            })
            .then(clients => {
                if (clients && clients.length > 0) {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'REMINDER_NOTIFICATION_SHOWN',
                            notification: notificationData,
                            timestamp: Date.now()
                        });
                    });
                    console.log('📨 SW: Notified app about Pi reminder notification');
                }
            })
            .catch(error => {
                console.error('❌ SW: Error showing Pi reminder notification:', error);
            })
    );
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    console.log('🖱️ SW: Pi reminder notification clicked');
    console.log('🎯 SW: Action:', event.action || 'default');
    
    event.notification.close();

    // Handle action buttons
    if (event.action === 'dismiss') {
        console.log('✕ SW: Pi reminder notification dismissed');
        return;
    }

    // Default action or 'open' action - focus/open the app
    event.waitUntil(
        self.clients.matchAll({ 
            type: 'window',
            includeUncontrolled: true 
        }).then(clientList => {
            console.log('🔍 SW: Found', clientList.length, 'open windows');
            
            // Try to focus an existing window
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    console.log('🎯 SW: Focusing existing app window');
                    return client.focus().then(client => {
                        // Send message to the focused client
                        client.postMessage({
                            type: 'REMINDER_NOTIFICATION_CLICKED',
                            action: event.action || 'default',
                            data: event.notification.data,
                            timestamp: Date.now()
                        });
                        return client;
                    });
                }
            }
            
            // No suitable window found, open new one
            if (clients.openWindow) {
                console.log('🆕 SW: Opening new app window');
                return clients.openWindow('./').then(client => {
                    // Wait a bit for the new window to load, then send message
                    setTimeout(() => {
                        if (client) {
                            client.postMessage({
                                type: 'REMINDER_NOTIFICATION_CLICKED',
                                action: event.action || 'default',
                                data: event.notification.data,
                                timestamp: Date.now()
                            });
                        }
                    }, 1000);
                    return client;
                });
            }
        }).catch(error => {
            console.error('❌ SW: Error handling Pi reminder notification click:', error);
        })
    );
});

// Background sync for offline reminder management (future enhancement)
self.addEventListener('sync', event => {
    console.log('🔄 SW: Background sync triggered:', event.tag);
    
    if (event.tag === 'reminder-sync') {
        event.waitUntil(
            // Could implement offline reminder sync here
            Promise.resolve().then(() => {
                console.log('✅ SW: Background reminder sync completed');
            })
        );
    }
});

// Handle push subscription changes
self.addEventListener('pushsubscriptionchange', event => {
    console.log('🔄 SW: Push subscription changed - re-subscribing...');
    
    event.waitUntil(
        // Re-subscribe with new subscription
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: event.oldSubscription.options.applicationServerKey
        }).then(newSubscription => {
            console.log('✅ SW: Re-subscribed with new subscription');
            
            // Send new subscription to Pi server
            return fetch('https://192.168.0.147:3001/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newSubscription)
            });
        }).then(response => {
            if (response.ok) {
                console.log('✅ SW: New subscription sent to Pi server');
            } else {
                console.error('❌ SW: Failed to send new subscription to Pi server');
            }
        }).catch(error => {
            console.error('❌ SW: Error handling subscription change:', error);
        })
    );
});

// Listen for messages from the main app
self.addEventListener('message', event => {
    console.log('📨 SW: Received message from app:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('⏭️ SW: Skip waiting requested');
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ 
            version: CACHE_NAME,
            type: 'simple-reminders'
        });
    }
    
    if (event.data && event.data.type === 'SYNC_REMINDERS') {
        console.log('🔄 SW: Sync reminders message received');
        // Could trigger background sync here
    }
});

// Error handling
self.addEventListener('error', event => {
    console.error('❌ SW: Service Worker error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
    console.error('❌ SW: Unhandled promise rejection:', event.reason);
});

console.log('🚀 SW: Simple Reminder Service Worker loaded and ready for Pi notifications!');
