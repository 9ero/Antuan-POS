import { Stack } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { Product, StockMovement, getProducts, addStock, registerLoss, getStockMovements } from '@/db/queries';
import { isConfigured } from '@/db/turso';
import { getDeviceConfig, pushStockMovementToTurso } from '@/db/sync';
import {
    Box,
    Text,
    Button,
    ButtonText,
    VStack,
    HStack,
    Heading,
    Card,
    ScrollView,
    Input,
    InputField,
    Pressable,
    Modal,
    ModalBackdrop,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Icon,
    CloseIcon,
    FormControl,
    FormControlLabel,
    FormControlLabelText,
} from '@gluestack-ui/themed';

const LOW_STOCK = 5;

const REASON_LABELS: Record<string, string> = {
    venta: 'Venta',
    recepcion: 'Recepción',
    extravio: 'Faltante',
    ajuste: 'Ajuste',
};

type ModalMode = 'recepcion' | 'extravio';

const normalize = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function InventoryAdmin() {
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [loadingMovements, setLoadingMovements] = useState(false);

    const [modalProductId, setModalProductId] = useState<number | null>(null);
    const [modalMode, setModalMode] = useState<ModalMode>('recepcion');
    const [modalProductName, setModalProductName] = useState('');
    const [qtyInput, setQtyInput] = useState('');
    const [modalError, setModalError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadProducts = async () => {
        const data = await getProducts();
        // Sort: low stock first, then alphabetical
        data.sort((a, b) => {
            if (a.stock <= LOW_STOCK && b.stock > LOW_STOCK) return -1;
            if (a.stock > LOW_STOCK && b.stock <= LOW_STOCK) return 1;
            return a.name.localeCompare(b.name);
        });
        setProducts(data);
    };

    useFocusEffect(useCallback(() => { loadProducts(); }, []));

    const filteredProducts = useMemo(() => {
        const q = normalize(search.trim());
        if (!q) return products;
        return products.filter(p =>
            normalize(p.name).includes(q) || (p.barcode || '').toLowerCase().includes(q)
        );
    }, [products, search]);

    const toggleHistory = async (productId: number) => {
        if (expandedId === productId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(productId);
        setLoadingMovements(true);
        const data = await getStockMovements(productId);
        setMovements(data);
        setLoadingMovements(false);
    };

    const openModal = (product: Product, mode: ModalMode) => {
        setModalProductId(product.id!);
        setModalProductName(product.name);
        setModalMode(mode);
        setQtyInput('');
        setModalError('');
    };

    const handleConfirm = async () => {
        const qty = parseInt(qtyInput);
        if (!qty || qty <= 0) { setModalError('Ingresa una cantidad válida'); return; }
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const result = modalMode === 'recepcion'
                ? await addStock(modalProductId!, qty)
                : await registerLoss(modalProductId!, qty);
            if (result.success && result.movementId) {
                if (isConfigured) {
                    getDeviceConfig().then(cfg => {
                        if (cfg) pushStockMovementToTurso(cfg.deviceId, result.movementId!).catch(() => {});
                    });
                }
            }
            if (result.success) {
                setModalProductId(null);
                if (expandedId === modalProductId) {
                    const data = await getStockMovements(modalProductId!);
                    setMovements(data);
                }
                loadProducts();
            } else {
                setModalError(result.error ?? 'Error desconocido');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatDate = (d: string) => new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z').toLocaleString('es-CR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Inventario', headerShown: true }} />

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

            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8 }}>
                <VStack space="md">
                    {filteredProducts.length === 0 && (
                        <Box alignItems="center" py="$8">
                            <Text color="$coolGray400">
                                {search.trim() ? 'Sin resultados' : 'No hay productos'}
                            </Text>
                        </Box>
                    )}
                    {filteredProducts.map(product => {
                        const isLow = product.stock <= LOW_STOCK;
                        const isExpanded = expandedId === product.id;

                        return (
                            <Card key={product.id} variant="elevated" p="$4">
                                {/* Product header */}
                                <HStack justifyContent="space-between" alignItems="center" mb="$3">
                                    <HStack space="sm" alignItems="center" flex={1}>
                                        {isLow && (
                                            <Box
                                                bg={product.stock === 0 ? '$red100' : '$amber100'}
                                                px="$2" py="$0.5" borderRadius="$full"
                                            >
                                                <Text
                                                    size="xs" fontWeight="$bold"
                                                    color={product.stock === 0 ? '$red600' : '$amber600'}
                                                >
                                                    {product.stock === 0 ? 'Agotado' : '⚠ Bajo'}
                                                </Text>
                                            </Box>
                                        )}
                                        <Heading size="sm" flex={1}>{product.name}</Heading>
                                    </HStack>
                                    <Box
                                        bg={product.stock === 0 ? '$red50' : isLow ? '$amber50' : '$emerald50'}
                                        px="$3" py="$1" borderRadius="$md"
                                    >
                                        <Text
                                            fontWeight="$bold" size="lg"
                                            color={product.stock === 0 ? '$red600' : isLow ? '$amber600' : '$emerald700'}
                                        >
                                            {product.stock}
                                        </Text>
                                    </Box>
                                </HStack>

                                {/* Actions */}
                                <HStack space="sm" mb="$2">
                                    <Button
                                        flex={1} size="sm" bg="$blue600"
                                        onPress={() => openModal(product, 'recepcion')}
                                    >
                                        <ButtonText>+ Recibir</ButtonText>
                                    </Button>
                                    <Button
                                        flex={1} size="sm" variant="outline" action="negative"
                                        onPress={() => openModal(product, 'extravio')}
                                    >
                                        <ButtonText color="$red500">Faltante</ButtonText>
                                    </Button>
                                    <Pressable
                                        onPress={() => toggleHistory(product.id!)}
                                        px="$3" py="$2" borderRadius="$md"
                                        bg={isExpanded ? '$coolGray200' : '$coolGray100'}
                                        justifyContent="center" alignItems="center"
                                    >
                                        <Text size="xs" color="$coolGray600">
                                            {isExpanded ? '▲' : '▼'} Historial
                                        </Text>
                                    </Pressable>
                                </HStack>

                                {/* Movement history */}
                                {isExpanded && (
                                    <Box
                                        bg="$coolGray50" borderRadius="$md" p="$3"
                                        borderWidth={1} borderColor="$coolGray100"
                                    >
                                        {loadingMovements ? (
                                            <Text size="sm" color="$coolGray400">Cargando...</Text>
                                        ) : movements.length === 0 ? (
                                            <Text size="sm" color="$coolGray400">Sin movimientos registrados</Text>
                                        ) : (
                                            <VStack space="xs">
                                                {movements.map(m => (
                                                    <HStack key={m.id} justifyContent="space-between" alignItems="center">
                                                        <HStack space="sm" alignItems="center">
                                                            <Text
                                                                fontWeight="$bold" size="sm"
                                                                color={m.quantity_change > 0 ? '$emerald600' : '$red500'}
                                                            >
                                                                {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                                                            </Text>
                                                            <Text size="sm" color="$coolGray600">
                                                                {REASON_LABELS[m.reason] ?? m.reason}
                                                            </Text>
                                                        </HStack>
                                                        <Text size="xs" color="$coolGray400">
                                                            {formatDate(m.created_at)}
                                                        </Text>
                                                    </HStack>
                                                ))}
                                            </VStack>
                                        )}
                                    </Box>
                                )}
                            </Card>
                        );
                    })}
                </VStack>
            </ScrollView>

            {/* Receive / Loss modal */}
            <Modal isOpen={modalProductId !== null} onClose={() => setModalProductId(null)} avoidKeyboard>
                <ModalBackdrop />
                <ModalContent>
                    <ModalHeader>
                        <Heading size="md">
                            {modalMode === 'recepcion' ? 'Recibir mercancía' : 'Reportar faltante'}
                        </Heading>
                        <ModalCloseButton><Icon as={CloseIcon} /></ModalCloseButton>
                    </ModalHeader>
                    <ModalBody>
                        <Text size="sm" color="$coolGray500" mb="$4">{modalProductName}</Text>
                        <FormControl>
                            <FormControlLabel>
                                <FormControlLabelText>
                                    {modalMode === 'recepcion' ? 'Cantidad a recibir' : 'Cantidad faltante'}
                                </FormControlLabelText>
                            </FormControlLabel>
                            <Input size="xl">
                                <InputField
                                    keyboardType="numeric"
                                    value={qtyInput}
                                    onChangeText={t => { setQtyInput(t); setModalError(''); }}
                                    textAlign="center"
                                    placeholder="0"
                                />
                            </Input>
                        </FormControl>
                        {modalError ? <Text size="sm" color="$red500" mt="$2">{modalError}</Text> : null}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="outline" size="sm" mr="$3" onPress={() => setModalProductId(null)}>
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                        <Button
                            size="sm"
                            bg={modalMode === 'recepcion' ? '$blue600' : '$red500'}
                            isDisabled={isSubmitting}
                            onPress={handleConfirm}
                        >
                            <ButtonText>{isSubmitting ? 'Guardando...' : 'Confirmar'}</ButtonText>
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}
