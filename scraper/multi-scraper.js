require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const db = require('./db');

const productsPerPage = 36;
const outputDir = path.join(__dirname, 'products');
const PAGE_TIMEOUT = 30000; // 30 saniye
const GLOBAL_TIMEOUT = 1800000; // 30 dakika
const RETRY_COUNT = 3; // Sayfa yükleme başarısız olursa 3 kez dene

// Log kaydetme fonksiyonu
async function saveLog(categorySlug, message, type = 'info') {
  try {
    await db.query(
      'INSERT INTO logs (category_slug, message, type) VALUES ($1, $2, $3)',
      [categorySlug, message, type]
    );
  } catch (error) {
    console.error('Log kaydedilirken hata:', error);
  }
}

// 🧠 Veritabanından kategorileri al
async function loadCategoriesFromDB() {
  const result = await db.query('SELECT * FROM categories ORDER BY id');
  return result.rows;
}

// Ürün linkini temizle
function cleanProductLink(link) {
  try {
    const redirectMatch = link.match(/redirect=([^&]+)/);
    if (redirectMatch) {
      return decodeURIComponent(redirectMatch[1]);
    }
    return link;
  } catch (e) {
    return link;
  }
}

// 🔍 Bir kategoriyi baştan sona tara
async function scrapeCategory(category, browser) {
  const startTime = Date.now();
  const baseURL = category.url.split('?')[0];
  const slug = category.slug;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  console.log('\n' + '='.repeat(50));
  console.log(`🔍 ${category.title} kategorisi taranıyor...`);
  console.log('='.repeat(50) + '\n');

  while (retryCount < MAX_RETRIES) {
    try {
      const page = await browser.newPage();
      await page.setDefaultNavigationTimeout(PAGE_TIMEOUT);
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      );

      const allProducts = [];

      // Sayfa yükleme fonksiyonu
      async function loadPage(url, retryCount = 0) {
        try {
          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: PAGE_TIMEOUT 
          });
          await page.waitForTimeout(2000);
          return true;
        } catch (error) {
          if (retryCount < RETRY_COUNT) {
            const message = `⚠️ Sayfa yüklenemedi, ${retryCount + 1}. deneme yapılıyor...`;
            console.log(message);
            await page.waitForTimeout(5000);
            return loadPage(url, retryCount + 1);
          }
          throw error;
        }
      }

      // İlk sayfayı aç
      console.log(`🌐 ${category.title} - İlk sayfa yükleniyor...`);
      await loadPage(baseURL);

      // Sayfanın yüklenmesini bekle
      await page.waitForSelector('div[class^="totalProductCount-"] span', { timeout: PAGE_TIMEOUT });

      // Toplam ürün sayısını al
      const totalText = await page.$eval(
        'div[class^="totalProductCount-"] span',
        (el) => el.textContent.trim()
      );
      const totalProducts = parseInt(totalText) || 0;
      const totalPages = Math.ceil(totalProducts / productsPerPage);

      console.log(`\n📊 ${category.title} kategorisi bilgileri:`);
      console.log(`   • Toplam ürün sayısı: ${totalProducts}`);
      console.log(`   • Toplam sayfa sayısı: ${totalPages}`);
      console.log('   • Sayfa başına ürün: ' + productsPerPage + '\n');

      // İlk sayfadaki ürünleri al
      console.log(`📥 Sayfa 1/${totalPages} taranıyor...`);
      let firstPageProducts = await page.evaluate(() => {
        const items = [];
        document.querySelectorAll('li[class^="productListContent-"]').forEach((el) => {
          const titleEl = el.querySelector('h2[class^="title-module_titleRoot"] span');
          const priceEl = el.querySelector('div[class^="price-module_finalPrice"]');
          const linkEl = el.querySelector('a[class^="productCardLink-module"]');

          const title = titleEl?.innerText.trim();
          const price = priceEl?.innerText.trim();
          const link = linkEl?.getAttribute('href');

          if (title && price && link) {
            items.push({
              title,
              price,
              link: 'https://www.hepsiburada.com' + link
            });
          }
        });
        return items;
      });
      // Linkleri temizle
      firstPageProducts = firstPageProducts.map(p => ({ ...p, link: cleanProductLink(p.link) }));

      allProducts.push(...firstPageProducts);
      console.log(`✅ Sayfa 1: ${firstPageProducts.length} ürün tarandı`);

      // Diğer sayfaları tara
      for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
        // Global timeout kontrolü
        if (Date.now() - startTime > GLOBAL_TIMEOUT) {
          const message = `Global timeout (${GLOBAL_TIMEOUT/1000} saniye) aşıldı`;
          console.error(message);
          throw new Error(message);
        }

        const url = `${baseURL}?sayfa=${pageNum}`;
        console.log(`\n📥 Sayfa ${pageNum}/${totalPages} taranıyor...`);

        await loadPage(url);

        let pageProducts = await page.evaluate(() => {
          const items = [];
          document.querySelectorAll('li[class^="productListContent-"]').forEach((el) => {
            const titleEl = el.querySelector('h2[class^="title-module_titleRoot"] span');
            const priceEl = el.querySelector('div[class^="price-module_finalPrice"]');
            const linkEl = el.querySelector('a[class^="productCardLink-module"]');

            const title = titleEl?.innerText.trim();
            const price = priceEl?.innerText.trim();
            const link = linkEl?.getAttribute('href');

            if (title && price && link) {
              items.push({
                title,
                price,
                link: 'https://www.hepsiburada.com' + link
              });
            }
          });
          return items;
        });
        // Linkleri temizle
        pageProducts = pageProducts.map(p => ({ ...p, link: cleanProductLink(p.link) }));

        allProducts.push(...pageProducts);
        console.log(`✅ Sayfa ${pageNum}: ${pageProducts.length} ürün tarandı`);
      }

      await page.close();

      // Dosyaya yazmadan önce tüm ürünlerin linkini temizle
      const cleanedProducts = allProducts.map(p => ({ ...p, link: cleanProductLink(p.link) }));

      // Dosyaya yaz
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, `${slug}.json`);
      const previousPath = path.join(outputDir, `${slug}_previous.json`);

      // Fiyat değişikliklerini ve yeni ürünleri kontrol et
      let priceChanges = 0;
      let newProducts = 0;
      
      // Önceki verileri oku
      let previousProducts = [];
      if (fs.existsSync(previousPath)) {
        try {
          previousProducts = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
        } catch (e) {
          console.log('⚠️ Önceki veriler okunamadı, yeni dosya oluşturuluyor.');
        }
      }

      // Önceki ürünleri map'e çevir
      const previousMap = new Map(previousProducts.map(p => [p.link, p]));

      // Değişiklikleri kontrol et
      for (const newProduct of cleanedProducts) {
        const oldProduct = previousMap.get(newProduct.link);
        if (!oldProduct) {
          newProducts++;
        } else if (oldProduct.price !== newProduct.price) {
          priceChanges++;
        }
      }

      // Yeni verileri kaydet
      fs.writeFileSync(outputPath, JSON.stringify(cleanedProducts, null, 2), 'utf8');
      
      // Önceki verileri güncelle
      fs.writeFileSync(previousPath, JSON.stringify(cleanedProducts, null, 2), 'utf8');

      console.log('\n📊 Tarama Sonuçları:');
      console.log(`   • Toplam taranan ürün: ${cleanedProducts.length}`);
      console.log(`   • Fiyat değişikliği: ${priceChanges} ürün`);
      console.log(`   • Yeni ürün: ${newProducts} ürün`);

      if (priceChanges > 0 || newProducts > 0) {
        console.log('\n🔔 Bildirim gönderiliyor...');
        // Burada bildirim gönderme işlemi yapılabilir
        console.log('✅ Bildirim gönderildi');
      }

      console.log('\n' + '='.repeat(50));
      console.log(`✅ ${category.title} kategorisi taraması tamamlandı`);
      console.log('='.repeat(50) + '\n');

      return true;
    } catch (error) {
      retryCount++;
      console.error(`\n⚠️ ${category.title} kategorisi taranırken hata oluştu (Deneme ${retryCount}/${MAX_RETRIES}):`, error.message);
      
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 ${category.title} kategorisi yeniden deneniyor...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      console.error(`\n❌ ${category.title} kategorisi ${MAX_RETRIES} deneme sonunda başarısız oldu.`);
      return false;
    }
  }
}

