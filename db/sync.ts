import { dbResult } from './database';
import { tursoExecute, initTursoSchema } from './turso';

export interface TursoDevice {
    id: number;
    name: string;
    created_at: string;
    last_closing: string | null;
}

// ── Local settings ────────────────────────────────────────────────────────────

export const getSetting = async (key: string): Promise<string | null> => {
    const row = await dbResult.getFirstAsync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?', key
    );
    return row?.value ?? null;
};

export const saveSetting = async (key: string, value: string): Promise<void> => {
    await dbResult.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value
    );
};

export const getDeviceConfig = async (): Promise<{ deviceId: number; deviceName: string } | null> => {
    const [idStr, name] = await Promise.all([
        getSetting('device_turso_id'),
        getSetting('device_name'),
    ]);
    if (!idStr || !name) return null;
    return { deviceId: parseInt(idStr, 10), deviceName: name };
};

// ── Turso operations ──────────────────────────────────────────────────────────

export const listDevices = async (): Promise<TursoDevice[]> => {
    await initTursoSchema();
    const [results] = await tursoExecute([{
        sql: `SELECT d.id, d.name, d.created_at,
                     MAX(c.closed_at) as last_closing
              FROM devices d
              LEFT JOIN cash_closings c ON c.device_id = d.id
              GROUP BY d.id
              ORDER BY d.created_at DESC`,
    }]);
    return (results ?? []).map(r => ({
        id: r.id as number,
        name: r.name as string,
        created_at: r.created_at as string,
        last_closing: r.last_closing as string | null,
    }));
};

export const registerDevice = async (name: string): Promise<number> => {
    await initTursoSchema();
    const [results] = await tursoExecute([{
        sql: 'INSERT INTO devices (name) VALUES (?) RETURNING id',
        args: [name],
    }]);
    const id = results?.[0]?.id;
    if (!id) throw new Error('No se pudo registrar el dispositivo');
    return id as number;
};

// initTursoSchema es idempotente pero hace varias llamadas (CREATEs + ALTER de migración);
// lo corremos una sola vez por sesión. Si falla (offline) el flag queda false y se reintenta.
let schemaReady = false;
const ensureSchema = async (): Promise<void> => {
    if (schemaReady) return;
    await initTursoSchema();
    schemaReady = true;
};

