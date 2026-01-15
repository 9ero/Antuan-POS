import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import { Product, getProducts, addProduct, deleteProduct } from '../../../db/queries';
import { Ionicons } from '@expo/vector-icons';

export default function ProductsAdmin() {
    const [products, setProducts] = useState<Product[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: '', price: '', barcode: '' });

    const loadProducts = async () => {
        const data = await getProducts();
        setProducts(data);
    };

    useEffect(() => {
        loadProducts();
    }, []);

    const handleAdd = async () => {
        if (!newProduct.name || !newProduct.price) {
            Alert.alert('Error', 'Nombre y Precio son requeridos');
            return;
        }
        await addProduct(newProduct.name, parseFloat(newProduct.price), newProduct.barcode);
        setModalVisible(false);
        setNewProduct({ name: '', price: '', barcode: '' });
        loadProducts();
    };

    const handleDelete = async (id: number) => {
        Alert.alert('Confirmar', '¿Eliminar producto?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar', style: 'destructive', onPress: async () => {
                    await deleteProduct(id);
                    loadProducts();
                }
            }
        ]);
    };

    return (
        <View className="flex-1 bg-gray-50">
            <Stack.Screen options={{ title: 'Gestionar Productos', headerShown: true }} />

            <FlatList
                data={products}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ padding: 16 }}
                renderItem={({ item }) => (
                    <View className="bg-white p-4 rounded-lg mb-3 shadow-sm flex-row justify-between items-center">
                        <View>
                            <Text className="font-bold text-lg">{item.name}</Text>
                            <Text className="text-gray-500">₡{item.price.toFixed(2)}</Text>
                            {item.barcode ? <Text className="text-xs text-gray-400">{item.barcode}</Text> : null}
                        </View>
                        <TouchableOpacity onPress={() => handleDelete(item.id)}>
                            <Ionicons name="trash-outline" size={24} color="red" />
                        </TouchableOpacity>
                    </View>
                )}
            />

            <TouchableOpacity
                className="absolute bottom-8 right-8 bg-blue-600 w-14 h-14 rounded-full justify-center items-center shadow-lg"
                onPress={() => setModalVisible(true)}
            >
                <Ionicons name="add" size={30} color="white" />
            </TouchableOpacity>

            <Modal visible={modalVisible} animationType="slide" transparent>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-3xl p-6">
                        <Text className="text-xl font-bold mb-4">Nuevo Producto</Text>

                        <TextInput
                            placeholder="Nombre"
                            className="border-b border-gray-300 p-3 mb-4 text-lg"
                            value={newProduct.name}
                            onChangeText={(t) => setNewProduct({ ...newProduct, name: t })}
                        />

                        <TextInput
                            placeholder="Precio"
                            className="border-b border-gray-300 p-3 mb-4 text-lg"
                            keyboardType="numeric"
                            value={newProduct.price}
                            onChangeText={(t) => setNewProduct({ ...newProduct, price: t })}
                        />

                        <TextInput
                            placeholder="Código de Barras (Opcional)"
                            className="border-b border-gray-300 p-3 mb-8 text-lg"
                            value={newProduct.barcode}
                            onChangeText={(t) => setNewProduct({ ...newProduct, barcode: t })}
                        />

                        <TouchableOpacity className="bg-blue-600 p-4 rounded-xl mb-3" onPress={handleAdd}>
                            <Text className="text-white text-center font-bold text-lg">Guardar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                            <Text className="text-blue-600 text-center p-2">Cancelar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
