import { Modal, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useCallback } from 'react';
import { Product, getProducts, addProduct, deleteProduct, updateProduct } from '@/db/queries';
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
type Margin = typeof MARGINS[number];

const calcSellPrice = (cost: number, margin: number) =>
    Math.round(cost * (1 + margin / 100) / 5) * 5;

const emptyForm = { name: '', cost_price: '', margin_percentage: 30 as Margin, price: '', barcode: '', stock: '' };

export default function ProductsAdmin() {
    const [products, setProducts] = useState<Product[]>([]);
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
        const data = await getProducts();
        setProducts(data);
    };

    useFocusEffect(useCallback(() => { loadProducts(); }, []));

    const hasCost = parseFloat(newProduct.cost_price) > 0;
    const computedPrice = hasCost
        ? calcSellPrice(parseFloat(newProduct.cost_price), newProduct.margin_percentage)
        : parseFloat(newProduct.price) || 0;

    const handleAdd = async () => {
        if (!newProduct.name) { showError('El nombre es requerido'); return; }
        if (!hasCost && !newProduct.price) { showError('Ingresa el precio de costo o el precio de venta'); return; }
        if (isSubmitting) return;
        setIsSubmitting(true);

        const finalPrice = hasCost
            ? calcSellPrice(parseFloat(newProduct.cost_price), newProduct.margin_percentage)
            : parseFloat(newProduct.price);
        const finalCost = parseFloat(newProduct.cost_price) || 0;

        try {
            if (editingId) {
                await updateProduct(
                    editingId,
                    newProduct.name,
                    finalPrice,
                    newProduct.barcode,
                    parseInt(newProduct.stock || '0'),
                    finalCost,
                    newProduct.margin_percentage,
                );
            } else {
                await addProduct(
                    newProduct.name,
                    finalPrice,
                    newProduct.barcode,
                    parseInt(newProduct.stock || '0'),
                    finalCost,
                    newProduct.margin_percentage,
                );
            }
            setModalVisible(false);
            setNewProduct(emptyForm);
            setEditingId(null);
            loadProducts();
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Error al guardar producto');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (product: Product) => {
        setNewProduct({
            name: product.name,
            cost_price: (product.cost_price ?? 0) > 0 ? String(product.cost_price) : '',
            margin_percentage: ([20, 30, 40].includes(product.margin_percentage ?? 0)
                ? product.margin_percentage
                : 30) as Margin,
            price: (product.cost_price ?? 0) > 0 ? '' : product.price.toString(),
            barcode: product.barcode || '',
            stock: product.stock.toString(),
        });
        setEditingId(product.id!);
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        await deleteProduct(id);
        loadProducts();
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        setNewProduct(prev => ({ ...prev, barcode: data }));
        stopScanning();
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingId(null);
        setNewProduct(emptyForm);
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Gestionar Productos', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {products.map(item => (
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
                                    {item.barcode ? <Text size="xs" color="$coolGray400">{item.barcode}</Text> : null}
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

            <Fab
                size="lg"
                placement="bottom right"
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
                <Box flex={1} justifyContent="flex-end">
                    <Box bg="$white" borderTopLeftRadius="$2xl" borderTopRightRadius="$2xl" p="$6">
                        <Heading size="lg" mb="$4">{editingId ? 'Editar Producto' : 'Nuevo Producto'}</Heading>

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
                                        placeholder="Opcional"
                                        value={newProduct.cost_price}
                                        onChangeText={t => setNewProduct({ ...newProduct, cost_price: t })}
                                    />
                                </Input>
                            </FormControl>

                            {/* Selector de margen */}
                            <FormControl>
                                <FormControlLabel><FormControlLabelText>Margen de ganancia</FormControlLabelText></FormControlLabel>
                                <HStack space="sm">
                                    {MARGINS.map(m => (
                                        <Pressable
                                            key={m}
                                            flex={1}
                                            onPress={() => setNewProduct({ ...newProduct, margin_percentage: m })}
                                            bg={newProduct.margin_percentage === m ? '$blue600' : '$coolGray100'}
                                            borderRadius="$md"
                                            py="$2"
                                            alignItems="center"
                                        >
                                            <Text
                                                fontWeight="$bold"
                                                color={newProduct.margin_percentage === m ? '$white' : '$coolGray700'}
                                            >
                                                {m}%
                                            </Text>
                                        </Pressable>
                                    ))}
                                </HStack>
                            </FormControl>

                            {/* Precio de venta: computed si hay costo, manual si no */}
                            <FormControl>
                                <FormControlLabel>
                                    <FormControlLabelText>
                                        Precio de venta (₡){hasCost ? ' — calculado' : ''}
                                    </FormControlLabelText>
                                </FormControlLabel>
                                {hasCost ? (
                                    <Box
                                        bg="$coolGray100"
                                        borderRadius="$md"
                                        px="$3"
                                        py="$3"
                                        borderWidth={1}
                                        borderColor="$coolGray200"
                                    >
                                        <Text fontWeight="$bold" color="$blue700" size="lg">
                                            ₡{computedPrice.toFixed(0)}
                                        </Text>
                                    </Box>
                                ) : (
                                    <Input>
                                        <InputField
                                            keyboardType="numeric"
                                            value={newProduct.price}
                                            onChangeText={t => setNewProduct({ ...newProduct, price: t })}
                                        />
                                    </Input>
                                )}
                            </FormControl>

                            <HStack space="md">
                                <FormControl flex={1}>
                                    <FormControlLabel><FormControlLabelText>Stock</FormControlLabelText></FormControlLabel>
                                    <Input>
                                        <InputField keyboardType="numeric" value={newProduct.stock} onChangeText={t => setNewProduct({ ...newProduct, stock: t })} />
                                    </Input>
                                </FormControl>
                                <FormControl flex={1}>
                                    <FormControlLabel><FormControlLabelText>Código de Barras</FormControlLabelText></FormControlLabel>
                                    <HStack space="sm">
                                        <Input flex={1}>
                                            <InputField value={newProduct.barcode} onChangeText={t => setNewProduct({ ...newProduct, barcode: t })} />
                                        </Input>
                                        <Button onPress={startScanning} variant="outline" action="secondary">
                                            {/* @ts-ignore */}
                                            <ButtonIcon as={Ionicons} name="qr-code-outline" />
                                        </Button>
                                    </HStack>
                                </FormControl>
                            </HStack>
                        </VStack>

                        <Button onPress={handleAdd} size="lg" mb="$2" isDisabled={isSubmitting}>
                            <ButtonText>{isSubmitting ? 'Guardando...' : 'Guardar'}</ButtonText>
                        </Button>
                        <Button onPress={closeModal} variant="link" size="sm">
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                    </Box>
                </Box>
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

            {/* Scanner Modal */}
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
                </Box>
            </Modal>
        </Box>
    );
}
