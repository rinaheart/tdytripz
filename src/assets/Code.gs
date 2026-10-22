/**
 * ============================================================================
 * GOOGLE APPS SCRIPT (Code.gs) - ĐỒNG BỘ HAI CHIỀU CHIA TIỀN NHÓM DU LỊCH
 * Thiết kế cho 5 Tab: Config, Members, Categories, Expenses, History
 * Hỗ trợ: LockService, Kiểm soát xung đột rev, Admin PIN trong ScriptProperties,
 *         Chống Brute-Force PIN, Chống Formula Injection, CacheService tăng tốc
 *         đọc/ghi Batch, Batch Upsert, và Menu Archive an toàn.
 * ============================================================================
 */

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_ADMIN_PIN = '1234';
const SCHEMA_CACHE_KEY = 'SCHEMA_READY_V2';
const SNAPSHOT_CACHE_KEY = 'TRIP_SNAPSHOT_V2';
const PIN_FAIL_CACHE_KEY = 'ADMIN_PIN_FAIL_COUNT_V2';
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 300; // Khóa 5 phút nếu nhập sai 5 lần liên tiếp

const SHEET_SCHEMAS = {
  Config: ['key', 'value', 'description'],
  Members: ['id', 'name', 'avatarColor', 'defaultWeight', 'bankName', 'accountNo', 'accountHolder', 'active'],
  Categories: ['id', 'name', 'icon', 'order', 'hidden'],
  Expenses: [
    'id', 'rev', 'type', 'title', 'amount', 'payer', 'splits', 'splitMode',
    'splitMeta', 'categoryId', 'spentAt', 'createdBy', 'createdAt',
    'updatedBy', 'updatedAt', 'deleted', 'note'
  ],
  History: ['timestamp', 'actor', 'action', 'entityType', 'entityId', 'rev', 'beforeJson', 'afterJson']
};

/**
 * Tạo menu tùy chỉnh trên thanh công cụ Google Sheets khi mở file
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Quản lý Chuyến Đi')
    .addItem('Khởi tạo / Kiểm tra 5 Tab chuẩn', 'ensureAllSheetsMenu')
    .addSeparator()
    .addItem('Kết thúc & Lưu trữ (Archive)', 'archiveCurrentTripMenu')
    .addToUi();
}

function ensureAllSheetsMenu() {
  ensureAllSheets(true);
  invalidateSnapshotCache_();
  SpreadsheetApp.getUi().alert('Đã kiểm tra và chuẩn hóa 5 Tab dữ liệu thành công!');
}

/**
 * Đảm bảo mã PIN Admin tồn tại trong ScriptProperties (mặc định: 1234).
 * Tuyệt đối không lưu PIN trong Sheet và không trả PIN về client.
 */
function getOrInitAdminPin_() {
  const props = PropertiesService.getScriptProperties();
  let pin = props.getProperty('ADMIN_PIN');
  if (!pin) {
    pin = DEFAULT_ADMIN_PIN;
    props.setProperty('ADMIN_PIN', pin);
  }
  return pin;
}

function isPinLockedOut_() {
  try {
    const cache = CacheService.getScriptCache();
    const failCount = Number(cache.get(PIN_FAIL_CACHE_KEY) || '0');
    return failCount >= MAX_PIN_ATTEMPTS;
  } catch (e) {
    return false;
  }
}

function verifyPin_(inputPin) {
  if (inputPin === undefined || inputPin === null) return false;
  if (isPinLockedOut_()) return false;

  const actualPin = getOrInitAdminPin_();
  const isValid = String(inputPin).trim() === String(actualPin).trim();

  try {
    const cache = CacheService.getScriptCache();
    if (!isValid) {
      const failCount = Number(cache.get(PIN_FAIL_CACHE_KEY) || '0') + 1;
      cache.put(PIN_FAIL_CACHE_KEY, String(failCount), PIN_LOCKOUT_SECONDS);
    } else {
      cache.remove(PIN_FAIL_CACHE_KEY);
    }
  } catch (e) {
    // Bỏ qua nếu CacheService tạm thời không khả dụng
  }

  return isValid;
}

function invalidateSnapshotCache_() {
  try {
    CacheService.getScriptCache().remove(SNAPSHOT_CACHE_KEY);
  } catch (e) {
    // Ignore cache errors
  }
}

