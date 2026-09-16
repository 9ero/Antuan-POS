import { Modal, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { Product, Category, getProducts, getAllCategories, addProduct, deleteProduct, updateProduct } from '@/db/queries';
import { getDeviceConfig, pushProductToTurso } from '@/db/sync';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
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
    Fab,
    FabIcon,
    AddIcon,
    TrashIcon,
    Icon,
    FormControl,
    FormControlLabel,
    FormControlLabelText,
    EditIcon,
} from '@gluestack-ui/themed';
import { useScanner } from '@/hooks/useScanner';

const MARGINS = [20, 30, 40] as const;

// Precio de venta sugerido para un margen dado, redondeado a la moneda mínima (₡5)
const calcSellPrice = (cost: number, margin: number) =>
    Math.round(cost * (1 + margin / 100) / 5) * 5;

// Margen real que resulta de un costo y un precio de venta (lo que se guarda en DB)
const calcMargin = (cost: number, price: number) =>
    cost > 0 && price > 0 ? Math.round(((price - cost) / cost) * 100) : 0;

// 'preset' = el margen manda y el precio de venta se calcula (campo bloqueado);
// 'custom'  = el precio de venta lo escribe el usuario y el margen se muestra derivado.
type MarginMode = 'preset' | 'custom';
type Margin = typeof MARGINS[number];

const emptyForm = {
    name: '', cost_price: '',
    margin_mode: 'preset' as MarginMode,
    margin_percentage: 30 as Margin,
    price: '',   // solo se usa en modo custom
    barcode: '', stock: '', category_id: null as number | null,
};

// Al editar: si el precio guardado cae justo en un preset lo reconstruye, si no entra en Custom
const detectMargin = (p: { cost_price?: number; price: number }): { mode: MarginMode; preset: Margin } => {
    const cost = p.cost_price ?? 0;
    if (cost > 0 && p.price > 0) {
        const m = MARGINS.find(x => p.price === calcSellPrice(cost, x));
        if (m) return { mode: 'preset', preset: m };
    }
    return { mode: 'custom', preset: 30 };
};

