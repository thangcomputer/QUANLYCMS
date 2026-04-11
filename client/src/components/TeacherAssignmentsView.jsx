import React, { useState, useEffect } from 'react';
import { Plus, Clipboard, FileText, Download, CheckCircle, Clock, XCircle, Search } from 'lucide-react';
import api from '../services/api';

const TeacherAssignmentsView = ({ teacherId, myStudents }) => {
  // Compute unique courses from students
  const uniqueCourses = [...new Set((myStudents || []).map(s => s.course).filter(Boolean))];
  const [selectedCourse, setSelectedCourse] = useState(uniqueCourses[0] || '');

  const [assignments, setAssignments] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeSubmissions, setActiveSubmissions] = useState(null);
  
  // Create / Grade state
  const [formData, setFormData] = useState({ title: '', description: '', attachedFileUrl: '', deadline: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [gradingSubmission, setGradingSubmission] = useState(null);
  const [gradeData, setGradeData] = useState({ grade: '', teacherFeedback: '' });

  useEffect(() => {
    fetchAssignments();
  }, [selectedCourse]);

  const fetchAssignments = () => {
    if (!selectedCourse) return;
    api.assignments.getByCourse(selectedCourse)
      .then(res => {
        if (res.success) setAssignments(res.data);
      })
      .catch(console.error);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    if (!selectedCourse) return alert("Vui lòng chọn một lớp học bên Sidebar trước khi giao bài!");
    setIsSubmitting(true);
    api.assignments.create({
      ...formData,
      teacherId,
      courseId: selectedCourse,
      deadline: new Date(formData.deadline),
    }).then(res => {
      setIsSubmitting(false);
      if (res.success) {
        setShowCreateModal(false);
        setFormData({ title: '', description: '', attachedFileUrl: '', deadline: '' });
        fetchAssignments();
      }
    }).catch(() => setIsSubmitting(false));
  };

  const handleGrade = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    api.assignments.grade(gradingSubmission._id, gradeData)
      .then(res => {
        setIsSubmitting(false);
        if (res.success) {
          setGradingSubmission(null);
          setGradeData({ grade: '', teacherFeedback: '' });
          fetchAssignments();
        }
      }).catch(() => setIsSubmitting(false));
  };

  if (!selectedCourse) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <Search size={48} className="mb-4 opacity-20" />
        <p className="font-medium text-lg">Chưa chọn Lớp / Khóa học</p>
        <p className="text-sm">Vui lòng chọn một lớp bên Sidebar để xem bài tập.</p>
      </div>
    );
  }

  // Calculate stats for submissions view
  const calculateStats = (subs = []) => {
    const total = myStudents.filter(s => s.course === selectedCourse).length || 1; // Fallback to 1 to avoid div by 0
    const submitted = subs.filter(s => s.status !== 'not_submitted').length;
    const graded = subs.filter(s => s.status === 'graded').length;
    return {
      total,
      submitted,
      graded,
      missing: total - submitted
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
          <span className="flex items-center gap-2"><Clipboard size={20} className="text-purple-600" /> Bài tập của:</span>
          <select 
            value={selectedCourse} 
            onChange={(e) => setSelectedCourse(e.target.value)}
            className="border-2 border-purple-200 focus:border-purple-500 rounded-xl px-3 py-1.5 outline-none font-black text-blue-700 bg-purple-50 hover:bg-purple-100 transition-colors cursor-pointer text-sm"
          >
            {uniqueCourses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </h2>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-purple-200 transition-all flex items-center gap-2 active:scale-95"
        >
          <Plus size={16} /> Tạo bài tập mới
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {assignments.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-3xl border border-slate-100 shadow-sm">
            <FileText size={40} className="mx-auto mb-4 text-slate-200" />
            <p className="font-bold text-slate-600">Chưa có Bài tập nào</p>
            <p className="text-sm text-slate-400 mt-1">Giao bài đầu tiên cho lớp tải về làm thực hành</p>
          </div>
        ) : (
          assignments.map(a => {
            const stats = calculateStats(a.submissions);
            const isClosed = new Date(a.deadline) < new Date();
            
            return (
              <div key={a._id} className="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col justify-between hover:shadow-lg transition-shadow">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{a.title}</h3>
                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${isClosed ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {isClosed ? 'Đã đóng' : 'Hoạt động'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3 line-clamp-2">{a.description || 'Không có mô tả'}</p>
                  <p className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    <Clock size={12}/> Hạn chót: {new Date(a.deadline).toLocaleString('vi-VN')}
                  </p>
                </div>
                
                <div className="mt-5 space-y-3">
                  <div className="flex bg-slate-50 rounded-xl overflow-hidden divide-x divide-slate-100 border border-slate-100">
                    <div className="flex-1 text-center py-2">
                      <p className="text-xs font-semibold text-slate-400">Nộp bài</p>
                      <p className="font-black text-slate-700">{stats.submitted}/{stats.total}</p>
                    </div>
                    <div className="flex-1 text-center py-2">
                      <p className="text-xs font-semibold text-slate-400">Đã chấm</p>
                      <p className="font-black text-green-600">{stats.graded}</p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => setActiveSubmissions(a)}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-xl text-sm transition-colors text-center"
                  >
                    Xem tất cả {stats.submitted} bài nộp
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE SUBMISSION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Tạo mới Bài tập</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-red-500 bg-white shadow-sm p-1 rounded-full"><XCircle size={22}/></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Tên bài tập *</label>
                <input required type="text" className="w-full border-2 border-slate-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none font-semibold" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="VD: THVP Buổi 1..."/>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Mô tả / Yêu cầu</label>
                <textarea className="w-full border-2 border-slate-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-sm min-h-[100px]" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Yêu cầu làm các sheet..."></textarea>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Link File đề bài (Google Drive...)</label>
                <input type="url" className="w-full border-2 border-slate-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none text-sm" value={formData.attachedFileUrl} onChange={e => setFormData({...formData, attachedFileUrl: e.target.value})} placeholder="https://..."/>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Thời hạn (Deadline) *</label>
                <input required type="datetime-local" className="w-full border-2 border-slate-200 focus:border-purple-500 rounded-xl px-4 py-2.5 outline-none font-semibold" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})}/>
              </div>
              <button disabled={isSubmitting} type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-purple-200 mt-4 disabled:opacity-50">
                {isSubmitting ? 'Đang tạo...' : 'Tạo Bài Tập'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SUBMISSIONS MODAL */}
      {activeSubmissions && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Bài nộp: {activeSubmissions.title}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-1">Hạn nộp: {new Date(activeSubmissions.deadline).toLocaleString('vi-VN')}</p>
              </div>
              <button onClick={() => setActiveSubmissions(null)} className="text-slate-400 hover:text-red-500 bg-white shadow-sm p-1 rounded-full"><XCircle size={22}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {activeSubmissions.submissions?.length === 0 ? (
                <div className="text-center py-10 opacity-50"><p className="font-bold">Chưa có học viên nào nộp bài</p></div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-black tracking-wider">
                      <th className="p-3 rounded-tl-xl">Học viên</th>
                      <th className="p-3">Thời gian nộp</th>
                      <th className="p-3">Trạng thái</th>
                      <th className="p-3">Bài làm</th>
                      <th className="p-3 rounded-tr-xl">Điểm / Chấm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSubmissions.submissions.map(sub => {
                      const isGraded = sub.status === 'graded';
                      return (
                        <tr key={sub._id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-bold text-slate-700 text-sm">{sub.studentId?.name || 'Không xác định'}</td>
                          <td className="p-3 text-xs font-semibold text-slate-500">{new Date(sub.submittedAt || sub.createdAt).toLocaleString('vi-VN')}</td>
                          <td className="p-3">
                            {isGraded ? <span className="bg-green-100 text-green-700 text-[10px] uppercase font-black px-2 py-1 rounded-md">Đã chấm</span> : <span className="bg-blue-100 text-blue-700 text-[10px] uppercase font-black px-2 py-1 rounded-md">Đã nộp</span>}
                          </td>
                          <td className="p-3">
                            <a href={sub.submittedFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                              <Download size={14}/> Mở bài làm
                            </a>
                          </td>
                          <td className="p-3">
                            {isGraded ? (
                              <div className="text-sm">
                                <span className="font-black text-green-600">{sub.grade}/10</span>
                                <span className="block text-[10px] text-slate-500 max-w-[120px] truncate" title={sub.teacherFeedback}>{sub.teacherFeedback}</span>
                              </div>
                            ) : (
                              <button onClick={() => { setGradingSubmission(sub); setGradeData({ grade: '', teacherFeedback: '' }); }} className="text-xs font-bold bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded-lg transition-colors">
                                Chấm bài
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GRADING MODAL */}
      {gradingSubmission && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-lg text-slate-800">Chấm bài</h3>
              <button onClick={() => setGradingSubmission(null)} className="text-slate-400 hover:text-red-500 bg-white shadow-sm p-1 rounded-full"><XCircle size={22}/></button>
            </div>
            <form onSubmit={handleGrade} className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                <p className="text-xs text-slate-500 font-semibold mb-1">Đang chấm cho:</p>
                <p className="font-bold text-slate-800">{gradingSubmission.studentId?.name}</p>
                <a href={gradingSubmission.submittedFileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline mt-2 inline-block">Xem bài làm &rarr;</a>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Điểm số (0-10) *</label>
                <input required type="number" min="0" max="10" step="0.5" className="w-full border-2 border-slate-200 focus:border-green-500 rounded-xl px-4 py-2.5 outline-none font-bold text-xl text-green-700" value={gradeData.grade} onChange={e => setGradeData({...gradeData, grade: e.target.value})}/>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Nhận xét / Chữa bài</label>
                <textarea className="w-full border-2 border-slate-200 focus:border-green-500 rounded-xl px-4 py-2.5 outline-none text-sm min-h-[80px]" value={gradeData.teacherFeedback} onChange={e => setGradeData({...gradeData, teacherFeedback: e.target.value})} placeholder="Tốt, nhưng cần chú ý hàm VLOOKUP..."></textarea>
              </div>
              <button disabled={isSubmitting} type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-green-200 mt-4 disabled:opacity-50">
                {isSubmitting ? 'Đang lưu...' : 'Hoàn tất Chấm'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherAssignmentsView;
