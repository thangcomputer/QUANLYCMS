import React, { useState } from 'react';
import { useAdminTab } from '../AdminTabContext';

import ConfirmDeleteTrainingModal from './ConfirmDeleteTrainingModal';
import ConfirmDeleteEntityModal from './ConfirmDeleteEntityModal';
import GrantAccessModal from './GrantAccessModal';
import AddEnrollmentModal from './AddEnrollmentModal';
import AddStudentModal from './AddStudentModal';
import InvoiceTemplate from '../../InvoiceTemplate';
import EditStudentModal from './EditStudentModal';
import TeacherPayoutModal from './TeacherPayoutModal';
import AddTeacherModal from './AddTeacherModal';
import EditTeacherModal from './EditTeacherModal';
import ResetPasswordOtpModal from './ResetPasswordOtpModal';
import StudentDetailModal from '../../StudentDetailModal';

const StudentImportModal = React.lazy(() => import('../../StudentImportModal'));

const TEACHER_SAVE_KEYS = [
  'name', 'phone', 'zalo', 'email', 'specialty', 'subjectIds', 'voiceRegion', 'bio',
  'startDate', 'address', 'bankAccount', 'baseSalaryPerSession',
  'customStarBonusAmount', 'branchId', 'branchCode',
];

function stripTeacherUiFields(teacher) {
  if (!teacher || typeof teacher !== 'object') return {};
  const out = {};
  for (const k of TEACHER_SAVE_KEYS) {
    if (teacher[k] !== undefined) out[k] = teacher[k];
  }
  return out;
}

function teacherHasSubjects(teacher) {
  return Array.isArray(teacher?.subjectIds) && teacher.subjectIds.filter(Boolean).length > 0;
}

