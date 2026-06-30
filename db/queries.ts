import { dbResult } from './database';
import { User, Category, Product, CartItem, Transaction, TransactionSchema } from './schemas';

// SQLite CURRENT_TIMESTAMP stores UTC as 'YYYY-MM-DD HH:MM:SS' (space, no Z).
// JS/ISO strings use 'YYYY-MM-DDTHH:MM:SS.mmmZ'. Normalize to ISO for JS arithmetic.
const toISO = (s: string) => s.includes('T') ? s : s.replace(' ', 'T') + 'Z';

export { User, Category, Product, CartItem, Transaction };

// Users
export const getUsers = async (): Promise<User[]> => {
    return await dbResult.getAllAsync('SELECT * FROM users WHERE is_active = 1 ORDER BY name ASC');
};

export const addUser = async (name: string): Promise<number> => {
    const result = await dbResult.runAsync('INSERT INTO users (name) VALUES (?)', name);
    return result.lastInsertRowId as number;
};

// Soft delete: desactiva el usuario en vez de borrarlo, para no orfanar sus transacciones
// (el historial resuelve el nombre con JOIN users — un DELETE las haría desaparecer).
export const deleteUser = async (id: number): Promise<number> => {
    await dbResult.runAsync('UPDATE users SET is_active = 0 WHERE id = ?', id);
    return id;
};

export const updateUser = async (id: number, name: string): Promise<number> => {
    await dbResult.runAsync('UPDATE users SET name = ? WHERE id = ?', name, id);
    return id;
};

// Products
export const getProducts = async (): Promise<Product[]> => {
    return await dbResult.getAllAsync('SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC');
};

// Categories
export const getCategories = async (): Promise<Category[]> => {
    return await dbResult.getAllAsync('SELECT * FROM categories WHERE is_active = 1 ORDER BY name ASC');
};

// Todas las categorías (incl. inactivas) para el panel de administración
export const getAllCategories = async (): Promise<Category[]> => {
    return await dbResult.getAllAsync('SELECT * FROM categories ORDER BY is_active DESC, name ASC');
};

export const addCategory = async (name: string): Promise<number> => {
    const result = await dbResult.runAsync('INSERT INTO categories (name) VALUES (?)', name.trim());
    return result.lastInsertRowId as number;
};

export const updateCategory = async (id: number, name: string): Promise<number> => {
    await dbResult.runAsync('UPDATE categories SET name = ? WHERE id = ?', name.trim(), id);
    return id;
};

// Soft delete / reactivación — desactivar no afecta a los productos ya asignados
export const setCategoryActive = async (id: number, isActive: boolean): Promise<number> => {
    await dbResult.runAsync('UPDATE categories SET is_active = ? WHERE id = ?', isActive ? 1 : 0, id);
    return id;
};

export const addProduct = async (
    name: string, price: number, barcode: string = '', stock: number = 0,
    costPrice: number = 0, marginPercentage: number = 30, categoryId: number | null = null
): Promise<number> => {
    if (barcode) {
        const existing = await getProductByBarcode(barcode);
        if (existing) {
            if (existing.is_active === 0) {
                await dbResult.runAsync(
                    'UPDATE products SET name = ?, price = ?, stock = ?, cost_price = ?, margin_percentage = ?, category_id = ?, is_active = 1 WHERE id = ?',
                    name, price, stock, costPrice, marginPercentage, categoryId, existing.id!
                );
                return existing.id!;
            }
            throw new Error(`El código de barras "${barcode}" ya está registrado.`);
        }
    }
    const result = await dbResult.runAsync(
        'INSERT INTO products (name, price, barcode, stock, is_active, cost_price, margin_percentage, category_id) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        name, price, barcode, stock, costPrice, marginPercentage, categoryId
    );
    return result.lastInsertRowId as number;
};

export const updateProduct = async (
    id: number, name: string, price: number, barcode: string, stock: number,
    costPrice: number = 0, marginPercentage: number = 30, categoryId: number | null = null
): Promise<number> => {
    if (barcode) {
        const existing = await getProductByBarcode(barcode);
        if (existing && existing.id !== id) {
            throw new Error(`El código de barras "${barcode}" ya pertenece a otro producto.`);
        }
    }
    await dbResult.runAsync(
        'UPDATE products SET name = ?, price = ?, barcode = ?, stock = ?, cost_price = ?, margin_percentage = ?, category_id = ? WHERE id = ?',
        name, price, barcode, stock, costPrice, marginPercentage, categoryId, id
    );
    return id;
};

