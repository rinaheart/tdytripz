import {
  DEFAULT_CATEGORIES,
  DEFAULT_EXPENSES,
  DEFAULT_GAS_URL,
  DEFAULT_MEMBERS,
  DEFAULT_TRIP_CONFIG,
  sortCategoriesTailOrder,
} from '../config';
import { resolveMemberAvatarPalette } from '../components/MemberAvatar';
import type {
  AppStateData,
  Category,
  ExpenseRecord,
  HistoryEntry,
  Member,
  SyncQueueItem,
  TripConfig,
} from '../types';
import { generateUUID, getNowGMT7 } from '../utils/format';

const STORAGE_KEYS = {
  STATE: 'hn_trip_split_state_v2',
  QUEUE: 'hn_trip_split_queue_v2',
  USER_ID: 'hn_trip_current_user_id_v2',
  GAS_URL: 'hn_trip_gas_url_v3',
  DEMO_PIN: 'hn_trip_demo_admin_pin_v2',
  SIMULATE_OFFLINE: 'hn_trip_simulate_offline_v2',
};

const VALID_GAS_EXEC_REGEX = /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/;

export function isValidGasExecUrl(url: string): boolean {
  return VALID_GAS_EXEC_REGEX.test(url.trim());
}

/**
 * Lấy URL Google Apps Script Web App.
 * Bảo mật [SEC-05]: Khi DEFAULT_GAS_URL đã được cấu hình cứng trong src/config.ts,
 * khóa không cho phép tham số ?gas=... từ link lạ tự động ghi đè localStorage
 * nhằm chống tấn công phishing đánh cắp PIN Admin hoặc tráo STK nhận tiền.
 */
export function getGasUrl(): string {
  const cleanDefault = DEFAULT_GAS_URL.trim();

  if (typeof window !== 'undefined' && !cleanDefault) {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryGas = params.get('gas')?.trim();
      if (queryGas && isValidGasExecUrl(queryGas)) {
        localStorage.setItem(STORAGE_KEYS.GAS_URL, queryGas);
        return queryGas;
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  const stored = localStorage.getItem(STORAGE_KEYS.GAS_URL)?.trim();
  if (stored === '__NONE__') {
    return '';
  }
  if (stored && isValidGasExecUrl(stored)) {
    return stored;
  }
  return cleanDefault;
}

export function setGasUrl(url: string): void {
  const clean = url.trim();
  if (clean && isValidGasExecUrl(clean)) {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, clean);
  } else if (!clean) {
    localStorage.setItem(STORAGE_KEYS.GAS_URL, '__NONE__');
  }
}

export function buildShareableTripUrl(gasUrl: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.searchParams.delete('autostart');
  const cleanGas = gasUrl.trim();
  const cleanDefault = DEFAULT_GAS_URL.trim();
  // Nếu đã config cứng DEFAULT_GAS_URL trong src/config.ts trùng với link đang dùng,
  // trả về URL gốc gọn nhẹ (không cần đính kèm ?gas=...)
  if (cleanGas && cleanGas !== cleanDefault && !cleanDefault) {
    url.searchParams.set('gas', cleanGas);
  } else {
    url.searchParams.delete('gas');
  }
  return url.toString();
}

export function getCurrentUserId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.USER_ID);
}

export function setCurrentUserId(memberId: string): void {
  localStorage.setItem(STORAGE_KEYS.USER_ID, memberId);
}

export function getSimulateOffline(): boolean {
  return localStorage.getItem(STORAGE_KEYS.SIMULATE_OFFLINE) === 'true';
}

export function setSimulateOffline(val: boolean): void {
  localStorage.setItem(STORAGE_KEYS.SIMULATE_OFFLINE, val ? 'true' : 'false');
}

export function normalizeMembersList(rawMembers: Member[]): Member[] {
  return rawMembers.map((m, idx) => ({
    ...m,
    accountNo: String(m.accountNo ?? '')
      .replace(/\s+/g, '')
      .replace(/^'+/, ''),
    avatarColor: resolveMemberAvatarPalette(m, idx).hex,
  }));
}

export function loadAppState(): AppStateData {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppStateData>;
      if (parsed.config && Array.isArray(parsed.members) && Array.isArray(parsed.expenses)) {
        return {
          config: { ...DEFAULT_TRIP_CONFIG, ...parsed.config },
          members: normalizeMembersList(parsed.members),
          categories: sortCategoriesTailOrder(
            Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_CATEGORIES
          ),
          expenses: parsed.expenses,
          history: Array.isArray(parsed.history) ? parsed.history : [],
          lastSyncedAt: parsed.lastSyncedAt ?? getNowGMT7(false),
        };
      }
    }
  } catch {
    // Fall back to default state
  }

  const initial: AppStateData = {
    config: DEFAULT_TRIP_CONFIG,
    members: DEFAULT_MEMBERS,
    categories: DEFAULT_CATEGORIES,
    expenses: DEFAULT_EXPENSES,
    history: [
      {
        timestamp: '2026-10-15 14:32:10',
        actor: 'mem_duy',
        action: 'INIT_DEMO',
        entityType: 'Config',
        entityId: DEFAULT_TRIP_CONFIG.tripId,
        rev: 1,
        beforeJson: '',
        afterJson: JSON.stringify({ tripName: DEFAULT_TRIP_CONFIG.tripName }),
      },
    ],
    lastSyncedAt: getNowGMT7(false),
  };

  saveAppState(initial);
  return initial;
}

export function saveAppState(state: AppStateData): void {
  try {
    localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function resetToDemoData(): AppStateData {
  localStorage.removeItem(STORAGE_KEYS.STATE);
  localStorage.removeItem(STORAGE_KEYS.QUEUE);
  return loadAppState();
}

export function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.QUEUE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore
  }
  return [];
}

export function saveSyncQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
  } catch {
    // Ignore
  }
}

export const NON_RETRYABLE_SYNC_ERRORS = new Set<string>([
  'TRIP_COMPLETED',
  'PERMISSION_DENIED',
  'FORBIDDEN',
  'UNAUTHORIZED_ADMIN_PIN',
  'PIN_REQUIRED',
  'INVALID_PIN',
]);

