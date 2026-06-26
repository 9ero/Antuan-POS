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

export const pushToTurso = async (deviceId: number): Promise<void> => {
    const [users, products, closings] = await Promise.all([
        dbResult.getAllAsync<{ id: number; name: string; created_at: string }>(
            'SELECT id, name, created_at FROM users'
        ),
        dbResult.getAllAsync<{
            id: number; name: string; price: number; cost_price: number;
            margin_percentage: number; barcode: string | null; stock: number;
            is_active: number; created_at: string;
        }>('SELECT id, name, price, cost_price, margin_percentage, barcode, stock, is_active, created_at FROM products'),
        dbResult.getAllAsync<{
            id: number; opened_at: string; closed_at: string;
            total_sales: number; summary_json: string; created_at: string;
        }>('SELECT id, opened_at, closed_at, total_sales, summary_json, created_at FROM cash_closings'),
    ]);

    const statements: Array<{ sql: string; args?: (string | number | null)[] }> = [];

    for (const u of users) {
        statements.push({
            sql: `INSERT OR REPLACE INTO users (id, device_id, name, created_at) VALUES (?, ?, ?, ?)`,
            args: [u.id, deviceId, u.name, u.created_at],
        });
    }
    for (const p of products) {
        statements.push({
            sql: `INSERT OR REPLACE INTO products
                  (id, device_id, name, price, cost_price, margin_percentage, barcode, stock, is_active, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [p.id, deviceId, p.name, p.price, p.cost_price, p.margin_percentage,
                   p.barcode ?? null, p.stock, p.is_active, p.created_at],
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

    if (statements.length > 0) await tursoExecute(statements);
    await saveSetting('last_sync_at', new Date().toISOString());
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
    const [userResults, productResults, closingResults] = await tursoExecute([
        { sql: 'SELECT id, name, created_at FROM users WHERE device_id = ?', args: [deviceId] },
        {
            sql: `SELECT id, name, price, cost_price, margin_percentage, barcode, stock, is_active, created_at
                  FROM products WHERE device_id = ?`,
            args: [deviceId],
        },
        {
            sql: `SELECT opened_at, closed_at, total_sales, summary_json, created_at
                  FROM cash_closings WHERE device_id = ? ORDER BY closed_at ASC`,
            args: [deviceId],
        },
    ]);

    const userStmts = (userResults ?? []).map(u => ({
        sql: 'INSERT OR REPLACE INTO users (id, name, created_at) VALUES (?, ?, ?)',
        args: [u.id, u.name, u.created_at] as (string | number | null)[],
    }));
    const productStmts = (productResults ?? []).map(p => ({
        sql: `INSERT OR REPLACE INTO products
              (id, name, price, cost_price, margin_percentage, barcode, stock, is_active, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [p.id, p.name, p.price, p.cost_price, p.margin_percentage,
               p.barcode, p.stock, p.is_active, p.created_at] as (string | number | null)[],
    }));
    const closingStmts = (closingResults ?? []).map(c => ({
        sql: `INSERT OR IGNORE INTO cash_closings (opened_at, closed_at, total_sales, summary_json, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [c.opened_at, c.closed_at, c.total_sales, c.summary_json, c.created_at] as (string | number | null)[],
    }));

    const all = [...userStmts, ...productStmts, ...closingStmts];
    await dbResult.execAsync('BEGIN TRANSACTION');
    try {
        for (const stmt of all) {
            await dbResult.runAsync(stmt.sql, ...(stmt.args as any[]));
        }
        await dbResult.execAsync('COMMIT');
    } catch (e) {
        await dbResult.execAsync('ROLLBACK');
        throw e;
    }

    await saveSetting('last_sync_at', new Date().toISOString());
};