// 🔁 Tüm kategorileri sırayla tara
async function scrapeAll() {
  const startTime = Date.now();
  const categories = await loadCategoriesFromDB();
  
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Hepsiburada Fiyat Takip Sistemi Başlatılıyor');
  console.log('='.repeat(50));
  console.log(`\n📋 Toplam ${categories.length} kategori taranacak\n`);

  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let successCount = 0;
  let failCount = 0;
  let totalProducts = 0;
  let totalPriceChanges = 0;
  let totalNewProducts = 0;

  for (const category of categories) {
    // Global timeout kontrolü
    if (Date.now() - startTime > GLOBAL_TIMEOUT) {
      const message = `\n🛑 Global timeout (${GLOBAL_TIMEOUT/1000} saniye) aşıldı. İşlem durduruluyor.`;
      console.error(message);
      break;
    }

    const success = await scrapeCategory(category, browser);
    if (success) {
      successCount++;
      // Burada kategori sonuçlarını toplayabiliriz
      const outputPath = path.join(outputDir, `${category.slug}.json`);
      if (fs.existsSync(outputPath)) {
        const products = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        totalProducts += products.length;
      }
    } else {
      failCount++;
    }
  }

  await browser.close();

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 TARAMA SONUÇLARI');
  console.log('='.repeat(50));
  console.log(`\n✅ Başarılı: ${successCount} kategori`);
  console.log(`❌ Başarısız: ${failCount} kategori`);
  console.log(`📦 Toplam taranan ürün: ${totalProducts}`);
  console.log(`⏱️ Toplam süre: ${duration} saniye`);
  console.log('\n' + '='.repeat(50) + '\n');
}

scrapeAll();
