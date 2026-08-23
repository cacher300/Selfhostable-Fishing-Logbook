import * as Location from "expo-location";
import type { Coordinates } from "../domain/types";
export async function currentCoordinates(): Promise<Coordinates> { const permission = await Location.requestForegroundPermissionsAsync(); if (!permission.granted) throw new Error("Location permission was not granted."); const fix = await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced}); return {latitude:fix.coords.latitude,longitude:fix.coords.longitude}; }
