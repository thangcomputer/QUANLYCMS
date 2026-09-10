import React, { useState } from 'react';
import CmsSelect from '../../ui/CmsSelect';
import { useAdminTab } from '../AdminTabContext';
import {
  BookOpen, Video, FileText, Download, ClipboardList, Trophy, Plus, HelpCircle,
  Edit3, Trash2, Save, Upload, Loader2, Star, CheckCircle2, X, PlayCircle,
  GraduationCap, Search, Clock, Layers, FileSpreadsheet, ImagePlus, Link2,
} from 'lucide-react';
import AdminCourseBuilder from '../../AdminCourseBuilder';
import TeacherQuestionBankPanel from './TeacherQuestionBankPanel';
import RichTextEditor from '../shared/RichTextEditor';
import { resolveTeacherExamDate, isTeacherExamDateApproximate, resolvePracticalFileUrl, practicalFileDisplayName, practicalFileDownloadUrl, practicalFileViewUrl } from '../utils/teacherExam';
import api, { buildMediaDownloadUrl, resolveMediaUrl } from '../../../services/api';
import { trainingUploadDisplayName } from '../utils/trainingUpload';
import { applyAnchorNewTabPolicy } from '../../../utils/htmlContent';
import ExamSubjectCheckboxGrid from '../shared/ExamSubjectCheckboxGrid';
import { useData } from '../../../context/DataContext';

