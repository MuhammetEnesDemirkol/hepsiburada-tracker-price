require('dotenv').config();
const notificationService = require('../services/notification');
const logger = require('../services/logger');

// Değişiklikleri bildir
async function notifyChanges() {
    try {
        await notificationService.sendBufferedNotifications();
        logger.success('Tüm bildirimler gönderildi');
    } catch (error) {
        logger.error(`Bildirim gönderme hatası: ${error.message}`);
    }
}

// Test bildirimi gönder
async function sendTestNotification() {
    try {
        await notificationService.sendTestNotification();
        logger.success('Test bildirimi gönderildi');
    } catch (error) {
        logger.error(`Test bildirimi hatası: ${error.message}`);
    }
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    notifyChanges();
}

module.exports = {
    notifyChanges,
    sendTestNotification
};
