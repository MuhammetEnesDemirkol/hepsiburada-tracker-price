const logger = require('./services/logger');
const databaseService = require('./services/database');
const productCodeService = require('./services/product-code');
const priceComparisonService = require('./services/price-comparison');
const notificationService = require('./services/notification');

async function runTest() {
    try {
        // Veritabanı bağlantısını test et
        const isConnected = await databaseService.checkConnection();
        logger.info('Veritabanı durumu:', isConnected ? 'Bağlantı başarılı' : 'Bağlantı hatası');

        if (!isConnected) {
            throw new Error('Veritabanı bağlantısı başarısız');
        }

        // Test kategorisi ekle
        logger.info('Test kategorisi ekleniyor...');
        const category = await databaseService.saveCategory({
            title: 'Test Kategorisi',
            slug: 'test-kategori',
            discount_threshold: 10,
            status: 'active'
        });
        logger.info('Test kategorisi eklendi');

        // Test ürünü ekle
        logger.info('Test ürünü ekleniyor...');
        const product = await databaseService.saveProduct({
            title: 'Test Ürünü',
            price: 100,
            link: 'https://www.hepsiburada.com/test-urunu-p-123456',
            image: 'https://example.com/image.jpg',
            product_code: 'TEST123',
            slug: 'test-kategori',
            status: 'active'
        });
        logger.info('Test ürünü eklendi');

        // Ürün kodu servisini test et
        logger.info('Ürün kodu servisi test ediliyor...');
        const productCode = productCodeService.getProductCode(product.link, product.title);
        logger.info('Ürün kodu:', productCode);

        // Fiyat karşılaştırma servisini test et
        logger.info('Fiyat karşılaştırma servisini test ediliyor...');
        const comparison = await priceComparisonService.comparePrices(90, 100);
        logger.info('Fiyat karşılaştırma sonucu:', comparison);

        // Bildirim servisini test et
        if (comparison) {
            logger.info('Bildirim servisi test ediliyor...');
            const change = {
                ...product,
                ...comparison
            };
            await notificationService.sendInstantNotification(change);
        }

        // Test verilerini temizle
        await databaseService.deleteCategory('test-kategori');
        logger.success('Test tamamlandı');

    } catch (error) {
        logger.error('Sistem testi sırasında hata:', error.message);
    }
}

runTest(); 