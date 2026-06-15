import * as Location from 'expo-location';

export type ClimateId = 'humid' | 'dry' | 'temperate' | 'cold';

/** Infer skinmax-style climate from device location + Open-Meteo (no API key). */
export async function inferClimateFromLocation(): Promise<ClimateId | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Low,
    });
    const { latitude, longitude } = pos.coords;

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}` +
      `&longitude=${longitude}&current=temperature_2m,relative_humidity_2m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const temp = Number(data?.current?.temperature_2m);
    const rh = Number(data?.current?.relative_humidity_2m);
    if (!Number.isFinite(temp) || !Number.isFinite(rh)) return null;

    if (temp <= 5) return 'cold';
    if (rh >= 70 && temp >= 18) return 'humid';
    if (rh <= 35) return 'dry';
    return 'temperate';
  } catch {
    return null;
  }
}
