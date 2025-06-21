# Hepsiburada Fiyat Takip Sistemi

Bu proje, Hepsiburada'daki ürünlerin fiyatlarını otomatik olarak takip eden, fiyat değişikliklerini izleyen ve Telegram üzerinden bildirim gönderen bir sistemdir.

## 🚀 Özellikler

- **Otomatik Fiyat Takibi**: Belirlenen kategorilerdeki ürünlerin fiyatları düzenli olarak kontrol edilir
- **Telegram Bildirimleri**: Yeni ürünler ve fiyat düşüşleri için anlık bildirimler
- **Web Arayüzü**: React tabanlı kullanıcı arayüzü ile ürün ve fiyat geçmişi görüntüleme
- **Veritabanı Saklama**: PostgreSQL veritabanında ürün ve fiyat geçmişi saklama
- **Çoklu Kategori Desteği**: Birden fazla kategoriyi aynı anda takip edebilme

## 📋 Gereksinimler

- Node.js (v16 veya üzeri)
- PostgreSQL
- Python 3.8+ (opsiyonel, bot için)
- Telegram Bot Token

## 🛠️ Kurulum

### 1. Repository'yi klonlayın
```bash
git clone https://github.com/kullaniciadi/hepsiburada-fiyat-takip.git
cd hepsiburada-fiyat-takip
```

### 2. Bağımlılıkları yükleyin
```bash
# Ana proje bağımlılıkları
npm install

# API bağımlılıkları
cd api
npm install

# Client bağımlılıkları
cd ../client
npm install

# Scraper bağımlılıkları
cd ../scraper
npm install
```

### 3. Veritabanını kurun
```bash
# PostgreSQL veritabanı oluşturun
createdb hepsiburada_takip

# Tabloları oluşturun
node create-tables.js
```

### 4. Environment değişkenlerini ayarlayın
`.env` dosyası oluşturun:
```env
DATABASE_URL=postgresql://kullanici:sifre@localhost:5432/hepsiburada_takip
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 5. Kategorileri ekleyin
```bash
node check-categories.js
```

## 🚀 Kullanım

### Scraper'ı çalıştırma
```bash
cd api
node runner.js
```

### Web arayüzünü başlatma
```bash
cd client
npm start
```

### API sunucusunu başlatma
```bash
cd api
node server.js
```

## 📁 Proje Yapısı

```
hepsiburada-fiyat-takip/
├── api/                 # API sunucusu
│   ├── server.js       # Ana sunucu
│   ├── runner.js       # Scraper runner
│   └── ...
├── client/             # React web arayüzü
│   ├── src/
│   └── ...
├── scraper/            # Web scraping modülleri
│   ├── multi-scraper.js
│   ├── save-to-db.js
│   └── ...
├── services/           # Servis modülleri
├── database/           # Veritabanı şemaları
└── logs/              # Log dosyaları
```

## 🔧 Konfigürasyon

### Kategori Ekleme
`categories` tablosuna yeni kategoriler ekleyebilirsiniz:
```sql
INSERT INTO categories (slug, title, url, discount_threshold) 
VALUES ('yeni-kategori', 'Yeni Kategori', 'https://www.hepsiburada.com/yeni-kategori', 10);
```

### Bildirim Ayarları
- `discount_threshold`: Fiyat düşüşü bildirimi için minimum yüzde
- `TELEGRAM_BOT_TOKEN`: Telegram bot token'ı
- `TELEGRAM_CHAT_ID`: Bildirim gönderilecek chat ID'si

## 📊 Veritabanı Şeması

### Ana Tablolar
- `categories`: Takip edilen kategoriler
- `products`: Ürün bilgileri
- `price_history`: Fiyat geçmişi
- `logs`: Sistem logları

## 🔍 Sorun Giderme

### Yaygın Sorunlar

1. **Scraper çalışmıyor**
   - Chrome/Chromium yüklü olduğundan emin olun
   - Puppeteer bağımlılıklarını kontrol edin

2. **Bildirimler gelmiyor**
   - Telegram bot token'ını kontrol edin
   - Chat ID'nin doğru olduğundan emin olun

3. **Veritabanı bağlantı hatası**
   - PostgreSQL servisinin çalıştığını kontrol edin
   - DATABASE_URL'in doğru olduğundan emin olun

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## ⚠️ Uyarı

Bu proje eğitim amaçlıdır. Hepsiburada'nın kullanım şartlarına uygun olarak kullanın. Aşırı istek göndermekten kaçının.

## 📞 İletişim

Sorularınız için issue açabilir veya pull request gönderebilirsiniz.
