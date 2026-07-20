/** Mid-ellipsis truncation for long hostnames in the popup toggle label. */
export function truncateHost(host: string, max = 28): string {
  if (host.length <= max) return host;
  const keep = max - 1;
  const head = Math.ceil(keep * 0.55);
  const tail = keep - head;
  return `${host.slice(0, head)}…${host.slice(-tail)}`;
}
