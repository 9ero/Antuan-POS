import { Modal, StyleSheet } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import {
    Box,
    Text,
    Button,
    ButtonText,
    ButtonIcon,
    Input,
    InputField,
    VStack,
    HStack,
    Pressable,
    Heading,
    Card,
    ScrollView,
    Divider,
    useToast,
    Toast,
    ToastTitle,
    ToastDescription,
    Icon,
    AddIcon,
    RemoveIcon
} from '@gluestack-ui/themed';

import { useCart } from '../hooks/useCart';
import { useProductSearch } from '../hooks/useProductSearch';
import { useScanner } from '../hooks/useScanner';
import { createTransaction } from '../db/queries';
import { User, Product } from '../db/schemas';

export default function POSScreen() {
    const router = useRouter();
    const toast = useToast();

    // Hooks
    const { cart, addToCart, updateQuantity, clearCart, cartTotal } = useCart();
    const { users, products, refresh } = useProductSearch();
    const { isScanning, startScanning, stopScanning } = useScanner();

    // UI State
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [userSearch, setUserSearch] = useState('');
    const [scannedProduct, setScannedProduct] = useState<Product | null>(null);

    // Scanner Handler
    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        // Prevent multiple scans of the same item instantly if modal is open
        if (scannedProduct) return;

        const product = products.find(p => p.barcode === data);
        if (product) {
            // Strict Stock Validation
            if (product.stock <= 0) {
                toast.show({
                    placement: "top",
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="error" variant="solid">
                            <VStack space="xs">
                                <ToastTitle>Stock Agotado</ToastTitle>
                                <ToastDescription>El producto {product.name} no tiene existencias.</ToastDescription>
                            </VStack>
                        </Toast>
                    )
                });
                return;
            }

            // Found and valid -> Show Confirmation
            setScannedProduct(product);

        } else {
            toast.show({
                placement: "top",
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="solid">
                        <VStack space="xs">
                            <ToastTitle>No encontrado</ToastTitle>
                            <ToastDescription>Código {data} no existe</ToastDescription>
                        </VStack>
                    </Toast>
                )
            });
        }
    };

    const confirmScannedProduct = () => {
        if (scannedProduct) {
            try {
                addToCart(scannedProduct);
                toast.show({
                    placement: "top",
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="success" variant="solid">
                            <VStack space="xs">
                                <ToastTitle>Producto Agregado</ToastTitle>
                                <ToastDescription>{scannedProduct.name}</ToastDescription>
                            </VStack>
                        </Toast>
                    )
                });
            } catch (e) {
                toast.show({
                    placement: "top",
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="error" variant="solid">
                            <VStack space="xs">
                                <ToastTitle>Error</ToastTitle>
                                <ToastDescription>{e instanceof Error ? e.message : 'Stock insuficiente'}</ToastDescription>
                            </VStack>
                        </Toast>
                    )
                });
            }
            // Keep camera open, just clear selection
            setScannedProduct(null);
        }
    };

    // Checkout Logic
    const handleCheckout = async () => {
        if (!selectedUser) {
            toast.show({
                placement: "top",
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="accent">
                        <ToastTitle>Seleccione Usuario</ToastTitle>
                    </Toast>
                )
            });
            return;
        }

        const result = await createTransaction(selectedUser.id!, cartTotal, cart);
        if (result.success) {
            toast.show({
                placement: "top",
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="success" variant="solid">
                        <ToastTitle>Venta Exitosa</ToastTitle>
                    </Toast>
                )
            });
            clearCart();
            setSelectedUser(null);
            setUserSearch('');
            refresh();
        } else {
            toast.show({
                placement: "top",
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="solid">
                        <ToastTitle>Error</ToastTitle>
                        <ToastDescription>{result.error}</ToastDescription>
                    </Toast>
                )
            });
        }
    };

    const filteredUsers = users.filter(u => u.name.toLowerCase().includes(userSearch.toLowerCase()));

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
            {/* Main Content - Vertical Layout */}
            <Box flex={1} flexDirection="column">

                {/* TOP: Products, Search, User */}
                <Box flex={2} p="$4">
                    {/* Header Links */}
                    <HStack justifyContent="space-between" mb="$4" alignItems="center">
                        <Heading size="xl" color="$purple600">POS System</Heading>
                        <HStack space="md">
                            <Link href="/history" asChild>
                                <Button variant="outline" size="sm">
                                    <ButtonText>Historial</ButtonText>
                                </Button>
                            </Link>
                            <Link href="/admin" asChild>
                                <Button variant="outline" size="sm">
                                    <ButtonText>Admin</ButtonText>
                                </Button>
                            </Link>
                        </HStack>
                    </HStack>

                    {/* User Select */}
                    <Box mb="$4" zIndex={10}>
                        {selectedUser ? (
                            <Card p="$3" variant="filled" className="bg-blue-50 border-blue-200">
                                <HStack justifyContent="space-between" alignItems="center">
                                    <VStack>
                                        <Text size="xs" color="$coolGray500">Cliente</Text>
                                        <Heading size="md" color="$blue800">{selectedUser.name}</Heading>
                                    </VStack>
                                    <Button variant="link" onPress={() => setSelectedUser(null)}>
                                        {/* @ts-ignore */}
                                        <ButtonIcon as={Ionicons} name="close-circle" size={24} color="#1e40af" />
                                    </Button>
                                </HStack>
                            </Card>
                        ) : (
                            <Box>
                                <Input>
                                    <InputField
                                        placeholder="Buscar cliente..."
                                        value={userSearch}
                                        onChangeText={setUserSearch}
                                    />
                                </Input>
                                {userSearch.length > 0 && (
                                    <Box position="absolute" top="$12" left={0} right={0} bg="$white" shadowColor="$black" shadowOffset={{ width: 0, height: 2 }} shadowOpacity={0.2} shadowRadius={4} elevation={5} borderRadius="$md" maxHeight={200} overflow="hidden" zIndex={20}>
                                        <ScrollView keyboardShouldPersistTaps="handled">
                                            {filteredUsers.map(u => (
                                                <Pressable key={u.id} p="$3" borderBottomWidth={1} borderColor="$coolGray100" $active-bg="$coolGray100" onPress={() => { setSelectedUser(u); setUserSearch(''); }}>
                                                    <Text>{u.name}</Text>
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>

                    {/* Scanner Button */}
                    <Button onPress={startScanning} mb="$4" bg="$purple600">
                        {/* @ts-ignore */}
                        <ButtonIcon as={Ionicons} name="qr-code-outline" mr="$2" />
                        <ButtonText>Escanear Producto</ButtonText>
                    </Button>

                    {/* Products Grid */}
                    <ScrollView flex={1}>
                        <Box flexDirection="row" flexWrap="wrap" gap="$3" pb="$4">
                            {products.map(product => (
                                <Pressable
                                    key={product.id}
                                    w="48%"
                                    disabled={product.stock <= 0}
                                    opacity={product.stock <= 0 ? 0.5 : 1}
                                    onPress={() => {
                                        try { addToCart(product); } catch (e) {
                                            alert(e instanceof Error ? e.message : 'Error');
                                        }
                                    }}
                                >
                                    <Card p="$3" variant="elevated">
                                        <VStack alignItems="center" space="xs">
                                            <Box w="$10" h="$10" bg={product.stock <= 0 ? '$coolGray200' : '$coolGray100'} borderRadius="$full" alignItems="center" justifyContent="center">
                                                <Text>{product.stock <= 0 ? '❌' : '🛒'}</Text>
                                            </Box>
                                            <Text fontWeight="bold" textAlign="center">{product.name}</Text>
                                            <Text color={product.stock <= 0 ? '$coolGray400' : '$green600'} fontWeight="bold">₡{product.price}</Text>
                                            <Text size="xs" color={product.stock <= 0 ? '$red500' : '$coolGray500'}>
                                                {product.stock <= 0 ? 'Sin Stock' : `Stock: ${product.stock}`}
                                            </Text>
                                        </VStack>
                                    </Card>
                                </Pressable>
                            ))}
                        </Box>
                    </ScrollView>
                </Box>

                {/* BOTTOM: Cart */}
                <Box flex={1} bg="$white" p="$4" borderTopWidth={1} borderColor="$coolGray200" shadowColor="$black" shadowOffset={{ width: 0, height: -2 }} shadowOpacity={0.1} shadowRadius={4} elevation={10}>
                    <Heading size="md" mb="$2">Carrito ({cart.reduce((a, b) => a + b.quantity, 0)})</Heading>

                    <ScrollView flex={1}>
                        <VStack space="sm">
                            {cart.map(item => (
                                <HStack key={item.id} justifyContent="space-between" alignItems="center" p="$2" borderBottomWidth={1} borderColor="$coolGray100">
                                    <VStack flex={1}>
                                        <Text fontWeight="bold">{item.name}</Text>
                                        <Text size="sm" color="$coolGray500">₡{item.price} x {item.quantity}</Text>
                                    </VStack>
                                    <HStack alignItems="center" space="sm">
                                        <Pressable onPress={() => updateQuantity(item.id!, -1)}>
                                            <Icon as={RemoveIcon} color="$coolGray500" />
                                        </Pressable>
                                        <Text fontWeight="bold">{item.quantity}</Text>
                                        <Pressable onPress={() => updateQuantity(item.id!, 1)}>
                                            <Icon as={AddIcon} color="$coolGray500" />
                                        </Pressable>
                                    </HStack>
                                </HStack>
                            ))}
                        </VStack>
                    </ScrollView>

                    <Divider my="$2" />

                    <HStack justifyContent="space-between" mb="$2" alignItems="center">
                        <Text size="lg" color="$coolGray500">Total</Text>
                        <Heading size="2xl">₡{cartTotal}</Heading>
                    </HStack>

                    <Button
                        size="xl"
                        isDisabled={!selectedUser || cart.length === 0}
                        bg={!selectedUser || cart.length === 0 ? '$coolGray300' : '$green600'}
                        onPress={handleCheckout}
                    >
                        <ButtonText>Cobrar</ButtonText>
                    </Button>
                </Box>
            </Box>

            {/* Camera Modal */}
            <Modal visible={isScanning} animationType="slide" presentationStyle="pageSheet">
                <Box flex={1} bg="$black">
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        onBarcodeScanned={handleBarCodeScanned}
                    />
                    <Box position="absolute" bottom={40} left={0} right={0} alignItems="center">
                        <Button onPress={stopScanning} variant="solid" bg="$white">
                            <ButtonText color="$black">Cerrar Escáner</ButtonText>
                        </Button>
                    </Box>

                    {/* Confirmation Overlay */}
                    {scannedProduct && (
                        <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" bg="rgba(0,0,0,0.7)">
                            <Card p="$5" w="90%" variant="elevated">
                                <VStack space="md" alignItems="center">
                                    <Heading size="lg" textAlign="center">{scannedProduct.name}</Heading>
                                    <Text size="xl" color="$green600" fontWeight="bold">₡{scannedProduct.price}</Text>
                                    <Text color="$coolGray500">Stock: {scannedProduct.stock}</Text>

                                    <HStack space="md" mt="$4" w="100%" justifyContent="center">
                                        <Button onPress={() => setScannedProduct(null)} variant="outline" action="secondary" flex={1}>
                                            <ButtonText>Cancelar</ButtonText>
                                        </Button>
                                        <Button onPress={confirmScannedProduct} bg="$green600" flex={1}>
                                            <ButtonText>Agregar</ButtonText>
                                        </Button>
                                    </HStack>
                                </VStack>
                            </Card>
                        </Box>
                    )}
                </Box>
            </Modal>
        </SafeAreaView>
    );
}
