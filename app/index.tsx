import { Modal, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useState, useMemo } from 'react';
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
    RemoveIcon,
} from '@gluestack-ui/themed';

import { useCart } from '@/hooks/useCart';
import { useProductSearch } from '@/hooks/useProductSearch';
import { useScanner } from '@/hooks/useScanner';
import { createTransaction, validatePin, getPinForUser } from '@/db/queries';
import { User, Product } from '@/db/schemas';
import { isConfigured } from '@/db/turso';
import { getDeviceConfig, pushTransactionToTurso } from '@/db/sync';

// Filtros del POS. ALL = sin filtro (todos los productos, comportamiento original).
// ARTESANAL = categoría derivada: productos sin código de barras (no se pueden escanear).
const ALL = '__all__';
const ARTESANAL = '__artesanal__';
type Filter = typeof ALL | typeof ARTESANAL | number;

export default function POSScreen() {
    const toast = useToast();

    const { cart, addToCart, updateQuantity, clearCart, cartTotal } = useCart();
    const { users, products, categories, refresh } = useProductSearch();
    const { isScanning, startScanning, stopScanning } = useScanner();

    const [scannedProduct, setScannedProduct] = useState<Product | null>(null);

    // Navegación por categorías. Por defecto sin filtro: muestra todos los productos.
    const [activeFilter, setActiveFilter] = useState<Filter>(ALL);
    const [showCategoryPanel, setShowCategoryPanel] = useState(false);

    const isArtesanal = (p: Product) => !p.barcode || p.barcode.trim() === '';

    // Productos visibles en la grilla según el filtro activo
    const visibleProducts = useMemo(() => {
        if (activeFilter === ALL) return products;
        if (activeFilter === ARTESANAL) return products.filter(isArtesanal);
        return products.filter(p => p.category_id === activeFilter);
    }, [products, activeFilter]);

    const activeCategoryName = typeof activeFilter === 'number'
        ? (categories.find(c => c.id === activeFilter)?.name ?? '')
        : '';

    // Checkout modal state
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [modalUser, setModalUser] = useState<User | null>(null);
    const [modalUserSearch, setModalUserSearch] = useState('');
    const [checkoutPin, setCheckoutPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const normalize = (s: string) =>
        s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    const filteredModalUsers = users.filter(u =>
        normalize(u.name).includes(normalize(modalUserSearch))
    );

    // Scanner
    const handleBarCodeScanned = async ({ data }: { data: string }) => {
        if (scannedProduct) return;
        const product = products.find(p => p.barcode === data);
        if (product) {
            if (product.stock <= 0) {
                toast.show({
                    placement: 'top',
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="error" variant="solid">
                            <VStack space="xs">
                                <ToastTitle>Stock Agotado</ToastTitle>
                                <ToastDescription>{product.name} no tiene existencias.</ToastDescription>
                            </VStack>
                        </Toast>
                    ),
                });
                return;
            }
            setScannedProduct(product);
        } else {
            toast.show({
                placement: 'top',
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="solid">
                        <VStack space="xs">
                            <ToastTitle>No encontrado</ToastTitle>
                            <ToastDescription>Código {data} no existe</ToastDescription>
                        </VStack>
                    </Toast>
                ),
            });
        }
    };

    const confirmScannedProduct = () => {
        if (!scannedProduct) return;
        try {
            addToCart(scannedProduct);
            toast.show({
                placement: 'top',
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="success" variant="solid">
                        <VStack space="xs">
                            <ToastTitle>Agregado</ToastTitle>
                            <ToastDescription>{scannedProduct.name}</ToastDescription>
                        </VStack>
                    </Toast>
                ),
            });
        } catch (e) {
            toast.show({
                placement: 'top',
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="solid">
                        <VStack space="xs">
                            <ToastTitle>Error</ToastTitle>
                            <ToastDescription>{e instanceof Error ? e.message : 'Stock insuficiente'}</ToastDescription>
                        </VStack>
                    </Toast>
                ),
            });
        }
        setScannedProduct(null);
    };

    // Checkout
    const openCheckoutModal = () => {
        setModalUser(null);
        setModalUserSearch('');
        setCheckoutPin('');
        setPinError('');
        setShowCheckoutModal(true);
    };

    const handleConfirm = async () => {
        if (!modalUser) {
            setPinError('Selecciona un cliente');
            return;
        }
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const valid = await validatePin(checkoutPin, modalUser.id!);
            if (!valid) {
                const hasPin = await getPinForUser(modalUser.id!);
                setPinError(
                    hasPin
                        ? 'PIN incorrecto'
                        : `${modalUser.name} no tiene PIN. Generalo desde Admin → Usuarios.`
                );
                return;
            }
            setShowCheckoutModal(false);
            const result = await createTransaction(modalUser.id!, cartTotal, cart);
            if (result.success && result.transactionId) {
                if (isConfigured) {
                    getDeviceConfig().then(cfg => {
                        if (cfg) pushTransactionToTurso(cfg.deviceId, result.transactionId!).catch(() => {});
                    });
                }
            }
            if (result.success) {
                toast.show({
                    placement: 'top',
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="success" variant="solid">
                            <ToastTitle>¡Venta Exitosa!</ToastTitle>
                        </Toast>
                    ),
                });
                clearCart();
                refresh();
            } else {
                toast.show({
                    placement: 'top',
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="error" variant="solid">
                            <ToastTitle>Error</ToastTitle>
                            <ToastDescription>{result.error}</ToastDescription>
                        </Toast>
                    ),
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
            <Box flex={1} flexDirection="column">

                {/* TOP: Products */}
                <Box flex={2} p="$4">
                    <HStack justifyContent="space-between" mb="$4" alignItems="center">
                        <Heading size="xl" color="$purple600">Antuan POS</Heading>
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

                    <Button onPress={startScanning} mb="$4" bg="$purple600">
                        {/* @ts-ignore */}
                        <ButtonIcon as={Ionicons} name="qr-code-outline" mr="$2" />
                        <ButtonText>Escanear Producto</ButtonText>
                    </Button>

                    {/* Navegación por categorías (sin filtro por defecto = Todos) */}
                    <VStack space="xs" mb="$3">
                        <Text size="sm" fontWeight="$semibold" color="$coolGray500">Categorías</Text>
                        <HStack space="sm" alignItems="center" flexWrap="wrap">
                            <Pressable
                                onPress={() => setActiveFilter(ALL)}
                                bg={activeFilter === ALL ? '$blue600' : '$coolGray100'}
                                borderRadius="$full" px="$4" py="$2"
                            >
                                <Text fontWeight="$semibold" color={activeFilter === ALL ? '$white' : '$coolGray700'}>
                                    Todos
                                </Text>
                            </Pressable>

                            <Pressable
                                onPress={() => setActiveFilter(ARTESANAL)}
                                bg={activeFilter === ARTESANAL ? '$blue600' : '$coolGray100'}
                                borderRadius="$full" px="$4" py="$2"
                            >
                                <Text fontWeight="$semibold" color={activeFilter === ARTESANAL ? '$white' : '$coolGray700'}>
                                    Artesanales
                                </Text>
                            </Pressable>

                            {typeof activeFilter === 'number' && (
                                <Box bg="$blue600" borderRadius="$full" px="$4" py="$2">
                                    <Text fontWeight="$semibold" color="$white">{activeCategoryName}</Text>
                                </Box>
                            )}

                            {categories.length > 0 && (
                                <Pressable
                                    onPress={() => setShowCategoryPanel(true)}
                                    borderWidth={1} borderColor="$coolGray300" borderRadius="$full" px="$4" py="$2"
                                >
                                    <Text color="$coolGray700">Mostrar más ▸</Text>
                                </Pressable>
                            )}
                        </HStack>
                    </VStack>

                    <ScrollView flex={1}>
                        <Box flexDirection="row" flexWrap="wrap" gap="$3" pb="$4">
                            {visibleProducts.length === 0 && (
                                <Box w="100%" alignItems="center" py="$8">
                                    <Text color="$coolGray400">
                                        {activeFilter === ALL
                                            ? 'No hay productos'
                                            : activeFilter === ARTESANAL
                                                ? 'No hay productos artesanales'
                                                : `Sin productos en "${activeCategoryName}"`}
                                    </Text>
                                </Box>
                            )}
                            {visibleProducts.map(product => {
                                const outOfStock = product.stock <= 0;
                                const lowStock = product.stock > 0 && product.stock <= 5;
                                return (
                                    <Pressable
                                        key={product.id}
                                        w="48%"
                                        disabled={outOfStock}
                                        opacity={outOfStock ? 0.5 : 1}
                                        onPress={() => {
                                            try { addToCart(product); }
                                            catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
                                        }}
                                    >
                                        <Card p="$3" variant="elevated">
                                            <VStack alignItems="center" space="xs">
                                                <Box
                                                    w="$10" h="$10"
                                                    bg={outOfStock ? '$coolGray200' : lowStock ? '$orange100' : '$coolGray100'}
                                                    borderRadius="$full"
                                                    alignItems="center"
                                                    justifyContent="center"
                                                >
                                                    <Text>{outOfStock ? '❌' : lowStock ? '⚠️' : '🛒'}</Text>
                                                </Box>
                                                <Text fontWeight="bold" textAlign="center">{product.name}</Text>
                                                <Text
                                                    color={outOfStock ? '$coolGray400' : '$green600'}
                                                    fontWeight="bold"
                                                >
                                                    ₡{product.price}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    color={outOfStock ? '$red500' : lowStock ? '$orange500' : '$coolGray500'}
                                                    fontWeight={lowStock ? '$semibold' : '$normal'}
                                                >
                                                    {outOfStock ? 'Sin Stock' : `Stock: ${product.stock}`}
                                                </Text>
                                            </VStack>
                                        </Card>
                                    </Pressable>
                                );
                            })}
                        </Box>
                    </ScrollView>
                </Box>

                {/* BOTTOM: Cart */}
                <Box
                    flex={1} bg="$white" p="$4"
                    borderTopWidth={1} borderColor="$coolGray200"
                    shadowColor="$black" shadowOffset={{ width: 0, height: -2 }}
                    shadowOpacity={0.1} shadowRadius={4} elevation={10}
                >
                    <Heading size="md" mb="$2">
                        Carrito ({cart.reduce((a, b) => a + b.quantity, 0)})
                    </Heading>

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
                        isDisabled={cart.length === 0}
                        bg={cart.length === 0 ? '$coolGray300' : '$green600'}
                        onPress={openCheckoutModal}
                    >
                        <ButtonText>Cobrar</ButtonText>
                    </Button>
                </Box>
            </Box>

            {/* Checkout Modal: user selector + PIN */}
            <Modal visible={showCheckoutModal} animationType="slide" transparent>
                <Box flex={1} justifyContent="flex-end" bg="rgba(0,0,0,0.5)">
                    <Box bg="$white" borderTopLeftRadius="$3xl" borderTopRightRadius="$3xl" p="$6" maxHeight="85%">
                        <Heading size="lg" mb="$1">Confirmar Compra</Heading>
                        <Text color="$coolGray500" mb="$4">
                            Total: <Text fontWeight="$bold" color="$green700" size="lg">₡{cartTotal}</Text>
                        </Text>

                        {/* User selector */}
                        <Text size="sm" fontWeight="$semibold" mb="$2">¿Quién eres?</Text>
                        {modalUser ? (
                            <HStack
                                bg="$blue50" borderRadius="$lg" borderWidth={1} borderColor="$blue200"
                                px="$3" py="$2" mb="$4" justifyContent="space-between" alignItems="center"
                            >
                                <Text fontWeight="$bold" color="$blue800">{modalUser.name}</Text>
                                <Pressable onPress={() => { setModalUser(null); setModalUserSearch(''); setPinError(''); }}>
                                    <Text color="$blue500" size="sm">Cambiar</Text>
                                </Pressable>
                            </HStack>
                        ) : (
                            <Box mb="$4">
                                <Input mb="$2">
                                    <InputField
                                        placeholder="Escribe 3 letras para buscar..."
                                        value={modalUserSearch}
                                        onChangeText={setModalUserSearch}
                                    />
                                </Input>
                                {modalUserSearch.length >= 3 && (
                                    <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                                        {filteredModalUsers.length > 0 ? filteredModalUsers.map(u => (
                                            <Pressable
                                                key={u.id}
                                                py="$2" px="$1"
                                                borderBottomWidth={1} borderColor="$coolGray100"
                                                onPress={() => { setModalUser(u); setModalUserSearch(''); setPinError(''); }}
                                            >
                                                <Text>{u.name}</Text>
                                            </Pressable>
                                        )) : (
                                            <Text size="sm" color="$coolGray400" px="$1">Sin resultados</Text>
                                        )}
                                    </ScrollView>
                                )}
                            </Box>
                        )}

                        {/* PIN input */}
                        <Text size="sm" fontWeight="$semibold" mb="$2">Tu PIN de 4 caracteres</Text>
                        <Input size="xl" mb="$1">
                            <InputField
                                value={checkoutPin}
                                onChangeText={t => { setCheckoutPin(t.toUpperCase()); setPinError(''); }}
                                maxLength={4}
                                autoCapitalize="characters"
                                textAlign="center"
                                placeholder="· · · ·"
                            />
                        </Input>
                        {pinError ? (
                            <Text size="sm" color="$red500" mb="$3">{pinError}</Text>
                        ) : (
                            <Box mb="$3" />
                        )}

                        <Button
                            size="lg"
                            bg="$green600"
                            isDisabled={!modalUser || checkoutPin.length !== 4 || isSubmitting}
                            onPress={handleConfirm}
                            mb="$2"
                        >
                            <ButtonText>{isSubmitting ? 'Procesando...' : 'Confirmar compra'}</ButtonText>
                        </Button>
                        <Button variant="link" onPress={() => setShowCheckoutModal(false)}>
                            <ButtonText color="$coolGray400">Cancelar</ButtonText>
                        </Button>
                    </Box>
                </Box>
            </Modal>

            {/* Panel lateral de categorías */}
            <Modal visible={showCategoryPanel} animationType="fade" transparent onRequestClose={() => setShowCategoryPanel(false)}>
                <HStack flex={1}>
                    <Box
                        w="78%" bg="$white" h="100%" p="$5"
                        shadowColor="$black" shadowOffset={{ width: 2, height: 0 }}
                        shadowOpacity={0.2} shadowRadius={6} elevation={12}
                    >
                        <Heading size="lg" mb="$4">Categorías</Heading>
                        <ScrollView>
                            <VStack space="sm">
                                <Pressable
                                    onPress={() => { setActiveFilter(ALL); setShowCategoryPanel(false); }}
                                    bg={activeFilter === ALL ? '$blue50' : '$coolGray50'}
                                    borderWidth={1} borderColor={activeFilter === ALL ? '$blue300' : '$coolGray200'}
                                    borderRadius="$lg" px="$4" py="$3"
                                >
                                    <HStack justifyContent="space-between" alignItems="center">
                                        <Text fontWeight="$bold" color="$coolGray800">Todos</Text>
                                        <Text size="sm" color="$coolGray500">{products.length}</Text>
                                    </HStack>
                                </Pressable>

                                <Pressable
                                    onPress={() => { setActiveFilter(ARTESANAL); setShowCategoryPanel(false); }}
                                    bg={activeFilter === ARTESANAL ? '$blue50' : '$coolGray50'}
                                    borderWidth={1} borderColor={activeFilter === ARTESANAL ? '$blue300' : '$coolGray200'}
                                    borderRadius="$lg" px="$4" py="$3"
                                >
                                    <HStack justifyContent="space-between" alignItems="center">
                                        <VStack>
                                            <Text fontWeight="$bold" color="$coolGray800">Artesanales</Text>
                                            <Text size="xs" color="$coolGray500">Sin código de barras</Text>
                                        </VStack>
                                        <Text size="sm" color="$coolGray500">{products.filter(isArtesanal).length}</Text>
                                    </HStack>
                                </Pressable>

                                {categories.map(cat => {
                                    const count = products.filter(p => p.category_id === cat.id).length;
                                    const active = activeFilter === cat.id;
                                    return (
                                        <Pressable
                                            key={cat.id}
                                            onPress={() => { setActiveFilter(cat.id!); setShowCategoryPanel(false); }}
                                            bg={active ? '$blue50' : '$coolGray50'}
                                            borderWidth={1} borderColor={active ? '$blue300' : '$coolGray200'}
                                            borderRadius="$lg" px="$4" py="$3"
                                        >
                                            <HStack justifyContent="space-between" alignItems="center">
                                                <Text fontWeight="$semibold" color="$coolGray800">{cat.name}</Text>
                                                <Text size="sm" color="$coolGray500">{count}</Text>
                                            </HStack>
                                        </Pressable>
                                    );
                                })}
                            </VStack>
                        </ScrollView>
                    </Box>
                    <Pressable flex={1} bg="rgba(0,0,0,0.5)" onPress={() => setShowCategoryPanel(false)} />
                </HStack>
            </Modal>

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
