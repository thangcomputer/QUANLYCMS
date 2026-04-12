import React, { useState } from 'react';
import { ArrowLeft, Plus, Move, Edit3, Trash2, Video, ChevronDown, ChevronUp, Save, Layers, ArrowUp, ArrowDown } from 'lucide-react';
import { useToast } from '../utils/toast.jsx';

const AdminCourseBuilder = ({ course, onBack, onSave }) => {
  const toast = useToast();
  
  // Use existing chapters or default mock
  const [chapters, setChapters] = useState(course?.chapters || course?.curriculum || []);

  const [editingChapterId, setEditingChapterId] = useState(null);
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [tempTitle, setTempTitle] = useState('');
  const [tempUrl, setTempUrl] = useState('');
  const [tempDuration, setTempDuration] = useState(0);

  // --- CHAPTER ACTIONS ---
  const addChapter = () => {
    const newChapter = {
      id: Date.now(),
      title: 'Chương mới',
      isOpen: true,
      lessons: []
    };
    setChapters([...chapters, newChapter]);
  };

  const updateChapterTitle = (id, newTitle) => {
    setChapters(chapters.map(c => c.id === id ? { ...c, title: newTitle } : c));
    setEditingChapterId(null);
  };

  const deleteChapter = (id) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa chương này (bao gồm tất cả bài học bên trong)?')) {
      setChapters(chapters.filter(c => c.id !== id));
    }
  };

  const moveChapter = (index, direction) => {
    const newChapters = [...chapters];
    if (direction === 'up' && index > 0) {
      [newChapters[index - 1], newChapters[index]] = [newChapters[index], newChapters[index - 1]];
    } else if (direction === 'down' && index < newChapters.length - 1) {
      [newChapters[index + 1], newChapters[index]] = [newChapters[index], newChapters[index + 1]];
    }
    setChapters(newChapters);
  };

  // --- LESSON ACTIONS ---
  const addLesson = (chapterId) => {
    const newLesson = {
      id: Date.now(),
      title: 'Bài học mới',
      type: 'video',
      duration: 0,
      videoUrl: ''
    };
    setChapters(chapters.map(c => {
      if (c.id === chapterId) {
        return { ...c, isOpen: true, lessons: [...c.lessons, newLesson] };
      }
      return c;
    }));
  };

  const updateLesson = (chapterId, lessonId, updates) => {
    setChapters(chapters.map(c => {
      if (c.id === chapterId) {
        return { ...c, lessons: c.lessons.map(l => l.id === lessonId ? { ...l, ...updates } : l) };
      }
      return c;
    }));
    setEditingLessonId(null);
  };

  const deleteLesson = (chapterId, lessonId) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa bài học này?')) {
      setChapters(chapters.map(c => {
        if (c.id === chapterId) {
          return { ...c, lessons: c.lessons.filter(l => l.id !== lessonId) };
        }
        return c;
      }));
    }
  };

  const moveLesson = (chapterId, lessonIndex, direction) => {
    setChapters(chapters.map(c => {
      if (c.id === chapterId) {
        const newLessons = [...c.lessons];
        if (direction === 'up' && lessonIndex > 0) {
          [newLessons[lessonIndex - 1], newLessons[lessonIndex]] = [newLessons[lessonIndex], newLessons[lessonIndex - 1]];
        } else if (direction === 'down' && lessonIndex < newLessons.length - 1) {
          [newLessons[lessonIndex + 1], newLessons[lessonIndex]] = [newLessons[lessonIndex], newLessons[lessonIndex + 1]];
        }
        return { ...c, lessons: newLessons };
      }
      return c;
    }));
  };

  // --- SAVE ---
  const handleSave = () => {
    if (onSave) {
      // Dùng chapters như là cấu trúc tổng của khoá, và gộp tất cả bài học lại dể làm index phẳng nếu cần
      // Nhưng giữ chuẩn format là `chapters`
      const allLessons = chapters.flatMap(c => c.lessons.map(l => ({...l, chapterTitle: c.title})));
      onSave({ 
        ...course, 
        chapters,
        // Cập nhật mảng videos cho format tương thích cũ nếu gọi trực tiếp
        videos: allLessons,
        lessons: allLessons 
      });
      toast.success('Đã lưu giáo trình thành công!');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-[100] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
      {/* HEADER */}
      <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition cursor-pointer text-gray-600 hover:text-blue-600 flex items-center gap-2 font-bold text-sm">
            <ArrowLeft size={18} /> Quay lại
          </button>
          <div>
            <h1 className="font-bold text-gray-800 text-lg">Thiết kế Giáo trình: {course?.title || 'Khóa học mới'}</h1>
            <p className="text-xs text-gray-500 font-medium">Sắp xếp lại bài giảng (Curriculum Builder)</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2">
            <Edit3 size={16} /> Cài đặt Khóa học
          </button>
          <button onClick={handleSave} className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition flex items-center gap-2">
            <Save size={16} /> Lưu Giáo Trình
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 border-l-4 border-l-purple-500">
             <h2 className="text-lg font-black text-gray-800 flex items-center gap-2"><Layers className="text-purple-500" /> Chương trình đào tạo</h2>
             <p className="text-sm text-gray-500 mt-1">Sắp xếp nội dung giáo trình, thêm bài giảng và chia phần rõ ràng.</p>
          </div>

          {chapters.map((chapter, cIdx) => (
            <div key={chapter.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm transition-all">
              {/* Chapter Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between group">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex flex-col gap-0.5 opacity-50 hover:opacity-100">
                    <button onClick={() => moveChapter(cIdx, 'up')} disabled={cIdx === 0} className="hover:text-blue-600 disabled:opacity-20"><ArrowUp size={14}/></button>
                    <button onClick={() => moveChapter(cIdx, 'down')} disabled={cIdx === chapters.length - 1} className="hover:text-blue-600 disabled:opacity-20"><ArrowDown size={14}/></button>
                  </div>
                  
                  {editingChapterId === chapter.id ? (
                     <div className="flex items-center gap-2 w-full max-w-sm">
                        <input autoFocus value={tempTitle} onChange={e => setTempTitle(e.target.value)} className="flex-1 border px-2 py-1 rounded text-sm outline-none focus:border-purple-400" />
                        <button onClick={() => updateChapterTitle(chapter.id, tempTitle)} className="text-xs bg-purple-600 text-white px-3 py-1 rounded font-bold">Lưu</button>
                        <button onClick={() => setEditingChapterId(null)} className="text-xs text-gray-500 hover:bg-gray-200 px-3 py-1 rounded font-bold">Hủy</button>
                     </div>
                  ) : (
                     <>
                        <h3 className="font-bold text-gray-800 text-base">Phần {cIdx + 1}: {chapter.title}</h3>
                        <button onClick={() => { setEditingChapterId(chapter.id); setTempTitle(chapter.title); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 p-1 transition"><Edit3 size={14}/></button>
                        <button onClick={() => deleteChapter(chapter.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1 transition"><Trash2 size={14}/></button>
                     </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">{chapter.lessons.length} bài học</span>
                  <button onClick={() => {
                     const newC = [...chapters];
                     newC[cIdx].isOpen = !newC[cIdx].isOpen;
                     setChapters(newC);
                  }} className="p-1 text-gray-500 hover:text-gray-800 transition">
                    {chapter.isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>

              {/* Lesson List */}
              {chapter.isOpen && (
                <div className="p-4 space-y-2 bg-gray-50/30">
                  {chapter.lessons.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm font-semibold border-2 border-dashed border-gray-200 rounded-xl bg-white">
                      Chưa có nội dung nào trong chương này
                    </div>
                  ) : (
                    chapter.lessons.map((lesson, lIdx) => (
                      <div key={lesson.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm group hover:border-purple-300 transition">
                        
                        {editingLessonId === lesson.id ? (
                          <div className="space-y-3">
                            <div>
                               <label className="text-[10px] uppercase font-bold text-gray-500 block">Tên bài học</label>
                               <input value={tempTitle} onChange={e => setTempTitle(e.target.value)} className="w-full border p-2 rounded outline-none focus:border-purple-400 text-sm" />
                            </div>
                            <div className="flex gap-3">
                               <div className="flex-1">
                                 <label className="text-[10px] uppercase font-bold text-gray-500 block">URL / YouTube ID</label>
                                 <input value={tempUrl} onChange={e => setTempUrl(e.target.value)} className="w-full border p-2 rounded outline-none focus:border-purple-400 text-sm" placeholder="VD: dQw4w9WgXcQ" />
                               </div>
                               <div className="w-32">
                                 <label className="text-[10px] uppercase font-bold text-gray-500 block">Thời lượng (s)</label>
                                 <input type="number" value={tempDuration} onChange={e => setTempDuration(e.target.value)} className="w-full border p-2 rounded outline-none focus:border-purple-400 text-sm" />
                               </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                               <button onClick={() => setEditingLessonId(null)} className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm font-bold transition">Hủy</button>
                               <button onClick={() => updateLesson(chapter.id, lesson.id, { title: tempTitle, videoUrl: tempUrl, url: tempUrl, duration: parseInt(tempDuration) || 0 })} className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition">Lưu bài học</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col gap-0.5 opacity-50 hover:opacity-100">
                                <button onClick={() => moveLesson(chapter.id, lIdx, 'up')} disabled={lIdx === 0} className="hover:text-blue-600 disabled:opacity-20"><ArrowUp size={12}/></button>
                                <button onClick={() => moveLesson(chapter.id, lIdx, 'down')} disabled={lIdx === chapter.lessons.length - 1} className="hover:text-blue-600 disabled:opacity-20"><ArrowDown size={12}/></button>
                              </div>
                              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><Video size={14} /></div>
                              <div>
                                <p className="text-sm font-bold text-gray-700">Bài {lIdx + 1}: {lesson.title}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5">{lesson.videoUrl || lesson.url || 'Chưa thiết lập URL'} • {lesson.duration || 0}s</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                               <button onClick={() => { setEditingLessonId(lesson.id); setTempTitle(lesson.title); setTempUrl(lesson.videoUrl || lesson.url || ''); setTempDuration(lesson.duration || 0); }} className="p-1.5 text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg"><Edit3 size={14}/></button>
                               <button onClick={() => deleteLesson(chapter.id, lesson.id)} className="p-1.5 text-red-500 bg-red-50 hover:bg-red-100 rounded-lg"><Trash2 size={14}/></button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {/* Add Lesson Button */}
                  <div className="mt-4 pt-2 border-t border-gray-100">
                    <button onClick={() => addLesson(chapter.id)} className="text-sm font-bold text-purple-600 hover:text-purple-700 flex items-center gap-1.5 px-2 py-1 transition">
                       <Plus size={16} /> Thêm bài giảng mới
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <button onClick={addChapter} className="w-full py-4 border-2 border-dashed border-purple-200 text-purple-600 font-bold rounded-2xl hover:bg-purple-50 hover:border-purple-300 transition flex items-center justify-center gap-2">
            <Plus size={18} /> Thêm Phần/Chương mới
          </button>

        </div>
      </div>
    </div>
  );
};

export default AdminCourseBuilder;
