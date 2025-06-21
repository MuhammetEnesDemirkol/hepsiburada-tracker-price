const notificationService = require('./services/notification');
const logger = require('./services/logger');

// Test bildirimleri
const testNotificationData = [
    {
        title: 'Test Ürün 1',
        previous_price: '1000',
        current_price: '900',
        change_percentage: -10,
        link: 'https://www.hepsiburada.com/test-urun-1'
    },
    {
        title: 'Test Ürün 2',
        previous_price: '2000',
        current_price: '1800',
        change_percentage: -10,
        link: 'https://www.hepsiburada.com/test-urun-2'
    },
    {
        title: 'Test Ürün 3',
        previous_price: '1500',
        current_price: '1500',
        change_percentage: 0,
        link: 'https://www.hepsiburada.com/test-urun-3'
    }
];

async function testNotificationSystem() {
    console.log('🔔 Bildirim sistemi test ediliyor...\n');

    for (const notification of testNotificationData) {
        try {
            console.log(`📤 Test bildirimi gönderiliyor: ${notification.title}`);
            await notificationService.sendInstantNotification(notification);
            console.log('✅ Bildirim başarıyla gönderildi\n');
        } catch (error) {
            console.error('❌ Bildirim gönderme hatası:', error.message);
        }
    }
}

// Log özeti oluşturma fonksiyonu
function generateLogSummary(logData) {
    const summary = {
        totalProducts: 0,
        priceChanges: 0,
        newProducts: 0,
        noChange: 0,
        categories: new Set(),
        totalPriceChange: 0,
        averagePriceChange: 0
    };

    // JSON loglarını parse et
    const lines = logData.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
        try {
            // JSON formatındaki satırları parse et
            if (line.includes('"product_code"') && line.includes('"change_percentage"')) {
                const match = line.match(/\{.*\}/);
                if (match) {
                    const product = JSON.parse(match[0]);
                    summary.totalProducts++;
                    
                    if (product.change_percentage) {
                        const changeType = product.change_percentage.changeType;
                        const changeAmount = Math.abs(product.change_percentage.change || 0);
                        
                        switch (changeType) {
                            case 'increase':
                                summary.priceChanges++;
                                summary.totalPriceChange += changeAmount;
                                break;
                            case 'decrease':
                                summary.priceChanges++;
                                summary.totalPriceChange += changeAmount;
                                break;
                            case 'no_change':
                                summary.noChange++;
                                break;
                        }
                    }
                }
            }
        } catch (error) {
            // JSON parse hatası - bu satırı atla
            continue;
        }
    }

    // Ortalama hesapla
    if (summary.priceChanges > 0) {
        summary.averagePriceChange = (summary.totalPriceChange / summary.priceChanges).toFixed(2);
    }

    return summary;
}

// Örnek log verisi ile test
const sampleLogData = `{"product_code":"FALLBACK-MC5GUS72-98H","title":"Htun 1/24 G63 Alaşım Araba Modelleri Diecasts Araçlar Oyuncak 6 Kapı Açılan G Class Simülasyon Kapalı Yol Araç ile Işık Ses Geri Çekin Oyuncak | Diecasts & Amp;oyuncak Araçlar (Yurt Dışından)","previous_price":"1731.2","current_price":"1731.2","change_percentage":{"change":0,"changePercentage":0,"changeType":"no_change","oldPrice":1731.2,"newPrice":1731.2}},{"product_code":"FALLBACK-MC5GUS70-XFL","title":"Htun Döküm Döküm Araçları Mini Araba Modeli Mühendislik Araba Modeli Traktör Mühendisliği Araba Traktör Oyuncaklar Modeli Çocuklar Için Hediye (Yurt Dışından)","previous_price":"1210","current_price":"1210","change_percentage":{"change":0,"changePercentage":0,"changeType":"no_change","oldPrice":1210,"newPrice":1210}},{"product_code":"TEST-001","title":"Test Ürün 1","previous_price":"1000","current_price":"900","change_percentage":{"change":-100,"changePercentage":-10,"changeType":"decrease","oldPrice":1000,"newPrice":900}}`;

function testLogSummary() {
    console.log('📊 Log özeti test ediliyor...\n');
    
    const summary = generateLogSummary(sampleLogData);
    
    console.log('=== LOG ÖZETİ ===');
    console.log(`📦 Toplam Ürün: ${summary.totalProducts}`);
    console.log(`📈 Fiyat Değişimi: ${summary.priceChanges}`);
    console.log(`🆕 Yeni Ürün: ${summary.newProducts}`);
    console.log(`➡️ Değişim Yok: ${summary.noChange}`);
    console.log(`💰 Toplam Fiyat Değişimi: ${summary.totalPriceChange} TL`);
    console.log(`📊 Ortalama Değişim: ${summary.averagePriceChange} TL`);
    console.log('==================\n');
}

// Ana test fonksiyonu
async function runTests() {
    console.log('🚀 Test başlatılıyor...\n');
    
    // Log özeti testi
    testLogSummary();
    
    // Test bildirimi gönder
    try {
        console.log('🧪 Test bildirimi gönderiliyor...');
        await notificationService.sendTestNotification();
        console.log('✅ Test bildirimi başarıyla gönderildi!');
    } catch (error) {
        console.error('❌ Test bildirimi hatası:', error.message);
    }
    
    console.log('\n✅ Testler tamamlandı!');
}

// Testleri çalıştır
runTests().catch(console.error); 