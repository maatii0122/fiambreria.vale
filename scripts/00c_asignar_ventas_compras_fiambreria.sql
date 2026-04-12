-- ============================================================
-- Asignar ventas y compras sin store a la Fiambrería
-- Todo lo registrado antes de la separación es de la Fiambrería.
-- Ejecutar DESPUÉS de 00_fix_barcode_unique_per_store.sql
-- ============================================================

-- ── Verificación previa ────────────────────────────────────
SELECT 'sales sin store' AS tabla, COUNT(*) FROM sales WHERE store_id IS NULL
UNION ALL
SELECT 'purchases sin store', COUNT(*) FROM purchases WHERE store_id IS NULL
UNION ALL
SELECT 'expenses sin store', COUNT(*) FROM expenses WHERE store_id IS NULL;

-- ── Asignar ventas ─────────────────────────────────────────
UPDATE sales
SET store_id = (SELECT id FROM stores WHERE type = 'fiambreria' LIMIT 1)
WHERE store_id IS NULL;

-- ── Asignar compras ────────────────────────────────────────
UPDATE purchases
SET store_id = (SELECT id FROM stores WHERE type = 'fiambreria' LIMIT 1)
WHERE store_id IS NULL;

-- ── Asignar gastos ─────────────────────────────────────────
UPDATE expenses
SET store_id = (SELECT id FROM stores WHERE type = 'fiambreria' LIMIT 1)
WHERE store_id IS NULL;

-- ── Verificación post-actualización ───────────────────────
SELECT 'ventas' AS tabla, s.name AS negocio, COUNT(*) AS cantidad
FROM sales v JOIN stores s ON s.id = v.store_id
GROUP BY s.name
UNION ALL
SELECT 'compras', s.name, COUNT(*)
FROM purchases p JOIN stores s ON s.id = p.store_id
GROUP BY s.name
UNION ALL
SELECT 'gastos', s.name, COUNT(*)
FROM expenses e JOIN stores s ON s.id = e.store_id
GROUP BY s.name
ORDER BY tabla, negocio;
