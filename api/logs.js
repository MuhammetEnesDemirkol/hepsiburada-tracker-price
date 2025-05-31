const express = require('express');
const router = express.Router();
const db = require('./db');

// GET /logs - Tüm logları getir
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT l.*, c.title as category_title 
       FROM logs l 
       LEFT JOIN categories c ON l.category_slug = c.slug 
       ORDER BY l.created_at DESC 
       LIMIT 1000`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ GET /logs hatası:', err.message);
    res.status(500).json({ error: 'Veritabanı hatası' });
  }
});

module.exports = router; 