const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function fixLowestPrices() {
    const client = await pool.connect();
    try {
        console.log('🔄 En düşük fiyatlar güncelleniyor...');

        // Tüm ürünlerin en düşük fiyatlarını güncelle
        await client.query(`
            UPDATE products p
            SET lowest_price = COALESCE(
                (SELECT MIN(price) FROM price_history WHERE product_id = p.id),
                p.price
            )
            WHERE lowest_price IS NULL
        `);

        // Güncellenen ürün sayısını kontrol et
        const result = await client.query(`
            SELECT COUNT(*) 
            FROM products 
            WHERE lowest_price IS NOT NULL
        `);

        console.log(`✅ ${result.rows[0].count} ürünün en düşük fiyatı güncellendi`);

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

fixLowestPrices(); 