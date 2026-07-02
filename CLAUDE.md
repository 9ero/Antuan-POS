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
- Patrón completo para prevenir doble registro por doble tap en formularios:
  ```ts
  const handleSubmit = async () => {
      if (isSubmitting) return;        // guarda síncrona antes del setState
      setIsSubmitting(true);
      try {
          // lógica de negocio
      } finally {
          setIsSubmitting(false);      // siempre se resetea, incluso si hay error
      }
  };
  ```
  Solo `isDisabled={isSubmitting}` no es suficiente — el re-render puede llegar tarde y un segundo tap escapa.
- **El stock se gestiona EXCLUSIVAMENTE desde Inventario (recepciones/faltantes) y las ventas.** Al **editar** un producto existente, el campo Stock está **bloqueado** y `updateProduct` **no escribe** la columna `stock` — así un edit de catálogo no pisa el stock real (que pudo cambiar por una venta/recepción mientras el modal estaba abierto). Solo al **crear** un producto se define el stock inicial (vía `addProduct`).
- **Teclado (edge-to-edge, SDK 54):** edge-to-edge es obligatorio en Android y rompe el `adjustResize` nativo en builds standalone — el teclado tapa los inputs de la mitad inferior (en Expo Go NO se nota; solo aparece en el APK). Regla para todo input nuevo:
  - Modal RN con inputs → el contenedor raíz es `KeyboardAvoidingView behavior="padding"` (con los estilos del Box que reemplaza en `style`).
  - Modal Gluestack con inputs → prop `avoidKeyboard`.
  - Pantalla plana con input centrado → envolver en `KeyboardAvoidingView behavior="padding"` (setup en `_layout.tsx`, guard de admin).
  - Formulario alto en modal → además `maxHeight` en el sheet + `ScrollView keyboardShouldPersistTaps="handled"` alrededor de los campos (ej. formulario de producto).
  - Buscadores pegados al tope de la pantalla no lo necesitan.
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
    products/        — CRUD de productos (costo+margen, categoría obligatoria, búsqueda por nombre/código)
    categories/      — CRUD de categorías (crear, renombrar, activar/desactivar)
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
  constants.ts       — ADMIN_PIN (lee EXPO_PUBLIC_ADMIN_PIN, fallback '1234'); usado por admin/_layout y history
