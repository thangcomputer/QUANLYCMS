import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, AlertCircle, CheckCircle, Info, HelpCircle } from 'lucide-react';

const ModalContext = createContext(null);

export const ModalProvider = ({ children }) => {
  const [modal, setModal] = useState(null); // { title, content, type, onConfirm, onCancel, confirmText, cancelText }

  const showModal = useCallback(({ title, content, type = 'info', onConfirm, onCancel, confirmText = 'Đóng', cancelText = null, size = 'sm' }) => {
    setModal({ title, content, type, onConfirm, onCancel, confirmText, cancelText, size });
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (modal?.onConfirm) modal.onConfirm();
    setModal(null);
  }, [modal]);

  const handleCancel = useCallback(() => {
    if (modal?.onCancel) modal.onCancel();
    setModal(null);
  }, [modal]);

  return (
    <ModalContext.Provider value={{ showModal, closeModal }}>
      {children}
      {modal && <ModalUI modal={modal} onConfirm={handleConfirm} onCancel={handleCancel} />}
    </ModalContext.Provider>
  );
};

const ModalUI = ({ modal, onConfirm, onCancel }) => {
  const typeConfigs = {
    info:    { icon: Info,        color: 'blue',   gradient: 'from-blue-600 to-indigo-600' },
    success: { icon: CheckCircle, color: 'emerald',gradient: 'from-emerald-500 to-teal-600' },
    warning: { icon: AlertCircle, color: 'amber',  gradient: 'from-amber-500 to-orange-600' },
    error:   { icon: AlertCircle, color: 'rose',   gradient: 'from-rose-500 to-red-600' },
    question:{ icon: HelpCircle,  color: 'violet', gradient: 'from-violet-500 to-purple-600' },
  };

  const config = typeConfigs[modal.type] || typeConfigs.info;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    'full': 'max-w-[95vw]'
  };
  const sizeClass = sizeClasses[modal.size] || sizeClasses.sm;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onCancel}
      />
      
      {/* Modal Card */}
      <div className={`relative bg-white dark:bg-slate-900 w-full ${sizeClass} rounded-[2.5rem] shadow-2xl shadow-indigo-500/10 overflow-hidden animate-in zoom-in duration-300`}>
        {/* Top Header/Icon */}
        <div className={`h-24 bg-gradient-to-br ${config.gradient} flex items-center justify-center relative`}>
            <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white shadow-xl">
                <Icon size={32} />
            </div>
            
            <button 
                onClick={onCancel}
                className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
                <X size={20} />
            </button>
        </div>

        {/* Body */}
        <div className="p-8 text-center">
          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-3">
            {modal.title || 'Thông báo'}
          </h3>
          <div className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">
            {modal.content}
          </div>

          <div className="flex flex-col gap-3">
            {modal.confirmText && (
              <button
                onClick={onConfirm}
                className={`w-full py-4 bg-gradient-to-r ${config.gradient} text-white font-black rounded-2xl shadow-xl shadow-${config.color}-500/20 hover:shadow-${config.color}-500/40 transition-all active:scale-[0.98]`}
              >
                {modal.confirmText}
              </button>
            )}
            
            {modal.cancelText && (
              <button
                onClick={onCancel}
                className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-colors"
              >
                {modal.cancelText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const useModal = () => {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be inside ModalProvider');
  return ctx;
};
