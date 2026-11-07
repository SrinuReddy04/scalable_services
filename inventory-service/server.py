import sqlite3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Inventory Service")

def init_db():
    conn = sqlite3.connect("inventory.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS inventory (
            sku TEXT PRIMARY KEY,
            stock INTEGER NOT NULL
        )
    """)
    cursor.execute("INSERT OR IGNORE INTO inventory (sku, stock) VALUES ('SKU-100', 50)")
    cursor.execute("INSERT OR IGNORE INTO inventory (sku, stock) VALUES ('SKU-200', 10)")
    conn.commit()
    conn.close()

init_db()

class ReserveRequest(BaseModel):
    sku: str
    quantity: int

@app.get("/health")
def health():
    return {"status": "UP", "service": "inventory-service"}

@app.get("/api/inventory/{sku}")
def get_inventory(sku: str):
    conn = sqlite3.connect("inventory.db")
    cursor = conn.cursor()
    cursor.execute("SELECT sku, stock FROM inventory WHERE sku = ?", (sku,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"sku": row[0], "stock": row[1]}

@app.post("/api/inventory/reserve")
def reserve_stock(req: ReserveRequest):
    conn = sqlite3.connect("inventory.db")
    cursor = conn.cursor()
    cursor.execute("SELECT stock FROM inventory WHERE sku = ?", (req.sku,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="SKU does not exist")
    
    current_stock = row[0]
    if current_stock < req.quantity:
        conn.close()
        raise HTTPException(status_code=400, detail="Insufficient inventory available")
    
    new_stock = current_stock - req.quantity
    cursor.execute("UPDATE inventory SET stock = ? WHERE sku = ?", (new_stock, req.sku))
    conn.commit()
    conn.close()
    return {"message": "Stock reserved successfully", "sku": req.sku, "remaining_stock": new_stock}