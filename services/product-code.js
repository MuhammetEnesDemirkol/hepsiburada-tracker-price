const logger = require('./logger');

class ProductCodeService {
    async getOrCreateProductCode(link) {
        try {
            // URL'den ürün kodunu çıkar
            const productCode = this.extractProductCode(link);
            
            if (productCode) {
                logger.info(`Ürün kodu bulundu: ${productCode}`);
                return productCode;
            }

            // Ürün kodu bulunamadıysa yedek kod oluştur
            const fallbackCode = this.generateFallbackCode(link);
            logger.warn(`Ürün kodu bulunamadı, yedek kod oluşturuldu: ${fallbackCode}`);
            
            return fallbackCode;
        } catch (error) {
            logger.error(`Ürün kodu oluşturma hatası: ${error.message}`);
            throw error;
        }
    }

    extractProductCode(link) {
        // 1. Önce p-XXXXX formatını dene (en yaygın)
        const pMatch = link.match(/p-([A-Z0-9]+)/);
        if (pMatch) return pMatch[1];

        // 2. pm-XXXXX formatını dene
        const pmMatch = link.match(/pm-([A-Z0-9]+)/);
        if (pmMatch) return pmMatch[1];

        // 3. HBC, HBV, HB, ailepil formatlarını dene
        const otherMatch = link.match(/-(HBC|HBV|HB)[A-Z0-9]+|-(ailepil[0-9]+)/i);
        if (otherMatch) return otherMatch[0].replace('-', '');

        // 4. /urunler/XXXXX formatını dene
        const urunlerMatch = link.match(/\/urunler\/([A-Z0-9]+)/);
        if (urunlerMatch) return urunlerMatch[1];

        // 5. Son fallback: linkin sonunda 8+ karakterli büyük harf/rakam varsa onu al
        const fallback = link.match(/-([A-Z0-9]{8,})$/i);
        return fallback ? fallback[1] : null;
    }

    generateFallbackCode(link) {
        // URL'den benzersiz bir kod oluştur
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 5);
        return `FALLBACK-${timestamp}-${random}`.toUpperCase();
    }

    validateProductCode(code) {
        if (!code) return false;
        
        // Minimum uzunluk kontrolü
        if (code.length < 5) return false;
        
        // Sadece geçerli karakterler
        if (!/^[A-Z0-9_-]+$/.test(code)) return false;
        
        return true;
    }

    getProductCode(link, title = '') {
        const code = this.extractProductCode(link);
        
        if (this.validateProductCode(code)) {
            return code;
        }
        
        return this.generateFallbackCode(link);
    }
}

// Singleton instance
const productCodeService = new ProductCodeService();
module.exports = productCodeService; 