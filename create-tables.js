const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createTables() {
    const client = await pool.connect();
    try {
        console.log('🗄️ Veritabanı tabloları oluşturuluyor...\n');

        // Önce mevcut tabloları sil (eğer varsa)
        console.log('🧹 Eski tablolar temizleniyor...');
        await client.query('DROP TABLE IF EXISTS price_history CASCADE');
        await client.query('DROP TABLE IF EXISTS products CASCADE');
        await client.query('DROP TABLE IF EXISTS categories CASCADE');
        console.log('✅ Eski tablolar silindi');

        // Kategoriler tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                url TEXT,
                discount_threshold NUMERIC DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ categories tablosu oluşturuldu');

        // Ürünler tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                price NUMERIC NOT NULL,
                link TEXT NOT NULL UNIQUE,
                product_code VARCHAR(255) UNIQUE NOT NULL,
                slug VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                lowest_price NUMERIC,
                FOREIGN KEY (slug) REFERENCES categories(slug)
            );
        `);
        console.log('✅ products tablosu oluşturuldu');

        // Fiyat geçmişi tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS price_history (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL,
                price NUMERIC NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id)
            );
        `);
        console.log('✅ price_history tablosu oluşturuldu');

        // Loglar tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS logs (
                id SERIAL PRIMARY KEY,
                category_slug VARCHAR(255),
                message TEXT,
                type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_slug) REFERENCES categories(slug)
            );
        `);
        console.log('✅ logs tablosu oluşturuldu');

        // Varsayılan kategorileri ekle
        const defaultCategories = [
            ['Robot Süpürge', 'robot-supurge-c-80160033', 'https://www.hepsiburada.com/robot-supurge-c-80160033', 10],
            ['Oto Koltukları', 'oto-koltuklari-c-23021016', 'https://www.hepsiburada.com/oto-koltuklari-c-23021016', 10],
            ['Akülü Pedallı Araçlar', 'akulu-pedalli-araclar-c-306860', 'https://www.hepsiburada.com/akulu-pedalli-araclar-c-306860', 10],
            ['Drone Multikopter', 'drone-multikopter-c-60006033', 'https://www.hepsiburada.com/drone-multikopter-c-60006033', 10],
            ['iPhone iOS Telefonlar', 'iphone-ios-telefonlar-c-60005202', 'https://www.hepsiburada.com/iphone-ios-telefonlar-c-60005202', 10]
        ];

        for (const [title, slug, url, threshold] of defaultCategories) {
            await client.query(`
                INSERT INTO categories (title, slug, url, discount_threshold)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (slug) DO NOTHING;
            `, [title, slug, url, threshold]);
            console.log(`✅ Kategori eklendi: ${title}`);
        }

        console.log('\nTüm tablolar ve kategoriler başarıyla oluşturuldu!');

    } catch (error) {
        console.error('Hata:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

createTables(); 