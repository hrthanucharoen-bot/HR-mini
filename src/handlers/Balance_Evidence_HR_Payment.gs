/**
 * ============================================================
 * Balance Handler — Flow 8
 * ============================================================
 */

function getBalance(payload) {
  const lineUserId = payload.lineUserId;
  const emp = findEmployeeByLineId(lineUserId);
  if (!emp) return { ok: false, error: 'not_registered' };

  const period = payload.period || currentPeriod();
  const year = parseInt(period.split('-')[0], 10);

  // === Work days this period ===
  const workDays = countApprovedWorkDays(emp.employee_id, period);

  // === OT hours this period ===
  const otHours = sumApprovedOT(emp.employee_id, period);

  // === Pay calculation (estimate) ===
  const dailyRate = Number(emp.base_pay_monthly || 0) / 22; // 22 working days/month
  const config = getConfig();
  const otRate = Number(emp.ot_rate_per_hour || 0);
  const basePay = workDays * dailyRate;
  const otPay = otHours * otRate * config.ot_rate_multiplier;

  // === Bonus/deduction ===
  const bonus = sumPayItems(emp.employee_id, period, 'bonus');
  const deduction = sumPayItems(emp.employee_id, period, 'deduction');

  const estimateTotal = basePay + otPay + bonus - deduction;

  // === Leave quota remaining ===
  const quota = getLeaveQuota(emp.employee_id, year) || {};
  const leaveBalance = {
    sick: {
      quota: Number(quota.sick_quota || 0),
      used: Number(quota.sick_used || 0),
      remaining: Number(quota.sick_quota || 0) - Number(quota.sick_used || 0)
    },
    personal: {
      quota: Number(quota.personal_quota || 0),
      used: Number(quota.personal_used || 0),
      remaining: Number(quota.personal_quota || 0) - Number(quota.personal_used || 0)
    },
    vacation: {
      quota: Number(quota.vacation_quota || 0),
      used: Number(quota.vacation_used || 0),
      remaining: Number(quota.vacation_quota || 0) - Number(quota.vacation_used || 0)
    }
  };

  // === Last paid period ===
  const lastPayment = findLastPayment(emp.employee_id);

  // === Pending counts ===
  const pendingLeaves = filterRows(SHEETS.LEAVES.name, function(r) {
    return r.employee_id === emp.employee_id
      && String(r.status).indexOf('pending') === 0;
  }).length;

  const pendingOT = filterRows(SHEETS.OT.name, function(r) {
    return r.employee_id === emp.employee_id
      && String(r.status).indexOf('pending') === 0;
  }).length;

  return {
    ok: true,
    employee: {
      id: emp.employee_id,
      name: emp.display_name,
      department: emp.department,
      position: emp.position
    },
    period: period,
    workDays: workDays,
    otHours: otHours,
    basePay: Math.round(basePay),
    otPay: Math.round(otPay),
    bonus: bonus,
    deduction: deduction,
    estimateTotal: Math.round(estimateTotal),
    leaveBalance: leaveBalance,
    pending: { leaves: pendingLeaves, ot: pendingOT },
    lastPayment: lastPayment ? {
      period: lastPayment.period,
      total: lastPayment.total_amount,
      status: lastPayment.status
    } : null
  };
}

function currentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const month = ('0' + (now.getMonth() + 1)).slice(-2);
  return year + '-' + month;
}

function countApprovedWorkDays(employeeId, period) {
  // Count distinct dates with at least one approved IN checkin
  const checkins = filterRows(SHEETS.CHECKINS.name, function(r) {
    if (r.employee_id !== employeeId) return false;
    if (r.status !== 'approved') return false;
    if (r.slot !== 'IN') return false;
    const dateStr = formatDate(new Date(r.checkin_date));
    return dateStr.indexOf(period) === 0;
  });
  // Distinct dates
  const dates = {};
  checkins.forEach(function(c) {
    dates[formatDate(new Date(c.checkin_date))] = true;
  });
  return Object.keys(dates).length;
}

function sumApprovedOT(employeeId, period) {
  const otRows = filterRows(SHEETS.OT.name, function(r) {
    return r.employee_id === employeeId
      && r.status === 'approved'
      && String(r.ot_date).indexOf(period) === 0;
  });
  return otRows.reduce(function(s, r) { return s + Number(r.total_hours || 0); }, 0);
}

function sumPayItems(employeeId, period, type) {
  const items = filterRows(SHEETS.PAY_ITEMS.name, function(r) {
    return (r.employee_id === employeeId || r.employee_id === '' || r.employee_id === '*')
      && r.period === period
      && r.type === type;
  });
  return items.reduce(function(s, r) { return s + Number(r.amount || 0); }, 0);
}

function findLastPayment(employeeId) {
  const payments = filterRows(SHEETS.PAYMENTS.name, function(r) {
    return r.employee_id === employeeId;
  });
  if (payments.length === 0) return null;
  // Sort by period desc
  payments.sort(function(a, b) { return String(b.period).localeCompare(String(a.period)); });
  return payments[0];
}


