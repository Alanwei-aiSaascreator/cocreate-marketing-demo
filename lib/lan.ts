import { networkInterfaces } from "node:os";

/**
 * 找出本机局域网 IP。
 *
 * 为什么需要：Demo 要在手机上扫码演示，但 localhost 的二维码手机扫了打不开。
 * 本地开发时把二维码里的 host 换成局域网 IP，手机就能直接进 H5。
 */
export function getLanIp(): string | null {
  const nets = networkInterfaces();
  const candidates: string[] = [];

  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    // 跳过虚拟网卡（VMware / WSL / VirtualBox / Hyper-V），它们扫不通
    if (/vmware|virtualbox|vethernet|wsl|loopback|docker/i.test(name)) continue;

    for (const addr of addrs) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      // 169.254.x.x 是 APIPA 链路本地地址（网卡没拿到 DHCP 时的兜底），
      // 手机连不上。next dev 会把它当作 Network 地址打印出来，但二维码不能用它。
      if (addr.address.startsWith("169.254.")) continue;
      candidates.push(addr.address);
    }
  }

  // 优先常见的家用/办公网段
  const preferred = candidates.find(
    (ip) => ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip),
  );
  return preferred ?? candidates[0] ?? null;
}

/** 把请求里的 host 换成局域网 host，方便手机扫码 */
export function toLanUrl(hostHeader: string | null, path: string): string {
  const port = hostHeader?.split(":")[1];
  const lanIp = getLanIp();
  const isLocal = !hostHeader || /^(localhost|127\.0\.0\.1|\[::1\])/.test(hostHeader);

  if (isLocal && lanIp) {
    return `http://${lanIp}${port ? `:${port}` : ""}${path}`;
  }
  return `http://${hostHeader ?? `localhost:3000`}${path}`;
}
