export const DISPLAY_PAGE_SIZE = 24;
export const QUERY_PAGE_SIZE = 500;

export function pageSlice<T>(items: readonly T[], requestedPage: number, size = DISPLAY_PAGE_SIZE) {
  const pageSize = Math.max(1, Math.floor(size));
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Math.floor(requestedPage) || 1));
  const offset = (page - 1) * pageSize;
  return { items: items.slice(offset, offset + pageSize), page, pageCount, total: items.length, from: items.length ? offset + 1 : 0, to: Math.min(offset + pageSize, items.length) };
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

// Metadata is fetched in bounded API pages so a collection never silently stops at
// PostgREST's row limit. Only visible UI pages request image URLs and image bytes.
export async function readAllPages<T>(request: (from: number, to: number) => PromiseLike<PageResult<T>>, size = QUERY_PAGE_SIZE): Promise<T[]> {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("分页大小无效");
  const rows: T[] = [];
  let expected: number | null = null;
  while (true) {
    const result = await request(rows.length, rows.length + size - 1);
    if (result.error) throw new Error(result.error.message);
    if (result.data === null) throw new Error("收藏列表加载不完整，请刷新后重试");
    if (result.count !== undefined && result.count !== null) {
      if (expected !== null && expected !== result.count) throw new Error("读取期间收藏数量发生变化，请刷新后重试");
      expected = result.count;
    }
    const page = result.data;
    rows.push(...page);
    if (expected !== null && rows.length > expected) throw new Error("收藏列表数量不一致，请刷新后重试");
    if (expected !== null && rows.length === expected) break;
    if (!page.length) {
      if (expected !== null && rows.length < expected) throw new Error("收藏列表加载不完整，请刷新后重试");
      break;
    }
    if (expected === null && page.length < size) break;
  }
  return rows;
}
