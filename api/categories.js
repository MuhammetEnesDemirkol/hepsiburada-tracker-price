const express = require('express');
const router = express.Router();
const db = require('./db');

// ✅ GET /categories → Tüm kategorileri döner
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ GET /categories:', err.message);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

// ✅ POST /categories – Yeni kategori ekle
router.post('/', async (req, res) => {
  const { title, slug, url, discount_threshold } = req.body;

  if (!title || !slug || !url) {
    return res.status(400).json({ error: 'title, slug ve url zorunludur' });
  }

  try {
    const existing = await db.query('SELECT * FROM categories WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu slug zaten var' });
    }

    await db.query(
      'INSERT INTO categories (title, slug, url, discount_threshold) VALUES ($1, $2, $3, $4)',
      [title, slug, url, discount_threshold || 10]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('❌ POST /categories hatası:', err.message);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

// ✅ DELETE /categories/:slug – Slug'a göre kategori sil
router.delete('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const result = await db.query('DELETE FROM categories WHERE slug = $1', [slug]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Kategori bulunamadı' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ DELETE /categories hatası:', err.message);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

module.exports = router;