export const pushToTurso = async (deviceId: number): Promise<void> => {
    await ensureSchema(); // garantiza tablas y columnas (incl. migraciones) antes de escribir
    const [users, pins, categories, products, closings, txs, items, movements] = await Promise.all([
        dbResult.getAllAsync<{ id: number; name: string; is_active: number; created_at: string }>(
            'SELECT id, name, is_active, created_at FROM users'
        ),
        dbResult.getAllAsync<{ id: number; user_id: number | null; pin: string; created_at: string }>(
            'SELECT id, user_id, pin, created_at FROM checkout_pins'
        ),
        dbResult.getAllAsync<{ id: number; name: string; is_active: number; created_at: string }>(
            'SELECT id, name, is_active, created_at FROM categories'
        ),
        dbResult.getAllAsync<{
            id: number; name: string; price: number; cost_price: number;
            margin_percentage: number; barcode: string | null; category_id: number | null;
            stock: number; is_active: number; created_at: string;
        }>('SELECT id, name, price, cost_price, margin_percentage, barcode, category_id, stock, is_active, created_at FROM products'),
        dbResult.getAllAsync<{
            id: number; opened_at: string; closed_at: string;
            total_sales: number; summary_json: string; created_at: string;
        }>('SELECT id, opened_at, closed_at, total_sales, summary_json, created_at FROM cash_closings'),
        dbResult.getAllAsync<{ id: number; user_id: number | null; total: number; created_at: string }>(
            'SELECT id, user_id, total, created_at FROM transactions'
        ),
        dbResult.getAllAsync<{ id: number; transaction_id: number; product_id: number; price_at_purchase: number; quantity: number }>(
            'SELECT id, transaction_id, product_id, price_at_purchase, quantity FROM transaction_items'
        ),
        dbResult.getAllAsync<{ id: number; product_id: number; quantity_change: number; reason: string; created_at: string }>(
            'SELECT id, product_id, quantity_change, reason, created_at FROM stock_movements'
        ),
    ]);

    const statements: Array<{ sql: string; args?: (string | number | null)[] }> = [];

    for (const u of users) {
        statements.push({
            sql: `INSERT OR REPLACE INTO users (id, device_id, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [u.id, deviceId, u.name, u.is_active, u.created_at],
        });
    }
    // Replace the full pin set for this device so PINs regenerados no quedan fantasma en la nube
    statements.push({
        sql: `DELETE FROM checkout_pins WHERE device_id = ?`,
        args: [deviceId],
    });
    for (const pn of pins) {
        statements.push({
            sql: `INSERT OR REPLACE INTO checkout_pins (id, device_id, user_id, pin, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [pn.id, deviceId, pn.user_id ?? null, pn.pin, pn.created_at],
        });
    }
    for (const c of categories) {
        statements.push({
            sql: `INSERT OR REPLACE INTO categories (id, device_id, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [c.id, deviceId, c.name, c.is_active, c.created_at],
        });
    }
    for (const p of products) {
        statements.push({
            sql: `INSERT OR REPLACE INTO products
                  (id, device_id, name, price, cost_price, margin_percentage, barcode, category_id, stock, is_active, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.id, deviceId, p.name, p.price, p.cost_price, p.margin_percentage,
                   p.barcode ?? null, p.category_id ?? null, p.stock, p.is_active, p.created_at],
        });
    }
    for (const c of closings) {
        statements.push({
            sql: `INSERT OR IGNORE INTO cash_closings
                  (device_id, opened_at, closed_at, total_sales, summary_json, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [deviceId, c.opened_at, c.closed_at, c.total_sales, c.summary_json, c.created_at],
        });
    }
    for (const t of txs) {
        statements.push({
            sql: `INSERT OR IGNORE INTO transactions (id, device_id, user_id, total, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [t.id, deviceId, t.user_id ?? null, t.total, t.created_at],
        });
    }
    for (const i of items) {
        statements.push({
            sql: `INSERT OR IGNORE INTO transaction_items
                  (id, device_id, transaction_id, product_id, price_at_purchase, quantity)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [i.id, deviceId, i.transaction_id, i.product_id, i.price_at_purchase, i.quantity],
        });
    }
    for (const m of movements) {
        statements.push({
            sql: `INSERT OR IGNORE INTO stock_movements
                  (id, device_id, product_id, quantity_change, reason, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [m.id, deviceId, m.product_id, m.quantity_change, m.reason, m.created_at],
        });
    }

    if (statements.length > 0) await tursoExecute(statements);
    await saveSetting('last_sync_at', new Date().toISOString());
    await saveSetting('pending_sync', 'false');
};

// If there are pending items from a failed push, do a full sync (covers everything).
// Otherwise, run the targeted push fn. On failure, mark pending for next attempt.
const withPendingQueue = async (deviceId: number, fn: () => Promise<void>): Promise<void> => {
    const hasPending = (await getSetting('pending_sync')) === 'true';
    if (hasPending) {
        try { await pushToTurso(deviceId); } catch { /* still offline, stays pending */ }
        return;
    }
    try {
        await ensureSchema(); // las pushes por evento no migran solas; garantízalo acá
        await fn();
    } catch {
        await saveSetting('pending_sync', 'true');
    }
};

// Builds INSERT OR REPLACE statements for the given products so su stock denormalizado
// queda fresco en Turso junto con la venta/movimiento que lo modificó.
const buildProductStmts = async (
    deviceId: number,
    productIds: number[],
): Promise<Array<{ sql: string; args: (string | number | null)[] }>> => {
    const ids = [...new Set(productIds)];
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const products = await dbResult.getAllAsync<{
        id: number; name: string; price: number; cost_price: number;
        margin_percentage: number; barcode: string | null; category_id: number | null;
        stock: number; is_active: number; created_at: string;
    }>(
        `SELECT id, name, price, cost_price, margin_percentage, barcode, category_id, stock, is_active, created_at
         FROM products WHERE id IN (${placeholders})`,
        ...ids
    );
    return products.map(p => ({
        sql: `INSERT OR REPLACE INTO products
              (id, device_id, name, price, cost_price, margin_percentage, barcode, category_id, stock, is_active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, deviceId, p.name, p.price, p.cost_price, p.margin_percentage,
               p.barcode ?? null, p.category_id ?? null, p.stock, p.is_active, p.created_at] as (string | number | null)[],
    }));
};

export const pushTransactionToTurso = async (deviceId: number, txId: number): Promise<void> => {
    await withPendingQueue(deviceId, async () => {
        const [tx, items] = await Promise.all([
            dbResult.getFirstAsync<{ id: number; user_id: number | null; total: number; created_at: string }>(
                'SELECT id, user_id, total, created_at FROM transactions WHERE id = ?', txId
            ),
            dbResult.getAllAsync<{ id: number; transaction_id: number; product_id: number; price_at_purchase: number; quantity: number }>(
                'SELECT id, transaction_id, product_id, price_at_purchase, quantity FROM transaction_items WHERE transaction_id = ?', txId
            ),
        ]);
        if (!tx) return;
        const productStmts = await buildProductStmts(deviceId, items.map(i => i.product_id));
        await tursoExecute([
            {
                sql: `INSERT OR IGNORE INTO transactions (id, device_id, user_id, total, created_at) VALUES (?, ?, ?, ?, ?)`,
                args: [tx.id, deviceId, tx.user_id ?? null, tx.total, tx.created_at],
            },
            ...items.map(i => ({
                sql: `INSERT OR IGNORE INTO transaction_items
                      (id, device_id, transaction_id, product_id, price_at_purchase, quantity)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [i.id, deviceId, i.transaction_id, i.product_id, i.price_at_purchase, i.quantity] as (string | number | null)[],
            })),
            ...productStmts, // refresca el stock de los productos vendidos
        ]);
    });
};

