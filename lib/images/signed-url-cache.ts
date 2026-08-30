export type SignedImage = { url: string; expiresAt: number };
type SignedRow = { path: string | null; signedUrl: string | null; error?: string | null };
type Signer = (paths: string[], expiresIn: number) => Promise<{ data: SignedRow[] | null; error: { message: string } | null }>;
type Pending = { resolve: (value: SignedImage) => void; reject: (reason: Error) => void; promise: Promise<SignedImage> };

const TTL_SECONDS = 3600;
const REFRESH_MARGIN_MS = 60_000;
const BATCH_SIZE = 48;
const MAX_ENTRIES = 512;

// One instance per project/user/household Provider. Never persist private signed
// URLs in localStorage or share them across login sessions.
export class SignedUrlCache {
  private entries = new Map<string, SignedImage>();
  private pending = new Map<string, Pending>();
  private queued = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private sign: Signer;
  private now: () => number;

  constructor(sign: Signer, now: () => number = Date.now) { this.sign = sign; this.now = now; }

  get(path: string): Promise<SignedImage> {
    const cached = this.entries.get(path);
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > this.now()) {
      this.entries.delete(path);
      this.entries.set(path, cached);
      return Promise.resolve(cached);
    }
    const existing = this.pending.get(path);
    if (existing) return existing.promise;
    let resolve!: Pending["resolve"];
    let reject!: Pending["reject"];
    const promise = new Promise<SignedImage>((yes, no) => { resolve = yes; reject = no; });
    this.pending.set(path, { promise, resolve, reject });
    this.queued.add(path);
    if (!this.timer) this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 12);
    return promise;
  }

  invalidate(path: string) { this.entries.delete(path); }

  clear() {
    this.entries.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queued.clear();
    for (const entry of this.pending.values()) entry.reject(new Error("图片会话已切换"));
    this.pending.clear();
  }

  private async flush() {
    const paths = [...this.queued];
    this.queued.clear();
    // Bound batches as well as cache size; large screens cannot send an unlimited
    // signing request. Existing requests are coalesced by path.
    for (let offset = 0; offset < paths.length; offset += BATCH_SIZE) {
      const batch = paths.slice(offset, offset + BATCH_SIZE);
      const waiting = new Map(batch.map((path) => [path, this.pending.get(path)]));
      const issuedAt = this.now();
      try {
        const result = await this.sign(batch, TTL_SECONDS);
        if (result.error) throw new Error(result.error.message);
        const byPath = new Map((result.data ?? []).map((row) => [row.path, row]));
        for (const path of batch) {
          const waiter = waiting.get(path);
          if (!waiter || this.pending.get(path) !== waiter) continue;
          const row = byPath.get(path);
          if (!row?.signedUrl || row.error) { waiter.reject(new Error("照片链接暂时不可用")); }
          else {
            const value = { url: row.signedUrl, expiresAt: issuedAt + TTL_SECONDS * 1000 };
            this.entries.set(path, value);
            while (this.entries.size > MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
            waiter.resolve(value);
          }
          this.pending.delete(path);
        }
      } catch (error) {
        for (const path of batch) {
          const waiter = waiting.get(path);
          if (waiter && this.pending.get(path) === waiter) {
            waiter.reject(error instanceof Error ? error : new Error("照片链接加载失败"));
            this.pending.delete(path);
          }
        }
      }
    }
  }
}
