require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { sendTelegramMessage, formatMessage } = require('../api/notify');
const databaseService = require('../services/database');
const productCodeService = require('../services/product-code');
const logger = require('../services/logger');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

function extractProductCode(link) {
    // Önce p-XXXXX formatını dene
    const pMatch = link.match(/p-([A-Z0-9]+)/);
    if (pMatch) return pMatch[1];

    // Sonra diğer formatları dene
    const otherMatch = link.match(/-(HBC|HBV|HB)[A-Z0-9]+|-(ailepil[0-9]+)/i);
    if (otherMatch) return otherMatch[0].replace('-', '');

    // Son olarak linkin sonundaki 8+ karakterli kodu dene
    const fallback = link.match(/-([A-Z0-9]{8,})$/i);
    return fallback ? fallback[1] : null;
}

function generateFallbackCode(title, link) {
    // Başlıktan ve linkten benzersiz bir kod oluştur
    const cleanTitle = title.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 10);
    const cleanLink = link.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 10);
    
    // Hash oluştur
    const hash = crypto.createHash('md5').update(link).digest('hex').substring(0, 8);
    return `FALLBACK_${cleanTitle}_${hash}`;
}

function getUniqueProductCode(link, title) {
    let productCode = extractProductCode(link);
    
    // Eğer kod bulunamazsa, fallback kod oluştur
    if (!productCode) {
        productCode = generateFallbackCode(title, link);
    }
    
    return productCode;
}

