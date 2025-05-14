import * as React from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { rotateImage } from '../modules/imaging';
import { toBase64Image } from '../utils/base64';
import { Agent } from '../agent/Agent';
import { InvalidateSync } from '../utils/invalidateSync';
import { textToSpeech } from '../modules/openai';

function usePhotos(device: BluetoothRemoteGATTServer) {
    // Subscribe to device
    const [photos, setPhotos] = React.useState<Uint8Array[]>([]);
    const [subscribed, setSubscribed] = React.useState<boolean>(false);
    const photoControlCharRef = React.useRef<BluetoothRemoteGATTCharacteristic | null>(null);
    const [isCapturing, setIsCapturing] = React.useState(false);
    
    const takePhoto = React.useCallback(async () => {
        if (photoControlCharRef.current && !isCapturing) {
            try {
                setIsCapturing(true);
                await photoControlCharRef.current.writeValue(new Uint8Array([0x01]));
                console.log('Capture photo command sent');
                // 延迟恢复按钮状态，因为拍照需要一点时间
                setTimeout(() => setIsCapturing(false), 2000);
            } catch (error) {
                console.error('Error sending capture command:', error);
                setIsCapturing(false);
            }
        } else {
            console.error('Photo control characteristic not available or already capturing');
        }
    }, [isCapturing, photoControlCharRef]);

    const clearPhotos = React.useCallback(() => {
        setPhotos([]);
    }, []);

    React.useEffect(() => {
        (async () => {
            let previousChunk = -1;
            let buffer: Uint8Array = new Uint8Array(0);
            function onChunk(id: number | null, data: Uint8Array) {

                // Resolve if packet is the first one
                if (previousChunk === -1) {
                    if (id === null) {
                        return;
                    } else if (id === 0) {
                        previousChunk = 0;
                        buffer = new Uint8Array(0);
                    } else {
                        return;
                    }
                } else {
                    if (id === null) {
                        console.log('Photo received', buffer);
                        rotateImage(buffer, '270').then((rotated) => {
                            console.log('Rotated photo', rotated);
                            setPhotos((p) => [...p, rotated]);
                        });
                        previousChunk = -1;
                        return;
                    } else {
                        if (id !== previousChunk + 1) {
                            previousChunk = -1;
                            console.error('Invalid chunk', id, previousChunk);
                            return;
                        }
                        previousChunk = id;
                    }
                }

                // Append data
                buffer = new Uint8Array([...buffer, ...data]);
            }

            // Subscribe for photo updates
            const service = await device.getPrimaryService('19B10000-E8F2-537E-4F6C-D104768a1214'.toLowerCase());
            const photoCharacteristic = await service.getCharacteristic('19b10005-e8f2-537e-4f6c-d104768a1214');
            await photoCharacteristic.startNotifications();
            setSubscribed(true);
            photoCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
                let value = (e.target as BluetoothRemoteGATTCharacteristic).value!;
                let array = new Uint8Array(value.buffer);
                if (array[0] == 0xff && array[1] == 0xff) {
                    onChunk(null, new Uint8Array());
                } else {
                    let packetId = array[0] + (array[1] << 8);
                    let packet = array.slice(2);
                    onChunk(packetId, packet);
                }
            });
            
            // 保存照片控制特征值引用，但不启动自动拍照
            const photoControlCharacteristic = await service.getCharacteristic('19b10006-e8f2-537e-4f6c-d104768a1214');
            photoControlCharRef.current = photoControlCharacteristic;
        })();
    }, []);

    return [subscribed, photos, takePhoto, isCapturing, clearPhotos] as const;
}

export const DeviceView = React.memo((props: { device: BluetoothRemoteGATTServer }) => {
    const [subscribed, photos, takePhoto, isCapturing, clearPhotos] = usePhotos(props.device);
    const agent = React.useMemo(() => new Agent(), []);
    const agentState = agent.use();

    // Add this function to handle clearing photos
    const handleClearPhotos = React.useCallback(() => {
        // Clear photos in the UI
        clearPhotos();
        // Clear photos in the Agent
        agent.clearPhotos();
        console.log('All photos cleared (UI and Agent)');
    }, [clearPhotos, agent]);

    // Add this useEffect to ensure the photo array is empty at the start of each session
    React.useEffect(() => {
        // Ensure the Agent's photo array is empty
        agent.clearPhotos();
        console.log('Agent photos initialized');
    }, [agent]);

    // Background processing agent
    const processedPhotos = React.useRef<Uint8Array[]>([]);
    const sync = React.useMemo(() => {
        let processed = 0;
        return new InvalidateSync(async () => {
            if (processedPhotos.current.length > processed) {
                let unprocessed = processedPhotos.current.slice(processed);
                processed = processedPhotos.current.length;
                await agent.addPhoto(unprocessed);
            }
        });
    }, []);
    React.useEffect(() => {
        processedPhotos.current = photos;
        sync.invalidate();
    }, [photos]);

    React.useEffect(() => {
        if (agentState.answer) {
            textToSpeech(agentState.answer)
        }
    }, [agentState.answer])

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {photos.map((photo, index) => (
                        <Image key={index} style={{ width: 100, height: 100 }} source={{ uri: toBase64Image(photo) }} />
                    ))}
                </View>
            </View>

            <View style={{ backgroundColor: 'rgb(28 28 28)', height: 600, width: 600, borderRadius: 64, flexDirection: 'column', padding: 64 }}>
                {/* Add photo capture button */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <Text onPress={takePhoto} style={{ 
                        color: 'white', 
                        fontSize: 20, 
                        backgroundColor: isCapturing ? '#666' : '#2196F3',
                        padding: 10,
                        borderRadius: 8,
                        textAlign: 'center',
                        width: 150,
                        opacity: isCapturing ? 0.7 : 1
                    }}>
                        {isCapturing ? 'Taking Photo...' : 'Take Photo'}
                    </Text>
                    
                    {/* Modify the click event handler for the Clear Photos button */}
                    <Text onPress={handleClearPhotos} style={{ 
                        color: 'white', 
                        fontSize: 20, 
                        backgroundColor: '#FF5722',
                        padding: 10,
                        borderRadius: 8,
                        textAlign: 'center',
                        width: 150,
                        marginTop: 10
                    }}>
                        Clear Photos
                    </Text>
                </View>

                <View style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
                    {agentState.loading && (<ActivityIndicator size="large" color={"white"} />)}
                    {agentState.answer && !agentState.loading && (<ScrollView style={{ flexGrow: 1, flexBasis: 0 }}><Text style={{ color: 'white', fontSize: 32 }}>{agentState.answer}</Text></ScrollView>)}
                </View>
                <TextInput
                    style={{ color: 'white', height: 64, fontSize: 32, borderRadius: 16, backgroundColor: 'rgb(48 48 48)', padding: 16 }}
                    placeholder='What do you need?'
                    placeholderTextColor={'#888'}
                    readOnly={agentState.loading}
                    onSubmitEditing={(e) => agent.answer(e.nativeEvent.text)}
                />
            </View>
        </View>
    );
});