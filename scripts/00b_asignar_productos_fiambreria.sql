-- ============================================================
-- Asignar todos los productos actuales a la Fiambrería
-- Todo lo cargado antes de la separación es de la Fiambrería.
-- Ejecutar DESPUÉS de fix_barcode_unique_per_store.sql
-- ============================================================

-- Verificá primero cuántos productos hay sin store asignado:
-- SELECT COUNT(*) FROM products WHERE store_id IS NULL;

UPDATE products
SET store_id = (SELECT id FROM stores WHERE type = 'fiambreria' LIMIT 1)
WHERE store_id IS NULL;

-- Verificación post-actualización:
SELECT
  s.name AS negocio,
  COUNT(p.id) AS cantidad_productos
FROM products p
JOIN stores s ON s.id = p.store_id
GROUP BY s.name
ORDER BY s.name;