// Slug'a göre dosyayı oku ve veritabanına kaydet
async function saveProductsForSlug(slug, filename) {
  const filePath = path.join(__dirname, 'products', filename);
  if (!fs.existsSync(filePath)) {
    console.log(`⛔ ${filename} bulunamadı, atlanıyor...`);
    return;
  }

  const products = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let inserted = 0, skipped = 0, updated = 0, errors = 0;

  // Kategori bilgisini al
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const categoryResult = await client.query('SELECT title, discount_threshold FROM categories WHERE slug = $1', [slug]);
    const category = categoryResult.rows[0];
    
    if (!category) {
      console.log(`⚠️ ${slug} kategorisi bulunamadı, atlanıyor...`);
      return;
    }
    
    const threshold = category.discount_threshold || 10;

    // Bu taramada bulunan ürün linklerini topla
    const currentLinks = products.map(item => item.link);

    for (const item of products) {
      const { title, price, link, image } = item;
      const productCode = getUniqueProductCode(link, title);
      if (!productCode) {
        console.error(`❌ Kod bulunamadı: ${link}`);
        errors++;
        continue;
      }

      const numericPrice = parseFloat(price
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.]/g, ''));

      try {
        // Kod ile kontrol et
        const existingProduct = await client.query(
          'SELECT id, price, lowest_price FROM products WHERE slug = $1 AND product_code = $2',
          [slug, productCode]
        );

        if (existingProduct.rows.length > 0) {
          const currentProduct = existingProduct.rows[0];
          if (Math.abs(currentProduct.price - numericPrice) < 0.01) {
            await client.query('UPDATE products SET status = $1 WHERE id = $2', ['aktif', currentProduct.id]);
            skipped++;
            continue;
          }
          await client.query(
            `UPDATE products 
             SET price = $1, 
                 lowest_price = CASE 
                     WHEN $1 < lowest_price THEN $1 
                     ELSE lowest_price 
                 END 
             WHERE id = $2`,
            [numericPrice, currentProduct.id]
          );
          updated++;
          console.log(`✅ [BAŞARILI-GÜNCELLEME] ${title} (${link})`);
          // Eşik değer kontrolü
          if (currentProduct.price > 0) {
            const discount = Math.abs((currentProduct.price - numericPrice) / currentProduct.price) * 100;
            if (discount >= threshold) {
              let msg = `💸 Fiyatı güncellenen ürün: ${title}\nEski fiyat: ${currentProduct.price} TL\nYeni fiyat: ${price}\nİndirim oranı: %${discount.toFixed(1)}\n🔗 ${link}`;
              if (image) msg += `\n🖼️ Görsel: ${image}`;
              try {
                sendTelegramMessage(msg, image);
              } catch (notifyError) {
                console.error(`❌ Bildirim gönderilemedi: ${notifyError.message}`);
              }
            }
          }

          // Fiyat geçmişine kaydet
          await client.query(
            'INSERT INTO price_history (product_id, price, created_at) VALUES ($1, $2, NOW())',
            [currentProduct.id, numericPrice]
          );
        } else {
          const result = await client.query(
            `INSERT INTO products 
             (slug, title, link, price, created_at, status, lowest_price, product_code) 
             VALUES ($1, $2, $3, $4, NOW(), 'active', $4, $5) 
             RETURNING id`,
            [slug, title, link, numericPrice, productCode]
          );
          const productId = result.rows[0].id;
          inserted++;
          console.log(`✅ [BAŞARILI-EKLEME] ${title} (${link})`);
          // Sadece gerçekten yeni ürünse bildirim gönder
          const msg = formatMessage({
            type: 'new',
            title,
            price,
            link,
            productCode,
            imageUrl: image
          });
          try {
            sendTelegramMessage(msg, image);
          } catch (notifyError) {
            console.error(`❌ Bildirim gönderilemedi: ${notifyError.message}`);
          }

          // Fiyat geçmişine kaydet
          await client.query(
            'INSERT INTO price_history (product_id, price, created_at) VALUES ($1, $2, NOW())',
            [productId, numericPrice]
          );
        }
      } catch (err) {
        console.error(`❌ [HATA] ${title} (${link}): ${err.message}`);
        errors++;
        
        // Eğer transaction hatası varsa, transaction'ı yeniden başlat
        if (err.code === '25P02') { // current transaction is aborted
          console.log(`🔄 Transaction yeniden başlatılıyor...`);
          await client.query('ROLLBACK');
          await client.query('BEGIN');
        }
        
        // Eğer duplicate key hatası varsa, ürünü güncellemeyi dene
        if (err.code === '23505') { // unique_violation
          console.log(`🔄 Duplicate key hatası, ürün güncellenmeye çalışılıyor: ${productCode}`);
          try {
            // Ürünü güncellemeyi dene
            const updateResult = await client.query(
              `UPDATE products 
               SET title = $1, link = $2, price = $3, status = 'active'
               WHERE product_code = $4 AND slug = $5`,
              [title, link, numericPrice, productCode, slug]
            );
            
            if (updateResult.rowCount > 0) {
              console.log(`✅ [GÜNCELLEME] Duplicate key sonrası güncelleme başarılı: ${title}`);
              updated++;
            }
          } catch (updateErr) {
            console.error(`❌ [GÜNCELLEME HATASI] ${title}: ${updateErr.message}`);
          }
        }
      }
    }

    // Bu kategoride olup, bu taramada bulunmayan ürünleri pasif yap
    await client.query(
      'UPDATE products SET status = $1 WHERE slug = $2 AND link <> ALL($3::text[])',
      ['pasif', slug, currentLinks]
    );

    await client.query('COMMIT');
    console.log(`✅ [${slug}] ${inserted} yeni ürün, ${updated} güncellenen ürün, ${skipped} değişmeyen ürün, ${errors} hata işlendi.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ [KRİTİK HATA] ${slug} kategorisi işlenirken: ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

// Tüm slug dosyaları için çalıştır
async function main() {
  const productDir = path.join(__dirname, 'products');
  const files = fs.readdirSync(productDir)
    .filter(f => f.endsWith('.json'))
    // Sadece güncel veri dosyalarını al (_1, _previous içermeyen)
    .filter(f => !f.includes('_1') && !f.includes('_previous'));

  for (const file of files) {
    const slug = path.basename(file, '.json');
    await saveProductsForSlug(slug, file);
    // Dosyayı işledikten sonra sil
    try {
      fs.unlinkSync(path.join(productDir, file));
      console.log(`🗑️ ${file} silindi.`);
    } catch (err) {
      console.error(`❌ ${file} silinemedi:`, err.message);
    }
  }
}

async function saveToDatabase(products, categorySlug) {
    try {
        logger.info(`${categorySlug} kategorisi için ${products.length} ürün kaydediliyor...`);

        // Ürünleri işle ve veritabanına kaydet
        for (const product of products) {
            try {
                // Ürün kodunu çıkar veya oluştur
                const productCode = await productCodeService.getOrCreateProductCode(product.link);

                // Fiyatı düzgün parse et
                let numericPrice;
                if (typeof product.price === 'string') {
                    // String fiyatı numeric'e çevir
                    numericPrice = parseFloat(product.price
                        .replace(/\./g, '')  // Binlik ayırıcıları kaldır
                        .replace(',', '.')   // Virgülü noktaya çevir
                        .replace(/[^\d.]/g, '') // Sadece sayı ve nokta bırak
                    );
                } else {
                    numericPrice = parseFloat(product.price);
                }

                if (isNaN(numericPrice)) {
                    logger.error(`Geçersiz fiyat: ${product.price}`, {
                        product: product.title,
                        link: product.link
                    });
                    continue;
                }

                // Ürün verilerini hazırla
                const productData = {
                    title: product.title,
                    price: numericPrice, // Numeric fiyat kullan
                    link: product.link,
                    image: product.image,
                    product_code: productCode,
                    slug: categorySlug,
                    status: 'active'
                };

                // Veritabanına kaydet
                await databaseService.saveProduct(productData);
                logger.info(`Ürün kaydedildi: ${product.title} (${productCode}) - Fiyat: ${numericPrice}`);

            } catch (error) {
                logger.error(`Ürün kaydedilirken hata: ${error.message}`, {
                    product: product.title,
                    link: product.link,
                    price: product.price
                });
            }
        }

        logger.info(`${categorySlug} kategorisi için ürün kayıtları tamamlandı.`);

    } catch (error) {
        logger.error(`Veritabanı kayıt hatası: ${error.message}`);
        throw error;
    }
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    // Test için örnek veri
    const testProducts = [
        {
            title: 'Test Ürün 1',
            price: 100,
            link: 'https://www.hepsiburada.com/p-test1',
            image: 'https://example.com/image1.jpg'
        }
    ];

    saveToDatabase(testProducts, 'test-category')
        .then(() => logger.info('Test tamamlandı'))
        .catch(error => logger.error(`Test hatası: ${error.message}`));
}

module.exports = {
    saveToDatabase
};

main();
