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
  _layout.tsx        — Provider global + pantalla de setup Turso (primer inicio)
  index.tsx          — POS principal: grilla de productos, carrito, modal de checkout (usuario + PIN)
  history.tsx        — Historial de ventas con filtros y export Excel (3 hojas, columnas auto-ajustadas)
  admin/
    _layout.tsx      — Guard con PIN 1234
    index.tsx        — Dashboard de admin + botón "Respaldar en la nube" + reset dev
    products/        — CRUD de productos con precio costo + margen
    users/           — CRUD de usuarios con gestión de PINs integrada por tarjeta
    inventory/       — Stock, recepciones y faltantes con historial de movimientos
    closing/         — Cierre de caja: reporte período, rankings, historial de cierres, Excel
db/
  database.ts        — initDatabase(), CREATE TABLE IF NOT EXISTS, migraciones try/catch
  queries.ts         — todas las funciones de acceso a DB (createTransaction devuelve transactionId;
                       addStock/registerLoss devuelven movementId)
  schemas.ts         — Zod schemas
  turso.ts           — Cliente HTTP para Turso (fetch nativo, sin @libsql/client)
  sync.ts            — Lógica de backup/restore: pushToTurso, pushTransactionToTurso,
                       pushStockMovementToTurso, restoreFromTurso, cola offline pending_sync
utils/
  pin.ts             — generatePin() sin caracteres ambiguos (sin O/0/I/1)
.env                 — EXPO_PUBLIC_TURSO_URL + EXPO_PUBLIC_TURSO_TOKEN (gitignored)
.env.example         — Plantilla de credenciales (commiteado)
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
| `cash_closings` | id, opened_at, closed_at, total_sales, summary_json, created_at |
| `settings` | key (PK), value — config del dispositivo y timestamps de sync |

**Migraciones:** patrón try/catch en `db/database.ts`. `CREATE TABLE IF NOT EXISTS` para tablas nuevas; `ALTER TABLE` para columnas nuevas en tablas existentes. Expo/React Native no maneja migraciones automáticamente.

**Transacciones atómicas:** `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK` en queries que modifican múltiples tablas.

## Excel export (closing + history)
- Librería: `xlsx`, escritura vía `File`/`Paths` de `expo-file-system` v2, compartida con `expo-sharing`
- Patrón: `if (file.exists) file.delete()` antes de `file.create()` para evitar error de archivo existente
- Columnas auto-ajustadas: `autoFitCols(ws)` calcula `wch` máximo por columna sobre todas las celdas

## Terminología: faltantes
En UI se usa **faltante/s** (no "extravío"). El valor en DB sigue siendo `reason = 'extravio'` — solo cambia el texto visible. `REASON_LABELS` en `inventory/index.tsx` mapea `extravio → 'Faltante'`.

## Cierre de caja (`app/admin/closing/index.tsx`)
- `buildClosingSummary(openedAt, closedAt)` — agrega transacciones + ítems + faltantes del período en JS
- `computeStats(summary)` — rankings: consumo más rápido (uds/día) y mayor ganancia total (sin faltantes)
- Excel 4 hojas: Resumen, Por Cliente, Por Producto, Estadísticas — solo se genera al confirmar cierre
- **No hay botón "Exportar Excel" en el período abierto** — el Excel es exclusivo del cierre confirmado para evitar duplicados con el reporte oficial
- Historial de cierres anteriores con botones Compartir (texto) y Excel
- `isSubmitting` en botón de confirmación de cierre

## Fechas y timezone
SQLite `CURRENT_TIMESTAMP` guarda UTC como `'YYYY-MM-DD HH:MM:SS'` (sin Z). JavaScript lo parsea como hora local, causando desfase de 6 h en Costa Rica (UTC-6).

**En SQL (`db/queries.ts`):** envolver ambos lados con `datetime()` para que SQLite normalice los formatos antes de comparar:
```sql
WHERE datetime(t.created_at) >= datetime(?) AND datetime(t.created_at) < datetime(?)
```
Helper `toISO(s)` normaliza strings SQLite a ISO antes de pasarlos a `new Date()` en JS.

