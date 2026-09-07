'use strict';
const { studentRepository } = require('../../student/repositories');
const Student = require('../../student/models/Student');
const Schedule = require('../../attendance/models/Schedule');
const Invoice = require('../../finance/models/Invoice');
const logger = require('../../../config/logger');
const { settlePayment, postRefund, voidLedgerEntry, postSalary } = require('../../finance/services/ledgerService');
const { applyEnrollmentStats, resolveEnrollmentExamSubjects } = require('./enrollmentService');

class EnrollmentApplicationService {
  async post_id_enrollments(data) {
  try {
    const { courseName, courseId, teacherId, price, totalSessions, paid, paymentMethod, teacherAlert } = data.body;
    if (!courseName?.trim() && !courseId) {
      return { _status: 400, _body: { success: false, message: 'Tên khóa học hoặc courseId là bắt buộc' } };
    }

    const isPaidFlag = paid === true || paid === 'true' || paid === 1 || paid === '1';
    if (isPaidFlag) {
      const canFinance = await userHasPermission(data.currentUser, PERMISSIONS.MANAGE_FINANCE);
      if (!canFinance) {
        return { _status: 403, _body: {
          success: false,
          message: '403 Forbidden: Đánh dấu đã thanh toán khi thêm khóa cần quyền tài chính.',
        } };
      }
    }

    const Course = require('../../course/models/Course');
    let catalogCourse = null;
    if (courseId) {
      catalogCourse = await Course.findById(courseId).lean();
    }
    const resolvedName = (catalogCourse?.name || courseName || '').trim();
    if (!resolvedName) {
      return { _status: 400, _body: { success: false, message: 'Không xác định được tên khóa học' } };
    }

    const student = await studentRepository.findById(data.id).populate('teacherId', 'name phone');
    if (!student) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy học viên' } };
    }

    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }

    const duplicate = (student.enrollments || []).some((e) => {
      if (String(e.status || '') === 'cancelled') return false;
      if (catalogCourse?._id && e.courseId && String(e.courseId) === String(catalogCourse._id)) return true;
      return (e.courseName || '').toLowerCase() === resolvedName.toLowerCase();
    });
    if (duplicate) {
      return { _status: 409, _body: { success: false, message: 'Học viên đã đăng ký khóa học này' } };
    }

    let teacherName = '';
    if (teacherId) {
      const Teacher = require('../../teacher/models/Teacher');
      const t = await Teacher.findById(teacherId).select('name').lean();
      teacherName = t?.name || '';
    }

    const sessions = Number(totalSessions) > 0 ? Number(totalSessions) : (catalogCourse?.totalSessions || 12);
    const resolvedPrice = Number(price) || catalogCourse?.discountPrice || catalogCourse?.price || 0;
    const isPaid = paid === true || paid === 'true' || paid === 1 || paid === '1';
    const examSubjects = await resolveEnrollmentExamSubjects({
      courseName: resolvedName,
      courseId: catalogCourse?._id || courseId,
    });

    student.enrollments.push({
      courseName: resolvedName,
      courseId: catalogCourse?._id || courseId || null,
      examSubjects,
      teacherId: teacherId || null,
      teacherName,
      price: resolvedPrice,
      paid: isPaid,
      paidAt: isPaid ? new Date() : undefined,
      totalSessions: sessions,
      remainingSessions: sessions,
      completedSessions: 0,
      grades: [],
      status: isPaid ? 'active' : 'pending_payment',
      learningAccess: !!isPaid,
      isPrimary: false,
      registeredAt: new Date(),
      requireWebcam: false,
      examUnlocked: false,
      teacherAlert: String(teacherAlert || '').trim().slice(0, 500),
    });

    // Cộng doanh thu thực nhận khi khóa phụ được đánh dấu đã thanh toán
    if (isPaid && resolvedPrice > 0) {
      student.paidAmount = (Number(student.paidAmount) || 0) + resolvedPrice;
      student.paid = true;
      if (!student.paidAt) student.paidAt = new Date();
    }

    await student.save();

