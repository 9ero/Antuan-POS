import { z } from 'zod';

export const UserSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1, "El nombre es requerido"),
    created_at: z.string().optional(),
});

export const ProductSchema = z.object({
    id: z.number().optional(),
    name: z.string().min(1, "El nombre del producto es requerido"),
    price: z.number().nonnegative("El precio no puede ser negativo"),
    barcode: z.string().optional(),
    stock: z.number().int().nonnegative("El stock no puede ser negativo").default(0),
    is_active: z.number().optional(),
    created_at: z.string().optional(),
});

export const CartItemSchema = ProductSchema.extend({
    quantity: z.number().int().positive("La cantidad debe ser mayor a 0"),
});

export const TransactionSchema = z.object({
    id: z.number().optional(),
    user_id: z.number(),
    total: z.number().nonnegative(),
    items: z.array(CartItemSchema),
    created_at: z.string().optional(),
});

export type User = z.infer<typeof UserSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
