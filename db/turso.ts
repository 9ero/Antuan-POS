const TURSO_URL = (process.env.EXPO_PUBLIC_TURSO_URL ?? '').replace('libsql://', 'https://');
const TURSO_TOKEN = process.env.EXPO_PUBLIC_TURSO_TOKEN ?? '';

export const isConfigured = Boolean(
    process.env.EXPO_PUBLIC_TURSO_URL &&
    process.env.EXPO_PUBLIC_TURSO_TOKEN &&
    !process.env.EXPO_PUBLIC_TURSO_URL.includes('your-database')
);

type TursoArg = { type: 'null' } | { type: 'integer'; value: string } | { type: 'real'; value: string } | { type: 'text'; value: string };

function toArg(v: string | number | null | undefined): TursoArg {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'number') {
        return Number.isInteger(v)
            ? { type: 'integer', value: String(v) }
            : { type: 'real', value: String(v) };
    }
    return { type: 'text', value: v };
}

function extractValue(cell: any): string | number | null {
    if (!cell || cell.type === 'null') return null;
    if (cell.type === 'integer') return parseInt(cell.value, 10);
    if (cell.type === 'real') return parseFloat(cell.value);
    return cell.value ?? null;
}

export type TursoRow = Record<string, string | number | null>;

export const tursoExecute = async (
    statements: Array<{ sql: string; args?: (string | number | null)[] }>
): Promise<TursoRow[][]> => {
    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${TURSO_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            requests: [
                ...statements.map(s => ({
                    type: 'execute',
                    stmt: { sql: s.sql, args: (s.args ?? []).map(toArg) },
                })),
                { type: 'close' },
            ],
        }),
    });

    if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const rows: TursoRow[][] = [];
    for (const result of data.results) {
        if (result.type === 'error') throw new Error(result.error.message);
        if (result.response?.type === 'execute') {
            const { cols, rows: rawRows } = result.response.result;
            rows.push(
                rawRows.map((row: any[]) =>
                    Object.fromEntries(cols.map((col: any, i: number) => [col.name, extractValue(row[i])]))
                )
            );
        }
    }
    return rows;
};

export const initTursoSchema = async (): Promise<void> => {
    await tursoExecute([
        {
            sql: `CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
        },
        {
            sql: `CREATE TABLE IF NOT EXISTS users (
                id INTEGER,
                device_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT,
                PRIMARY KEY (id, device_id)
            )`,
        },
        {
            sql: `CREATE TABLE IF NOT EXISTS products (
                id INTEGER,
                device_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                cost_price REAL DEFAULT 0,
                margin_percentage INTEGER DEFAULT 30,
                barcode TEXT,
                stock INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT,
                PRIMARY KEY (id, device_id)
            )`,
        },
        {
            sql: `CREATE TABLE IF NOT EXISTS cash_closings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id INTEGER NOT NULL,
                opened_at TEXT NOT NULL,
                closed_at TEXT NOT NULL,
                total_sales REAL NOT NULL,
                summary_json TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
        },
    ]);
};
