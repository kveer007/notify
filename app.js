// app.js - Simple Reminder App with Server-side Scheduling

// Global state
let reminders = [];
let serverUrl = 'https://192.168.0.147:3001';
let isOnline = false;
let editingId = null;
let syncInProgress = false;
let swRegistration = null;
let notificationsEnabled = false;
let subscriptionActive = false;

// DOM elements
const statusEl = document.getElementById('status');
const countEl = document.getElementById('count');
const remindersListEl = document.getElementById('remindersList');
const editFormEl = document.getElementById('editForm');
const iosNoticeEl = document.getElementById('iosNotice');
const notificationSetupEl = document.getElementById('notificationSetup');
const notificationStatusEl = document.getElementById('notificationStatus');
const enableNotificationsBtn = document.getElementById('enableNotificationsBtn');

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Simple Reminder App starting...');
    
    // Load local data first
    loadLocalReminders();
    renderReminders();
    
    // Check iOS and setup PWA
    checkiOSDevice();
    await setupServiceWorker();
    
    // Connect to server
    await connectToServer();
    
    // Set default datetime
    setDefaultDateTime();
    
    // Setup notification button
    enableNotificationsBtn.addEventListener('click', enableNotifications);
    
    // Check notification status
    updateNotificationUI();
    
    console.log('✅ App initialization complete');
});

// Check if iOS device and show installation notice
function checkiOSDevice() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone || 
                        window.matchMedia('(display-mode: standalone)').matches;
    
    if (isIOS) {
        console.log('🍎 iOS device detected');
        if (!isStandalone) {
            iosNoticeEl.style.display = 'block';
            console.log('📱 Showing iOS installation notice');
        } else {
            console.log('✅ Running in PWA mode');
        }
    }
}

// Setup Service Worker for notifications
async function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            console.log('🔧 Registering service worker...');
            swRegistration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker registered successfully');
            
            // Wait for it to be ready
            await swRegistration.ready;
            console.log('✅ Service Worker is ready');
            
        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
            showNotificationError('Service Worker registration failed');
        }
    } else {
        console.error('❌ Service Workers not supported');
        showNotificationError('Service Workers not supported in this browser');
    }
}

