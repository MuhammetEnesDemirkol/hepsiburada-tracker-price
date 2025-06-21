const { Pool } = require('pg');
require('dotenv').config();

console.log('Bağlantı URL:', process.env.DATABASE_URL);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
});

async function testConnection() {
    try {
        console.log('Veritabanına bağlanılıyor...');
        const client = await pool.connect();
        console.log('Bağlantı başarılı!');
        
        const result = await client.query('SELECT version()');
        console.log('PostgreSQL versiyonu:', result.rows[0].version);
        
        client.release();
        await pool.end();
    } catch (error) {
        console.error('Bağlantı hatası:', error);
    }
}

testConnection(); 