/**
 * Shared navigation container ref. Lets non-screen code (e.g. the DevDrawer)
 * navigate from anywhere, and crucially survives RootNavigator stack swaps
 * (guest <-> unpaid <-> paid), which a useNavigation() hook does not.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();