function nowGMT7_() {
  return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Khởi tạo 5 tab nếu chưa có và định dạng cột Plain Text.
 * Sử dụng CacheService để tránh gọi setNumberFormat tốn 4-6s trên mỗi request.
 */
function ensureAllSheets(force) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    const cache = CacheService.getScriptCache();
    if (!force && cache.get(SCHEMA_CACHE_KEY) === '1' && ss.getSheetByName('Expenses')) {
      return;
    }
  } catch (e) {
    // Fallback chạy kiểm tra trực tiếp nếu CacheService lỗi
  }

  getOrInitAdminPin_();

  Object.keys(SHEET_SCHEMAS).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    const headers = SHEET_SCHEMAS[sheetName];
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f1f5f9');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f1f5f9');
      sheet.setFrozenRows(1);
    }
  });

  // Định dạng Plain Text (@) cho cột accountNo (Members) và spentAt (Expenses)
  formatColumnAsPlainText_(ss.getSheetByName('Members'), 'accountNo');
  formatColumnAsPlainText_(ss.getSheetByName('Expenses'), 'spentAt');

  try {
    CacheService.getScriptCache().put(SCHEMA_CACHE_KEY, '1', 21600); // Cache 6 giờ
  } catch (e) {
    // Ignore
  }
}

function formatColumnAsPlainText_(sheet, columnName) {
  if (!sheet) return;
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const colIdx = headers.indexOf(columnName);
  if (colIdx !== -1) {
    const maxRows = Math.max(1000, sheet.getMaxRows() - 1);
    sheet.getRange(2, colIdx + 1, maxRows, 1).setNumberFormat('@');
  }
}

/**
 * Làm sạch giá trị ghi vào ô Sheet, chống tấn công Formula Injection (=, +, -, @)
 */
function sanitizeCellValue_(v, forcePlainText) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  if (forcePlainText) {
    const str = String(v).replace(/^'+/, '');
    return "'" + str;
  }
  if (typeof v === 'string' && v.length > 0) {
    const firstChar = v.charAt(0);
    // Chặn công thức bảng tính (=, +, @, tab, CR) hoặc dấu trừ không phải số âm
    if (
      firstChar === '=' ||
      firstChar === '+' ||
      firstChar === '@' ||
      firstChar === '\t' ||
      firstChar === '\r' ||
      (firstChar === '-' && isNaN(Number(v)))
    ) {
      return "'" + v;
    }
  }
  return v;
}

/**
 * Đọc toàn bộ dòng của một Sheet theo tên Header cột (không phụ thuộc thứ tự cột)
 */
function readSheetByHeader_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h) { return String(h).trim(); });
  const rows = [];

  for (let r = 1; r < data.length; r++) {
    const rowVals = data[r];
    const obj = { _rowIndex: r + 1 };
    let hasContent = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      let val = rowVals[c];
      if (val instanceof Date) {
        val = Utilities.formatDate(val, TIMEZONE, 'yyyy-MM-dd HH:mm');
      }
      if (val !== '' && val !== null && val !== undefined) {
        hasContent = true;
      }
      obj[key] = val;
    }
    if (hasContent) rows.push(obj);
  }
  return rows;
}

/**
 * Ghi 1 object vào dòng rowIndex dựa theo tên Header cột
 */
function writeRowByHeader_(sheetName, rowIndex, recordObj, plainTextKeys) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
  const plainSet = {};
  (plainTextKeys || []).forEach(function(k) { plainSet[k] = true; });

  const rowArray = headers.map(function(colName) {
    return sanitizeCellValue_(recordObj[colName], Boolean(plainSet[colName]));
  });

  if (rowIndex && rowIndex >= 2) {
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowArray]);
  } else {
    sheet.appendRow(rowArray);
  }
}

/**
 * Ghi hàng loạt (Batch Write) toàn bộ danh sách records vào Sheet chỉ trong 1 lệnh I/O
 */
function replaceSheetWithBatchRows_(sheetName, recordsArray, plainTextKeys) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = SHEET_SCHEMAS[sheetName];
  if (!sheet || !headers) return;

  const plainSet = {};
  (plainTextKeys || []).forEach(function(k) { plainSet[k] = true; });

  const matrix = [headers];
  (recordsArray || []).forEach(function(recordObj) {
    const row = headers.map(function(colName) {
      return sanitizeCellValue_(recordObj[colName], Boolean(plainSet[colName]));
    });
    matrix.push(row);
  });

  sheet.clearContents();
  sheet.getRange(1, 1, matrix.length, headers.length).setValues(matrix);
}