export const deleteProduct = async (id: number): Promise<number> => {
    await dbResult.runAsync('UPDATE products SET is_active = 0 WHERE id = ?', id);
    return id;
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

            await dbResult.runAsync('UPDATE products SET stock = stock - ? WHERE id = ?', item.quantity, item.id!);
            await dbResult.runAsync(
                'INSERT INTO stock_movements (product_id, quantity_change, reason) VALUES (?, ?, ?)',
                item.id!, -item.quantity, 'venta'
            );
        }

        await dbResult.execAsync('COMMIT');
        return { success: true, transactionId: transactionId as number };
    } catch (e) {
        console.error(e);
        await dbResult.execAsync('ROLLBACK');
        return { success: false, transactionId: null, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
}


// Stock Movements
export interface StockMovement {
    id: number;
    product_id: number;
    quantity_change: number;
    reason: string;
    created_at: string;
}

export const getStockMovements = async (productId: number): Promise<StockMovement[]> => {
    return await dbResult.getAllAsync<StockMovement>(
        'SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC LIMIT 30',
        productId
    );
};

export const addStock = async (productId: number, quantity: number, reason: 'recepcion' | 'ajuste' = 'recepcion') => {
    try {
        await dbResult.execAsync('BEGIN TRANSACTION');
        await dbResult.runAsync('UPDATE products SET stock = stock + ? WHERE id = ?', quantity, productId);
        const movResult = await dbResult.runAsync(
            'INSERT INTO stock_movements (product_id, quantity_change, reason) VALUES (?, ?, ?)',
            productId, quantity, reason
        );
        await dbResult.execAsync('COMMIT');
        return { success: true, movementId: movResult.lastInsertRowId as number };
    } catch (e) {
        await dbResult.execAsync('ROLLBACK');
        return { success: false, movementId: null, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
};

export const registerLoss = async (productId: number, quantity: number) => {
    try {
        await dbResult.execAsync('BEGIN TRANSACTION');
        const product = await dbResult.getFirstAsync<Product>('SELECT stock FROM products WHERE id = ?', productId);
        if (!product) throw new Error('Producto no encontrado');
        if (product.stock < quantity) throw new Error(`Stock insuficiente. Disponible: ${product.stock}`);
        await dbResult.runAsync('UPDATE products SET stock = stock - ? WHERE id = ?', quantity, productId);
        const movResult = await dbResult.runAsync(
            'INSERT INTO stock_movements (product_id, quantity_change, reason) VALUES (?, ?, ?)',
            productId, -quantity, 'extravio'
        );
        await dbResult.execAsync('COMMIT');
        return { success: true, movementId: movResult.lastInsertRowId as number };
    } catch (e) {
        await dbResult.execAsync('ROLLBACK');
        return { success: false, movementId: null, error: e instanceof Error ? e.message : 'Error desconocido' };
    }
};

// Checkout PINs
export interface CheckoutPin {
    id: number;
    pin: string;
    user_id: number;
    user_name?: string;
    created_at: string;
}

export const getPinsWithUsers = async (): Promise<CheckoutPin[]> => {
    return await dbResult.getAllAsync<CheckoutPin>(`
        SELECT cp.*, u.name as user_name
        FROM checkout_pins cp
        JOIN users u ON cp.user_id = u.id
        ORDER BY u.name ASC
    `);
};

export const getPinForUser = async (userId: number): Promise<CheckoutPin | null> => {
    return await dbResult.getFirstAsync<CheckoutPin>(
        'SELECT * FROM checkout_pins WHERE user_id = ?', userId
    );
};

export const createCheckoutPin = async (pin: string, userId: number) => {
    await dbResult.runAsync('DELETE FROM checkout_pins WHERE user_id = ?', userId);
    return await dbResult.runAsync(
        'INSERT INTO checkout_pins (pin, user_id) VALUES (?, ?)',
        pin.toUpperCase(), userId
    );
};

export const validatePin = async (pin: string, userId: number): Promise<boolean> => {
    const existing = await dbResult.getFirstAsync<CheckoutPin>(
        'SELECT * FROM checkout_pins WHERE pin = ? AND user_id = ?',
        pin.toUpperCase(), userId
    );
    return !!existing;
};

export const deleteCheckoutPin = async (userId: number) => {
    return await dbResult.runAsync('DELETE FROM checkout_pins WHERE user_id = ?', userId);
};

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
        user_id: number;
        total: number;
        created_at: string;
        user_name: string;
        product_name: string;
        quantity: number;
        price_at_purchase: number;
    }>(`
        SELECT
            t.id as transaction_id,
            t.user_id,
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
                user_id: row.user_id,
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

// Cash Closings
export interface CashClosing {
    id: number;
    opened_at: string;
    closed_at: string;
    total_sales: number;
    summary_json: string;
    created_at: string;
}

export interface ClosingUserSummary {
    userId: number | null;
    userName: string;
    transactionCount: number;
    total: number;
    products: Array<{ name: string; quantity: number; revenue: number }>;
}

export interface ClosingProductSummary {
    productId: number;
    name: string;
    unitsSold: number;
    unitsLost: number;
    revenue: number;
    cost: number;
    profit: number;
    currentStock: number;
    daysRemaining: number | null;
}

export interface ClosingSummary {
    openedAt: string;
    closedAt: string;
    transactionCount: number;
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    byUser: ClosingUserSummary[];
    byProduct: ClosingProductSummary[];
}

export const getCurrentPeriodStart = async (): Promise<string> => {
    const lastClosing = await dbResult.getFirstAsync<{ closed_at: string }>(
        'SELECT closed_at FROM cash_closings ORDER BY created_at DESC LIMIT 1'
    );
    if (lastClosing) return lastClosing.closed_at;

    const firstTx = await dbResult.getFirstAsync<{ created_at: string }>(
        'SELECT created_at FROM transactions ORDER BY created_at ASC LIMIT 1'
    );
    if (firstTx) return toISO(firstTx.created_at);

    return new Date().toISOString();
};

export const buildClosingSummary = async (openedAt: string, closedAt: string): Promise<ClosingSummary> => {
    const transactions = await dbResult.getAllAsync<{
        id: number; user_id: number | null; total: number; user_name: string | null;
    }>(
        `SELECT t.id, t.user_id, t.total, u.name as user_name
         FROM transactions t LEFT JOIN users u ON t.user_id = u.id
         WHERE datetime(t.created_at) >= datetime(?) AND datetime(t.created_at) < datetime(?)
         ORDER BY t.created_at`,
        openedAt, closedAt
    );

    if (transactions.length === 0) {
        return { openedAt, closedAt, transactionCount: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0, byUser: [], byProduct: [] };
    }

    const items = await dbResult.getAllAsync<{
        transaction_id: number; product_id: number; product_name: string;
        quantity: number; price_at_purchase: number; cost_price: number; current_stock: number;
    }>(
        `SELECT ti.transaction_id, ti.product_id, p.name as product_name,
                ti.quantity, ti.price_at_purchase,
                COALESCE(p.cost_price, 0) as cost_price,
                p.stock as current_stock
         FROM transaction_items ti
         JOIN products p ON ti.product_id = p.id
         JOIN transactions t ON ti.transaction_id = t.id
         WHERE datetime(t.created_at) >= datetime(?) AND datetime(t.created_at) < datetime(?)`,
        openedAt, closedAt
    );

    const periodDays = Math.max(
        (new Date(toISO(closedAt)).getTime() - new Date(toISO(openedAt)).getTime()) / 86400000,
        1
    );

    // Product aggregation (sales)
    const productMap = new Map<number, ClosingProductSummary>();
    for (const item of items) {
        const revenue = item.price_at_purchase * item.quantity;
        const cost = item.cost_price * item.quantity;
        const existing = productMap.get(item.product_id);
        if (existing) {
            existing.unitsSold += item.quantity;
            existing.revenue += revenue;
            existing.cost += cost;
            existing.profit += revenue - cost;
        } else {
            productMap.set(item.product_id, {
                productId: item.product_id,
                name: item.product_name,
                unitsSold: item.quantity,
                unitsLost: 0,
                revenue, cost,
                profit: revenue - cost,
                currentStock: item.current_stock,
                daysRemaining: null,
            });
        }
    }

    // Merge extravíos (include products with losses but no sales in this period)
    const losses = await dbResult.getAllAsync<{
        product_id: number; product_name: string; units_lost: number; current_stock: number;
    }>(
        `SELECT sm.product_id, p.name as product_name, p.stock as current_stock,
                SUM(ABS(sm.quantity_change)) as units_lost
         FROM stock_movements sm
         JOIN products p ON sm.product_id = p.id
         WHERE sm.reason = 'extravio'
           AND datetime(sm.created_at) >= datetime(?) AND datetime(sm.created_at) < datetime(?)
         GROUP BY sm.product_id`,
        openedAt, closedAt
    );
    for (const loss of losses) {
        const existing = productMap.get(loss.product_id);
        if (existing) {
            existing.unitsLost = loss.units_lost;
        } else {
            productMap.set(loss.product_id, {
                productId: loss.product_id,
                name: loss.product_name,
                unitsSold: 0,
                unitsLost: loss.units_lost,
                revenue: 0, cost: 0, profit: 0,
                currentStock: loss.current_stock,
                daysRemaining: null,
            });
        }
    }

    for (const p of productMap.values()) {
        const dailyRate = p.unitsSold / periodDays;
        p.daysRemaining = dailyRate > 0 ? Math.floor(p.currentStock / dailyRate) : null;
    }

    // Index items by transaction
    const txItemMap = new Map<number, typeof items[number][]>();
    for (const item of items) {
        const arr = txItemMap.get(item.transaction_id) ?? [];
        arr.push(item);
        txItemMap.set(item.transaction_id, arr);
    }

    // User aggregation
    const userMap = new Map<string, ClosingUserSummary>();
    const userProductMap = new Map<string, Map<string, { name: string; quantity: number; revenue: number }>>();

    for (const tx of transactions) {
        const key = tx.user_id === null ? 'anon' : String(tx.user_id);
        const existing = userMap.get(key);
        if (existing) {
            existing.transactionCount++;
            existing.total += tx.total;
        } else {
            userMap.set(key, {
                userId: tx.user_id,
                userName: tx.user_name ?? 'Sin usuario',
                transactionCount: 1,
                total: tx.total,
                products: [],
            });
            userProductMap.set(key, new Map());
        }
        const prodMap = userProductMap.get(key)!;
        for (const item of txItemMap.get(tx.id) ?? []) {
            const p = prodMap.get(item.product_name);
            if (p) {
                p.quantity += item.quantity;
                p.revenue += item.price_at_purchase * item.quantity;
            } else {
                prodMap.set(item.product_name, {
                    name: item.product_name,
                    quantity: item.quantity,
                    revenue: item.price_at_purchase * item.quantity,
                });
            }
        }
    }
    for (const [key, user] of userMap) {
        const pm = userProductMap.get(key);
        if (pm) user.products = Array.from(pm.values()).sort((a, b) => b.quantity - a.quantity);
    }

    const byProduct = Array.from(productMap.values()).sort((a, b) => b.unitsSold - a.unitsSold);
    const totalRevenue = byProduct.reduce((s, p) => s + p.revenue, 0);
    const totalCost = byProduct.reduce((s, p) => s + p.cost, 0);

    return {
        openedAt, closedAt,
        transactionCount: transactions.length,
        totalRevenue, totalCost,
        totalProfit: totalRevenue - totalCost,
        byUser: Array.from(userMap.values()).sort((a, b) => b.total - a.total),
        byProduct,
    };
};

export const createCashClosing = async (openedAt: string, closedAt: string, totalSales: number, summaryJson: string) => {
    await dbResult.runAsync(
        'INSERT INTO cash_closings (opened_at, closed_at, total_sales, summary_json) VALUES (?, ?, ?, ?)',
        openedAt, closedAt, totalSales, summaryJson
    );
};

export const getCashClosings = async (): Promise<CashClosing[]> => {
    return await dbResult.getAllAsync<CashClosing>(
        'SELECT * FROM cash_closings ORDER BY created_at DESC'
    );
};
