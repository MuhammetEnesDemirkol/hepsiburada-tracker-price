const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function testConnection() {
    try {
        console.log('Veritabanı bağlantısı test ediliyor...');
        console.log('Bağlantı URL:', process.env.DATABASE_URL);
        
        const client = await pool.connect();
        console.log('Veritabanı bağlantısı başarılı!');
        
        // Tabloları kontrol et
        const tables = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        
        console.log('\nMevcut tablolar:');
        tables.rows.forEach(table => {
            console.log(`- ${table.table_name}`);
        });

        client.release();
        await pool.end();
        
    } catch (error) {
        console.error('Veritabanı bağlantı hatası:', error.message);
        process.exit(1);
    }
}

async function addTestData() {
    const client = await pool.connect();
    try {
        console.log('Test verisi ekleniyor...');

        // Test kategorisi ekle
        await client.query(`
            INSERT INTO categories (title, slug, url, discount_threshold)
            VALUES ('Test Kategori', 'test-kategori', 'https://www.hepsiburada.com/test-kategori', 10)
            ON CONFLICT (slug) DO NOTHING;
        `);
        console.log('✅ Test kategorisi eklendi');

        // Test ürünü ekle
        const productResult = await client.query(`
            INSERT INTO products (title, price, link, image, product_code, slug, status, lowest_price)
            VALUES ('Test Ürün', 1000, 'https://www.hepsiburada.com/test-urun', 'test-image.jpg', 'TEST001', 'test-kategori', 'aktif', 1000)
            ON CONFLICT (product_code) DO UPDATE
            SET title = EXCLUDED.title, price = EXCLUDED.price, link = EXCLUDED.link, image = EXCLUDED.image, status = EXCLUDED.status, lowest_price = EXCLUDED.lowest_price
            RETURNING id;
        `);
        console.log('✅ Test ürünü eklendi');

        const productId = productResult.rows[0].id;

        // Fiyat geçmişi ekle
        await client.query(`
            INSERT INTO price_history (product_id, price, created_at)
            VALUES 
                ($1, 1200, NOW() - INTERVAL '3 days'),
                ($1, 1100, NOW() - INTERVAL '2 days'),
                ($1, 1000, NOW() - INTERVAL '1 day'),
                ($1, 950, NOW())
            ON CONFLICT DO NOTHING;
        `, [productId]);
        console.log('✅ Fiyat geçmişi eklendi');

        // İkinci test ürünü
        const productResult2 = await client.query(`
            INSERT INTO products (title, price, link, image, product_code, slug, status, lowest_price)
            VALUES ('Test Ürün 2', 2500, 'https://www.hepsiburada.com/test-urun-2', 'test-image-2.jpg', 'TEST002', 'test-kategori', 'aktif', 2500)
            ON CONFLICT (product_code) DO UPDATE
            SET title = EXCLUDED.title, price = EXCLUDED.price, link = EXCLUDED.link, image = EXCLUDED.image, status = EXCLUDED.status, lowest_price = EXCLUDED.lowest_price
            RETURNING id;
        `);
        console.log('✅ Test ürünü 2 eklendi');

        const productId2 = productResult2.rows[0].id;

        // İkinci ürünün fiyat geçmişi
        await client.query(`
            INSERT INTO price_history (product_id, price, created_at)
            VALUES 
                ($1, 3000, NOW() - INTERVAL '5 days'),
                ($1, 2800, NOW() - INTERVAL '3 days'),
                ($1, 2500, NOW() - INTERVAL '1 day'),
                ($1, 2400, NOW())
            ON CONFLICT DO NOTHING;
        `, [productId2]);
        console.log('✅ İkinci ürünün fiyat geçmişi eklendi');

        console.log('\n✅ Tüm test verisi başarıyla eklendi!');

    } catch (error) {
        console.error('Hata:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

testConnection();
addTestData(); 