/**
 * ============================================================
 * Evidence Handler — attach evidence after "need_info"
 * ============================================================
 */
function submitEvidence(payload) {
  const lineUserId = payload.lineUserId;
  const recordId = payload.id;
  const type = payload.type; // leave / ot
  const evidenceBase64 = payload.evidenceBase64;
  const note = (payload.note || '').trim();

  if (!recordId) return { ok: false, error: 'missing_id' };
  if (!evidenceBase64) return { ok: false, error: 'missing_evidence' };

  const emp = findEmployeeByLineId(lineUserId);
  if (!emp) return { ok: false, error: 'not_registered' };

  const record = (type === 'leave') ? findLeaveById(recordId) : findOTById(recordId);
  if (!record) return { ok: false, error: 'record_not_found' };
  if (record.employee_id !== emp.employee_id) return { ok: false, error: 'not_your_record' };
  if (record.status !== 'need_info') return { ok: false, error: 'wrong_status' };

  // Upload
  let evidenceUrl;
  try {
    evidenceUrl = uploadImage(
      evidenceBase64,
      'evidence_' + recordId + '_' + Date.now() + '.jpg',
      'evidence'
    );
  } catch (err) {
    return { ok: false, error: 'upload_failed' };
  }

  // Append to history
  const history = parseHistory(record.approval_history);
  const lastNeedInfo = history.slice().reverse().find(function(h) { return h.action === 'need_info'; });
  const level = lastNeedInfo ? lastNeedInfo.level : 'L1';

  history.push({
    level: 'employee',
    by: emp.employee_id,
    action: 'submit_evidence',
    note: note,
    evidence_url: evidenceUrl,
    at: nowBangkok()
  });

  // Reset back to pending at the level that asked
  const sheetName = (type === 'leave') ? SHEETS.LEAVES.name : SHEETS.OT.name;
  const idField = (type === 'leave') ? 'leave_id' : 'ot_id';
  updateRowByNumber(sheetName, record._row, {
    status: 'pending_' + level,
    evidence_url: evidenceUrl,
    approval_history: JSON.stringify(history)
  });

  // Notify approver
  const approver = findEmployeeById(record.current_approver);
  if (approver) {
    pushMessage(approver.line_user_id, [{
      type: 'text',
      text: '📎 ' + emp.display_name + ' ส่งหลักฐานเพิ่มสำหรับ ' + recordId + ' แล้ว\n\n' +
            'หมายเหตุ: ' + (note || '-') + '\n' +
            'ดูหลักฐาน: ' + evidenceUrl
    }]);
  }

  return { ok: true, evidenceUrl: evidenceUrl };
}


/**
 * ============================================================
 * HR Tools Handler — Owner only
 * ============================================================
 */
function hrGetEmployees(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const employees = getAllRows(SHEETS.EMPLOYEES.name);
  return { ok: true, employees: employees };
}

function hrAddEmployee(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  // TODO: validate + insert
  const newEmp = payload.employee;
  newEmp.employee_id = newEmp.employee_id || nextEmployeeId();
  newEmp.registered_at = nowBangkok();
  newEmp.is_active = true;
  insertEmployee(newEmp);
  return { ok: true, employeeId: newEmp.employee_id };
}

function hrUpdateEmployee(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const employeeId = payload.employeeId;
  const updates = payload.updates;
  const ok = updateRow(SHEETS.EMPLOYEES.name, function(r) {
    return r.employee_id === employeeId;
  }, updates);
  return { ok: ok };
}

function hrGetPayItems(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const period = payload.period || currentPeriod();
  const items = filterRows(SHEETS.PAY_ITEMS.name, function(r) {
    return r.period === period;
  });
  return { ok: true, items: items };
}

function hrAddPayItem(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const item = payload.item;
  item.item_id = 'PI-' + Date.now();
  item.created_by = payload.lineUserId;
  item.created_at = nowBangkok();
  insertRow(SHEETS.PAY_ITEMS.name, item);
  return { ok: true };
}

function hrGetHolidays(payload) {
  const holidays = getAllRows(SHEETS.HOLIDAYS.name);
  return { ok: true, holidays: holidays };
}

function hrSetLeaveQuota(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const employeeId = payload.employeeId;
  const year = payload.year;
  const updates = payload.updates;
  const ok = updateRow(SHEETS.LEAVE_QUOTA.name, function(r) {
    return r.employee_id === employeeId && Number(r.year) === Number(year);
  }, updates);
  return { ok: ok };
}

