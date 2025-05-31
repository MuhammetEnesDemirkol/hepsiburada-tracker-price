require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const db = require('./db');

const productsPerPage = 36;
const outputDir = path.join(__dirname, 'products');

// 🧠 Veritabanından tüm kategorileri al
async function loadCategoriesFromDB() {
  const result = await db.query('SELECT * FROM categories ORDER BY id');
  return result.rows;
}

// 🔍 Belirli bir sayfa URL'sinden ürünleri çek
async function fetchPageProducts(url) {
  try {
    const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Referer': 'https://www.hepsiburada.com/',
          'Connection': 'keep-alive'
        }
      });

    const $ = cheerio.load(html);
    const products = [];

    $('li[class^="productListContent-"]').each((i, el) => {
      const title = $(el).find('h2.title-module_titleRoot__dNDiZ span.title-module_titleText__8FlNQ').text().trim();
      const price = $(el).find('div.price-module_finalPrice__LtjvY').text().trim();
      const link = $(el).find('a.productCardLink-module_productCardLink__GZ3eU').attr('href');

      if (title) {
        products.push({
          title,
          price,
          link: link ? 'https://www.hepsiburada.com' + link : ''
        });
      }
    });

    const totalText = $('div.totalProductCount-h6GXjakFzIWJdEzxeFYA span.totalProductCount-NGwtj4MUJQB5Zmv2FajZ').text().trim();
    const total = parseInt(totalText) || null;

    return { products, totalProducts: total };
  } catch (err) {
    console.error(`❌ Veri çekme hatası: ${url}`, err.message);
    return { products: [], totalProducts: null };
  }
}

// 🔁 Tüm ürünleri sayfa sayfa çek
async function scrapeCategory(category) {
  const baseURL = category.url.split('?')[0];
  const slug = category.slug;
  const firstPage = await fetchPageProducts(baseURL);

  if (!firstPage.totalProducts) {
    console.error(`🚫 ${slug} için ürün bulunamadı.`);
    return;
  }

  let allProducts = firstPage.products;
  const totalPages = Math.ceil(firstPage.totalProducts / productsPerPage);

  console.log(`🔍 [${slug}] ${firstPage.totalProducts} ürün (${totalPages} sayfa)`);

  for (let page = 2; page <= totalPages; page++) {
    const pageURL = `${baseURL}?sayfa=${page}`;
    console.log(`⏳ [${slug}] Sayfa ${page} çekiliyor...`);
    const pageData = await fetchPageProducts(pageURL);
    allProducts = allProducts.concat(pageData.products);
  }

  // Kayıt klasörü yoksa oluştur
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${slug}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2), 'utf8');
  console.log(`✅ [${slug}] Toplam ${allProducts.length} ürün kaydedildi.\n`);
}

// 🧠 Tüm kategoriler için çalıştır
async function scrapeAll() {
  const categories = await loadCategoriesFromDB();
  for (const category of categories) {
    console.log(`▶️ ${category.title} başlatılıyor...`);
    await scrapeCategory(category);
  }
}

scrapeAll();
