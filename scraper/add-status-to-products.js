const db = require('./db');

async function addStatusColumn() {
  try {
    await db.query("ALTER TABLE products ADD COLUMN status VARCHAR(10) DEFAULT 'aktif'");
    console.log('status alanı eklendi!');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('status alanı zaten var.');
    } else {
      console.error('Hata:', e.message);
    }
  } finally {
    process.exit();
  }
}

addStatusColumn(); 