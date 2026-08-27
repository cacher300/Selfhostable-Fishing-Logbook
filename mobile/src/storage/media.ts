import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { id } from "../domain/logbook";
import type { MediaRef } from "../domain/types";

const root = `${FileSystem.documentDirectory ?? FileSystem.cacheDirectory}media/`;
async function persistAsset(asset: ImagePicker.ImagePickerAsset, category: string): Promise<MediaRef> {
  const extension = (asset.fileName?.split(".").pop() || (asset.type === "video" ? "mp4" : "jpg")).toLowerCase();
  const filename = `${id()}.${extension}`, directory = `${root}${category}/`;
  await FileSystem.makeDirectoryAsync(directory, {intermediates:true});
  const uri = `${directory}${filename}`; await FileSystem.copyAsync({from:asset.uri,to:uri});
  return {id:id(),filename,category,mediaType:asset.type === "video" ? "video" : "image",uri,name:asset.fileName || filename,mimeType:asset.mimeType || ""};
}
export async function captureMedia(category: string): Promise<MediaRef | null> { const permission = await ImagePicker.requestCameraPermissionsAsync(); if (!permission.granted) throw new Error("Camera permission was not granted."); const result = await ImagePicker.launchCameraAsync({mediaTypes:["images","videos"],quality:0.85,videoMaxDuration:90}); return result.canceled ? null : persistAsset(result.assets[0],category); }
export async function chooseMedia(category: string): Promise<MediaRef | null> { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) throw new Error("Photo library permission was not granted."); const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:["images","videos"],quality:0.85}); return result.canceled ? null : persistAsset(result.assets[0],category); }
export async function chooseMediaMultiple(category: string): Promise<MediaRef[]> { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) throw new Error("Photo library permission was not granted."); const result = await ImagePicker.launchImageLibraryAsync({mediaTypes:["images","videos"],quality:0.85,allowsMultipleSelection:true}); return result.canceled ? [] : Promise.all(result.assets.map(asset=>persistAsset(asset,category))); }
export async function copyLocalMedia(media: MediaRef, category: string): Promise<MediaRef> { const source=String(media.uri||""); if (!source.startsWith(root)) return {...media,category}; const directory=`${root}${category}/`; await FileSystem.makeDirectoryAsync(directory,{intermediates:true}); const uri=`${directory}${media.filename}`; if(source!==uri)await FileSystem.copyAsync({from:source,to:uri}); return {...media,category,uri}; }
export async function deleteLocalMedia(media: MediaRef): Promise<void> { const uri=String(media.uri||""); if (!uri.startsWith(root)) return; const info=await FileSystem.getInfoAsync(uri); if (info.exists) await FileSystem.deleteAsync(uri,{idempotent:true}); }
