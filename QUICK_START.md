# 🚀 Hepsiburada Fiyat Takip Sistemi - Hızlı Başlangıç

## 📋 Gereksinimler

- Node.js (v16 veya üzeri)
- PostgreSQL veritabanı
- Telegram Bot Token ve Chat ID

## ⚡ Hızlı Başlangıç

### 1. İlk Kurulum
```bash
# Tüm bağımlılıkları yükle ve sistemi hazırla
npm run setup
```

### 2. Sistem Durumunu Kontrol Et
```bash
# Sistem durumunu kontrol et
npm run status
```

### 3. Test Bildirimi Gönder
```bash
# Telegram bildirim sistemini test et
npm run test-notify
```

## 🕷️ Scraper Komutları

### Çoklu Kategori Scraper (Varsayılan)
```bash
npm run scrape
# veya
node main.js scrape
```

### Alternatif Çoklu Kategori Scraper
```bash
npm run scrape:multi1
# veya
node main.js scrape:multi1
```

### Tek Kategori Scraper
```bash
npm run scrape:single
# veya
node main.js scrape:single
```

## 🌐 Sunucu Komutları

### API Sunucusu
```bash
npm run api
# veya
node main.js api
```

### Frontend
```bash
npm run frontend
# veya
node main.js frontend
```

### Geliştirme Modu (API + Frontend)
```bash
npm run dev
# veya
node main.js dev
```

## 📂 Kategori Yönetimi

### Kategorileri Listele
```bash
npm run categories
# veya
node main.js list-categories
```

### Kategori Ekle
```bash
# Format: npm run add-category "Başlık" "slug" "URL" "eşik_değeri"
npm run add-category "Laptop" "laptop-c-98" "https://hepsiburada.com/laptop-c-98" 15
# veya
node main.js add-category "Laptop" "laptop-c-98" "https://hepsiburada.com/laptop-c-98" 15
```

### Kategori Sil
```bash
npm run delete-category "kategori-slug"
# veya
node main.js delete-category "kategori-slug"
```

### Varsayılan Kategorileri Ekle
```bash
npm run add-default-categories
# veya
node main.js add-default-categories
```

**Varsayılan Kategoriler:**
- 🤖 Robot Süpürge
- 🚗 Oto Koltukları
- 🚲 Akülü Pedallı Araçlar
- 🚁 Drone Multikopter
- 📱 iPhone iOS Telefonlar

## 📊 Yardımcı Komutlar

### Log Dosyalarını Görüntüle
```bash
npm run logs
# veya
node main.js logs
```

### Yardım Menüsü
```bash
npm run help
# veya
node main.js help
```

## 🔧 Manuel Komutlar

### Doğrudan Node.js ile
```bash
# Ana menüyü göster
node main.js

# Belirli bir komut çalıştır
node main.js <komut>

# Örnekler:
node main.js setup
node main.js scrape
node main.js dev
node main.js add-category "Laptop" "laptop-c-98" "https://hepsiburada.com/laptop-c-98" 15
```

## 📁 Proje Yapısı

```
hepsiburada-fiyat-takip/
├── main.js                 # 🎯 Ana kontrol sistemi
├── scraper/                # 🕷️ Scraper dosyaları
│   ├── multi-scraper.js    # Çoklu kategori scraper
│   ├── multi-scraper1.js   # Alternatif scraper
│   └── single-category.js  # Tek kategori scraper
├── services/               # 🔧 Servis dosyaları
│   ├── notification.js     # Merkezi bildirim sistemi
│   ├── database.js         # Veritabanı servisi
│   └── logger.js           # Log servisi
├── api/                    # 🌐 API dosyaları
│   ├── server.js           # API sunucusu
│   ├── products.js         # Ürün API'leri
│   └── logs.js             # Log API'leri
├── client/                 # 🎨 React frontend
│   ├── src/
│   └── package.json
├── database/               # 🗄️ Veritabanı
│   └── schema.sql          # Veritabanı şeması
└── logs/                   # 📝 Log dosyaları
```

## ⚙️ Konfigürasyon

### .env Dosyası
```env
# Veritabanı
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hepsiburada
DB_USER=your_username
DB_PASSWORD=your_password

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## 🚨 Sorun Giderme

### Veritabanı Bağlantı Hatası
```bash
# Veritabanı durumunu kontrol et
npm run status

# Tabloları yeniden oluştur
node create-tables.js
```

### Bildirim Hatası
```bash
# Test bildirimi gönder
npm run test-notify

# .env dosyasını kontrol et
cat .env
```

### Scraper Hatası
```bash
# Log dosyalarını kontrol et
npm run logs

# Farklı scraper dene
npm run scrape:multi1
```

### Kategori Sorunları
```bash
# Kategorileri listele
npm run categories

# Varsayılan kategorileri ekle
npm run add-default-categories

# Yeni kategori ekle
npm run add-category "Kategori Adı" "slug" "URL" 10
```

## 📈 Performans İpuçları

1. **Veritabanı İndeksleri**: Büyük veri setleri için indeksler ekleyin
2. **Rate Limiting**: Scraper'lar arası bekleme sürelerini ayarlayın
3. **Memory Management**: Log dosyalarını düzenli olarak temizleyin
4. **Monitoring**: Sistem durumunu düzenli olarak kontrol edin
5. **Kategori Yönetimi**: Gereksiz kategorileri silin, yeni kategoriler ekleyin

## 🔄 Otomatik Çalıştırma

### Cron Job (Linux/Mac)
```bash
# Her 15 dakikada bir scraper çalıştır
*/15 * * * * cd /path/to/project && npm run scrape

# Her gün saat 9'da test bildirimi gönder
0 9 * * * cd /path/to/project && npm run test-notify
```

### Windows Task Scheduler
- Scraper için: `npm run scrape`
- Test için: `npm run test-notify`

## 📞 Destek

Sorun yaşarsanız:
1. `npm run status` ile sistem durumunu kontrol edin
2. `npm run logs` ile log dosyalarını inceleyin
3. `npm run categories` ile kategorileri kontrol edin
4. GitHub Issues'da sorun bildirin

---

**🎯 Tek Komutla Her Şey: `npm run dev`** 