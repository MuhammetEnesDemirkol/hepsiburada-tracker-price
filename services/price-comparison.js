const databaseService = require('./database');
const notificationService = require('./notification');
const logger = require('./logger');

class PriceComparisonService {
    constructor() {
        this.DEFAULT_THRESHOLD = 10; // Varsayılan %10
        this.PRICE_CHANGE_TYPES = {
            INCREASE: 'increase',
            DECREASE: 'decrease',
            NO_CHANGE: 'no_change'
        };
    }

    calculatePriceChange(oldPrice, newPrice) {
        if (!oldPrice || !newPrice) {
            logger.warning('Fiyat karşılaştırması için eski veya yeni fiyat eksik');
            return null;
        }

        const oldPriceNum = parseFloat(oldPrice);
        const newPriceNum = parseFloat(newPrice);

        if (isNaN(oldPriceNum) || isNaN(newPriceNum)) {
            logger.warning('Geçersiz fiyat değerleri');
            return null;
        }

        const change = newPriceNum - oldPriceNum;
        
        // Fiyat değişim tipini belirle
        const changeType = change > 0 ? this.PRICE_CHANGE_TYPES.INCREASE : 
                          change < 0 ? this.PRICE_CHANGE_TYPES.DECREASE : 
                          this.PRICE_CHANGE_TYPES.NO_CHANGE;

        // Düşen fiyatlar için doğru oran hesaplama: ((Eski Fiyat - Yeni Fiyat) / Eski Fiyat) * 100
        let changePercentage = 0;
        if (changeType === this.PRICE_CHANGE_TYPES.DECREASE) {
            changePercentage = ((oldPriceNum - newPriceNum) / oldPriceNum) * 100;
        } else if (changeType === this.PRICE_CHANGE_TYPES.INCREASE) {
            changePercentage = ((newPriceNum - oldPriceNum) / oldPriceNum) * 100;
        }

        return {
            change,
            changePercentage,
            changeType,
            oldPrice: oldPriceNum,
            newPrice: newPriceNum
        };
    }

    shouldNotifyPriceChange(change, threshold = this.DEFAULT_THRESHOLD) {
        if (!change) return false;

        // Sadece fiyat düşüşlerini bildir
        if (change.changeType !== this.PRICE_CHANGE_TYPES.DECREASE) {
            logger.info('Fiyat artışı tespit edildi, bildirim gönderilmiyor');
            return false;
        }

        // Eşik değerini kontrol et
        return change.changePercentage >= threshold;
    }

    async notifyPriceChange(product, change) {
        if (!this.shouldNotifyPriceChange(change, product.discount_threshold)) {
            return false;
        }

        const notification = {
            type: 'price_change',
            title: product.title,
            oldPrice: change.oldPrice,
            newPrice: change.newPrice,
            changePercentage: (parseFloat(change.changePercentage) || 0).toFixed(1),
            link: product.link,
            category: product.category_title
        };

        return await notificationService.sendInstantNotification(notification);
    }

    async compareAndNotify(product, oldPrice, newPrice) {
        const change = this.calculatePriceChange(oldPrice, newPrice);
        
        if (!change) {
            logger.warning(`Fiyat karşılaştırması yapılamadı: ${product.title}`);
            return false;
        }

        if (change.changeType === this.PRICE_CHANGE_TYPES.NO_CHANGE) {
            logger.debug(`Fiyat değişimi yok: ${product.title}`);
            return false;
        }

        logger.info(`Fiyat değişimi tespit edildi: ${product.title} (${(parseFloat(change.changePercentage) || 0).toFixed(1)}%)`);
        
        return await this.notifyPriceChange(product, change);
    }

    async compareBulkProducts(products) {
        try {
            const results = {
                newProducts: [],
                priceChanges: []
            };

            for (const product of products) {
                // Yeni ürün kontrolü
                const isNew = await this.checkNewProduct(product);
                if (isNew) {
                    results.newProducts.push(product);
                    continue;
                }

                // Fiyat değişikliği kontrolü
                const priceChange = await this.checkPriceChange(product);
                if (priceChange) {
                    results.priceChanges.push(priceChange);
                }
            }

            // Bildirimleri gönder
            await this.sendNotifications(results);

            return results;
        } catch (error) {
            logger.error(`Toplu ürün karşılaştırma hatası: ${error.message}`);
            throw error;
        }
    }

