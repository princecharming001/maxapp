import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import api from '../services/api';

// Open the Instagram / TikTok OAuth consent flow for the creator application.
//
// Native: openAuthSessionAsync — the system auth sheet (ASWebAuthenticationSession
// on iOS / Custom Tab on Android) that auto-closes when the backend callback
// redirects to our app scheme (cannon://creator-social-connected).
//
// Web: a popup window pointed at the auth URL; the backend callback shows a
// self-closing page. Either way the caller should re-fetch
// api.getCreatorSocialStatus() afterwards to pick up the new connection.
export async function openCreatorSocialAuth(
    platform: 'instagram' | 'tiktok',
): Promise<void> {
    if (Platform.OS === 'web') {
        const { auth_url } = await api.getCreatorSocialConnectUrl(platform);
        window.open(auth_url, '_blank', 'width=480,height=720');
        return;
    }

    const returnUrl = Linking.createURL('creator-social-connected');
    const { auth_url } = await api.getCreatorSocialConnectUrl(platform, returnUrl);
    if (!auth_url) {
        throw new Error(`The server did not return a ${platform} sign-in URL.`);
    }

    try {
        const res = await WebBrowser.openAuthSessionAsync(auth_url, returnUrl);
        // 'locked' = another auth session is in progress and this one never
        // presented — fall back to a plain browser sheet so the tap does something.
        if (res.type === 'locked') {
            await WebBrowser.openBrowserAsync(auth_url);
        }
    } catch {
        await WebBrowser.openBrowserAsync(auth_url);
    }
}
