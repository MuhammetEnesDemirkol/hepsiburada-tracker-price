import { useState } from 'react';
import { formatPrice } from '../utils/format';
import { motion } from 'framer-motion';
import { FiExternalLink, FiInfo } from 'react-icons/fi';
import PriceHistoryPopup from './PriceHistoryPopup';

export default function ProductCard({ product }) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 line-clamp-2">
          {product.title}
        </h3>
        
        <div className="flex items-center justify-between mb-3">
          <span className="text-xl font-bold text-orange-500">
            {formatPrice(product.price)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(true)}
              className="p-2 text-gray-600 hover:text-orange-500 transition-colors"
              title="Fiyat Geçmişi"
            >
              <FiInfo size={20} />
            </button>
            <a
              href={product.link}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-600 hover:text-orange-500 transition-colors"
              title="Ürünü Görüntüle"
            >
              <FiExternalLink size={20} />
            </a>
          </div>
        </div>
      </div>

      {showHistory && (
        <PriceHistoryPopup
          productId={product.id}
          onClose={() => setShowHistory(false)}
        />
      )}
    </motion.div>
  );
} 