export const pushStockMovementToTurso = async (deviceId: number, movId: number): Promise<void> => {
    await withPendingQueue(deviceId, async () => {
        const mov = await dbResult.getFirstAsync<{ id: number; product_id: number; quantity_change: number; reason: string; created_at: string }>(
            'SELECT id, product_id, quantity_change, reason, created_at FROM stock_movements WHERE id = ?', movId
        );
        if (!mov) return;
        const productStmts = await buildProductStmts(deviceId, [mov.product_id]);
        await tursoExecute([
            {
                sql: `INSERT OR IGNORE INTO stock_movements
                      (id, device_id, product_id, quantity_change, reason, created_at)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [mov.id, deviceId, mov.product_id, mov.quantity_change, mov.reason, mov.created_at],
            },
            ...productStmts, // refresca el stock del producto afectado
        ]);
    });
};

// Pushes the full current pin set for this device (DELETE + reinsert) so creations,
// regenerations and deletions se reflejan al instante. Son pocos PINs → empujar todo es barato.
export const pushPinsToTurso = async (deviceId: number): Promise<void> => {
    await withPendingQueue(deviceId, async () => {
        const pins = await dbResult.getAllAsync<{ id: number; user_id: number | null; pin: string; created_at: string }>(
            'SELECT id, user_id, pin, created_at FROM checkout_pins'
        );
        await tursoExecute([
            { sql: `DELETE FROM checkout_pins WHERE device_id = ?`, args: [deviceId] },
            ...pins.map(p => ({
                sql: `INSERT OR REPLACE INTO checkout_pins (id, device_id, user_id, pin, created_at) VALUES (?, ?, ?, ?, ?)`,
                args: [p.id, deviceId, p.user_id ?? null, p.pin, p.created_at] as (string | number | null)[],
            })),
        ]);
    });
};

// Sube un producto puntual (alta/edición/baja soft) al instante. La baja es is_active=0,
// que es un upsert normal, así que esta misma función la cubre.
export const pushProductToTurso = async (deviceId: number, productId: number): Promise<void> => {
    await withPendingQueue(deviceId, async () => {
        const stmts = await buildProductStmts(deviceId, [productId]);
        if (stmts.length > 0) await tursoExecute(stmts);
    });
};

// Sube un usuario puntual (alta/edición) al instante.
export const pushUserToTurso = async (deviceId: number, userId: number): Promise<void> => {
    await withPendingQueue(deviceId, async () => {
        const u = await dbResult.getFirstAsync<{ id: number; name: string; is_active: number; created_at: string }>(
            'SELECT id, name, is_active, created_at FROM users WHERE id = ?', userId
        );
        if (!u) return;
        await tursoExecute([{
            sql: `INSERT OR REPLACE INTO users (id, device_id, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [u.id, deviceId, u.name, u.is_active, u.created_at],
        }]);
    });
};

// Sube una categoría puntual (alta/edición/activar-desactivar) al instante.
export const pushCategoryToTurso = async (deviceId: number, categoryId: number): Promise<void> => {
    await withPendingQueue(deviceId, async () => {
        const c = await dbResult.getFirstAsync<{ id: number; name: string; is_active: number; created_at: string }>(
            'SELECT id, name, is_active, created_at FROM categories WHERE id = ?', categoryId
        );
        if (!c) return;
        await tursoExecute([{
            sql: `INSERT OR REPLACE INTO categories (id, device_id, name, is_active, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [c.id, deviceId, c.name, c.is_active, c.created_at],
        }]);
    });
};

// pushToTurso already includes all local cash_closings, so this is just an alias
export const pushClosingToTurso = async (
    deviceId: number,
    _openedAt: string,
    _closedAt: string,
    _totalSales: number,
    _summaryJson: string,
): Promise<void> => {
    await pushToTurso(deviceId);
};

export const restoreFromTurso = async (deviceId: number): Promise<void> => {
    const [userResults, pinResults, categoryResults, productResults, closingResults, txResults, itemResults, movResults] = await tursoExecute([
        { sql: 'SELECT id, name, is_active, created_at FROM users WHERE device_id = ?', args: [deviceId] },
        { sql: 'SELECT id, user_id, pin, created_at FROM checkout_pins WHERE device_id = ?', args: [deviceId] },
        { sql: 'SELECT id, name, is_active, created_at FROM categories WHERE device_id = ?', args: [deviceId] },
        {
            sql: `SELECT id, name, price, cost_price, margin_percentage, barcode, category_id, stock, is_active, created_at
                  FROM products WHERE device_id = ?`,
            args: [deviceId],
        },
        {
            sql: `SELECT opened_at, closed_at, total_sales, summary_json, created_at
                  FROM cash_closings WHERE device_id = ? ORDER BY closed_at ASC`,
            args: [deviceId],
        },
        {
            sql: 'SELECT id, user_id, total, created_at FROM transactions WHERE device_id = ? ORDER BY id ASC',
            args: [deviceId],
        },
        {
            sql: `SELECT id, transaction_id, product_id, price_at_purchase, quantity
                  FROM transaction_items WHERE device_id = ? ORDER BY id ASC`,
            args: [deviceId],
        },
        {
            sql: `SELECT id, product_id, quantity_change, reason, created_at
                  FROM stock_movements WHERE device_id = ? ORDER BY id ASC`,
            args: [deviceId],
        },
    ]);

    const stmts: Array<{ sql: string; args: (string | number | null)[] }> = [
        ...(userResults ?? []).map(u => ({
            sql: 'INSERT OR REPLACE INTO users (id, name, is_active, created_at) VALUES (?, ?, ?, ?)',
            args: [u.id, u.name, u.is_active, u.created_at] as (string | number | null)[],
        })),
        ...(pinResults ?? []).map(p => ({
            sql: 'INSERT OR REPLACE INTO checkout_pins (id, user_id, pin, created_at) VALUES (?, ?, ?, ?)',
            args: [p.id, p.user_id ?? null, p.pin, p.created_at] as (string | number | null)[],
        })),
        ...(categoryResults ?? []).map(c => ({
            sql: 'INSERT OR REPLACE INTO categories (id, name, is_active, created_at) VALUES (?, ?, ?, ?)',
            args: [c.id, c.name, c.is_active, c.created_at] as (string | number | null)[],
        })),
        ...(productResults ?? []).map(p => ({
            sql: `INSERT OR REPLACE INTO products
                  (id, name, price, cost_price, margin_percentage, barcode, category_id, stock, is_active, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.id, p.name, p.price, p.cost_price, p.margin_percentage,
                   p.barcode, p.category_id ?? null, p.stock, p.is_active, p.created_at] as (string | number | null)[],
        })),
        ...(closingResults ?? []).map(c => ({
            sql: `INSERT OR IGNORE INTO cash_closings (opened_at, closed_at, total_sales, summary_json, created_at)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [c.opened_at, c.closed_at, c.total_sales, c.summary_json, c.created_at] as (string | number | null)[],
        })),
        ...(txResults ?? []).map(t => ({
            sql: 'INSERT OR IGNORE INTO transactions (id, user_id, total, created_at) VALUES (?, ?, ?, ?)',
            args: [t.id, t.user_id ?? null, t.total, t.created_at] as (string | number | null)[],
        })),
        ...(itemResults ?? []).map(i => ({
            sql: `INSERT OR IGNORE INTO transaction_items
                  (id, transaction_id, product_id, price_at_purchase, quantity)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [i.id, i.transaction_id, i.product_id, i.price_at_purchase, i.quantity] as (string | number | null)[],
        })),
        ...(movResults ?? []).map(m => ({
            sql: `INSERT OR IGNORE INTO stock_movements (id, product_id, quantity_change, reason, created_at)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [m.id, m.product_id, m.quantity_change, m.reason, m.created_at] as (string | number | null)[],
        })),
    ];

    await dbResult.execAsync('BEGIN TRANSACTION');
    try {
        for (const s of stmts) {
            await dbResult.runAsync(s.sql, ...(s.args as any[]));
        }
        await dbResult.execAsync('COMMIT');
    } catch (e) {
        await dbResult.execAsync('ROLLBACK');
        throw e;
    }

    await saveSetting('last_sync_at', new Date().toISOString());
};
