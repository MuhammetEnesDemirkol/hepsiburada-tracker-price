require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const changesPath = path.join(__dirname, '../scraper/changes.json');
const failedNotificationsPath = path.join(__dirname, '../scraper/failed-notifications.json');

// Buffer için değişiklik kuyruğu
let notificationBuffer = [];
const BUFFER_SIZE = 10;
const RATE_LIMIT_DELAY = 2000; // 2 saniye

// Log dosyası
const logFile = path.join(__dirname, '../logs/notifications.log');

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage);
    
    // Terminal çıktısını renklendir ve emojilerle zenginleştir
    const colors = {
        info: '\x1b[36m', // Cyan
        success: '\x1b[32m', // Yeşil
        warning: '\x1b[33m', // Sarı
        error: '\x1b[31m', // Kırmızı
        reset: '\x1b[0m' // Reset
    };

    let coloredMessage = message;
    
    // Mesaj tipine göre renklendirme
    if (message.includes('❌')) {
        coloredMessage = `${colors.error}${message}${colors.reset}`;
    } else if (message.includes('✅')) {
        coloredMessage = `${colors.success}${message}${colors.reset}`;
    } else if (message.includes('ℹ️')) {
        coloredMessage = `${colors.info}${message}${colors.reset}`;
    } else if (message.includes('⚠️')) {
        coloredMessage = `${colors.warning}${message}${colors.reset}`;
    }

    console.log(`\n${colors.info}=== ${timestamp} ===${colors.reset}`);
    console.log(coloredMessage);
    console.log(`${colors.info}===================${colors.reset}\n`);
}

function formatMessage(change) {
    if (change.type === 'new') {
        return `🆕 Yeni Ürün:\n${change.title}\n💰 ${change.price}\n🔗 ${change.link}`;
    } else if (change.type === 'price-change') {
        // Fiyatları sayısal değerlere çevir
        const oldPrice = parseFloat(change.oldPrice.replace(/[^\d,]/g, '').replace(',', '.'));
        const newPrice = parseFloat(change.newPrice.replace(/[^\d,]/g, '').replace(',', '.'));
        
        // Sadece fiyat düşüşlerini bildir
        if (newPrice < oldPrice) {
            const discount = ((oldPrice - newPrice) / oldPrice * 100).toFixed(1);
            return `💸 Fiyat Düştü!\n${change.title}\n🔻 ${change.oldPrice} ➡ ${change.newPrice}\n📉 %${discount} indirim\n🔗 ${change.link}`;
        }
        return ''; // Fiyat artışlarında boş mesaj döndür
    }
    return '';
}

async function sendTelegramMessage(text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        log('❌ Telegram yapılandırması eksik.');
        return false;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: chatId,
            text,
            parse_mode: 'HTML'
        });
        log('📬 Telegram bildirimi gönderildi.');
        return true;
    } catch (error) {
        log(`❌ Telegram gönderim hatası: ${error.message}`);
        return false;
    }
}

// Başarısız bildirimleri kaydet
function saveFailedNotification(change) {
    let failedNotifications = [];
    if (fs.existsSync(failedNotificationsPath)) {
        failedNotifications = JSON.parse(fs.readFileSync(failedNotificationsPath, 'utf-8'));
    }
    failedNotifications.push({
        ...change,
        failedAt: new Date().toISOString(),
        retryCount: 0
    });
    fs.writeFileSync(failedNotificationsPath, JSON.stringify(failedNotifications, null, 2));
}

// Buffer'daki bildirimleri gönder
async function sendBufferedNotifications() {
    if (notificationBuffer.length === 0) return;

    log(`📦 Buffer'daki ${notificationBuffer.length} bildirim gönderiliyor...`);
    
    for (const change of notificationBuffer) {
        const message = formatMessage(change);
        const sent = await sendTelegramMessage(message);
        
        if (sent) {
            change.sent = true;
            log(`✅ Bildirim başarıyla gönderildi: ${change.title}`);
        } else {
            saveFailedNotification(change);
            log(`❌ Bildirim gönderilemedi: ${change.title}`);
        }

        // Rate limiting için bekle
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // Buffer'ı temizle
    notificationBuffer = [];
}

// Anlık bildirim gönderme fonksiyonu
async function sendInstantNotification(change) {
    // Fiyat değişikliği ise ve fiyat düşmüşse bildir
    if (change.type === 'price-change') {
        const oldPrice = parseFloat(change.oldPrice.replace(/[^\d,]/g, '').replace(',', '.'));
        const newPrice = parseFloat(change.newPrice.replace(/[^\d,]/g, '').replace(',', '.'));
        
        if (newPrice >= oldPrice) {
            log(`ℹ️ Fiyat artışı bildirilmedi: ${change.title}`);
            return;
        }
    }

    notificationBuffer.push(change);
    log(`📝 Yeni değişiklik buffer'a eklendi: ${change.title}`);

    // Buffer dolduğunda gönder
    if (notificationBuffer.length >= BUFFER_SIZE) {
        await sendBufferedNotifications();
    }
}

// Başarısız bildirimleri tekrar dene
async function retryFailedNotifications() {
    if (!fs.existsSync(failedNotificationsPath)) return;

    const failedNotifications = JSON.parse(fs.readFileSync(failedNotificationsPath, 'utf-8'));
    const remainingNotifications = [];

    for (const notification of failedNotifications) {
        if (notification.retryCount >= 3) {
            log(`❌ Maksimum deneme sayısına ulaşıldı: ${notification.title}`);
            continue;
        }

        const message = formatMessage(notification);
        const sent = await sendTelegramMessage(message);

        if (sent) {
            log(`✅ Başarısız bildirim başarıyla gönderildi: ${notification.title}`);
        } else {
            notification.retryCount++;
            remainingNotifications.push(notification);
            log(`❌ Bildirim tekrar gönderilemedi: ${notification.title}`);
        }

        // Rate limiting için bekle
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }

    // Kalan başarısız bildirimleri kaydet
    fs.writeFileSync(failedNotificationsPath, JSON.stringify(remainingNotifications, null, 2));
}

// Toplu bildirim gönderme fonksiyonu
async function notifyChanges() {
    if (!fs.existsSync(changesPath)) {
        log('ℹ️ changes.json bulunamadı, bildirim gönderilmeyecek.');
        return;
    }

    const changes = JSON.parse(fs.readFileSync(changesPath, 'utf-8'));

    if (changes.length === 0) {
        log('ℹ️ Gönderilecek değişiklik yok.');
        return;
    }

    // Gönderilmemiş değişiklikleri filtrele
    const unsentChanges = changes.filter(change => !change.sent);
    log(`ℹ️ ${unsentChanges.length} gönderilmemiş değişiklik bulundu.`);
    
    // Buffer'ı doldur
    for (const change of unsentChanges) {
        await sendInstantNotification(change);
    }

    // Kalan bildirimleri gönder
    await sendBufferedNotifications();

    // Başarısız bildirimleri tekrar dene
    await retryFailedNotifications();

    // Değişiklikleri kaydet
    const remaining = changes.filter(change => !change.sent);
    fs.writeFileSync(changesPath, JSON.stringify(remaining, null, 2));
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    notifyChanges();
}

module.exports = {
    sendInstantNotification,
    notifyChanges,
    sendTelegramMessage
};
