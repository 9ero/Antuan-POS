import { dbResult } from './database';
import { User, Product, CartItem, Transaction, TransactionSchema } from './schemas';

export { User, Product, CartItem, Transaction };

// Users
export const getUsers = async (): Promise<User[]> => {
    return await dbResult.getAllAsync('SELECT * FROM users ORDER BY name ASC');
};

export const addUser = async (name: string) => {
    return await dbResult.runAsync('INSERT INTO users (name) VALUES (?)', name);
};

export const deleteUser = async (id: number) => {
    return await dbResult.runAsync('DELETE FROM users WHERE id = ?', id);
};

export const updateUser = async (id: number, name: string) => {
    return await dbResult.runAsync('UPDATE users SET name = ? WHERE id = ?', name, id);
};

// Products
export const getProducts = async (): Promise<Product[]> => {
    return await dbResult.getAllAsync('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC');
};

export const addProduct = async (name: string, price: number, barcode: string = '', stock: number = 0) => {
    if (barcode) {
        const existing = await getProductByBarcode(barcode);
        if (existing) {
            if (existing.is_active === 0) {
                // Reactivate and update
                return await dbResult.runAsync(
                    'UPDATE products SET name = ?, price = ?, stock = ?, is_active = 1 WHERE id = ?',
                    name, price, stock, existing.id!
                );
            }
            throw new Error(`El código de barras "${barcode}" ya está registrado.`);
        }
    }
    return await dbResult.runAsync('INSERT INTO products (name, price, barcode, stock, is_active) VALUES (?, ?, ?, ?, 1)', name, price, barcode, stock);
};

export const updateProduct = async (id: number, name: string, price: number, barcode: string, stock: number) => {
    if (barcode) {
        const existing = await getProductByBarcode(barcode);
        if (existing && existing.id !== id) {
            throw new Error(`El código de barras "${barcode}" ya pertenece a otro producto.`);
        }
    }
    return await dbResult.runAsync('UPDATE products SET name = ?, price = ?, barcode = ?, stock = ? WHERE id = ?', name, price, barcode, stock, id);
};

export const deleteProduct = async (id: number) => {
    return await dbResult.runAsync('UPDATE products SET is_active = 0 WHERE id = ?', id);
};

export const getProductByBarcode = async (barcode: string): Promise<Product | null> => {
    return await dbResult.getFirstAsync('SELECT * FROM products WHERE barcode = ?', barcode);
};

// Transactions
export const createTransaction = async (userId: number, total: number, items: CartItem[]) => {
    try {
        await dbResult.execAsync('BEGIN TRANSACTION');

        const result = await dbResult.runAsync('INSERT INTO transactions (user_id, total) VALUES (?, ?)', userId, total);
        const transactionId = result.lastInsertRowId;

        for (const item of items) {
            // Check stock
            const product = await dbResult.getFirstAsync<Product>('SELECT stock, name FROM products WHERE id = ?', item.id!);
            if (!product) throw new Error(`Producto no encontrado: ${item.id}`);
            if (product.stock < item.quantity) {
                throw new Error(`Stock insuficiente para ${product.name}. Disponible: ${product.stock}`);
            }

            await dbResult.runAsync(
                'INSERT INTO transaction_items (transaction_id, product_id, price_at_purchase, quantity) VALUES (?, ?, ?, ?)',
                transactionId, item.id!, item.price, item.quantity
            );

            // Decrement Stock
            await dbResult.runAsync('UPDATE products SET stock = stock - ? WHERE id = ?', item.quantity, item.id!);
        }

        await dbResult.execAsync('COMMIT');
        return { success: true };
    } catch (e) {
        console.error(e);
        await dbResult.execAsync('ROLLBACK');
        return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
}


export const deleteAllTransactions = async () => {
    try {
        await dbResult.execAsync('BEGIN TRANSACTION');
        await dbResult.runAsync('DELETE FROM transaction_items');
        await dbResult.runAsync('DELETE FROM transactions');
        await dbResult.execAsync('COMMIT');
        return { success: true };
    } catch (e) {
        console.error(e);
        await dbResult.execAsync('ROLLBACK');
        return { success: false, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
};

export interface TransactionDetail {
    id: number;
    user_id: number;
    total: number;
    items: {
        product_name: string;
        quantity: number;
        price: number;
    }[];
    created_at?: string;
    user_name: string;
}

export const getTransactions = async (): Promise<TransactionDetail[]> => {
    const rows = await dbResult.getAllAsync<{
        transaction_id: number;
        total: number;
        created_at: string;
        user_name: string;
        product_name: string;
        quantity: number;
        price_at_purchase: number;
    }>(`
        SELECT 
            t.id as transaction_id, 
            t.total, 
            t.created_at, 
            u.name as user_name,
            p.name as product_name,
            ti.quantity,
            ti.price_at_purchase
        FROM transactions t 
        JOIN users u ON t.user_id = u.id 
        JOIN transaction_items ti ON t.id = ti.transaction_id
        JOIN products p ON ti.product_id = p.id
        ORDER BY t.created_at DESC
    `);

    const transactionsMap = new Map<number, TransactionDetail>();

    for (const row of rows) {
        if (!transactionsMap.has(row.transaction_id)) {
            transactionsMap.set(row.transaction_id, {
                id: row.transaction_id,
                user_id: 0,
                total: row.total,
                items: [],
                created_at: row.created_at,
                user_name: row.user_name,
            });
        }

        const transaction = transactionsMap.get(row.transaction_id)!;
        transaction.items.push({
            product_name: row.product_name,
            quantity: row.quantity,
            price: row.price_at_purchase
        });
    }

    return Array.from(transactionsMap.values());
};
