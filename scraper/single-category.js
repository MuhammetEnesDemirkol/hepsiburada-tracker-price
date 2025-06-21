require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const db = require('./db');
const notificationService = require('../services/notification');

const productsPerPage = 36;
const outputDir = path.join(__dirname, 'products');
const PAGE_TIMEOUT = 45000;

// iOS kategorisi bilgileri
const IOS_CATEGORY = {
  title: 'iOS',
  slug: 'ios',
  url: 'https://www.hepsiburada.com/iphone-ios-telefonlar-c-371965',
  discount_threshold: 5
};

async function scrapeIOS() {
  console.log('\n' + '='.repeat(50));
  console.log('🍎 iOS Kategorisi Taraması Başlatılıyor');
  console.log('='.repeat(50) + '\n');

  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Bot tespitini önlemek için ayarlar
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    });

    const baseURL = IOS_CATEGORY.url.split('?')[0];
    console.log(`🌐 iOS kategorisi yükleniyor: ${baseURL}`);

    await page.goto(baseURL, { 
      waitUntil: 'networkidle2',
      timeout: PAGE_TIMEOUT 
    });

    // Sayfanın yüklenmesini bekle
    await page.waitForSelector('div[class^="VZbTh5SU1OsNkwSvy5FF"]', { timeout: PAGE_TIMEOUT });
    await page.waitForSelector('li[class^="productListContent-"]', { timeout: PAGE_TIMEOUT });

    // Toplam ürün sayısını ve sayfa sayısını hesapla
    let totalProducts = 0;
    let totalPages = 1;
    
    try {
      const totalText = await page.$eval(
        'div[class^="VZbTh5SU1OsNkwSvy5FF"]',
        (el) => el.textContent.trim()
      );
      totalProducts = parseInt(totalText.match(/\d+/)[0]) || 0;
      totalPages = Math.ceil(totalProducts / productsPerPage);

      console.log(`📊 iOS kategorisi bilgileri:`);
      console.log(`   • Toplam ürün sayısı: ${totalProducts}`);
      console.log(`   • Toplam sayfa sayısı: ${totalPages}`);
      console.log(`   • Sayfa başına ürün: ${productsPerPage}`);
    } catch (error) {
      console.log(`⚠️ Toplam ürün sayısı alınamadı, sadece ilk sayfa taranacak: ${error.message}`);
      totalPages = 1;
    }

    const allProducts = [];

    // Tüm sayfaları tara
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (pageNum > 1) {
        const url = `${baseURL}?sayfa=${pageNum}`;
        console.log(`\n📥 Sayfa ${pageNum}/${totalPages} taranıyor...`);
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 saniye bekle
        await page.goto(url, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT });
      } else {
        console.log(`\n📥 Sayfa ${pageNum}/${totalPages} taranıyor...`);
      }

      const pageProducts = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('li[class^="productListContent-"]').forEach((el) => {
          const titleEl = el.querySelector('h2[class^="title-module_titleRoot"] span');
          const priceEl = el.querySelector('div[class^="price-module_finalPrice"]');
          const linkEl = el.querySelector('a[class^="productCardLink-module"]');

          const title = titleEl?.innerText.trim();
          const price = priceEl?.innerText.trim();
          const link = linkEl?.getAttribute('href');
          let image = null;
          
          const imageEl = el.querySelector('img.hbImageView-module_hbImage__Ca3xO') || el.querySelector('img');
          if (imageEl && imageEl.getAttribute('src')) {
            image = imageEl.getAttribute('src');
          } else {
            const sourceEl = el.querySelector('source');
            if (sourceEl && sourceEl.getAttribute('srcset')) {
              image = sourceEl.getAttribute('srcset').split(',')[0].split(' ')[0];
            }
          }
          
          if (title && price && link) {
            // HB ile başlayan kodu linkten çek
            const codeMatch = link.match(/(HB[A-Z0-9]+)/);
            items.push({
              title,
              price,
              link: 'https://www.hepsiburada.com' + link,
              image,
              product_code: codeMatch ? codeMatch[1] : null
            });
          }
        });
        return items;
      });

      allProducts.push(...pageProducts);
      console.log(`✅ Sayfa ${pageNum}: ${pageProducts.length} ürün tarandı`);
    }

    await browser.close();

    // Dosyaya kaydet
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${IOS_CATEGORY.slug}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2), 'utf8');

    console.log('\n📊 iOS Tarama Sonuçları:');
    console.log(`   • Toplam taranan ürün: ${allProducts.length}`);
    console.log(`   • Dosya kaydedildi: ${outputPath}`);

    // Özet bildirimi gönder
    try {
      console.log('\n🔔 iOS kategorisi özeti bildirimi gönderiliyor...');
      await notificationService.sendSummaryNotification(allProducts, IOS_CATEGORY.title);
      console.log('✅ iOS kategorisi özeti bildirimi başarıyla gönderildi');
    } catch (e) {
      console.error('❌ iOS kategorisi özeti bildirimi gönderilemedi:', e.message);
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ iOS kategorisi taraması tamamlandı');
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ iOS kategorisi taranırken hata:', error.message);
    await browser.close();
  }
}

// Çalıştır
scrapeIOS(); 