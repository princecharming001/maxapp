/**
 * CreatorVideo — a feed video that autoplays muted and toggles sound on tap
 * (the standard vertical-feed interaction). expo-video is already a native dep,
 * so this is OTA-safe. A poster image shows until the player is ready.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

export default function CreatorVideo({
    uri,
    poster,
    height = 420,
    autoplay = true,
    rounded = 18,
}: {
    uri: string;
    poster?: string | null;
    height?: number;
    autoplay?: boolean;
    rounded?: number;
}) {
    const [muted, setMuted] = useState(true);
    const player = useVideoPlayer(uri, (p) => {
        p.loop = true;
        p.muted = true;
        if (autoplay) p.play();
    });

    const toggleSound = () => {
        const next = !muted;
        setMuted(next);
        try {
            player.muted = next;
            if (!next) player.play();
        } catch { /* player not ready */ }
    };

    return (
        <Pressable onPress={toggleSound} style={[styles.wrap, { height, borderRadius: rounded }]}>
            {poster ? (
                <ExpoImage source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : null}
            <VideoView
                style={StyleSheet.absoluteFill}
                player={player}
                contentFit="cover"
                nativeControls={false}
                allowsFullscreen={false}
            />
            <View style={styles.soundChip}>
                <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={15} color="#FFFFFF" />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrap: { width: '100%', overflow: 'hidden', backgroundColor: '#111113', borderCurve: 'continuous' },
    soundChip: {
        position: 'absolute', bottom: 12, right: 12,
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
    },
});