const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ProductsAdmin() {
    const insets = useSafeAreaInsets();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [search, setSearch] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [newProduct, setNewProduct] = useState(emptyForm);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [errorModalVisible, setErrorModalVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { isScanning, startScanning, stopScanning } = useScanner();

    const showError = (msg: string) => {
        setErrorMessage(msg);
        setErrorModalVisible(true);
    };

    const loadProducts = async () => {
        const [data, cats] = await Promise.all([getProducts(), getAllCategories()]);
        setProducts(data);
        setCategories(cats);
    };

    // Solo activas para el selector; el nombre se resuelve sobre todas (incl. inactivas)
    const activeCategories = categories.filter(c => c.is_active !== 0);
    const categoryName = (id: number | null | undefined) =>
        id == null ? null : (categories.find(c => c.id === id)?.name ?? null);

    // Búsqueda rápida por nombre (accent-insensitive) o código de barras
    const filteredProducts = useMemo(() => {
        const q = normalize(search.trim());
        if (!q) return products;
        return products.filter(p =>
            normalize(p.name).includes(q) || (p.barcode || '').toLowerCase().includes(q)
        );
    }, [products, search]);

    useFocusEffect(useCallback(() => { loadProducts(); }, []));

    // Sube el producto a Turso al instante (fire-and-forget, cola offline si no hay red)
    const syncProduct = (id: number) => {
        getDeviceConfig().then(cfg => { if (cfg) pushProductToTurso(cfg.deviceId, id).catch(() => {}); });
    };

    const costNum = parseFloat(newProduct.cost_price) || 0;
    const hasCost = costNum > 0;
    const isCustomMargin = newProduct.margin_mode === 'custom';

    // En preset el precio lo manda el margen; en custom lo escribe el usuario
    const finalPrice = isCustomMargin
        ? parseFloat(newProduct.price) || 0
        : calcSellPrice(costNum, newProduct.margin_percentage);

    // El % que se guarda es siempre el real, ya con el redondeo a ₡5 aplicado
    const computedMargin = calcMargin(costNum, finalPrice);
    const computedProfit = hasCost && finalPrice > 0 ? finalPrice - costNum : 0;

    // Preset: el precio de venta pasa a ser calculado y de solo lectura
    const selectPreset = (m: Margin) =>
        setNewProduct({ ...newProduct, margin_mode: 'preset', margin_percentage: m });

    // Custom: desbloquea el precio de venta, arrancando desde el que ya se mostraba
    const selectCustom = () =>
        setNewProduct({
            ...newProduct,
            margin_mode: 'custom',
            price: finalPrice > 0 ? String(finalPrice) : newProduct.price,
        });

    const handleAdd = async () => {
        if (!newProduct.name) { showError('El nombre es requerido'); return; }
        if (!(finalPrice > 0)) {
            showError(isCustomMargin
                ? 'Ingresa el precio de venta'
                : 'Ingresa el precio de costo para calcular el precio de venta');
            return;
        }
        if (newProduct.category_id == null) { showError('Seleccioná una categoría'); return; }
        if (isSubmitting) return;
        setIsSubmitting(true);

        const finalCost = costNum;

        try {
            let savedId: number;
            if (editingId) {
                savedId = await updateProduct(
                    editingId,
                    newProduct.name,
                    finalPrice,
                    newProduct.barcode,
                    finalCost,
                    computedMargin,
                    newProduct.category_id,
                );
            } else {
                savedId = await addProduct(
                    newProduct.name,
                    finalPrice,
                    newProduct.barcode,
                    parseInt(newProduct.stock || '0'),
                    finalCost,
                    computedMargin,
                    newProduct.category_id,
                );
            }
            setModalVisible(false);
            setNewProduct(emptyForm);
            setEditingId(null);
            syncProduct(savedId);
            loadProducts();
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Error al guardar producto');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (product: Product) => {
        const { mode, preset } = detectMargin(product);
        setNewProduct({
            name: product.name,
            cost_price: (product.cost_price ?? 0) > 0 ? String(product.cost_price) : '',
            margin_mode: mode,
            margin_percentage: preset,
            price: product.price.toString(),
            barcode: product.barcode || '',
            stock: product.stock.toString(),
            category_id: product.category_id ?? null,
        });
        setEditingId(product.id!);
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        await deleteProduct(id);
        syncProduct(id);
        loadProducts();
    };

    const openScanner = () => {
        setModalVisible(false);
        startScanning();
    };

    const closeScanner = () => {
        stopScanning();
        setModalVisible(true);
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        setNewProduct(prev => ({ ...prev, barcode: data }));
        closeScanner();
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        setNewProduct(emptyForm);
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Gestionar Productos', headerShown: true }} />

            <Box px="$4" pt="$3" pb="$1">
                <Input bg="$white">
                    <InputField
                        placeholder="Buscar por nombre o código…"
                        value={search}
                        onChangeText={setSearch}
                        autoCapitalize="none"
                    />
                </Input>
            </Box>

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 100 }}>
                <VStack space="md">
                    {filteredProducts.length === 0 && (
                        <Box alignItems="center" py="$8">
                            <Text color="$coolGray400">
                                {search.trim() ? 'Sin resultados' : 'No hay productos'}
                            </Text>
                        </Box>
                    )}
                    {filteredProducts.map(item => (
                        <Card key={item.id} variant="elevated" p="$4">
                            <HStack justifyContent="space-between" alignItems="center">
                                <VStack flex={1}>
                                    <Heading size="sm">{item.name}</Heading>
                                    <Text size="sm" color="$coolGray600">Precio: ₡{item.price.toFixed(0)}</Text>
                                    {(item.cost_price ?? 0) > 0 && (
                                        <Text size="xs" color="$coolGray400">
                                            Costo: ₡{item.cost_price} · Margen: {item.margin_percentage}%
                                        </Text>
                                    )}
                                    <Text size="sm" color="$coolGray500">Stock: {item.stock}</Text>
                                    {categoryName(item.category_id)
                                        ? <Text size="xs" color="$coolGray400">{categoryName(item.category_id)}</Text>
                                        : null}
                                </VStack>
                                <HStack space="md">
                                    <Pressable onPress={() => handleEdit(item)}>
                                        <Icon as={EditIcon} color="$blue600" size="xl" />
                                    </Pressable>
                                    <Pressable onPress={() => handleDelete(item.id!)}>
                                        <Icon as={TrashIcon} color="$red600" size="xl" />
                                    </Pressable>
                                </HStack>
                            </HStack>
                        </Card>
                    ))}
                </VStack>
            </ScrollView>

            {/* bottom con inset: la pantalla no tiene SafeAreaView y con edge-to-edge
                el FAB quedaba sobre la barra de navegación de Android */}
            <Fab
                size="lg"
                placement="bottom right"
                bottom={insets.bottom + 24}
                isHovered={false}
                isDisabled={false}
                isPressed={false}
                onPress={() => { setEditingId(null); setNewProduct(emptyForm); setModalVisible(true); }}
                bg="$blue600"
            >
                <FabIcon as={AddIcon} />
            </Fab>

            {/* Add/Edit Product Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <Box flex={1} justifyContent="flex-end" bg="$black" opacity={0.5} style={StyleSheet.absoluteFillObject} />
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <Box bg="$white" borderTopLeftRadius="$2xl" borderTopRightRadius="$2xl" p="$6" maxHeight="90%">
                        <Heading size="lg" mb="$4">{editingId ? 'Editar Producto' : 'Nuevo Producto'}</Heading>

                        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                        <VStack space="md" mb="$6">
                            <FormControl>
                                <FormControlLabel><FormControlLabelText>Nombre</FormControlLabelText></FormControlLabel>
                                <Input>
                                    <InputField value={newProduct.name} onChangeText={t => setNewProduct({ ...newProduct, name: t })} />
                                </Input>
                            </FormControl>

                            {/* Precio de costo */}
                            <FormControl>
                                <FormControlLabel><FormControlLabelText>Precio de costo (₡)</FormControlLabelText></FormControlLabel>
                                <Input>
                                    <InputField
                                        keyboardType="numeric"
                                        placeholder="Ej. 400"
                                        value={newProduct.cost_price}
                                        onChangeText={t => setNewProduct({ ...newProduct, cost_price: t })}
                                    />
                                </Input>
                            </FormControl>

                            {/* Margen: se elige ANTES del precio, porque lo determina */}
                            <FormControl>
                                <FormControlLabel><FormControlLabelText>Margen</FormControlLabelText></FormControlLabel>
                                <HStack space="sm">
                                    {MARGINS.map(m => {
                                        const active = !isCustomMargin && newProduct.margin_percentage === m;
                                        return (
                                            <Pressable
                                                key={m}
                                                flex={1}
                                                onPress={() => selectPreset(m)}
                                                bg={active ? '$blue600' : '$coolGray100'}
                                                borderRadius="$md"
                                                py="$2"
                                                alignItems="center"
                                            >
                                                <Text fontWeight="$bold" color={active ? '$white' : '$coolGray700'}>
                                                    {m}%
                                                </Text>
                                                <Text size="xs" color={active ? '$blue100' : '$coolGray500'}>
                                                    {hasCost ? `₡${calcSellPrice(costNum, m)}` : '—'}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                    <Pressable
                                        flex={1}
                                        onPress={selectCustom}
                                        bg={isCustomMargin ? '$blue600' : '$coolGray100'}
                                        borderRadius="$md"
                                        py="$2"
                                        alignItems="center"
                                    >
                                        <Text fontWeight="$bold" color={isCustomMargin ? '$white' : '$coolGray700'}>
                                            Custom
                                        </Text>
                                        <Text size="xs" color={isCustomMargin ? '$blue100' : '$coolGray500'}>
                                            manual
                                        </Text>
                                    </Pressable>
                                </HStack>
                            </FormControl>

                            {/* Precio de venta: calculado y bloqueado en preset, editable en Custom */}
                            <FormControl>
                                <FormControlLabel>
                                    <FormControlLabelText>
                                        Precio de venta (₡){isCustomMargin ? '' : ' — calculado'}
                                    </FormControlLabelText>
                                </FormControlLabel>
                                {isCustomMargin ? (
                                    <Input>
                                        <InputField
                                            keyboardType="numeric"
                                            value={newProduct.price}
                                            onChangeText={t => setNewProduct({ ...newProduct, price: t })}
                                        />
                                    </Input>
                                ) : (
                                    <Box
                                        bg="$coolGray100"
                                        borderRadius="$md"
                                        px="$3"
                                        py="$3"
                                        borderWidth={1}
                                        borderColor="$coolGray200"
                                    >
                                        <Text fontWeight="$bold" color={hasCost ? '$blue700' : '$coolGray400'} size="lg">
                                            {hasCost ? `₡${finalPrice.toFixed(0)}` : 'Ingresá el precio de costo'}
                                        </Text>
                                    </Box>
                                )}
                            </FormControl>

                            {/* Margen real: solo lectura, ya con el redondeo a ₡5 aplicado */}
                            <Box
                                bg={hasCost ? '$emerald50' : '$coolGray100'}
                                borderRadius="$md"
                                px="$3"
                                py="$3"
                                borderWidth={1}
                                borderColor={hasCost ? '$emerald100' : '$coolGray200'}
                            >
                                {hasCost && finalPrice > 0 ? (
                                    <HStack justifyContent="space-between" alignItems="center">
                                        <Text size="sm" color="$coolGray600">Margen real</Text>
                                        <Text
                                            fontWeight="$bold"
                                            size="lg"
                                            color={computedMargin < 0 ? '$red600' : '$emerald700'}
                                        >
                                            {computedMargin}%{'  '}
                                            <Text size="sm" color="$coolGray500">
                                                (₡{computedProfit.toFixed(0)} por unidad)
                                            </Text>
                                        </Text>
                                    </HStack>
                                ) : (
                                    <Text size="sm" color="$coolGray500">
                                        Ingresá el precio de costo para calcular el margen
                                    </Text>
                                )}
                            </Box>

                            <FormControl isDisabled={!!editingId}>
                                <FormControlLabel>
                                    <FormControlLabelText>
                                        {editingId ? 'Stock (se gestiona en Inventario)' : 'Stock inicial'}
                                    </FormControlLabelText>
                                </FormControlLabel>
                                <Input isDisabled={!!editingId}>
                                    <InputField
                                        keyboardType="numeric"
                                        value={newProduct.stock}
                                        onChangeText={t => setNewProduct({ ...newProduct, stock: t })}
                                    />
                                </Input>
                            </FormControl>

                            <FormControl>
                                <FormControlLabel><FormControlLabelText>Código de Barras</FormControlLabelText></FormControlLabel>
                                <HStack space="sm">
                                    <Input flex={1}>
                                        <InputField value={newProduct.barcode} onChangeText={t => setNewProduct({ ...newProduct, barcode: t })} />
                                    </Input>
                                    <Button onPress={openScanner} variant="outline" action="secondary">
                                        {/* @ts-ignore */}
                                        <ButtonIcon as={Ionicons} name="qr-code-outline" />
                                        </Button>
                                    </HStack>
                                </FormControl>

                            {/* Categoría: obligatoria, elegida de las categorías activas */}
                            <FormControl>
                                <FormControlLabel><FormControlLabelText>Categoría</FormControlLabelText></FormControlLabel>
                                {activeCategories.length === 0 ? (
                                    <Text size="sm" color="$coolGray400">
                                        No hay categorías. Creá una en Admin → Categorías antes de agregar productos.
                                    </Text>
                                ) : (
                                    <HStack space="sm" flexWrap="wrap">
                                        {activeCategories.map(cat => {
                                            const selected = newProduct.category_id === cat.id;
                                            return (
                                                <Pressable
                                                    key={cat.id}
                                                    onPress={() => setNewProduct({ ...newProduct, category_id: cat.id! })}
                                                    bg={selected ? '$blue600' : '$coolGray100'}
                                                    borderRadius="$full"
                                                    px="$3" py="$1.5" mb="$1"
                                                >
                                                    <Text size="sm" color={selected ? '$white' : '$coolGray700'}>{cat.name}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </HStack>
                                )}
                            </FormControl>
                        </VStack>

                        {/* Botones dentro del ScrollView: si estuvieran pegados al fondo del
                            sheet, el KeyboardAvoidingView los deja flotando sobre el teclado. */}
                        <Button onPress={handleAdd} size="lg" mb="$2" isDisabled={isSubmitting}>
                            <ButtonText>{isSubmitting ? 'Guardando...' : 'Guardar'}</ButtonText>
                        </Button>
                        <Button onPress={closeModal} variant="link" size="sm">
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                        </ScrollView>
                    </Box>
                </KeyboardAvoidingView>
            </Modal>

            {/* Error Modal */}
            <Modal visible={errorModalVisible} transparent animationType="fade">
                <Box flex={1} justifyContent="center" alignItems="center" bg="rgba(0,0,0,0.5)">
                    <Box bg="$white" p="$6" borderRadius="$lg" w="80%">
                        <Heading size="md" mb="$2" color="$red600">Atención</Heading>
                        <Text mb="$4">{errorMessage}</Text>
                        <Button onPress={() => setErrorModalVisible(false)} action="primary">
                            <ButtonText>Entendido</ButtonText>
                        </Button>
                    </Box>
                </Box>
            </Modal>

            {/* Escáner como overlay en la MISMA ventana, no como <Modal>: en Magic OS
                (Honor) la ventana separada del Modal compone mal el SurfaceView de la
                cámara y deja media pantalla congelada hasta cambiar de app. Mismo fix
                aplicado en app/index.tsx. openScanner/closeScanner además ocultan el
                <Modal> del formulario mientras se escanea: aunque la cámara ya no está
                DENTRO de un Modal, tenerlo abierto de fondo (el botón vive dentro de ese
                formulario) crea la misma ventana nativa en paralelo y reproduce el bug. */}
            {isScanning && (
                <Box style={StyleSheet.absoluteFill} bg="$black" zIndex={100}>
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="back"
                        onBarcodeScanned={handleBarCodeScanned}
                    />
                    <Box position="absolute" bottom={40} left={0} right={0} alignItems="center">
                        <Button onPress={closeScanner} variant="solid" bg="$white">
                            <ButtonText color="$black">Cerrar Escáner</ButtonText>
                        </Button>
                    </Box>
                </Box>
            )}
        </Box>
    );
}
