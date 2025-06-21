const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkCategories() {
    const client = await pool.connect();
    try {
        console.log('\n📊 Veritabanındaki Kategoriler:');
        console.log('='.repeat(50));

        const categories = await client.query('SELECT * FROM categories ORDER BY id');
        
        categories.rows.forEach((cat, index) => {
            console.log(`\n${index + 1}. ${cat.title}`);
            console.log(`   Slug: ${cat.slug}`);
            console.log(`   URL: ${cat.url || 'URL yok!'}`);
            console.log(`   Status: ${cat.status}`);
            console.log(`   Eşik: %${cat.discount_threshold}`);
        });

        console.log(`\n📋 Toplam: ${categories.rows.length} kategori`);

    } catch (error) {
        console.error('❌ Hata:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

checkCategories(); 