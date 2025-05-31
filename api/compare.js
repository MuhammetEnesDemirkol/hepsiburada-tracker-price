const fs = require('fs');
const path = require('path');

// Doğru dizin yolları
const productsDir = path.join(__dirname, '../scraper/products');
const outputPath = path.join(__dirname, '../scraper/changes.json');

// JSON dosyasını oku
function readJSON(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf8');
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
}

// Tüm kategorilerin ürünlerini birleştir
function getAllProducts() {
    const products = [];
    const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.json') && !f.endsWith('_previous.json'));
    
    for (const file of files) {
        const filePath = path.join(productsDir, file);
        const categoryProducts = readJSON(filePath);
        products.push(...categoryProducts);
    }
    
    return products;
}

// Ürünleri karşılaştır
function compareProducts(current, previous) {
    const changes = [];
    let newCount = 0;
    let priceChangeCount = 0;

    console.log(`\nℹ️ Karşılaştırma başlıyor:`);
    console.log(`- Mevcut ürün sayısı: ${current.length}`);
    console.log(`- Önceki ürün sayısı: ${previous.length}`);

    // Önceki ürünleri map'e çevir
    const previousMap = new Map(previous.map(p => [p.link, p]));

    current.forEach(curr => {
        if (!curr.link) return; // Geçersiz ürün

        const old = previousMap.get(curr.link);

        if (!old) {
            changes.push({ 
                type: 'new', 
                title: curr.title,
                price: curr.price,
                link: curr.link,
                timestamp: new Date().toISOString()
            });
            newCount++;
        } else if (old.price !== curr.price) {
            changes.push({
                type: 'price-change',
                title: curr.title,
                oldPrice: old.price,
                newPrice: curr.price,
                link: curr.link,
                timestamp: new Date().toISOString()
            });
            priceChangeCount++;
        }
    });

    console.log(`\nℹ️ Karşılaştırma sonuçları:`);
    console.log(`- Yeni ürün sayısı: ${newCount}`);
    console.log(`- Fiyat değişikliği sayısı: ${priceChangeCount}`);
    console.log(`- Toplam değişiklik: ${changes.length}`);

    return changes;
}

// Ana işlem
console.log('\n📊 Tüm kategorilerin ürünleri toplanıyor...');
const currentData = getAllProducts();
console.log(`ℹ️ Toplam ${currentData.length} ürün bulundu`);

// Önceki verileri oku
const previousPath = path.join(__dirname, '../scraper/previous.json');
if (!fs.existsSync(previousPath)) {
    console.log('\n📁 İlk karşılaştırma: previous.json oluşturuluyor...');
    fs.writeFileSync(previousPath, JSON.stringify(currentData, null, 2), 'utf8');
    console.log('✅ Yedek alındı, karşılaştırma bu sefer yapılmadı.');
    process.exit(0);
}

const previousData = readJSON(previousPath);
console.log(`ℹ️ Önceki taramada ${previousData.length} ürün vardı`);

const changes = compareProducts(currentData, previousData);

// Değişiklikleri kaydet
if (changes.length > 0) {
    console.log('\n🟡 Değişiklikler bulundu:');
    changes.forEach(c => {
        if (c.type === 'new') {
            console.log(`🆕 Yeni ürün: ${c.title} (${c.price})`);
        } else if (c.type === 'price-change') {
            console.log(`💸 ${c.title} → ${c.oldPrice} ➡ ${c.newPrice}`);
        }
    });

    // Mevcut changes.json dosyasını oku
    let existingChanges = [];
    if (fs.existsSync(outputPath)) {
        try {
            existingChanges = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            console.log(`\nℹ️ Mevcut changes.json'da ${existingChanges.length} değişiklik var.`);
        } catch (e) {
            console.log('ℹ️ Mevcut changes.json dosyası okunamadı, yeni dosya oluşturuluyor.');
        }
    }

    // Yeni değişiklikleri ekle
    const allChanges = [...existingChanges, ...changes];
    fs.writeFileSync(outputPath, JSON.stringify(allChanges, null, 2), 'utf8');
    console.log(`\n✅ ${changes.length} yeni değişiklik changes.json'a eklendi.`);
    console.log(`✅ Toplam ${allChanges.length} değişiklik changes.json'da.`);
} else {
    console.log('\n✅ Hiçbir değişiklik yok.');
}

// Yedekle
fs.writeFileSync(previousPath, JSON.stringify(currentData, null, 2), 'utf8');
console.log('\n📦 previous.json güncellendi.');
