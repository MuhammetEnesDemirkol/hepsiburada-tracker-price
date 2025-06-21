const logger = require('./logger');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

class NotificationService {
    constructor() {
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.notificationBuffer = [];
        this.bufferTimeout = null;
    }

    formatPriceChange(change) {
        if (!change || typeof change.change_percentage !== 'number') {
            logger.error('Geçersiz fiyat değişimi formatı:', change);
            return null;
        }

        const emoji = change.change_percentage < 0 ? '📉' : '📈';
        const direction = change.change_percentage < 0 ? 'düştü' : 'yükseldi';
        
        return `${emoji} *${change.title}*\n` +
               `Fiyat ${direction}: ${change.previous_price} TL → ${change.current_price} TL\n` +
               `Değişim: %${(Math.abs(parseFloat(change.change_percentage)) || 0).toFixed(2)}\n` +
               `[Ürünü Görüntüle](${change.link})`;
    }

    async sendNotification(message) {
        try {
            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            });
            logger.success('Bildirim gönderildi');
        } catch (error) {
            logger.error(`Bildirim gönderme hatası: ${error.message}`);
        }
    }

    async sendBufferedNotifications() {
        if (this.notificationBuffer.length === 0) return;

        const message = this.notificationBuffer
            .map(change => this.formatPriceChange(change))
            .filter(msg => msg !== null)
            .join('\n\n');

        if (message) {
            await this.sendNotification(message);
        }

        this.notificationBuffer = [];
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }
    }

    async sendInstantNotification(change) {
        const message = this.formatPriceChange(change);
        if (message) {
            await this.sendNotification(message);
        }
    }

    bufferNotification(change) {
        if (!change || typeof change.change_percentage !== 'number') {
            logger.error('Geçersiz bildirim verisi:', change);
            return;
        }

        this.notificationBuffer.push(change);

        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }

        this.bufferTimeout = setTimeout(() => {
            this.sendBufferedNotifications();
        }, 5000); // 5 saniye bekle
    }

    // Log özeti oluşturma fonksiyonu
    generateLogSummary(products) {
        const summary = {
            totalProducts: products.length,
            priceChanges: 0,
            newProducts: 0,
            noChange: 0,
            totalPriceChange: 0,
            averagePriceChange: 0,
            categories: new Set()
        };

        for (const product of products) {
            // change_percentage alanı varsa ve geçerliyse
            if (product.change_percentage && typeof product.change_percentage === 'object') {
                const changeType = product.change_percentage.changeType;
                const changeAmount = Math.abs(product.change_percentage.change || 0);
                
                switch (changeType) {
                    case 'increase':
                    case 'decrease':
                        summary.priceChanges++;
                        summary.totalPriceChange += changeAmount;
                        break;
                    case 'no_change':
                        summary.noChange++;
                        break;
                    case 'new':
                        summary.newProducts++;
                        break;
                }
            } else {
                // change_percentage yoksa veya null ise, değişim yok olarak say
                summary.noChange++;
            }
        }

        // Ortalama hesapla
        if (summary.priceChanges > 0) {
            summary.averagePriceChange = (summary.totalPriceChange / summary.priceChanges).toFixed(2);
        }

        return summary;
    }

    // Özet bildirimi gönderme
    async sendSummaryNotification(products, categoryName = '') {
        const summary = this.generateLogSummary(products);
        
        const message = `📊 *Tarama Özeti* ${categoryName ? `(${categoryName})` : ''}\n\n` +
                       `📦 Toplam Ürün: ${summary.totalProducts}\n` +
                       `📈 Fiyat Değişimi: ${summary.priceChanges}\n` +
                       `🆕 Yeni Ürün: ${summary.newProducts}\n` +
                       `➡️ Değişim Yok: ${summary.noChange}\n` +
                       `💰 Toplam Fiyat Değişimi: ${summary.totalPriceChange} TL\n` +
                       `📊 Ortalama Değişim: ${summary.averagePriceChange} TL`;

        await this.sendNotification(message);
    }

    // Test bildirimi gönderme
    async sendTestNotification() {
        const testMessage = `🧪 *Test Bildirimi*\n\n` +
                           `Bu bir test bildirimidir.\n` +
                           `Sistem çalışıyor! ✅\n\n` +
                           `Tarih: ${new Date().toLocaleString('tr-TR')}`;

        await this.sendNotification(testMessage);
    }
}

// Singleton instance
const notificationService = new NotificationService();
module.exports = notificationService; 