-- ============================================================
-- Fix: barcode único por store, no global
-- Antes: barcode text unique  →  Un mismo barcode no podía existir en dos negocios
-- Después: unique(store_id, barcode)  →  Mismo barcode permitido en Fiambrería y Kiosco
-- ============================================================

-- 1. Eliminar la constraint UNIQUE global de barcode
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_barcode_key;

-- 2. Eliminar el índice viejo si existe por separado
DROP INDEX IF EXISTS idx_products_barcode;

-- 3. Agregar constraint compuesta: barcode único DENTRO de cada store
--    (store_id puede ser NULL para productos sin asignar — los ignoramos del unique)
ALTER TABLE products
  ADD CONSTRAINT products_barcode_store_unique UNIQUE (store_id, barcode);

-- 4. Re-crear índice de búsqueda por barcode (sigue siendo útil para buscar rápido)
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_store_barcode ON products(store_id, barcode);

-- 5. Asignar todos los productos sin store a la Fiambrería
--    (todo lo cargado hasta ahora es de la fiambrería)
UPDATE products
SET store_id = (SELECT id FROM stores WHERE type = 'fiambreria' LIMIT 1)
WHERE store_id IS NULL;
