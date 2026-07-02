import { Modal, StyleSheet, LayoutAnimation, KeyboardAvoidingView } from 'react-native';
import { Link } from 'expo-router';
import { useState, useMemo, useEffect, useRef } from 'react';
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

    const animateLayout = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    // Carrito: comprimido del todo con 0 ítems (solo barra + total + Cobrar),
    // tamaño normal con 1+, y tap en "Carrito" lo escala a media pantalla y vuelve
    const cartEmpty = cart.length === 0;
    const [cartExpanded, setCartExpanded] = useState(false);
    const toggleCart = () => {
        if (cartEmpty) return;
        animateLayout();
        setCartExpanded(v => !v);
    };
    useEffect(() => {
        if (cartEmpty) setCartExpanded(false);
    }, [cartEmpty]);

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

    // Chips de filtro: Artesanales + categorías activas. Solo se muestran las que tienen productos.
    const filterChips = useMemo(() => {
        const chips: { key: Filter; label: string; count: number }[] = [];
        const artesanalCount = products.filter(isArtesanal).length;
        if (artesanalCount > 0) chips.push({ key: ARTESANAL, label: 'Artesanales', count: artesanalCount });
        categories.forEach(cat => {
            const count = products.filter(p => p.category_id === cat.id).length;
            if (count > 0) chips.push({ key: cat.id!, label: cat.name, count });
        });
        return chips;
    }, [products, categories]);

    // Checkout modal state
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [modalUser, setModalUser] = useState<User | null>(null);
    const [modalUserSearch, setModalUserSearch] = useState('');
    const [checkoutPin, setCheckoutPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Aviso de venta exitosa: tarjeta centrada que desaparece sola (reemplaza al toast superior)
    const [saleSuccess, setSaleSuccess] = useState<number | null>(null);
    const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showSaleSuccess = (total: number) => {
        if (successTimer.current) clearTimeout(successTimer.current);
        setSaleSuccess(total);
        successTimer.current = setTimeout(() => setSaleSuccess(null), 2000);
    };

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
            animateLayout();
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
                showSaleSuccess(cartTotal);
                animateLayout();
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
                <Box flex={cartEmpty || cartExpanded ? 1 : 2} p="$4">
                    <HStack justifyContent="space-between" mb="$4" alignItems="center">
                        <Heading size="xl" color="$blue600">Antuan POS</Heading>
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

                    {/* Filtros por categoría: una sola fila con scroll horizontal.
                        Tap filtra; tap en el chip activo lo desactiva y vuelve a mostrar todo. */}
                    {filterChips.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} mb="$3">
                            <HStack space="sm" alignItems="center">
                                {filterChips.map(chip => {
                                    const active = activeFilter === chip.key;
                                    return (
                                        <Pressable
                                            key={String(chip.key)}
                                            onPress={() => setActiveFilter(active ? ALL : chip.key)}
                                            bg={active ? '$blue600' : '$coolGray100'}
                                            borderRadius="$full" px="$4" py="$2"
                                        >
                                            <HStack space="xs" alignItems="center">
                                                <Text fontWeight="$semibold" color={active ? '$white' : '$coolGray700'}>
                                                    {chip.label}
                                                </Text>
                                                <Text size="xs" color={active ? '$blue200' : '$coolGray400'}>
                                                    {chip.count}
                                                </Text>
                                                {/* ✕ = "tocá para quitar el filtro" */}
                                                {active && <Ionicons name="close" size={13} color="white" />}
                                            </HStack>
                                        </Pressable>
                                    );
                                })}
                            </HStack>
                        </ScrollView>
                    )}

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
                                            try { animateLayout(); addToCart(product); }
                                            catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
                                        }}
                                    >
                                        <Card p="$3" variant="elevated">
                                            <VStack alignItems="center" space="xs">
                                                <Box
                                                    w="$10" h="$10"
                                                    bg={outOfStock ? '$coolGray200' : lowStock ? '$amber100' : '$coolGray100'}
                                                    borderRadius="$full"
                                                    alignItems="center"
                                                    justifyContent="center"
                                                >
                                                    <Text>{outOfStock ? '❌' : lowStock ? '⚠️' : '🛒'}</Text>
                                                </Box>
                                                <Text fontWeight="bold" textAlign="center">{product.name}</Text>
                                                <Text
                                                    color={outOfStock ? '$coolGray400' : '$emerald600'}
                                                    fontWeight="bold"
                                                >
                                                    ₡{product.price}
                                                </Text>
                                                <Text
                                                    size="xs"
                                                    color={outOfStock ? '$red500' : lowStock ? '$amber500' : '$coolGray500'}
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

                {/* BOTTOM: Cart — flex 0 (alto de contenido) con carrito vacío */}
                <Box
                    flex={cartEmpty ? 0 : 1} bg="$white" p="$4"
                    borderTopWidth={1} borderColor="$coolGray200"
                    shadowColor="$black" shadowOffset={{ width: 0, height: -2 }}
                    shadowOpacity={0.1} shadowRadius={4} elevation={10}
                >
                    {/* Botón Escanear flotante, centrado justo sobre el borde del carrito */}
                    <Box
                        position="absolute" top={0} left={0} right={0}
                        alignItems="center" zIndex={20}
                        pointerEvents="box-none"
                        style={{ transform: [{ translateY: -42 }] }}
                    >
                        <Button
                            onPress={startScanning}
                            bg="$blue600" px="$8" borderRadius="$lg"
                            shadowColor="$black" shadowOffset={{ width: 0, height: 2 }}
                            shadowOpacity={0.25} shadowRadius={5} elevation={6}
                        >
                            {/* @ts-ignore */}
                            <ButtonIcon as={Ionicons} name="qr-code-outline" mr="$2" />
                            <ButtonText>Escanear</ButtonText>
                        </Button>
                    </Box>

                    <Pressable onPress={toggleCart}>
                        <HStack justifyContent="space-between" alignItems="center" mb="$2">
                            <Heading size="md">
                                Carrito ({cart.reduce((a, b) => a + b.quantity, 0)})
                            </Heading>
                            {!cartEmpty && (
                                // @ts-ignore
                                <Icon as={Ionicons} name={cartExpanded ? 'chevron-down' : 'chevron-up'} color="$coolGray400" />
                            )}
                        </HStack>
                    </Pressable>

                    {!cartEmpty && (
                        <ScrollView flex={1}>
                            <VStack space="sm">
                                {cart.map(item => (
                                    <HStack key={item.id} justifyContent="space-between" alignItems="center" p="$2" borderBottomWidth={1} borderColor="$coolGray100">
                                        <VStack flex={1}>
                                            <Text fontWeight="bold">{item.name}</Text>
                                            <Text size="sm" color="$coolGray500">₡{item.price} x {item.quantity}</Text>
                                        </VStack>
                                        <HStack alignItems="center" space="sm">
                                            <Pressable onPress={() => { animateLayout(); updateQuantity(item.id!, -1); }}>
                                                <Icon as={RemoveIcon} color="$coolGray500" />
                                            </Pressable>
                                            <Text fontWeight="bold">{item.quantity}</Text>
                                            <Pressable onPress={() => { animateLayout(); updateQuantity(item.id!, 1); }}>
                                                <Icon as={AddIcon} color="$coolGray500" />
                                            </Pressable>
                                        </HStack>
                                    </HStack>
                                ))}
                            </VStack>
                        </ScrollView>
                    )}

                    <Divider my="$2" />

                    <HStack justifyContent="space-between" mb="$2" alignItems="center">
                        <Text size="lg" color="$coolGray500">Total</Text>
                        <Heading size="2xl" color="$emerald600">₡{cartTotal}</Heading>
                    </HStack>

                    <Button
                        size="xl"
                        isDisabled={cart.length === 0}
                        bg={cart.length === 0 ? '$coolGray300' : '$emerald600'}
                        onPress={openCheckoutModal}
                    >
                        <ButtonText>Cobrar</ButtonText>
                    </Button>
                </Box>
            </Box>

            {/* Venta exitosa: tarjeta centrada, no bloquea taps y desaparece sola */}
            {saleSuccess !== null && (
                <Box
                    position="absolute" top={0} left={0} right={0} bottom={0}
                    justifyContent="center" alignItems="center"
                    zIndex={50} pointerEvents="none"
                >
                    <Box
                        bg="$white" borderRadius="$2xl" px="$10" py="$8" alignItems="center"
                        shadowColor="$black" shadowOffset={{ width: 0, height: 4 }}
                        shadowOpacity={0.25} shadowRadius={12} elevation={12}
                    >
                        <Box
                            w="$16" h="$16" bg="$emerald100" borderRadius="$full"
                            alignItems="center" justifyContent="center" mb="$3"
                        >
                            <Ionicons name="checkmark" size={44} color="#059669" />
                        </Box>
                        <Heading size="xl" color="$emerald700">¡Venta Exitosa!</Heading>
                        <Text size="lg" color="$coolGray500" mt="$1">₡{saleSuccess}</Text>
                    </Box>
                </Box>
            )}

            {/* Checkout Modal: user selector + PIN */}
            <Modal visible={showCheckoutModal} animationType="fade" transparent>
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 20 }}>
                    <Box bg="$white" borderRadius="$3xl" p="$6" maxHeight="85%">
                        <Heading size="lg" mb="$1">Confirmar Compra</Heading>
                        <Text color="$coolGray500" mb="$4">
                            Total: <Text fontWeight="$bold" color="$emerald700" size="lg">₡{cartTotal}</Text>
                        </Text>

                        {/* User selector */}
                        <Text size="sm" fontWeight="$semibold" mb="$2">Nombre del cliente</Text>
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
                            bg="$emerald600"
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
                </KeyboardAvoidingView>
            </Modal>

            {/* Camera Modal */}
            <Modal visible={isScanning} animationType="slide" presentationStyle="pageSheet">
                <Box flex={1} bg="$black">
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        onBarcodeScanned={handleBarCodeScanned}
                    />
                    <Box position="absolute" bottom={48} left={0} right={0} alignItems="center">
                        <Pressable
                            onPress={stopScanning}
                            borderWidth={1}
                            borderColor="$white"
                            borderRadius="$md"
                            px="$5" py="$3"
                            flexDirection="row"
                            alignItems="center"
                        >
                            {/* @ts-ignore */}
                            <Ionicons name="close" size={18} color="white" style={{ marginRight: 6 }} />
                            <Text color="$white" fontWeight="$semibold">Cerrar</Text>
                        </Pressable>
                    </Box>

                    {scannedProduct && (
                        <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center" bg="rgba(0,0,0,0.7)">
                            <Card p="$5" w="90%" variant="elevated">
                                <VStack space="md" alignItems="center">
                                    <Heading size="lg" textAlign="center">{scannedProduct.name}</Heading>
                                    <Text size="xl" color="$emerald600" fontWeight="bold">₡{scannedProduct.price}</Text>
                                    <Text color="$coolGray500">Stock: {scannedProduct.stock}</Text>
                                    <HStack space="md" mt="$4" w="100%" justifyContent="center">
                                        <Button onPress={() => setScannedProduct(null)} variant="outline" action="secondary" flex={1}>
                                            <ButtonText>Cancelar</ButtonText>
                                        </Button>
                                        <Button onPress={confirmScannedProduct} bg="$emerald600" flex={1}>
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