    if (isPaid && resolvedPrice > 0) {
      const lastEnr = student.enrollments[student.enrollments.length - 1];
      const invoice = await createTuitionInvoice({
        student,
        courseName: resolvedName,
        amount: resolvedPrice,
        note: `Thanh toán khi thêm khóa ${resolvedName}`,
      });
      try {
        await settlePayment({
          student,
          amount: resolvedPrice,
          invoice,
          enrollmentId: String(lastEnr?._id || ''),
          courseName: resolvedName,
          source: 'enrollment_add_paid',
          sourceRef: invoice?.maHoaDon || `add:${student._id}:${lastEnr?._id || resolvedName}`,
          idempotencyKey: lastEnr?._id
            ? `payment:enrollment_add:${student._id}:${lastEnr._id}`
            : `payment:enrollment_add:${student._id}:${invoice?.maHoaDon || 'nohd'}`,
          actor: financeActor(req),
          note: `Thêm khóa ${resolvedName}`,
          reqMeta: financeReqMeta(req, student),
          metadata: { paymentMethod: paymentMethod || 'transfer' },
        });
        bustFinanceCaches();
      } catch (ledgerErr) {
        logger.error('[STUDENTS] ledger add enrollment FAILED — rollback: %s', ledgerErr.message);
        lastEnr.paid = false;
        lastEnr.paidAt = undefined;
        lastEnr.learningAccess = false;
        lastEnr.status = 'pending_payment';
        student.paidAmount = Math.max(0, (Number(student.paidAmount) || 0) - resolvedPrice);
        const stillPaid = (student.enrollments || []).some((e) => e.paid === true && e.status !== 'cancelled');
        student.paid = stillPaid;
        student.markModified('enrollments');
        await student.save();
        if (invoice?._id) {
          try { await Invoice.findByIdAndUpdate(invoice._id, { status: 'void' }); } catch { /* ignore */ }
        }
        return { _status: 500, _body: {
          success: false,
          message: 'Đã thêm khóa nhưng ghi sổ cái thất bại — trạng thái thu đã rollback.',
          data: student.toObject(),
        } };
      }
    }

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);

    const io = data.app.get('io');
    if (io) io.emit('data:refresh', { type: 'student', id: student._id });

    return { _status: 201, _body: {
      success: true,
      message: `Đã thêm khóa "${resolvedName}" cho học viên`,
      data: doc,
    } };
  } catch (error) {
    return { _status: 500, _body: { success: false, message: error.message } };
  }
}

  async put_id_enrollments_enrollmentId_settings(data) {
  try {
    const student = await studentRepository.findById(data.id);
    if (!student) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy học viên' } };
    }
    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }
    const idx = (student.enrollments || []).findIndex((e) => String(e._id) === String(data.enrollmentId));
    if (idx < 0) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy khóa học' } };
    }

    const { requireWebcam, examUnlocked } = data.body || {};
    if (typeof requireWebcam === 'boolean') {
      student.enrollments[idx].requireWebcam = requireWebcam;
    }
    if (typeof examUnlocked === 'boolean') {
      student.enrollments[idx].examUnlocked = examUnlocked;
    }

    // Đồng bộ flag root để tương thích API cũ / danh sách
    student.studentExamUnlocked = (student.enrollments || []).some((e) => e.examUnlocked === true);
    const primary = student.enrollments.find((e) => e.isPrimary) || student.enrollments[0];
    if (primary) {
      student.requireWebcam = primary.requireWebcam === true;
    }

    student.markModified('enrollments');
    await student.save({ validateModifiedOnly: true });

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);
    const io = data.app.get('io');
    if (io) io.emit('data:refresh', { type: 'student', id: student._id });

    return { _status: 200, _body: {
      success: true,
      message: 'Đã cập nhật quyền khóa học',
      data: doc,
    } };
  } catch (error) {
    return { _status: 500, _body: { success: false, message: error.message } };
  }
}

  async put_id_enrollments_enrollmentId_pay(data) {
  try {
    const { paymentMethod = 'cash', note = '' } = data.body || {};
    const student = await studentRepository.findById(data.id);
    if (!student) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy học viên' } };
    }
    if (!student.enrollments?.length && student.course) {
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }
    const idx = (student.enrollments || []).findIndex((e) => String(e._id) === String(data.enrollmentId));
    if (idx < 0) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy khóa học' } };
    }
    const enr = student.enrollments[idx];
    if (enr.paid) {
      return { _status: 409, _body: { success: false, message: 'Khóa học này đã thanh toán' } };
    }
    const amount = Number(enr.price) || 0;
    const paidAt = new Date();

    // Atomic claim trên enrollment chưa paid
    const claimed = await studentRepository.updateOne(
      {
        _id: student._id,
        enrollments: {
          $elemMatch: {
            _id: enr._id,
            paid: { $ne: true },
          },
        },
      },
      {
        $set: {
          'enrollments.$.paid': true,
          'enrollments.$.paidAt': paidAt,
          'enrollments.$.learningAccess': true,
          'enrollments.$.status': 'active',
        },
      },
      { returnDocument: 'after' }
    );
    if (!claimed) {
      return { _status: 409, _body: { success: false, message: 'Khóa học này đã thanh toán' } };
    }

    // Refresh + sync root paid cache
    const fresh = await studentRepository.findById(student._id);
    const claimedEnr = fresh.enrollments.find((e) => String(e._id) === String(enr._id)) || fresh.enrollments[idx];
    if (amount > 0) {
      fresh.paidAmount = (Number(fresh.paidAmount) || 0) + amount;
    }
    if (claimedEnr.isPrimary || fresh.enrollments.length === 1 || fresh.enrollments.every((e) => e.paid || e.status === 'cancelled')) {
      fresh.paid = true;
      fresh.paidAt = paidAt;
      fresh.paymentMethod = paymentMethod;
    } else if (fresh.enrollments.some((e) => e.paid)) {
      fresh.paid = true;
      if (!fresh.paidAt) fresh.paidAt = paidAt;
      fresh.paymentMethod = paymentMethod;
    }
    await fresh.save({ validateModifiedOnly: true });

    let invoice = null;
    if (amount > 0) {
      invoice = await createTuitionInvoice({
        student: fresh,
        courseName: claimedEnr.courseName,
        amount,
        note: note || `Thanh toán khóa ${claimedEnr.courseName}`,
      });
      try {
        await settlePayment({
          student: fresh,
          amount,
          invoice,
          enrollmentId: String(claimedEnr._id),
          courseName: claimedEnr.courseName,
          source: 'enrollment_pay',
          sourceRef: invoice?.maHoaDon || `enr:${claimedEnr._id}`,
          idempotencyKey: `payment:enrollment_pay:${fresh._id}:${claimedEnr._id}`,
          actor: financeActor(req),
          note: note || '',
          reqMeta: financeReqMeta(req, fresh),
        });
        bustFinanceCaches();
      } catch (ledgerErr) {
        logger.error('[STUDENTS] ledger enrollment pay FAILED — rollback: %s', ledgerErr.message);
        claimedEnr.paid = false;
        claimedEnr.paidAt = undefined;
        claimedEnr.learningAccess = false;
        claimedEnr.status = 'pending_payment';
        fresh.paidAmount = Math.max(0, (Number(fresh.paidAmount) || 0) - amount);
        fresh.paid = fresh.enrollments.some((e) => e.paid === true && e.status !== 'cancelled');
        fresh.markModified('enrollments');
        await fresh.save({ validateModifiedOnly: true });
        if (invoice?._id) {
          try { await Invoice.findByIdAndUpdate(invoice._id, { status: 'void' }); } catch { /* ignore */ }
        }
        return { _status: 500, _body: {
          success: false,
          message: 'Ghi sổ cái thất bại — đã rollback trạng thái thu khóa.',
        } };
      }
    }

    const io = data.app.get('io');
    if (io) io.emit('data:refresh', { type: 'student', id: fresh._id });

    const doc = fresh.toObject();
    await applyEnrollmentStats(doc, fresh._id, Schedule);
    return { _status: 200, _body: {
      success: true,
      message: `Đã xác nhận thanh toán khóa "${claimedEnr.courseName}"${amount ? ` — ${amount.toLocaleString('vi-VN')}đ` : ''}`,
      data: { student: doc, invoice },
    } };
  } catch (error) {
    return { _status: 500, _body: { success: false, message: error.message } };
  }
}

  async delete_id_enrollments_enrollmentId(data) {
  try {
    const student = await studentRepository.findById(data.id);
    if (!student) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy học viên' } };
    }
    if (!student.enrollments?.length && student.course) {
      const { legacyEnrollmentFromStudent } = require('../../enrollment/services/enrollmentService');
      student.enrollments = [legacyEnrollmentFromStudent(student)];
      student.enrollments[0].isPrimary = true;
    }
    const list = student.enrollments || [];
    const idx = list.findIndex((e) => String(e._id) === String(data.enrollmentId));
    if (idx < 0) {
      return { _status: 404, _body: { success: false, message: 'Không tìm thấy khóa học' } };
    }
    const enr = list[idx];
    if (enr.status === 'cancelled') {
      return { _status: 400, _body: { success: false, message: 'Khóa học này đã bị hủy trước đó.' } };
    }

    // Cho phép hủy cả khóa active cuối cùng — HV vẫn giữ hồ sơ (dòng danh sách mờ)

    const cancelReason = String(data.body?.cancelReason || '').trim() || 'Admin hủy khóa';
    const courseName = enr.courseName;
    const wasPaid = enr.paid === true;
    const paidAmt = Number(enr.price || 0);

    // Số tiền hoàn: chỉ hoàn khi client gửi rõ; mặc định 0 (hủy ≠ tự động hoàn toàn bộ)
    let refundAmt = 0;
    if (wasPaid && paidAmt > 0 && data.body?.refundAmount != null) {
      const bodyRefund = Number(data.refundAmount);
      if (Number.isFinite(bodyRefund) && bodyRefund >= 0 && bodyRefund <= paidAmt) {
        refundAmt = bodyRefund;
      }
    }

    // H3: hoàn tiền > 0 cần MANAGE_FINANCE
    if (refundAmt > 0) {
      const canFinance = await userHasPermission(data.currentUser, PERMISSIONS.MANAGE_FINANCE);
      if (!canFinance) {
        return { _status: 403, _body: {
          success: false,
          message: '403 Forbidden: Hoàn tiền khi hủy khóa cần quyền quản lý tài chính.',
        } };
      }
    }

    // Ledger refund trước khi soft-cancel (nếu có tiền hoàn)
    if (refundAmt > 0) {
      try {
        await postRefund({
          amount: refundAmt,
          student,
          enrollmentId: String(enr._id),
          courseName,
          note: `Hoàn học phí khi hủy khóa "${courseName}". Lý do: ${cancelReason}`,
          sourceRef: `cancel:${student._id}:${enr._id}`,
          idempotencyKey: `refund:cancel:${student._id}:${enr._id}`,
          actor: financeActor(req),
          reqMeta: financeReqMeta(req, student),
          metadata: { enrollmentId: String(enr._id), cancelReason },
        });
      } catch (ledgerErr) {
        logger.error('[STUDENTS] cancel enrollment refund FAILED: %s', ledgerErr.message);
        return res.status(ledgerErr.status || 500).json({
          success: false,
          message: ledgerErr.message || 'Ghi sổ hoàn thất bại — khóa chưa hủy.',
        });
      }
    }

    // Soft-cancel enrollment (giữ nguyên trong DB, đánh dấu cancelled)
    list[idx].status = 'cancelled';
    list[idx].cancelledAt = new Date();
    list[idx].cancelReason = cancelReason;
    list[idx].refundedAmount = refundAmt;
    list[idx].learningAccess = false;
    list[idx].paid = false;

    if (enr.isPrimary) {
      list[idx].isPrimary = false;
      const nextActive = list.find((e, i) => i !== idx && e.status !== 'cancelled');
      if (nextActive) nextActive.isPrimary = true;
    }

    student.enrollments = list;
    syncStudentFromPrimaryEnrollment(student);
    const activePaid = list.some((e) => e.status !== 'cancelled' && e.paid === true);
    student.paid = activePaid;
    if (refundAmt > 0) {
      student.paidAmount = Math.max(0, (Number(student.paidAmount) || 0) - refundAmt);
    }
    student.markModified('enrollments');
    await student.save();
    if (refundAmt > 0) bustFinanceCaches();

    let refundMsg = '';
    if (refundAmt > 0) {
      try {
        const { writeAudit } = require('../../report/services/auditLogService');
        await writeAudit({
          action: 'enrollment.cancel_refund',
          actorUserId: String(data.currentUser?.id || ''),
          actorRole: String(data.currentUser?.role || ''),
          studentId: student._id,
          branchId: student.branchId,
          entityType: 'enrollment',
          entityId: String(enr._id),
          oldValue: { status: 'active', paid: true, price: paidAmt },
          newValue: { status: 'cancelled', refundedAmount: refundAmt, cancelReason },
          ip: data.ip,
          userAgent: data.headers['user-agent'] || '',
        });
      } catch { /* ignore audit */ }
      refundMsg = ` Đã hoàn ${refundAmt.toLocaleString('vi-VN')}đ.`;
    }

    const io = data.app.get('io');
    if (io) {
      io.emit('data:refresh', { type: 'student', id: student._id });
      if (refundAmt > 0) io.emit('revenue:updated', { amount: -refundAmt, studentName: student.name });
    }

    const doc = student.toObject();
    await applyEnrollmentStats(doc, student._id, Schedule);
    return { _status: 200, _body: {
      success: true,
      message: `Đã hủy khóa "${courseName}".${refundMsg}`,
      data: doc,
      meta: { refundedAmount: refundAmt, cancelReason },
    } };
  } catch (error) {
    return { _status: 500, _body: { success: false, message: error.message } };
  }
}

}

module.exports = new EnrollmentApplicationService();
