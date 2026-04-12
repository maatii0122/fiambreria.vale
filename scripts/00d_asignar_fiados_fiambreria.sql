-- ============================================================
-- Asignar fiados sin store a la Fiambrería
-- ============================================================

SELECT COUNT(*) AS fiados_sin_store FROM fiados WHERE store_id IS NULL;

UPDATE fiados
SET store_id = (SELECT id FROM stores WHERE type = 'fiambreria' LIMIT 1)
WHERE store_id IS NULL;

SELECT s.name AS negocio, COUNT(*) AS cantidad
FROM fiados f JOIN stores s ON s.id = f.store_id
GROUP BY s.name ORDER BY s.name;