function appendHistory_(actor, action, entityType, entityId, rev, beforeObj, afterObj) {
  writeRowByHeader_('History', null, {
    timestamp: nowGMT7_(),
    actor: actor || 'unknown',
    action: action,
    entityType: entityType,
    entityId: entityId,
    rev: rev || 1,
    beforeJson: beforeObj ? JSON.stringify(beforeObj) : '',
    afterJson: afterObj ? JSON.stringify(afterObj) : ''
  }, []);
}

function getTripStatus_() {
  const configRows = readSheetByHeader_('Config');
  for (let i = 0; i < configRows.length; i++) {
    if (configRows[i].key === 'tripStatus') {
      return String(configRows[i].value || 'active').trim();
    }
  }
  return 'active';
}

function stripLeadingQuote_(val) {
  return String(val || '').replace(/^'+/, '');
}

function parseExpenseRow_(row) {
  let splits = {};
  let splitMeta = {};
  try { splits = typeof row.splits === 'string' && row.splits ? JSON.parse(row.splits) : (row.splits || {}); } catch (e) {}
  try { splitMeta = typeof row.splitMeta === 'string' && row.splitMeta ? JSON.parse(row.splitMeta) : (row.splitMeta || {}); } catch (e) {}
  return {
    id: String(row.id),
    rev: Number(row.rev || 1),
    type: String(row.type || 'expense'),
    title: stripLeadingQuote_(row.title),
    amount: Math.round(Number(row.amount || 0)),
    payer: String(row.payer || ''),
    splits: splits,
    splitMode: String(row.splitMode || 'equal'),
    splitMeta: splitMeta,
    categoryId: String(row.categoryId || 'cat_other'),
    spentAt: stripLeadingQuote_(row.spentAt),
    createdBy: String(row.createdBy || ''),
    createdAt: String(row.createdAt || ''),
    updatedBy: String(row.updatedBy || ''),
    updatedAt: String(row.updatedAt || ''),
    deleted: row.deleted === true || String(row.deleted).toLowerCase() === 'true',
    note: stripLeadingQuote_(row.note)
  };
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Xử lý GET request: trả về toàn bộ dữ liệu 4 tab (Config, Members, Categories, Expenses)
 * Có CacheService read-through (45s) giúp phản hồi <50ms khi nhiều thành viên mở app cùng lúc.
 */
function doGet(e) {
  try {
    ensureAllSheets(false);

    try {
      const cached = CacheService.getScriptCache().get(SNAPSHOT_CACHE_KEY);
      if (cached) {
        return ContentService.createTextOutput(cached)
          .setMimeType(ContentService.MimeType.JSON);
      }
    } catch (cacheErr) {
      // Ignore cache read error
    }

    const configRows = readSheetByHeader_('Config');
    const membersRows = readSheetByHeader_('Members');
    const categoriesRows = readSheetByHeader_('Categories');
    const expensesRows = readSheetByHeader_('Expenses');

    const configMap = {};
    configRows.forEach(function(r) {
      if (r.key && r.key !== 'ADMIN_PIN') {
        configMap[r.key] = r.value;
      }
    });

    const members = membersRows.map(function(m) {
      return {
        id: String(m.id),
        name: stripLeadingQuote_(m.name),
        avatarColor: String(m.avatarColor || '#0d9488'),
        defaultWeight: Number(m.defaultWeight || 1),
        bankName: stripLeadingQuote_(m.bankName),
        accountNo: stripLeadingQuote_(m.accountNo),
        accountHolder: stripLeadingQuote_(m.accountHolder),
        active: m.active === true || String(m.active).toLowerCase() !== 'false'
      };
    });

    const categories = categoriesRows.map(function(c) {
      return {
        id: String(c.id),
        name: stripLeadingQuote_(c.name),
        icon: String(c.icon || 'Package'),
        order: Number(c.order || 1),
        hidden: c.hidden === true || String(c.hidden).toLowerCase() === 'true'
      };
    });

    const expenses = expensesRows.map(parseExpenseRow_);

    const payloadObj = {
      ok: true,
      serverTime: nowGMT7_(),
      config: configMap,
      members: members,
      categories: categories,
      expenses: expenses
    };

    const jsonStr = JSON.stringify(payloadObj);
    try {
      if (jsonStr.length < 95000) {
        CacheService.getScriptCache().put(SNAPSHOT_CACHE_KEY, jsonStr, 45);
      }
    } catch (cacheWriteErr) {
      // Ignore cache write limit
    }

    return ContentService.createTextOutput(jsonStr)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * Xử lý POST request có khóa đồng bộ LockService.getScriptLock().waitLock(15000)
 */
function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseErr) {
    return jsonResponse_({ ok: false, error: 'INVALID_JSON' });
  }
  const action = body.action;

  // Xác thực PIN có chống Brute-Force (khóa 5 phút sau 5 lần thử sai)
  if (action === 'verifyAdminPin') {
    if (isPinLockedOut_()) {
      return jsonResponse_({
        ok: false,
        error: 'TOO_MANY_ATTEMPTS',
        message: 'Nhập sai PIN quá 5 lần. Tạm khóa 5 phút.'
      });
    }
    const valid = verifyPin_(body.pin);
    return jsonResponse_({ ok: valid, error: valid ? null : 'INVALID_PIN' });
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    return jsonResponse_({ ok: false, error: 'LOCK_TIMEOUT', message: 'Server đang bận xử lý giao dịch khác, vui lòng thử lại.' });
  }

  try {
    ensureAllSheets(false);

    if (action === 'changeAdminPin') {
      if (isPinLockedOut_()) {
        return jsonResponse_({ ok: false, error: 'TOO_MANY_ATTEMPTS', message: 'Tài khoản Admin đang tạm khóa 5 phút.' });
      }
      if (!verifyPin_(body.currentPin)) {
        return jsonResponse_({ ok: false, error: 'INVALID_PIN' });
      }
      const newPin = String(body.newPin || '').trim();
      if (newPin.length < 4) {
        return jsonResponse_({ ok: false, error: 'PIN_TOO_SHORT' });
      }
      PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', newPin);
      appendHistory_(body.actor || 'admin', 'CHANGE_ADMIN_PIN', 'Config', 'ADMIN_PIN', 1, null, { changed: true });
      return jsonResponse_({ ok: true });
    }

    if (action === 'initSeedData') {
      if (!verifyPin_(body.adminPin)) {
        return jsonResponse_({
          ok: false,
          error: 'UNAUTHORIZED_ADMIN_PIN',
          message: 'Cần mở khóa PIN Admin hợp lệ trước khi khởi tạo Google Sheet.'
        });
      }
      const res = handleInitSeedData_(body);
      invalidateSnapshotCache_();
      return res;
    }

    if (action === 'upsertExpense') {
      const res = handleUpsertExpense_(body);
      invalidateSnapshotCache_();
      return res;
    }

    if (action === 'batchUpsertExpenses') {
      const res = handleBatchUpsertExpenses_(body);
      invalidateSnapshotCache_();
      return res;
    }

    if (action === 'saveAdminSettings') {
      if (!verifyPin_(body.adminPin)) {
        return jsonResponse_({ ok: false, error: 'UNAUTHORIZED_ADMIN_PIN' });
      }
      const res = handleSaveAdminSettings_(body);
      invalidateSnapshotCache_();
      return res;
    }

    return jsonResponse_({ ok: false, error: 'UNKNOWN_ACTION: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Xử lý 1 khoản chi đối chiếu với danh sách rows đang có trên bộ nhớ
 */
function processSingleExpenseUpsert_(itemBody, existingRowsMap, isAdmin, now) {
  const incoming = itemBody.record;
  const baseRev = Number(itemBody.baseRev || 0);
  const actor = String(itemBody.actor || incoming.updatedBy || incoming.createdBy || '');
  const deviceToken = String(itemBody.deviceToken || '');
  const existingRow = existingRowsMap[String(incoming.id)] || null;

  // Trường hợp tạo mới
  if (!existingRow) {
    const meta = incoming.splitMeta ? JSON.parse(JSON.stringify(incoming.splitMeta)) : {};
    if (deviceToken && !meta.creatorToken) {
      meta.creatorToken = deviceToken;
    }
    const newRecord = {
      id: String(incoming.id),
      rev: 1,
      type: incoming.type || 'expense',
      title: incoming.title || '',
      amount: Math.round(Number(incoming.amount || 0)),
      payer: incoming.payer,
      splits: incoming.splits || {},
      splitMode: incoming.splitMode || 'equal',
      splitMeta: meta,
      categoryId: incoming.categoryId || 'cat_other',
      spentAt: stripLeadingQuote_(incoming.spentAt),
      createdBy: incoming.createdBy || actor,
      createdAt: now,
      updatedBy: actor,
      updatedAt: now,
      deleted: Boolean(incoming.deleted),
      note: incoming.note || ''
    };
    writeRowByHeader_('Expenses', null, newRecord, ['spentAt']);
    appendHistory_(actor, 'CREATE', 'Expense', newRecord.id, 1, null, newRecord);
    return {
      ok: true,
      id: newRecord.id,
      rev: 1,
      createdAt: now,
      updatedAt: now,
      record: newRecord
    };
  }

  const currentServerRec = parseExpenseRow_(existingRow);

  // Chống tạo dòng trùng lặp khi client retry gói tin đã lưu thành công trước đó
  if (
    baseRev === 0 &&
    currentServerRec.rev === 1 &&
    currentServerRec.title === incoming.title &&
    currentServerRec.amount === Math.round(Number(incoming.amount || 0))
  ) {
    return {
      ok: true,
      id: currentServerRec.id,
      rev: currentServerRec.rev,
      createdAt: currentServerRec.createdAt,
      updatedAt: currentServerRec.updatedAt,
      record: currentServerRec
    };
  }

  // Kiểm tra quyền (Soft Permission + Creator Device Token khi khả dụng)
  const storedToken = currentServerRec.splitMeta && currentServerRec.splitMeta.creatorToken;
  const isActorAllowed =
    actor === currentServerRec.createdBy || actor === currentServerRec.payer;
  const isTokenMismatch =
    Boolean(storedToken && deviceToken && storedToken !== deviceToken && actor === currentServerRec.createdBy && actor !== currentServerRec.payer);

  if (!isAdmin && (!isActorAllowed || isTokenMismatch)) {
    return {
      ok: false,
      error: 'PERMISSION_DENIED',
      message: 'Chỉ người tạo, người chi tiền hoặc Admin mới được sửa/xóa khoản này.'
    };
  }

  // Kiểm tra xung đột phiên bản (CONFLICT rev)
  if (currentServerRec.rev !== baseRev) {
    return {
      ok: false,
      error: 'CONFLICT',
      serverRecord: currentServerRec
    };
  }

  const nextRev = currentServerRec.rev + 1;
  const updatedMeta = incoming.splitMeta ? JSON.parse(JSON.stringify(incoming.splitMeta)) : {};
  if (storedToken && !updatedMeta.creatorToken) {
    updatedMeta.creatorToken = storedToken;
  }

  const updatedRecord = {
    id: currentServerRec.id,
    rev: nextRev,
    type: incoming.type || currentServerRec.type,
    title: incoming.title,
    amount: Math.round(Number(incoming.amount || 0)),
    payer: incoming.payer,
    splits: incoming.splits || {},
    splitMode: incoming.splitMode || 'equal',
    splitMeta: updatedMeta,
    categoryId: incoming.categoryId || 'cat_other',
    spentAt: stripLeadingQuote_(incoming.spentAt),
    createdBy: currentServerRec.createdBy,
    createdAt: currentServerRec.createdAt,
    updatedBy: actor,
    updatedAt: now,
    deleted: Boolean(incoming.deleted),
    note: incoming.note || ''
  };

  writeRowByHeader_('Expenses', existingRow._rowIndex, updatedRecord, ['spentAt']);
  appendHistory_(
    actor,
    updatedRecord.deleted ? 'SOFT_DELETE' : 'UPDATE',
    'Expense',
    updatedRecord.id,
    nextRev,
    currentServerRec,
    updatedRecord
  );

  return {
    ok: true,
    id: updatedRecord.id,
    rev: nextRev,
    createdAt: updatedRecord.createdAt,
    updatedAt: now,
    record: updatedRecord
  };
}

/**
 * Upsert 1 khoản chi theo ID + Kiểm tra xung đột phiên bản (baseRev)
 */
function handleUpsertExpense_(body) {
  if (getTripStatus_() === 'completed') {
    return jsonResponse_({
      ok: false,
      error: 'TRIP_COMPLETED',
      message: 'Chuyến đi đã kết thúc (Chế độ chỉ xem). Không thể ghi thêm khoản chi.'
    });
  }

  const isAdmin = body.adminPin ? verifyPin_(body.adminPin) : false;
  const now = nowGMT7_();
  const rows = readSheetByHeader_('Expenses');
  const existingRowsMap = {};
  for (let i = 0; i < rows.length; i++) {
    existingRowsMap[String(rows[i].id)] = rows[i];
  }

  const res = processSingleExpenseUpsert_(body, existingRowsMap, isAdmin, now);
  return jsonResponse_(res);
}

/**
 * Batch Upsert nhiều khoản chi trong 1 lần giữ LockService & 1 lần đọc bảng Expenses
 */
function handleBatchUpsertExpenses_(body) {
  if (getTripStatus_() === 'completed') {
    return jsonResponse_({
      ok: false,
      error: 'TRIP_COMPLETED',
      message: 'Chuyến đi đã kết thúc (Chế độ chỉ xem). Không thể ghi thêm khoản chi.'
    });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return jsonResponse_({ ok: true, results: [] });
  }

  const isAdmin = body.adminPin ? verifyPin_(body.adminPin) : false;
  const now = nowGMT7_();
  const rows = readSheetByHeader_('Expenses');
  const existingRowsMap = {};
  for (let i = 0; i < rows.length; i++) {
    existingRowsMap[String(rows[i].id)] = rows[i];
  }

  const results = items.map(function(item) {
    const itemIsAdmin = item.adminPin ? verifyPin_(item.adminPin) : isAdmin;
    const outcome = processSingleExpenseUpsert_(
      {
        record: item.record,
        baseRev: item.baseRev,
        actor: item.actor,
        deviceToken: item.deviceToken || body.deviceToken
      },
      existingRowsMap,
      itemIsAdmin,
      now
    );
    return {
      queueId: item.queueId,
      recordId: item.record ? item.record.id : '',
      result: outcome
    };
  });

  return jsonResponse_({
    ok: true,
    serverTime: now,
    results: results
  });
}

/**
 * Lưu cấu hình Admin bằng Batch Write (setValues 2D) giúp giảm 50+ lệnh gọi Sheet xuống còn 3 lệnh
 */
function handleSaveAdminSettings_(body) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const actor = body.actor || 'admin';

  if (body.config) {
    const cfgRecords = [];
    Object.keys(body.config).forEach(function(k) {
      if (k === 'ADMIN_PIN') return;
      const val = typeof body.config[k] === 'object' ? JSON.stringify(body.config[k]) : String(body.config[k]);
      cfgRecords.push({ key: k, value: val, description: '' });
    });
    replaceSheetWithBatchRows_('Config', cfgRecords, []);
  }

  if (Array.isArray(body.members)) {
    const memSheet = ss.getSheetByName('Members');
    replaceSheetWithBatchRows_('Members', body.members, ['accountNo']);
    formatColumnAsPlainText_(memSheet, 'accountNo');
  }

  if (Array.isArray(body.categories)) {
    replaceSheetWithBatchRows_('Categories', body.categories, []);
  }

  appendHistory_(actor, 'UPDATE_ADMIN_SETTINGS', 'Config', 'ALL', 1, null, { updatedAt: nowGMT7_() });
  return jsonResponse_({ ok: true, updatedAt: nowGMT7_() });
}

function handleInitSeedData_(body) {
  const existingExpenses = readSheetByHeader_('Expenses');
  if (existingExpenses.length === 0 && Array.isArray(body.expenses) && body.expenses.length > 0) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const expSheet = ss.getSheetByName('Expenses');
    replaceSheetWithBatchRows_('Expenses', body.expenses, ['spentAt']);
    formatColumnAsPlainText_(expSheet, 'spentAt');
  }
  handleSaveAdminSettings_({
    actor: 'init_seed',
    config: body.config,
    members: body.members,
    categories: body.categories
  });
  return jsonResponse_({ ok: true, serverTime: nowGMT7_() });
}

/**
 * Hàm chạy từ Menu Google Sheet: Quản lý Chuyến Đi -> Kết thúc & Lưu trữ (Archive)
 * Đảm bảo 4 bước an toàn:
 * 1. Tạo tab Archive_<tripId>_yyyyMMdd_HHmm (GMT+7)
 * 2. Chép toàn bộ dữ liệu từ Expenses sang tab Archive
 * 3. Kiểm tra số dòng giữa 2 bên khớp 100%
 * 4. Ghi log vào History, đặt tripStatus = 'completed'
 */
function archiveCurrentTripMenu() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureAllSheets(true);

  const configRows = readSheetByHeader_('Config');
  let tripId = 'TRIP';
  let tripStatusRowIdx = null;
  configRows.forEach(function(r) {
    if (r.key === 'tripId' && r.value) tripId = String(r.value).replace(/[^a-zA-Z0-9_-]/g, '');
    if (r.key === 'tripStatus') tripStatusRowIdx = r._rowIndex;
  });

  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmm');
  const archiveSheetName = 'Archive_' + tripId + '_' + stamp;

  const confirm = ui.alert(
    'Xác nhận Kết thúc & Lưu trữ Chuyến Đi',
    'Hệ thống sẽ tạo tab "' + archiveSheetName + '", sao chép toàn bộ khoản chi và khóa chuyến đi sang chế độ Chỉ xem (completed). Bạn có chắc chắn muốn tiếp tục?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const expSheet = ss.getSheetByName('Expenses');
  const sourceLastRow = expSheet.getLastRow();
  const sourceLastCol = expSheet.getLastColumn();

  // Bước 1: Tạo tab Archive mới
  const archiveSheet = ss.insertSheet(archiveSheetName);

  // Bước 2: Chép toàn bộ dữ liệu từ Expenses sang tab Archive
  if (sourceLastRow > 0 && sourceLastCol > 0) {
    const sourceValues = expSheet.getRange(1, 1, sourceLastRow, sourceLastCol).getValues();
    formatColumnAsPlainText_(archiveSheet, 'spentAt');
    archiveSheet.getRange(1, 1, sourceLastRow, sourceLastCol).setValues(sourceValues);
    archiveSheet.getRange(1, 1, 1, sourceLastCol).setFontWeight('bold').setBackground('#e2e8f0');
    archiveSheet.setFrozenRows(1);
  }

  // Bước 3: Kiểm tra số dòng giữa 2 bên khớp 100%
  const targetLastRow = archiveSheet.getLastRow();
  if (targetLastRow !== sourceLastRow) {
    ui.alert('LỖI AN TOÀN DỮ LIỆU', 'Số dòng bên tab Archive (' + targetLastRow + ') không khớp với tab Expenses (' + sourceLastRow + '). Đã hủy thao tác khóa chuyến đi!', ui.ButtonSet.OK);
    return;
  }

  // Bước 4: Ghi log vào History và đặt tripStatus = 'completed'
  if (tripStatusRowIdx) {
    writeRowByHeader_('Config', tripStatusRowIdx, { key: 'tripStatus', value: 'completed', description: 'Archived at ' + stamp }, []);
  } else {
    writeRowByHeader_('Config', null, { key: 'tripStatus', value: 'completed', description: 'Archived at ' + stamp }, []);
  }

  invalidateSnapshotCache_();
  appendHistory_('SheetMenuAdmin', 'ARCHIVE_TRIP', 'Archive', archiveSheetName, 1, { rowCount: sourceLastRow }, { archiveSheet: archiveSheetName, tripStatus: 'completed' });

  const cleanConfirm = ui.alert(
    'Đã lưu trữ thành công (' + sourceLastRow + ' dòng)!',
    'Dữ liệu đã an toàn tại tab "' + archiveSheetName + '" và chuyến đi đã chuyển sang trạng thái "completed". Bạn có muốn giữ nguyên dữ liệu trên tab Expenses để xem trên web không? (Chọn NO nếu muốn làm trống tab Expenses cho chuyến đi mới).',
    ui.ButtonSet.YES_NO
  );

  if (cleanConfirm === ui.Button.NO && sourceLastRow > 1) {
    expSheet.deleteRows(2, sourceLastRow - 1);
    writeRowByHeader_('Config', tripStatusRowIdx, { key: 'tripStatus', value: 'active', description: 'Reset after archive ' + stamp }, []);
    invalidateSnapshotCache_();
    appendHistory_('SheetMenuAdmin', 'RESET_EXPENSES_FOR_NEW_TRIP', 'Archive', archiveSheetName, 1, null, { reset: true });
  }
}
