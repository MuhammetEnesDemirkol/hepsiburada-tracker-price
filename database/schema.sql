-- Kategoriler tablosu
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ürünler tablosu
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    link TEXT NOT NULL UNIQUE,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(10) DEFAULT 'aktif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (slug) REFERENCES categories(slug),
    product_code VARCHAR(32)
);

-- Fiyat geçmişi tablosu
CREATE TABLE IF NOT EXISTS prices (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_product_code ON products(product_code);
