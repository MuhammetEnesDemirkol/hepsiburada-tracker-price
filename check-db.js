const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkDatabase() {
    const client = await pool.connect();
    try {
        console.log('Veritabanı durumu kontrol ediliyor...\n');

        // Tabloları listele
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);
        console.log('Mevcut tablolar:');
        tablesResult.rows.forEach(row => console.log(`- ${row.table_name}`));
        console.log('');

        // Ürünleri kontrol et
        const productsResult = await client.query('SELECT id, title, product_code FROM products LIMIT 5');
        console.log('Ürünler:');
        productsResult.rows.forEach(row => console.log(`- ID: ${row.id}, Title: ${row.title}, Code: ${row.product_code}`));
        console.log('');

        // Fiyat geçmişini kontrol et
        const priceHistoryResult = await client.query('SELECT product_id, price, created_at FROM price_history LIMIT 5');
        console.log('Fiyat Geçmişi:');
        priceHistoryResult.rows.forEach(row => console.log(`- Product ID: ${row.product_id}, Price: ${row.price}, Date: ${row.created_at}`));
        console.log('');

        // API sorgusu test et
        const apiTestResult = await client.query(`
            SELECT id, slug, title, link, status,
                   (SELECT price FROM price_history WHERE product_id = products.id ORDER BY created_at DESC LIMIT 1) AS current_price,
                   (SELECT MIN(price::float) FROM price_history WHERE product_id = products.id) AS lowest_price,
                   (SELECT created_at FROM price_history WHERE product_id = products.id ORDER BY created_at DESC LIMIT 1) AS checked_at
            FROM products
            LIMIT 3
        `);
        console.log('API Test Sonucu:');
        apiTestResult.rows.forEach(row => {
            console.log(`- ID: ${row.id}, Title: ${row.title}`);
            console.log(`  Current Price: ${row.current_price}`);
            console.log(`  Lowest Price: ${row.lowest_price}`);
            console.log(`  Checked At: ${row.checked_at}`);
            console.log('');
        });

    } catch (error) {
        console.error('Hata:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkDatabase(); 