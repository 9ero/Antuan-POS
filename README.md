<div align="center">

# 🛒 Antuan POS

**Punto de venta móvil _offline-first_ para tiendas pequeñas.**

[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB.svg?logo=react)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020.svg?logo=expo)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57.svg?logo=sqlite)](https://www.sqlite.org/)
[![License](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0-lightgrey.svg)](./LICENSE)

</div>

---

Antuan POS es una aplicación de punto de venta para Android pensada para el día a día de una
tienda pequeña en Costa Rica. Funciona **100 % sin conexión** (base de datos local SQLite) y usa
la nube **solo como respaldo** (cold storage). Está diseñada para operar directamente sobre un
teléfono fijo en el mostrador, con toda la interfaz en español y precios en colones (₡).

Se distribuye como **APK** (fuera de Play Store), generado con **Expo EAS Build**.

> **Nota:** Este es un proyecto real en uso. El repositorio es público con fines de estudio y
> referencia; **todos los datos y credenciales sensibles están fuera del control de versiones**
> (ver [Configuración](#-configuración-y-datos-sensibles)).

---

## ✨ Características

### 🏪 Punto de venta
- **Grilla de productos** con filtro por **categoría** y por **artesanales** (productos sin código de barras).
- **Escáner de código de barras** con la cámara como camino primario de venta.
- **Carrito expandible** con control de cantidades, validación de stock y prevención de sobreventa.
- **Checkout con usuario + PIN**: cada venta se atribuye a un usuario mediante un PIN reutilizable.
- Totales automáticos en **colones (₡)**.

### 💵 Precios: costo + margen
- El precio se calcula desde el **costo** y un **margen** (20/30/40 %).
- Redondeo a la moneda mínima de ₡5: `Math.round(costo * (1 + margen/100) / 5) * 5`.

### 📦 Inventario
- **Recepciones** y **faltantes** con historial de **movimientos de stock**.
- El stock se gestiona **exclusivamente** desde Inventario y las ventas (nunca se pisa al editar el catálogo).
- Alertas visuales de **stock bajo / sin stock**.

### 🗂️ Catálogo
- **Productos**: CRUD con costo, margen, categoría obligatoria, código de barras opcional y búsqueda accent-insensitive. _Soft delete_ (se desactivan, no se borran) para no orfanar el historial.
- **Categorías** como entidad propia (crear, renombrar, activar/desactivar).
- **Usuarios** con gestión integrada de **PINs de checkout** (reutilizables, ligados al usuario).

### 📊 Historial y cierre de caja
- **Historial de ventas** con filtros por período (hoy / semana / mes / período actual / todos) y estadísticas.
- **Cierre de caja** con reporte del período, rankings (consumo más rápido, mayor ganancia) y estadísticas.
- **Exportación a Excel** (`.xlsx`) con hojas múltiples y columnas auto-ajustadas, lista para compartir por WhatsApp / correo.

### ☁️ Respaldo en la nube (Turso)
- Backup/restore completo contra **Turso** (SQLite en la nube) mediante cliente HTTP nativo.
- **Push por evento en tiempo real**: catálogo, PINs, ventas y movimientos suben al instante en segundo plano.
- **Cola offline**: si no hay red, los cambios se marcan pendientes y se sincronizan en el siguiente intento con conexión.
- **Restauración** completa al configurar un dispositivo nuevo (inventario independiente por dispositivo).

---

## 🧱 Arquitectura

**Offline-first.** La app opera siempre contra la base de datos local (SQLite en modo WAL, con
transacciones atómicas). Turso es únicamente respaldo: no hay dependencia de red para vender.

```
┌───────────────────────────┐        push por evento (background)
│      Dispositivo Android    │  ───────────────────────────────►  ┌──────────────┐
│  ┌──────────────────────┐  │        catálogo · ventas · stock     │    Turso     │
│  │  SQLite local (WAL)   │  │                                      │ (cold storage│
│  │  fuente de verdad     │  │  ◄───────────────────────────────   │  por device) │
│  └──────────────────────┘  │        restore completo (setup)      └──────────────┘
│   cola offline si no hay red│
└───────────────────────────┘
```

---

## 🛠 Stack

| Área | Tecnología |
|---|---|
| Framework | React Native `0.81` + Expo `SDK 54` |
| Lenguaje | TypeScript `5.9` |
| Ruteo | Expo Router (file-based, directorio `app/`) |
| UI | Gluestack UI v1 + NativeWind v4 (Tailwind para RN) |
| Base de datos | `expo-sqlite` (WAL) · respaldo en **Turso** (HTTP nativo) |
| Validación | Zod |
| Cámara | `expo-camera` (escáner de barras) |
| Excel | `xlsx` + `expo-file-system` + `expo-sharing` |
| Build | Expo **EAS Build** (APK) |

---

## 📁 Estructura del proyecto

```
Antuan-POS/
├── app/                     # Pantallas (Expo Router)
│   ├── _layout.tsx          # Provider global + setup de dispositivo (primer inicio)
│   ├── index.tsx            # POS: grilla, carrito, checkout (usuario + PIN)
│   ├── history.tsx          # Historial de ventas + export Excel
│   └── admin/               # Panel de administración (guard con PIN)
│       ├── products/        # CRUD de productos (costo + margen)
│       ├── categories/      # CRUD de categorías
│       ├── users/           # Usuarios + gestión de PINs
│       ├── inventory/       # Stock, recepciones y faltantes
│       └── closing/         # Cierre de caja + Excel
├── db/                      # Capa de datos
│   ├── database.ts          # initDatabase() + migraciones
│   ├── queries.ts           # Acceso a SQLite
│   ├── schemas.ts           # Schemas Zod
│   ├── turso.ts             # Cliente HTTP de Turso
│   └── sync.ts              # Backup/restore + cola offline
├── utils/                   # pin.ts, constants.ts
├── assets/                  # Íconos y branding (Antuan)
├── app.json                 # Config Expo (nombre, ícono, EAS)
├── eas.json                 # Perfiles de build (preview / production)
└── .env.example             # Plantilla de credenciales (sin secretos)
```

---

## 🚀 Correr localmente

> La app funciona **sin Turso**: si no configurás credenciales, opera 100 % local (sin respaldo en la nube).

### Requisitos
- **Node.js** 18+ y **npm**
- **Expo Go** en un dispositivo Android (para desarrollo) o un emulador

### Pasos
```bash
# 1. Clonar
git clone https://github.com/9ero/Antuan-POS.git
cd Antuan-POS

# 2. Dependencias
npm install

# 3. Variables de entorno (copiar la plantilla y completar)
cp .env.example .env

# 4. Iniciar (el flag -c limpia la caché de Metro)
npx expo start -c
```
Escaneá el QR con **Expo Go**, o usá `npx expo start --android`.

### Generar el APK (EAS Build)
```bash
# Build en la nube de Expo (perfil preview → APK)
npx eas-cli build --platform android --profile preview

# Build local (no sube tu .env a la nube; requiere Android SDK/Java)
npx eas-cli build --platform android --profile preview --local
```

---

## 🔐 Configuración y datos sensibles

Las credenciales viven en un archivo **`.env` que NO se versiona** (está en `.gitignore`). El
repositorio solo incluye **`.env.example`** con placeholders. Las variables usan el prefijo
`EXPO_PUBLIC_` porque se hornean en el build:

| Variable | Descripción |
|---|---|
| `EXPO_PUBLIC_TURSO_URL` | URL de la base Turso de respaldo (opcional) |
| `EXPO_PUBLIC_TURSO_TOKEN` | Token de acceso a Turso (opcional) |
| `EXPO_PUBLIC_ADMIN_PIN` | PIN del panel de administración (por defecto `1234`) |

> ⚠️ Nunca subas tu `.env` real ni tokens a un repositorio público. Para builds en la nube, tené
> presente que el contexto de build puede incluir el `.env`; el build **local** evita ese envío.

---

## 🗄️ Esquema de datos (local)

| Tabla | Descripción |
|---|---|
| `users` | Usuarios a los que se atribuyen las ventas (soft delete) |
| `categories` | Categorías de producto (nombre único, activable) |
| `products` | Catálogo: precio, costo, margen, categoría, stock, código de barras |
| `transactions` / `transaction_items` | Ventas y sus líneas (precio al momento de compra) |
| `checkout_pins` | PINs de checkout reutilizables, ligados a un usuario |
| `stock_movements` | Recepciones y faltantes (auditoría de stock) |
| `cash_closings` | Cierres de caja con resumen del período |
| `settings` | Configuración local del dispositivo y estado de sync |

Migraciones con patrón `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` en `db/database.ts`.

---

## 📜 Licencia

Este proyecto se distribuye bajo la **[PolyForm Noncommercial License 1.0.0](./LICENSE)**.

- ✅ **Uso no comercial permitido**: estudiar, modificar, usar y redistribuir para fines
  personales, educativos, de investigación o de organizaciones sin fines de lucro.
- ⚠️ **Uso comercial**: cualquier uso comercial —o modificación/derivado con fines
  comerciales— **requiere autorización previa y por escrito del autor**.

Para consultas de licenciamiento comercial, escribí a
**fernandezarayajuanmiguel@gmail.com** antes de cualquier uso de este tipo.

---

## 👤 Autor

**Juan Miguel Fernández Araya**
📧 fernandezarayajuanmiguel@gmail.com · 🔗 [github.com/9ero](https://github.com/9ero)

<div align="center">

Hecho con ❤️ en Costa Rica 🇨🇷

</div>
