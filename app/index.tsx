import { View, Text, FlatList, TouchableOpacity, Modal, TextInput, Alert, StyleSheet, ScrollView } from 'react-native';
import { Link, useRouter, useFocusEffect } from 'expo-router';
import { useState, useCallback, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { User, Product, CartItem, getUsers, getProducts, getProductByBarcode, createTransaction } from '../db/queries';

export default function POSScreen() {
    const router = useRouter();
    const [permission, requestPermission] = useCameraPermissions();

    // Data State
    const [users, setUsers] = useState<User[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // UI State
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [availableToScan, setAvailableToScan] = useState(true);

    // Load Data
    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        const u = await getUsers();
        const p = await getProducts();
        setUsers(u);
        setProducts(p);
    };

    // Cart Logic
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };


    const updateQuantity = (productId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === productId) {
                const newQty = Math.max(0, item.quantity + delta);
                return { ...item, quantity: newQty };
            }
            return item;
        }).filter(item => item.quantity > 0));
    };

    const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Scanner Logic
    // Scanner Logic
    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        if (!availableToScan) return;
        setAvailableToScan(false);

        const product = await getProductByBarcode(data);
        if (product) {
            addToCart(product);
            Alert.alert(
                'Producto agregado',
                `${product.name} - $${product.price}`,
                [{ text: 'OK', onPress: () => setAvailableToScan(true) }]
            );
        } else {
            Alert.alert(
                'No encontrado',
                `No existe producto con código: ${data}`,
                [{ text: 'OK', onPress: () => setAvailableToScan(true) }]
            );
        }
    };

    // Checkout Logic
    const handleCheckout = async () => {
        if (!selectedUser) {
            Alert.alert('Error', 'Debe seleccionar un usuario');
            return;
        }
        if (cart.length === 0) {
            Alert.alert('Error', 'El carrito está vacío');
            return;
        }

        const success = await createTransaction(selectedUser.id, cartTotal, cart);
        if (success) {
            Alert.alert('Éxito', 'Compra registrada correctamente');
            setCart([]);
            setSelectedUser(null);
            setUserSearch('');
        } else {
            Alert.alert('Error', 'Hubo un problema al registrar la compra');
        }
    };

    // Filter Users
    const filteredUsers = users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()));

    return (
        <SafeAreaView className="flex-1 bg-gray-50">
            {/* TOP SECTION: Products & Search */}
            <View className="flex-[1.5] p-4 border-b border-gray-200">
                {/* Header */}
                <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-2xl font-bold text-gray-800">Tienda POS</Text>
                    <View className="flex-row gap-4">
                        <Link href="/history" asChild>
                            <TouchableOpacity><Text className="text-blue-600 font-medium">Historial</Text></TouchableOpacity>
                        </Link>
                        <Link href="/admin" asChild>
                            <TouchableOpacity><Text className="text-blue-600 font-medium">Admin</Text></TouchableOpacity>
                        </Link>
                    </View>
                </View>

                {/* User Selection */}
                <View className="mb-6 relative z-10">
                    <Text className="text-gray-500 mb-1 font-medium">Cliente</Text>
                    {selectedUser ? (
                        <View className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex-row justify-between items-center">
                            <Text className="font-bold text-blue-800 text-lg">{selectedUser.name}</Text>
                            <TouchableOpacity onPress={() => setSelectedUser(null)}>
                                <Ionicons name="close-circle" size={24} color="#1e40af" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View>
                            <TextInput
                                className="bg-gray-50 border border-gray-200 rounded-lg p-3"
                                placeholder="Buscar cliente..."
                                value={userSearch}
                                onChangeText={setUserSearch}
                            />
                            {userSearch.length > 0 && (
                                <View className="absolute top-12 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 z-50">
                                    <ScrollView keyboardShouldPersistTaps="handled">
                                        {filteredUsers.map(u => (
                                            <TouchableOpacity
                                                key={u.id}
                                                className="p-3 border-b border-gray-100 active:bg-blue-50"
                                                onPress={() => {
                                                    setSelectedUser(u);
                                                    setUserSearch('');
                                                }}
                                            >
                                                <Text className="font-medium text-gray-700">{u.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                        {filteredUsers.length === 0 && (
                                            <Text className="p-3 text-gray-400 text-center">No encontrado</Text>
                                        )}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    )}
                </View>

                {/* Scanner Button */}
                <TouchableOpacity
                    className="bg-purple-600 p-4 rounded-xl mb-4 flex-row justify-center items-center gap-2 shadow-sm"
                    onPress={() => {
                        if (!permission?.granted) requestPermission();
                        setIsScanning(true);
                    }}
                >
                    <Ionicons name="qr-code-outline" size={24} color="white" />
                    <Text className="text-white font-bold text-lg">Escanear Producto</Text>
                </TouchableOpacity>

                {/* Product Grid */}
                <Text className="text-lg font-bold text-gray-700 mb-2">Productos</Text>
                <FlatList
                    data={products}
                    numColumns={2}
                    keyExtractor={item => item.id.toString()}
                    columnWrapperStyle={{ gap: 10 }}
                    contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-gray-100 items-center"
                            onPress={() => addToCart(item)}
                        >
                            <View className="w-12 h-12 bg-gray-100 rounded-full mb-2 items-center justify-center">
                                <Text className="text-xl">🛒</Text>
                            </View>
                            <Text className="font-bold text-gray-800 text-center">{item.name}</Text>
                            <Text className="text-green-600 font-bold">₡{item.price.toFixed(2)}</Text>
                        </TouchableOpacity>
                    )}
                />
            </View>

            {/* BOTTOM SECTION: Cart */}
            <View className="flex-1 bg-white p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">



                {/* Cart Items */}
                <Text className="text-gray-500 mb-2 font-medium">Carrito ({cart.reduce((a, b) => a + b.quantity, 0)})</Text>
                <FlatList
                    data={cart}
                    keyExtractor={item => item.id.toString()}
                    className="flex-1 mb-4"
                    ListEmptyComponent={
                        <View className="flex-1 justify-center items-center mt-10">
                            <Ionicons name="cart-outline" size={48} color="#e5e7eb" />
                            <Text className="text-gray-400 mt-2">Carrito vacío</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <View className="flex-row justify-between items-center py-3 border-b border-gray-50">
                            <View className="flex-1">
                                <Text className="font-bold text-gray-800">{item.name}</Text>
                                <Text className="text-gray-500">₡{item.price.toFixed(2)} x {item.quantity}</Text>
                            </View>
                            <View className="flex-row items-center gap-2">
                                <TouchableOpacity onPress={() => updateQuantity(item.id, -1)}>
                                    <Ionicons name="remove-circle-outline" size={24} color="gray" />
                                </TouchableOpacity>
                                <Text className="font-bold w-4 text-center">{item.quantity}</Text>
                                <TouchableOpacity onPress={() => updateQuantity(item.id, 1)}>
                                    <Ionicons name="add-circle-outline" size={24} color="gray" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />

                {/* Totals & Checkout */}
                <View className="border-t border-gray-100 pt-4">
                    <View className="flex-row justify-between items-center mb-4">
                        <Text className="text-gray-500 text-lg">Total</Text>
                        <Text className="text-3xl font-bold text-gray-800">₡{cartTotal.toFixed(2)}</Text>
                    </View>

                    <TouchableOpacity
                        className={`p-4 rounded-xl shadow-sm ${selectedUser && cart.length > 0 ? 'bg-blue-600' : 'bg-gray-300'}`}
                        disabled={!selectedUser || cart.length === 0}
                        onPress={handleCheckout}
                    >
                        <Text className="text-white text-center font-bold text-xl">Cobrar</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Scanner Modal */}
            <Modal visible={isScanning} animationType="slide" presentationStyle="pageSheet">
                <View className="flex-1 bg-black">
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        onBarcodeScanned={handleBarCodeScanned}
                    />
                    <View className="absolute bottom-10 left-0 right-0 items-center">
                        <TouchableOpacity
                            className="bg-white px-6 py-3 rounded-full"
                            onPress={() => setIsScanning(false)}
                        >
                            <Text className="font-bold text-lg">Cerrar Escáner</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
