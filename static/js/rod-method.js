export function rodTypeMatchesMethod(type, method) {
  const methodName = String(method || "").trim().toLowerCase();
  if (!methodName) return true;
  const rodType = String(type || "").trim().toLowerCase().replace(/\s+rod$/, "");
  if (/^(trolling|downrigger|downrigging|dipsey|dipsy)( diver)?$/.test(rodType)) return methodName === "trolling";
  if (/^(casting|baitcaster|baitcasting|spincast|spincasting)$/.test(rodType)) return methodName === "casting";
  if (rodType === "spinning") return methodName !== "trolling";
  return true;
}
