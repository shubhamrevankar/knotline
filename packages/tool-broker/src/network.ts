import { isIP } from "node:net";

const forbiddenIpv4 = [
  /^0\./u,
  /^10\./u,
  /^127\./u,
  /^169\.254\./u,
  /^172\.(?:1[6-9]|2\d|3[01])\./u,
  /^192\.168\./u,
  /^224\./u,
  /^240\./u
];

export const isForbiddenIp = (address: string) => {
  if (isIP(address) === 4) return forbiddenIpv4.some((rule) => rule.test(address));
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }
  return true;
};

export const validateOutboundUrl = async (
  raw: string,
  allowedDestinations: readonly string[],
  resolve: (hostname: string) => Promise<readonly string[]>
) => {
  const url = new URL(raw);
  if (!new Set(["https:", "http:"]).has(url.protocol)) throw new Error("URL_SCHEME_DENIED");
  if (url.username || url.password) throw new Error("URL_CREDENTIALS_DENIED");
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  const allowed = allowedDestinations.some(
    (entry) => hostname === entry || (entry.startsWith("*.") && hostname.endsWith(entry.slice(1)))
  );
  if (!allowed) throw new Error("DESTINATION_NOT_ALLOWLISTED");
  const addresses = await resolve(hostname);
  if (addresses.length === 0 || addresses.some(isForbiddenIp))
    throw new Error("SSRF_ADDRESS_DENIED");
  return url;
};