function hrGetReport(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const period = payload.period || currentPeriod();
  const employees = getActiveEmployees();
  const report = employees.map(function(emp) {
    return {
      employee_id: emp.employee_id,
      name: emp.display_name,
      department: emp.department,
      work_days: countApprovedWorkDays(emp.employee_id, period),
      ot_hours: sumApprovedOT(emp.employee_id, period),
      bonus: sumPayItems(emp.employee_id, period, 'bonus'),
      deduction: sumPayItems(emp.employee_id, period, 'deduction')
    };
  });
  return { ok: true, period: period, report: report };
}

function isOwner(lineUserId) {
  return lineUserId === getProp('OWNER_LINE_USER_ID');
}


/**
 * ============================================================
 * Payment Handler — Flow 10: ปิดงวด + จ่ายเงิน
 * ============================================================
 */
function closePeriod(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const period = payload.period || currentPeriod();

  // Check pending
  const pendingLeaves = filterRows(SHEETS.LEAVES.name, function(r) {
    return String(r.status).indexOf('pending') === 0;
  });
  const pendingOT = filterRows(SHEETS.OT.name, function(r) {
    return String(r.status).indexOf('pending') === 0;
  });

  if ((pendingLeaves.length > 0 || pendingOT.length > 0) && !payload.force) {
    return {
      ok: false,
      error: 'has_pending',
      message: 'มีคำขอที่ยังค้างอนุมัติ: ' + pendingLeaves.length + ' ลา + ' + pendingOT.length + ' OT',
      pendingLeaves: pendingLeaves.length,
      pendingOT: pendingOT.length
    };
  }

  // Process each employee
  const employees = getActiveEmployees();
  const config = getConfig();
  const results = [];

  employees.forEach(function(emp) {
    const workDays = countApprovedWorkDays(emp.employee_id, period);
    const otHours = sumApprovedOT(emp.employee_id, period);
    const dailyRate = Number(emp.base_pay_monthly || 0) / 22;
    const otRate = Number(emp.ot_rate_per_hour || 0);
    const basePay = workDays * dailyRate;
    const otPay = otHours * otRate * config.ot_rate_multiplier;
    const bonus = sumPayItems(emp.employee_id, period, 'bonus');
    const deduction = sumPayItems(emp.employee_id, period, 'deduction');
    const total = Math.round(basePay + otPay + bonus - deduction);

    // Check if already closed
    const existing = findRow(SHEETS.PAYMENTS.name, function(r) {
      return r.employee_id === emp.employee_id && r.period === period;
    });

    if (existing) {
      results.push({ employee: emp.display_name, skipped: true, reason: 'already_closed' });
      return;
    }

    const paymentId = nextPaymentId(period);
    insertPayment({
      payment_id: paymentId,
      employee_id: emp.employee_id,
      period: period,
      work_days: workDays,
      ot_hours: otHours,
      base_pay: Math.round(basePay),
      ot_pay: Math.round(otPay),
      bonus: bonus,
      deduction: deduction,
      total_amount: total,
      status: 'รอจ่าย',
      closed_at: nowBangkok(),
      paid_at: '',
      note: ''
    });

    results.push({
      employee: emp.display_name,
      total: total,
      paymentId: paymentId
    });
  });

  // Send summary
  const summaryLines = results.map(function(r) {
    if (r.skipped) return '  - ' + r.employee + ' (' + r.reason + ')';
    return '  ' + r.employee + ': ' + (r.total || 0).toLocaleString() + ' บาท';
  });
  const totalSum = results.reduce(function(s, r) { return s + (r.total || 0); }, 0);

  pushMessage(getProp('OWNER_LINE_USER_ID'), [{
    type: 'text',
    text: '💰 ปิดงวด ' + period + ' เรียบร้อย\n\n' +
          summaryLines.join('\n') + '\n\n' +
          '─────────────────\n' +
          'รวมทั้งสิ้น: ' + totalSum.toLocaleString() + ' บาท\n\n' +
          'หลังโอนเงินแล้ว กดเปลี่ยนสถานะ "จ่ายแล้ว" ใน Sheet Payments'
  }]);

  return { ok: true, period: period, count: results.length, totalSum: totalSum };
}

function markPaid(payload) {
  if (!isOwner(payload.lineUserId)) return { ok: false, error: 'forbidden' };
  const paymentId = payload.paymentId;

  const ok = updateRow(SHEETS.PAYMENTS.name, function(r) {
    return r.payment_id === paymentId;
  }, {
    status: 'จ่ายแล้ว',
    paid_at: nowBangkok()
  });

  if (ok) {
    // Notify employee
    const payment = findRow(SHEETS.PAYMENTS.name, function(r) {
      return r.payment_id === paymentId;
    });
    const emp = findEmployeeById(payment.employee_id);
    if (emp) {
      pushMessage(emp.line_user_id, [{
        type: 'text',
        text: '💵 เงินเดือนงวด ' + payment.period + ' โอนเข้าบัญชีคุณแล้ว\n' +
              'จำนวน: ' + Number(payment.total_amount).toLocaleString() + ' บาท'
      }]);
    }
  }

  return { ok: ok };
}
