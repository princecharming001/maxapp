/**
 * Open an Amazon product: the Amazon Shopping app when it's installed,
 * otherwise Safari (never an in-app browser, so the person's Amazon login,
 * cart and Prime are all there).
 *
 * iOS rejects openURL for a scheme no installed app handles, so trying the
 * app's scheme first and falling back on rejection needs no
 * LSApplicationQueriesSchemes entry (canOpenURL would).
 */
import { Linking } from 'react-native';

export type AmazonOpenResult = 'app' | 'web' | 'failed';

export const amazonAppUrl = (asin: string) =>
    `com.amazon.mobile.shopping.web://www.amazon.com/dp/${asin}`;

export const amazonWebUrl = (asin: string) => `https://www.amazon.com/dp/${asin}`;

export async function openAmazonProduct(asin: string, fallbackUrl?: string): Promise<AmazonOpenResult> {
    const web = /^[A-Z0-9]{10}$/.test(asin) ? amazonWebUrl(asin) : fallbackUrl;
    if (/^[A-Z0-9]{10}$/.test(asin)) {
        try {
            await Linking.openURL(amazonAppUrl(asin));
            return 'app';
        } catch {
            // Amazon app not installed: Safari below.
        }
    }
    if (!web) return 'failed';
    try {
        await Linking.openURL(web);
        return 'web';
    } catch {
        return 'failed';
    }
}
