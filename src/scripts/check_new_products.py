import asyncio
import json
import os
from datetime import datetime
from typing import Dict, List, Optional

import aiohttp
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

async def fetch_page(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    try:
        async with session.get(url) as response:
            if response.status == 200:
                return await response.text()
            print(f"Error fetching {url}: {response.status}")
            return None
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def parse_products(html: str) -> List[Dict]:
    soup = BeautifulSoup(html, "html.parser")
    products = []
    
    for product in soup.select("li.productListContent-item"):
        try:
            title = product.select_one("h3.product-title").text.strip()
            link = product.select_one("a.product-link")["href"]
            price_text = product.select_one("div.price-value").text.strip()
            price = float(price_text.replace("TL", "").replace(".", "").replace(",", ".").strip())
            slug = link.split("/")[-1]
            
            products.append({
                "title": title,
                "link": link,
                "price": price,
                "slug": slug
            })
        except Exception as e:
            print(f"Error parsing product: {e}")
            continue
    
    return products

async def check_new_products(category_slug: str):
    url = f"https://www.hepsiburada.com/{category_slug}"
    
    async with aiohttp.ClientSession() as session:
        html = await fetch_page(session, url)
        if not html:
            return
        
        products = parse_products(html)
        
        # Database session
        db = SessionLocal()
        try:
            for product in products:
                # Check if product exists
                existing_product = db.execute(
                    text("SELECT id, price FROM products WHERE slug = :slug"),
                    {"slug": product["slug"]}
                ).fetchone()
                
                if existing_product:
                    # Update price if changed
                    if existing_product.price != product["price"]:
                        db.execute(
                            text("""
                                UPDATE products 
                                SET price = :price, 
                                    lowest_price = CASE 
                                        WHEN :price < lowest_price THEN :price 
                                        ELSE lowest_price 
                                    END 
                                WHERE id = :id
                            """),
                            {
                                "price": product["price"],
                                "id": existing_product.id
                            }
                        )
                        
                        # Add to price history
                        db.execute(
                            text("""
                                INSERT INTO price_history (product_id, price, created_at)
                                VALUES (:product_id, :price, :created_at)
                            """),
                            {
                                "product_id": existing_product.id,
                                "price": product["price"],
                                "created_at": datetime.now()
                            }
                        )
                else:
                    # Insert new product
                    result = db.execute(
                        text("""
                            INSERT INTO products (slug, title, link, price, created_at, status, lowest_price)
                            VALUES (:slug, :title, :link, :price, :created_at, 'active', :price)
                            RETURNING id
                        """),
                        {
                            "slug": product["slug"],
                            "title": product["title"],
                            "link": product["link"],
                            "price": product["price"],
                            "created_at": datetime.now()
                        }
                    )
                    product_id = result.fetchone()[0]
                    
                    # Add to price history
                    db.execute(
                        text("""
                            INSERT INTO price_history (product_id, price, created_at)
                            VALUES (:product_id, :price, :created_at)
                        """),
                        {
                            "product_id": product_id,
                            "price": product["price"],
                            "created_at": datetime.now()
                        }
                    )
            
            db.commit()
        except Exception as e:
            db.rollback()
            print(f"Database error: {e}")
        finally:
            db.close()

async def main():
    # Get categories from database
    db = SessionLocal()
    try:
        categories = db.execute(
            text("SELECT slug FROM categories WHERE status = 'active'")
        ).fetchall()
    finally:
        db.close()
    
    tasks = [check_new_products(category.slug) for category in categories]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main()) 