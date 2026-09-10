import React from 'react';
import CmsSelect from '../../ui/CmsSelect';
import { useAdminTab } from '../AdminTabContext';
import { useAdminTraining } from '../hooks/AdminTrainingContext';
import { useSocket } from '../../../context/SocketContext';
import { EXAM_RESULTS_STUDENTS_FETCH_CAP } from '../hooks/adminConstants';
import {
  BookOpen, Video, Download, HelpCircle, Trophy, Plus, Clock, Trash2,
  FileSpreadsheet, Edit3, X, Upload, Loader2, FileText, Save, Search,
  CheckCircle2, XCircle, Layers, Award, ImagePlus, Link2,
} from 'lucide-react';
import NavArrow from '../../ui/NavArrow';
import AdminCourseBuilder from '../../AdminCourseBuilder';
import RichTextEditor from '../shared/RichTextEditor';
import { trainingUploadDisplayName } from '../utils/trainingUpload';
import ExamSubjectCheckboxGrid from '../shared/ExamSubjectCheckboxGrid';
import api, { apiFetch, buildMediaDownloadUrl, resolveMediaUrl } from '../../../services/api';
import { useData } from '../../../context/DataContext';
import StudentQuestionBankPanel from './StudentQuestionBankPanel';
import AdminTeacherQuizHistoryPanel from '../shared/AdminTeacherQuizHistoryPanel';

function mergeDocumentCourseOptions(dbCourses, lmsVideos) {
  const merged = [];
  const seen = new Set();
  (dbCourses || []).forEach((c) => {
    const id = String(c._id);
    const title = String(c.name || '').trim();
    if (!title) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ id, title, source: 'db' });
  });
  (lmsVideos || []).forEach((c) => {
    const title = String(c.title || '').trim();
    if (!title) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({ id: String(c.id), title, source: 'lms' });
  });
  return merged;
}

