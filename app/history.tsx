import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { getTransactions } from '../db/queries';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface TransactionHistoryItem {
    id: number;
    total: number;
    created_at: string;
    user_name: string;
    items: {
        product_name: string;
        quantity: number;
        price: number;
    }[];
}

export default function HistoryScreen() {
    const [transactions, setTransactions] = useState<TransactionHistoryItem[]>([]);
    const router = useRouter();

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [])
    );

    const loadHistory = async () => {
        const data = await getTransactions();
        // The query returns the correct structure now, matching our interface compatible way
        setTransactions(data as unknown as TransactionHistoryItem[]);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    return (
        <View className="flex-1 bg-gray-50">
            <View className="bg-white p-4 border-b border-gray-200 flex-row items-center justify-center relative">
                <Text className="text-xl font-bold">Historial de Ventas</Text>
                <TouchableOpacity
                    className="absolute right-4"
                    onPress={() => router.back()}
                >
                    <Text className="text-blue-600 font-bold">Cerrar</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={transactions}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                    <View className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100">
                        <View className="flex-row justify-between items-center mb-2">
                            <Text className="font-bold text-lg text-gray-800">{item.user_name || 'Cliente desconocido'}</Text>
                            <Text className="text-green-600 font-bold text-xl">₡{item.total.toFixed(2)}</Text>
                        </View>

                        <View className="border-t border-gray-100 my-2 pt-2">
                            {item.items.map((prod, index) => (
                                <Text key={index} className="text-gray-600 text-base">
                                    {prod.product_name} x{prod.quantity} - ₡{(prod.price * prod.quantity).toFixed(2)}
                                </Text>
                            ))}
                        </View>

                        <View className="flex-row justify-between items-center mt-2">
                            <Text className="text-gray-400 text-sm">{formatDate(item.created_at)}</Text>
                            <Text className="text-gray-400 text-sm">ID: #{item.id}</Text>
                        </View>
                    </View>
                )}
                ListEmptyComponent={
                    <View className="items-center mt-20">
                        <Text className="text-gray-400">No hay ventas registradas</Text>
                    </View>
                }
            />
        </View>
    );
}
