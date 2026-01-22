import { useState } from 'react';
import { useCameraPermissions } from 'expo-camera';

export const useScanner = () => {
    const [permission, requestPermission] = useCameraPermissions();
    const [isScanning, setIsScanning] = useState(false);

    const startScanning = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) return;
        }
        setIsScanning(true);
    };

    const stopScanning = () => setIsScanning(false);

    return {
        permission,
        isScanning,
        startScanning,
        stopScanning
    };
};
