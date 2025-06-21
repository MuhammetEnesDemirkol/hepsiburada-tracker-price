require('dotenv').config();
const { Pool } = require('pg');

console.log('Bağlantı bilgileri:');
console.log('URL:', process.env.DATABASE_URL);

// Bağlantı bilgilerini parse et
const parseConnectionString = (url) => {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
    const match = url.match(regex);
    if (!match) throw new Error('Invalid connection string format');

    return {
        user: match[1],
        password: match[2],
        host: match[3],
        port: parseInt(match[4]),
        database: match[5]
    };
};

try {
    const config = parseConnectionString(process.env.DATABASE_URL);
    console.log('\nParse edilmiş bağlantı bilgileri:');
    console.log('Kullanıcı:', config.user);
    console.log('Host:', config.host);
    console.log('Port:', config.port);
    console.log('Veritabanı:', config.database);
    console.log('Şifre uzunluğu:', config.password.length);

    const pool = new Pool({
        ...config,
        ssl: false
    });

    async function testConnection() {
        const client = await pool.connect();
        try {
            console.log('\nVeritabanına bağlanılıyor...');
            const result = await client.query('SELECT version()');
            console.log('Bağlantı başarılı!');
            console.log('PostgreSQL versiyonu:', result.rows[0].version);
        } catch (error) {
            console.error('Bağlantı hatası:', error.message);
        } finally {
            client.release();
            await pool.end();
        }
    }

    testConnection();
} catch (error) {
    console.error('Hata:', error.message);
} 