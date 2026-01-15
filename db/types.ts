export interface User {
    id: number;
    name: string;
    created_at: string;
}

export interface Product {
    id: number;
    name: string;
    price: number;
    barcode?: string;
    created_at: string;
}

export interface Transaction {
    id: number;
    user_id: number;
    total: number;
    created_at: string;
}

export interface CartItem extends Product {
    quantity: number;
}
