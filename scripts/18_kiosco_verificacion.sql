-- ============================================================
-- Verificación de importación
-- Generado: 2026-04-12T16:36:42.570Z
-- ============================================================
SELECT 'productos' as tabla, COUNT(*) FROM products WHERE store_id = 'bfda1f71-a7dd-4acb-aa06-6474b0c3380a';
SELECT 'ventas' as tabla, COUNT(*) FROM sales WHERE store_id = 'bfda1f71-a7dd-4acb-aa06-6474b0c3380a';
