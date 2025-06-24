#!/usr/bin/env node

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Renkli terminal çıktıları için
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader(title) {
    console.log('\n' + '='.repeat(60));
    log(`🚀 ${title}`, 'cyan');
    console.log('='.repeat(60));
}

function logSection(title) {
    console.log('\n' + '-'.repeat(40));
    log(`📋 ${title}`, 'yellow');
    console.log('-'.repeat(40));
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logInfo(message) {
    log(`ℹ️ ${message}`, 'blue');
}

function logWarning(message) {
    log(`⚠️ ${message}`, 'yellow');
}

// Komut çalıştırma fonksiyonu
function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Komut başarısız oldu: ${command} ${args.join(' ')}`));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

// Veritabanı bağlantısını kontrol et
async function checkDatabase() {
    logSection('Veritabanı Bağlantı Kontrolü');
    
    try {
        const db = require('./scraper/db');
        await db.query('SELECT NOW()');
        logSuccess('Veritabanı bağlantısı başarılı');
        return true;
    } catch (error) {
        logError(`Veritabanı bağlantı hatası: ${error.message}`);
        logInfo('Veritabanının çalıştığından emin olun');
        return false;
    }
}

// Tabloları oluştur
async function createTables() {
    logSection('Veritabanı Tabloları Oluşturuluyor');
    
    try {
        await runCommand('node', ['create-tables.js']);
        logSuccess('Tablolar başarıyla oluşturuldu');
        return true;
    } catch (error) {
        logError(`Tablo oluşturma hatası: ${error.message}`);
        return false;
    }
}

// Test bildirimi gönder
async function sendTestNotification() {
    logSection('Test Bildirimi Gönderiliyor');
    
    try {
        const notificationService = require('./services/notification');
        await notificationService.sendTestNotification();
        logSuccess('Test bildirimi başarıyla gönderildi');
        return true;
    } catch (error) {
        logError(`Test bildirimi hatası: ${error.message}`);
        return false;
    }
}

// Scraper çalıştır
async function runScraper(scraperType = 'multi') {
    logSection(`${scraperType === 'multi' ? 'Çoklu Kategori' : 'Tek Kategori'} Scraper Başlatılıyor`);
    
    try {
        let scraperFile;
        switch (scraperType) {
            case 'multi':
                scraperFile = 'scraper/multi-scraper.js';
                break;
            case 'multi1':
                scraperFile = 'scraper/multi-scraper1.js';
                break;
            case 'single':
                scraperFile = 'scraper/single-category.js';
                break;
            default:
                throw new Error('Geçersiz scraper tipi');
        }

        if (!fs.existsSync(scraperFile)) {
            throw new Error(`${scraperFile} dosyası bulunamadı`);
        }

        logInfo(`Scraper dosyası: ${scraperFile}`);
        await runCommand('node', [scraperFile]);
        logSuccess('Scraper başarıyla tamamlandı');
        return true;
    } catch (error) {
        logError(`Scraper hatası: ${error.message}`);
        return false;
    }
}

// API sunucusunu başlat
async function startAPIServer() {
    logSection('API Sunucusu Başlatılıyor');
    
    try {
        const apiServer = spawn('node', ['api/server.js'], {
            stdio: 'inherit',
            shell: true
        });

        logSuccess('API sunucusu başlatıldı (http://localhost:3001)');
        logInfo('Sunucuyu durdurmak için Ctrl+C tuşlayın');
        
        return apiServer;
    } catch (error) {
        logError(`API sunucu hatası: ${error.message}`);
        return null;
    }
}

// Frontend'i başlat
async function startFrontend() {
    logSection('Frontend Başlatılıyor');
    
    try {
        const frontend = spawn('npm', ['start'], {
            cwd: './client',
            stdio: 'inherit',
            shell: true
        });

        logSuccess('Frontend başlatıldı (http://localhost:3000)');
        logInfo('Frontend\'i durdurmak için Ctrl+C tuşlayın');
        
        return frontend;
    } catch (error) {
        logError(`Frontend hatası: ${error.message}`);
        return null;
    }
}

// Bağımlılıkları yükle
async function installDependencies() {
    logSection('Bağımlılıklar Yükleniyor');
    
    try {
        logInfo('Ana bağımlılıklar yükleniyor...');
        await runCommand('npm', ['install']);
        
        logInfo('Client bağımlılıkları yükleniyor...');
        await runCommand('npm', ['install'], { cwd: './client' });
        
        logSuccess('Tüm bağımlılıklar başarıyla yüklendi');
        return true;
    } catch (error) {
        logError(`Bağımlılık yükleme hatası: ${error.message}`);
        return false;
    }
}

// Sistem durumunu kontrol et
async function checkSystemStatus() {
    logSection('Sistem Durumu Kontrolü');
    
    const checks = [
        { name: 'Node.js', check: () => process.version },
        { name: 'NPM', check: async () => {
            const { execSync } = require('child_process');
            return execSync('npm --version').toString().trim();
        }},
        { name: '.env dosyası', check: () => {
            return fs.existsSync('.env') ? 'Mevcut' : 'Eksik';
        }},
        { name: 'Veritabanı', check: async () => {
            try {
                const db = require('./scraper/db');
                await db.query('SELECT NOW()');
                return 'Bağlantı var';
            } catch {
                return 'Bağlantı yok';
            }
        }}
    ];

    for (const check of checks) {
        try {
            const result = await check.check();
            logSuccess(`${check.name}: ${result}`);
        } catch (error) {
            logError(`${check.name}: Hata - ${error.message}`);
        }
    }
}

// Ana menü
function showMainMenu() {
    logHeader('Hepsiburada Fiyat Takip Sistemi');
    
    console.log(`
${colors.cyan}📋 Mevcut Komutlar:${colors.reset}

${colors.yellow}🔧 Sistem Komutları:${colors.reset}
  1.  setup          - İlk kurulum (bağımlılıklar + tablolar)
  2.  status         - Sistem durumu kontrolü
  3.  test-notify    - Test bildirimi gönder

${colors.yellow}🕷️ Scraper Komutları:${colors.reset}
  4.  scrape         - Çoklu kategori scraper (varsayılan)
  5.  scrape:multi   - Çoklu kategori scraper
  6.  scrape:multi1  - Alternatif çoklu kategori scraper
  7.  scrape:single  - Tek kategori scraper

${colors.yellow}🌐 Sunucu Komutları:${colors.reset}
  8.  api            - API sunucusunu başlat
  9.  frontend       - Frontend'i başlat
  10. dev            - API + Frontend birlikte başlat

${colors.yellow}📂 Kategori Yönetimi:${colors.reset}
  11. list-categories        - Kategorileri listele
  12. add-category           - Kategori ekle
  13. delete-category        - Kategori sil
  14. add-default-categories - Varsayılan kategorileri ekle

${colors.yellow}📊 Yardımcı Komutlar:${colors.reset}
  15. logs           - Log dosyalarını göster
  16. help           - Bu menüyü göster

${colors.cyan}💡 Kullanım:${colors.reset}
  node main.js <komut>
  Örnek: node main.js setup
  Örnek: node main.js scrape
  Örnek: node main.js dev
  Örnek: node main.js add-category "Laptop" "laptop-c-98" "https://hepsiburada.com/laptop-c-98" 15
  Örnek: node main.js delete-category "test-kategori"
`);
}

// Log dosyalarını göster
async function showLogs() {
    logSection('Log Dosyaları');
    
    const logFiles = [
        { name: 'combined.log', path: './logs/combined.log' },
        { name: 'error.log', path: './logs/error.log' }
    ];

    for (const logFile of logFiles) {
        if (fs.existsSync(logFile.path)) {
            logInfo(`${logFile.name}:`);
            const content = fs.readFileSync(logFile.path, 'utf-8');
            const lines = content.split('\n').slice(-10); // Son 10 satır
            console.log(lines.join('\n'));
        } else {
            logWarning(`${logFile.name} bulunamadı`);
        }
    }
}

// Kategorileri listele
async function listCategories() {
    logSection('Mevcut Kategoriler');
    
    try {
        const db = require('./scraper/db');
        const result = await db.query('SELECT * FROM categories ORDER BY id');
        
        if (result.rows.length === 0) {
            logWarning('Henüz kategori bulunmuyor');
            return;
        }

        console.log('\n📋 Kategoriler:');
        console.log('─'.repeat(80));
        console.log(`${'ID'.padEnd(3)} | ${'Başlık'.padEnd(25)} | ${'Slug'.padEnd(30)} | ${'Eşik (%)'.padEnd(8)}`);
        console.log('─'.repeat(80));
        
        for (const category of result.rows) {
            console.log(`${category.id.toString().padEnd(3)} | ${category.title.padEnd(25)} | ${category.slug.padEnd(30)} | ${category.discount_threshold.toString().padEnd(8)}`);
        }
        
        console.log('─'.repeat(80));
        logSuccess(`Toplam ${result.rows.length} kategori bulundu`);
    } catch (error) {
        logError(`Kategori listesi alınamadı: ${error.message}`);
    }
}

// Kategori ekle
async function addCategory(title, slug, url, threshold = 10) {
    logSection('Kategori Ekleme');
    
    try {
        const db = require('./scraper/db');
        await db.query(`
            INSERT INTO categories (title, slug, url, discount_threshold)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (slug) DO UPDATE SET
                title = EXCLUDED.title,
                url = EXCLUDED.url,
                discount_threshold = EXCLUDED.discount_threshold
        `, [title, slug, url, threshold]);
        
        logSuccess(`Kategori eklendi/güncellendi: ${title}`);
        return true;
    } catch (error) {
        logError(`Kategori ekleme hatası: ${error.message}`);
        return false;
    }
}

// Kategori sil
async function deleteCategory(slug) {
    logSection('Kategori Silme');
    
    try {
        const db = require('./scraper/db');
        const result = await db.query('DELETE FROM categories WHERE slug = $1 RETURNING title', [slug]);
        
        if (result.rows.length > 0) {
            logSuccess(`Kategori silindi: ${result.rows[0].title}`);
            return true;
        } else {
            logWarning(`Kategori bulunamadı: ${slug}`);
            return false;
        }
    } catch (error) {
        logError(`Kategori silme hatası: ${error.message}`);
        return false;
    }
}

// Varsayılan kategorileri ekle
async function addDefaultCategories() {
    logSection('Varsayılan Kategoriler Ekleme');
    
    const defaultCategories = [
        ['Robot Süpürge', 'robot-supurge-c-80160033', 'https://www.hepsiburada.com/robot-supurge-c-80160033', 10],
        ['Oto Koltukları', 'oto-koltuklari-c-23021016', 'https://www.hepsiburada.com/oto-koltuklari-c-23021016', 10],
        ['Akülü Pedallı Araçlar', 'akulu-pedalli-araclar-c-306860', 'https://www.hepsiburada.com/akulu-pedalli-araclar-c-306860', 10],
        ['Drone Multikopter', 'drone-multikopter-c-60006033', 'https://www.hepsiburada.com/drone-multikopter-c-60006033', 10],
        ['iPhone iOS Telefonlar', 'iphone-ios-telefonlar-c-60005202', 'https://www.hepsiburada.com/iphone-ios-telefonlar-c-60005202', 10]
    ];

    let successCount = 0;
    for (const [title, slug, url, threshold] of defaultCategories) {
        const success = await addCategory(title, slug, url, threshold);
        if (success) successCount++;
    }
    
    logSuccess(`${successCount}/${defaultCategories.length} kategori başarıyla eklendi`);
    return successCount === defaultCategories.length;
}

// Ana fonksiyon
async function main() {
    const command = process.argv[2];

    if (!command || command === 'help') {
        showMainMenu();
        return;
    }

    try {
        switch (command) {
            case 'setup':
                logHeader('İlk Kurulum Başlatılıyor');
                await installDependencies();
                await createTables();
                await sendTestNotification();
                logSuccess('Kurulum tamamlandı!');
                break;

            case 'status':
                await checkSystemStatus();
                break;

            case 'test-notify':
                await sendTestNotification();
                break;

            case 'scrape':
            case 'scrape:multi':
                await runScraper('multi');
                break;

            case 'scrape:multi1':
                await runScraper('multi1');
                break;

            case 'scrape:single':
                await runScraper('single');
                break;

            case 'api':
                await startAPIServer();
                break;

            case 'frontend':
                await startFrontend();
                break;

            case 'dev':
                logHeader('Geliştirme Modu Başlatılıyor');
                const apiServer = await startAPIServer();
                const frontend = await startFrontend();
                
                // Her iki süreci de dinle
                process.on('SIGINT', () => {
                    logInfo('Sistem kapatılıyor...');
                    if (apiServer) apiServer.kill();
                    if (frontend) frontend.kill();
                    process.exit(0);
                });
                break;

            case 'logs':
                await showLogs();
                break;

            case 'list-categories':
                await listCategories();
                break;

            case 'add-category':
                const title = process.argv[3];
                const slug = process.argv[4];
                const url = process.argv[5];
                const threshold = process.argv[6] ? parseInt(process.argv[6]) : 10;
                await addCategory(title, slug, url, threshold);
                break;

            case 'delete-category':
                const categorySlug = process.argv[3];
                await deleteCategory(categorySlug);
                break;

            case 'add-default-categories':
                await addDefaultCategories();
                break;

            default:
                logError(`Bilinmeyen komut: ${command}`);
                showMainMenu();
                break;
        }
    } catch (error) {
        logError(`Ana hata: ${error.message}`);
        process.exit(1);
    }
}

// Eğer doğrudan çalıştırılırsa
if (require.main === module) {
    main().catch((error) => {
        logError(`Kritik hata: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    main,
    runScraper,
    startAPIServer,
    startFrontend,
    checkDatabase,
    createTables,
    sendTestNotification,
    listCategories,
    addCategory,
    deleteCategory,
    addDefaultCategories
}; 