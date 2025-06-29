const logger = require('./logger');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

class NotificationService {
    constructor() {
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.maxRetries = 3;
        this.rateLimitDelay = 1000; // 1 saniye
    }

    // Fiyat değişikliği bildirimi
    async sendPriceChangeNotification(change) {
        try {
            const { old, new: newProduct, changePercentage } = change;
            
            // Fiyatları parse et
            const oldPrice = this.parsePrice(old.price);
            const newPrice = this.parsePrice(newProduct.price);
            
            if (oldPrice === null || newPrice === null) {
                logger.error('Fiyat parse edilemedi:', { old: old.price, new: newProduct.price });
                return false;
            }

            // Sadece fiyat düşüşleri için bildirim gönder
            if (newPrice >= oldPrice) {
                logger.info('Fiyat artışı tespit edildi, bildirim gönderilmiyor');
                return false;
            }

            // Doğru indirim oranını hesapla: ((Eski Fiyat - Yeni Fiyat) / Eski Fiyat) * 100
            const correctDiscountPercentage = ((oldPrice - newPrice) / oldPrice * 100).toFixed(2);

            const message = 
                `💸 *Fiyatı Güncellenen Ürün*\n\n` +
                `📝 **${newProduct.title}**\n` +
                `📦 Ürün Kodu: \`${newProduct.product_code}\`\n` +
                `📈 Eski Fiyat: ${oldPrice.toLocaleString('tr-TR')} TL\n` +
                `📊 Yeni Fiyat: ${newPrice.toLocaleString('tr-TR')} TL\n` +
                `📉 İndirim Oranı: %${correctDiscountPercentage}\n\n` +
                `🔗 [Ürünü Görüntüle](${newProduct.link})`;

            return await this.sendMessage(message);
        } catch (error) {
            logger.error('Fiyat değişikliği bildirimi gönderilemedi:', error.message);
            return false;
        }
    }

    // Yeni ürün bildirimi
    async sendNewProductNotification(product) {
        try {
            const price = this.parsePrice(product.price);
            
            if (price === null) {
                logger.error('Fiyat parse edilemedi:', product.price);
                return false;
            }

            const message = 
                `🆕 *Yeni Ürün Eklendi*\n\n` +
                `📝 **${product.title}**\n` +
                `📦 Ürün Kodu: \`${product.product_code}\`\n` +
                `💰 Fiyat: ${price.toLocaleString('tr-TR')} TL\n\n` +
                `🔗 [Ürünü Görüntüle](${product.link})`;

            return await this.sendMessage(message);
        } catch (error) {
            logger.error('Yeni ürün bildirimi gönderilemedi:', error.message);
            return false;
        }
    }

    // Test bildirimi
    async sendTestNotification() {
        try {
            const message = 
                `🧪 *Test Bildirimi*\n\n` +
                `Bu bir test bildirimidir.\n` +
                `Sistem çalışıyor! ✅\n\n` +
                `⏰ Tarih: ${new Date().toLocaleString('tr-TR')}`;

            return await this.sendMessage(message);
        } catch (error) {
            logger.error('Test bildirimi gönderilemedi:', error.message);
            return false;
        }
    }

    // Ana mesaj gönderme fonksiyonu
    async sendMessage(message) {
        if (!this.bot || !this.chatId) {
            logger.error('Telegram bot token veya chat ID bulunamadı!');
            return false;
        }

        let retryCount = 0;
        while (retryCount < this.maxRetries) {
            try {
                await this.bot.sendMessage(this.chatId, message, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: false
                });
                
                logger.success('Bildirim başarıyla gönderildi');
                return true;
            } catch (error) {
                retryCount++;
                
                if (error.response && error.response.status === 429) {
                    // Rate limit aşıldı
                    const retryAfter = error.response.data.parameters.retry_after || 5;
                    logger.warning(`Rate limit aşıldı. ${retryAfter} saniye bekleniyor...`);
                    await this.delay(retryAfter * 1000);
                } else {
                    logger.error(`Bildirim gönderme hatası (${retryCount}/${this.maxRetries}):`, error.message);
                    
                    if (retryCount < this.maxRetries) {
                        await this.delay(this.rateLimitDelay);
                    }
                }
            }
        }
        
        logger.error('Maksimum deneme sayısına ulaşıldı. Bildirim gönderilemedi.');
        return false;
    }

    // Fiyat parsing fonksiyonu
    parsePrice(priceString) {
        if (!priceString || typeof priceString !== 'string') {
            return null;
        }
        let cleanPrice = priceString.trim();
        cleanPrice = cleanPrice.replace(/[^0-9.,]/g, '');
        if (cleanPrice.includes(',') && !cleanPrice.includes('.')) {
            cleanPrice = cleanPrice.replace(',', '.');
        } else if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
            const parts = cleanPrice.split(',');
            const lastPart = parts.pop();
            const firstPart = parts.join('').replace(/\./g, '');
            cleanPrice = firstPart + '.' + lastPart;
        } else if (cleanPrice.includes('.') && !cleanPrice.includes(',')) {
            cleanPrice = cleanPrice.replace(/\./g, '');
        }
        const numericPrice = parseFloat(cleanPrice);
        // Kuruşları at (her zaman tam sayı)
        return isNaN(numericPrice) ? null : Math.floor(numericPrice);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

const notificationService = new NotificationService();
module.exports = notificationService; 