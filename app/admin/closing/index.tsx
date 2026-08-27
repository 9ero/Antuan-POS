import { Share, ScrollView as RNScrollView } from 'react-native';
import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Stack } from 'expo-router';
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import {
    CashClosing, ClosingSummary, ClosingProductSummary,
    ClosingInventoryItem,
    getCurrentPeriodStart, buildClosingSummary,
    createCashClosing, getCashClosings,
} from '@/db/queries';
import { isConfigured } from '@/db/turso';
import { getDeviceConfig, pushClosingToTurso, getSetting } from '@/db/sync';
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
    Pressable,
    Divider,
    Spinner,
    Modal,
    ModalBackdrop,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Icon,
    CloseIcon,
} from '@gluestack-ui/themed';

const fmt = (n: number) => `₡${Math.round(n).toLocaleString('es-CR')}`;

// Mismo umbral que la pantalla de Inventario (app/admin/inventory/index.tsx)
const LOW_STOCK = 5;

function autoFitCols(ws: XLSX.WorkSheet): void {
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
}
const fmtDate = (d: string) => new Date(d.includes('T') ? d : d.replace(' ', 'T') + 'Z').toLocaleString('es-CR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
});

function daysColor(days: number | null): string {
    if (days === null) return '$coolGray400';
    if (days <= 7) return '$red500';
    if (days <= 14) return '$amber500';
    return '$emerald600';
}

interface BurnEntry extends ClosingProductSummary {
    totalConsumed: number;
    dailyBurn: number;
}

function computeStats(s: ClosingSummary) {
    const periodDays = Math.max(
        (new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime()) / 86400000,
        1
    );

    // Full sorted lists — used for both top-5 display and position lookup on every product
    const burnSorted: BurnEntry[] = [...s.byProduct]
        .filter(p => p.unitsSold + p.unitsLost > 0)
        .map(p => ({
            ...p,
            totalConsumed: p.unitsSold + p.unitsLost,
            dailyBurn: (p.unitsSold + p.unitsLost) / periodDays,
        }))
        .sort((a, b) => b.dailyBurn - a.dailyBurn);

    // Sorted by total profit generated from sales only (no losses)
    const profitSorted = [...s.byProduct]
        .filter(p => p.unitsSold > 0 && p.profit > 0)
        .sort((a, b) => b.profit - a.profit);

    const burnPositions = new Map(burnSorted.map((p, i) => [p.productId, i + 1]));
    const profitPositions = new Map(profitSorted.map((p, i) => [p.productId, i + 1]));

    return {
        burnRanking: burnSorted,
        profitRanking: profitSorted,
        burnPositions,
        profitPositions,
    };
}

function buildShareText(s: ClosingSummary): string {
    const lines: string[] = [
        `CIERRE DE CAJA`,
        `Período: ${fmtDate(s.openedAt)} → ${fmtDate(s.closedAt)}`,
        `Transacciones: ${s.transactionCount}`,
        `Total ventas: ${fmt(s.totalRevenue)}`,
        `Ganancia estimada: ${fmt(s.totalProfit)}`,
        '',
        'CLIENTES:',
    ];
    for (const u of s.byUser) {
        lines.push(`• ${u.userName} — ${fmt(u.total)} (${u.transactionCount} compras)`);
        for (const p of u.products) lines.push(`  ${p.name} ×${p.quantity}`);
    }
    lines.push('', 'PRODUCTOS:');
    for (const p of s.byProduct) {
        const days = p.daysRemaining !== null ? ` · ~${p.daysRemaining} días stock` : '';
        const lost = p.unitsLost > 0 ? ` · ${p.unitsLost} faltantes` : '';
        const transferred = p.unitsTransferred > 0 ? ` · ${p.unitsTransferred} trasladados` : '';
        lines.push(`• ${p.name} — ${p.unitsSold} vendidas${lost}${transferred}, ${fmt(p.revenue)}${days}`);
    }
    const { burnRanking, profitRanking } = computeStats(s);
    if (burnRanking.length > 0) {
        lines.push('', 'MÁS CONSUMIDOS (uds/día):');
        burnRanking.forEach((p, i) => {
            const depleted = p.currentStock === 0 ? ' [AGOTADO]' : '';
            lines.push(`  ${i + 1}. ${p.name} — ${p.dailyBurn.toFixed(1)} uds/día${depleted}`);
        });
    }
    if (profitRanking.length > 0) {
        lines.push('', 'MÁS RENTABLES (ganancia total):');
        profitRanking.forEach((p, i) => {
            lines.push(`  ${i + 1}. ${p.name} — ${fmt(p.profit)} ganancia · ${p.unitsSold} uds`);
        });
    }
    return lines.join('\n');
}