// Enable notifications - user triggered
async function enableNotifications() {
    try {
        console.log('🔔 User clicked enable notifications');
        enableNotificationsBtn.disabled = true;
        enableNotificationsBtn.textContent = '🔄 Setting up...';
        
        // Check service worker first
        if (!swRegistration) {
            throw new Error('Service Worker not available');
        }
        
        // Request notification permission
        console.log('📝 Requesting notification permission...');
        let permission = Notification.permission;
        
        if (permission === 'default') {
            permission = await Notification.requestPermission();
            console.log('📋 Permission result:', permission);
        }
        
        if (permission !== 'granted') {
            throw new Error('Notification permission denied');
        }
        
        // Check if server is online
        if (!isOnline) {
            throw new Error('Server not connected. Please wait for connection.');
        }
        
        // Get VAPID key from server
        console.log('🔑 Getting VAPID key from server...');
        const vapidResponse = await fetch(serverUrl + '/vapid-public-key');
        if (!vapidResponse.ok) {
            throw new Error(`VAPID endpoint failed: ${vapidResponse.status}`);
        }
        
        const { publicKey } = await vapidResponse.json();
        console.log('✅ VAPID key received');
        
        // Create push subscription
        console.log('📱 Creating push subscription...');
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
        
        console.log('✅ Push subscription created');
        
        // Send subscription to server
        console.log('📤 Sending subscription to server...');
        const subscribeResponse = await fetch(serverUrl + '/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        
        if (!subscribeResponse.ok) {
            throw new Error(`Subscription failed: ${subscribeResponse.status}`);
        }
        
        const result = await subscribeResponse.json();
        console.log('✅ Subscription successful:', result);
        
        // Update state
        notificationsEnabled = true;
        subscriptionActive = true;
        
        // Save notification state
        localStorage.setItem('notifications_enabled', 'true');
        
        // Update UI
        updateNotificationUI();
        
        console.log('🎉 Notifications fully enabled!');
        
    } catch (error) {
        console.error('❌ Enable notifications failed:', error);
        showNotificationError(error.message);
        
        // Reset button
        enableNotificationsBtn.disabled = false;
        enableNotificationsBtn.textContent = '🔔 Enable Notifications';
    }
}

// Update notification UI based on current state
function updateNotificationUI() {
    // Check saved state
    const savedState = localStorage.getItem('notifications_enabled');
    const permission = Notification.permission;
    
    console.log('🔍 Checking notification state:', { savedState, permission, isOnline });
    
    if (permission === 'granted' && savedState === 'true' && isOnline) {
        // Notifications are enabled and working
        notificationSetupEl.style.display = 'none';
        notificationStatusEl.style.display = 'block';
        notificationStatusEl.className = 'notification-status';
        notificationStatusEl.textContent = '✅ Notifications enabled and ready!';
        notificationsEnabled = true;
    } else if (permission === 'denied') {
        // Permission denied
        notificationSetupEl.style.display = 'none';
        notificationStatusEl.style.display = 'block';
        notificationStatusEl.className = 'notification-status error';
        notificationStatusEl.textContent = '❌ Notifications blocked. Please enable in browser settings.';
    } else if (!isOnline) {
        // Server not connected
        notificationSetupEl.style.display = 'none';
        notificationStatusEl.style.display = 'block';
        notificationStatusEl.className = 'notification-status error';
        notificationStatusEl.textContent = '⚠️ Connect to server to enable notifications';
    } else {
        // Show enable button
        notificationSetupEl.style.display = 'block';
        notificationStatusEl.style.display = 'none';
        enableNotificationsBtn.disabled = false;
        enableNotificationsBtn.textContent = '🔔 Enable Notifications';
    }
}

// Show notification error
function showNotificationError(message) {
    notificationSetupEl.style.display = 'none';
    notificationStatusEl.style.display = 'block';
    notificationStatusEl.className = 'notification-status error';
    notificationStatusEl.textContent = `❌ ${message}`;
}

// VAPID key conversion
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Load reminders from localStorage
function loadLocalReminders() {
    try {
        const saved = localStorage.getItem('simple_reminders');
        if (saved) {
            reminders = JSON.parse(saved);
            console.log('📱 Loaded', reminders.length, 'local reminders');
        }
    } catch (error) {
        console.error('❌ Error loading local reminders:', error);
        reminders = [];
    }
}

// Save reminders to localStorage
function saveLocalReminders() {
    try {
        localStorage.setItem('simple_reminders', JSON.stringify(reminders));
        console.log('💾 Saved', reminders.length, 'reminders locally');
    } catch (error) {
        console.error('❌ Error saving local reminders:', error);
    }
}

// Connect to server and enable sync
async function connectToServer() {
    try {
        updateStatus('📡 Connecting...', 'offline');
        
        const response = await fetch(serverUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            isOnline = true;
            updateStatus('🟢 Online - Server connected', 'online');
            console.log('✅ Connected to server:', data.message);
            
            // Update notification UI now that server is online
            updateNotificationUI();
            
            // Sync reminders
            await syncWithServer();
            
        } else {
            throw new Error(`Server returned ${response.status}`);
        }
    } catch (error) {
        isOnline = false;
        updateStatus('🔴 Offline - Working locally', 'offline');
        console.log('❌ Server connection failed:', error.message);
        
        // Update notification UI for offline state
        updateNotificationUI();
    }
}

// Sync reminders with server
async function syncWithServer() {
    if (!isOnline || syncInProgress) return;
    
    try {
        syncInProgress = true;
        updateStatus('📤 Syncing with server...', 'syncing');
        
        console.log('🔄 Syncing', reminders.length, 'reminders with server...');
        
        const response = await fetch(serverUrl + '/sync-reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reminders })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Sync successful:', result.message);
            console.log('📊 Server stats:', result.stats);
            
            updateStatus('🟢 Online - Synced successfully', 'online');
        } else {
            throw new Error(`Sync failed: ${response.status}`);
        }
        
    } catch (error) {
        console.error('❌ Sync failed:', error);
        updateStatus('⚠️ Sync failed - Working offline', 'offline');
        isOnline = false;
        updateNotificationUI();
    } finally {
        syncInProgress = false;
    }
}

// Update status display
function updateStatus(message, type) {
    statusEl.innerHTML = `<span>${type === 'online' ? '🟢' : type === 'syncing' ? '📤' : '🔴'}</span> ${message}`;
    statusEl.className = `status ${type}`;
}

// Set default datetime (1 hour from now)
function setDefaultDateTime() {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5); // Round to nearest 5 minutes
    document.getElementById('dateTime').value = now.toISOString().slice(0, 16);
}