export function isNonRetryableSyncError(errorCode?: string): boolean {
  if (!errorCode) return false;
  return NON_RETRYABLE_SYNC_ERRORS.has(String(errorCode).trim().toUpperCase());
}

/**
 * Xác định chủ sở hữu chỉnh sửa của khoản chi (ownerId):
 * - Phân biệt rõ `createdBy` (người tạo/kê khai bản ghi) và `payer` (người trả tiền thực tế).
 * - Chủ thể mặc định được phép chỉnh sửa là `createdBy`.
 * - Không tự động xem `payer` là chủ sở hữu khoản chi nếu `createdBy` đã xác định là thành viên khác;
 *   chỉ fallback sang `payer` khi dữ liệu cũ/nhập tay trên Sheet bị trống trường `createdBy`.
 */
export function getExpenseOwnerId(
  record: Pick<ExpenseRecord, 'createdBy' | 'payer'> | null | undefined
): string {
  if (!record) return '';
  const creator = String(record.createdBy || '').trim();
  if (creator) return creator;
  return String(record.payer || '').trim();
}

export function resolveExpenseOwnerMember(
  record: Pick<ExpenseRecord, 'createdBy' | 'payer'> | null | undefined,
  members: Member[]
): Member | undefined {
  const rawOwner = getExpenseOwnerId(record);
  if (!rawOwner) return undefined;
  const byId = members.find((m) => m.id === rawOwner);
  if (byId) return byId;
  const lower = rawOwner.toLowerCase();
  return members.find((m) => m.name.trim().toLowerCase() === lower);
}

export function canMemberModifyExpense(
  record: ExpenseRecord | null | undefined,
  currentUserId: string | null,
  members: Member[],
  isAdmin: boolean,
  tripStatus: 'active' | 'completed' = 'active'
): boolean {
  if (!record) return false;
  if (tripStatus === 'completed') return false;
  if (isAdmin) return true;
  if (record.deleted) return false;
  if (!currentUserId) return false;

  const ownerId = getExpenseOwnerId(record);
  if (!ownerId) return false;
  if (ownerId === currentUserId) return true;

  const currentMemberName =
    members.find((m) => m.id === currentUserId)?.name?.trim().toLowerCase() || '';
  return currentMemberName !== '' && ownerId.toLowerCase() === currentMemberName;
}

/**
 * Kiểm tra hai bản ghi chi tiêu có cùng nội dung nghiệp vụ hay không
 * Dùng để nhận diện gói tin retry idempotent (Server đã ghi thành công nhưng mạng timeout trước khi Client nhận phản hồi)
 */
export function isEquivalentExpensePayload(
  a: Partial<ExpenseRecord> | null | undefined,
  b: Partial<ExpenseRecord> | null | undefined
): boolean {
  if (!a || !b) return false;
  if (String(a.id || '') !== String(b.id || '')) return false;

  const opA = a.splitMeta?.lastOperationId;
  const opB = b.splitMeta?.lastOperationId;
  if (opA && opB && opA === opB) {
    return true;
  }

  if (String(a.type || 'expense') !== String(b.type || 'expense')) return false;
  if (String(a.title || '').trim() !== String(b.title || '').trim()) return false;
  if (Math.round(Number(a.amount || 0)) !== Math.round(Number(b.amount || 0))) return false;
  if (String(a.payer || '').trim() !== String(b.payer || '').trim()) return false;
  if (Boolean(a.deleted) !== Boolean(b.deleted)) return false;
  if (String(a.categoryId || 'cat_other') !== String(b.categoryId || 'cat_other')) return false;
  if (String(a.spentAt || '').trim() !== String(b.spentAt || '').trim()) return false;
  if (String(a.note || '').trim() !== String(b.note || '').trim()) return false;

  const splitsA = a.splits || {};
  const splitsB = b.splits || {};
  const keysA = Object.keys(splitsA)
    .filter((k) => Math.round(Number(splitsA[k] || 0)) > 0)
    .sort();
  const keysB = Object.keys(splitsB)
    .filter((k) => Math.round(Number(splitsB[k] || 0)) > 0)
    .sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const k = keysA[i];
    if (k !== keysB[i]) return false;
    if (Math.round(Number(splitsA[k] || 0)) !== Math.round(Number(splitsB[k] || 0))) {
      return false;
    }
  }
  return true;
}

/**
 * Thêm hoặc gộp một thay đổi khoản chi vào hàng đợi đồng bộ (Upsert theo record.id)
 */
export function enqueueExpenseUpsert(
  record: ExpenseRecord,
  baseRev: number,
  adminPin?: string
): SyncQueueItem[] {
  const queue = loadSyncQueue();
  const existingIdx = queue.findIndex((item) => item.record.id === record.id);

  // Nếu khoản chi vừa tạo Offline (baseRev === 0, chưa từng đẩy lên Server) mà bị xóa ngay khi vẫn còn trong hàng đợi
  // thì rút khỏi hàng đợi đồng bộ để không tạo dòng rác đã xóa trên Google Sheet.
  if (
    existingIdx >= 0 &&
    queue[existingIdx].baseRev === 0 &&
    queue[existingIdx].status !== 'syncing' &&
    record.deleted
  ) {
    queue.splice(existingIdx, 1);
    saveSyncQueue(queue);
    return queue;
  }

  const operationId = generateUUID();
  const pendingRecord: ExpenseRecord = {
    ...record,
    splitMeta: {
      ...(record.splitMeta || {}),
      lastOperationId: operationId,
    },
    syncStatus: 'pending',
  };

  const queueItem: SyncQueueItem = {
    queueId: existingIdx >= 0 ? queue[existingIdx].queueId : generateUUID(),
    operationId,
    action: record.deleted ? 'DELETE_EXPENSE' : 'UPSERT_EXPENSE',
    record: pendingRecord,
    // Giữ baseRev gốc nếu đang sửa chồng lên một bản ghi chưa gửi đi
    baseRev: existingIdx >= 0 ? queue[existingIdx].baseRev : baseRev,
    status: 'pending',
    retryCount: 0,
    errorCode: undefined,
    nonRetryable: false,
    errorMessage: undefined,
    adminPin: adminPin || (existingIdx >= 0 ? queue[existingIdx].adminPin : undefined),
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = queueItem;
  } else {
    queue.push(queueItem);
  }

  saveSyncQueue(queue);
  return queue;
}

