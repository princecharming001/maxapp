import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import api from '../services/api';

// Open the Google Calendar OAuth consent flow as a NATIVE auth sheet
// (ASWebAuthenticationSession on iOS / Chrome Custom Tab on Android) rather than
// a plain in-app browser tab.
//
// Why this over WebBrowser.openBrowserAsync:
//  - openBrowserAsync = SFSafariViewController, a full browser sheet with a URL
//    bar that reads as "Safari" and only closes on a status-poll + dismissBrowser.
//  - openAuthSessionAsync = the system "<App> Wants to Use google.com to Sign In"
//    sheet (same family as the native account Sign-In), and it AUTO-CLOSES the
//    moment the backend callback redirects to our app scheme — no poll/dismiss race.
//
// The app scheme is "cannon" (app.json), so Linking.createURL('google-connected')
// resolves to cannon://google-connected in a standalone build. We pass that to
// the backend so /google/callback can 302 back to it and dismiss the sheet.
export async function openGoogleCalendarAuth(
    includeGmail = false,
): Promise<WebBrowser.WebBrowserAuthSessionResult> {
    const returnUrl = Linking.createURL('google-connected');
    const { auth_url } = await api.getGoogleAuthUrl(includeGmail, returnUrl);
    return WebBrowser.openAuthSessionAsync(auth_url, returnUrl);
}
