const { Pool } = require('pg');
const logger = require('./logger');
const productCodeService = require('./product-code');
require('dotenv').config();

// Bağlantı bilgilerini parse et
const parseConnectionString = (url) => {
    if (!url) {
        throw new Error('DATABASE_URL is not defined');
    }

    try {
        const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/;
        const match = url.match(regex);
        if (!match) throw new Error('Invalid connection string format');

        return {
            user: match[1],
            password: match[2],
            host: match[3],
            port: parseInt(match[4]),
            database: match[5]
        };
    } catch (error) {
        logger.error(`Bağlantı URL'si parse edilemedi: ${error.message}`);
        throw error;
    }
};

// Bağlantı havuzunu oluştur
const connectionConfig = parseConnectionString(process.env.DATABASE_URL);
const pool = new Pool({
    ...connectionConfig,
    ssl: false
});

class DatabaseService {
    async checkConnection() {
        const client = await pool.connect();
        try {
            await client.query('SELECT 1');
            logger.info('Veritabanı bağlantısı başarılı');
            return true;
        } catch (error) {
            logger.error(`Veritabanı bağlantı hatası: ${error.message}`);
            return false;
        } finally {
            client.release();
        }
    }

    async query(text, params) {
        const client = await pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } catch (error) {
            logger.error(`Veritabanı sorgu hatası: ${error.message}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async transaction(callback) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Transaction hatası: ${error.message}`);
            throw error;
        } finally {
            client.release();
        }
    }

    async getProductByCode(productCode) {
        const result = await pool.query(
            'SELECT * FROM products WHERE product_code = $1',
            [productCode]
        );
        return result.rows[0];
    }

    async getPreviousPrice(productCode) {
        // Önce product_code ile ürün ID'sini bul
        const productResult = await pool.query(
            'SELECT id FROM products WHERE product_code = $1',
            [productCode]
        );
        
        if (productResult.rows.length === 0) {
            return null;
        }
        
        const productId = productResult.rows[0].id;
        
        const result = await pool.query(
            `SELECT price FROM price_history 
             WHERE product_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [productId]
        );
        return result.rows[0]?.price;
    }

    async saveCategory(category) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const result = await client.query(
                `INSERT INTO categories (title, slug, discount_threshold)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (slug) DO UPDATE
                 SET title = $1, discount_threshold = $3
                 RETURNING *`,
                [category.title, category.slug, category.discount_threshold]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async saveProduct(product) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const result = await client.query(
                `INSERT INTO products (title, price, link, image, product_code, slug)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (product_code) DO UPDATE
                 SET title = $1, price = $2, link = $3, image = $4
                 RETURNING *`,
                [product.title, product.price, product.link, product.image, product.product_code, product.slug]
            );

            // Fiyat geçmişini kaydet
            await client.query(
                `INSERT INTO price_history (product_id, price)
                 VALUES ($1, $2)`,
                [result.rows[0].id, product.price]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getActiveProducts() {
        const result = await this.query(`
            SELECT p.*, c.title as category_title, c.discount_threshold
            FROM products p
            JOIN categories c ON p.slug = c.slug
            ORDER BY p.created_at DESC
        `);
        return result.rows;
    }

    async getProductHistory(productCode) {
        // Önce product_code ile ürün ID'sini bul
        const productResult = await this.query(
            'SELECT id FROM products WHERE product_code = $1',
            [productCode]
        );
        
        if (productResult.rows.length === 0) {
            return [];
        }
        
        const productId = productResult.rows[0].id;
        
        const result = await this.query(`
            SELECT price, created_at
            FROM price_history
            WHERE product_id = $1
            ORDER BY created_at DESC
        `, [productId]);
        return result.rows;
    }

    async getRecentPriceChanges(hours = 1) {
        const result = await pool.query(
            `SELECT p.*, c.title as category_title, c.discount_threshold
             FROM products p
             JOIN categories c ON p.slug = c.slug
             WHERE p.created_at > NOW() - INTERVAL '${hours} hour'
             ORDER BY p.created_at DESC`
        );
        return result.rows;
    }

    async getAllCategories() {
        const result = await pool.query(
            'SELECT * FROM categories ORDER BY id'
        );
        return result.rows;
    }

    async deleteCategory(slug) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Önce bu kategoriye ait ürünlerin ID'lerini al
            const products = await client.query(
                'SELECT id FROM products WHERE slug = $1',
                [slug]
            );
            
            // Bu ürünlerin fiyat geçmişini sil
            for (const product of products.rows) {
                await client.query(
                    'DELETE FROM price_history WHERE product_id = $1',
                    [product.id]
                );
            }
            
            // İlişkili ürünleri sil
            await client.query(
                'DELETE FROM products WHERE slug = $1',
                [slug]
            );
            
            // Kategoriyi sil
            await client.query(
                'DELETE FROM categories WHERE slug = $1',
                [slug]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

// Singleton instance
const databaseService = new DatabaseService();
module.exports = databaseService; 