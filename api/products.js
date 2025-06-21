require('dotenv').config();
const express = require('express');
const router = express.Router();
const db = require('./db');

// ✅ GET /products → Tüm ürünleri döner (sayfalı)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const sort = req.query.sort === 'asc' ? 'ASC' : req.query.sort === 'desc' ? 'DESC' : null;
    const category = req.query.category;
    const search = req.query.search;

    // Dinamik WHERE koşulları
    let where = [];
    let params = [];
    let paramIdx = 1;

    if (category && category !== 'all') {
      where.push(`slug = $${paramIdx++}`);
      params.push(category);
    }
    if (search) {
      where.push(`(LOWER(title) LIKE $${paramIdx} OR LOWER(slug) LIKE $${paramIdx})`);
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // Toplam ürün sayısı
    const countResult = await db.query(
      `SELECT COUNT(*) FROM products ${whereClause}`,
      params
    );
    const totalProducts = parseInt(countResult.rows[0].count);

    // Sıralama
    let orderBy = 'ORDER BY id DESC';
    if (sort) {
      orderBy = `ORDER BY (SELECT price FROM price_history WHERE product_id = products.id ORDER BY created_at DESC LIMIT 1)::float ${sort}`;
    }

    // Ürünleri getir
    const result = await db.query(
      `SELECT id, slug, title, link, status,
              (SELECT price FROM price_history WHERE product_id = products.id ORDER BY created_at DESC LIMIT 1) AS current_price,
              (SELECT MIN(price::float) FROM price_history WHERE product_id = products.id) AS lowest_price,
              (SELECT created_at FROM price_history WHERE product_id = products.id ORDER BY created_at DESC LIMIT 1) AS checked_at
       FROM products
       ${whereClause}
       ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      products: result.rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
        limit
      }
    });
  } catch (err) {
    console.error('❌ GET /products:', err.message);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

// ✅ GET /products/:id/history → Ürünün tüm fiyat geçmişi
router.get('/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    // Fiyat geçmişini getir
    const result = await db.query(
      'SELECT price, created_at as checked_at FROM price_history WHERE product_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ GET /products/:id/history:', err.message);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

module.exports = router;
