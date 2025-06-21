const databaseService = require('../services/database');
const priceComparisonService = require('../services/price-comparison');
const notificationService = require('../services/notification');
const logger = require('../services/logger');

async function compareProducts() {
    try {
        logger.info('Ürün karşılaştırması başlıyor...');

        // Son taramada bulunan ürünleri al
        const recentProducts = await databaseService.getRecentPriceChanges(1);

        if (recentProducts.length === 0) {
            logger.info('Yeni ürün veya fiyat değişikliği bulunamadı.');
            return;
        }

        // Fiyat değişikliklerini kontrol et ve bildir
        const results = await priceComparisonService.compareBulkProducts(recentProducts);

        logger.info(`Karşılaştırma sonuçları: ${JSON.stringify(results)}`);

    } catch (error) {
        logger.error(`Karşılaştırma hatası: ${error.message}`);
    }
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    compareProducts();
}

module.exports = {
    compareProducts
};