.env                 — EXPO_PUBLIC_TURSO_URL + EXPO_PUBLIC_TURSO_TOKEN + EXPO_PUBLIC_ADMIN_PIN (gitignored, NO tocar .env.example)
.env.example         — Plantilla de credenciales con placeholders (commiteado, solo para referencia)
```

## Schema de DB local (expo-sqlite, WAL mode)
| Tabla | Columnas clave |
|---|---|
| `users` | id, name, is_active, created_at |
| `categories` | id, name (UNIQUE), is_active, created_at |
| `products` | id, name, price, barcode, category_id FK, stock, is_active, cost_price, margin_percentage |
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
- `handleClose` usa patrón completo `if (isSubmitting) return` + `try/finally` para evitar doble registro

## Fechas y timezone
SQLite `CURRENT_TIMESTAMP` guarda UTC como `'YYYY-MM-DD HH:MM:SS'` (sin Z). JavaScript lo parsea como hora local, causando desfase de 6 h en Costa Rica (UTC-6).

**En SQL (`db/queries.ts`):** envolver ambos lados con `datetime()` para que SQLite normalice los formatos antes de comparar:
```sql
WHERE datetime(t.created_at) >= datetime(?) AND datetime(t.created_at) < datetime(?)
```
Helper `toISO(s)` normaliza strings SQLite a ISO antes de pasarlos a `new Date()` en JS.

**En JS (filtros client-side):** usar `toUTC(s)` solo cuando se compara fecha SQLite contra ISO string. Filtros SQLite vs SQLite (Hoy/Semana/Mes) no necesitan corrección porque el desfase se cancela en ambos lados.

**En UI (display de fechas SQLite):** cualquier `fmtDate` o `new Date()` que reciba un string de SQLite debe normalizarlo primero:
```ts
new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z')
```
Aplica a `created_at` de `cash_closings`, `transactions`, etc. Los campos que vienen de `new Date().toISOString()` en JS (como `opened_at`, `closed_at`) ya tienen `T` y `Z` y no necesitan normalización.

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
| `checkout_pins` | PK (id, device_id), user_id, pin, created_at (sin UNIQUE global) |
| `categories` | PK (id, device_id), name, is_active, created_at |
| `products` | PK (id, device_id), incluye `category_id` |
| `transactions` | PK (id, device_id) |
| `transaction_items` | PK (id, device_id) |
| `stock_movements` | PK (id, device_id) |
| `cash_closings` | id AUTOINCREMENT, device_id, opened_at, closed_at, total_sales, summary_json |

`initTursoSchema()` usa `CREATE TABLE IF NOT EXISTS` — idempotente, se llama al inicio de `pushToTurso` y en el flujo de setup.

### Flujo de primer inicio
`app/_layout.tsx` detecta si Turso está configurado y no hay `device_turso_id` en `settings` → muestra pantalla de setup con dos opciones:
1. **Nuevo dispositivo**: ingresa nombre → `registerDevice(name)` → guarda `device_turso_id` + `device_name` en settings
2. **Restaurar copia**: `listDevices()` → lista de dispositivos con último cierre → seleccionar → `restoreFromTurso(deviceId)` → restaura **todo** (usuarios, PINs de checkout, productos, transacciones, ítems, movimientos, cierres) en una transacción atómica local

### Qué se respalda y cuándo
| Dato | Cuándo sube a Turso |
|---|---|
| Catálogo (alta/edición/baja de usuarios, productos y categorías) | **Inmediatamente** (background, upsert puntual vía `pushUserToTurso` / `pushProductToTurso` / `pushCategoryToTurso`) |
| PINs de checkout | **Inmediatamente** al crear/regenerar/borrar (background, set completo vía `pushPinsToTurso`) |
| Cierres de caja | Manual y en cada cierre de caja |
| Transacciones + ítems + **stock de los productos vendidos** | **Inmediatamente** después de cada venta (background) |
| Movimientos de stock + **stock del producto afectado** | **Inmediatamente** después de cada recepción o faltante (background) |

El `stock` de cada producto se refresca en Turso junto con la venta/movimiento que lo modifica (`buildProductStmts` en `sync.ts`), así un restore nunca trae stock desfasado. **Todo lo que el comprador crea/edita (usuarios, productos, PINs) sube al instante.** Lo único que espera al push completo es el movimiento `reason='venta'` (audit log, recuperado en el siguiente respaldo o cierre). `settings` nunca sube (local a propósito).

**Soft delete de usuarios:** `deleteUser` hace `UPDATE is_active = 0` (no DELETE físico), igual que productos, para no orfanar transacciones — el historial resuelve el nombre con `JOIN users`, un DELETE las haría desaparecer. `getUsers` filtra `is_active = 1`. La baja se propaga a Turso como un upsert normal.

### Cola offline (`pending_sync`)
Si un push falla por falta de red, se guarda `pending_sync = 'true'` en settings. En el siguiente intento (venta, movimiento o manual), `withPendingQueue` detecta el flag y hace un `pushToTurso` completo antes de continuar. Si sigue sin red, el flag permanece acumulando hasta que haya conexión.

### Settings relevantes en SQLite local
| Key | Valor |
|---|---|
| `device_turso_id` | ID numérico del dispositivo en Turso |
| `device_name` | Nombre del punto de venta |
| `last_sync_at` | ISO timestamp del último push exitoso |
| `pending_sync` | `'true'` si hay datos sin sincronizar |

**`settings` NO se respalda en Turso a propósito** — es config local del dispositivo (su identidad `device_turso_id` y estado de sync). Restaurarla rompería la identidad del device. Todas las demás tablas locales sí se respaldan.

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
- ✅ Feature 9: Categorías de productos — filtrado rápido en el POS principal (grilla)
- ✅ Feature 10: Ícono de app — adaptive icon con zona segura al 66% (`adaptive-foreground.png`); EAS Build configurado; APK local verificado
- ✅ Feature 8: Calibración visual — azul primario + acentos emerald/amber consistentes
- 🔄 Fase de pruebas exhaustivas — EN CURSO: varios días operando el APK local en dispositivo real antes del build de producción

## Próximos pasos (orden de ejecución por dificultad, visual al final)

Orden acordado: **1) Limpieza ✅ → 2) Feature 9 (categorías) ✅ → Feature 8 (color) ✅ → Feature 10 (ícono) ✅ → Pruebas exhaustivas (EN CURSO)**. Lo funcional y lo visual primero; las pruebas exhaustivas como gate final antes del build de producción. **Estamos en la fase de pruebas: varios días operando el APK local en dispositivo real.**

## Sistema de color (Feature 8)
Paleta aplicada de forma consistente (regla 60% neutro / 30% azul / 10% acento). Roles semánticos:
- **Azul `$blue600`** (`$blue50/400/700`): identidad + acción primaria/navegación (header POS, botón escáner, chips activos, links, primarios admin) **y** métrica "Ventas/ingresos" en reportes (cierre/historial, montos de transacción).
- **Emerald `$emerald600`** (`$emerald50/100/700`): dinero/éxito/cobrar (precios ₡, Cobrar, Confirmar, total carrito, precio escaneado, stock OK, "sync ok") **y** métrica "Ganancia".
- **Amber `$amber500`** (`$amber100/600/700`): advertencia / stock bajo / ranking consumo (🔥).
- **Red `$red600/500`**: error / sin stock / eliminar / salir.
- **coolGray**: neutros (texto, bordes, fondos).

Tokens `$emerald`/`$amber` existen en `@gluestack-ui/config`. Ya no se usa `$purple`/`$green`/`$orange` en `app/`.

### Interacciones del POS (`app/index.tsx`)
- **Botón "Escanear"** (antes "Escanear Producto"): elemento **flotante** (absolute, `pointerEvents="box-none"`), centrado y anclado al tope del panel del carrito con sombra — no ocupa fila en el layout y sigue al carrito aunque se expanda o comprima. `translateY` ajusta la altura del flote.
- **Carrito con 3 estados**: vacío → **comprimido del todo** (`flex 0`, solo barra "Carrito (0)" + Total + Cobrar, sin chevron, tap no expande); con 1+ ítems → tamaño normal (top `flex 2` / carrito `flex 1`); tap en "Carrito" → media pantalla (`flex 1/1`) y vuelve. Todas las mutaciones del carrito llaman `animateLayout()` (`LayoutAnimation`) para transiciones suaves; `useEffect` resetea `cartExpanded` al vaciarse.
- **Venta exitosa**: tarjeta **centrada** (círculo emerald con ✓ + "¡Venta Exitosa!" + monto), `pointerEvents="none"`, se cierra sola a los 2 s (timer con `useRef` que se resetea si hay otra venta). Reemplazó al toast superior; los toasts de error/escáner siguen.
- **Modal de checkout centrado** (fade, esquinas `$3xl`, `paddingHorizontal`), label "Nombre del cliente" para el selector de usuario.
- **"Cerrar Escáner"** (modal de cámara): botón outline transparente con borde blanco + ícono ✕, cuadrado (`borderRadius="$md"`), para no tapar la cámara.

### 1. Limpieza técnica ✅
- Borrado `app/admin/pins/` (legacy roto). PIN admin centralizado en `utils/constants.ts` → `ADMIN_PIN` (lee `EXPO_PUBLIC_ADMIN_PIN`). Columna `is_used` deprecada.

### 2. Feature 9 — Categorías en el POS ✅
- **Categorías como entidad propia** (tabla `categories`, no strings): id, name (UNIQUE), is_active. Evita errores/duplicados por texto libre. `products.category_id` FK → `categories.id`.
- **Categoría obligatoria** al crear/editar producto (selector de categorías activas en `admin/products`, sin texto libre). Validación: no se guarda sin categoría.
- **Panel admin** `app/admin/categories/`: crear, renombrar, activar/desactivar. Desactivar no toca los productos ya asignados, solo la oculta del selector y de los filtros. Sync en tiempo real (`pushCategoryToTurso`) + push/restore completo.
- **Artesanales** = categoría derivada (no almacenada): productos **sin código de barras** (`isArtesanal` = barcode vacío). Son los que no se pueden escanear.
- POS (`app/index.tsx`): el escáner sigue arriba como camino primario. Filtros en **una sola fila con scroll horizontal** (`filterChips`): Artesanales + cada categoría activa, cada chip con **nombre + conteo**; las de 0 productos no aparecen y **no hay chip "Todos"** — tap filtra, tap en el chip activo (marcado con ✕) lo desactiva y vuelve a mostrar todo (default sin filtro). Filtra la grilla (`visibleProducts` por `category_id`, client-side). Categorías cargadas en `useProductSearch`. Un producto artesanal con categoría aparece en **ambos** filtros (Artesanales es derivada del barcode, no excluyente). El panel lateral y "Mostrar más" fueron eliminados.
- Admin de productos: la lista muestra el **nombre de la categoría** (resuelto con `getAllCategories`, incluso si está inactiva) en vez del código; Stock y Código de Barras en líneas separadas; **búsqueda rápida** por nombre (accent-insensitive) o código de barras.

### 3. Fase de pruebas exhaustivas (alta)
Flujos a cubrir antes de build de producción:
1. Venta completa: agregar al carrito → checkout con PIN → stock se descuenta → sube a Turso
2. Stock bajo: badge rojo aparece → recepción → stock sube → movimiento en Turso
3. Faltante: se registra → stock baja → movimiento en Turso
4. Cierre de caja: reporte correcto → Excel exporta → datos suben a Turso
5. Sin conexión: hacer venta → sin red → pending_sync=true → volver la red → siguiente venta flush todo
6. Primer inicio (nuevo): wipe completo → configurar nuevo dispositivo → operar normalmente
7. Restauración: wipe completo → "Restaurar copia" → todos los datos vuelven desde Turso
8. Historial + filtros: período actual, hoy, semana, mes, todos — datos correctos en cada uno
9. Excel historial: 3 hojas con columnas ajustadas y datos correctos
10. Admin: productos, usuarios, PINs, inventario — CRUD completo sin errores

### Feature 8 — Calibración visual ✅
Hecha. Ver sección **"Sistema de color"** arriba para los roles semánticos. No queda `$purple`/`$green`/`$orange` en `app/`.

### Feature 10 — Ícono de app (branding aplicado) ✅
- Assets: `assets/Antuan.png` (caricatura azul monocromática) / `AntuanColor.png` (color) / `assets/adaptive-foreground.png` (Antuan azul reducido al 66% sobre lienzo transparente).
- `app.json`: nombre "Antuan POS", `icon` → `Antuan.png`, `splash` → `AntuanColor.png` (fondo blanco), `favicon` → `Antuan.png`.
- **Zona segura del adaptive icon — RESUELTA:** `Antuan.png` original ocupaba el 71% ancho × 96% alto del lienzo → se desbordaba (Android recorta el ~18% de cada borde con la máscara). Solución: `adaptiveIcon.foregroundImage` → `assets/adaptive-foreground.png`, que es la caricatura azul **reducida al 66% central** con margen transparente en los 4 lados (sobrevive máscaras circulares/squircle). Generado con PIL: crop al bbox de contenido → resize a `0.66 * 1024` en el lado mayor → centrar en canvas 1024×1024 transparente.
- **Fondo del adaptive icon: BLANCO `#ffffff`** (decisión del comprador — NO azul). El azul `#2563EB` es solo para la carga inicial (splash / pantalla de `_layout.tsx`), no para el ícono. Nota: hoy `splash.backgroundColor` sigue en `#ffffff`; pasar la carga inicial a azul quedó como pendiente opcional, no bloqueante.
- El ícono solo se ve en build real, no en dev. **Verificado en APK local: el ícono se ve correcto, sin recortes.**

