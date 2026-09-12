export function isLocalHost(host: string | null) {
  return Boolean(host && /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host));
}