/**
 * Gửi request POST đến Google Apps Script Web App
 * Lưu ý: Dùng Content-Type text/plain;charset=utf-8 để tránh CORS preflight OPTIONS bị GAS chặn.
 */
async function postToGas(gasUrl: string, payload: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lấy toàn bộ dữ liệu mới nhất từ Google Sheets (GET)
 */
export async function fetchAllFromGas(gasUrl?: string): Promise<{
  ok: boolean;
  data?: Partial<AppStateData>;
  error?: string;
}> {
  const targetUrl = (gasUrl ?? getGasUrl()).trim();
  if (!targetUrl) {
    return { ok: false, error: 'Chưa cấu hình GAS Web App URL' };
  }
  if (!navigator.onLine || getSimulateOffline()) {
    return { ok: false, error: 'Thiết bị đang ngoại tuyến (Offline)' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const sep = targetUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${targetUrl}${sep}t=${Date.now()}`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    if (!json.ok) {
      return { ok: false, error: json.error || 'Lỗi từ Google Apps Script' };
    }

    const rawCfg = json.config || {};
    const parsedConfig: Partial<TripConfig> = {};
    if (rawCfg.tripId) parsedConfig.tripId = String(rawCfg.tripId);
    if (rawCfg.tripName) parsedConfig.tripName = String(rawCfg.tripName);
    if (rawCfg.location) parsedConfig.location = String(rawCfg.location);
    if (rawCfg.startDate) parsedConfig.startDate = String(rawCfg.startDate).slice(0, 10);
    if (rawCfg.endDate) parsedConfig.endDate = String(rawCfg.endDate).slice(0, 10);
    if (rawCfg.tripStatus === 'completed' || rawCfg.tripStatus === 'active') {
      parsedConfig.tripStatus = rawCfg.tripStatus;
    }
    if (rawCfg.defaultSplitMode) parsedConfig.defaultSplitMode = rawCfg.defaultSplitMode;
    if (rawCfg.enabledSplitModes) {
      try {
        parsedConfig.enabledSplitModes =
          typeof rawCfg.enabledSplitModes === 'string'
            ? JSON.parse(rawCfg.enabledSplitModes)
            : rawCfg.enabledSplitModes;
      } catch {
        // Ignore
      }
    }
    if (rawCfg.suggestMultipliers) {
      try {
        parsedConfig.suggestMultipliers =
          typeof rawCfg.suggestMultipliers === 'string'
            ? JSON.parse(rawCfg.suggestMultipliers)
            : rawCfg.suggestMultipliers;
      } catch {
        // Ignore
      }
    }
    if (rawCfg.maxSuggestAmount) {
      parsedConfig.maxSuggestAmount = Number(rawCfg.maxSuggestAmount);
    }

    const expenses: ExpenseRecord[] = Array.isArray(json.expenses)
      ? json.expenses.map((e: ExpenseRecord) => {
          const cleanSplits: Record<string, number> = {};
          if (e.splits && typeof e.splits === 'object') {
            for (const [k, v] of Object.entries(e.splits)) {
              const num = Math.round(Number(v) || 0);
              if (num > 0) cleanSplits[k] = num;
            }
          }
          return {
            ...e,
            rev: Math.max(1, Math.round(Number(e.rev) || 1)),
            amount: Math.max(0, Math.round(Number(e.amount) || 0)),
            splits: cleanSplits,
            deleted: Boolean(e.deleted),
            syncStatus: 'synced' as const,
          };
        })
      : [];

    return {
      ok: true,
      data: {
        config: { ...DEFAULT_TRIP_CONFIG, ...parsedConfig },
        members:
          Array.isArray(json.members) && json.members.length > 0
            ? normalizeMembersList(json.members)
            : undefined,
        categories:
          Array.isArray(json.categories) && json.categories.length > 0
            ? sortCategoriesTailOrder(json.categories)
            : undefined,
        expenses,
        lastSyncedAt: (json.serverTime || getNowGMT7(false)).slice(0, 16),
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Không thể kết nối tới GAS URL' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hợp nhất danh sách chi tiêu tải từ Google Sheet với các bản ghi cục bộ đang nằm trong hàng đợi Offline/Conflict
 * đảm bảo không bao giờ làm mất dữ liệu chưa đồng bộ khi bấm Làm mới / Chuyển tab, đồng thời khử trùng lặp ID nếu Sheet bị sửa tay.
 */
export function mergeRemoteAndLocalExpenses(
  remoteExpenses: ExpenseRecord[],
  queue: SyncQueueItem[]
): ExpenseRecord[] {
  const dedupedMap = new Map<string, ExpenseRecord>();
  for (const raw of remoteExpenses || []) {
    if (!raw || !raw.id) continue;
    const id = String(raw.id);
    const sanitized: ExpenseRecord = {
      ...raw,
      id,
      rev: Math.max(1, Math.round(Number(raw.rev) || 1)),
      amount: Math.max(0, Math.round(Number(raw.amount) || 0)),
      deleted: Boolean(raw.deleted),
      syncStatus: raw.syncStatus || 'synced',
    };
    const prev = dedupedMap.get(id);
    if (
      !prev ||
      sanitized.rev > prev.rev ||
      (sanitized.rev === prev.rev &&
        String(sanitized.updatedAt || '') >= String(prev.updatedAt || ''))
    ) {
      dedupedMap.set(id, sanitized);
    }
  }

  const merged = Array.from(dedupedMap.values());
  if (!queue || queue.length === 0) return merged;

  for (const qItem of queue) {
    if (!qItem?.record?.id || qItem.status === 'synced') continue;
    const remoteRec = dedupedMap.get(qItem.record.id);

    const isServerSyncedRecord = !remoteRec?.syncStatus || remoteRec.syncStatus === 'synced';

    // Nếu bản trên Sheet đã trùng khớp hoàn toàn với bản đang chờ (do gói tin trước đã lưu thành công)
    if (
      remoteRec &&
      isServerSyncedRecord &&
      ((qItem.baseRev === 0 && remoteRec.rev === 1) ||
        (qItem.baseRev > 0 && remoteRec.rev >= qItem.baseRev + 1)) &&
      isEquivalentExpensePayload(qItem.record, remoteRec)
    ) {
      continue;
    }

    const localRec: ExpenseRecord = {
      ...qItem.record,
      syncStatus:
        qItem.status === 'conflict'
          ? 'conflict'
          : qItem.status === 'error'
          ? 'error'
          : 'pending',
    };
    const idx = merged.findIndex((e) => e.id === localRec.id);
    if (idx >= 0) {
      merged[idx] = localRec;
    } else {
      merged.unshift(localRec);
    }
  }

  return merged;
}

/**
 * Loại bỏ khỏi syncQueue những mục đã được ghi nhận thành công trên Google Sheet
 * (phục hồi tự động khi gói tin POST trước đó bị timeout nhưng Server đã commit xong).
 */
export function pruneSatisfiedQueueItems(
  remoteExpenses: ExpenseRecord[],
  queue: SyncQueueItem[]
): SyncQueueItem[] {
  if (!queue || queue.length === 0 || !remoteExpenses || remoteExpenses.length === 0) {
    return queue || [];
  }
  const remoteMap = new Map<string, ExpenseRecord>();
  for (const r of remoteExpenses) {
    if (r && r.id) {
      const prev = remoteMap.get(r.id);
      if (!prev || Number(r.rev || 1) >= Number(prev.rev || 1)) {
        remoteMap.set(r.id, r);
      }
    }
  }

  const nextQueue = queue.filter((qItem) => {
    if (!qItem?.record?.id || qItem.status === 'synced') return false;
    const remoteRec = remoteMap.get(qItem.record.id);
    const isServerSyncedRecord = !remoteRec?.syncStatus || remoteRec.syncStatus === 'synced';
    if (
      remoteRec &&
      isServerSyncedRecord &&
      ((qItem.baseRev === 0 && remoteRec.rev === 1) ||
        (qItem.baseRev > 0 && remoteRec.rev >= qItem.baseRev + 1)) &&
      isEquivalentExpensePayload(qItem.record, remoteRec)
    ) {
      return false;
    }
    return true;
  });

  if (nextQueue.length !== queue.length) {
    saveSyncQueue(nextQueue);
  }
  return nextQueue;
}

/**
 * Khởi tạo dữ liệu mẫu lên Google Sheet mới tinh (Yêu cầu xác thực adminPin - [SEC-01])
 */
export async function initializeSheetWithCurrentData(
  gasUrl: string,
  state: AppStateData,
  adminPin?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await postToGas(gasUrl, {
      action: 'initSeedData',
      adminPin: adminPin?.trim() || '',
      config: state.config,
      members: state.members,
      categories: state.categories,
      expenses: state.expenses,
    });
    if (!res.ok) {
      return { ok: false, error: res.message || res.error || 'Khởi tạo Sheet thất bại' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi kết nối GAS khi khởi tạo Sheet' };
  }
}

/**
 * Xác thực mã PIN Admin:
 * - Nếu đã cấu hình GAS URL: BẮT BUỘC gửi lên GAS kiểm tra với ScriptProperties ('ADMIN_PIN'),
 *   tuyệt đối không fallback về PIN Demo '1234' khi Offline nhằm chống vượt quyền cục bộ.
 * - Nếu đang ở chế độ Local Demo (chưa gắn GAS URL): Kiểm tra với PIN demo (mặc định '1234').
 */
export async function verifyAdminPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const cleanPin = pin.trim();
  if (!cleanPin) return { ok: false, error: 'Vui lòng nhập mã PIN' };

  const gasUrl = getGasUrl();
  if (gasUrl) {
    if (!navigator.onLine || getSimulateOffline()) {
      return {
        ok: false,
        error: 'Cần kết nối mạng để xác thực mã PIN Admin với Google Sheet',
      };
    }

    try {
      let res = await postToGas(gasUrl, {
        action: 'verifyAdminPin',
        pin: cleanPin,
      });

      // Nếu Google Sheet đang bận đồng bộ (LOCK_TIMEOUT), tự động đợi 1.2s rồi thử lại
      if (!res?.ok && res?.error === 'LOCK_TIMEOUT') {
        await new Promise((r) => setTimeout(r, 1200));
        res = await postToGas(gasUrl, {
          action: 'verifyAdminPin',
          pin: cleanPin,
        });
      }

      if (res?.ok) return { ok: true };

      if (res?.error === 'TOO_MANY_ATTEMPTS') {
        return {
          ok: false,
          error: res.message || 'Nhập sai PIN quá 5 lần. Tạm khóa 5 phút.',
        };
      }

      // Nếu trong máy đang lưu một link GAS cũ khác với DEFAULT_GAS_URL và báo sai PIN,
      // tự động kiểm tra với DEFAULT_GAS_URL chuẩn trong code
      const defaultUrl = DEFAULT_GAS_URL.trim();
      if (defaultUrl && gasUrl !== defaultUrl) {
        const fallbackRes = await postToGas(defaultUrl, {
          action: 'verifyAdminPin',
          pin: cleanPin,
        });
        if (fallbackRes?.ok) {
          setGasUrl(defaultUrl);
          return { ok: true };
        }
      }

      if (res?.error && res.error !== 'INVALID_PIN') {
        return { ok: false, error: `Lỗi từ Google Sheet: ${res.message || res.error}` };
      }

      return { ok: false, error: 'Mã PIN Admin không chính xác (trên Google Sheet)' };
    } catch {
      return { ok: false, error: 'Không kết nối được tới Google Sheet để xác thực PIN' };
    }
  }

  const demoPin = localStorage.getItem(STORAGE_KEYS.DEMO_PIN) || '1234';
  if (cleanPin === demoPin) {
    return { ok: true };
  }
  return { ok: false, error: 'Mã PIN không đúng (Mặc định chế độ Demo là 1234)' };
}

export async function changeAdminPin(
  currentPin: string,
  newPin: string,
  actor: string
): Promise<{ ok: boolean; error?: string }> {
  const cleanNew = newPin.trim();
  if (cleanNew.length < 4) {
    return { ok: false, error: 'Mã PIN mới phải có ít nhất 4 ký tự' };
  }

  const gasUrl = getGasUrl();
  if (gasUrl) {
    if (!navigator.onLine || getSimulateOffline()) {
      return {
        ok: false,
        error: 'Cần kết nối mạng để đổi mã PIN Admin trên Google Sheet',
      };
    }

    try {
      const res = await postToGas(gasUrl, {
        action: 'changeAdminPin',
        currentPin: currentPin.trim(),
        newPin: cleanNew,
        actor,
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: res.message || res.error || 'Không thể đổi PIN trên GAS' };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Lỗi mạng khi đổi mã PIN' };
    }
  }

  const demoPin = localStorage.getItem(STORAGE_KEYS.DEMO_PIN) || '1234';
  if (currentPin.trim() !== demoPin) {
    return { ok: false, error: 'Mã PIN hiện tại không đúng' };
  }
  localStorage.setItem(STORAGE_KEYS.DEMO_PIN, cleanNew);
  return { ok: true };
}

/**
 * Lưu cấu hình Admin (Members/STK, Categories, TripConfig)
 */
export async function syncAdminSettings(
  adminPin: string,
  actor: string,
  payload: {
    config?: TripConfig;
    members?: Member[];
    categories?: Category[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const gasUrl = getGasUrl();
  if (!gasUrl || !navigator.onLine || getSimulateOffline()) {
    return { ok: true };
  }

  try {
    const res = await postToGas(gasUrl, {
      action: 'saveAdminSettings',
      adminPin,
      actor,
      ...payload,
    });
    if (!res.ok) {
      return { ok: false, error: res.error || 'Lỗi lưu cấu hình Admin lên Sheet' };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi kết nối GAS' };
  }
}

/**
 * Đối chiếu hàng đợi sau khi hoàn tất phiên đồng bộ với hàng đợi mới nhất trong localStorage
 * nhằm bảo toàn 100% các thao tác Thêm/Sửa/Xóa của người dùng xảy ra trong lúc request mạng đang bay (In-Flight Race Condition).
 */
function reconcileQueueAndStateAfterSync(
  workingQueue: SyncQueueItem[],
  snapshotByQueueId: Map<string, SyncQueueItem>,
  syncedRecordsByQueueId: Map<string, ExpenseRecord>,
  workingState: AppStateData
): { finalQueue: SyncQueueItem[]; finalState: AppStateData } {
  const latestQueue = loadSyncQueue();
  const latestStoredState = loadAppState();
  const workingByQueueId = new Map<string, SyncQueueItem>();
  for (const w of workingQueue) {
    workingByQueueId.set(w.queueId, w);
  }

  const finalQueue: SyncQueueItem[] = [];
  const handledQueueIds = new Set<string>();

  for (const latestItem of latestQueue) {
    handledQueueIds.add(latestItem.queueId);
    const processed = workingByQueueId.get(latestItem.queueId);
    const snapshot = snapshotByQueueId.get(latestItem.queueId);

    // Mục mới được người dùng thêm vào hàng đợi trong lúc đang sync
    if (!processed || !snapshot) {
      finalQueue.push(latestItem);
      continue;
    }

    const wasEditedDuringSync =
      latestItem.record.updatedAt !== snapshot.record.updatedAt ||
      !isEquivalentExpensePayload(latestItem.record, snapshot.record);

    if (processed.status === 'synced') {
      const committedRec = syncedRecordsByQueueId.get(latestItem.queueId);
      if (wasEditedDuringSync && committedRec) {
        // Người dùng vừa sửa tiếp khoản chi này trong lúc bản cũ đang gửi lên Server:
        // Giữ lại bản sửa mới nhất với baseRev nối tiếp rev vừa được Server xác nhận!
        finalQueue.push({
          ...latestItem,
          baseRev: committedRec.rev,
          status: 'pending',
          retryCount: 0,
        });
      }
      continue;
    }

    if (wasEditedDuringSync && processed.status !== 'conflict') {
      finalQueue.push({
        ...latestItem,
        status: 'pending',
      });
    } else {
      finalQueue.push(processed);
    }
  }

  // Bảo toàn các mục conflict/error nếu chưa có trong latestQueue
  for (const w of workingQueue) {
    if (!handledQueueIds.has(w.queueId) && w.status !== 'synced') {
      finalQueue.push(w);
    }
  }

  // Hợp nhất danh sách expenses mới nhất từ localStorage (nếu người dùng vừa thêm/sửa mục mới trong lúc chờ mạng)
  const workingExpMap = new Map<string, ExpenseRecord>();
  for (const e of workingState.expenses) {
    workingExpMap.set(e.id, e);
  }

  const mergedExpenses: ExpenseRecord[] = [...workingState.expenses];
  for (const latestExp of latestStoredState.expenses || []) {
    if (!workingExpMap.has(latestExp.id)) {
      mergedExpenses.unshift(latestExp);
    }
  }

  const finalExpenses = mergeRemoteAndLocalExpenses(mergedExpenses, finalQueue);
  const finalState: AppStateData = {
    ...workingState,
    expenses: finalExpenses,
  };

  return { finalQueue, finalState };
}

/**
 * Thực thi đồng bộ hàng đợi syncQueue.
 * Hỗ trợ gom nhóm (Batch Upsert - [PERF-04]) khi có nhiều khoản chi đang chờ,
 * tự động nhận diện Idempotent Retry, chống Race Condition khi sửa lúc đang sync,
 * và tự động fallback sang gửi từng mục nếu GAS chưa nâng cấp phiên bản mới.
 */
export async function processSyncQueue(
  currentState: AppStateData,
  onStateUpdated: (nextState: AppStateData, nextQueue: SyncQueueItem[]) => void,
  onConflictDetected: (conflictItem: SyncQueueItem, serverRecord: ExpenseRecord) => void,
  activeAdminPin?: string
): Promise<{
  syncedCount: number;
  conflictCount: number;
  errorCount: number;
  tripLocked?: boolean;
}> {
  const queue = loadSyncQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, conflictCount: 0, errorCount: 0, tripLocked: false };
  }

  if (!navigator.onLine || getSimulateOffline()) {
    return { syncedCount: 0, conflictCount: 0, errorCount: queue.length, tripLocked: false };
  }

  // Khi chuyến đi đã khóa sổ (tripStatus === 'completed'), không cho phép đồng bộ các thao tác ghi mới
  // nhưng vẫn giữ nguyên hàng đợi cục bộ để không bao giờ âm thầm làm mất dữ liệu.
  if (currentState.config.tripStatus === 'completed') {
    const lockedQueue = queue.map((q) =>
      q.status === 'conflict'
        ? q
        : {
            ...q,
            status: 'error' as const,
            errorCode: 'TRIP_COMPLETED',
            nonRetryable: true,
            errorMessage:
              'Chuyến đi đã khóa sổ (TRIP_COMPLETED) — Chưa đẩy lên Google Sheet, dữ liệu vẫn giữ an toàn trên máy',
          }
    );
    const lockedState: AppStateData = {
      ...currentState,
      expenses: mergeRemoteAndLocalExpenses(currentState.expenses, lockedQueue),
    };
    saveSyncQueue(lockedQueue);
    saveAppState(lockedState);
    onStateUpdated(lockedState, lockedQueue);
    return {
      syncedCount: 0,
      conflictCount: lockedQueue.filter((q) => q.status === 'conflict').length,
      errorCount: lockedQueue.filter((q) => q.status === 'error').length,
      tripLocked: true,
    };
  }

  const gasUrl = getGasUrl();
  const workingState: AppStateData = {
    ...currentState,
    expenses: [...currentState.expenses],
    history: [...currentState.history],
  };

  // Nếu trước đó chuyến đi từng bị khóa (errorCode === 'TRIP_COMPLETED') nhưng nay Admin đã mở khóa (tripStatus === 'active'),
  // tự động gỡ cờ nonRetryable cho các mục TRIP_COMPLETED để cho phép đồng bộ lại.
  const workingQueue: SyncQueueItem[] = queue.map((q) => {
    const unlockedFromCompleted =
      currentState.config.tripStatus === 'active' && q.errorCode === 'TRIP_COMPLETED';
    return {
      ...q,
      status: unlockedFromCompleted ? 'pending' : q.status,
      errorCode: unlockedFromCompleted ? undefined : q.errorCode,
      nonRetryable: unlockedFromCompleted ? false : q.nonRetryable,
      record: { ...q.record },
    };
  });

  const snapshotByQueueId = new Map<string, SyncQueueItem>();
  for (const q of workingQueue) {
    snapshotByQueueId.set(q.queueId, { ...q, record: { ...q.record } });
  }
  const syncedRecordsByQueueId = new Map<string, ExpenseRecord>();

  let syncedCount = 0;
  let conflictCount = 0;
  let errorCount = 0;
  let tripLocked = false;

  // Chỉ gửi những mục không bị xung đột và không bị khóa bởi lỗi nghiệp vụ nonRetryable (trừ khi vừa mở quyền Admin)
  const isItemActionable = (item: SyncQueueItem): boolean => {
    if (item.status === 'conflict') return false;
    if (item.status === 'error' && item.nonRetryable) {
      if (
        activeAdminPin &&
        (item.errorCode === 'PERMISSION_DENIED' ||
          item.errorCode === 'FORBIDDEN' ||
          item.errorCode === 'UNAUTHORIZED_ADMIN_PIN' ||
          item.errorCode === 'PIN_REQUIRED')
      ) {
        return true;
      }
      return false;
    }
    return true;
  };

  // Thử đồng bộ Batch (1 HTTP POST cho toàn bộ hàng đợi) nếu có từ 2 mục trở lên
  const actionableIndices = workingQueue
    .map((item, idx) => (isItemActionable(item) ? idx : -1))
    .filter((idx) => idx >= 0);

  if (gasUrl && actionableIndices.length > 1) {
    try {
      const batchItems = actionableIndices.map((idx) => {
        const item = workingQueue[idx];
        const effectivePin = item.adminPin || activeAdminPin;
        const opId = item.operationId || item.record.splitMeta?.lastOperationId || item.queueId;
        workingQueue[idx] = {
          ...item,
          operationId: opId,
          status: 'syncing',
          lastAttemptAt: Date.now(),
        };
        return {
          queueId: item.queueId,
          operationId: opId,
          record: item.record,
          baseRev: item.baseRev,
          actor: item.record.updatedBy || item.record.createdBy,
          adminPin: effectivePin,
        };
      });
      saveSyncQueue(workingQueue);
      onStateUpdated(workingState, [...workingQueue]);

      const batchRes = await postToGas(gasUrl, {
        action: 'batchUpsertExpenses',
        adminPin: activeAdminPin,
        items: batchItems,
      });

      if (batchRes && !batchRes.ok && batchRes.error === 'TRIP_COMPLETED') {
        tripLocked = true;
        workingState.config = { ...workingState.config, tripStatus: 'completed' };
        for (const idx of actionableIndices) {
          const item = workingQueue[idx];
          workingQueue[idx] = {
            ...item,
            status: 'error',
            errorCode: 'TRIP_COMPLETED',
            nonRetryable: true,
            retryCount: (item.retryCount || 0) + 1,
            errorMessage:
              batchRes.message ||
              'Chuyến đi đã khóa sổ trên Google Sheet (TRIP_COMPLETED) — Chưa đẩy lên Sheet, dữ liệu vẫn giữ an toàn trên máy',
          };
          errorCount++;
        }
        const { finalQueue, finalState } = reconcileQueueAndStateAfterSync(
          workingQueue,
          snapshotByQueueId,
          syncedRecordsByQueueId,
          workingState
        );
        saveSyncQueue(finalQueue);
        saveAppState(finalState);
        onStateUpdated(finalState, finalQueue);
        return { syncedCount, conflictCount, errorCount, tripLocked: true };
      }

      if (batchRes && batchRes.ok && Array.isArray(batchRes.results)) {
        for (const entry of batchRes.results) {
          const qIdx = workingQueue.findIndex((q) => q.queueId === entry.queueId);
          if (qIdx < 0) continue;
          const item = workingQueue[qIdx];
          const res = entry.result;
          const itemOpId = item.operationId || item.record.splitMeta?.lastOperationId || item.queueId;

          const isIdempotentConflict =
            res &&
            res.error === 'CONFLICT' &&
            res.serverRecord &&
            ((item.baseRev === 0 && Number(res.serverRecord.rev) === 1) ||
              (item.baseRev > 0 && Number(res.serverRecord.rev) === item.baseRev + 1)) &&
            ((res.serverRecord.splitMeta?.lastOperationId &&
              res.serverRecord.splitMeta.lastOperationId === itemOpId) ||
              isEquivalentExpensePayload(item.record, res.serverRecord));

          if ((res && res.ok && res.id && res.rev) || isIdempotentConflict) {
            const committedRev = isIdempotentConflict
              ? Number(res.serverRecord.rev)
              : Number(res.rev);
            const syncedRecord: ExpenseRecord = {
              ...item.record,
              rev: committedRev,
              createdAt: String(
                (isIdempotentConflict ? res.serverRecord.createdAt : res.createdAt) ||
                  item.record.createdAt
              ),
              updatedAt: String(
                (isIdempotentConflict ? res.serverRecord.updatedAt : res.updatedAt) ||
                  getNowGMT7(true)
              ),
              syncStatus: 'synced',
            };
            const expIdx = workingState.expenses.findIndex((e) => e.id === syncedRecord.id);
            if (expIdx >= 0) {
              workingState.expenses[expIdx] = syncedRecord;
            } else {
              workingState.expenses.push(syncedRecord);
            }
            workingQueue[qIdx] = { ...item, status: 'synced' };
            syncedRecordsByQueueId.set(item.queueId, syncedRecord);
            syncedCount++;
          } else if (res && res.error === 'CONFLICT' && res.serverRecord) {
            const srvRec: ExpenseRecord = {
              ...res.serverRecord,
              syncStatus: 'conflict',
            };
            const conflictItem: SyncQueueItem = {
              ...item,
              status: 'conflict',
              errorCode: 'CONFLICT',
              nonRetryable: true,
              serverRecord: srvRec,
              errorMessage: 'Xung đột phiên bản (rev) trên Google Sheet',
            };
            workingQueue[qIdx] = conflictItem;
            const expIdx = workingState.expenses.findIndex((e) => e.id === item.record.id);
            if (expIdx >= 0) {
              workingState.expenses[expIdx] = {
                ...workingState.expenses[expIdx],
                syncStatus: 'conflict',
              };
            }
            conflictCount++;
            onConflictDetected(conflictItem, srvRec);
          } else {
            const errCode = String(res?.error || '').trim();
            const nonRetryable = isNonRetryableSyncError(errCode);
            if (errCode === 'TRIP_COMPLETED') {
              tripLocked = true;
              workingState.config = { ...workingState.config, tripStatus: 'completed' };
            }
            const errMsg = res?.message || res?.error || 'Lỗi phản hồi từ GAS';
            workingQueue[qIdx] = {
              ...item,
              status: 'error',
              errorCode: errCode || undefined,
              nonRetryable,
              retryCount: (item.retryCount || 0) + 1,
              errorMessage: errMsg,
            };
            errorCount++;
          }
        }

        workingState.lastSyncedAt = (batchRes.serverTime || getNowGMT7(false)).slice(0, 16);
        const { finalQueue, finalState } = reconcileQueueAndStateAfterSync(
          workingQueue,
          snapshotByQueueId,
          syncedRecordsByQueueId,
          workingState
        );
        saveSyncQueue(finalQueue);
        saveAppState(finalState);
        onStateUpdated(finalState, finalQueue);
        return { syncedCount, conflictCount, errorCount, tripLocked };
      }
    } catch {
      // Fallback xuống vòng lặp tuần tự nếu GAS chưa hỗ trợ batchUpsertExpenses hoặc mạng chập chờn
    }
  }

  for (let i = 0; i < workingQueue.length; i++) {
    const item = workingQueue[i];
    if (item.status === 'conflict') {
      conflictCount++;
      continue;
    }
    if (!isItemActionable(item)) {
      errorCount++;
      continue;
    }

    const itemOpId = item.operationId || item.record.splitMeta?.lastOperationId || item.queueId;

    // Đánh dấu đang gửi
    workingQueue[i] = {
      ...item,
      operationId: itemOpId,
      status: 'syncing',
      lastAttemptAt: Date.now(),
    };
    saveSyncQueue(workingQueue);
    onStateUpdated(workingState, [...workingQueue]);

    // Chế độ Local Demo (chưa gắn GAS URL): xác nhận đồng bộ tại chỗ với tăng rev chuẩn xác
    if (!gasUrl) {
      await new Promise((r) => setTimeout(r, 220));
      const nowFull = getNowGMT7(true);
      const nextRev = item.baseRev > 0 ? item.baseRev + 1 : 1;
      const syncedRecord: ExpenseRecord = {
        ...item.record,
        rev: nextRev,
        createdAt: item.baseRev === 0 ? nowFull : item.record.createdAt || nowFull,
        updatedAt: nowFull,
        syncStatus: 'synced',
      };

      const expIdx = workingState.expenses.findIndex((e) => e.id === syncedRecord.id);
      const beforeObj = expIdx >= 0 ? workingState.expenses[expIdx] : null;
      if (expIdx >= 0) {
        workingState.expenses[expIdx] = syncedRecord;
      } else {
        workingState.expenses.push(syncedRecord);
      }

      const historyEntry: HistoryEntry = {
        timestamp: nowFull,
        actor: syncedRecord.updatedBy || syncedRecord.createdBy,
        action: syncedRecord.deleted ? 'SOFT_DELETE' : item.baseRev === 0 ? 'CREATE' : 'UPDATE',
        entityType: 'Expense',
        entityId: syncedRecord.id,
        rev: nextRev,
        beforeJson: beforeObj ? JSON.stringify(beforeObj) : '',
        afterJson: JSON.stringify(syncedRecord),
      };
      workingState.history = [historyEntry, ...workingState.history.slice(0, 99)];
      workingState.lastSyncedAt = nowFull.slice(0, 16);

      workingQueue[i] = { ...item, status: 'synced' };
      syncedRecordsByQueueId.set(item.queueId, syncedRecord);
      syncedCount++;
      continue;
    }

    // Chế độ Google Apps Script thực tế
    try {
      const effectivePin = item.adminPin || activeAdminPin;
      let response = await postToGas(gasUrl, {
        action: 'upsertExpense',
        operationId: itemOpId,
        record: item.record,
        baseRev: item.baseRev,
        actor: item.record.updatedBy || item.record.createdBy,
        adminPin: effectivePin,
      });

      // Tương thích ngược nếu GAS trên Sheet là bản cũ chưa hỗ trợ tham số adminPin trong upsertExpense
      if (
        response &&
        !response.ok &&
        response.error === 'PERMISSION_DENIED' &&
        effectivePin
      ) {
        response = await postToGas(gasUrl, {
          action: 'upsertExpense',
          operationId: itemOpId,
          record: item.record,
          baseRev: item.baseRev,
          actor: getExpenseOwnerId(item.record),
          adminPin: effectivePin,
        });
      }

      if (response && !response.ok && response.error === 'TRIP_COMPLETED') {
        tripLocked = true;
        workingState.config = { ...workingState.config, tripStatus: 'completed' };
        const lockedMsg =
          response.message ||
          'Chuyến đi đã khóa sổ trên Google Sheet (TRIP_COMPLETED) — Chưa đẩy lên Sheet, dữ liệu vẫn giữ an toàn trên máy';
        for (let j = i; j < workingQueue.length; j++) {
          const rem = workingQueue[j];
          if (rem.status === 'conflict' || rem.status === 'synced') continue;
          workingQueue[j] = {
            ...rem,
            status: 'error',
            errorCode: 'TRIP_COMPLETED',
            nonRetryable: true,
            retryCount: j === i ? (rem.retryCount || 0) + 1 : rem.retryCount || 0,
            errorMessage: lockedMsg,
          };
          const expIdx = workingState.expenses.findIndex((e) => e.id === rem.record.id);
          if (expIdx >= 0) {
            workingState.expenses[expIdx] = {
              ...workingState.expenses[expIdx],
              syncStatus: 'error',
            };
          }
          errorCount++;
        }
        break;
      }

      const isIdempotentConflict =
        response &&
        response.error === 'CONFLICT' &&
        response.serverRecord &&
        ((item.baseRev === 0 && Number(response.serverRecord.rev) === 1) ||
          (item.baseRev > 0 && Number(response.serverRecord.rev) === item.baseRev + 1)) &&
        ((response.serverRecord.splitMeta?.lastOperationId &&
          response.serverRecord.splitMeta.lastOperationId === itemOpId) ||
          isEquivalentExpensePayload(item.record, response.serverRecord));

      if ((response && response.ok && response.id && response.rev) || isIdempotentConflict) {
        const committedRev = isIdempotentConflict
          ? Number(response.serverRecord.rev)
          : Number(response.rev);
        const syncedRecord: ExpenseRecord = {
          ...item.record,
          rev: committedRev,
          createdAt: String(
            (isIdempotentConflict ? response.serverRecord.createdAt : response.createdAt) ||
              item.record.createdAt
          ),
          updatedAt: String(
            (isIdempotentConflict ? response.serverRecord.updatedAt : response.updatedAt) ||
              getNowGMT7(true)
          ),
          syncStatus: 'synced',
        };

        const expIdx = workingState.expenses.findIndex((e) => e.id === syncedRecord.id);
        if (expIdx >= 0) {
          workingState.expenses[expIdx] = syncedRecord;
        } else {
          workingState.expenses.push(syncedRecord);
        }
        workingState.lastSyncedAt = getNowGMT7(false);
        workingQueue[i] = { ...item, status: 'synced' };
        syncedRecordsByQueueId.set(item.queueId, syncedRecord);
        syncedCount++;
      } else if (response && response.error === 'CONFLICT' && response.serverRecord) {
        const srvRec: ExpenseRecord = {
          ...response.serverRecord,
          syncStatus: 'conflict',
        };
        const conflictItem: SyncQueueItem = {
          ...item,
          status: 'conflict',
          errorCode: 'CONFLICT',
          nonRetryable: true,
          serverRecord: srvRec,
          errorMessage: 'Xung đột phiên bản (rev) trên Google Sheet',
        };
        workingQueue[i] = conflictItem;
        const expIdx = workingState.expenses.findIndex((e) => e.id === item.record.id);
        if (expIdx >= 0) {
          workingState.expenses[expIdx] = {
            ...workingState.expenses[expIdx],
            syncStatus: 'conflict',
          };
        }
        conflictCount++;
        onConflictDetected(conflictItem, srvRec);
      } else {
        const errCode = String(response?.error || '').trim();
        const nonRetryable = isNonRetryableSyncError(errCode);
        const errMsg = response?.message || response?.error || 'Lỗi phản hồi từ GAS';
        workingQueue[i] = {
          ...item,
          status: 'error',
          errorCode: errCode || undefined,
          nonRetryable,
          retryCount: (item.retryCount || 0) + 1,
          errorMessage: errMsg,
        };
        const expIdx = workingState.expenses.findIndex((e) => e.id === item.record.id);
        if (expIdx >= 0) {
          workingState.expenses[expIdx] = {
            ...workingState.expenses[expIdx],
            syncStatus: 'error',
          };
        }
        errorCount++;
      }
    } catch (err: any) {
      workingQueue[i] = {
        ...item,
        status: 'error',
        errorCode: 'NETWORK_ERROR',
        nonRetryable: false,
        retryCount: (item.retryCount || 0) + 1,
        errorMessage: err?.message || 'Mất kết nối khi đang đồng bộ',
      };
      const expIdx = workingState.expenses.findIndex((e) => e.id === item.record.id);
      if (expIdx >= 0) {
        workingState.expenses[expIdx] = {
          ...workingState.expenses[expIdx],
          syncStatus: 'error',
        };
      }
      errorCount++;
    }
  }

  const { finalQueue, finalState } = reconcileQueueAndStateAfterSync(
    workingQueue,
    snapshotByQueueId,
    syncedRecordsByQueueId,
    workingState
  );
  saveSyncQueue(finalQueue);
  saveAppState(finalState);
  onStateUpdated(finalState, finalQueue);

  return { syncedCount, conflictCount, errorCount, tripLocked };
}
