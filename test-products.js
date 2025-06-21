const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const testProducts = [
    {
        title: "Apple iPhone 15 256GB Pembe",
        link: "https://www.hepsiburada.com/iphone-15-256gb-pembe-p-HBCV0000823QS7",
        price: 51449,
        slug: "test-kategori"
    },
    {
        title: "Samsung Galaxy S24 Ultra",
        link: "https://www.hepsiburada.com/samsung-galaxy-s24-ultra-HBV00000XYZ123",
        price: 59999,
        slug: "test-kategori"
    },
    {
        title: "Xiaomi 14 Pro",
        link: "https://www.hepsiburada.com/xiaomi-14-pro-256gb-siyah",
        price: 45999,
        slug: "test-kategori"
    }
];

async function runTest() {
    const client = await pool.connect();
    try {
        console.log('🔄 Test ürünleri ekleniyor...');

        await client.query('BEGIN');

        // Test kategorisini ekle
        await client.query(`
            INSERT INTO categories (title, slug, url, discount_threshold)
            VALUES ('Test Kategori', 'test-kategori', 'https://www.hepsiburada.com/test-kategori', 10)
            ON CONFLICT (slug) DO NOTHING
        `);

        // Test ürünlerini ekle
        for (const product of testProducts) {
            const productCode = extractProductCode(product.link);
            console.log(`\n📦 Ürün: ${product.title}`);
            console.log(`🔗 Link: ${product.link}`);
            console.log(`🏷️ Ürün Kodu: ${productCode || 'Bulunamadı (Fallback kullanılacak)'}`);

            if (!productCode) {
                const fallbackCode = generateFallbackCode(product.title, product.link);
                console.log(`⚠️ Fallback Kod: ${fallbackCode}`);
            }

            await client.query(
                `INSERT INTO products 
                 (slug, title, link, price, created_at, status, lowest_price, product_code) 
                 VALUES ($1, $2, $3, $4, NOW(), 'active', $4, $5) 
                 ON CONFLICT (product_code) DO UPDATE 
                 SET price = $4, status = 'active'`,
                [product.slug, product.title, product.link, product.price, productCode || generateFallbackCode(product.title, product.link)]
            );
        }

        await client.query('COMMIT');
        console.log('\n✅ Test ürünleri başarıyla eklendi');

        // Eklenen ürünleri kontrol et
        const products = await client.query(`
            SELECT p.*, c.title as category_title
            FROM products p
            JOIN categories c ON p.slug = c.slug
            WHERE p.slug = 'test-kategori'
            ORDER BY p.created_at DESC
        `);

        console.log('\n📋 Eklenen Ürünler:');
        products.rows.forEach(p => {
            console.log(`\n- ${p.title}`);
            console.log(`  Kategori: ${p.category_title}`);
            console.log(`  Fiyat: ${p.price} TL`);
            console.log(`  Ürün Kodu: ${p.product_code}`);
            console.log(`  Link: ${p.link}`);
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Hata:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

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
    return `FALLBACK_${cleanTitle}_${cleanLink}`;
}

runTest(); 