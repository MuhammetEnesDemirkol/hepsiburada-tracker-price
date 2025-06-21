const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function createTables() {
    const client = await pool.connect();
    try {
        console.log('Tablolar oluşturuluyor...');

        // Önce mevcut tabloları temizle
        await client.query(`
            DROP TABLE IF EXISTS logs CASCADE;
            DROP TABLE IF EXISTS price_history CASCADE;
            DROP TABLE IF EXISTS products CASCADE;
            DROP TABLE IF EXISTS categories CASCADE;
        `);
        console.log('✅ Eski tablolar temizlendi');

        // Kategoriler tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                slug VARCHAR(255) NOT NULL UNIQUE,
                url TEXT,
                discount_threshold NUMERIC DEFAULT 10,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'active'
            );
        `);
        console.log('✅ categories tablosu oluşturuldu');

        // Ürünler tablosu
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                price NUMERIC NOT NULL,
                link TEXT NOT NULL,
                image TEXT,
                product_code VARCHAR(255) UNIQUE,
                slug VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'active',
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

        // Test kategorisi ekle
        await client.query(`
            INSERT INTO categories (title, slug, url, discount_threshold)
            VALUES ('Test Kategori', 'test-kategori', 'https://www.hepsiburada.com/test-kategori', 10)
            ON CONFLICT (slug) DO NOTHING;
        `);
        console.log('✅ Test kategorisi eklendi');

        console.log('\nTüm tablolar başarıyla oluşturuldu!');

    } catch (error) {
        console.error('Hata:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

createTables(); 