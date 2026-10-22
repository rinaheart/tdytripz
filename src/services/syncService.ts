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
  DEVICE_TOKEN: 'hn_trip_device_token_v1',
};

const VALID_GAS_EXEC_REGEX = /^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/;

export function isValidGasExecUrl(url: string): boolean {
  return VALID_GAS_EXEC_REGEX.test(url.trim());
}

/**
 * Lấy hoặc khởi tạo mã định danh thiết bị (Device Token) lưu cục bộ
 * nhằm chống giả mạo người tạo (actor spoofing) khi sửa/xóa khoản chi.
 */
export function getDeviceToken(): string {
  try {
    let token = localStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
    if (!token) {
      token = `dev_${generateUUID()}`;
      localStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, token);
    }
    return token;
  } catch {
    return 'dev_local';
  }
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
    localStorage.removeItem(STORAGE_KEYS.GAS_URL);
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
  const deviceToken = getDeviceToken();

  const recordWithToken: ExpenseRecord = {
    ...record,
    splitMeta: {
      ...(record.splitMeta || {}),
      creatorToken: record.splitMeta?.creatorToken || (baseRev === 0 ? deviceToken : undefined),
    },
    syncStatus: 'pending',
  };

  const queueItem: SyncQueueItem = {
    queueId: existingIdx >= 0 ? queue[existingIdx].queueId : generateUUID(),
    action: record.deleted ? 'DELETE_EXPENSE' : 'UPSERT_EXPENSE',
    record: recordWithToken,
    // Giữ baseRev gốc nếu đang sửa chồng lên một bản ghi chưa gửi đi
    baseRev: existingIdx >= 0 ? queue[existingIdx].baseRev : baseRev,
    status: 'pending',
    retryCount: 0,
    adminPin,
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
      ? json.expenses.map((e: ExpenseRecord) => ({ ...e, syncStatus: 'synced' as const }))
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
 * - Nếu đã cấu hình GAS URL: Gửi lên GAS kiểm tra với ScriptProperties ('ADMIN_PIN')
 * - Nếu đang ở chế độ Local Demo: Kiểm tra với PIN demo (mặc định '1234')
 */
export async function verifyAdminPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const cleanPin = pin.trim();
  if (!cleanPin) return { ok: false, error: 'Vui lòng nhập mã PIN' };

  const gasUrl = getGasUrl();
  if (gasUrl && navigator.onLine && !getSimulateOffline()) {
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
  if (gasUrl && navigator.onLine && !getSimulateOffline()) {
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
 * Thực thi đồng bộ hàng đợi syncQueue.
 * Hỗ trợ gom nhóm (Batch Upsert - [PERF-04]) khi có nhiều khoản chi đang chờ,
 * và tự động fallback sang gửi từng mục nếu GAS chưa nâng cấp phiên bản mới.
 */
export async function processSyncQueue(
  currentState: AppStateData,
  onStateUpdated: (nextState: AppStateData, nextQueue: SyncQueueItem[]) => void,
  onConflictDetected: (conflictItem: SyncQueueItem, serverRecord: ExpenseRecord) => void,
  activeAdminPin?: string
): Promise<{ syncedCount: number; conflictCount: number; errorCount: number }> {
  const queue = loadSyncQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, conflictCount: 0, errorCount: 0 };
  }

  if (!navigator.onLine || getSimulateOffline()) {
    return { syncedCount: 0, conflictCount: 0, errorCount: queue.length };
  }

  const gasUrl = getGasUrl();
  const deviceToken = getDeviceToken();
  let workingState = {
    ...currentState,
    expenses: [...currentState.expenses],
    history: [...currentState.history],
  };
  let workingQueue = [...queue];
  let syncedCount = 0;
  let conflictCount = 0;
  let errorCount = 0;

  // Thử đồng bộ Batch (1 HTTP POST cho toàn bộ hàng đợi) nếu có từ 2 mục trở lên
  const actionableIndices = workingQueue
    .map((item, idx) => (item.status !== 'conflict' ? idx : -1))
    .filter((idx) => idx >= 0);

  if (gasUrl && actionableIndices.length > 1) {
    try {
      const batchItems = actionableIndices.map((idx) => {
        const item = workingQueue[idx];
        const effectivePin = item.adminPin || activeAdminPin;
        workingQueue[idx] = { ...item, status: 'syncing', lastAttemptAt: Date.now() };
        return {
          queueId: item.queueId,
          record: item.record,
          baseRev: item.baseRev,
          actor: item.record.updatedBy || item.record.createdBy,
          adminPin: effectivePin,
          deviceToken,
        };
      });
      saveSyncQueue(workingQueue);
      onStateUpdated(workingState, [...workingQueue]);

      const batchRes = await postToGas(gasUrl, {
        action: 'batchUpsertExpenses',
        adminPin: activeAdminPin,
        deviceToken,
        items: batchItems,
      });

      if (batchRes && batchRes.ok && Array.isArray(batchRes.results)) {
        for (const entry of batchRes.results) {
          const qIdx = workingQueue.findIndex((q) => q.queueId === entry.queueId);
          if (qIdx < 0) continue;
          const item = workingQueue[qIdx];
          const res = entry.result;

          if (res && res.ok && res.id && res.rev) {
            const syncedRecord: ExpenseRecord = {
              ...item.record,
              rev: Number(res.rev),
              createdAt: String(res.createdAt || item.record.createdAt),
              updatedAt: String(res.updatedAt || getNowGMT7(true)),
              syncStatus: 'synced',
            };
            const expIdx = workingState.expenses.findIndex((e) => e.id === syncedRecord.id);
            if (expIdx >= 0) {
              workingState.expenses[expIdx] = syncedRecord;
            } else {
              workingState.expenses.push(syncedRecord);
            }
            workingQueue[qIdx] = { ...item, status: 'synced' };
            syncedCount++;
          } else if (res && res.error === 'CONFLICT' && res.serverRecord) {
            const srvRec: ExpenseRecord = {
              ...res.serverRecord,
              syncStatus: 'conflict',
            };
            const conflictItem: SyncQueueItem = {
              ...item,
              status: 'conflict',
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
            const errMsg = res?.message || res?.error || 'Lỗi phản hồi từ GAS';
            workingQueue[qIdx] = {
              ...item,
              status: 'error',
              retryCount: (item.retryCount || 0) + 1,
              errorMessage: errMsg,
            };
            errorCount++;
          }
        }

        workingState.lastSyncedAt = (batchRes.serverTime || getNowGMT7(false)).slice(0, 16);
        const remainingQueue = workingQueue.filter((q) => q.status !== 'synced');
        saveSyncQueue(remainingQueue);
        saveAppState(workingState);
        onStateUpdated(workingState, remainingQueue);
        return { syncedCount, conflictCount, errorCount };
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

    // Đánh dấu đang gửi
    workingQueue[i] = { ...item, status: 'syncing', lastAttemptAt: Date.now() };
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
      syncedCount++;
      continue;
    }

    // Chế độ Google Apps Script thực tế
    try {
      const effectivePin = item.adminPin || activeAdminPin;
      let response = await postToGas(gasUrl, {
        action: 'upsertExpense',
        record: item.record,
        baseRev: item.baseRev,
        actor: item.record.updatedBy || item.record.createdBy,
        adminPin: effectivePin,
        deviceToken,
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
          record: item.record,
          baseRev: item.baseRev,
          actor: item.record.payer || item.record.createdBy,
          adminPin: effectivePin,
          deviceToken,
        });
      }

      if (response && response.ok && response.id && response.rev) {
        const syncedRecord: ExpenseRecord = {
          ...item.record,
          rev: Number(response.rev),
          createdAt: String(response.createdAt || item.record.createdAt),
          updatedAt: String(response.updatedAt || getNowGMT7(true)),
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
        syncedCount++;
      } else if (response && response.error === 'CONFLICT' && response.serverRecord) {
        const srvRec: ExpenseRecord = {
          ...response.serverRecord,
          syncStatus: 'conflict',
        };
        const conflictItem: SyncQueueItem = {
          ...item,
          status: 'conflict',
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
        const errMsg = response?.message || response?.error || 'Lỗi phản hồi từ GAS';
        workingQueue[i] = {
          ...item,
          status: 'error',
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

  const remainingQueue = workingQueue.filter((q) => q.status !== 'synced');
  saveSyncQueue(remainingQueue);
  saveAppState(workingState);
  onStateUpdated(workingState, remainingQueue);

  return { syncedCount, conflictCount, errorCount };
}