// Quick time setters
function setQuickTime(minutes) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    document.getElementById('dateTime').value = now.toISOString().slice(0, 16);
}

// Add new reminder
function addReminder() {
    const dateTime = document.getElementById('dateTime').value;
    const note = document.getElementById('note').value.trim();
    const repeat = document.getElementById('repeat').value;

    // Validation
    if (!dateTime) {
        alert('Please select a date and time');
        return;
    }
    
    if (!note) {
        alert('Please enter a reminder note');
        return;
    }
    
    // Check if time is in the past
    const reminderTime = new Date(dateTime);
    const now = new Date();
    if (reminderTime <= now) {
        if (!confirm('This time is in the past. Add anyway?')) {
            return;
        }
    }

    // Create reminder object
    const reminder = {
        id: Date.now(),
        dateTime: dateTime,
        note: note,
        repeat: repeat,
        created: new Date().toISOString()
    };

    // Add to local array
    reminders.push(reminder);
    saveLocalReminders();
    renderReminders();
    
    // Clear form
    clearAddForm();
    
    console.log('➕ Added reminder:', reminder);
    
    // Sync with server if online
    if (isOnline) {
        syncWithServer();
    }
}

// Clear add form
function clearAddForm() {
    document.getElementById('note').value = '';
    document.getElementById('repeat').value = 'once';
    setDefaultDateTime();
}

// Edit reminder
function editReminder(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;

    editingId = id;
    
    // Populate edit form
    document.getElementById('editDateTime').value = reminder.dateTime;
    document.getElementById('editNote').value = reminder.note;
    document.getElementById('editRepeat').value = reminder.repeat;
    
    // Show edit form
    editFormEl.style.display = 'block';
    editFormEl.scrollIntoView({ behavior: 'smooth' });
    
    console.log('✏️ Editing reminder:', id);
}

// Save edited reminder
function saveEdit() {
    const dateTime = document.getElementById('editDateTime').value;
    const note = document.getElementById('editNote').value.trim();
    const repeat = document.getElementById('editRepeat').value;

    // Validation
    if (!dateTime || !note) {
        alert('Please fill in both date/time and note');
        return;
    }

    // Find and update reminder
    const reminderIndex = reminders.findIndex(r => r.id === editingId);
    if (reminderIndex !== -1) {
        const oldReminder = { ...reminders[reminderIndex] };
        
        reminders[reminderIndex] = {
            ...reminders[reminderIndex],
            dateTime: dateTime,
            note: note,
            repeat: repeat,
            modified: new Date().toISOString()
        };

        saveLocalReminders();
        renderReminders();
        cancelEdit();
        
        console.log('✏️ Updated reminder:', reminders[reminderIndex]);
        
        // Sync with server if online
        if (isOnline) {
            syncWithServer();
        }
    }
}

// Cancel edit
function cancelEdit() {
    editingId = null;
    editFormEl.style.display = 'none';
    console.log('❌ Cancelled edit');
}

// Delete reminder
function deleteReminder(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    
    if (confirm(`Delete reminder: "${reminder.note}"?`)) {
        reminders = reminders.filter(r => r.id !== id);
        saveLocalReminders();
        renderReminders();
        
        console.log('🗑️ Deleted reminder:', id);
        
        // Sync with server if online
        if (isOnline) {
            syncWithServer();
        }
    }
}

