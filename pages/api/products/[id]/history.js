import { query } from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { id } = req.query;

  try {
    const prices = await query(
      `SELECT price, checked_at 
       FROM prices 
       WHERE product_id = ? 
       ORDER BY checked_at DESC 
       LIMIT 100`,
      [id]
    );
    console.log('Fiyat geçmişi API yanıtı:', prices);

    res.status(200).json(prices);
  } catch (error) {
    console.error('Fiyat geçmişi getirilirken hata:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
} 