function StatsSection({ summary }: { summary: ClosingSummary }) {
    const { burnRanking, profitRanking } = computeStats(summary);
    if (burnRanking.length === 0 && profitRanking.length === 0) return null;

    return (
        <Card variant="elevated" p="$4">
            <Heading size="sm" mb="$3">Estadísticas del período</Heading>

            {burnRanking.length > 0 && (
                <VStack space="xs" mb="$4">
                    <Text size="xs" fontWeight="$semibold" color="$amber600" mb="$1">
                        CONSUMO MÁS RÁPIDO
                    </Text>
                    <RNScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator>
                        {burnRanking.map((p, i) => (
                            <HStack key={p.productId} justifyContent="space-between" alignItems="center" py="$1">
                                <HStack space="sm" alignItems="center" flex={1}>
                                    <Box
                                        w={24} h={24} borderRadius="$full" bg="$amber100"
                                        alignItems="center" justifyContent="center"
                                    >
                                        <Text size="xs" fontWeight="$bold" color="$amber700">{i + 1}</Text>
                                    </Box>
                                    <VStack flex={1}>
                                        <Text size="sm" fontWeight="$semibold">{p.name}</Text>
                                        <Text size="xs" color="$coolGray500">
                                            {p.unitsSold > 0 ? `${p.unitsSold} vend.` : ''}
                                            {p.unitsLost > 0 ? `${p.unitsSold > 0 ? ' · ' : ''}${p.unitsLost} falt.` : ''}
                                        </Text>
                                    </VStack>
                                </HStack>
                                <VStack alignItems="flex-end">
                                    <Text size="sm" fontWeight="$bold" color="$amber600">
                                        {p.dailyBurn.toFixed(1)} uds/día
                                    </Text>
                                    {p.currentStock === 0 && (
                                        <Text size="xs" color="$red500" fontWeight="$semibold">⚠ Agotado</Text>
                                    )}
                                </VStack>
                            </HStack>
                        ))}
                    </RNScrollView>
                </VStack>
            )}

            {profitRanking.length > 0 && (
                <VStack space="xs">
                    <Text size="xs" fontWeight="$semibold" color="$emerald600" mb="$1">
                        MAYOR GANANCIA GENERADA
                    </Text>
                    <RNScrollView style={{ maxHeight: 220 }} nestedScrollEnabled showsVerticalScrollIndicator>
                        {profitRanking.map((p, i) => (
                            <HStack key={p.productId} justifyContent="space-between" alignItems="center" py="$1">
                                <HStack space="sm" alignItems="center" flex={1}>
                                    <Box
                                        w={24} h={24} borderRadius="$full" bg="$emerald100"
                                        alignItems="center" justifyContent="center"
                                    >
                                        <Text size="xs" fontWeight="$bold" color="$emerald700">{i + 1}</Text>
                                    </Box>
                                    <VStack flex={1}>
                                        <Text size="sm" fontWeight="$semibold">{p.name}</Text>
                                        <Text size="xs" color="$coolGray500">{p.unitsSold} uds vendidas</Text>
                                    </VStack>
                                </HStack>
                                <VStack alignItems="flex-end">
                                    <Text size="sm" fontWeight="$bold" color="$emerald600">
                                        {fmt(p.profit)}
                                    </Text>
                                    <Text size="xs" color="$emerald600">ganancia</Text>
                                </VStack>
                            </HStack>
                        ))}
                    </RNScrollView>
                </VStack>
            )}
        </Card>
    );
}

