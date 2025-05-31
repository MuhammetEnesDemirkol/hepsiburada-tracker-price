const path = require('path');
const cron = require('node-cron');
const { spawn } = require('child_process');

// Komutları sırayla çalıştır
function runScript(command, label) {
    return new Promise((resolve, reject) => {
        console.log(`▶️ ${label} başlatılıyor...`);
        
        const [cmd, ...args] = command.split(' ');
        const child = spawn(cmd, args, { 
            cwd: path.join(__dirname, '..'),
            stdio: 'inherit' // Bu satır çıktıları gerçek zamanlı gösterir
        });

        child.on('error', (error) => {
            console.error(`❌ ${label} hatası:`, error);
            reject(error);
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ ${label} tamamlandı`);
                resolve();
            } else {
                console.error(`❌ ${label} hata kodu ile sonlandı:`, code);
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

// Ana işlem
async function main() {
    try {
        await runScript('node scraper/multi-scraper.js', 'Scraper');
        await runScript('node scraper/save-to-db.js', 'Veritabanı Kaydı');
        await runScript('node api/compare.js', 'Karşılaştırıcı');
        await runScript('node api/notify.js', 'Telegram Bildirimi');
    } catch (err) {
        console.error('🛑 Cron durdu:', err.message);
    }
}

// ⏱️ Her saat başı tetiklenir
cron.schedule('37 * * * *', () => {
    console.log('⏱️ Otomatik tarama zamanı geldi:', new Date().toLocaleString());
    main();
});

console.log('🚀 Cron servisi aktif. Saat başı çalışacak...');
