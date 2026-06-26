import { Stack, useRouter } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { getTransactions, getUsers, TransactionDetail, deleteAllTransactions } from '@/db/queries';
import { User } from '@/db/schemas';
import { useFocusEffect } from 'expo-router';
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
    Icon,
    CloseIcon,
    DownloadIcon,
    TrashIcon,
    ButtonIcon,
    Modal,
    ModalBackdrop,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Input,
    InputField,
    Pressable,
    Toast,
    ToastTitle,
    useToast,
} from '@gluestack-ui/themed';

type Period = 'all' | 'today' | 'week' | 'month';

const PERIOD_LABELS: Record<Period, string> = {
    all: 'Todo',
    today: 'Hoy',
    week: 'Semana',
    month: 'Mes',
};

const fmt = (d: Date) =>
    `${d.getDate().toString().padStart(2, '0')}_${(d.getMonth() + 1).toString().padStart(2, '0')}_${d.getFullYear()}`;

export default function HistoryScreen() {
    const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [period, setPeriod] = useState<Period>('all');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showClearModal, setShowClearModal] = useState(false);
    const [pin, setPin] = useState('');
    const router = useRouter();
    const toast = useToast();

    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [])
    );

    const loadAll = async () => {
        const [txs, us] = await Promise.all([getTransactions(), getUsers()]);
        setTransactions(txs);
        setUsers(us);
    };

    const filtered = useMemo(() => {
        let result = transactions;

        if (period !== 'all') {
            const cutoff = new Date();
            if (period === 'today') cutoff.setHours(0, 0, 0, 0);
            else if (period === 'week') cutoff.setDate(cutoff.getDate() - 7);
            else if (period === 'month') cutoff.setMonth(cutoff.getMonth() - 1);
            result = result.filter(t => t.created_at && new Date(t.created_at) >= cutoff);
        }

        if (selectedUserId !== null) {
            result = result.filter(t => t.user_id === selectedUserId);
        }

        return result;
    }, [transactions, period, selectedUserId]);

    const totalAmount = filtered.reduce((s, t) => s + t.total, 0);
    const avgAmount = filtered.length > 0 ? totalAmount / filtered.length : 0;

    const selectedUserName = selectedUserId !== null
        ? users.find(u => u.id === selectedUserId)?.name ?? 'Cliente'
        : null;

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleString('es-CR');
    };

    const handleExport = async () => {
        try {
            if (filtered.length === 0) {
                alert('No hay ventas para exportar');
                return;
            }

            // Sheet 1: detail
            const detailData = filtered.map(t => ({
                ID: t.id,
                Fecha: formatDate(t.created_at),
                Cliente: t.user_name,
                'Total (₡)': t.total,
                Productos: t.items.map(i => `${i.quantity} ${i.product_name}`).join(', '),
            }));

            // Sheet 2: by user
            const byUser = new Map<string, { total: number; count: number; products: Map<string, number> }>();
            for (const t of filtered) {
                if (!byUser.has(t.user_name)) byUser.set(t.user_name, { total: 0, count: 0, products: new Map() });
                const u = byUser.get(t.user_name)!;
                u.total += t.total;
                u.count += 1;
                for (const item of t.items) {
                    u.products.set(item.product_name, (u.products.get(item.product_name) ?? 0) + item.quantity);
                }
            }
            const byUserData = Array.from(byUser.entries())
                .sort((a, b) => b[1].total - a[1].total)
                .map(([name, data]) => ({
                    Cliente: name,
                    'N° Compras': data.count,
                    'Total (₡)': data.total,
                    Productos: Array.from(data.products.entries())
                        .sort((a, b) => b[1] - a[1])
                        .map(([p, q]) => `${q} ${p}`)
                        .join(', '),
                }));

            // Sheet 3: by product
            const byProduct = new Map<string, { units: number; revenue: number }>();
            for (const t of filtered) {
                for (const item of t.items) {
                    if (!byProduct.has(item.product_name)) byProduct.set(item.product_name, { units: 0, revenue: 0 });
                    const p = byProduct.get(item.product_name)!;
                    p.units += item.quantity;
                    p.revenue += item.price * item.quantity;
                }
            }
            const byProductData = Array.from(byProduct.entries())
                .sort((a, b) => b[1].units - a[1].units)
                .map(([name, data]) => ({
                    Producto: name,
                    'Unidades Vendidas': data.units,
                    'Ingresos (₡)': data.revenue,
                }));

            const autoFitCols = (ws: XLSX.WorkSheet) => {
                const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
                const cols: { wch: number }[] = [];
                for (let C = range.s.c; C <= range.e.c; C++) {
                    let maxLen = 8;
                    for (let R = range.s.r; R <= range.e.r; R++) {
                        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                        if (cell?.v != null) maxLen = Math.max(maxLen, String(cell.v).length);
                    }
                    cols.push({ wch: Math.min(maxLen + 2, 60) });
                }
                ws['!cols'] = cols;
            };

            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.json_to_sheet(detailData);    autoFitCols(ws1);
            const ws2 = XLSX.utils.json_to_sheet(byUserData);    autoFitCols(ws2);
            const ws3 = XLSX.utils.json_to_sheet(byProductData); autoFitCols(ws3);
            XLSX.utils.book_append_sheet(wb, ws1, 'Detalle');
            XLSX.utils.book_append_sheet(wb, ws2, 'Por Cliente');
            XLSX.utils.book_append_sheet(wb, ws3, 'Por Producto');

            const dates = filtered.map(t => t.created_at ? new Date(t.created_at).getTime() : 0).filter(Boolean);
            const filename = dates.length > 0
                ? `informe-${fmt(new Date(Math.min(...dates)))}-${fmt(new Date(Math.max(...dates)))}.xlsx`
                : 'informe-ventas.xlsx';

            const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const file = new File(Paths.document, filename);
            if (file.exists) file.delete();
            file.create();
            file.write(wbout, { encoding: 'base64' });

            await Sharing.shareAsync(file.uri, {
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                dialogTitle: 'Exportar Ventas',
            });
        } catch (error) {
            alert('Error al exportar: ' + (error instanceof Error ? error.message : 'Desconocido'));
        }
    };

    const confirmClear = async () => {
        if (pin === '1234') {
            const result = await deleteAllTransactions();
            if (result.success) {
                toast.show({
                    placement: 'top',
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="success" variant="solid">
                            <ToastTitle>Historial Eliminado</ToastTitle>
                        </Toast>
                    ),
                });
                setShowClearModal(false);
                setPeriod('all');
                setSelectedUserId(null);
                loadAll();
            } else {
                toast.show({
                    placement: 'top',
                    render: ({ id }) => (
                        <Toast nativeID={'toast-' + id} action="error" variant="solid">
                            <ToastTitle>Error: {result.error}</ToastTitle>
                        </Toast>
                    ),
                });
            }
        } else {
            toast.show({
                placement: 'top',
                render: ({ id }) => (
                    <Toast nativeID={'toast-' + id} action="error" variant="solid">
                        <ToastTitle>PIN Incorrecto</ToastTitle>
                    </Toast>
                ),
            });
        }
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <Box bg="$white" px="$4" pt="$10" pb="$3" borderBottomWidth={1} borderColor="$coolGray200">
                <HStack justifyContent="space-between" alignItems="center" mb="$3">
                    <Heading size="md">Historial de Ventas</Heading>
                    <HStack space="sm">
                        <Button onPress={() => { setPin(''); setShowClearModal(true); }} size="sm" variant="outline" action="negative" borderColor="$red500">
                            <ButtonIcon as={TrashIcon} color="$red500" />
                        </Button>
                        <Button onPress={handleExport} size="sm" bg="$green600">
                            <ButtonIcon as={DownloadIcon} mr="$1" />
                            <ButtonText>Excel</ButtonText>
                        </Button>
                        <Button onPress={() => router.back()} size="sm" variant="link">
                            <ButtonIcon as={CloseIcon} />
                        </Button>
                    </HStack>
                </HStack>

                {/* Period filter */}
                <HStack space="sm" mb="$2">
                    {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                        <Pressable
                            key={p}
                            flex={1}
                            onPress={() => setPeriod(p)}
                            bg={period === p ? '$blue600' : '$coolGray100'}
                            borderRadius="$md"
                            py="$1.5"
                            alignItems="center"
                        >
                            <Text size="xs" fontWeight="$semibold" color={period === p ? '$white' : '$coolGray600'}>
                                {PERIOD_LABELS[p]}
                            </Text>
                        </Pressable>
                    ))}
                </HStack>

                {/* User filter */}
                <Pressable
                    onPress={() => setShowUserModal(true)}
                    bg={selectedUserId !== null ? '$blue50' : '$coolGray100'}
                    borderRadius="$md"
                    px="$3"
                    py="$2"
                    borderWidth={1}
                    borderColor={selectedUserId !== null ? '$blue300' : '$coolGray200'}
                >
                    <HStack justifyContent="space-between" alignItems="center">
                        <Text size="sm" color={selectedUserId !== null ? '$blue700' : '$coolGray500'}>
                            {selectedUserName ?? 'Filtrar por cliente…'}
                        </Text>
                        {selectedUserId !== null && (
                            <Pressable onPress={() => setSelectedUserId(null)}>
                                <Icon as={CloseIcon} size="sm" color="$blue500" />
                            </Pressable>
                        )}
                    </HStack>
                </Pressable>
            </Box>

            {/* Summary card */}
            {filtered.length > 0 && (
                <Box bg="$blue600" px="$4" py="$3">
                    <HStack justifyContent="space-between">
                        <VStack alignItems="center" flex={1}>
                            <Text color="$white" size="xs" opacity={0.8}>Ventas</Text>
                            <Text color="$white" fontWeight="$bold">{filtered.length}</Text>
                        </VStack>
                        <VStack alignItems="center" flex={1}>
                            <Text color="$white" size="xs" opacity={0.8}>Total</Text>
                            <Text color="$white" fontWeight="$bold">₡{totalAmount.toFixed(0)}</Text>
                        </VStack>
                        <VStack alignItems="center" flex={1}>
                            <Text color="$white" size="xs" opacity={0.8}>Promedio</Text>
                            <Text color="$white" fontWeight="$bold">₡{avgAmount.toFixed(0)}</Text>
                        </VStack>
                    </HStack>
                </Box>
            )}

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {filtered.map(item => (
                        <Card key={item.id} variant="elevated" p="$4">
                            <HStack justifyContent="space-between" mb="$2">
                                <Heading size="sm">{item.user_name || 'Cliente desconocido'}</Heading>
                                <Text color="$green600" fontWeight="bold">₡{item.total.toFixed(0)}</Text>
                            </HStack>
                            <Box borderTopWidth={1} borderColor="$coolGray100" py="$2" my="$1">
                                {item.items.map((prod, index) => (
                                    <Text key={index} size="sm" color="$coolGray600">
                                        {prod.quantity} {prod.product_name} — ₡{(prod.price * prod.quantity).toFixed(0)}
                                    </Text>
                                ))}
                            </Box>
                            <HStack justifyContent="space-between" mt="$2">
                                <Text size="xs" color="$coolGray400">{formatDate(item.created_at)}</Text>
                                <Text size="xs" color="$coolGray400">#{item.id}</Text>
                            </HStack>
                        </Card>
                    ))}
                    {filtered.length === 0 && (
                        <Box alignItems="center" mt="$10">
                            <Text color="$coolGray400">No hay ventas en este período</Text>
                        </Box>
                    )}
                </VStack>
            </ScrollView>

            {/* User filter modal */}
            <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)}>
                <ModalBackdrop />
                <ModalContent>
                    <ModalHeader>
                        <Heading size="md">Seleccionar Cliente</Heading>
                        <ModalCloseButton><Icon as={CloseIcon} /></ModalCloseButton>
                    </ModalHeader>
                    <ModalBody>
                        <ScrollView style={{ maxHeight: 300 }}>
                            <Pressable
                                py="$3"
                                borderBottomWidth={1}
                                borderColor="$coolGray100"
                                onPress={() => { setSelectedUserId(null); setShowUserModal(false); }}
                                bg={selectedUserId === null ? '$blue50' : '$white'}
                            >
                                <Text color={selectedUserId === null ? '$blue600' : '$coolGray700'} fontWeight="$semibold">
                                    Todos los clientes
                                </Text>
                            </Pressable>
                            {users.map(u => (
                                <Pressable
                                    key={u.id}
                                    py="$3"
                                    borderBottomWidth={1}
                                    borderColor="$coolGray100"
                                    onPress={() => { setSelectedUserId(u.id!); setShowUserModal(false); }}
                                    bg={selectedUserId === u.id ? '$blue50' : '$white'}
                                >
                                    <Text color={selectedUserId === u.id ? '$blue600' : '$coolGray700'}>
                                        {u.name}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </ModalBody>
                </ModalContent>
            </Modal>

            {/* Clear history modal */}
            <Modal isOpen={showClearModal} onClose={() => setShowClearModal(false)}>
                <ModalBackdrop />
                <ModalContent>
                    <ModalHeader>
                        <Heading size="lg">Borrar Historial</Heading>
                        <ModalCloseButton><Icon as={CloseIcon} /></ModalCloseButton>
                    </ModalHeader>
                    <ModalBody>
                        <Text size="sm" mb="$4" color="$coolGray500">
                            Esta acción eliminará todas las ventas registradas. Exporte el informe antes de continuar.
                        </Text>
                        <Text size="sm" fontWeight="bold" mb="$2">PIN de administrador:</Text>
                        <Input>
                            <InputField
                                type="password"
                                keyboardType="numeric"
                                maxLength={4}
                                value={pin}
                                onChangeText={setPin}
                                placeholder="****"
                            />
                        </Input>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="outline" size="sm" action="secondary" mr="$3" onPress={() => setShowClearModal(false)}>
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                        <Button size="sm" action="negative" bg="$red500" onPress={confirmClear}>
                            <ButtonText>Confirmar Borrado</ButtonText>
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}
