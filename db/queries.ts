import { dbResult } from './database';
import { User, Product, CartItem, Transaction } from './types';
import * as SQLite from 'expo-sqlite';

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

// Products
export const getProducts = async (): Promise<Product[]> => {
    return await dbResult.getAllAsync('SELECT * FROM products ORDER BY name ASC');
};

export const addProduct = async (name: string, price: number, barcode: string = '') => {
    return await dbResult.runAsync('INSERT INTO products (name, price, barcode) VALUES (?, ?, ?)', name, price, barcode);
};

export const deleteProduct = async (id: number) => {
    return await dbResult.runAsync('DELETE FROM products WHERE id = ?', id);
};

export const getProductByBarcode = async (barcode: string): Promise<Product | null> => {
    return await dbResult.getFirstAsync('SELECT * FROM products WHERE barcode = ?', barcode);
};

// Transactions
export const createTransaction = async (userId: number, total: number, items: { id: number, price: number, quantity: number }[]) => {
    try {
        await dbResult.execAsync('BEGIN TRANSACTION');

        const result = await dbResult.runAsync('INSERT INTO transactions (user_id, total) VALUES (?, ?)', userId, total);
        const transactionId = result.lastInsertRowId;

        for (const item of items) {
            await dbResult.runAsync(
                'INSERT INTO transaction_items (transaction_id, product_id, price_at_purchase, quantity) VALUES (?, ?, ?, ?)',
                transactionId, item.id, item.price, item.quantity
            );
        }

        await dbResult.execAsync('COMMIT');
        return true;
    } catch (e) {
        console.error(e);
        await dbResult.execAsync('ROLLBACK');
        return false;
    }
};

export interface TransactionDetail extends Transaction {
    user_name: string;
    items: {
        product_name: string;
        quantity: number;
        price: number;
    }[];
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
                user_id: 0, // Not needed for display
                total: row.total,
                created_at: row.created_at,
                user_name: row.user_name,
                items: []
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
