const notificationService = require('./services/notification');

// Test verisi
const testProducts = [
    {
        title: "Test Ürün 1",
        price: "1000",
        change_percentage: {
            changeType: "no_change",
            change: 0,
            changePercentage: 0,
            oldPrice: 1000,
            newPrice: 1000
        }
    },
    {
        title: "Test Ürün 2", 
        price: "900",
        change_percentage: {
            changeType: "decrease",
            change: 100,
            changePercentage: 10,
            oldPrice: 1000,
            newPrice: 900
        }
    },
    {
        title: "Test Ürün 3",
        price: "1200",
        change_percentage: {
            changeType: "increase",
            change: 200,
            changePercentage: 20,
            oldPrice: 1000,
            newPrice: 1200
        }
    },
    {
        title: "Test Ürün 4",
        price: "500",
        change_percentage: {
            changeType: "new",
            change: 0,
            changePercentage: 0,
            oldPrice: 0,
            newPrice: 500
        }
    }
];

async function testSummary() {
    console.log('Özet bildirimi test ediliyor...');
    
    try {
        await notificationService.sendSummaryNotification(testProducts, 'Test Kategorisi');
        console.log('✅ Özet bildirimi başarıyla gönderildi!');
    } catch (error) {
        console.error('❌ Özet bildirimi gönderilirken hata:', error.message);
    }
}

testSummary(); 