export default function AdminStudentTrainingTab() {
  const {
    students, showGlobalModal, BLANK_Q,
    erSearch, setErSearch, gradingRow, setGradingRow,
    gradingValue, setGradingValue, ctxUpdateStudent, toast, addNotification,
    erForm, setErForm, safeStudentsList,
    sTrainingTab, setSTrainingTab,
    fetchStudentsPaginated, selectedBranchId,
  } = useAdminTab();
  const { socket } = useSocket() || {};

  React.useEffect(() => {
    if (typeof fetchStudentsPaginated !== 'function') return undefined;
    const load = () => {
      fetchStudentsPaginated({
        page: 1,
        limit: EXAM_RESULTS_STUDENTS_FETCH_CAP,
        search: '',
        branch_id: selectedBranchId,
        forceBranchIdAll: selectedBranchId === 'all',
      });
    };
    load();
    if (!socket) return undefined;
    const onUpd = () => {
      load();
    };
    socket.on('student:updated', onUpd);
    socket.on('data:refresh', onUpd);
    return () => {
      socket.off('student:updated', onUpd);
      socket.off('data:refresh', onUpd);
    };
  }, [fetchStudentsPaginated, selectedBranchId, socket]);

  const {
    sCourseBuilderMode, setSCourseBuilderMode, updateStudentTrainingItem,
    studentTrainingData, setSTrainingForm,
    studentQuestions, studentExamMinutes, updateStudentExamMinutes,
    studentExamFiles, setStudentExamFile,
    resetStudentQuestions, setSqForm,
    studentQuestionsExcelInputRef, handleStudentQuestionsExcelFile,
    sTrainingForm, sTrainingFileUploading, handleTrainingDocUpload,
    addStudentTrainingItem,
    sqSection, setSqSection, sqType, setSqType, sqSearch, setSqSearch, removeStudentQuestion,
    removeStudentTrainingItem, sqForm, updateStudentQuestion, addStudentQuestion,
    updateExamResult, addExamResult, examSubjectsCatalog,
  } = useAdminTraining();
  const { examAdminGroupLabel } = useData();

  const [dbCourses, setDbCourses] = React.useState([]);
  const [coverUploading, setCoverUploading] = React.useState(false);

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      toast.error('Chỉ chọn file ảnh (JPG, PNG, WEBP…)');
      return;
    }
    setCoverUploading(true);
    try {
      const data = await api.settings.uploadTrainingFile(file);
      if (!data.success) throw new Error(data.message || 'Upload thất bại');
      setSTrainingForm((prev) => ({ ...prev, coverImage: data.fileUrl }));
      toast.success('Đã tải ảnh bìa');
    } catch (err) {
      toast.error(err.message || 'Không tải được ảnh bìa');
    } finally {
      setCoverUploading(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/courses');
        const json = await res.json();
        if (!cancelled && json?.success) setDbCourses(json.data || []);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const documentCourseOptions = React.useMemo(
    () => mergeDocumentCourseOptions(dbCourses, studentTrainingData?.videos),
    [dbCourses, studentTrainingData?.videos],
  );

  return (
    <>
            <div className="space-y-6">
              {sCourseBuilderMode ? (
                <AdminCourseBuilder
                  course={sCourseBuilderMode}
                  onBack={() => setSCourseBuilderMode(null)}
                  onPatch={async (updatedCourse) => {
                    const cid = sCourseBuilderMode.id || sCourseBuilderMode._id;
                    await updateStudentTrainingItem('videos', cid, updatedCourse);
                  }}
                  onSave={async (updatedCourse) => {
                    const cid = sCourseBuilderMode.id || sCourseBuilderMode._id;
                    await updateStudentTrainingItem('videos', cid, updatedCourse);
                    setSCourseBuilderMode(null);
                  }}
                />
              ) : (
              <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2 min-w-0">
                  <BookOpen size={20} className="text-sky-700 shrink-0" /> Quản lý Đào tạo Học viên
                </h2>
              </div>

              {/* Sub-tabs + primary action (laptop+: one row of tabs, action left-aligned) */}
              <div className="flex flex-col gap-3 lg:gap-4">
              <div className="cms-hscroll-tabs w-full rounded-2xl p-1.5 shadow-sm border border-gray-100 bg-white">
                <div className="cms-hscroll-tabs__track">
                {[
                  { key: 'videos', icon: Video, label: 'Quản lý Khóa học', count: studentTrainingData?.videos?.length || 0 },
                  { key: 'files', icon: Download, label: 'Tài liệu', count: studentTrainingData?.files?.length || 0 },
                  { key: 'softwareLinks', icon: Link2, label: 'Link phần mềm', count: studentTrainingData?.softwareLinks?.length || 0 },
                  { key: 'questions', icon: HelpCircle, label: 'Ngân hàng câu hỏi', count: studentQuestions?.length || 0 },
                  { key: 'exam-results', icon: Trophy, label: 'Kết quả thi', count: (students || []).reduce((acc, s) => acc + (s.examProgress || []).filter(ep => ep.status && ep.status !== 'chua_thi').length, 0) },
                  { key: 'quizzes', icon: Award, label: 'Lịch sử Trắc nghiệm GV', count: 'Mới' },
                ].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    title={`${t.label} (${t.count})`}
                    aria-label={`${t.label} (${t.count})`}
                    onClick={() => { setSTrainingTab(t.key); setSTrainingForm(null); setSCourseBuilderMode(null); }}
                    className={`cms-hscroll-tab ${
                      sTrainingTab === t.key
                        ? t.key === 'exam-results' ? 'bg-amber-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <t.icon size={16} className="shrink-0" aria-hidden="true" />
                    <span className="cms-hscroll-tab__label">{t.label}</span>
                    <span className="cms-hscroll-tab__count">({t.count})</span>
                  </button>
                ))}
                </div>
              </div>

              {sTrainingTab !== 'questions' && sTrainingTab !== 'exam-results' && sTrainingTab !== 'quizzes' && (
                <button type="button" onClick={() => { setSCourseBuilderMode(null); setSTrainingForm(sTrainingTab === 'softwareLinks' ? { title: '', linkUrl: '', description: '', installGuide: '' } : { examSubjects: [] }); }}
                  className="inline-flex w-full sm:w-auto self-stretch sm:self-center lg:self-start min-h-11 justify-center bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-md transition items-center gap-2">
                  <Plus size={15} /> {sTrainingTab === 'videos' ? 'Thêm Khóa học' : sTrainingTab === 'softwareLinks' ? 'Thêm link phần mềm' : 'Thêm tài liệu'}
                </button>
              )}
              </div>
              {sTrainingTab === 'questions' && <StudentQuestionBankPanel />}

              {/* Kết quả thi tự động từ bài thi của học viên - không cần thêm thủ công */}

              {/* Add/Edit Form */}
              {sTrainingForm && (
                <div className="bg-white rounded-2xl shadow-sm border border-sky-200 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-sky-700 flex items-center gap-2 min-w-0">
                      <Edit3 size={16} /> {sTrainingForm.id ? 'Chỉnh sửa' : 'Thêm mới'}
                    </h3>
                    <button type="button" onClick={() => setSTrainingForm(null)} className="shrink-0 inline-flex items-center justify-center min-w-11 min-h-11 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {sTrainingTab === 'softwareLinks' ? (
                      <>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tên phần mềm</label>
                          <input value={sTrainingForm.title || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, title: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="VD: Microsoft Office 365" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Link tải / mở</label>
                          <input value={sTrainingForm.linkUrl || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, linkUrl: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="https://..." />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mô tả</label>
                          <textarea value={sTrainingForm.description || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, description: e.target.value })}
                            rows={3} className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none resize-y" placeholder="Mô tả ngắn về phần mềm..." />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Hướng dẫn cài đặt</label>
                          <RichTextEditor
                            value={sTrainingForm.installGuide || ''}
                            onChange={(val) => setSTrainingForm((prev) => ({ ...prev, installGuide: val }))}
                            placeholder="Các bước cài đặt (định dạng chữ, danh sách, chèn hình...)"
                          />
                        </div>
                      </>
                    ) : (
                    <>
                    {sTrainingTab !== 'files' && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tiêu đề</label>
                      <input value={sTrainingForm.title || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, title: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="Nhập tiêu đề..." />
                    </div>
                    )}
                    {sTrainingTab === 'videos' && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mô tả Khóa học (Tóm tắt)</label>
                        <input value={sTrainingForm.desc || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, desc: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="Nhập mô tả tóm tắt..." />
                      </div>
                    )}
                    {sTrainingTab === 'videos' && (
                      <>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ảnh bìa khóa học</label>
                        <p className="text-[11px] text-slate-500 mb-2">Khuyến nghị <strong>1280×720px</strong> (16:9). Tối thiểu 640×360. JPG/PNG/WEBP, tối đa ~5MB cho ảnh rõ.</p>
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start">
                          <div className="w-full sm:w-48 aspect-video rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                            {sTrainingForm.coverImage ? (
                              <img src={resolveMediaUrl(sTrainingForm.coverImage)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">Chưa có ảnh</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <label className={`inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/50 text-sky-800 text-xs font-black uppercase tracking-wide cursor-pointer hover:bg-sky-100 transition-colors ${coverUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                              {coverUploading ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
                              {coverUploading ? 'Đang tải...' : (sTrainingForm.coverImage ? 'Đổi ảnh' : 'Chọn ảnh')}
                              <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleCoverUpload} />
                            </label>
                            {sTrainingForm.coverImage ? (
                              <button
                                type="button"
                                onClick={() => setSTrainingForm((prev) => ({ ...prev, coverImage: '' }))}
                                className="min-h-11 px-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50"
                              >
                                Xóa ảnh
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tên giảng viên / người hướng dẫn</label>
                        <input
                          value={sTrainingForm.instructorName || ''}
                          onChange={(e) => setSTrainingForm({ ...sTrainingForm, instructorName: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none"
                          placeholder="VD: Thầy Nguyễn Văn A"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Phần mềm sử dụng</label>
                        <input
                          value={sTrainingForm.software || ''}
                          onChange={(e) => setSTrainingForm({ ...sTrainingForm, software: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none"
                          placeholder="VD: Word, Excel, PowerPoint"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Giới thiệu giảng viên</label>
                        <textarea
                          value={sTrainingForm.instructorBio || ''}
                          onChange={(e) => setSTrainingForm({ ...sTrainingForm, instructorBio: e.target.value })}
                          rows={3}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none resize-y"
                          placeholder="Mô tả ngắn về người hướng dẫn (kinh nghiệm, chuyên môn…)"
                        />
                      </div>
                      </>
                    )}

                    {sTrainingTab === 'files' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Khóa học (Không bắt buộc)</label>
                          <CmsSelect
                            value={sTrainingForm.courseId || ''}
                            onChange={(e) => {
                              const cid = e.target.value;
                              const course = documentCourseOptions.find((c) => String(c.id) === String(cid));
                              setSTrainingForm({
                                ...sTrainingForm,
                                courseId: cid,
                                courseName: course?.title || '',
                              });
                            }}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none bg-white"
                          >
                            <option value="">— Chọn khóa học (tùy chọn) —</option>
                            {documentCourseOptions.map((c) => (
                              <option key={c.id} value={c.id}>{c.title}</option>
                            ))}
                          </CmsSelect>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tiêu đề</label>
                          <input value={sTrainingForm.title || ''} onChange={e => setSTrainingForm({ ...sTrainingForm, title: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none" placeholder="Nhập tiêu đề..." />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tải tệp</label>
                          <div className="flex flex-wrap items-center gap-2 min-h-[46px]">
                            <label className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-sky-300 bg-sky-50/50 text-sky-800 text-xs font-black uppercase tracking-wide cursor-pointer hover:bg-sky-100 transition-colors shrink-0 ${sTrainingFileUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                              {sTrainingFileUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                              {sTrainingFileUploading ? 'Đang tải...' : 'TẢI TỆP'}
                              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onChange={(e) => handleTrainingDocUpload(e, 'student')} />
                            </label>
                            {sTrainingForm.fileUrl && String(sTrainingForm.fileType || '').toUpperCase() !== 'LINK' && (
                              <a
                                href={buildMediaDownloadUrl(sTrainingForm.fileUrl, sTrainingForm.fileOriginalName)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 max-w-[min(100%,14rem)] px-3 py-2 rounded-xl bg-sky-100/80 border border-sky-200 text-sky-900 text-xs font-bold hover:bg-sky-200/80 transition-colors truncate"
                                title={trainingUploadDisplayName(sTrainingForm.fileUrl, sTrainingForm.fileOriginalName)}
                              >
                                <FileText size={16} className="shrink-0 text-sky-700" />
                                <span className="truncate">{trainingUploadDisplayName(sTrainingForm.fileUrl, sTrainingForm.fileOriginalName)}</span>
                              </a>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Hoặc link (Drive / URL)</label>
                          <div className="flex items-center gap-2">
                            <Link2 size={16} className="text-slate-400 shrink-0" />
                            <input
                              value={
                                String(sTrainingForm.fileType || '').toUpperCase() === 'LINK'
                                  || /^https?:\/\//i.test(String(sTrainingForm.fileUrl || ''))
                                  ? (sTrainingForm.fileUrl || '')
                                  : (sTrainingForm.linkUrl || '')
                              }
                              onChange={(e) => {
                                const link = e.target.value.trim();
                                setSTrainingForm({
                                  ...sTrainingForm,
                                  linkUrl: link,
                                  ...(link
                                    ? { fileUrl: link, fileType: 'LINK', fileSize: '', fileOriginalName: '' }
                                    : (String(sTrainingForm.fileType || '').toUpperCase() === 'LINK'
                                      ? { fileUrl: '', fileType: 'PDF' }
                                      : {})),
                                });
                              }}
                              className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-green-400 outline-none"
                              placeholder="https://drive.google.com/..."
                            />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">Nếu điền link, học viên sẽ thấy nút &quot;Mở link&quot; thay vì tải file.</p>
                        </div>
                      </>
                    )}
                    </>
                    )}
                  </div>
                  {sTrainingTab !== 'softwareLinks' && (
                  <ExamSubjectCheckboxGrid
                    catalog={examSubjectsCatalog}
                    value={sTrainingForm.examSubjects || []}
                    groupLabels={{ admin: examAdminGroupLabel }}
                    onChange={(ids) => setSTrainingForm((prev) => ({ ...prev, examSubjects: ids }))}
                  />
                  )}
                  {sTrainingTab !== 'softwareLinks' && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nội dung (có định dạng)</label>
                    <RichTextEditor
                      value={sTrainingForm.desc || ''}
                      onChange={(val) => setSTrainingForm(prev => ({ ...prev, desc: val }))}
                      placeholder="Nhập nội dung mô tả chi tiết..."
                    />
                  </div>
                  )}
                  <button onClick={() => {
                    if (sTrainingTab === 'softwareLinks') {
                      if (!String(sTrainingForm.title || '').trim()) {
                        toast.error('Nhập tên phần mềm');
                        return;
                      }
                      if (!String(sTrainingForm.linkUrl || '').trim()) {
                        toast.error('Nhập link tải / mở');
                        return;
                      }
                      const payload = {
                        title: String(sTrainingForm.title || '').trim(),
                        linkUrl: String(sTrainingForm.linkUrl || '').trim(),
                        description: String(sTrainingForm.description || '').trim(),
                        installGuide: String(sTrainingForm.installGuide || '').trim(),
                      };
                      if (sTrainingForm.id) {
                        updateStudentTrainingItem('softwareLinks', sTrainingForm.id, payload);
                      } else {
                        addStudentTrainingItem('softwareLinks', { ...payload, createdAt: new Date().toISOString().split('T')[0] });
                      }
                      setSTrainingForm(null);
                      return;
                    }
                    if (!sTrainingForm.examSubjects?.length) {
                      showGlobalModal({ title: 'Thiếu thông tin', content: 'Vui lòng chọn ít nhất một môn học!', type: 'warning' });
                      return;
                    }
                    const sTrainingPayload = sTrainingTab === 'files'
                      ? (() => {
                        const link = String(sTrainingForm.linkUrl || '').trim()
                          || (/^https?:\/\//i.test(String(sTrainingForm.fileUrl || '')) ? String(sTrainingForm.fileUrl).trim() : '');
                        if (link || String(sTrainingForm.fileType || '').toUpperCase() === 'LINK') {
                          const url = link || String(sTrainingForm.fileUrl || '').trim();
                          return {
                            ...sTrainingForm,
                            fileUrl: url,
                            url,
                            fileType: 'LINK',
                            fileSize: '',
                            fileOriginalName: '',
                            linkUrl: undefined,
                            courseName: sTrainingForm.courseName || 'Tài liệu học tập',
                          };
                        }
                        return {
                          ...sTrainingForm,
                          fileType: sTrainingForm.fileType || 'PDF',
                          courseName: sTrainingForm.courseName || 'Tài liệu học tập',
                        };
                      })()
                      : sTrainingForm;
                    if (sTrainingForm.id) {
                      updateStudentTrainingItem(sTrainingTab, sTrainingForm.id, sTrainingPayload);
                    } else {
                      addStudentTrainingItem(sTrainingTab, { ...sTrainingPayload, createdAt: new Date().toISOString().split('T')[0] });
                    }
                    setSTrainingForm(null);
                  }} className="w-full sm:w-auto min-h-11 justify-center bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-bold text-[15px] shadow-md transition flex items-center gap-2">
                    <Save size={15} /> {sTrainingForm.id ? 'Cập nhật' : 'Thêm mới'}
                  </button>
                </div>
              )}

              {/* ===== EXAM RESULTS TAB - ĐỌC TỪ students.examProgress ===== */}
              {sTrainingTab === 'exam-results' && (() => {
                const SUBJECT_LABELS = { coban: 'Máy vi tính (Cơ bản)', word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' };
                // Flatten all students' examProgress into rows
                const allRows = (students || []).flatMap(s => 
                  (s.examProgress || [])
                    .filter(ep => ep.status && ep.status !== 'chua_thi')
                    .map(ep => ({
                      studentId: s._id || s.id,
                      studentName: s.name,
                      course: s.course,
                      subjectId: ep.id,
                      subjectLabel: SUBJECT_LABELS[ep.id] || ep.id,
                      score: ep.tracNghiem?.score ?? 0,
                      total: ep.tracNghiem?.total ?? 15,
                      hasTracNghiem: Boolean(ep.tracNghiem && Number(ep.tracNghiem.total) > 0),
                      thucHanh: ep.thucHanh || 'chua_nop',
                      essayFile: ep.essayFile || '',
                      essayScore: ep.essayScore ?? null,
                      status: ep.status,
                      lockUntil: ep.lockUntil,
                    }))
                );
                const filtered = allRows.filter(r => 
                  !erSearch || r.studentName?.toLowerCase().includes(erSearch.toLowerCase())
                );

                // Helper: save essay score to student's examProgress
                const saveEssayScore = async (studentId, subjectId, newScore) => {
                  const student = (students || []).find(s => (s._id || s.id) === studentId);
                  if (!student) return;
                  const progress = (student.examProgress || []).map(ep => ({...ep}));
                  const idx = progress.findIndex(ep => ep.id === subjectId);
                  if (idx === -1) return;
                  progress[idx].essayScore = newScore;
                  const subjectLabel = SUBJECT_LABELS[subjectId] || subjectId;
                  // Nếu trắc nghiệm đạt >= 50% VÀ tự luận >= 5 => đạt, nếu < 5 => rớt + khóa 7 ngày
                  const tn = progress[idx].tracNghiem;
                  const tnPct = tn ? Math.round((tn.score / tn.total) * 100) : 0;
                  let finalResult = null;
                  if (tnPct >= 50 && progress[idx].thucHanh === 'da_nop') {
                    if (newScore >= 5) {
                      progress[idx].status = 'dat';
                      progress[idx].lockUntil = null;
                      finalResult = 'dat';
                    } else {
                      progress[idx].status = 'khong_dat';
                      progress[idx].lockUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
                      finalResult = 'khong_dat';
                    }
                  }
                  try {
                    await ctxUpdateStudent(studentId, { examProgress: progress });
                    toast.success(`Đã chấm ${newScore}/10 điểm tự luận cho ${student.name}!`);
                    // 🔔 Thông báo cho học viên
                    addNotification(studentId, 'student', `📝 Bài thực hành môn ${subjectLabel} đã được chấm: ${newScore}/10 điểm.`);
                    if (finalResult === 'dat') {
                      addNotification(studentId, 'student', `🎉 Chúc mừng! Bạn đã ĐẠT môn ${subjectLabel}!`);
                    } else if (finalResult === 'khong_dat') {
                      addNotification(studentId, 'student', `❌ Bạn CHƯA ĐẠT môn ${subjectLabel}. Môn thi sẽ bị khóa 7 ngày trước khi thi lại.`);
                    }
                  } catch (err) {
                    toast.error('Lỗi khi lưu điểm!');
                  }
                };

                return (
                <div className="space-y-4 animate-in fade-in duration-300">
                  {/* Filters */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="relative w-full sm:w-56">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input value={erSearch} onChange={e => setErSearch(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 min-h-11 border-2 border-gray-200 rounded-2xl text-[15px] focus:border-amber-400 outline-none"
                        placeholder="Tìm theo tên học viên..." />
                    </div>
                    <span className="text-xs text-gray-400 font-bold sm:ml-auto">
                      {filtered.length} bản ghi
                    </span>
                  </div>

                  {filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-14 text-center text-gray-400">
                      <Trophy size={36} className="mx-auto mb-3 text-gray-200" />
                      <p className="text-sm font-bold">Chưa có kết quả thi nào</p>
                      <p className="text-xs text-gray-300 mt-1">Khi học viên hoàn thành bài thi, kết quả sẽ tự động hiện tại đây</p>
                    </div>
                  ) : (
                  /* Table — mobile: vuốt ngang; chữ header rút gọn để thấy đủ cột */
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <p className="sm:hidden text-[11px] text-slate-400 px-3 py-1.5 border-b border-slate-50 flex items-center gap-0.5">
                      Vuốt ngang để xem đủ cột
                      <NavArrow size={12} className="text-slate-400" />
                    </p>
                    <div className="cms-table-wrap">
                      <table className="w-full text-left border-collapse min-w-[640px] sm:min-w-[900px]">
                        <thead>
                          <tr className="bg-amber-50 border-b border-amber-100">
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide whitespace-nowrap">Học viên</th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide whitespace-nowrap">Khóa học</th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide whitespace-nowrap">Môn thi</th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide text-center whitespace-nowrap">
                              <span className="sm:hidden">TN</span><span className="hidden sm:inline">Trắc nghiệm</span>
                            </th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide text-center whitespace-nowrap">
                              <span className="sm:hidden">TL</span><span className="hidden sm:inline">Tự luận (tệp)</span>
                            </th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide text-center whitespace-nowrap">
                              <span className="sm:hidden">Chấm TL</span><span className="hidden sm:inline">Chấm điểm TL</span>
                            </th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide text-center whitespace-nowrap">Trạng thái</th>
                            <th className="px-2.5 sm:px-4 py-2.5 sm:py-3 text-[10px] sm:text-xs font-bold text-amber-700 uppercase tracking-wide text-center whitespace-nowrap">Khóa đến</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {filtered.map((r, idx) => {
                            const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
                            const isLocked = r.lockUntil && r.lockUntil > Date.now();
                            const tnPass = pct >= 50;
                            // Đang thi: không lấy điểm TN=0 thành RỚT. ĐẠT/RỚT chỉ khi đã nộp / đã khóa.
                            const finalStatus = r.status === 'dang_thi' ? 'dang_thi'
                              : r.status === 'khong_dat' ? 'khong_dat'
                              : !tnPass ? 'khong_dat'
                              : r.thucHanh !== 'da_nop' ? r.status
                              : r.essayScore === null ? 'cho_cham'
                              : r.essayScore >= 5 ? 'dat' : 'khong_dat';
                            return (
                              <tr key={`${r.studentId}-${r.subjectId}`} className="hover:bg-amber-50/30 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center text-white text-xs font-black">
                                      {(r.studentName || '?')[0]}
                                    </div>
                                    <span className="font-bold text-sm text-gray-800">{r.studentName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs font-semibold text-gray-500">{r.course}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="text-xs font-bold text-gray-700">{r.subjectLabel}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex flex-col items-center">
                                    {r.status === 'dang_thi' && !r.hasTracNghiem ? (
                                      <span className="text-sm font-bold text-gray-400">—</span>
                                    ) : (
                                      <>
                                        <span className={`text-lg font-black ${pct >= 50 ? 'text-sky-700' : 'text-red-500'}`}>{r.score}/{r.total}</span>
                                        <span className="text-xs cms-min-text-xs text-gray-400 font-bold">{pct}%</span>
                                      </>
                                    )}
                                  </div>
                                </td>
                                {/* Cột Tự luận: Chưa nộp / Nút tải xuống */}
                                <td className="px-4 py-3 text-center">
                                  {r.thucHanh === 'da_nop' ? (
                                    r.essayFile ? (
                                      <a href={buildMediaDownloadUrl(r.essayFile, r.essayFile.split('/').pop())} 
                                         target="_blank" rel="noopener noreferrer"
                                         className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-black transition border border-blue-200">
                                        <Download size={12} /> Tải bài
                                      </a>
                                    ) : (
                                      <div className="flex flex-col items-center gap-1 max-w-[200px] mx-auto">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-sky-50 text-sky-700 border border-sky-200">
                                          ✅ Đã nộp
                                        </span>
                                        <span className="text-xs cms-min-text-xs text-amber-700 font-semibold leading-tight text-center">
                                          Không có file — HV cần nộp lại phần tự luận để lưu bài.
                                        </span>
                                      </div>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-gray-50 text-gray-400 border border-gray-200">
                                      ⏳ Chưa nộp
                                    </span>
                                  )}
                                </td>
                                {/* Cột Chấm điểm Tự luận (0-10) — INLINE INPUT */}
                                <td className="px-4 py-3 text-center">
                                  {r.thucHanh === 'da_nop' ? (() => {
                                    const rowKey = `${r.studentId}-${r.subjectId}`;
                                    const isGrading = gradingRow === rowKey;
                                    if (r.essayScore !== null && !isGrading) {
                                      // Đã chấm: hiện điểm + nút chấm lại
                                      return (
                                        <div className="flex flex-col items-center gap-1">
                                          <span className={`text-lg font-black ${r.essayScore >= 5 ? 'text-sky-700' : 'text-red-500'}`}>
                                            {r.essayScore}/10
                                          </span>
                                          <button onClick={() => { setGradingRow(rowKey); setGradingValue(String(r.essayScore)); }}
                                            className="text-xs cms-min-text-xs text-blue-500 hover:text-blue-700 font-bold cursor-pointer">
                                            Chấm lại
                                          </button>
                                        </div>
                                      );
                                    }
                                    if (isGrading) {
                                      // Đang nhập điểm inline
                                      return (
                                        <div className="flex items-center gap-1.5 justify-center">
                                          <input
                                            type="number" min="0" max="10" step="0.5"
                                            value={gradingValue}
                                            onChange={e => setGradingValue(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter' && gradingValue !== '' && !isNaN(gradingValue)) {
                                                saveEssayScore(r.studentId, r.subjectId, Math.min(10, Math.max(0, Number(gradingValue))));
                                                setGradingRow(null); setGradingValue('');
                                              }
                                              if (e.key === 'Escape') { setGradingRow(null); setGradingValue(''); }
                                            }}
                                            autoFocus
                                            className="w-14 px-2 py-1.5 border-2 border-amber-400 rounded-lg text-center text-sm font-black outline-none focus:border-amber-600 bg-amber-50"
                                            placeholder="0-10"
                                          />
                                          <button onClick={() => {
                                            if (gradingValue !== '' && !isNaN(gradingValue)) {
                                              saveEssayScore(r.studentId, r.subjectId, Math.min(10, Math.max(0, Number(gradingValue))));
                                              setGradingRow(null); setGradingValue('');
                                            }
                                          }} className="inline-flex items-center justify-center min-w-11 min-h-11 p-3 bg-red-600 text-white rounded-2xl hover:bg-red-700 transition" title="Lưu điểm">
                                            <CheckCircle2 size={16} />
                                          </button>
                                          <button type="button" onClick={() => { setGradingRow(null); setGradingValue(''); }}
                                            className="inline-flex items-center justify-center min-w-11 min-h-11 p-3 bg-gray-200 text-gray-500 rounded-2xl hover:bg-gray-300 transition" title="Huỷ">
                                            <X size={16} />
                                          </button>
                                        </div>
                                      );
                                    }
                                    // Chưa chấm: nút bấm để mở input
                                    return (
                                      <button onClick={() => { setGradingRow(rowKey); setGradingValue(''); }}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg text-xs font-black transition border border-amber-300">
                                        ✏️ Chấm điểm
                                      </button>
                                    );
                                  })() : (
                                    <span className="text-xs text-gray-300">—</span>
                                  )}
                                </td>
                                {/* Trạng thái tổng hợp */}
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black ${
                                    finalStatus === 'dat' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : finalStatus === 'khong_dat' ? 'bg-red-50 text-red-600 border border-red-200'
                                    : finalStatus === 'cho_cham' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : finalStatus === 'dang_thi' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                                  }`}>
                                    {finalStatus === 'dat' && <><CheckCircle2 size={11} /> ĐẠT</>}
                                    {finalStatus === 'khong_dat' && <><XCircle size={11} /> RỚT</>}
                                    {finalStatus === 'dang_thi' && '⏳ ĐANG THI'}
                                    {finalStatus === 'cho_cham' && '📝 CHỜ CHẤM'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {isLocked ? (
                                    <div className="group relative inline-flex flex-col items-center cursor-pointer">
                                      <span className="text-xs font-bold text-red-500 group-hover:opacity-30 transition-opacity">
                                        🔒 {new Date(r.lockUntil).toLocaleDateString('vi-VN')}
                                      </span>
                                      <button
                                        onClick={() => {
                                          showGlobalModal({
                                            title: 'Mở khóa cho học viên thi lại?',
                                            content: `Bạn có chắc muốn mở khóa môn "${r.subjectLabel}" cho học viên ${r.studentName}? Học viên sẽ được phép thi lại ngay lập tức.`,
                                            type: 'question',
                                            confirmText: 'Mở khóa',
                                            cancelText: 'Huỷ',
                                            onConfirm: async () => {
                                              const student = (students || []).find(s => (s._id || s.id) === r.studentId);
                                              if (!student) return;
                                              const progress = (student.examProgress || []).map(ep => ({...ep}));
                                              const epIdx = progress.findIndex(ep => ep.id === r.subjectId);
                                              if (epIdx === -1) return;
                                              // Xóa khóa + reset trạng thái để thi lại
                                              progress[epIdx].attemptCount = (progress[epIdx].attemptCount || 0) + 1;
                                              progress[epIdx].lockUntil = null;
                                              progress[epIdx].status = 'chua_thi';
                                              progress[epIdx].tracNghiem = null;
                                              progress[epIdx].thucHanh = 'chua_nop';
                                              progress[epIdx].essayScore = null;
                                              progress[epIdx].essayFile = null;
                                              try {
                                                await ctxUpdateStudent(r.studentId, { examProgress: progress });
                                                toast.success(`Đã mở khóa "${r.subjectLabel}" cho ${r.studentName}. Học viên có thể thi lại!`);
                                                // 🔔 Thông báo cho học viên
                                                addNotification(r.studentId, 'student', `🔓 Môn ${r.subjectLabel} đã được mở khóa! Bạn có thể thi lại ngay bây giờ.`);
                                              } catch (err) {
                                                toast.error('Lỗi khi mở khóa!');
                                              }
                                            }
                                          });
                                        }}
                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                                      >
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-black shadow-lg hover:bg-red-700 transition whitespace-nowrap">
                                          🔓 Mở khóa thi lại
                                        </span>
                                      </button>
                                    </div>
                                  ) : r.status === 'khong_dat' ? (
                                    <button
                                      onClick={() => {
                                        showGlobalModal({
                                          title: 'Cho học viên thi lại?',
                                          content: `Bạn có chắc muốn reset môn "${r.subjectLabel}" cho học viên ${r.studentName}? Học viên sẽ được phép thi lại.`,
                                          type: 'question',
                                          confirmText: 'Cho thi lại',
                                          cancelText: 'Huỷ',
                                          onConfirm: async () => {
                                            const student = (students || []).find(s => (s._id || s.id) === r.studentId);
                                            if (!student) return;
                                            const progress = (student.examProgress || []).map(ep => ({...ep}));
                                            const epIdx = progress.findIndex(ep => ep.id === r.subjectId);
                                            if (epIdx === -1) return;
                                            progress[epIdx].attemptCount = (progress[epIdx].attemptCount || 0) + 1;
                                            progress[epIdx].lockUntil = null;
                                            progress[epIdx].status = 'chua_thi';
                                            progress[epIdx].tracNghiem = null;
                                            progress[epIdx].thucHanh = 'chua_nop';
                                            progress[epIdx].essayScore = null;
                                            progress[epIdx].essayFile = null;
                                            try {
                                              await ctxUpdateStudent(r.studentId, { examProgress: progress });
                                              toast.success(`Đã mở cho ${r.studentName} thi lại "${r.subjectLabel}"!`);
                                              // 🔔 Thông báo cho học viên
                                              addNotification(r.studentId, 'student', `🔓 Môn ${r.subjectLabel} đã được cấp quyền thi lại! Bạn có thể vào thi ngay.`);
                                            } catch (err) {
                                              toast.error('Lỗi khi reset bài thi!');
                                            }
                                          }
                                        });
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold transition border border-blue-200"
                                    >
                                      🔓 Cho thi lại
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-300">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}
                </div>
                );
              })()}

              {sTrainingTab === 'quizzes' && (
                <AdminTeacherQuizHistoryPanel />
              )}

              {/* List items (training content) */}
              {sTrainingTab !== 'exam-results' && sTrainingTab !== 'questions' && sTrainingTab !== 'quizzes' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {(studentTrainingData?.[sTrainingTab] || []).map(item => (
                      <div key={item.id} className="px-4 sm:px-6 lg:px-8 py-4 lg:py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50/50 transition border-b border-gray-50 last:border-b-0">
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 w-full">
                          {sTrainingTab === 'videos' && (
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-105 transition overflow-hidden" onClick={() => setSCourseBuilderMode(item)}>
                              {item.coverImage ? (
                                <img src={resolveMediaUrl(item.coverImage)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <BookOpen size={20} className="text-white" />
                              )}
                            </div>
                          )}

                          {sTrainingTab === 'files' && (
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${item.fileType === 'PDF' ? 'bg-red-500' : item.fileType === 'PPTX' ? 'bg-orange-500' : 'bg-sky-500'
                              }`}>
                              {item.fileType || 'FILE'}
                            </div>
                          )}
                          {sTrainingTab === 'softwareLinks' && (
                            <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
                              <Link2 size={20} aria-hidden="true" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-[15px] sm:text-base text-gray-800 line-clamp-2">{item.title}</p>
                            {sTrainingTab === 'files' && item.courseName && (
                              <p className="text-xs sm:text-[13px] text-sky-700 font-bold mt-0.5">Khóa: {item.courseName}</p>
                            )}
                            {sTrainingTab === 'softwareLinks' && item.linkUrl && (
                              <p className="text-xs sm:text-[13px] text-sky-700 font-semibold mt-0.5 truncate">{item.linkUrl}</p>
                            )}
                            <p className="text-xs sm:text-[13px] text-gray-400 line-clamp-2">
                              {sTrainingTab === 'softwareLinks'
                                ? (item.description || (item.installGuide || '').replace(/<[^>]*>/g, '') || '').slice(0, 80)
                                : (item.desc?.replace(/<[^>]*>/g, '') || '').slice(0, 80)}
                            </p>
                            {item.duration && <p className="text-xs text-green-500 mt-0.5">⏱ {item.duration}</p>}
                            {item.fileSize && <p className="text-xs text-gray-400 mt-0.5">{item.fileSize}</p>}
                          </div>
                        </div>
                        <div className="cms-card-actions w-full sm:w-auto sm:ml-3 self-stretch sm:self-auto">
                          {sTrainingTab === 'videos' && (
                             <button type="button" onClick={() => setSCourseBuilderMode(item)} className="cms-btn cms-btn-outline cms-btn-sm text-sky-700 border-sky-100 bg-sky-50 hover:bg-sky-100">
                               <Layers size={13} /> Giáo trình
                             </button>
                          )}
                          <button type="button" onClick={() => setSTrainingForm({ ...item })}
                            className="cms-btn cms-btn-outline cms-btn-icon text-sky-600" aria-label="Chỉnh sửa" title="Chỉnh sửa"><Edit3 size={16} /></button>
                          <button type="button" onClick={() => {
                            showGlobalModal({
                              title: 'Xác nhận xoá tài liệu',
                              content: `Bạn có chắc muốn xoá tài liệu "${item.title}" dành cho học viên không?`,
                              type: 'warning',
                              confirmText: 'Xoá vĩnh viễn',
                              cancelText: 'Huỷ bỏ',
                              onConfirm: () => removeStudentTrainingItem(sTrainingTab, item.id)
                            });
                          }} className="cms-btn cms-btn-outline cms-btn-icon text-red-600" aria-label="Xóa" title="Xóa"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  {(studentTrainingData?.[sTrainingTab] || []).length === 0 && (
                    <div className="p-12 text-center text-gray-400">
                      <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Chưa có nội dung nào</p>
                      <p className="text-xs text-gray-300 mt-1">Bấm "Thêm" để tạo nội dung đào tạo cho học viên</p>
                    </div>
                  )}
                 </div>
              )}

            </>
            )}
            </div>

          {erForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
                <div className="bg-gradient-to-r from-amber-600 to-orange-500 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3 text-white">
                  <h3 className="font-bold text-lg sm:text-xl flex items-center gap-2 sm:gap-3 min-w-0">
                    <Trophy size={22} className="shrink-0" /> {erForm.id ? 'Chỉnh sửa / Chấm điểm' : 'Thêm kết quả thi mới'}
                  </h3>
                  <button type="button" onClick={() => setErForm(null)} className="shrink-0 inline-flex items-center justify-center min-w-11 min-h-11 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
                </div>
                <div className="p-4 sm:p-8 space-y-5 max-h-[75vh] overflow-y-auto">
                  {/* Chọn học viên */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Học viên</label>
                      <CmsSelect
                        value={erForm.studentId || ''}
                        onChange={e => {
                          const s = safeStudentsList.find(x => String(x.id) === e.target.value || String(x._id) === e.target.value);
                          setErForm({ ...erForm, studentId: e.target.value, studentName: s?.name || '' });
                        }}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 outline-none text-sm font-bold"
                      >
                        <option value="">-- Chọn học viên --</option>
                        {safeStudentsList.map(s => (
                          <option key={s.id || s._id} value={s.id || s._id}>{s.name}</option>
                        ))}
                      </CmsSelect>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Môn / Khóa học thi</label>
                      <CmsSelect value={erForm.subject || ''} onChange={e => setErForm({ ...erForm, subject: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 outline-none text-sm font-bold">
                        <option value="THVP NÂNG CAO (12 BUỔI)">THVP NÂNG CAO (12 BUỔI)</option>
                        <option value="MOS EXCEL CHUYÊN SÂU (10 BUỔI)">MOS EXCEL CHUYÊN SÂU (10 BUỔI)</option>
                        <option value="THIẾT KẾ ĐỒ HỌA CƠ BẢN">THIẾT KẾ ĐỒ HỌA CƠ BẢN</option>
                        <option value="AUTOCAD 2D - 3D (15 BUỔI)">AUTOCAD 2D - 3D (15 BUỔI)</option>
                        <option value="LẬP TRÌNH PYTHON CƠ BẢN">LẬP TRÌNH PYTHON CƠ BẢN</option>
                        <option value="Khác">Khác</option>
                      </CmsSelect>
                    </div>
                  </div>

                  {/* Trắc nghiệm */}
                  <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">📝 Phần Trắc nghiệm</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Số câu đúng</label>
                        <input type="number" min="0"
                          value={erForm.multipleChoiceCorrect || ''}
                          onChange={e => setErForm({ ...erForm, multipleChoiceCorrect: e.target.value })}
                          className="w-full border-2 border-blue-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold text-blue-800"
                          placeholder="30" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tổng số câu</label>
                        <input type="number" min="0"
                          value={erForm.multipleChoiceTotal || ''}
                          onChange={e => setErForm({ ...erForm, multipleChoiceTotal: e.target.value })}
                          className="w-full border-2 border-blue-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold text-blue-800"
                          placeholder="40" />
                      </div>
                    </div>
                    {erForm.multipleChoiceTotal > 0 && (
                      <p className="text-xs text-blue-600 font-bold">
                        Tỉ lệ: {Math.round((erForm.multipleChoiceCorrect / erForm.multipleChoiceTotal) * 100) || 0}%
                        {' '}({Number(erForm.multipleChoiceCorrect) >= Number(erForm.multipleChoiceTotal) * 0.7 ? '✅ Đạt phần trắc nghiệm' : '❌ Chưa đạt'})
                      </p>
                    )}
                  </div>

                  {/* Tự luận */}
                  <div className="bg-red-50 rounded-2xl p-4 space-y-3 border border-red-100">
                    <p className="text-xs font-black text-sky-700 uppercase tracking-widest">✍️ Phần tự luận (quản trị tự chấm)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Điểm tự luận (0–10)</label>
                        <input type="number" min="0" max="10" step="0.5"
                          value={erForm.essayScore !== undefined ? erForm.essayScore : ''}
                          onChange={e => setErForm({ ...erForm, essayScore: e.target.value })}
                          className="w-full border-2 border-red-200 rounded-xl p-3 focus:border-green-500 outline-none text-sm font-bold text-red-800"
                          placeholder="7.5" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ngày thi</label>
                        <input type="date"
                          value={erForm.date || ''}
                          onChange={e => setErForm({ ...erForm, date: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-amber-500 outline-none text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nhận xét tự luận</label>
                      <textarea value={erForm.essayNote || ''} onChange={e => setErForm({ ...erForm, essayNote: e.target.value })}
                        rows={2} className="w-full border-2 border-red-100 rounded-xl p-3 focus:border-green-500 outline-none text-sm resize-none"
                        placeholder="Nhận xét bài tự luận, ghi chú..." />
                    </div>
                  </div>

                  {/* Kết quả tổng */}
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-[15px] font-black text-gray-700 flex-1">Kết quả tổng: Đạt môn?</p>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                      <button onClick={() => setErForm({ ...erForm, passed: true })}
                        className={`flex-1 px-8 py-3 rounded-2xl text-[13px] font-black transition-all duration-300 border-2 ${
                          erForm.passed 
                            ? 'bg-emerald-600 border-transparent text-white shadow-md scale-[1.02]' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 hover:scale-[1.02]'
                        }`}>ĐẠT</button>
                      <button onClick={() => setErForm({ ...erForm, passed: false })}
                        className={`flex-1 px-8 py-3 rounded-2xl text-[13px] font-black transition-all duration-300 border-2 ${
                          !erForm.passed 
                            ? 'bg-red-600 border-transparent text-white shadow-md scale-[1.02]' 
                            : 'bg-white border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50/50 hover:scale-[1.02]'
                        }`}>CHƯA ĐẠT</button>
                    </div>
                  </div>
                </div>

                <div className="px-4 sm:px-8 pb-4 sm:pb-8 flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={() => setErForm(null)} className="flex-1 min-h-11 py-3 border-2 border-gray-200 rounded-2xl font-semibold text-gray-600">Huỷ</button>
                  <button type="button" onClick={() => {
                    if (!erForm.studentName?.trim()) { toast.error('Vui lòng chọn học viên!'); return; }
                    if (!erForm.subject?.trim()) { toast.error('Vui lòng chọn môn thi!'); return; }
                    if (erForm.id) {
                      updateExamResult(erForm.id, erForm);
                      toast.success('Đã cập nhật kết quả thi!');
                    } else {
                      addExamResult(erForm);
                      toast.success('Đã thêm kết quả thi!');
                    }
                    setErForm(null);
                  }} className="flex-1 min-h-11 py-3 bg-gradient-to-r from-amber-600 to-orange-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
                    <Save size={16} /> {erForm.id ? 'Cập nhật' : 'Lưu kết quả'}
                  </button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}
