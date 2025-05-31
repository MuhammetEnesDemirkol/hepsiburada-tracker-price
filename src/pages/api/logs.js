import { pool } from '../../../scraper/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const result = await pool.query(
      `SELECT l.*, c.title as category_title 
       FROM logs l 
       LEFT JOIN categories c ON l.category_slug = c.slug 
       ORDER BY l.created_at DESC 
       LIMIT 1000`
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Log getirme hatası:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
} 