    async checkNewProduct(product) {
        try {
            const existingProduct = await databaseService.getProductByCode(product.product_code);
            return !existingProduct;
        } catch (error) {
            logger.error(`Yeni ürün kontrolü hatası: ${error.message}`);
            throw error;
        }
    }

    async checkPriceChange(product) {
        try {
            const previousPrice = await databaseService.getPreviousPrice(product.product_code);
            
            if (!previousPrice) {
                return null;
            }

            const priceChangeResult = this.calculatePriceChange(previousPrice, product.price);
            
            if (!priceChangeResult) {
                return null;
            }

            const priceChange = {
                product_code: product.product_code,
                title: product.title,
                previous_price: previousPrice,
                current_price: product.price,
                change_percentage: priceChangeResult
            };

            return priceChange;
        } catch (error) {
            logger.error(`Fiyat değişikliği kontrolü hatası: ${error.message}`);
            throw error;
        }
    }

    async sendNotifications(results) {
        try {
            // Yeni ürün bildirimleri
            for (const product of results.newProducts) {
                await notificationService.sendInstantNotification({
                    title: '🆕 Yeni Ürün',
                    message: `
Ürün: ${product.title}
Fiyat: ${product.price} TL
Link: ${product.link}
                    `.trim()
                });
            }

            // Sadece fiyat düşüşü bildirimleri
            for (const change of results.priceChanges) {
                // Fiyat değişikliği tipini kontrol et
                if (change.change_percentage && change.change_percentage.changeType === 'decrease') {
                    await notificationService.sendInstantNotification({
                        title: '💸 Fiyat Düşüşü',
                        message: `
Ürün: ${change.title}
Eski Fiyat: ${change.previous_price} TL
Yeni Fiyat: ${change.current_price} TL
İndirim Oranı: %${(parseFloat(change.change_percentage.changePercentage) || 0).toFixed(1)}
                    `.trim()
                    });
                }
            }
        } catch (error) {
            logger.error(`Bildirim gönderme hatası: ${error.message}`);
            throw error;
        }
    }

    async comparePrices(currentPrice, previousPrice) {
        if (!currentPrice || !previousPrice) {
            return null;
        }

        const current = parseFloat(currentPrice);
        const previous = parseFloat(previousPrice);

        if (isNaN(current) || isNaN(previous)) {
            logger.error('Geçersiz fiyat değerleri:', { currentPrice, previousPrice });
            return null;
        }

        const change = current - previous;
        
        // Düşen fiyatlar için doğru oran hesaplama: ((Eski Fiyat - Yeni Fiyat) / Eski Fiyat) * 100
        let changePercentage = 0;
        if (change < 0) {
            // Fiyat düştü
            changePercentage = ((previous - current) / previous) * 100;
        } else if (change > 0) {
            // Fiyat arttı
            changePercentage = ((current - previous) / previous) * 100;
        }

        return {
            current_price: current,
            previous_price: previous,
            change_amount: change,
            change_percentage: parseFloat(changePercentage.toFixed(2)),
            changeType: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'no_change'
        };
    }

    async compareProduct(product) {
        try {
            const previousPrice = await databaseService.getPreviousPrice(product.product_code);
            
            if (!previousPrice) {
                logger.info(`Ürün için önceki fiyat bulunamadı: ${product.title}`);
                return null;
            }

            const comparison = await this.comparePrices(product.price, previousPrice);
            
            if (!comparison) {
                return null;
            }

            return {
                ...product,
                ...comparison
            };
        } catch (error) {
            logger.error(`Ürün karşılaştırma hatası: ${error.message}`);
            return null;
        }
    }

    async compareProducts(products) {
        const results = [];
        
        for (const product of products) {
            const comparison = await this.compareProduct(product);
            if (comparison) {
                results.push(comparison);
            }
        }

        return results;
    }
}

// Singleton instance
const priceComparisonService = new PriceComparisonService();
module.exports = priceComparisonService; 