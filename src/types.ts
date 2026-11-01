export type SplitMode = 'equal' | 'shares' | 'exact';

export type RecordType = 'expense' | 'transfer';

export type TripStatus = 'active' | 'completed';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error' | 'conflict';

export interface TripConfig {
  tripId: string;
  tripName: string;
  location: string;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  tripStatus: TripStatus;
  defaultSplitMode: SplitMode;
  enabledSplitModes: SplitMode[];
  suggestMultipliers: number[];
  maxSuggestAmount: number;
  accentColor: string;
}

export interface Member {
  id: string;
  name: string;
  avatarColor: string;
  defaultWeight: number;
  bankName: string;
  accountNo: string;
  accountHolder: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
  hidden: boolean;
}

export interface SplitMeta {
  shares?: Record<string, number>;
  exactAmounts?: Record<string, number>;
  selectedMembers?: string[];
  lastOperationId?: string;
}

export interface ExpenseRecord {
  id: string; // UUID v4
  rev: number; // Integer revision incremented by server
  type: RecordType; // 'expense' | 'transfer'
  title: string;
  amount: number; // Strictly integer VND
  payer: string; // memberId
  splits: Record<string, number>; // { [memberId]: integerVND }
  splitMode: SplitMode;
  splitMeta?: SplitMeta;
  categoryId: string;
  spentAt: string; // Plain text 'yyyy-MM-dd HH:mm' in GMT+7
  createdBy: string; // memberId
  createdAt: string; // Server timestamp 'yyyy-MM-dd HH:mm:ss'
  updatedBy: string; // memberId
  updatedAt: string; // Server timestamp 'yyyy-MM-dd HH:mm:ss'
  deleted: boolean;
  note: string;
  syncStatus?: SyncStatus;
}

export type SyncActionType = 'UPSERT_EXPENSE' | 'DELETE_EXPENSE';

export interface SyncQueueItem {
  queueId: string;
  operationId?: string;
  action: SyncActionType;
  record: ExpenseRecord;
  baseRev: number;
  status: SyncStatus;
  retryCount: number;
  lastAttemptAt?: number;
  errorCode?: string;
  nonRetryable?: boolean;
  errorMessage?: string;
  serverRecord?: ExpenseRecord;
  adminPin?: string;
}

export interface HistoryEntry {
  timestamp: string;
  actor: string;
  action: string;
  entityType: 'Expense' | 'Member' | 'Category' | 'Config' | 'Archive';
  entityId: string;
  rev: number;
  beforeJson: string;
  afterJson: string;
}

export interface MemberBalance {
  memberId: string;
  paidExpense: number; // Đã chi (Expense)
  owedExpense: number; // Phải chịu (Expense splits)
  sentTransfer: number; // Đã chuyển đi (Transfer)
  receivedTransfer: number; // Đã nhận về (Transfer)
  netTransfer: number; // Đã chuyển đi - Đã nhận về
  balance: number; // paidExpense - owedExpense + sentTransfer - receivedTransfer
}

export interface DebtTransaction {
  fromMemberId: string;
  toMemberId: string;
  amount: number; // Integer VND
}

export interface AppStateData {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  history: HistoryEntry[];
  lastSyncedAt: string | null;
}
