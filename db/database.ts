import * as SQLite from 'expo-sqlite';

export const dbResult = SQLite.openDatabaseSync('grocery_store.db');

export const initDatabase = async () => {
    try {
        await dbResult.execAsync(`
            PRAGMA journal_mode = WAL;
            
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                barcode TEXT,
                stock INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                total REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            );

            CREATE TABLE IF NOT EXISTS transaction_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                price_at_purchase REAL NOT NULL,
                quantity INTEGER DEFAULT 1,
                FOREIGN KEY (transaction_id) REFERENCES transactions (id),
                FOREIGN KEY (product_id) REFERENCES products (id)
            );
        `);

        // Migration for existing databases
        try {
            await dbResult.execAsync('ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;');
        } catch (e) {
            // Check if error is because column exists, otherwise log
            if (e instanceof Error && !e.message.includes('duplicate column name')) {
                // console.log('Migration error (might be benign if column exists):', e);
            }
        }

        try {
            await dbResult.execAsync('ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1;');
        } catch (e) {
            if (e instanceof Error && !e.message.includes('duplicate column name')) {
                // console.log('Migration error:', e);
            }
        }

        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
};
