import { Stack, useRouter } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { ScrollView as RNScrollView } from 'react-native';
import {
    getTransactions, getUsers, getProducts, getCurrentPeriodStart,
    TransactionDetail,
} from '@/db/queries';
import { User, Product } from '@/db/schemas';
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
} from '@gluestack-ui/themed';

type Period = 'period' | 'today' | 'week' | 'month' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
    period: 'Período',
    today: 'Hoy',
    week: '7 días',
    month: '30 días',
    all: 'Todo',
};

const fmt = (d: Date) =>
    `${d.getDate().toString().padStart(2, '0')}_${(d.getMonth() + 1).toString().padStart(2, '0')}_${d.getFullYear()}`;

const fmtCRC = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

export default function HistoryScreen() {
    const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [periodStart, setPeriodStart] = useState<string>('');
    const [period, setPeriod] = useState<Period>('period');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const router = useRouter();

    useFocusEffect(
        useCallback(() => {
            loadAll();
        }, [])
    );

    const loadAll = async () => {
        const [txs, us, prods, ps] = await Promise.all([
            getTransactions(),
            getUsers(),
            getProducts(),
            getCurrentPeriodStart(),
        ]);
        setTransactions(txs);
        setUsers(us);
        setProducts(prods);
        setPeriodStart(ps);
    };

    // SQLite CURRENT_TIMESTAMP stores UTC as 'YYYY-MM-DD HH:MM:SS' (no timezone marker).
    // JS parses that as local time, causing a 6-hour drift vs ISO strings from toISOString().
    // Only the 'period' filter mixes both formats, so we normalise to UTC explicitly there.
    const toUTC = (s: string) => new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');

    const filtered = useMemo(() => {
        let result = transactions;

        if (period === 'period' && periodStart) {
            const start = toUTC(periodStart);
            result = result.filter(t => t.created_at && toUTC(t.created_at) >= start);
        } else if (period !== 'all') {
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
    }, [transactions, period, selectedUserId, periodStart]);

    const stats = useMemo(() => {
        if (filtered.length === 0) return null;

        const refDate = period === 'period' && periodStart ? new Date(periodStart) : (() => {
            const d = new Date();
            if (period === 'today') d.setHours(0, 0, 0, 0);
            else if (period === 'week') d.setDate(d.getDate() - 7);
            else if (period === 'month') d.setMonth(d.getMonth() - 1);
            else d.setFullYear(2000);
            return d;
        })();
        const periodDays = Math.max((Date.now() - refDate.getTime()) / 86400000, 1);

        const costMap = new Map(products.map(p => [p.name, p.cost_price ?? 0]));
        const stockMap = new Map(products.map(p => [p.name, p.stock ?? 0]));

        const byProduct = new Map<string, { units: number; revenue: number; cost: number }>();
        const byUser = new Map<string, number>();

        for (const t of filtered) {
            byUser.set(t.user_name, (byUser.get(t.user_name) ?? 0) + t.total);
            for (const item of t.items) {
                const e = byProduct.get(item.product_name) ?? { units: 0, revenue: 0, cost: 0 };
                e.units += item.quantity;
                e.revenue += item.price * item.quantity;
                e.cost += (costMap.get(item.product_name) ?? 0) * item.quantity;
                byProduct.set(item.product_name, e);
            }
        }

        const productArr = [...byProduct.entries()].sort((a, b) => b[1].units - a[1].units);
        const topProduct = productArr[0];
        const topUser = [...byUser.entries()].sort((a, b) => b[1] - a[1])[0];
        const estimatedProfit = [...byProduct.values()].reduce((s, p) => s + p.revenue - p.cost, 0);

        const burnRates = productArr
            .map(([name, d]) => {
                const dailyRate = d.units / periodDays;
                const stock = stockMap.get(name) ?? 0;
                const daysLeft = dailyRate > 0 ? Math.round(stock / dailyRate) : null;
                return { name, units: d.units, dailyRate, daysLeft, stock };
            })
            .slice(0, 5);

        return { topProduct, topUser, estimatedProfit, burnRates };
    }, [filtered, products, periodStart, period]);

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

            const detailData = filtered.map(t => ({
                ID: t.id,
                Fecha: formatDate(t.created_at),
                Cliente: t.user_name,
                'Total (₡)': t.total,
                Productos: t.items.map(i => `${i.quantity} ${i.product_name}`).join(', '),
            }));

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

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <Box bg="$white" px="$4" pt="$10" pb="$3" borderBottomWidth={1} borderColor="$coolGray200">
                <HStack justifyContent="space-between" alignItems="center" mb="$3">
                    <Heading size="md">Historial de Ventas</Heading>
                    <HStack space="sm">
                        <Button onPress={handleExport} size="sm" bg="$blue600">
                            <ButtonIcon as={DownloadIcon} mr="$1" />
                            <ButtonText>Excel</ButtonText>
                        </Button>
                        <Button onPress={() => router.back()} size="sm" variant="link">
                            <ButtonIcon as={CloseIcon} />
                        </Button>
                    </HStack>
                </HStack>

                {/* Period filter */}
                <RNScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <HStack space="sm" mb="$2">
                        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                            <Pressable
                                key={p}
                                onPress={() => setPeriod(p)}
                                bg={period === p ? '$blue600' : '$coolGray100'}
                                borderRadius="$md"
                                px="$3"
                                py="$1.5"
                                alignItems="center"
                            >
                                <Text size="xs" fontWeight="$semibold" color={period === p ? '$white' : '$coolGray600'}>
                                    {PERIOD_LABELS[p]}
                                </Text>
                            </Pressable>
                        ))}
                    </HStack>
                </RNScrollView>

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

            {/* Summary bar */}
            {filtered.length > 0 && (
                <Box bg="$blue600" px="$4" py="$3">
                    <HStack justifyContent="space-between">
                        <VStack alignItems="center" flex={1}>
                            <Text color="$white" size="xs" opacity={0.8}>Ventas</Text>
                            <Text color="$white" fontWeight="$bold">{filtered.length}</Text>
                        </VStack>
                        <VStack alignItems="center" flex={1}>
                            <Text color="$white" size="xs" opacity={0.8}>Total</Text>
                            <Text color="$white" fontWeight="$bold">{fmtCRC(totalAmount)}</Text>
                        </VStack>
                        <VStack alignItems="center" flex={1}>
                            <Text color="$white" size="xs" opacity={0.8}>Promedio</Text>
                            <Text color="$white" fontWeight="$bold">{fmtCRC(avgAmount)}</Text>
                        </VStack>
                    </HStack>
                </Box>
            )}

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">
                    {/* Stats card */}
                    {stats && (
                        <Card variant="elevated" p="$4">
                            <Heading size="sm" mb="$3">Estadísticas del período</Heading>

                            <HStack space="md" mb="$3">
                                <VStack flex={1} bg="$blue50" p="$3" borderRadius="$md">
                                    <Text size="xs" color="$coolGray500" mb="$1">Producto más vendido</Text>
                                    <Text fontWeight="$bold" size="sm">{stats.topProduct?.[0] ?? '—'}</Text>
                                    <Text size="xs" color="$blue600">{stats.topProduct?.[1].units ?? 0} uds</Text>
                                </VStack>
                                <VStack flex={1} bg="$blue50" p="$3" borderRadius="$md">
                                    <Text size="xs" color="$coolGray500" mb="$1">Cliente top</Text>
                                    <Text fontWeight="$bold" size="sm">{stats.topUser?.[0] ?? '—'}</Text>
                                    <Text size="xs" color="$blue600">{fmtCRC(stats.topUser?.[1] ?? 0)}</Text>
                                </VStack>
                            </HStack>

                            <Box bg="$emerald50" p="$3" borderRadius="$md" mb="$3">
                                <Text size="xs" color="$coolGray500" mb="$1">Ganancia estimada del período</Text>
                                <Text fontWeight="$bold" color="$emerald700">{fmtCRC(stats.estimatedProfit)}</Text>
                                <Text size="xs" color="$coolGray400">Basada en costos actuales de productos</Text>
                            </Box>

                            {stats.burnRates.length > 0 && (
                                <>
                                    <Text size="xs" fontWeight="$semibold" color="$coolGray500" mb="$2">
                                        CONSUMO MÁS RÁPIDO (top {stats.burnRates.length})
                                    </Text>
                                    <VStack space="xs">
                                        {stats.burnRates.map((p, i) => (
                                            <HStack key={p.name} justifyContent="space-between" alignItems="center"
                                                py="$1.5" borderBottomWidth={i < stats.burnRates.length - 1 ? 1 : 0}
                                                borderColor="$coolGray100">
                                                <HStack alignItems="center" space="xs" flex={1}>
                                                    <Text size="xs" color="$amber500" fontWeight="$bold">#{i + 1}</Text>
                                                    <Text size="sm" flex={1} numberOfLines={1}>{p.name}</Text>
                                                </HStack>
                                                <VStack alignItems="flex-end">
                                                    <Text size="xs" color="$coolGray600">{p.dailyRate.toFixed(1)} uds/día</Text>
                                                    <Text size="xs" color={
                                                        p.daysLeft === null ? '$coolGray400' :
                                                        p.daysLeft <= 3 ? '$red500' :
                                                        p.daysLeft <= 7 ? '$amber500' : '$emerald600'
                                                    }>
                                                        {p.daysLeft === null ? 'sin consumo'
                                                            : p.stock === 0 ? 'agotado'
                                                            : `~${p.daysLeft} días`}
                                                    </Text>
                                                </VStack>
                                            </HStack>
                                        ))}
                                    </VStack>
                                </>
                            )}
                        </Card>
                    )}

                    {/* Transaction list */}
                    {filtered.map(item => (
                        <Card key={item.id} variant="elevated" p="$4">
                            <HStack justifyContent="space-between" mb="$2">
                                <Heading size="sm">{item.user_name || 'Cliente desconocido'}</Heading>
                                <Text color="$blue600" fontWeight="bold">{fmtCRC(item.total)}</Text>
                            </HStack>
                            <Box borderTopWidth={1} borderColor="$coolGray100" py="$2" my="$1">
                                {item.items.map((prod, index) => (
                                    <Text key={index} size="sm" color="$coolGray600">
                                        {prod.quantity} {prod.product_name} — {fmtCRC(prod.price * prod.quantity)}
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

        </Box>
    );
}