export default function AdminTrainingTab() {
  // GV + training UI state live on AdminTabProvider (useAdminDashboardState / useAdminTeachers).
  // Do not read teachers/safeTeachersList from AdminTrainingContext — it does not provide them.
  const {
    toast, showGlobalModal, erGvSearch, setErGvSearch, erGvForm,
    ctxUpdateTeacher, fetchTeachers, safeTeachersList,
    courseBuilderMode, setCourseBuilderMode, trainingData, updateTrainingItem, trainingTab, setTrainingTab,
    trainingForm, setTrainingForm, questions, setErGvForm, BLANK_ER_GV, trainingFileUploading,
    handleTrainingDocUpload, addTrainingItem, setDeleteConfirm,
    setTeacherExamTimeLimitMinutes, teacherExamTimeLimitMinutes,
    examSubjectsCatalog,
  } = useAdminTab();

  const { examAdminGroupLabel } = useData();

  const teachersForExamResults = safeTeachersList || [];
  const [gvReviewModal, setGvReviewModal] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);

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
      setTrainingForm((prev) => ({ ...prev, coverImage: data.fileUrl }));
      toast.success('Đã tải ảnh bìa');
    } catch (err) {
      toast.error(err.message || 'Không tải được ảnh bìa');
    } finally {
      setCoverUploading(false);
    }
  };

  return (
            <div className="space-y-6">
              <div className="cms-toolbar">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2 min-w-0">
                  <BookOpen size={20} className="text-red-600" /> Quản lý Đào tạo Giảng viên
                </h2>
              </div>

              {courseBuilderMode ? (
                 <AdminCourseBuilder course={courseBuilderMode} onBack={() => setCourseBuilderMode(null)}
                   onPatch={async (updatedCourse) => {
                     const cid = courseBuilderMode.id || courseBuilderMode._id;
                     await updateTrainingItem('videos', cid, updatedCourse);
                   }}
                   onSave={async (updatedCourse) => {
                     const cid = courseBuilderMode.id || courseBuilderMode._id;
                     await updateTrainingItem('videos', cid, updatedCourse);
                     setCourseBuilderMode(null);
                   }}
                 />
              ) : (
                <>
              {/* Sub-tabs + primary action (laptop+: one row of tabs, action left-aligned) */}
              <div className="flex flex-col gap-3 lg:gap-4">
              <div className="cms-hscroll-tabs rounded-2xl p-1.5 shadow-sm border border-gray-100 bg-white">
                <div className="cms-hscroll-tabs__track">
                {[
                  { key: 'videos', icon: Video, label: 'Quản lý Khóa học', count: trainingData?.videos?.length || 0 },
                  { key: 'guides', icon: FileText, label: 'Quy trình', count: trainingData?.guides?.length || 0 },
                  { key: 'files', icon: Download, label: 'Tài liệu', count: trainingData?.files?.length || 0 },
                  { key: 'softwareLinks', icon: Link2, label: 'Link phần mềm', count: trainingData?.softwareLinks?.length || 0 },
                  { key: 'questions', icon: ClipboardList, label: 'Ngân hàng câu hỏi', count: questions?.length || 0 },
                  { key: 'exam-results-gv', icon: Trophy, label: 'Kết quả thi', count: teachersForExamResults.filter(t => t.testDate || t.testScore > 0 || t.status === 'Locked').length },
                ].map(t => (
                  <button
                    key={t.key}
                    type="button"
                    title={`${t.label} (${t.count})`}
                    aria-label={`${t.label} (${t.count})`}
                    onClick={() => { setTrainingTab(t.key); setTrainingForm(null); }}
                    className={`cms-hscroll-tab ${
                      trainingTab === t.key
                        ? t.key === 'exam-results-gv' ? 'bg-amber-600 text-white shadow-md' : 'bg-red-600 text-white shadow-md'
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

              {trainingTab !== 'questions' && trainingTab !== 'exam-results-gv' && (
                <button type="button" onClick={() => setTrainingForm(trainingTab === 'softwareLinks' ? { title: '', linkUrl: '', description: '', installGuide: '' } : { examSubjects: [] })}
                  className="inline-flex w-full sm:w-auto self-stretch sm:self-center lg:self-start min-h-11 justify-center bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-md transition items-center gap-2">
                  <Plus size={15} /> {trainingTab === 'videos' ? 'Thêm Khóa học' : trainingTab === 'guides' ? 'Thêm quy trình' : trainingTab === 'softwareLinks' ? 'Thêm link phần mềm' : 'Thêm tài liệu'}
                </button>
              )}
              {trainingTab === 'exam-results-gv' && (
                <button type="button" onClick={() => setErGvForm({ ...BLANK_ER_GV })}
                  className="inline-flex w-full sm:w-auto self-stretch sm:self-center lg:self-start min-h-11 justify-center bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-md transition items-center gap-2">
                  <Plus size={15} /> Thêm kết quả thi
                </button>
              )}
              </div>

              {/* Add/Edit Form */}
              {trainingForm && (
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-red-700 flex items-center gap-2 min-w-0">
                      <Edit3 size={16} /> {trainingForm.id ? 'Chỉnh sửa' : 'Thêm mới'}
                    </h3>
                    <button type="button" onClick={() => setTrainingForm(null)} className="shrink-0 inline-flex items-center justify-center min-w-11 min-h-11 rounded-2xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {trainingTab === 'softwareLinks' && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tên phần mềm</label>
                          <input value={trainingForm.title || ''} onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="VD: Microsoft Office 365" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Link tải / mở</label>
                          <input value={trainingForm.linkUrl || ''} onChange={e => setTrainingForm({ ...trainingForm, linkUrl: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="https://..." />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mô tả</label>
                          <textarea value={trainingForm.description || ''} onChange={e => setTrainingForm({ ...trainingForm, description: e.target.value })}
                            rows={3} className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none resize-y" placeholder="Mô tả ngắn..." />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Hướng dẫn cài đặt</label>
                          <RichTextEditor
                            value={trainingForm.installGuide || ''}
                            onChange={(val) => setTrainingForm((prev) => ({ ...prev, installGuide: val }))}
                            placeholder="Các bước cài đặt (định dạng chữ, danh sách, chèn hình...)"
                          />
                        </div>
                      </>
                    )}
                    {trainingTab !== 'softwareLinks' && trainingTab !== 'files' && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tiêu đề</label>
                      <input value={trainingForm.title || ''} onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="Nhập tiêu đề..." />
                    </div>
                    )}
                    {trainingTab === 'videos' && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Mô tả Khóa học (Tóm tắt)</label>
                        <input value={trainingForm.desc || ''} onChange={e => setTrainingForm({ ...trainingForm, desc: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="Nhập mô tả tóm tắt..." />
                      </div>
                    )}
                    {trainingTab === 'videos' && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ảnh bìa khóa học</label>
                        <p className="text-[11px] text-slate-500 mb-2">Khuyến nghị <strong>1280×720px</strong> (16:9). Tối thiểu 640×360. JPG/PNG/WEBP, tối đa ~5MB cho ảnh rõ.</p>
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-start">
                          <div className="w-full sm:w-48 aspect-video rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                            {trainingForm.coverImage ? (
                              <img src={resolveMediaUrl(trainingForm.coverImage)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">Chưa có ảnh</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <label className={`inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border-2 border-dashed border-purple-300 bg-purple-50/50 text-purple-800 text-xs font-black uppercase tracking-wide cursor-pointer hover:bg-purple-100 transition-colors ${coverUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                              {coverUploading ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />}
                              {coverUploading ? 'Đang tải...' : (trainingForm.coverImage ? 'Đổi ảnh' : 'Chọn ảnh')}
                              <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleCoverUpload} />
                            </label>
                            {trainingForm.coverImage ? (
                              <button
                                type="button"
                                onClick={() => setTrainingForm((prev) => ({ ...prev, coverImage: '' }))}
                                className="min-h-11 px-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50"
                              >
                                Xóa ảnh
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                    {trainingTab === 'guides' && (
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Biểu tượng</label>
                        <input value={trainingForm.icon || ''} onChange={e => setTrainingForm({ ...trainingForm, icon: e.target.value })}
                          className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="📋" />
                      </div>
                    )}
                    {trainingTab === 'files' && (
                      <>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tiêu đề</label>
                          <input value={trainingForm.title || ''} onChange={e => setTrainingForm({ ...trainingForm, title: e.target.value })}
                            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none" placeholder="Nhập tiêu đề..." />
                        </div>
                        <div>
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tải tệp</label>
                          <div className="flex flex-wrap items-center gap-2 min-h-[46px]">
                            <label className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-red-300 bg-red-50/50 text-red-800 text-xs font-black uppercase tracking-wide cursor-pointer hover:bg-red-100 transition-colors shrink-0 ${trainingFileUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                              {trainingFileUploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
                              {trainingFileUploading ? 'Đang tải...' : 'TẢI TỆP'}
                              <input type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onChange={(e) => handleTrainingDocUpload(e, 'teacher')} />
                            </label>
                            {trainingForm.fileUrl && String(trainingForm.fileType || '').toUpperCase() !== 'LINK' && (
                              <a
                                href={buildMediaDownloadUrl(trainingForm.fileUrl, trainingForm.fileOriginalName)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 max-w-[min(100%,14rem)] px-3 py-2 rounded-xl bg-red-100/80 border border-red-200 text-red-900 text-xs font-bold hover:bg-red-200/80 transition-colors truncate"
                                title={trainingUploadDisplayName(trainingForm.fileUrl, trainingForm.fileOriginalName)}
                              >
                                <FileText size={16} className="shrink-0 text-red-600" />
                                <span className="truncate">{trainingUploadDisplayName(trainingForm.fileUrl, trainingForm.fileOriginalName)}</span>
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
                                String(trainingForm.fileType || '').toUpperCase() === 'LINK'
                                  || /^https?:\/\//i.test(String(trainingForm.fileUrl || ''))
                                  ? (trainingForm.fileUrl || '')
                                  : (trainingForm.linkUrl || '')
                              }
                              onChange={(e) => {
                                const link = e.target.value.trim();
                                setTrainingForm({
                                  ...trainingForm,
                                  linkUrl: link,
                                  ...(link
                                    ? { fileUrl: link, fileType: 'LINK', fileSize: '', fileOriginalName: '' }
                                    : (String(trainingForm.fileType || '').toUpperCase() === 'LINK'
                                      ? { fileUrl: '', fileType: 'PDF' }
                                      : {})),
                                });
                              }}
                              className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-purple-400 outline-none"
                              placeholder="https://drive.google.com/..."
                            />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">Nếu điền link, học viên/GV sẽ thấy nút &quot;Mở link&quot; thay vì tải file.</p>
                        </div>
                      </>
                    )}
                  </div>
                  {trainingTab !== 'softwareLinks' && (
                  <ExamSubjectCheckboxGrid
                    catalog={examSubjectsCatalog}
                    value={trainingForm.examSubjects || []}
                    accent="purple"
                    groupLabels={{ admin: examAdminGroupLabel }}
                    onChange={(ids) => setTrainingForm((prev) => ({ ...prev, examSubjects: ids }))}
                  />
                  )}
                  {/* Mô tả - Rich Text Editor (ẩn với khóa học) */}
                  {trainingTab !== 'videos' && trainingTab !== 'softwareLinks' && (
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Nội dung mô tả (có định dạng)</label>
                      <RichTextEditor
                        value={trainingForm.desc || ''}
                        onChange={(val) => setTrainingForm(prev => ({ ...prev, desc: val }))}
                        placeholder="Nhập nội dung mô tả chi tiết..."
                      />
                    </div>
                  )}
                  <button onClick={() => {
                    if (trainingTab === 'softwareLinks') {
                      if (!String(trainingForm.title || '').trim()) {
                        toast.error('Nhập tên phần mềm');
                        return;
                      }
                      if (!String(trainingForm.linkUrl || '').trim()) {
                        toast.error('Nhập link tải / mở');
                        return;
                      }
                      const payload = {
                        title: String(trainingForm.title || '').trim(),
                        linkUrl: String(trainingForm.linkUrl || '').trim(),
                        description: String(trainingForm.description || '').trim(),
                        installGuide: String(trainingForm.installGuide || '').trim(),
                      };
                      if (trainingForm.id) {
                        updateTrainingItem('softwareLinks', trainingForm.id, payload);
                      } else {
                        addTrainingItem('softwareLinks', { ...payload, createdAt: new Date().toISOString().split('T')[0] });
                      }
                      setTrainingForm(null);
                      return;
                    }
                    if (!trainingForm.title?.trim()) { 
                        showGlobalModal({ title: 'Thiếu thông tin', content: 'Vui lòng nhập tiêu đề bài học!', type: 'warning' });
                        return; 
                    }
                    if (!trainingForm.examSubjects?.length) {
                      showGlobalModal({ title: 'Thiếu thông tin', content: 'Vui lòng chọn ít nhất một môn học!', type: 'warning' });
                      return;
                    }
                    const trainingPayload = trainingTab === 'files'
                      ? (() => {
                        const link = String(trainingForm.linkUrl || '').trim()
                          || (/^https?:\/\//i.test(String(trainingForm.fileUrl || '')) ? String(trainingForm.fileUrl).trim() : '');
                        if (link || String(trainingForm.fileType || '').toUpperCase() === 'LINK') {
                          const url = link || String(trainingForm.fileUrl || '').trim();
                          return {
                            ...trainingForm,
                            fileUrl: url,
                            url,
                            fileType: 'LINK',
                            fileSize: '',
                            fileOriginalName: '',
                            linkUrl: undefined,
                          };
                        }
                        return { ...trainingForm, fileType: trainingForm.fileType || 'PDF' };
                      })()
                      : trainingForm;
                    if (trainingForm.id) {
                      updateTrainingItem(trainingTab, trainingForm.id, trainingPayload);
                    } else {
                      addTrainingItem(trainingTab, { ...trainingPayload, createdAt: new Date().toISOString().split('T')[0] });
                    }
                    setTrainingForm(null);
                  }} className="w-full sm:w-auto min-h-11 justify-center bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-bold text-[15px] shadow-md transition flex items-center gap-2">
                    <Save size={15} /> {trainingForm.id ? 'Cập nhật' : 'Thêm mới'}
                  </button>
                </div>
              )}

              {/* ===== TEACHER EXAM RESULTS TAB ===== */}
              {trainingTab === 'exam-results-gv' && (() => {
                // Dùng danh sách GV thật (safeTeachersList) thay vì examResults riêng
                const gvResults = teachersForExamResults.filter(t => t.testDate || t.testScore > 0 || t.status === 'Locked');
                const filteredGv = gvResults.filter(t =>
                  !erGvSearch || (t.name || '').toLowerCase().includes(erGvSearch.toLowerCase())
                );
                return (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                      <div className="relative w-full sm:w-56">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={erGvSearch} onChange={e => setErGvSearch(e.target.value)}
                          className="w-full pl-8 pr-4 py-2.5 min-h-11 border-2 border-gray-200 rounded-2xl text-[15px] focus:border-amber-400 outline-none"
                          placeholder="Tìm theo tên giảng viên..." />
                      </div>
                      <span className="text-xs text-gray-400 font-bold sm:ml-auto">{filteredGv.length} bản ghi</span>
                    </div>
                    {filteredGv.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-14 text-center text-gray-400">
                        <Trophy size={36} className="mx-auto mb-3 text-gray-200" />
                        <p className="text-sm font-bold">Chưa có kết quả thi nào</p>
                      </div>
                    ) : (
                      <>
                        {/* Mobile: card grid — không bị cắt cột */}
                        <div className="sm:hidden grid grid-cols-1 gap-3">
                          {filteredGv.map(t => {
                            const mcScore = Number(t.testScore) || 0;
                            const isPassedMC = mcScore >= 80;
                            const examDate = resolveTeacherExamDate(t);
                            const statusLabel = t.status === 'active' ? 'CHÍNH THỨC' : t.status === 'Locked' ? 'BỊ KHÓA' : 'ĐANG CHỜ';
                            const statusCls = t.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : t.status === 'Locked'
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-amber-50 text-amber-600 border-amber-200';
                            return (
                              <div key={t.id || t._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5 space-y-3 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center text-white text-xs font-black shrink-0">
                                    {(t.name || '?')[0]}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-bold text-sm text-gray-800 truncate">{t.name}</p>
                                    <p className="text-xs text-gray-400 font-bold truncate">{t.phone}</p>
                                  </div>
                                  <span className={`shrink-0 inline-flex px-2 py-1 rounded-lg text-[10px] font-black border ${statusCls}`}>{statusLabel}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                  <div className="rounded-xl bg-slate-50 px-1.5 py-2 min-w-0">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">TN</p>
                                    <p className={`text-sm font-black ${isPassedMC ? 'text-sky-700' : 'text-red-500'}`}>{mcScore}</p>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase">{isPassedMC ? 'Đạt' : 'Trượt'}</p>
                                  </div>
                                  <div className="rounded-xl bg-slate-50 px-1.5 py-2 min-w-0 flex flex-col items-center justify-center">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">Tự luận</p>
                                    {t.practicalFile ? (
                                      <button
                                        type="button"
                                        onClick={() => setGvReviewModal(t)}
                                        className="text-[10px] font-bold text-red-700 underline truncate max-w-full"
                                        title={practicalFileDisplayName(t.practicalFile)}
                                      >
                                        Xem file
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-gray-300 font-bold italic">Chưa nộp</span>
                                    )}
                                  </div>
                                  <div className="rounded-xl bg-slate-50 px-1.5 py-2 min-w-0">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-0.5">Ngày thi</p>
                                    <p className="text-[10px] font-bold text-gray-600 leading-tight">
                                      {examDate
                                        ? examDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' })
                                        : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1.5 justify-end">
                                  {String(t.status || '').toLowerCase() === 'pending' && t.practicalFile ? (
                                    <>
                                      <button type="button" onClick={() => ctxUpdateTeacher(t.id || t._id, { practicalStatus: 'passed', status: 'active' })} className="px-2.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">CHẤM ĐẠT</button>
                                      <button type="button" onClick={() => ctxUpdateTeacher(t.id || t._id, { practicalStatus: 'failed', status: 'Locked', lockReason: 'Bài thi Tự luận/Thực hành chưa đạt yêu cầu' })} className="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 text-[10px] font-black border border-red-200">CHẤM TRƯỢT</button>
                                    </>
                                  ) : String(t.status || '').toLowerCase() === 'active' ? (
                                    <span className="text-xs text-sky-700 font-black">XONG</span>
                                  ) : String(t.status || '').toLowerCase() === 'locked' ? (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const id = t.id || t._id;
                                        try {
                                          await ctxUpdateTeacher(id, {
                                            status: 'pending',
                                            lockReason: null,
                                            practicalStatus: 'none',
                                            practicalFile: null,
                                            testScore: 0,
                                            testStatus: null,
                                            testDate: null,
                                          });
                                          toast.success('Đã mở khóa — giảng viên có thể vào thi lại.');
                                        } catch (e) {
                                          toast.error(e?.message || 'Không cập nhật được. Cần quyền Super Admin hoặc quyền Đào tạo trên tài khoản nhân viên.');
                                        }
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-white text-gray-800 text-[10px] font-black border-2 border-gray-800"
                                    >
                                      CHO THI LẠI
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 font-bold border px-2 py-1 border-gray-100 rounded-lg">ĐANG THI...</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Desktop/tablet: table */}
                        <div className="hidden sm:block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                          <div className="cms-table-wrap">
                            <table className="w-full text-left border-collapse min-w-[720px]">
                              <thead>
                                <tr className="bg-blue-50 border-b border-blue-100">
                                  <th className="px-3 py-3 text-[11px] font-black text-blue-700 uppercase tracking-wide">Giảng viên</th>
                                  <th className="px-3 py-3 text-[11px] font-black text-blue-700 uppercase tracking-wide text-center">Trắc nghiệm</th>
                                  <th className="px-3 py-3 text-[11px] font-black text-blue-700 uppercase tracking-wide text-center">Bài tự luận (tệp)</th>
                                  <th className="px-3 py-3 text-[11px] font-black text-blue-700 uppercase tracking-wide text-center">Trạng thái</th>
                                  <th className="px-3 py-3 text-[11px] font-black text-blue-700 uppercase tracking-wide">Ngày thi</th>
                                  <th className="px-3 py-3 text-[11px] font-black text-blue-700 uppercase tracking-wide text-right">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {filteredGv.map(t => {
                                  const mcScore = Number(t.testScore) || 0;
                                  const isPassedMC = mcScore >= 80;
                                  return (
                                    <tr key={t.id || t._id} className="hover:bg-blue-50/20 transition-colors">
                                      <td className="px-3 py-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="w-8 h-8 rounded-xl bg-red-500 flex items-center justify-center text-white text-xs font-black shrink-0">
                                            {(t.name || '?')[0]}
                                          </div>
                                          <div className="min-w-0">
                                            <span className="font-bold text-sm text-gray-800 block truncate">{t.name}</span>
                                            <span className="text-xs text-gray-400 font-bold">{t.phone}</span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        <div className="flex flex-col items-center">
                                          <span className={`text-lg font-black ${isPassedMC ? 'text-sky-700' : 'text-red-500'}`}>{mcScore}/100</span>
                                          <span className="text-xs cms-min-text-xs text-gray-400 font-bold uppercase">{isPassedMC ? 'ĐẠT' : 'TRƯỢT'}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        {t.practicalFile ? (
                                          <button
                                            type="button"
                                            onClick={() => setGvReviewModal(t)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold transition-all border border-red-200 max-w-[200px] truncate"
                                            title={practicalFileDisplayName(t.practicalFile)}
                                          >
                                            <Download size={12} className="shrink-0" />
                                            <span className="truncate">{practicalFileDisplayName(t.practicalFile)}</span>
                                          </button>
                                        ) : (
                                          <span className="text-gray-300 text-xs font-bold italic">Chưa nộp</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-3 text-center">
                                        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black ${
                                          t.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                          t.status === 'Locked' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                                        }`}>
                                          {t.status === 'active' ? 'CHÍNH THỨC' : t.status === 'Locked' ? 'BỊ KHÓA' : 'ĐANG CHỜ'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-3">
                                        <span className="text-xs text-gray-400 font-bold">
                                          {(() => {
                                            const d = resolveTeacherExamDate(t);
                                            return d
                                              ? d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                                              : 'N/A';
                                          })()}
                                        </span>
                                        {isTeacherExamDateApproximate(t) && (
                                          <span className="block text-xs cms-min-text-xs text-amber-600 font-bold mt-0.5">Ước lượng từ cập nhật hồ sơ</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-3 text-right">
                                        <div className="flex justify-end gap-1 flex-wrap">
                                          {String(t.status || '').toLowerCase() === 'pending' && t.practicalFile ? (
                                            <>
                                              <button onClick={() => ctxUpdateTeacher(t.id || t._id, { practicalStatus: 'passed', status: 'active' })} className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-black tracking-wide border border-emerald-200">CHẤM ĐẠT</button>
                                              <button onClick={() => ctxUpdateTeacher(t.id || t._id, { practicalStatus: 'failed', status: 'Locked', lockReason: 'Bài thi Tự luận/Thực hành chưa đạt yêu cầu' })} className="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 text-xs font-black tracking-wide border border-red-200">CHẤM TRƯỢT</button>
                                            </>
                                          ) : String(t.status || '').toLowerCase() === 'active' ? (
                                            <span className="text-xs text-sky-700 font-black">XONG</span>
                                          ) : String(t.status || '').toLowerCase() === 'locked' ? (
                                            <button
                                              type="button"
                                              onClick={async () => {
                                                const id = t.id || t._id;
                                                try {
                                                  await ctxUpdateTeacher(id, {
                                                    status: 'pending',
                                                    lockReason: null,
                                                    practicalStatus: 'none',
                                                    practicalFile: null,
                                                    testScore: 0,
                                                    testStatus: null,
                                                    testDate: null,
                                                  });
                                                  toast.success('Đã mở khóa — giảng viên có thể vào thi lại.');
                                                } catch (e) {
                                                  toast.error(e?.message || 'Không cập nhật được. Cần quyền Super Admin hoặc quyền Đào tạo trên tài khoản nhân viên.');
                                                }
                                              }}
                                              className="relative z-10 px-2 py-1.5 rounded-lg bg-white text-gray-800 hover:bg-gray-50 text-xs font-black border-2 border-gray-800 shadow-sm cursor-pointer"
                                            >
                                              CHO THI LẠI
                                            </button>
                                          ) : (
                                            <span className="text-xs text-gray-400 font-bold border px-2 py-1 border-gray-100 rounded-lg">ĐANG THI...</span>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* List items (training content) */}
              {trainingTab === 'questions' && (
                <TeacherQuestionBankPanel />
              )}
              {trainingTab !== 'exam-results-gv' && trainingTab !== 'questions' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                    {(trainingData?.[trainingTab] || []).map(item => (
                    <div key={item.id} className="px-4 sm:px-6 lg:px-8 py-4 lg:py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-50/50 transition">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 w-full">
                        {trainingTab === 'videos' && (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0 cursor-pointer hover:scale-105 transition" onClick={() => setCourseBuilderMode(item)}>
                            <BookOpen size={20} className="text-white" />
                          </div>
                        )}
                        {trainingTab === 'guides' && (
                          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl flex-shrink-0">
                            {item.icon || '📄'}
                          </div>
                        )}
                        {trainingTab === 'files' && (
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${item.fileType === 'PDF' ? 'bg-red-500' : item.fileType === 'PPTX' ? 'bg-orange-500' : 'bg-sky-500'
                            }`}>
                            {item.fileType || 'FILE'}
                          </div>
                        )}
                        {trainingTab === 'softwareLinks' && (
                          <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center flex-shrink-0">
                            <Link2 size={20} aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[15px] sm:text-base text-gray-800 line-clamp-2">{item.title}</p>
                          {trainingTab === 'softwareLinks' && item.linkUrl && (
                            <p className="text-xs sm:text-[13px] text-sky-700 font-semibold mt-0.5 truncate">{item.linkUrl}</p>
                          )}
                          <p className="text-xs sm:text-[13px] text-gray-400 line-clamp-2">
                            {trainingTab === 'softwareLinks'
                              ? (item.description || (item.installGuide || '').replace(/<[^>]*>/g, '') || '').slice(0, 80)
                              : (item.desc?.replace(/<[^>]*>/g, '') || '').slice(0, 80)}
                          </p>
                          {item.duration && <p className="text-xs text-purple-500 mt-0.5">⏱ {item.duration}</p>}
                          {item.fileSize && <p className="text-xs text-gray-400 mt-0.5">{item.fileSize}</p>}
                        </div>
                      </div>
                      <div className="cms-card-actions w-full sm:w-auto sm:ml-3 self-stretch sm:self-auto">
                        {trainingTab === 'videos' && (
                           <button type="button" onClick={() => setCourseBuilderMode(item)} className="cms-btn cms-btn-outline cms-btn-sm text-sky-700 border-sky-100 bg-sky-50 hover:bg-sky-100">
                             <Layers size={13} /> Giáo trình
                           </button>
                        )}
                        <button type="button" onClick={() => setTrainingForm({ ...item })}
                          className="cms-btn cms-btn-outline cms-btn-icon text-sky-600" aria-label="Chỉnh sửa" title="Chỉnh sửa"><Edit3 size={16} /></button>
                        <button type="button" onClick={() => setDeleteConfirm({ category: trainingTab, id: item.id, title: item.title })}
                          className="cms-btn cms-btn-outline cms-btn-icon text-red-600" aria-label="Xóa" title="Xóa"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                  {trainingTab !== 'questions' && (trainingData?.[trainingTab] || []).length === 0 && (
                    <div className="p-12 text-center text-gray-400">
                      <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                      <p className="text-sm">Chưa có nội dung nào</p>
                      <p className="text-xs text-gray-300 mt-1">Bấm "Thêm" để tạo nội dung đào tạo cho giảng viên</p>
                    </div>
                  )}
                </div>
              </div>
              )}
                </>
              )}

          {/* ===== MODAL KẾT QUẢ THI GIẢNG VIÊN ===== */}
          {erGvForm && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-[32px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in duration-300">
                <div className="bg-gradient-to-r from-red-700 to-red-500 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-3 text-white">
                  <h3 className="font-bold text-lg sm:text-xl flex items-center gap-2 sm:gap-3 min-w-0">
                    <GraduationCap size={22} className="shrink-0" /> {erGvForm.id ? 'Chỉnh sửa kết quả' : 'Thêm kết quả thi Giảng viên'}
                  </h3>
                  <button type="button" onClick={() => setErGvForm(null)} className="shrink-0 inline-flex items-center justify-center min-w-11 min-h-11 hover:bg-white/10 rounded-full transition"><X size={20} /></button>
                </div>
                <div className="p-4 sm:p-8 space-y-5 max-h-[75vh] overflow-y-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Giảng viên</label>
                      <CmsSelect value={erGvForm.teacherId || ''}
                        onChange={e => { const t = teachersForExamResults.find(x => String(x.id) === e.target.value || String(x._id) === e.target.value); setErGvForm({ ...erGvForm, teacherId: e.target.value, teacherName: t?.name || '' }); }}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold">
                        <option value="">-- Chọn giảng viên --</option>
                        {teachersForExamResults.map(t => (<option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>))}
                      </CmsSelect>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Bài / Môn thi</label>
                      <CmsSelect value={erGvForm.subject || ''} onChange={e => setErGvForm({ ...erGvForm, subject: e.target.value })}
                        className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold">
                        <option value="BÀI TEST GIẢNG VIÊN">BÀI TEST GIẢNG VIÊN</option>
                        <option value="THỰC HÀNH GIẢNG DẠY">THỰC HÀNH GIẢNG DẠY</option>
                        <option value="Khác">Khác</option>
                      </CmsSelect>
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-2xl p-4 space-y-3 border border-blue-100">
                    <p className="text-xs font-black text-blue-700 uppercase tracking-widest">📝 Phần Trắc nghiệm</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Điểm Trắc nghiệm (0-100)</label><input type="number" min="0" max="100" value={erGvForm.testScore || ''} onChange={e => setErGvForm({ ...erGvForm, testScore: e.target.value })} className="w-full border-2 border-blue-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm font-bold text-blue-800" placeholder="Chấm theo thang điểm 100" /></div>
                      <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Ngày thi</label><input type="datetime-local" value={erGvForm.testDate ? new Date(erGvForm.testDate).toISOString().slice(0,16) : ''} onChange={e => setErGvForm({ ...erGvForm, testDate: new Date(e.target.value).toISOString() })} className="w-full border-2 border-gray-200 rounded-xl p-3 focus:border-blue-500 outline-none text-sm" /></div>
                    </div>
                  </div>
                  <div className="bg-red-50 rounded-2xl p-4 space-y-3 border border-red-100">
                    <p className="text-xs font-black text-red-700 uppercase tracking-widest">✍️ BÀI TỰ LUẬN & GHI CHÚ</p>
                    <div><label className="text-xs font-bold text-gray-500 uppercase block mb-1">Đánh giá chung (Ghi chú)</label><textarea value={erGvForm.testNotes || ''} onChange={e => setErGvForm({ ...erGvForm, testNotes: e.target.value })} rows={2} className="w-full border-2 border-red-100 rounded-xl p-3 focus:border-purple-500 outline-none text-sm resize-none" placeholder="Đánh giá kết quả của giảng viên..." /></div>
                  </div>
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center bg-gray-50 rounded-2xl p-4 border border-gray-100">
                    <p className="text-[15px] font-black text-gray-700 flex-1">Kết quả: Xét duyệt Giảng dạy?</p>
                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                       <button onClick={() => setErGvForm({ ...erGvForm, status: 'active' })} 
                         className={`flex-1 px-5 py-3 rounded-2xl text-[12px] font-black transition-all duration-300 border-2 ${
                           erGvForm.status === 'active' 
                             ? 'bg-emerald-600 border-transparent text-white shadow-md scale-[1.02]' 
                             : 'bg-white border-gray-200 text-gray-400 hover:border-emerald-200 hover:text-emerald-500 hover:bg-emerald-50/50 hover:scale-[1.02]'
                         }`}>ĐẠT (CẤP QUYỀN)</button>
                       <button onClick={() => setErGvForm({ ...erGvForm, status: 'Locked' })} 
                         className={`flex-1 px-5 py-3 rounded-2xl text-[12px] font-black transition-all duration-300 border-2 ${
                           erGvForm.status === 'Locked' 
                             ? 'bg-red-600 border-transparent text-white shadow-md scale-[1.02]' 
                             : 'bg-white border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50/50 hover:scale-[1.02]'
                         }`}>CHƯA ĐẠT (KHÓA LẠI)</button>
                    </div>
                  </div>
                </div>
                <div className="px-4 sm:px-8 pb-4 sm:pb-8 flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={() => setErGvForm(null)} className="flex-1 min-h-11 py-3 border-2 border-gray-200 rounded-2xl font-semibold text-gray-600">Huỷ</button>
                  <button type="button" onClick={async () => {
                    if (!erGvForm.teacherId) { toast.error('Vui lòng chọn giảng viên!'); return; }
                    try {
                      await ctxUpdateTeacher(erGvForm.teacherId, {
                        testScore: Number(erGvForm.testScore) || 0,
                        testStatus: erGvForm.status === 'active' ? 'passed' : 'failed',
                        testDate: erGvForm.testDate || new Date().toISOString(),
                        testNotes: erGvForm.testNotes || '',
                        status: erGvForm.status || 'Locked'
                      });
                      toast.success('Đã cập nhật kết quả và trạng thái Giảng viên!');
                      setErGvForm(null);
                      fetchTeachers();
                    } catch (err) {
                      toast.error('Lỗi cập nhật: ' + (err.message || 'Không xác định'));
                    }
                  }} className="flex-1 min-h-11 py-3 bg-gradient-to-r from-red-700 to-red-500 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
                    <Save size={16} /> Lưu & Áp dụng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal xem / tải bài thực hành */}
          {gvReviewModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="bg-gradient-to-r from-red-600 to-red-500 px-4 sm:px-6 py-4 rounded-t-2xl">
                  <h3 className="text-white font-bold text-lg sm:text-xl flex items-center gap-2">
                    <FileSpreadsheet size={20} /> Kiểm Tra Bài Thực Hành
                  </h3>
                </div>
                <div className="p-4 sm:p-6 space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4 space-y-1">
                    <p className="text-sm"><strong>Giảng viên:</strong> {gvReviewModal.name}</p>
                    <p className="text-sm break-all"><strong>Tệp:</strong> {practicalFileDisplayName(gvReviewModal.practicalFile)}</p>
                    <p className="text-sm"><strong>Điểm trắc nghiệm:</strong> {gvReviewModal.testScore ?? 0}/100</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <a
                      href={practicalFileDownloadUrl(gvReviewModal.practicalFile)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-black transition-all text-sm"
                    >
                      <Download size={16} /> Tải file về
                    </a>
                    <a
                      href={practicalFileViewUrl(gvReviewModal.practicalFile)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 py-3 border-2 border-blue-200 text-blue-700 rounded-xl font-bold hover:bg-blue-50 transition-all text-sm"
                    >
                      <FileText size={16} /> Mở xem trực tiếp
                    </a>
                  </div>
                </div>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 flex flex-col sm:flex-row gap-3">
                  <button type="button" onClick={() => setGvReviewModal(null)} className="flex-1 min-h-11 py-3 border-2 border-gray-200 rounded-2xl font-semibold text-gray-600 hover:bg-gray-50">
                    Đóng
                  </button>
                  {String(gvReviewModal.status || '').toLowerCase() === 'pending' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await ctxUpdateTeacher(gvReviewModal.id || gvReviewModal._id, { practicalStatus: 'passed', status: 'active' });
                          toast.success('Đã chấm đạt bài thực hành.');
                          setGvReviewModal(null);
                          fetchTeachers();
                        } catch (e) {
                          toast.error(e?.message || 'Không cập nhật được.');
                        }
                      }}
                      className="flex-1 min-h-11 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 flex items-center justify-center gap-2 text-[15px]"
                    >
                      <CheckCircle2 size={16} /> Chấm đạt
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
            </div>
  );
}


