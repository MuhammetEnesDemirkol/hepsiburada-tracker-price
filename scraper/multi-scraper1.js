require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const db = require('./db');
const axios = require('axios');
const { exec } = require('child_process');
const { formatMessage } = require('../api/notify');

const productsPerPage = 36;
const outputDir = path.join(__dirname, 'products');
const PAGE_TIMEOUT = 45000; // 45 saniye
const GLOBAL_TIMEOUT = 1800000; // 30 dakika
const RETRY_COUNT = 3; // Sayfa yükleme başarısız olursa 3 kez dene
const DELAY_BETWEEN_PAGES = 2000; // Sayfalar arası minimum bekleme süresi
const DELAY_BETWEEN_CATEGORIES = 30000; // Kategoriler arası bekleme süresi (30 saniye)
const SCAN_INTERVAL = 900000; // Taramalar arası bekleme süresi (15 dakika)

// Log kaydetme fonksiyonu
async function saveLog(categorySlug, message, type = 'info') {
  try {
    // Önce log sayısını kontrol et
    const countResult = await db.query('SELECT COUNT(*) FROM logs');
    const logCount = parseInt(countResult.rows[0].count);

    // Eğer log sayısı 100'ü geçtiyse, en eski kaydı sil
    if (logCount >= 100) {
      await db.query('DELETE FROM logs WHERE id = (SELECT id FROM logs ORDER BY created_at ASC LIMIT 1)');
    }

    // Yeni logu kaydet
    await db.query(
      'INSERT INTO logs (category_slug, message, type) VALUES ($1, $2, $3)',
      [categorySlug, message, type]
    );
  } catch (error) {
    console.error('Log kaydedilirken hata:', error);
  }
}