**En JS (filtros client-side):** usar `toUTC(s)` solo cuando se compara fecha SQLite contra ISO string. Filtros SQLite vs SQLite (Hoy/Semana/Mes) no necesitan corrección porque el desfase se cancela en ambos lados.

## Feature 7 — Turso backup/restore

### Arquitectura
- Turso como cold storage cloud, **no** sync en tiempo real
- Cliente HTTP nativo (`fetch` a `/v2/pipeline`) — sin `@libsql/client` para evitar problemas de bundler en React Native
- Variables de entorno con prefijo `EXPO_PUBLIC_` (baked en build time): `EXPO_PUBLIC_TURSO_URL`, `EXPO_PUBLIC_TURSO_TOKEN`
- `isConfigured` en `db/turso.ts` — false si las vars contienen el placeholder `your-database`

### Schema Turso (tablas con PK compuesta `id + device_id`)
| Tabla | Notas |
|---|---|
| `devices` | id AUTOINCREMENT, name, created_at |
| `users` | PK (id, device_id) |
| `products` | PK (id, device_id) |
| `transactions` | PK (id, device_id) |
| `transaction_items` | PK (id, device_id) |
| `stock_movements` | PK (id, device_id) |
| `cash_closings` | id AUTOINCREMENT, device_id, opened_at, closed_at, total_sales, summary_json |

`initTursoSchema()` usa `CREATE TABLE IF NOT EXISTS` — idempotente, se llama al inicio de `pushToTurso` y en el flujo de setup.

### Flujo de primer inicio
`app/_layout.tsx` detecta si Turso está configurado y no hay `device_turso_id` en `settings` → muestra pantalla de setup con dos opciones:
1. **Nuevo dispositivo**: ingresa nombre → `registerDevice(name)` → guarda `device_turso_id` + `device_name` en settings
2. **Restaurar copia**: `listDevices()` → lista de dispositivos con último cierre → seleccionar → `restoreFromTurso(deviceId)` → restaura **todo** (usuarios, productos, transacciones, ítems, movimientos, cierres) en una transacción atómica local

### Qué se respalda y cuándo
| Dato | Cuándo sube a Turso |
|---|---|
| Usuarios + productos + stock | Manual ("Respaldar en la nube") y en cada cierre de caja |
| Cierres de caja | Manual y en cada cierre de caja |
| Transacciones + ítems | **Inmediatamente** después de cada venta (background) |
| Movimientos de stock | **Inmediatamente** después de cada recepción o faltante (background) |

### Cola offline (`pending_sync`)
Si un push falla por falta de red, se guarda `pending_sync = 'true'` en settings. En el siguiente intento (venta, movimiento o manual), `withPendingQueue` detecta el flag y hace un `pushToTurso` completo antes de continuar. Si sigue sin red, el flag permanece acumulando hasta que haya conexión.

### Settings relevantes en SQLite local
| Key | Valor |
|---|---|
| `device_turso_id` | ID numérico del dispositivo en Turso |
| `device_name` | Nombre del punto de venta |
| `last_sync_at` | ISO timestamp del último push exitoso |
| `pending_sync` | `'true'` si hay datos sin sincronizar |

### Botón dev (solo en desarrollo)
Admin → "⚙ Reset (dev)" ofrece:
- **Solo config Turso**: borra `settings` (el dispositivo "olvida" que está registrado, datos locales intactos)
- **Wipe completo**: vacía todas las tablas locales (Turso no se toca) — para simular reinstalación y probar restore

## Estado de features (roadmap aprobado)
- ✅ Feature 1: Precio de costo + margen (20/30/40%) en productos
- ✅ Feature 2: Filtros en historial + Excel mejorado (3 hojas: Detalle, Por Cliente, Por Producto)
- ✅ Feature 3: PIN de checkout por usuario (reusable, gestionado desde panel de Usuarios)
- ✅ Feature 4: Inventario + movimientos de stock + faltantes
- ✅ Feature 5: Cierre de caja con rankings, estadísticas y export Excel (4 hojas)
- ✅ Feature 6: Estadísticas en historial + filtro por período actual + burn rate
- ✅ Feature 7: Turso backup/restore — push en tiempo real por evento, restore completo, cola offline
