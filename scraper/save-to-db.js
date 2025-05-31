require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { sendTelegramMessage } = require('../api/notify');

// Slug'a göre dosyayı oku ve veritabanına kaydet
async function saveProductsForSlug(slug, filename) {
  const filePath = path.join(__dirname, 'products', filename);
  if (!fs.existsSync(filePath)) {
    console.log(`⛔ ${filename} bulunamadı, atlanıyor...`);
    return;
  }

  const products = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let inserted = 0, skipped = 0, updated = 0;

  // Kategori bilgisini al
  const categoryResult = await db.query('SELECT title, discount_threshold FROM categories WHERE slug = $1', [slug]);
  const category = categoryResult.rows[0];
  
  if (!category) {
    console.log(`⚠️ ${slug} kategorisi bulunamadı, atlanıyor...`);
    return;
  }
  
  const threshold = category.discount_threshold || 10;

  // Bu taramada bulunan ürün linklerini topla
  const currentLinks = products.map(item => item.link);

  for (const item of products) {
    const { title, price, link } = item;

    // Fiyat stringini sayıya çevir (ör: "2.999,99 TL" → "2999.99")
    const numericPrice = parseFloat(price
      .replace(/\./g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, ''));

    // Ürün veritabanında var mı kontrol et
    const existing = await db.query('SELECT id, price FROM products WHERE link = $1', [link]);

    let productId;
    let oldPrice;

    if (existing.rows.length > 0) {
      productId = existing.rows[0].id;
      oldPrice = parseFloat(existing.rows[0].price);
      if (Math.abs(oldPrice - numericPrice) < 0.01) {
        await db.query('UPDATE products SET status = $1 WHERE id = $2', ['aktif', productId]);
        skipped++;
        continue;
      }
      await db.query(
        'UPDATE products SET price = $1, status = $2 WHERE id = $3',
        [numericPrice, 'aktif', productId]
      );
      updated++;
      // Eşik değer kontrolü
      if (oldPrice > 0) {
        const discount = Math.abs((oldPrice - numericPrice) / oldPrice) * 100;
        if (discount >= threshold) {
          sendTelegramMessage(`💸 Fiyatı güncellenen ürün: ${title}\nEski fiyat: ${oldPrice} TL\nYeni fiyat: ${price}\nİndirim oranı: %${discount.toFixed(1)}\n🔗 ${link}`);
        }
      }
    } else {
      const result = await db.query(
        'INSERT INTO products (slug, title, link, price, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [slug, title, link, numericPrice, 'aktif']
      );
      productId = result.rows[0].id;
      inserted++;
      // Yeni eklenen ürün için anında bildirim gönder
      sendTelegramMessage(`🆕 Yeni ürün: ${title}\nFiyat: ${price}\n�� ${link}`);
    }

    // Fiyat geçmişine kaydet
    await db.query(
      'INSERT INTO prices (product_id, price) VALUES ($1, $2)',
      [productId, numericPrice]
    );
  }

  // Bu kategoride olup, bu taramada bulunmayan ürünleri pasif yap
  await db.query(
    'UPDATE products SET status = $1 WHERE slug = $2 AND link <> ALL($3::text[])',
    ['pasif', slug, currentLinks]
  );

  console.log(`✅ [${slug}] ${inserted} yeni ürün, ${updated} güncellenen ürün, ${skipped} değişmeyen ürün işlendi.`);
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

main();
