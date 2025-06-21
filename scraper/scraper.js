const puppeteer = require('puppeteer');
const logger = require('../services/logger');
const databaseService = require('../services/database');

async function scrapeCategory(categorySlug) {
    let browser;
    try {
        logger.info(`${categorySlug} kategorisi için tarama başlatılıyor...`);

        // Kategori bilgisini veritabanından al
        const categories = await databaseService.getActiveCategories();
        const category = categories.find(cat => cat.slug === categorySlug);
        
        if (!category) {
            logger.error(`${categorySlug} kategorisi bulunamadı!`);
            return [];
        }

        if (!category.url) {
            logger.error(`${categorySlug} kategorisinin URL'i yok!`);
            return [];
        }

        // Tarayıcıyı başlat
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        
        // Kullanıcı ajanını ayarla
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Veritabanındaki URL'i kullan
        const baseURL = category.url.split('?')[0];
        logger.info(`Sayfa yükleniyor: ${baseURL}`);

        await page.goto(baseURL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Sayfanın yüklenmesini bekle
        await page.waitForTimeout(3000);

        // Toplam ürün sayısını al
        let totalProducts = 0;
        let totalPages = 1;
        const productsPerPage = 36;

        try {
            // Toplam ürün sayısını al
            const totalText = await page.$eval(
                'div[class^="VZbTh5SU1OsNkwSvy5FF"]',
                (el) => el.textContent.trim()
            );
            totalProducts = parseInt(totalText.match(/\d+/)[0]) || 0;
            totalPages = Math.ceil(totalProducts / productsPerPage);

            logger.info(`${categorySlug} kategorisi bilgileri:`);
            logger.info(`   • Toplam ürün sayısı: ${totalProducts}`);
            logger.info(`   • Toplam sayfa sayısı: ${totalPages}`);
            logger.info(`   • Sayfa başına ürün: ${productsPerPage}`);
        } catch (error) {
            logger.warn(`Toplam ürün sayısı alınamadı, sadece ilk sayfa taranacak: ${error.message}`);
        }

        const allProducts = [];

        // Ürünleri toplama fonksiyonu
        async function scrapeProductsFromPage() {
            return await page.evaluate(() => {
                const items = [];
                document.querySelectorAll('li[class^="productListContent-"]').forEach((el) => {
                    const titleEl = el.querySelector('h2[class^="title-module_titleRoot"] span');
                    const priceEl = el.querySelector('div[class^="price-module_finalPrice"]');
                    const linkEl = el.querySelector('a[class^="productCardLink-module"]');

                    const title = titleEl?.innerText.trim();
                    const price = priceEl?.innerText.trim();
                    const link = linkEl?.getAttribute('href');
                    let image = null;
                    
                    // Öncelik sırası: özel class'lı img, kart içindeki ilk img, ilk source srcset
                    const imageEl = el.querySelector('img.hbImageView-module_hbImage__Ca3xO') || el.querySelector('img');
                    if (imageEl && imageEl.getAttribute('src')) {
                        image = imageEl.getAttribute('src');
                    } else {
                        const sourceEl = el.querySelector('source') || el.querySelector('source.hbImageView-module_hbImage__Ca3xO');
                        if (sourceEl && sourceEl.getAttribute('srcset')) {
                            image = sourceEl.getAttribute('srcset').split(',')[0].split(' ')[0];
                        } else {
                            // Fallback: data-src veya style background-image
                            const dataSrc = el.querySelector('[data-src]');
                            if (dataSrc) {
                                image = dataSrc.getAttribute('data-src');
                            } else if (el.style && el.style.backgroundImage) {
                                const bg = el.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                                if (bg && bg[1]) image = bg[1];
                            }
                        }
                    }
                    
                    if (title && price && link) {
                        items.push({
                            title,
                            price,
                            link: 'https://www.hepsiburada.com' + link,
                            image
                        });
                    }
                });
                return items;
            });
        }

        // İlk sayfadaki ürünleri al
        logger.info(`📥 Sayfa 1/${totalPages} taranıyor...`);
        let firstPageProducts = await scrapeProductsFromPage();
        allProducts.push(...firstPageProducts);
        logger.info(`✅ Sayfa 1: ${firstPageProducts.length} ürün tarandı`);

        // Diğer sayfaları tara
        for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
            const url = `${baseURL}?sayfa=${pageNum}`;
            logger.info(`📥 Sayfa ${pageNum}/${totalPages} taranıyor...`);

            // Sayfalar arası bekleme
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                await page.goto(url, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });

                // Sayfanın yüklenmesini bekle
                await page.waitForTimeout(3000);

                let pageProducts = await scrapeProductsFromPage();
                allProducts.push(...pageProducts);
                logger.info(`✅ Sayfa ${pageNum}: ${pageProducts.length} ürün tarandı`);

            } catch (error) {
                logger.error(`Sayfa ${pageNum} taranırken hata: ${error.message}`);
                // Hata olsa bile devam et
                continue;
            }
        }

        logger.info(`${categorySlug} kategorisinde toplam ${allProducts.length} ürün bulundu.`);

        return allProducts;

    } catch (error) {
        logger.error(`${categorySlug} kategorisi taranırken hata: ${error.message}`);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            logger.info('Tarayıcı kapatıldı.');
        }
    }
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    // Test için örnek kategori
    const testCategory = 'drone';
    
    scrapeCategory(testCategory)
        .then(products => {
            logger.info(`Test tamamlandı. ${products.length} ürün bulundu.`);
            process.exit(0);
        })
        .catch(error => {
            logger.error(`Test hatası: ${error.message}`);
            process.exit(1);
        });
}

module.exports = {
    scrapeCategory
}; 