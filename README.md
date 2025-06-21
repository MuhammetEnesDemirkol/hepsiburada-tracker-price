# Hepsiburada Fiyat Takip Sistemi

Bu proje, Hepsiburada'daki ürünlerin fiyat değişikliklerini takip eden ve Telegram üzerinden bildirim gönderen bir sistemdir.

## 🚀 Hızlı Başlangıç

### Tek Komutla Tüm Sistemi Başlatma

```bash
# Tüm sistemi başlat (Backend + Frontend + Veritabanı)
npm run start:all

# Sadece backend'i başlat (Veritabanı + API)
npm run start:backend-only

# Sadece backend'i başlat
npm run start:backend

# Sadece frontend'i başlat
npm run start:frontend

# Veritabanı tablolarını oluştur
npm run start:db
```

## 📋 Sistem Bileşenleri

### Backend (Node.js)
- **Port:** 5001
- **Dosya:** `api/runner.js`
- **Özellikler:**
  - Web scraping (Puppeteer)
  - PostgreSQL veritabanı
  - Telegram bot entegrasyonu
  - Fiyat karşılaştırma
  - Otomatik bildirimler

### Frontend (React)
- **Port:** 3000
- **Klasör:** `client/`
- **Özellikler:**
  - Ürün listesi
  - Fiyat geçmişi
  - Kategori yönetimi
  - Dashboard

### Veritabanı (PostgreSQL)
- **Tablolar:**
  - `categories` - Kategoriler
  - `products` - Ürünler
  - `price_history` - Fiyat geçmişi
  - `logs` - Sistem logları

## 🔧 Kurulum

1. **Bağımlılıkları yükle:**
```bash
npm install
cd client && npm install
```

2. **Çevre değişkenlerini ayarla:**
`.env` dosyası oluştur ve şunları ekle:
```
DATABASE_URL=postgresql://user:password@host:port/database
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

3. **Veritabanını hazırla:**
```bash
npm run start:db
```

## 📊 Sistem Akışı

1. **Tarama:** Scraper Hepsiburada'dan ürün verilerini çeker
2. **Kayıt:** Ürünler veritabanına kaydedilir
3. **Karşılaştırma:** Fiyat değişiklikleri kontrol edilir
4. **Bildirim:** Değişiklikler Telegram'a gönderilir

## 🎯 Özellikler

- ✅ Ürün kodu (HB) çıkarma
- ✅ Ürün görseli çıkarma
- ✅ Fiyat değişikliği takibi
- ✅ Eşik değeri kontrolü
- ✅ Duplicate bildirim önleme
- ✅ Telegram entegrasyonu
- ✅ Web arayüzü
- ✅ Fiyat geçmişi

## 🧪 Test

```bash
npm run test
```

## 📝 Loglar

Loglar `logs/` klasöründe tutulur:
- `combined.log` - Tüm loglar
- `error.log` - Hata logları
- `notifications.log` - Bildirim logları

## 🔄 Cron Job

Sistem otomatik olarak her saat başı çalışır. Bu süreyi değiştirmek için:
```bash
export SCRAPE_INTERVAL=1800000  # 30 dakika
```

## 📞 Destek

Herhangi bir sorun yaşarsanız, logları kontrol edin ve gerekirse issue açın.