export default function CashClosingScreen() {
    const [loading, setLoading] = useState(true);
    const [periodStart, setPeriodStart] = useState<string>('');
    const [summary, setSummary] = useState<ClosingSummary | null>(null);
    const [pastClosings, setPastClosings] = useState<CashClosing[]>([]);
    const [expandedUserKey, setExpandedUserKey] = useState<string | null>(null);
    const [expandedClosingId, setExpandedClosingId] = useState<number | null>(null);
    const [expandedHistorySummary, setExpandedHistorySummary] = useState<ClosingSummary | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
    const [lastSync, setLastSync] = useState<string | null>(null);

    useCallback(() => {
        getSetting('last_sync_at').then(setLastSync);
    }, []);

    const stats = useMemo(() => summary ? computeStats(summary) : null, [summary]);

    const exportExcel = async (s: ClosingSummary) => {
        const st = computeStats(s);
        const fmtN = (n: number) => Math.round(n);

        // Sheet 1: Resumen
        const resumenData = [
            { Campo: 'Período desde', Valor: fmtDate(s.openedAt) },
            { Campo: 'Período hasta', Valor: fmtDate(s.closedAt) },
            { Campo: 'Total transacciones', Valor: s.transactionCount },
            { Campo: 'Total ventas (₡)', Valor: fmtN(s.totalRevenue) },
            { Campo: 'Total costo (₡)', Valor: fmtN(s.totalCost) },
            { Campo: 'Ganancia estimada (₡)', Valor: fmtN(s.totalProfit) },
        ];

        // Sheet 2: Por Cliente
        const clienteRows: object[] = [];
        for (const u of s.byUser) {
            const first = u.products[0];
            clienteRows.push({
                Cliente: u.userName,
                Compras: u.transactionCount,
                'Total (₡)': fmtN(u.total),
                Producto: first?.name ?? '',
                Cantidad: first?.quantity ?? '',
                'Ingresos prod. (₡)': first ? fmtN(first.revenue) : '',
            });
            for (let i = 1; i < u.products.length; i++) {
                const p = u.products[i];
                clienteRows.push({
                    Cliente: '', Compras: '', 'Total (₡)': '',
                    Producto: p.name,
                    Cantidad: p.quantity,
                    'Ingresos prod. (₡)': fmtN(p.revenue),
                });
            }
        }

        // Sheet 3: Por Producto
        const productoRows = s.byProduct.map(p => ({
            Producto: p.name,
            Vendidas: p.unitsSold,
            Faltantes: p.unitsLost,
            Trasladados: p.unitsTransferred,
            'Ingresos (₡)': fmtN(p.revenue),
            'Costo (₡)': fmtN(p.cost),
            'Ganancia (₡)': fmtN(p.profit),
            'Stock actual': p.currentStock,
            'Días restantes': p.daysRemaining ?? '—',
            'Consumo/día': (p.unitsSold + p.unitsLost) > 0
                ? +((p.unitsSold + p.unitsLost) / Math.max(
                    (new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime()) / 86400000, 1
                  )).toFixed(2)
                : 0,
            'Ranking consumo': st.burnPositions.get(p.productId) ?? '—',
            'Ranking ganancia': st.profitPositions.get(p.productId) ?? '—',
        }));

        // Sheet 4: Estadísticas (array of arrays for custom layout)
        const statsAoa: (string | number)[][] = [
            ['CONSUMO MÁS RÁPIDO'],
            ['#', 'Producto', 'uds/día', 'Vendidas', 'Faltantes', 'Stock actual', 'Estado'],
            ...st.burnRanking.map((p, i) => [
                i + 1, p.name,
                +p.dailyBurn.toFixed(2),
                p.unitsSold, p.unitsLost, p.currentStock,
                p.currentStock === 0 ? 'Agotado' : 'Con stock',
            ]),
            [],
            ['MAYOR GANANCIA GENERADA'],
            ['#', 'Producto', 'Ganancia (₡)', 'Vendidas', 'Ingresos (₡)'],
            ...st.profitRanking.map((p, i) => [
                i + 1, p.name, fmtN(p.profit), p.unitsSold, fmtN(p.revenue),
            ]),
        ];

        // Sheet 5: Inventario (foto del stock al momento del cierre)
        // Los cierres anteriores a esta versión no traen la foto en su summary_json.
        const inv: ClosingInventoryItem[] = s.inventory ?? [];
        const stockState = (n: number) => n <= 0 ? 'Agotado' : n <= LOW_STOCK ? 'Stock bajo' : 'OK';
        const inventarioRows: object[] = inv.length === 0
            ? [{ Producto: 'Sin datos de inventario para este cierre' }]
            : [
                ...inv.map(p => ({
                    Producto: p.name,
                    Categoría: p.categoryName,
                    'Código de barras': p.barcode || '—',
                    Stock: p.stock,
                    Estado: stockState(p.stock),
                    'Costo unit. (₡)': fmtN(p.costPrice),
                    'Precio venta (₡)': fmtN(p.price),
                    'Valor a costo (₡)': fmtN(p.stockValueCost),
                    'Valor a venta (₡)': fmtN(p.stockValueSale),
                })),
                {
                    Producto: 'TOTAL',
                    Categoría: `${inv.length} productos`,
                    'Código de barras': '',
                    Stock: inv.reduce((a, p) => a + p.stock, 0),
                    Estado: `${inv.filter(p => p.stock <= 0).length} agotados · ${inv.filter(p => p.stock > 0 && p.stock <= LOW_STOCK).length} bajos`,
                    'Costo unit. (₡)': '',
                    'Precio venta (₡)': '',
                    'Valor a costo (₡)': fmtN(inv.reduce((a, p) => a + p.stockValueCost, 0)),
                    'Valor a venta (₡)': fmtN(inv.reduce((a, p) => a + p.stockValueSale, 0)),
                },
            ];

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(resumenData);   autoFitCols(ws1);
        const ws2 = XLSX.utils.json_to_sheet(clienteRows);   autoFitCols(ws2);
        const ws3 = XLSX.utils.json_to_sheet(productoRows);  autoFitCols(ws3);
        const ws4 = XLSX.utils.aoa_to_sheet(statsAoa);       autoFitCols(ws4);
        const ws5 = XLSX.utils.json_to_sheet(inventarioRows); autoFitCols(ws5);
        XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');
        XLSX.utils.book_append_sheet(wb, ws2, 'Por Cliente');
        XLSX.utils.book_append_sheet(wb, ws3, 'Por Producto');
        XLSX.utils.book_append_sheet(wb, ws4, 'Estadísticas');
        XLSX.utils.book_append_sheet(wb, ws5, 'Inventario');

        const dateStr = new Date(s.closedAt).toLocaleDateString('es-CR').replace(/\//g, '-');
        const filename = `cierre-${dateStr}.xlsx`;
        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const file = new File(Paths.document, filename);
        if (file.exists) file.delete();
        file.create();
        file.write(wbout, { encoding: 'base64' });
        await Sharing.shareAsync(file.uri, {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            dialogTitle: 'Exportar Cierre de Caja',
        });
    };

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [start, closings] = await Promise.all([getCurrentPeriodStart(), getCashClosings()]);
        setPeriodStart(start);
        setPastClosings(closings);
        const s = await buildClosingSummary(start, new Date().toISOString());
        setSummary(s);
        setLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

    const handleClose = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const closedAt = new Date().toISOString();
            const s = await buildClosingSummary(periodStart, closedAt);
            await createCashClosing(periodStart, closedAt, s.totalRevenue, JSON.stringify(s));
            setShowConfirmModal(false);
            await exportExcel(s);
            setExpandedUserKey(null);
            setExpandedClosingId(null);
            setExpandedHistorySummary(null);
            loadAll();

            // Push to Turso in background — don't block the UI
            if (isConfigured) {
                setSyncStatus('syncing');
                getDeviceConfig().then(cfg => {
                    if (!cfg) return;
                    return pushClosingToTurso(cfg.deviceId, periodStart, closedAt, s.totalRevenue, JSON.stringify(s));
                }).then(() => {
                    setSyncStatus('ok');
                    setLastSync(new Date().toISOString());
                }).catch(() => {
                    setSyncStatus('error');
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleHistoryClosing = (closing: CashClosing) => {
        if (expandedClosingId === closing.id) {
            setExpandedClosingId(null);
            setExpandedHistorySummary(null);
        } else {
            setExpandedClosingId(closing.id);
            setExpandedHistorySummary(JSON.parse(closing.summary_json) as ClosingSummary);
        }
    };

    return (
        <Box flex={1} bg="$coolGray50">
            <Stack.Screen options={{ title: 'Cierre de Caja', headerShown: true }} />

            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <VStack space="md">

                    {/* Period header */}
                    <Card variant="elevated" p="$4">
                        <Text size="xs" color="$coolGray400" mb="$1">PERÍODO ACTUAL</Text>
                        <Text size="sm" color="$coolGray600">
                            Desde: <Text fontWeight="$semibold">{periodStart ? fmtDate(periodStart) : '—'}</Text>
                        </Text>
                        <Text size="sm" color="$coolGray600" mb="$3">
                            Hasta: <Text fontWeight="$semibold">ahora</Text>
                        </Text>
                        {loading ? (
                            <HStack space="sm" alignItems="center" mt="$2">
                                <Spinner size="small" />
                                <Text size="sm" color="$coolGray400">Calculando reporte...</Text>
                            </HStack>
                        ) : summary ? (
                            <HStack space="md" flexWrap="wrap">
                                <Box bg="$blue50" px="$3" py="$2" borderRadius="$lg" flex={1}>
                                    <Text size="xs" color="$blue400">Transacciones</Text>
                                    <Text fontWeight="$bold" size="xl" color="$blue700">{summary.transactionCount}</Text>
                                </Box>
                                <Box bg="$blue50" px="$3" py="$2" borderRadius="$lg" flex={1}>
                                    <Text size="xs" color="$blue400">Ventas</Text>
                                    <Text fontWeight="$bold" size="lg" color="$blue700">{fmt(summary.totalRevenue)}</Text>
                                </Box>
                                <Box bg="$emerald50" px="$3" py="$2" borderRadius="$lg" flex={1}>
                                    <Text size="xs" color="$emerald600">Ganancia</Text>
                                    <Text fontWeight="$bold" size="lg" color="$emerald700">{fmt(summary.totalProfit)}</Text>
                                </Box>
                            </HStack>
                        ) : null}

                        {/* Sync status */}
                        {isConfigured && syncStatus !== 'idle' && (
                            <HStack space="xs" alignItems="center" mt="$2">
                                <Text size="xs" color={
                                    syncStatus === 'syncing' ? '$coolGray400' :
                                    syncStatus === 'ok' ? '$emerald600' : '$red500'
                                }>
                                    {syncStatus === 'syncing' ? '↑ Sincronizando con la nube...' :
                                     syncStatus === 'ok' ? '✓ Respaldo en la nube actualizado' :
                                     '✗ Error al sincronizar — reintentá desde Admin'}
                                </Text>
                            </HStack>
                        )}
                        {isConfigured && syncStatus === 'idle' && lastSync && (
                            <Text size="xs" color="$coolGray400" mt="$2">
                                Último respaldo: {new Date(lastSync).toLocaleString('es-CR')}
                            </Text>
                        )}
                    </Card>

                    {/* By user */}
                    {!loading && summary && summary.byUser.length > 0 && (
                        <Card variant="elevated" p="$4">
                            <Heading size="sm" mb="$3">Por Cliente</Heading>
                            <RNScrollView
                                style={{ maxHeight: 260 }}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator
                            >
                                <VStack space="sm">
                                    {summary.byUser.map(u => {
                                        const key = u.userId === null ? 'anon' : String(u.userId);
                                        const isOpen = expandedUserKey === key;
                                        return (
                                            <Box key={key}>
                                                <Pressable onPress={() => setExpandedUserKey(isOpen ? null : key)}>
                                                    <HStack justifyContent="space-between" alignItems="center" py="$1">
                                                        <VStack flex={1}>
                                                            <Text fontWeight="$semibold">{u.userName}</Text>
                                                            <Text size="xs" color="$coolGray500">
                                                                {u.transactionCount} compra{u.transactionCount !== 1 ? 's' : ''}
                                                            </Text>
                                                        </VStack>
                                                        <HStack space="sm" alignItems="center">
                                                            <Text fontWeight="$bold" color="$blue700">{fmt(u.total)}</Text>
                                                            <Text size="sm" color="$coolGray400">{isOpen ? '▲' : '▼'}</Text>
                                                        </HStack>
                                                    </HStack>
                                                </Pressable>
                                                {isOpen && (
                                                    <Box
                                                        bg="$coolGray50" p="$3" borderRadius="$md"
                                                        borderWidth={1} borderColor="$coolGray100" mb="$1"
                                                    >
                                                        {u.products.map(p => (
                                                            <HStack key={p.name} justifyContent="space-between" py="$0.5">
                                                                <Text size="sm" color="$coolGray700">{p.name} ×{p.quantity}</Text>
                                                                <Text size="sm" color="$coolGray500">{fmt(p.revenue)}</Text>
                                                            </HStack>
                                                        ))}
                                                    </Box>
                                                )}
                                                <Divider />
                                            </Box>
                                        );
                                    })}
                                </VStack>
                            </RNScrollView>
                        </Card>
                    )}

                    {/* By product */}
                    {!loading && summary && summary.byProduct.length > 0 && (
                        <Card variant="elevated" p="$4">
                            <Heading size="sm" mb="$3">Por Producto</Heading>
                            <RNScrollView
                                style={{ maxHeight: 280 }}
                                nestedScrollEnabled
                                showsVerticalScrollIndicator
                            >
                                <VStack space="xs">
                                    {summary.byProduct.map(p => {
                                        const burnPos = stats?.burnPositions.get(p.productId);
                                        const profitPos = stats?.profitPositions.get(p.productId);
                                        return (
                                        <Box key={p.productId}>
                                            <HStack justifyContent="space-between" alignItems="flex-start" py="$2">
                                                <VStack flex={1} mr="$2">
                                                    <HStack space="xs" alignItems="center" flexWrap="wrap" mb="$0.5">
                                                        <Text fontWeight="$semibold" size="sm">{p.name}</Text>
                                                        {burnPos !== undefined && (
                                                            <Box bg="$amber100" px="$1.5" py="$0.5" borderRadius="$sm">
                                                                <Text size="xs" color="$amber600" fontWeight="$bold">🔥#{burnPos}</Text>
                                                            </Box>
                                                        )}
                                                        {profitPos !== undefined && (
                                                            <Box bg="$emerald100" px="$1.5" py="$0.5" borderRadius="$sm">
                                                                <Text size="xs" color="$emerald600" fontWeight="$bold">💰#{profitPos}</Text>
                                                            </Box>
                                                        )}
                                                    </HStack>
                                                    <HStack space="sm" flexWrap="wrap" alignItems="center">
                                                        {p.unitsSold > 0 && (
                                                            <Text size="xs" color="$coolGray500">{p.unitsSold} vendidas</Text>
                                                        )}
                                                        {p.unitsLost > 0 && (
                                                            <Text size="xs" color="$red500" fontWeight="$semibold">
                                                                {p.unitsLost} faltantes
                                                            </Text>
                                                        )}
                                                        {p.unitsTransferred > 0 && (
                                                            <Text size="xs" color="$coolGray500" fontWeight="$semibold">
                                                                {p.unitsTransferred} trasladados
                                                            </Text>
                                                        )}
                                                        {p.daysRemaining !== null && (
                                                            <Text size="xs" color={daysColor(p.daysRemaining)} fontWeight="$semibold">
                                                                ~{p.daysRemaining} días
                                                            </Text>
                                                        )}
                                                    </HStack>
                                                </VStack>
                                                <VStack alignItems="flex-end">
                                                    <Text size="sm" color="$blue700" fontWeight="$semibold">{fmt(p.revenue)}</Text>
                                                    {p.cost > 0 && (
                                                        <Text size="xs" color="$emerald600">+{fmt(p.profit)} gan.</Text>
                                                    )}
                                                </VStack>
                                            </HStack>
                                            <Divider />
                                        </Box>
                                        );
                                    })}
                                </VStack>
                            </RNScrollView>
                        </Card>
                    )}

                    {/* Stats */}
                    {!loading && summary && summary.byProduct.length > 0 && (
                        <StatsSection summary={summary} />
                    )}

                    {/* Empty state */}
                    {!loading && summary && summary.transactionCount === 0 && (
                        <Card variant="elevated" p="$6">
                            <Text textAlign="center" color="$coolGray400">
                                No hay transacciones en este período.
                            </Text>
                        </Card>
                    )}

                    {/* Actions */}
                    {!loading && summary && summary.transactionCount > 0 && (
                        <Button
                            size="xl"
                            bg="$red600"
                            onPress={() => setShowConfirmModal(true)}
                        >
                            <ButtonText>Cerrar Caja</ButtonText>
                        </Button>
                    )}
                    {!loading && (!summary || summary.transactionCount === 0) && (
                        <Button size="xl" bg="$red600" isDisabled>
                            <ButtonText>Cerrar Caja</ButtonText>
                        </Button>
                    )}

                    {/* History */}
                    {pastClosings.length > 0 && (
                        <Box mt="$4">
                            <Heading size="sm" mb="$3" color="$coolGray600">Historial de Cierres</Heading>
                            <VStack space="sm">
                                {pastClosings.map(closing => {
                                    const isOpen = expandedClosingId === closing.id;
                                    const hs = isOpen ? expandedHistorySummary : null;
                                    return (
                                        <Card key={closing.id} variant="elevated" p="$3">
                                            <Pressable onPress={() => toggleHistoryClosing(closing)}>
                                                <HStack justifyContent="space-between" alignItems="center">
                                                    <VStack flex={1}>
                                                        <Text size="sm" fontWeight="$semibold">
                                                            {fmtDate(closing.opened_at).split(',')[0]} → {fmtDate(closing.closed_at).split(',')[0]}
                                                        </Text>
                                                        <Text size="xs" color="$coolGray400">
                                                            Cerrado el {fmtDate(closing.created_at)}
                                                        </Text>
                                                    </VStack>
                                                    <HStack space="sm" alignItems="center">
                                                        <Text fontWeight="$bold" color="$blue700">{fmt(closing.total_sales)}</Text>
                                                        <Text size="sm" color="$coolGray400">{isOpen ? '▲' : '▼'}</Text>
                                                    </HStack>
                                                </HStack>
                                            </Pressable>

                                            {isOpen && hs && (
                                                <Box mt="$3" pt="$3" borderTopWidth={1} borderColor="$coolGray100">
                                                    <Text size="xs" color="$coolGray500" mb="$3">
                                                        {hs.transactionCount} transacciones ·{' '}
                                                        Ganancia: <Text fontWeight="$semibold" color="$emerald600">{fmt(hs.totalProfit)}</Text>
                                                    </Text>

                                                    <Text size="xs" fontWeight="$semibold" color="$coolGray500" mb="$1">CLIENTES</Text>
                                                    <RNScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                                                        {hs.byUser.map(u => (
                                                            <HStack key={u.userId} justifyContent="space-between" py="$0.5">
                                                                <Text size="sm">{u.userName} ({u.transactionCount})</Text>
                                                                <Text size="sm" color="$blue700">{fmt(u.total)}</Text>
                                                            </HStack>
                                                        ))}
                                                    </RNScrollView>

                                                    <Text size="xs" fontWeight="$semibold" color="$coolGray500" mt="$2" mb="$1">PRODUCTOS</Text>
                                                    <RNScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                                                        {hs.byProduct.map(p => (
                                                            <HStack key={p.productId} justifyContent="space-between" alignItems="center" py="$0.5">
                                                                <VStack flex={1}>
                                                                    <Text size="sm">{p.name}</Text>
                                                                    <HStack space="sm">
                                                                        {p.unitsSold > 0 && <Text size="xs" color="$coolGray500">×{p.unitsSold} vend.</Text>}
                                                                        {p.unitsLost > 0 && <Text size="xs" color="$red500">×{p.unitsLost} falt.</Text>}
                                                                        {p.unitsTransferred > 0 && <Text size="xs" color="$coolGray500">×{p.unitsTransferred} trasl.</Text>}
                                                                    </HStack>
                                                                </VStack>
                                                                <Text size="sm" color="$blue700">{fmt(p.revenue)}</Text>
                                                            </HStack>
                                                        ))}
                                                    </RNScrollView>

                                                    {/* Stats in history */}
                                                    <Box mt="$3" pt="$3" borderTopWidth={1} borderColor="$coolGray100">
                                                        <StatsSection summary={hs} />
                                                    </Box>

                                                    <HStack space="sm" mt="$3">
                                                        <Button
                                                            flex={1} size="sm" variant="outline"
                                                            onPress={() => Share.share({ message: buildShareText(hs) })}
                                                        >
                                                            <ButtonText>Compartir</ButtonText>
                                                        </Button>
                                                        <Button
                                                            flex={1} size="sm" variant="outline"
                                                            onPress={() => exportExcel(hs)}
                                                        >
                                                            <ButtonText>Excel</ButtonText>
                                                        </Button>
                                                    </HStack>
                                                </Box>
                                            )}
                                        </Card>
                                    );
                                })}
                            </VStack>
                        </Box>
                    )}

                </VStack>
            </ScrollView>

            {/* Confirm modal */}
            <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)}>
                <ModalBackdrop />
                <ModalContent>
                    <ModalHeader>
                        <Heading size="md">Confirmar cierre de caja</Heading>
                        <ModalCloseButton><Icon as={CloseIcon} /></ModalCloseButton>
                    </ModalHeader>
                    <ModalBody>
                        <Text color="$coolGray600">
                            Se cerrará el período desde{' '}
                            <Text fontWeight="$semibold">{periodStart ? fmtDate(periodStart) : '—'}</Text>
                            {' '}hasta ahora y se generará el reporte.
                        </Text>
                        {summary && (
                            <HStack space="md" mt="$4">
                                <Box bg="$blue50" px="$3" py="$2" borderRadius="$lg" flex={1}>
                                    <Text size="xs" color="$blue400">Total ventas</Text>
                                    <Text fontWeight="$bold" color="$blue700">{fmt(summary.totalRevenue)}</Text>
                                </Box>
                                <Box bg="$blue50" px="$3" py="$2" borderRadius="$lg" flex={1}>
                                    <Text size="xs" color="$blue400">Transacciones</Text>
                                    <Text fontWeight="$bold" color="$blue700">{summary.transactionCount}</Text>
                                </Box>
                            </HStack>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="outline" size="sm" mr="$3" onPress={() => setShowConfirmModal(false)}>
                            <ButtonText>Cancelar</ButtonText>
                        </Button>
                        <Button size="sm" bg="$red600" isDisabled={isSubmitting} onPress={handleClose}>
                            <ButtonText>{isSubmitting ? 'Cerrando...' : 'Confirmar cierre'}</ButtonText>
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}
