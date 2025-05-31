const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path'); // ✅ sadece bir kez kullanılmalı
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Route'lar
const categoryRoutes = require('./categories');
app.use('/categories', categoryRoutes);

const productsRouter = require('./products');
app.use('/products', productsRouter);

const logsRouter = require('./logs');
app.use('/logs', logsRouter);

// 🚀 Build klasörünü serve et (React frontend için)
app.use(express.static(path.join(__dirname, '../client/build')));

// 🔄 React Router için fallback route (örn. /urunler)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 API sunucusu çalışıyor: http://localhost:${PORT}`);
});