export default function AdminModalManager() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    deleteConfirm, setDeleteConfirm, removeTrainingItem,
    showModal, setShowModal, addStudent, teachers, globalTeachers,
    enrollmentModalStudent, setEnrollmentModalStudent, addEnrollment,
    payoutModal, setPayoutModal, handleGoToQR, handlePayout, handleSaveHoaHongRate, printStudent,
    showTeacherModal, setShowTeacherModal, teacherForm, setTeacherForm,
    isSuperAdmin, isHighAdmin, safeBranches, ctxAddTeacher, toast,
    grantModal, setGrantModal, ctxUpdateTeacher, grantPending,
    deleteModal, setDeleteModal, confirmDelete,
    showStudentDetailId, setShowStudentDetailId, studentDetailTab, studentDetailScheduleId,
    showImportModal, setShowImportModal, selectedBranchId,
    resetPwModal, setResetPwModal, handleOpenResetPw,
    editStudent, setEditStudent, ctxUpdateStudent,
    editTeacher, setEditTeacher, getTeacherRating,
  } = useAdminTab();

  const safeRun = async (fn, { errorMessage, skipToast = false } = {}) => {
    if (isSubmitting) return false;
    setIsSubmitting(true);
    try {
      await fn();
      return true;
    } catch (err) {
      if (!skipToast) {
        toast?.error?.(err?.message || errorMessage || 'Thao tác thất bại');
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {deleteConfirm && (
        <ConfirmDeleteTrainingModal
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => safeRun(async () => {
            await Promise.resolve(removeTrainingItem(deleteConfirm.category, deleteConfirm.id));
            toast?.success?.('Đã xoá mục đào tạo');
            setDeleteConfirm(null);
          }, { errorMessage: 'Không xoá được mục đào tạo' })}
        />
      )}

      {showModal && (
        <AddStudentModal
          teachers={teachers}
          onAdd={async (d) => {
            // addStudent tự toast — safeRun chỉ chặn double-submit; reject để modal không đóng khi lỗi
            const ok = await safeRun(() => addStudent(d), { skipToast: true });
            if (!ok) throw new Error('ADD_STUDENT_FAILED');
          }}
          isSubmitting={isSubmitting}
          onClose={() => setShowModal(false)}
        />
      )}

      {enrollmentModalStudent && (
        <AddEnrollmentModal
          student={enrollmentModalStudent}
          teachers={(teachers?.length ? teachers : globalTeachers) || []}
          onClose={() => setEnrollmentModalStudent(null)}
          onSubmit={async (payload) => {
            // addEnrollment tự toast success/error và trả false (không throw)
            const ok = await safeRun(async () => {
              const result = await addEnrollment(enrollmentModalStudent, payload);
              if (result === false) throw new Error('ENROLLMENT_FAILED');
            }, { skipToast: true });
            return ok;
          }}
          isSubmitting={isSubmitting}
        />
      )}

      {printStudent && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceTemplate data={{
            studentName: printStudent.name,
            courseName: printStudent.course,
            tuitionFee: printStudent.price,
            date: new Date(),
            receiverName: 'Hường Thảo Nga',
            isPaid: printStudent.paid,
          }} />
        </div>
      )}

      {payoutModal && (
        <TeacherPayoutModal
          payoutModal={payoutModal}
          setPayoutModal={setPayoutModal}
          onGoToQR={handleGoToQR}
          onConfirm={handlePayout}
          onSaveRate={handleSaveHoaHongRate}
        />
      )}

      {editStudent && (
        <div style={{ position: 'relative', zIndex: 9999 }}>
          <EditStudentModal
            student={editStudent}
            onClose={() => setEditStudent(null)}
            isSubmitting={isSubmitting}
            onSave={async (d) => {
              const ok = await safeRun(
                () => ctxUpdateStudent(editStudent.id || editStudent._id, d),
                { errorMessage: 'Không lưu được học viên' },
              );
              if (ok) {
                toast?.success?.('Đã cập nhật học viên');
                setEditStudent(null);
              }
            }}
            onResetPassword={(id, name) => handleOpenResetPw?.(id, name, 'student')}
            isPaid={!!editStudent.paid}
          />
        </div>
      )}

      {showTeacherModal && (
        <AddTeacherModal
          teacherForm={teacherForm}
          setTeacherForm={setTeacherForm}
          isSuperAdmin={isSuperAdmin || isHighAdmin}
          safeBranches={safeBranches}
          onClose={() => setShowTeacherModal(false)}
          onSubmit={(d) => safeRun(async () => {
            if (!(d?.name || '').trim() || !(d?.phone || '').trim()) {
              throw new Error('Vui lòng nhập họ tên và số điện thoại');
            }
            if (!teacherHasSubjects(d)) {
              throw new Error('Chọn ít nhất một môn học');
            }
            await ctxAddTeacher(d);
            toast?.success?.(`Đã tạo giảng viên ${d.name}`);
            setShowTeacherModal(false);
          }, { errorMessage: 'Không tạo được giảng viên' })}
          isSubmitting={isSubmitting}
        />
      )}

      {editTeacher && (
        <EditTeacherModal
          editTeacher={editTeacher}
          setEditTeacher={setEditTeacher}
          isSuperAdmin={isSuperAdmin || isHighAdmin}
          safeBranches={safeBranches}
          getTeacherRating={getTeacherRating}
          onClose={() => setEditTeacher(null)}
          onResetPassword={(id, name) => handleOpenResetPw?.(id, name, 'teacher')}
          onSave={async () => {
            const id = editTeacher.id || editTeacher._id;
            if (!id) {
              toast?.error?.('Thiếu mã giảng viên');
              return;
            }
            if (!teacherHasSubjects(editTeacher)) {
              toast?.error?.('Chọn ít nhất một môn học');
              return;
            }
            const ok = await safeRun(
              () => ctxUpdateTeacher(id, stripTeacherUiFields(editTeacher)),
              { errorMessage: 'Không lưu được giảng viên' },
            );
            if (ok) {
              toast?.success?.('Đã cập nhật giảng viên');
              setEditTeacher(null);
            }
          }}
        />
      )}

      {grantModal && (
        <GrantAccessModal
          modal={grantModal}
          onCancel={() => setGrantModal(null)}
          onConfirm={async () => {
            const ok = await safeRun(async () => {
              if (grantModal.type === 'student') {
                await ctxUpdateStudent(grantModal.id, { granted: true });
              } else {
                // Teacher grant: type is 'first' | 'retry' (or legacy 'teacher')
                if (typeof grantPending === 'function') {
                  await grantPending(grantModal.id);
                } else {
                  await ctxUpdateTeacher(grantModal.id, { status: 'pending' });
                }
              }
              toast?.success?.(`Đã cấp quyền cho ${grantModal.name || 'giảng viên'}`);
              setGrantModal(null);
            }, { errorMessage: 'Không cấp được quyền truy cập' });
            if (!ok) return;
          }}
        />
      )}

      {deleteModal && (
        <ConfirmDeleteEntityModal
          modal={deleteModal}
          onCancel={() => setDeleteModal(null)}
          onConfirm={() => safeRun(confirmDelete, { skipToast: true, errorMessage: 'Không xoá được' })}
          isSubmitting={isSubmitting}
        />
      )}

      {showStudentDetailId && (
        <StudentDetailModal
          studentId={showStudentDetailId}
          initialTab={
            !studentDetailTab || studentDetailTab === 'overview'
              ? 'summary'
              : studentDetailTab
          }
          highlightScheduleId={studentDetailScheduleId || undefined}
          onClose={() => setShowStudentDetailId(null)}
        />
      )}

      {showImportModal && (
        <React.Suspense fallback={null}>
          <StudentImportModal
            onClose={() => setShowImportModal(false)}
            branchId={selectedBranchId}
          />
        </React.Suspense>
      )}

      {resetPwModal && (
        <ResetPasswordOtpModal
          modal={resetPwModal}
          onClose={() => setResetPwModal(null)}
        />
      )}
    </>
  );
}
