# Antuan POS — Claude Instructions

## Proyecto
POS móvil offline-first para tienda pequeña en Costa Rica. El **comprador** (no un vendedor) usa la app directamente en un teléfono Android fijo. Se distribuye como APK (no Play Store) via Expo EAS Build (`eas build --platform android --profile preview`).

2 dispositivos fijos con inventario **independiente** por dispositivo. Todo el texto de UI en español.

## Stack
- React Native 0.81 + Expo 54, TypeScript 5.9
- Expo Router (file-based routing), directorio `app/`
- Gluestack UI v1 + NativeWind v4 (Tailwind para RN)
- `expo-sqlite` en modo WAL, transacciones atómicas
- Path alias `@/` → raíz del proyecto
- `npx expo start` para servidor de desarrollo

## Reglas clave
- Moneda: colones costarricenses (₡). Moneda mínima = ₡5 → precios siempre redondeados: `Math.round(cost * (1 + margin/100) / 5) * 5`
- Los PINs de checkout están **ligados a un usuario específico** y son **reutilizables** (no se consumen al usarse). Un mismo PIN puede ser usado por varias personas si el admin lo comparte.
- Búsqueda accent-insensitive: `s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()`
- Siempre usar `isSubmitting` state en botones de confirmación de formularios para prevenir doble registro por doble tap.
- Hacer commits solo después de que el usuario pruebe y apruebe los cambios.

## Estructura de archivos clave
```
app/
  index.tsx          — POS principal: grilla de productos, carrito, modal de checkout (usuario + PIN)
  history.tsx        — Historial de ventas con filtros y export Excel (3 hojas)
  admin/
    _layout.tsx      — Guard con PIN 1234
    index.tsx        — Dashboard de admin
    products/        — CRUD de productos con precio costo + margen
    users/           — CRUD de usuarios con gestión de PINs integrada por tarjeta
    inventory/       — Stock, recepciones y extravíos con historial de movimientos
db/
  database.ts        — initDatabase(), CREATE TABLE IF NOT EXISTS, migraciones try/catch
  queries.ts         — todas las funciones de acceso a DB
  schemas.ts         — Zod schemas
utils/
  pin.ts             — generatePin() sin caracteres ambiguos (sin O/0/I/1)
```

## Schema de DB local (expo-sqlite, WAL mode)
| Tabla | Columnas clave |
|---|---|
| `users` | id, name, created_at |
| `products` | id, name, price, barcode, stock, is_active, cost_price, margin_percentage |
| `transactions` | id, user_id, total, created_at |
| `transaction_items` | id, transaction_id, product_id, price_at_purchase, quantity |
| `checkout_pins` | id, pin, user_id FK, is_used, created_at |
| `stock_movements` | id, product_id, quantity_change, reason, created_at |

**Migraciones:** patrón try/catch en `db/database.ts`. `CREATE TABLE IF NOT EXISTS` para tablas nuevas; `ALTER TABLE` para columnas nuevas en tablas existentes.

**Transacciones atómicas:** `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` en queries que modifican múltiples tablas.

## Estado de features (roadmap aprobado)
- ✅ Feature 1: Precio de costo + margen (20/30/40%) en productos
- ✅ Feature 2: Filtros en historial + Excel mejorado (3 hojas: Detalle, Por Cliente, Por Producto)
- ✅ Feature 3: PIN de checkout por usuario (reusable, gestionado desde panel de Usuarios)
- ✅ Feature 4: Inventario + movimientos de stock + extravíos
- ⬜ Feature 5: Cierre de caja (tabla `cash_closings`, reporte por usuario + producto)
- ⬜ Feature 6: Estadísticas y reportes (velocidad de agotamiento, ganancia por producto)
- ⬜ Feature 7: Turso backup/restore (push en cierre de caja, pull histórico bajo demanda)

## Próximos pasos (Feature 5 — Cierre de caja)
Nueva tabla `cash_closings` (opened_at, closed_at, total_sales, summary_json).
Nueva pantalla `app/admin/closing/index.tsx`.
El cierre genera un reporte por usuario (total + detalle de productos) y por producto (unidades, ingresos, costo, ganancia).
Al cerrar caja → datos se subirán a Turso (Feature 7).
