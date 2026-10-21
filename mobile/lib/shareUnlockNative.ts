/**
 * Share-to-unlock's native pieces (Messages composer + contact picker), loaded
 * only when this install has them.
 *
 * expo-sms and expo-contacts arrived with build 348 (3.1.5). Their JS looks the
 * native module up the moment it is imported and throws when it is missing, so
 * a top-level `import * as SMS from 'expo-sms'` crashed every OTA on the older
 * runtimes at launch (expo-updates then silently rolled those phones back to
 * the last good update). Never import them at module scope — go through here.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type ShareUnlockNative = {
    SMS: typeof import('expo-sms');
    Contacts: typeof import('expo-contacts');
};

/** True only on an install that ships both native modules (3.1.5+ on iOS). */
export function shareUnlockSupported(): boolean {
    if (Platform.OS !== 'ios') return false;
    return !!requireOptionalNativeModule('ExpoSMS') && !!requireOptionalNativeModule('ExpoContacts');
}

/** The modules, or null when this install can't run share-to-unlock. Never throws. */
export function loadShareUnlockNative(): ShareUnlockNative | null {
    if (!shareUnlockSupported()) return null;
    try {
        return { SMS: require('expo-sms'), Contacts: require('expo-contacts') };
    } catch {
        return null;
    }
}
