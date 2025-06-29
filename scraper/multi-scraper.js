require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const db = require('./db');
const notificationService = require('../services/notification');

const productsPerPage = 36;
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

// Fiyat parsing fonksiyonu
function parsePrice(priceString) {
  if (typeof priceString === 'number') {
    return priceString;
  }
  if (!priceString || typeof priceString !== 'string') {
    console.log(`⚠️ Geçersiz fiyat formatı: ${priceString}`);
    return null;
  }
  
  // Fiyatı temizle
  let cleanPrice = priceString.trim();
  
  // Tüm boşlukları kaldır
  cleanPrice = cleanPrice.replace(/\s+/g, '');
  
  // TL, ₺, $, € gibi para birimlerini kaldır
  cleanPrice = cleanPrice.replace(/[₺$€£]/g, '');
  cleanPrice = cleanPrice.replace(/TL/gi, '');
  cleanPrice = cleanPrice.replace(/TRY/gi, '');
  
  // Sadece rakam, nokta ve virgül bırak
  cleanPrice = cleanPrice.replace(/[^\d.,]/g, '');
  
  // Eğer hiç rakam yoksa
  if (!/\d/.test(cleanPrice)) {
    console.log(`⚠️ Fiyatta rakam bulunamadı: "${priceString}" -> "${cleanPrice}"`);
    return null;
  }
  
  let numericPrice = null;
  
  // Türk fiyat formatlarını parse et
  if (cleanPrice.includes(',') && cleanPrice.includes('.')) {
    // Format: "1.234,56" veya "1.234,56" -> 1234.56
    const parts = cleanPrice.split(',');
    if (parts.length === 2) {
      const integerPart = parts[0].replace(/\./g, ''); // Binlik ayırıcıları kaldır
      const decimalPart = parts[1];
      numericPrice = parseFloat(integerPart + '.' + decimalPart);
    }
  } else if (cleanPrice.includes(',') && !cleanPrice.includes('.')) {
    // Format: "1234,56" -> 1234.56
    numericPrice = parseFloat(cleanPrice.replace(',', '.'));
  } else if (cleanPrice.includes('.') && !cleanPrice.includes(',')) {
    // Format: "1234.56" veya "1.234" -> 1234.56 veya 1234
    // Eğer son iki karakter rakam değilse, binlik ayırıcı olarak kabul et
    const lastTwoChars = cleanPrice.slice(-2);
    if (/^\d{2}$/.test(lastTwoChars)) {
      // Muhtemelen ondalık format: "1234.56"
      numericPrice = parseFloat(cleanPrice);
    } else {
      // Muhtemelen binlik ayırıcı: "1.234"
      numericPrice = parseFloat(cleanPrice.replace(/\./g, ''));
    }
  } else {
    // Sadece rakamlar: "1234"
    numericPrice = parseFloat(cleanPrice);
  }
  
  // Son kontrol
  if (isNaN(numericPrice) || numericPrice <= 0) {
    console.log(`⚠️ Fiyat parse edilemedi: "${priceString}" -> "${cleanPrice}" -> ${numericPrice}`);
    return null;
  }
  
  // Makul fiyat aralığı kontrolü (1 TL - 1.000.000 TL)
  if (numericPrice < 1 || numericPrice > 1000000) {
    console.log(`⚠️ Makul olmayan fiyat: ${numericPrice} TL (${priceString})`);
    return null;
  }
  
  // Kuruşları at (her zaman tam sayı)
  return Math.floor(numericPrice);
}

