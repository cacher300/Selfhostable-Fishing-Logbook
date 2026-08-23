import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { unzipSync, zipSync } from "fflate";
import { normalizeLogbook } from "../domain/logbook";
import type { Logbook } from "../domain/types";
import { ARCHIVE_VERSION } from "../domain/types";
import { storeWebMedia, webMediaUri } from "./web-media";

const root = FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? "";
const mediaRoot = `${root}media/`;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
type Entry = { name: string; data: Uint8Array };
export type ImportPreview = { logbook: Logbook; filename: string; trips: number; catches: number; mediaFiles: number; warnings: string[] };

function crc32(data: Uint8Array) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }
function concat(parts: Uint8Array[]) { const length = parts.reduce((sum, part) => sum + part.length, 0), result = new Uint8Array(length); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function bytesToBase64(bytes: Uint8Array) { let binary = ""; for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)); return btoa(binary); }
function base64ToBytes(value: string) { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }
async function readPickedBytes(asset: { uri: string; file?: File | null }) {
  if (Platform.OS === "web" && asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  return base64ToBytes(await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
}
async function readPickedText(asset: { uri: string; file?: File | null }) {
  if (Platform.OS === "web" && asset.file) return asset.file.text();
  return FileSystem.readAsStringAsync(asset.uri);
}

function createZip(entries: Entry[]) { return zipSync(Object.fromEntries(entries.map(entry=>[entry.name.replaceAll("\\","/"),entry.data])),{level:6}); }
function readZip(bytes: Uint8Array): Entry[] { return Object.entries(unzipSync(bytes)).map(([name,data])=>({name,data})); }

async function collectMedia(): Promise<Entry[]> { const info = await FileSystem.getInfoAsync(mediaRoot); if (!info.exists) return []; const entries: Entry[] = []; for (const category of await FileSystem.readDirectoryAsync(mediaRoot)) { const directory = `${mediaRoot}${category}/`; const directoryInfo = await FileSystem.getInfoAsync(directory); if (!directoryInfo.isDirectory) continue; for (const filename of await FileSystem.readDirectoryAsync(directory)) { const uri = `${directory}${filename}`, fileInfo = await FileSystem.getInfoAsync(uri); if (fileInfo.isDirectory) continue; entries.push({name:`media/${category}/${filename}`,data:base64ToBytes(await FileSystem.readAsStringAsync(uri,{encoding:FileSystem.EncodingType.Base64}))}); } } return entries; }

function portableLogbook(logbook: Logbook): Logbook { const clone=structuredClone(logbook); const walk=(value:unknown):void=>{if(Array.isArray(value)){value.forEach(walk);return}if(!value||typeof value!=="object")return;const record=value as Record<string,unknown>;if(typeof record.filename==="string"&&typeof record.category==="string"){delete record.uri;record.path=`${record.category}/${record.filename}`}Object.values(record).forEach(walk)};walk(clone);return clone; }
async function localizeLogbook(logbook: Logbook): Promise<Logbook> { const walk=async(value:unknown):Promise<void>=>{if(Array.isArray(value)){await Promise.all(value.map(walk));return}if(!value||typeof value!=="object")return;const record=value as Record<string,unknown>;let category=typeof record.category==="string"?record.category:"",filename=typeof record.filename==="string"?record.filename:"";const path=typeof record.path==="string"?record.path:"",url=typeof record.url==="string"?record.url:typeof record.image==="string"?record.image:"";if(path.includes("/"))[category,filename]=path.split("/",2);else if(url.startsWith("/uploads/"))[, ,category,filename]=url.split("/");if(category&&filename){record.category=category;record.filename=filename;const webUri=await webMediaUri(category,filename);record.uri=webUri??`${mediaRoot}${category}/${filename}`}await Promise.all(Object.values(record).map(walk))};await walk(logbook);return logbook; }

export async function exportLogbook(logbook: Logbook) { const manifest = {archiveVersion:ARCHIVE_VERSION,format:"fishing-logbook-archive",schemaVersion:logbook.schemaVersion,createdAt:new Date().toISOString()}; const entries: Entry[] = [{name:"manifest.json",data:encoder.encode(JSON.stringify(manifest))},{name:"logbook.json",data:encoder.encode(JSON.stringify(portableLogbook(logbook)))},...(await collectMedia())]; const uri = `${root}fishing-logbook-${Date.now()}.zip`; await FileSystem.writeAsStringAsync(uri,bytesToBase64(createZip(entries)),{encoding:FileSystem.EncodingType.Base64}); if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:"application/zip",dialogTitle:"Export Fishing Logbook"}); return uri; }

