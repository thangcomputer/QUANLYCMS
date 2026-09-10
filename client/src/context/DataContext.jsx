import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { loadState, applyDataVersionReset } from './dataStorage';
import { useStudentsContext } from './StudentsContext';
import { useTeachersContext } from './TeachersContext';
import { useScheduleContext } from './ScheduleContext';
import { useFinanceContext } from './FinanceContext';
import { useDataTraining } from './useDataTraining';
import { useDataMessaging } from './useDataMessaging';
import { useDataNotifications } from './useDataNotifications';
import { useDataSchedule } from './useDataSchedule';
import { useDataAdminCrud } from './useDataAdminCrud';
import { useDataMaterials } from './useDataMaterials';
import { useDataRatings } from './useDataRatings';
import { useDataEvaluations } from './useDataEvaluations';
import { useDataSync } from './useDataSync';

export { buildConversationId } from '../utils/chatConversationId';

const DataContext = createContext(null);
const DataStateContext = createContext(null);
const DataActionsContext = createContext(null);

export const DataProvider = ({ children, user, onLogout }) => {
  const [currentUser, setCurrentUser] = useState(user || null);
  const triggerBackgroundSyncRef = useRef(async () => {});
  const triggerBackgroundSyncProxy = useCallback((...args) => triggerBackgroundSyncRef.current(...args), []);

  const setGroupsRef = useRef(null);
  const setSchedulesRef = useRef(() => {});
  const setExamResultsRef = useRef(() => {});

  useEffect(() => {
    applyDataVersionReset();
  }, []);

  useEffect(() => {
    setCurrentUser(user);
    if (user) triggerBackgroundSyncRef.current();
  }, [user]);

  useEffect(() => {
    const savedUser = localStorage.getItem('thvp_user');
    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (e) {
      }
    }
  }, []);

  const updateUserAvatar = useCallback((newAvatarUrl) => {
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, avatar: newAvatarUrl };
      try {
        localStorage.setItem('thvp_user', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    try {
      window.dispatchEvent(new CustomEvent('user:avatar-updated', { detail: newAvatarUrl }));
    } catch (e) {}
  }, []);

  const {
    students,
    studentsPagination,
    fetchStudentsPaginated,
    refreshStudents,
    setStudentsLocal: setStudents,
  } = useStudentsContext();
  const { teachers, setTeachersLocal: setTeachers, refreshTeachers } = useTeachersContext();
  const { schedules, setSchedulesLocal: setSchedules } = useScheduleContext();
  const { transactions, setTransactionsLocal: setTransactions } = useFinanceContext();

  const [staffs, setStaffs] = useState(() => loadState('thvp_staffs', []));

  useEffect(() => {
    setStaffs((prev) => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.filter(Boolean);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  useEffect(() => { localStorage.setItem('thvp_staffs', JSON.stringify(staffs)); }, [staffs]);

  const {
    trainingData, setTrainingData,
    studentTrainingData, setStudentTrainingData,
    setTrainingDataFromSync,
    setStudentTrainingDataFromSync,
    questions, setQuestions,
    teacherExamTimeLimitMinutes, setTeacherExamTimeLimitMinutes,
    teacherExamMinutes, updateTeacherExamMinutes,
    teacherEssayExamMinutes, updateTeacherEssayExamMinutes,
    studentQuestions, setStudentQuestions,
    studentExamMinutes, updateStudentExamMinutes,
    studentEssayExamMinutes, updateStudentEssayExamMinutes,
    studentEssayRequired, updateStudentEssayRequired,
    studentExamFiles, setStudentExamFile,
    examWarningSoundUrl, setExamWarningSoundUrl,
    examSubjectsCatalog, examAdminGroupLabel, addCustomExamSubject, updateCustomExamSubject, removeCustomExamSubject, updateExamAdminGroupLabel,
    applyStudentExamConfigFromServer,
    addStudentTrainingItem, updateStudentTrainingItem, removeStudentTrainingItem,
    addTrainingItem, updateTrainingItem, removeTrainingItem,
    addQuestion, addQuestionsBulk, updateQuestion, removeQuestion,     resetQuestions,
    replaceTeacherQuestionsForSubject,
    addStudentQuestion, addStudentQuestionsBulk, replaceStudentQuestionsForSubject, updateStudentQuestion,
    removeStudentQuestion, resetStudentQuestions, copyTeacherQuestionBankToStudents,
  } = useDataTraining(currentUser);

  const {
    socketNotifications,
    addNotification, markNotificationRead, dismissNotificationLocal, getNotifications,
  } = useDataNotifications({ currentUser });

  const {
    privateEvaluations, setPrivateEvaluations,
    submitPrivateEvaluation, getPrivateEvaluationsForAdmin, markEvaluationRead,
  } = useDataEvaluations({
    students, teachers,
    triggerBackgroundSync: triggerBackgroundSyncProxy,
    addNotification,
  });

  const {
    materials, addMaterial, removeMaterial, getMaterialsByCourse, getMaterialsByCategory,
  } = useDataMaterials({ students, addNotification });

  const {
    RATING_CRITERIA, rateTeacher, getTeacherRating,
  } = useDataRatings({
    students, teachers, setTeachers,
    triggerBackgroundSync: triggerBackgroundSyncProxy,
    addNotification,
    refreshTeachers,
  });

  const {
    isRefetching,
    triggerBackgroundSync, systemLogs, addSystemLog,
  } = useDataSync({
    currentUser, onLogout,
    setStudents, setTeachers, setTransactions, setStaffs,
    setSchedulesRef, setExamResultsRef, setGroupsRef,
    setTrainingData: setTrainingDataFromSync,
    setStudentTrainingData: setStudentTrainingDataFromSync,
    setQuestions, setTeacherExamTimeLimitMinutes,
    applyStudentExamConfigFromServer,
    setPrivateEvaluations,
  });
  triggerBackgroundSyncRef.current = triggerBackgroundSync;

  // Messages: vẫn useDataMessaging (staffs / SUPER_ADMIN mailbox / onReadAck).
  // MessagesContext chưa mount ở App — tránh double socket/SWR cho đến khi migrate đủ API.
  const {
    messages, setMessages, groups, setGroups,
    sendMessage, syncMessages, toggleMessageReaction, recallMessage,
    softDeleteMessage, createChatGroup, deleteChatGroup, leaveChatGroup, addGroupMembers,
    markMessagesRead, getConversations, getMessages,
  } = useDataMessaging({ currentUser, students, teachers, staffs, triggerBackgroundSync });
  setGroupsRef.current = setGroups;

  const {
    addSchedule, updateSchedule, cancelSchedule,
    markAttendance, getSchedulesByTeacher, getSchedulesByStudent,
  } = useDataSchedule({
    schedules, setSchedules, students, teachers, setStudents, triggerBackgroundSync, addNotification,
  });
  setSchedulesRef.current = setSchedules;

  const {
    examResults, setExamResults,
    addStudent, addTeacher, grantPending, removeTeacher, updateTeacher, updateStudent,
    assignTeacher, approveTeacher, manualActivateTeacher, suspendTeacher, reactivateTeacher,
    rejectTeacher, payTeacher, removeStudent, markStudentPaid,
    updateStudentLink, updateStudentSchedule, submitTestResult, submitPracticalFile,
    approveStudentExam, revokeStudentExam, failStudentExam, saveExamResult,
    addExamResult, updateExamResult, removeExamResult,
    getStudentsByTeacher, getTeacherStats, getAdminStats, getTransactionsByTeacher,
  } = useDataAdminCrud({
    students, setStudents, teachers, setTeachers, transactions, setTransactions,
    triggerBackgroundSync, addNotification,
    refreshStudents,
  });
  setExamResultsRef.current = setExamResults;

  const stateValue = useMemo(() => ({
    examResults,
    students, teachers, staffs, transactions, schedules,
    notifications: socketNotifications,
    messages, materials, groups,
    currentUser,
    studentsPagination,
    privateEvaluations,
    trainingData,
    studentTrainingData,
    questions,
    teacherExamTimeLimitMinutes,
    teacherExamMinutes,
    teacherEssayExamMinutes,
    studentQuestions,
    studentExamMinutes,
    studentEssayExamMinutes,
    studentEssayRequired,
    studentExamFiles,
    examWarningSoundUrl,
    examSubjectsCatalog,
    examAdminGroupLabel,
    systemLogs,
    isRefetching,
    RATING_CRITERIA,
  }), [
    examResults,
    students, teachers, staffs, transactions, schedules,
    socketNotifications, messages, materials, groups,
    currentUser, studentsPagination, privateEvaluations,
    trainingData, studentTrainingData, questions,
    teacherExamTimeLimitMinutes, teacherExamMinutes, teacherEssayExamMinutes,
    studentQuestions, studentExamMinutes, studentEssayExamMinutes, studentEssayRequired,
    studentExamFiles, examWarningSoundUrl, examSubjectsCatalog, examAdminGroupLabel, systemLogs, isRefetching, RATING_CRITERIA,
  ]);

  const actionsValue = useMemo(() => ({
    setCurrentUser,
    addExamResult, updateExamResult, removeExamResult,
    addStudent, addTeacher, removeTeacher, updateTeacher, updateStudent, assignTeacher,
    approveTeacher, manualActivateTeacher, suspendTeacher, reactivateTeacher,
    rejectTeacher, payTeacher, removeStudent, grantPending,
    markStudentPaid, getAdminStats, fetchStudentsPaginated,
    markAttendance, updateStudentLink, updateStudentSchedule,
    submitTestResult, submitPracticalFile,
    getStudentsByTeacher, getTeacherStats, getSchedulesByTeacher, getTransactionsByTeacher,
    getSchedulesByStudent,
    approveStudentExam, revokeStudentExam, failStudentExam, saveExamResult,
    sendMessage, syncMessages, markMessagesRead, getConversations, getMessages,
    recallMessage, softDeleteMessage, createChatGroup, deleteChatGroup, leaveChatGroup, addGroupMembers,
    addNotification, markNotificationRead, dismissNotificationLocal, getNotifications,
    addSchedule, updateSchedule, cancelSchedule,
    addMaterial, removeMaterial, getMaterialsByCourse, getMaterialsByCategory,
    rateTeacher, getTeacherRating,
    submitPrivateEvaluation, getPrivateEvaluationsForAdmin, markEvaluationRead,
    addStudentTrainingItem, updateStudentTrainingItem, removeStudentTrainingItem,
    addTrainingItem, updateTrainingItem, removeTrainingItem,
    addQuestion, addQuestionsBulk, updateQuestion, removeQuestion, resetQuestions,
    replaceTeacherQuestionsForSubject,
    setTeacherExamTimeLimitMinutes, updateTeacherExamMinutes, updateTeacherEssayExamMinutes,
    addStudentQuestion, addStudentQuestionsBulk, replaceStudentQuestionsForSubject,
    updateStudentQuestion, removeStudentQuestion, resetStudentQuestions,
    copyTeacherQuestionBankToStudents,
    updateStudentExamMinutes, updateStudentEssayExamMinutes, updateStudentEssayRequired,
    setStudentExamFile, setExamWarningSoundUrl,
    applyStudentExamConfigFromServer,
    addCustomExamSubject, updateCustomExamSubject, removeCustomExamSubject, updateExamAdminGroupLabel,
    addSystemLog, triggerBackgroundSync, toggleMessageReaction, updateUserAvatar,
  }), [
    setCurrentUser,
    addExamResult, updateExamResult, removeExamResult,
    addStudent, addTeacher, removeTeacher, updateTeacher, updateStudent, assignTeacher,
    approveTeacher, rejectTeacher, payTeacher, removeStudent, grantPending,
    markStudentPaid, getAdminStats, fetchStudentsPaginated,
    markAttendance, updateStudentLink, updateStudentSchedule,
    submitTestResult, submitPracticalFile,
    getStudentsByTeacher, getTeacherStats, getSchedulesByTeacher, getTransactionsByTeacher,
    getSchedulesByStudent,
    approveStudentExam, revokeStudentExam, failStudentExam, saveExamResult,
    sendMessage, syncMessages, markMessagesRead, getConversations, getMessages,
    recallMessage, softDeleteMessage, createChatGroup, deleteChatGroup, leaveChatGroup, addGroupMembers,
    addNotification, markNotificationRead, dismissNotificationLocal, getNotifications,
    addSchedule, updateSchedule, cancelSchedule,
    addMaterial, removeMaterial, getMaterialsByCourse, getMaterialsByCategory,
    rateTeacher, getTeacherRating,
    submitPrivateEvaluation, getPrivateEvaluationsForAdmin, markEvaluationRead,
    addStudentTrainingItem, updateStudentTrainingItem, removeStudentTrainingItem,
    addTrainingItem, updateTrainingItem, removeTrainingItem,
    addQuestion, addQuestionsBulk, updateQuestion, removeQuestion, resetQuestions,
    replaceTeacherQuestionsForSubject,
    setTeacherExamTimeLimitMinutes, updateTeacherExamMinutes, updateTeacherEssayExamMinutes,
    addStudentQuestion, addStudentQuestionsBulk, replaceStudentQuestionsForSubject,
    updateStudentQuestion, removeStudentQuestion, resetStudentQuestions,
    copyTeacherQuestionBankToStudents,
    updateStudentExamMinutes, updateStudentEssayExamMinutes, updateStudentEssayRequired,
    setStudentExamFile, setExamWarningSoundUrl,
    applyStudentExamConfigFromServer,
    addCustomExamSubject, updateCustomExamSubject, removeCustomExamSubject, updateExamAdminGroupLabel,
    addSystemLog, triggerBackgroundSync, toggleMessageReaction, updateUserAvatar,
  ]);

  const value = useMemo(
    () => ({ ...stateValue, ...actionsValue }),
    [stateValue, actionsValue],
  );

  return (
    <DataStateContext.Provider value={stateValue}>
      <DataActionsContext.Provider value={actionsValue}>
        <DataContext.Provider value={value}>{children}</DataContext.Provider>
      </DataActionsContext.Provider>
    </DataStateContext.Provider>
  );
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside DataProvider');
  return ctx;
};

/** Chỉ subscribe state (students/schedules/…) — actions ổn định hơn qua useDataActions */
export const useDataState = () => {
  const ctx = useContext(DataStateContext);
  if (!ctx) throw new Error('useDataState must be inside DataProvider');
  return ctx;
};

/** Chỉ subscribe actions — ít re-render hơn khi chỉ data list đổi */
export const useDataActions = () => {
  const ctx = useContext(DataActionsContext);
  if (!ctx) throw new Error('useDataActions must be inside DataProvider');
  return ctx;
};

export default DataContext;
