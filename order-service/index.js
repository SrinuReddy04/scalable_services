const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json());

const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:8000';
const db = new sqlite3.Database('orders.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT,
    sku TEXT,
    quantity INTEGER,
    status TEXT
  )`);
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'order-service' });
});

app.post('/api/orders', async (req, res) => {
  const { customer_id, sku, quantity } = req.body;
  if (!customer_id || !sku || !quantity) {
    return res.status(400).json({ error: "Missing required order fields: customer_id, sku, quantity" });
  }

  try {
    // 1. Inter-service collaboration: Reserve inventory
    const reserveResponse = await axios.post(`${INVENTORY_SERVICE_URL}/api/inventory/reserve`, {
      sku: sku,
      quantity: quantity
    });

    // 2. Persist order on success
    db.run(
      `INSERT INTO orders (customer_id, sku, quantity, status) VALUES (?, ?, ?, ?)`,
      [customer_id, sku, quantity, 'CONFIRMED'],
      function (err) {
        if (err) {
          return res.status(500).json({ error: "Failed to persist order" });
        }
        return res.status(201).json({
          order_id: this.lastID,
          customer_id,
          sku,
          quantity,
          status: 'CONFIRMED',
          inventory_update: reserveResponse.data
        });
      }
    );
  } catch (error) {
    const errorMsg = error.response ? error.response.data : error.message;
    return res.status(400).json({
      error: "Order creation rejected by upstream service",
      details: errorMsg
    });
  }
});

app.get('/api/orders/:id', (req, res) => {
  db.get(`SELECT * FROM orders WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Order not found" });
    res.json(row);
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Order service running on port ${PORT}`));