import { Modal, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useState, useCallback } from 'react';
import { Product, getProducts, addProduct, deleteProduct, updateProduct } from '../../../db/queries';
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
    Select,
    SelectTrigger,
    SelectInput,
    SelectIcon,
    SelectPortal,
    SelectBackdrop,
    SelectContent,
    SelectItem,
    EditIcon,
} from '@gluestack-ui/themed';
import { useScanner } from '../../../hooks/useScanner';

export default function ProductsAdmin() {
    const [products, setProducts] = useState<Product[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: '', price: '', barcode: '', stock: '' });

    const [editingId, setEditingId] = useState<number | null>(null);

    const [errorModalVisible, setErrorModalVisible] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const showError = (msg: string) => {
        setErrorMessage(msg);
        setErrorModalVisible(true);
    };

    const { isScanning, startScanning, stopScanning } = useScanner();

    const loadProducts = async () => {
        const data = await getProducts();
        setProducts(data);
    };

    useFocusEffect(
        useCallback(() => {
            loadProducts();
        }, [])
    );

    const handleAdd = async () => {
        if (!newProduct.name || !newProduct.price) {
            showError('Nombre y Precio son requeridos');
            return;
        }

        try {
            if (editingId) {
                await updateProduct(
                    editingId,
                    newProduct.name,
                    parseFloat(newProduct.price),
                    newProduct.barcode,
                    parseInt(newProduct.stock || '0')
                );
            } else {
                await addProduct(
                    newProduct.name,
                    parseFloat(newProduct.price),
                    newProduct.barcode,
                    parseInt(newProduct.stock || '0')
                );
            }

            setModalVisible(false);
            setNewProduct({ name: '', price: '', barcode: '', stock: '' });
            setEditingId(null);
            loadProducts();
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Error al guardar producto');
        }
    };

    const handleEdit = (product: Product) => {
        setNewProduct({
            name: product.name,
            price: product.price.toString(),
            barcode: product.barcode || '',
            stock: product.stock.toString()
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

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Gestionar Productos', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {products.map(item => (
                        <Card key={item.id} variant="elevated" p="$4">
                            <HStack justifyContent="space-between" alignItems="center">
                                <VStack>
                                    <Heading size="sm">{item.name}</Heading>
                                    <Text size="sm" color="$coolGray500">Price: ₡{item.price.toFixed(2)}</Text>
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
                onPress={() => { setEditingId(null); setNewProduct({ name: '', price: '', barcode: '', stock: '' }); setModalVisible(true); }}
                bg="$blue600"
            >
                <FabIcon as={AddIcon} />
            </Fab>

            {/* Add Product Modal */}
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

                            <HStack space="md">
                                <FormControl flex={1}>
                                    <FormControlLabel><FormControlLabelText>Precio</FormControlLabelText></FormControlLabel>
                                    <Input>
                                        <InputField keyboardType="numeric" value={newProduct.price} onChangeText={t => setNewProduct({ ...newProduct, price: t })} />
                                    </Input>
                                </FormControl>
                                <FormControl flex={1}>
                                    <FormControlLabel><FormControlLabelText>Stock</FormControlLabelText></FormControlLabel>
                                    <Input>
                                        <InputField keyboardType="numeric" value={newProduct.stock} onChangeText={t => setNewProduct({ ...newProduct, stock: t })} />
                                    </Input>
                                </FormControl>
                            </HStack>

                            <FormControl>
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
                        </VStack>

                        <Button onPress={handleAdd} size="lg" mb="$2">
                            <ButtonText>Guardar</ButtonText>
                        </Button>
                        <Button onPress={() => { setModalVisible(false); setEditingId(null); setNewProduct({ name: '', price: '', barcode: '', stock: '' }); }} variant="link" size="sm">
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