// Telegram bildirim fonksiyonu
async function sendTelegramMessage(message) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
      console.error('❌ Telegram bot token veya chat ID bulunamadı!');
      return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
  } catch (error) {
    console.error('❌ Telegram mesajı gönderilirken hata:', error.message);
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
      
      // Bot tespitini önlemek için gelişmiş ayarlar
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });

      // Tarama hızını düşür
      await page.setDefaultNavigationTimeout(PAGE_TIMEOUT);
      await page.setDefaultTimeout(PAGE_TIMEOUT);

      // Her istek öncesi rastgele gecikme
      await page.setRequestInterception(true);
      page.on('request', async (request) => {
        const delay = Math.random() * 2000 + 1000; // 1-3 saniye arası
        await new Promise(resolve => setTimeout(resolve, delay));
        request.continue();
      });

      const allProducts = [];

      // Sayfa yükleme fonksiyonu
      async function loadPage(url, retryCount = 0) {
        try {
          // Rastgele gecikme ekle (2-4 saniye)
          const delay = Math.floor(Math.random() * 2000) + 2000;
          await new Promise(resolve => setTimeout(resolve, delay));

          await page.goto(url, { 
            waitUntil: 'networkidle2',
            timeout: PAGE_TIMEOUT 
          });
          
          // Sayfa yüklendikten sonra ek bekleme (2-3 saniye)
          const postDelay = Math.floor(Math.random() * 1000) + 2000;
          await new Promise(resolve => setTimeout(resolve, postDelay));
          
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
      await page.waitForSelector('div[class^="VZbTh5SU1OsNkwSvy5FF"]', { timeout: PAGE_TIMEOUT });

      // Toplam ürün sayısını al
      const totalText = await page.$eval(
        'div[class^="VZbTh5SU1OsNkwSvy5FF"]',
        (el) => el.textContent.trim()
      );
      const totalProducts = parseInt(totalText.match(/\d+/)[0]) || 0;
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
      // Node.js tarafında image null olanları logla
      firstPageProducts.forEach(p => { if (!p.image) console.log('[NODE GÖRSEL LOG] Görsel yok:', p.title, p.link); });
      // Linkleri temizle
      firstPageProducts = firstPageProducts.map(p => {
        const link = cleanProductLink(p.link);
        // HB ile başlayan kodu linkten çek
        const codeMatch = link.match(/(HB[A-Z0-9]+)/);
        return { ...p, link, product_code: codeMatch ? codeMatch[1] : null };
      });

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

        // Sayfalar arası minimum bekleme süresi
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES));
        
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
        // Node.js tarafında image null olanları logla
        pageProducts.forEach(p => { if (!p.image) console.log('[NODE GÖRSEL LOG] Görsel yok:', p.title, p.link); });
        // Linkleri temizle
        pageProducts = pageProducts.map(p => {
          const link = cleanProductLink(p.link);
          // HB ile başlayan kodu linkten çek
          const codeMatch = link.match(/(HB[A-Z0-9]+)/);
          return { ...p, link, product_code: codeMatch ? codeMatch[1] : null };
        });

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
      let changedProducts = [];
      let newProductList = [];
      
      // Önceki verileri oku
      let previousProducts = [];
      let isFirstScan = false;
      if (fs.existsSync(previousPath)) {
        try {
          previousProducts = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
        } catch (e) {
          console.log('⚠️ Önceki veriler okunamadı, yeni dosya oluşturuluyor.');
        }
      } else {
        isFirstScan = true;
      }

      // Önceki ürünleri map'e çevir (öncelik ürün kodu, yoksa link)
      const previousMap = new Map();
      for (const p of previousProducts) {
        if (p.product_code) {
          previousMap.set(p.product_code, p);
        } else if (p.link) {
          previousMap.set(p.link, p);
        }
      }

      // Değişiklikleri kontrol et
      for (const newProduct of cleanedProducts) {
        const key = newProduct.product_code || newProduct.link;
        const oldProduct = previousMap.get(key);
        if (!oldProduct) {
          newProducts++;
          newProductList.push(newProduct);
        } else {
          // Eğer eski kayıtta görsel yok ama yenisinde varsa, eski kaydı güncelle ama bildirim gönderme
          let updated = false;
          if ((!oldProduct.image || oldProduct.image === '-') && newProduct.image && newProduct.image !== '-') {
            oldProduct.image = newProduct.image;
            updated = true;
          }
          // Diğer alanlar için de benzer güncelleme yapılabilir (ör: title, price vs.)
          // Eğer sadece güncelleme olduysa, yeni ürün bildirimi gönderme
          if (updated) {
            continue;
          }
          // Fiyat değişikliğini kontrol et
          const oldPrice = parseFloat(oldProduct.price.replace(/[^0-9,]/g, '').replace(',', '.'));
          const newPrice = parseFloat(newProduct.price.replace(/[^0-9,]/g, '').replace(',', '.'));
          
          // Sadece fiyat düşüşlerini kontrol et
          if (newPrice < oldPrice) {
            // Kategori için eşik değerini kontrol et
            const priceChange = ((oldPrice - newPrice) / oldPrice) * 100;
            if (priceChange >= category.discount_threshold) { // Kategori bazlı eşik değeri
              priceChanges++;
              changedProducts.push({
                old: oldProduct,
                new: newProduct,
                changePercentage: priceChange.toFixed(2)
              });
            }
          }
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

      if (!isFirstScan && (priceChanges > 0 || newProducts > 0)) {
        console.log('\n🔔 Bildirim gönderiliyor...');
        try {
          // Fiyat değişikliği olan ürünler için bildirim
          if (priceChanges > 0) {
            for (const change of changedProducts) {
              const formatted =
                `💸 Fiyatı güncellenen ürün: ${change.new.title}\n` +
                `📦 Ürün Kodu: ${change.new.product_code || '-'}\n` +
                `🖼️ Görsel: ${change.new.image || '-'}\n` +
                `📈 Eski fiyat: ${change.old.price}\n` +
                `📊 Yeni fiyat: ${change.new.price}\n` +
                `⚡️ Eşik değeri: %${category.discount_threshold}\n\n` +
                `İndirim oranı: %${change.changePercentage}\n` +
                `🔗 ${change.new.link}`;
              await saveLog(slug, formatted, 'price_change');
              await sendTelegramMessage(formatted);
            }
          }
          // Yeni ürünler için bildirim
          if (newProducts > 0) {
            for (const product of newProductList) {
              const formatted = formatMessage({
                type: 'new',
                title: product.title,
                price: product.price,
                link: product.link,
                productCode: product.product_code,
                imageUrl: product.image,
              });
              await saveLog(slug, formatted, 'new_product');
              await sendTelegramMessage(formatted);
            }
          }
          console.log('✅ Bildirimler gönderildi');
        } catch (error) {
          console.error('❌ Bildirim gönderilirken hata:', error.message);
        }
      }

      console.log('\n' + '='.repeat(50));
      console.log(`✅ ${category.title} kategorisi taraması tamamlandı`);
      console.log('='.repeat(50) + '\n');

      // Tarama bittikten sonra kategori bekleme süresi
      console.log(`\n⏳ ${category.title} kategorisi için ${DELAY_BETWEEN_CATEGORIES/1000} saniye bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CATEGORIES));

      return true;
    } catch (error) {
      retryCount++;
      console.error(`\n⚠️ ${category.title} kategorisi taranırken hata oluştu (Deneme ${retryCount}/${MAX_RETRIES}):`, error.message);
      
      if (retryCount < MAX_RETRIES) {
        console.log(`🔄 ${category.title} kategorisi yeniden deneniyor...`);
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 saniye bekle
        continue;
      }
      
      console.error(`\n❌ ${category.title} kategorisi ${MAX_RETRIES} deneme sonunda başarısız oldu.`);
      return false;
    }
  }
}

// 🔁 Tüm kategorileri paralel olarak tara
async function scrapeAll() {
  const startTime = Date.now();
  const categories = await loadCategoriesFromDB();
  
  console.log('\n' + '='.repeat(50));
  console.log('🚀 Hepsiburada Fiyat Takip Sistemi Başlatılıyor');
  console.log('='.repeat(50));
  console.log(`\n📋 Toplam ${categories.length} kategori taranacak\n`);

  let successCount = 0;
  let failCount = 0;
  let totalProducts = 0;

  // Tek browser başlat
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Kategorileri sırayla tara
  for (let i = 0; i < categories.length; i++) {
    // Global timeout kontrolü
    if (Date.now() - startTime > GLOBAL_TIMEOUT) {
      const message = `\n🛑 Global timeout (${GLOBAL_TIMEOUT/1000} saniye) aşıldı. İşlem durduruluyor.`;
      console.error(message);
      break;
    }

    const category = categories[i];
    console.log(`\n🔄 ${category.title} kategorisine geçiliyor...`);

    const success = await scrapeCategory(category, browser);
    if (success) {
      successCount++;
      const outputPath = path.join(outputDir, `${category.slug}.json`);
      if (fs.existsSync(outputPath)) {
        const products = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        totalProducts += products.length;
      }
    } else {
      failCount++;
    }

    // Kategoriler arası rastgele bekleme
    if (i < categories.length - 1) {
      const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5 saniye
      console.log(`\n⏳ Sonraki kategori için ${delay/1000} saniye bekleniyor...\n`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Browser'ı kapat
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

  // Scraping işlemi bittikten sonra veritabanına kayıt işlemini başlat
  exec('node scraper/save-to-db.js', (err, stdout, stderr) => {
    if (err) {
      console.error('Veritabanı kaydı başlatılamadı:', err);
      return;
    }
    console.log(stdout);
    if (stderr) console.error(stderr);
  });
}

// 🔄 Sürekli tarama fonksiyonu
async function startContinuousScanning() {
  console.log('\n' + '='.repeat(50));
  console.log('🔄 Sürekli Tarama Modu Başlatılıyor');
  console.log('='.repeat(50));
  console.log(`\n⏰ Taramalar arası bekleme süresi: ${SCAN_INTERVAL/1000/60} dakika\n`);

  while (true) {
    try {
      console.log('\n' + '='.repeat(50));
      console.log(`🕒 Yeni tarama başlıyor: ${new Date().toLocaleString()}`);
      console.log('='.repeat(50));

      await scrapeAll();

      console.log('\n' + '='.repeat(50));
      console.log(`⏳ Bir sonraki tarama için ${SCAN_INTERVAL/1000/60} dakika bekleniyor...`);
      console.log(`⏰ Sonraki tarama: ${new Date(Date.now() + SCAN_INTERVAL).toLocaleString()}`);
      console.log('='.repeat(50) + '\n');

      await new Promise(resolve => setTimeout(resolve, SCAN_INTERVAL));
    } catch (error) {
      console.error('\n❌ Tarama sırasında hata oluştu:', error);
      console.log(`\n⏳ Hata sonrası 5 dakika bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, 300000)); // 5 dakika bekle
    }
  }
}

// Ana fonksiyonu değiştir
startContinuousScanning(); // Yeni sürekli tarama modu