export async function importLogbook(): Promise<Logbook | null> { const result = await DocumentPicker.getDocumentAsync({type:["application/zip","application/json","text/json"],copyToCacheDirectory:true}); if (result.canceled) return null; const asset = result.assets[0] as typeof result.assets[number] & { file?: File | null }; if (asset.name.toLowerCase().endsWith(".json")) { const parsed = JSON.parse(await readPickedText(asset)); return validateLogbook(await localizeLogbook(normalizeLogbook(parsed.logbook ?? parsed))); } const entries = readZip(await readPickedBytes(asset)); const manifestEntry = entries.find(entry => entry.name === "manifest.json"), logbookEntry = entries.find(entry => entry.name === "logbook.json"); if (!manifestEntry || !logbookEntry) throw new Error("Archive is missing its manifest or logbook."); const manifest = JSON.parse(decoder.decode(manifestEntry.data)); if (manifest.archiveVersion !== ARCHIVE_VERSION) throw new Error("This archive version is not supported."); for (const entry of entries.filter(item => item.name.startsWith("media/"))) { const parts = entry.name.split("/"); if (parts.length < 3 || parts.some(part => !part || part === "." || part === "..")) throw new Error("Archive contains an invalid media path."); const category = parts[1], filename = parts.slice(2).join("/"); if (Platform.OS === "web") await storeWebMedia(category,filename,entry.data); else { const directory = `${mediaRoot}${parts.slice(1,-1).join("/")}/`; await FileSystem.makeDirectoryAsync(directory,{intermediates:true}); await FileSystem.writeAsStringAsync(`${directory}${parts.at(-1)}`,bytesToBase64(entry.data),{encoding:FileSystem.EncodingType.Base64}); } } return validateLogbook(await localizeLogbook(normalizeLogbook(JSON.parse(decoder.decode(logbookEntry.data))))); }

function validateLogbook(logbook:Logbook):Logbook {
  const duplicate=(items:Array<{id?:string}>,label:string)=>{const seen=new Set<string>();for(const item of items){if(!item.id)throw new Error(`${label} contains a record without an id.`);if(seen.has(item.id))throw new Error(`${label} contains duplicate id ${item.id}.`);seen.add(item.id)}};
  duplicate(logbook.trips,"Trips"); duplicate(logbook.locations,"Locations"); duplicate(logbook.lures,"Lures"); duplicate(logbook.flashers,"Flashers"); duplicate(logbook.rods,"Rods"); duplicate(logbook.reels,"Reels");
  for(const trip of logbook.trips){duplicate(trip.gearUsed,`${trip.title} setups`);duplicate(trip.catches,`${trip.title} catches`);duplicate(trip.lostFish,`${trip.title} lost fish`);const lines=new Set(trip.gearUsed.map(line=>line.id));for(const fish of [...trip.catches,...trip.lostFish])if(fish.setupLineId&&!lines.has(fish.setupLineId))throw new Error(`${trip.title} contains a fish referencing missing setup ${fish.setupLineId}.`)}
  return logbook;
}

export function mergeLogbooks(current:Logbook,incoming:Logbook):Logbook {
  const collections=["lures","flashers","rods","reels","rodReelCombos","people","locations","trips"] as const;
  const merged=structuredClone(current);
  for(const key of collections){const map=new Map((merged[key] as Array<Record<string,unknown>>).map(item=>[String(item.id),item]));for(const item of incoming[key] as Array<Record<string,unknown>>)map.set(String(item.id),item);(merged[key] as Array<Record<string,unknown>>)=Array.from(map.values())}
  return validateLogbook(normalizeLogbook(merged));
}