### Build de APK (EAS) — configurado ✅
- `app.json`: `android.package` = `com.antuan.pos`; `extra.eas.projectId` = `4744ed42-7541-463a-92b8-4778f2171407`. Proyecto Expo: `@9ero/AntuanPOS`.
- `eas.json`: perfil `preview` (distribución `internal`, `buildType: apk`) y `production` (`app-bundle`). `appVersionSource: local`.
- `.easignore`: igual a `.gitignore` PERO **no ignora `.env`** — para que EAS hornee las `EXPO_PUBLIC_*` (Turso URL/token, PIN admin) en el APK. Ojo: un build **en la nube** subiría el `.env` con el token a Expo.
- CLI no instalado global → usar `npx eas-cli ...`. Cuenta logueada: `9ero` (juan.fernadez.araya@gmail.com).
- Comando nube: `npx eas-cli build --platform android --profile preview`. Comando local (no sube `.env`): agregar `--local` (requiere Android SDK/Java).
- **El build se hizo LOCALMENTE** (los `build-*.apk` sin trackear son artefactos locales; `*.apk` está en `.gitignore`/`.easignore`, NO commitear). El build en la nube `d1309789` quedó `canceled` a propósito porque ya se buildeó local.

### Fase de pruebas — EN CURSO (gate final antes de producción)
**Estado actual (2026-06-30):** APK local funcionando bien en dispositivo real. Ahora vienen **varios días de pruebas** operando la app en condiciones reales para verificar que TODO funciona como debería antes del build de producción. No dar por cerrado el proyecto ni hacer cambios grandes hasta que las pruebas confirmen estabilidad — cualquier bug que aparezca en el uso diario tiene prioridad. Cubrir los 10 flujos de la sección **"3. Fase de pruebas exhaustivas"** de arriba.