// Ürünleri veritabanına kaydet
async function saveProductsToDatabase(products, slug) {
  try {
    let successCount = 0;
    let errorCount = 0;
    let savedProducts = [];

    for (const product of products) {
      const { title, price, link } = product;
      const productCode = product.product_code;
      
      if (!productCode) {
        console.log(`⚠️ Ürün kodu bulunamadı, atlanıyor: ${title}`);
        continue;
      }

      const numericPrice = parsePrice(price);

      if (numericPrice === null) {
        console.log(`⚠️ Geçersiz fiyat, atlanıyor: ${title} - ${price}`);
        continue;
      }

      try {
        // Önce ürünün mevcut olup olmadığını ve fiyatını kontrol et
        const existingProduct = await db.query(
          'SELECT id, price FROM products WHERE product_code = $1',
          [productCode]
        );

        if (existingProduct.rows.length > 0) {
          // Ürün zaten var, fiyat değişikliği kontrol et
          const existingPrice = parseFloat(existingProduct.rows[0].price);
          
          if (existingPrice === numericPrice) {
            // Fiyat değişmedi, güncelleme yapma
            console.log(`ℹ️ Fiyat değişmedi, güncelleme yapılmıyor: ${title} (${numericPrice} TL)`);
            continue;
          }
          
          // Fiyat değişti, güncelle
          const result = await db.query(
            `UPDATE products 
             SET title = $1, price = $2, link = $3,
                 lowest_price = LEAST($2, COALESCE(lowest_price, $2))
             WHERE product_code = $4
             RETURNING id`,
            [title, numericPrice, link, productCode]
          );

          const productId = result.rows[0].id;

          // Fiyat geçmişine kaydet
          await db.query(
            'INSERT INTO price_history (product_id, price, created_at) VALUES ($1, $2, NOW())',
            [productId, numericPrice]
          );

          successCount++;
          
          // Başarıyla kaydedilen ürünü listeye ekle
          savedProducts.push({
            id: productId,
            title,
            price: numericPrice,
            link,
            product_code: productCode,
            slug
          });

        } else {
          // Yeni ürün, ekle
          const result = await db.query(
            `INSERT INTO products 
             (title, price, link, product_code, slug, lowest_price) 
             VALUES ($1, $2, $3, $4, $5, $2) 
             RETURNING id`,
            [title, numericPrice, link, productCode, slug]
          );

          const productId = result.rows[0].id;

          // Fiyat geçmişine kaydet
          await db.query(
            'INSERT INTO price_history (product_id, price, created_at) VALUES ($1, $2, NOW())',
            [productId, numericPrice]
          );

          successCount++;
          
          // Başarıyla kaydedilen ürünü listeye ekle
          savedProducts.push({
            id: productId,
            title,
            price: numericPrice,
            link,
            product_code: productCode,
            slug
          });
        }

      } catch (error) {
        console.error(`❌ Ürün kaydedilirken hata: ${title} - ${error.message}`);
        errorCount++;
      }
    }

    console.log(`✅ Veritabanı kayıt tamamlandı: ${successCount} başarılı, ${errorCount} hata`);
    
    return savedProducts;
    
  } catch (error) {
    console.error('❌ Veritabanı kayıt hatası:', error.message);
    throw error;
  }
}