// Render reminders list
function renderReminders() {
    countEl.textContent = reminders.length;
    
    if (reminders.length === 0) {
        remindersListEl.innerHTML = '<div class="empty">No reminders yet. Add one above! 👆</div>';
        return;
    }

    // Sort by datetime (upcoming first)
    const sortedReminders = [...reminders].sort((a, b) => 
        new Date(a.dateTime) - new Date(b.dateTime)
    );

    remindersListEl.innerHTML = sortedReminders.map(reminder => {
        const reminderTime = new Date(reminder.dateTime);
        const now = new Date();
        const isPast = reminderTime < now;
        const isToday = reminderTime.toDateString() === now.toDateString();
        const isTomorrow = reminderTime.toDateString() === new Date(now.getTime() + 24*60*60*1000).toDateString();
        
        // Format date/time
        let timeDisplay;
        if (isToday) {
            timeDisplay = 'Today ' + reminderTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } else if (isTomorrow) {
            timeDisplay = 'Tomorrow ' + reminderTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        } else {
            timeDisplay = reminderTime.toLocaleDateString() + ' ' + reminderTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        // Calculate time until/since
        const diffMs = reminderTime.getTime() - now.getTime();
        const diffMins = Math.round(diffMs / (1000 * 60));
        let timeInfo = '';
        
        if (isPast) {
            const pastMins = Math.abs(diffMins);
            if (pastMins < 60) {
                timeInfo = `${pastMins} min ago`;
            } else if (pastMins < 1440) {
                timeInfo = `${Math.round(pastMins / 60)} hours ago`;
            } else {
                timeInfo = `${Math.round(pastMins / 1440)} days ago`;
            }
        } else {
            if (diffMins < 60) {
                timeInfo = `in ${diffMins} min`;
            } else if (diffMins < 1440) {
                timeInfo = `in ${Math.round(diffMins / 60)} hours`;
            } else {
                timeInfo = `in ${Math.round(diffMins / 1440)} days`;
            }
        }
        
        return `
            <div class="reminder-item">
                <div class="reminder-info">
                    <div class="reminder-time">${timeDisplay}</div>
                    <div class="reminder-note">${reminder.note}</div>
                    <div class="reminder-meta">
                        <span class="reminder-repeat">${reminder.repeat}</span>
                        <span class="reminder-status ${isPast ? 'past' : 'upcoming'}">${timeInfo}</span>
                    </div>
                </div>
                <div class="reminder-actions">
                    <button onclick="editReminder(${reminder.id})" class="btn-small" title="Edit">✏️</button>
                    <button onclick="deleteReminder(${reminder.id})" class="btn-small btn-danger" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// Auto-retry connection every 30 seconds if offline
setInterval(async () => {
    if (!isOnline) {
        console.log('🔄 Retrying server connection...');
        await connectToServer();
    }
}, 30000);

// Sync when window becomes visible (app reopened)
document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && isOnline && !syncInProgress) {
        console.log('👁️ App became visible, syncing...');
        await syncWithServer();
    }
});

// Sync when online status changes
window.addEventListener('online', async () => {
    console.log('🌐 Network came back online');
    await connectToServer();
});

window.addEventListener('offline', () => {
    console.log('📵 Network went offline');
    isOnline = false;
    updateStatus('🔴 Offline - Working locally', 'offline');
    updateNotificationUI();
});

// Auto-save when user types (debounced)
let saveTimeout;
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveLocalReminders();
    }, 1000);
}

// Add event listeners for auto-save
document.getElementById('note').addEventListener('input', debouncedSave);
document.getElementById('editNote').addEventListener('input', debouncedSave);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to add reminder
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (editFormEl.style.display === 'block') {
            saveEdit();
        } else {
            addReminder();
        }
        e.preventDefault();
    }
    
    // Escape to cancel edit
    if (e.key === 'Escape' && editFormEl.style.display === 'block') {
        cancelEdit();
        e.preventDefault();
    }
});

// Cleanup past reminders (run once on startup)
function cleanupPastReminders() {
    const now = new Date();
    const beforeCount = reminders.length;
    
    // Remove past one-time reminders older than 24 hours
    reminders = reminders.filter(reminder => {
        const reminderTime = new Date(reminder.dateTime);
        const hoursAgo = (now.getTime() - reminderTime.getTime()) / (1000 * 60 * 60);
        
        if (reminder.repeat === 'once' && hoursAgo > 24) {
            console.log(`🧹 Removing old reminder: "${reminder.note}"`);
            return false;
        }
        return true;
    });
    
    const afterCount = reminders.length;
    if (beforeCount !== afterCount) {
        console.log(`🧹 Cleaned up ${beforeCount - afterCount} old reminders`);
        saveLocalReminders();
        renderReminders();
    }
}

// Run cleanup on startup
setTimeout(cleanupPastReminders, 2000);

// Listen for service worker messages
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        console.log('📨 Received message from service worker:', event.data);
        
        if (event.data && event.data.type === 'REMINDER_NOTIFICATION_SHOWN') {
            console.log('🔔 Notification was shown:', event.data.notification.title);
        }
        
        if (event.data && event.data.type === 'REMINDER_NOTIFICATION_CLICKED') {
            console.log('🖱️ Notification was clicked');
            // Could add specific handling here
        }
    });
}

// Export functions to global scope for onclick handlers
window.addReminder = addReminder;
window.editReminder = editReminder;
window.saveEdit = saveEdit;
window.cancelEdit = cancelEdit;
window.deleteReminder = deleteReminder;
window.setQuickTime = setQuickTime;

console.log('✅ Simple Reminder App loaded successfully');
