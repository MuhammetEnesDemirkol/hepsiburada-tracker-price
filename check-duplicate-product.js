require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkDuplicateProduct() {
    const client = await pool.connect();
    try {
        // HBC00005T87UF kodlu ürünü ara
        const result = await client.query(`
            SELECT id, slug, title, product_code, status, created_at, price
            FROM products 
            WHERE product_code = 'HBC000092UC1K'
            ORDER BY created_at DESC
        `);
        
        console.log(`\n🔍 HBC00005T87UF kodlu ürün bulundu: ${result.rows.length} kayıt`);
        
        if (result.rows.length > 0) {
            result.rows.forEach((row, index) => {
                console.log(`\n📦 Kayıt ${index + 1}:`);
                console.log(`   ID: ${row.id}`);
                console.log(`   Slug: ${row.slug}`);
                console.log(`   Durum: ${row.status}`);
                console.log(`   Fiyat: ${row.price} TL`);
                console.log(`   Oluşturulma: ${row.created_at}`);
                console.log(`   Başlık: ${row.title.substring(0, 100)}...`);
            });
        }
        
        // Aynı başlığa sahip ürünleri ara
        const titleResult = await client.query(`
            SELECT id, slug, title, product_code, status, created_at, price
            FROM products 
            WHERE title LIKE '%Anker Eufy Clean X8 Pro%'
            ORDER BY created_at DESC
        `);
        
        console.log(`\n🔍 "Anker Eufy Clean X8 Pro" başlıklı ürünler: ${titleResult.rows.length} kayıt`);
        
        if (titleResult.rows.length > 0) {
            titleResult.rows.forEach((row, index) => {
                console.log(`\n📦 Kayıt ${index + 1}:`);
                console.log(`   ID: ${row.id}`);
                console.log(`   Slug: ${row.slug}`);
                console.log(`   Product Code: ${row.product_code}`);
                console.log(`   Durum: ${row.status}`);
                console.log(`   Fiyat: ${row.price} TL`);
                console.log(`   Oluşturulma: ${row.created_at}`);
            });
        }
        
        // Son 24 saatte eklenen ürünleri kontrol et
        const recentResult = await client.query(`
            SELECT id, slug, title, product_code, status, created_at, price
            FROM products 
            WHERE created_at > NOW() - INTERVAL '24 hours'
            AND (title LIKE '%Anker%' OR product_code = 'HBC00005T87UF')
            ORDER BY created_at DESC
        `);
        
        console.log(`\n🔍 Son 24 saatte eklenen Anker ürünleri: ${recentResult.rows.length} kayıt`);
        
        if (recentResult.rows.length > 0) {
            recentResult.rows.forEach((row, index) => {
                console.log(`\n📦 Kayıt ${index + 1}:`);
                console.log(`   ID: ${row.id}`);
                console.log(`   Slug: ${row.slug}`);
                console.log(`   Product Code: ${row.product_code}`);
                console.log(`   Durum: ${row.status}`);
                console.log(`   Fiyat: ${row.price} TL`);
                console.log(`   Oluşturulma: ${row.created_at}`);
                console.log(`   Başlık: ${row.title.substring(0, 80)}...`);
            });
        }
        
    } catch (error) {
        console.error('Hata:', error.message);
    } finally {
        client.release();
        await pool.end();
    }
}

checkDuplicateProduct(); 