// Veritabanından önceki ürünleri al
async function getPreviousProductsFromDB(slug) {
  try {
    const result = await db.query(
      'SELECT * FROM products WHERE slug = $1',
      [slug]
    );
    return result.rows;
  } catch (error) {
    console.error('❌ Önceki ürünler alınırken hata:', error.message);
    return [];
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

      // Sayfanın yüklenmesini bekle (kategori başlığı selectoru)
      await page.waitForSelector('div[class^="VZbTh5SU1OsNkwSvy5FF"]', { timeout: PAGE_TIMEOUT });

      // Toplam ürün sayısını ve sayfa sayısını hesapla
      let totalProducts = 0;
      let totalPages = 1;
      
      try {
        // Toplam ürün sayısını al
        const totalText = await page.$eval(
          'div[class^="VZbTh5SU1OsNkwSvy5FF"]',
          (el) => el.textContent.trim()
        );
        totalProducts = parseInt(totalText.match(/\d+/)[0]) || 0;
        totalPages = Math.ceil(totalProducts / productsPerPage);

        console.log(`${category.title} kategorisi bilgileri:`);
        console.log(`   • Toplam ürün sayısı: ${totalProducts}`);
        console.log(`   • Toplam sayfa sayısı: ${totalPages}`);
        console.log(`   • Sayfa başına ürün: ${productsPerPage}`);
      } catch (error) {
        console.log(`⚠️ Toplam ürün sayısı alınamadı, sadece ilk sayfa taranacak: ${error.message}`);
        totalPages = 1;
      }

      // Ürün listesi selectorunu da bekle (daha güvenli)
      try {
        await page.waitForSelector('li[class^="productListContent-"]', { timeout: PAGE_TIMEOUT });
      } catch (e) {
        // Selector bulunamazsa sayfanın HTML'ini kaydet
        const html = await page.content();
        const failPath = path.join(__dirname, `${slug}_fail_${Date.now()}.html`);
        fs.writeFileSync(failPath, html, 'utf8');
        console.error(`❌ Ürün listesi selectoru bulunamadı! Sayfa kaydedildi: ${failPath}`);
        // Bot koruması tespiti
        if (html.includes('captcha') || html.toLowerCase().includes('robot olmadığınızı')) {
          console.error('⚠️ Bot koruması/captcha tespit edildi!');
        }
        throw new Error('Ürün listesi selectoru bulunamadı');
      }

      // Ürünleri çek
      const firstPageProducts = await page.evaluate(() => {
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

      // Eğer ürün bulunamazsa, sayfanın HTML'ini kaydet ve logla
      if (!firstPageProducts || firstPageProducts.length === 0) {
        const html = await page.content();
        const failPath = path.join(__dirname, `${slug}_no_products_${Date.now()}.html`);
        fs.writeFileSync(failPath, html, 'utf8');
        console.error(`❌ Hiç ürün bulunamadı! Sayfa kaydedildi: ${failPath}`);
        // Bot koruması tespiti
        if (html.includes('captcha') || html.toLowerCase().includes('robot olmadığınızı')) {
          console.error('⚠️ Bot koruması/captcha tespit edildi!');
        }
      }

      // İlk sayfa ürünlerini ekle
      const firstPageWithCodes = firstPageProducts.map(p => {
        const link = cleanProductLink(p.link);
        // HB ile başlayan kodu linkten çek
        const codeMatch = link.match(/(HB[A-Z0-9]+)/);
        return { ...p, link, product_code: codeMatch ? codeMatch[1] : null };
      });
      
      allProducts.push(...firstPageWithCodes);
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

      // Veritabanından önceki ürünleri al
      console.log('\n💾 Veritabanından önceki ürünler alınıyor...');
      const previousProducts = await getPreviousProductsFromDB(slug);

      // Fiyat değişikliklerini ve yeni ürünleri kontrol et
      let priceChanges = 0;
      let newProducts = 0;
      let changedProducts = [];
      let newProductList = [];
      
      // Önceki ürünleri map'e çevir (product_code ile)
      const previousMap = new Map();
      for (const p of previousProducts) {
        if (p.product_code) {
          previousMap.set(p.product_code, p);
        }
      }

      // Değişiklikleri kontrol et
      for (const newProduct of cleanedProducts) {
        const productCode = newProduct.product_code;
        
        if (!productCode) {
          console.log(`⚠️ Ürün kodu bulunamadı: ${newProduct.title}`);
          continue;
        }

        const oldProduct = previousMap.get(productCode);
        
        if (!oldProduct) {
          newProducts++;
          newProductList.push(newProduct);
        } else {
          // Fiyat değişikliğini kontrol et
          const oldPrice = parsePrice(oldProduct.price);
          const newPrice = parsePrice(newProduct.price);
          
          // Fiyat parse edilemezse atla
          if (isNaN(oldPrice) || newPrice === null) {
            console.log(`⚠️ Fiyat parse edilemedi, ürün atlanıyor: ${newProduct.title}`);
            continue;
          }
          
          // Fiyatlar aynıysa atla
          if (oldPrice === newPrice) {
            console.log(`ℹ️ Fiyat değişmedi, atlanıyor: ${newProduct.title} (${newPrice} TL)`);
            continue;
          }
          
          // Sadece fiyat düşüşlerini kontrol et
          if (newPrice < oldPrice) {
            // Kategori için eşik değerini kontrol et - doğru oran hesaplama: ((Eski Fiyat - Yeni Fiyat) / Eski Fiyat) * 100
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

      // ÖNCE veritabanına kaydet
      console.log('\n💾 Ürünler veritabanına kaydediliyor...');
      let savedProducts = [];
      try {
        savedProducts = await saveProductsToDatabase(cleanedProducts, slug);
        console.log('✅ Ürünler veritabanına kaydedildi');
      } catch (error) {
        console.error('❌ Veritabanına kayıt hatası:', error.message);
        // Veritabanına kayıt başarısız olursa bildirim gönderme
        return false;
      }

      console.log('\n📊 Tarama Sonuçları:');
      console.log(`   • Toplam taranan ürün: ${cleanedProducts.length}`);
      console.log(`   • Fiyat değişikliği: ${priceChanges} ürün`);
      console.log(`   • Yeni ürün: ${newProducts} ürün`);

      // SADECE başarıyla kaydedilen ürünler için bildirim gönder
      if (priceChanges > 0 || newProducts > 0) {
        console.log('\n🔔 Bildirim gönderiliyor...');
        try {
          // Fiyat değişikliği olan ürünler için bildirim
          if (priceChanges > 0) {
            for (const change of changedProducts) {
              // Ürünün veritabanında başarıyla kaydedilip kaydedilmediğini kontrol et
              const isSaved = savedProducts.some(p => p.product_code === change.new.product_code);
              if (!isSaved) {
                continue;
              }

              // Anında bildirim gönder
              await notificationService.sendPriceChangeNotification({
                old: change.old,
                new: change.new
              });

              const formatted =
                `💸 Fiyatı güncellenen ürün: ${change.new.title}\n` +
                `📦 Ürün Kodu: ${change.new.product_code}\n` +
                `📈 Eski fiyat: ${change.old.price.toLocaleString('tr-TR')} TL\n` +
                `📊 Yeni fiyat: ${parsePrice(change.new.price).toLocaleString('tr-TR')} TL\n` +
                `⚡️ Eşik değeri: %${category.discount_threshold}\n\n` +
                `İndirim oranı: %${change.changePercentage}\n` +
                `🔗 ${change.new.link}`;
              await saveLog(slug, formatted, 'price_change');
            }
          }
          // Yeni ürünler için bildirim
          if (newProducts > 0) {
            for (const product of newProductList) {
              // Ürünün veritabanında başarıyla kaydedilip kaydedilmediğini kontrol et
              const isSaved = savedProducts.some(p => p.product_code === product.product_code);
              if (!isSaved) {
                continue;
              }

              // Anında bildirim gönder
              await notificationService.sendNewProductNotification(product);

              const formatted = 
                `🆕 Yeni ürün eklendi: ${product.title}\n` +
                `📦 Ürün Kodu: ${product.product_code}\n` +
                `💰 Fiyat: ${parsePrice(product.price).toLocaleString('tr-TR')} TL\n` +
                `🔗 ${product.link}`;
              await saveLog(slug, formatted, 'new_product');
              console.log(`✅ Yeni ürün bildirimi gönderildi: ${product.title}`);
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
      // Veritabanından ürün sayısını al
      try {
        const result = await db.query('SELECT COUNT(*) FROM products WHERE slug = $1', [category.slug]);
        totalProducts += parseInt(result.rows[0].count);
      } catch (error) {
        console.error('❌ Ürün sayısı alınamadı:', error.message);
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

  // Genel özet bildirimi gönder
  try {
    console.log('🔔 Genel özet bildirimi buffer\'a ekleniyor...');
    
    // Veritabanından son tarama sonuçlarını al
    const result = await db.query(`
      SELECT 
        p.title,
        p.price as current_price,
        ph.price as previous_price,
        p.link,
        p.product_code,
        c.title as category_name
      FROM products p
      LEFT JOIN price_history ph ON p.id = ph.product_id
      LEFT JOIN categories c ON p.slug = c.slug
      WHERE ph.created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY ph.created_at DESC
      LIMIT 100
    `);

    if (result.rows.length > 0) {
      const summary = {
        title: 'Genel Tarama Özeti',
        previous_price: 0,
        current_price: 0,
        change_percentage: 0,
        link: '',
        summary: true,
        products: result.rows.map(row => ({
          title: row.title,
          current_price: row.current_price,
          previous_price: row.previous_price || row.current_price,
          change_percentage: row.previous_price ? 
            ((row.current_price - row.previous_price) / row.previous_price * 100) : 0,
          link: row.link,
          category_name: row.category_name
        }))
      };
      
      notificationService.bufferNotification(summary);
      console.log('✅ Genel özet bildirimi buffer\'a eklendi');
    } else {
      console.log('⚠️ Genel özet için veri bulunamadı');
    }
  } catch (e) {
    console.error('❌ Genel özet bildirimi eklenirken hata:', e.message);
  }
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
