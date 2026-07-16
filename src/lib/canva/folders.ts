import { canvaApiUrl, getValidAccessToken } from './oauth';

export interface FolderItem {
  kind: 'folder' | 'design' | 'other';
  id: string;
  name: string;
  thumbnailUrl: string | null;
}

async function canvaGet(path: string, token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${canvaApiUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429) throw new Error('rate_limited');
  if (!res.ok) throw new Error(`Canva API returned HTTP ${res.status}`);
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

interface RawItem {
  type?: string;
  folder?: { id?: string; name?: string; thumbnail?: { url?: string } };
  design?: { id?: string; title?: string; thumbnail?: { url?: string } };
  id?: string;
  name?: string;
}

/**
 * List every item in a Canva folder, following continuation tokens. `itemTypes` filters
 * (e.g. ['folder'] or ['design']). Bounded to avoid an unbounded loop.
 */
export async function listFolderItems(
  folderId: string,
  itemTypes?: string[],
): Promise<{ items: FolderItem[] } | { error: string }> {
  const tok = await getValidAccessToken();
  if ('error' in tok) return { error: tok.error };

  const items: FolderItem[] = [];
  let continuation: string | undefined;
  let guard = 0;
  try {
    do {
      const params = new URLSearchParams();
      if (itemTypes?.length) params.set('item_types', itemTypes.join(','));
      params.set('sort_by', 'modified_descending');
      if (continuation) params.set('continuation', continuation);
      const data = await canvaGet(`/folders/${encodeURIComponent(folderId)}/items?${params.toString()}`, tok.token);
      const raw = Array.isArray(data['items']) ? (data['items'] as RawItem[]) : [];
      for (const it of raw) {
        const kind: FolderItem['kind'] = it.type === 'folder' ? 'folder' : it.type === 'design' ? 'design' : 'other';
        const node = it.folder ?? it.design ?? it;
        const id = node.id ?? it.id ?? '';
        if (!id) continue;
        items.push({
          kind,
          id,
          name: (it.folder?.name ?? it.design?.title ?? it.name ?? '(untitled)').toString(),
          thumbnailUrl: it.folder?.thumbnail?.url ?? it.design?.thumbnail?.url ?? null,
        });
      }
      continuation = typeof data['continuation'] === 'string' ? (data['continuation'] as string) : undefined;
      guard += 1;
    } while (continuation && guard < 50);
    return { items };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Browse sub-folders of a folder (root by default) for the folder-picker UI. */
export async function browseFolders(folderId = 'root'): Promise<{ items: FolderItem[] } | { error: string }> {
  return listFolderItems(folderId, ['folder']);
}

/** Confirm a configured folder is still reachable (used by the settings "Test connection" action). */
export async function folderAccessible(folderId: string): Promise<boolean> {
  const res = await listFolderItems(folderId, ['design']);
  return !('error' in res);
}
