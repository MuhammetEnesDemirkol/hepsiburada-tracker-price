// runner.js veya app.js
process.env.TZ = 'Europe/Istanbul';
const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');
const { scrapeCategory } = require('../scraper/scraper');
const { saveToDatabase } = require('../scraper/save-to-db');
const { compareProducts } = require('./compare');
const databaseService = require('../services/database');
const logger = require('../services/logger');

// Komutları sırayla çalıştır
function runScript(command, label) {
    return new Promise((resolve, reject) => {
        console.log(`▶️ ${label} başlatılıyor...`);
        
        const [cmd, ...args] = command.split(' ');
        const child = spawn(cmd, args, { 
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit' // Bu satır çıktıları gerçek zamanlı gösterir
        });

        child.on('error', (error) => {
            console.error(`❌ ${label} hatası:`, error);
            reject(error);
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${label} tamamlandı`);
                resolve();
            } else {
                console.error(`❌ ${label} hata kodu ile sonlandı:`, code);
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

// Ana işlem
async function main() {
    try {
        await runScript('node scraper/multi-scraper.js', 'Scraper');
        await runScript('node scraper/save-to-db.js', 'Veritabanı Kaydı');
        await runScript('node api/compare.js', 'Karşılaştırıcı');
        await runScript('node api/notify.js', 'Telegram Bildirimi');
    } catch (err) {
        console.error('🛑 Cron durdu:', err.message);
    }
}

async function runScraper() {
    try {
        logger.info('Tarama başlatılıyor...');

        // Aktif kategorileri al
        const categories = await databaseService.getActiveCategories();
        
        if (categories.length === 0) {
            logger.warn('Aktif kategori bulunamadı!');
            return;
        }

        logger.info(`${categories.length} aktif kategori bulundu.`);

        // Her kategori için tarama yap
        for (const category of categories) {
            try {
                logger.info(`${category.title} kategorisi taranıyor...`);

                // Kategoriyi tara
                const products = await scrapeCategory(category.slug);
                
                if (products.length === 0) {
                    logger.warn(`${category.title} kategorisinde ürün bulunamadı!`);
                    continue;
                }

                logger.info(`${category.title} kategorisinde ${products.length} ürün bulundu.`);

                // Ürünleri veritabanına kaydet
                await saveToDatabase(products, category.slug);

                // Fiyat karşılaştırması yap
                await compareProducts();

            } catch (error) {
                logger.error(`${category.title} kategorisi işlenirken hata: ${error.message}`);
            }
        }

        logger.info('Tarama tamamlandı.');

    } catch (error) {
        logger.error(`Tarama hatası: ${error.message}`);
    }
}

// Belirli aralıklarla çalıştır
const INTERVAL = process.env.SCRAPE_INTERVAL || 3600000; // Varsayılan: 1 saat

async function startRunner() {
    logger.info(`Tarayıcı başlatılıyor (${INTERVAL/1000} saniye aralıklarla)...`);
    
    // İlk çalıştırma
    await main();
    
    // Periyodik çalıştırma
    setInterval(main, INTERVAL);
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    startRunner();
}

module.exports = {
    startRunner,
    runScraper
};

console.log('🚀 Cron servisi aktif. Saat başı çalışacak...');
