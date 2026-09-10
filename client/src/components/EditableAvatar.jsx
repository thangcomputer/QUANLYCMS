import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Camera, Loader2, Move, RotateCcw, X } from 'lucide-react';
import { resolveAvatarUrl } from '../utils/defaultAvatars';
import { authAPI } from '../services/api';
import { useToast } from '../utils/toast';
import { useData } from '../context/DataContext';

export default function EditableAvatar({
  avatar,
  name,
  role,
  adminRole,
  gender = '',
  className = '',
  imgClassName = '',
  onSuccess,
  editable = true,
}) {
  const toast = useToast();
  const dataCtx = useData();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [localAvatar, setLocalAvatar] = useState(avatar);
  const [cropSource, setCropSource] = useState(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropImage, setCropImage] = useState(null);
  const dragRef = useRef(null);
  const cropPreviewSize = 240;

  useEffect(() => {
    setLocalAvatar(avatar);
  }, [avatar]);

  const resolved = resolveAvatarUrl({
    avatar: localAvatar || avatar,
    role,
    adminRole,
    gender,
    name,
  });
  // Cache-bust /uploads để tránh browser giữ bản 401 cũ sau khi đổi quyền public
  const displayAvatar = resolved.startsWith('/uploads/')
    ? `${resolved}${resolved.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(localAvatar || avatar || '').slice(-24))}`
    : resolved;

  const handleClick = (e) => {
    e.stopPropagation();
    if (!editable || loading) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn tệp hình ảnh (JPG, PNG, WEBP...)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Kích thước ảnh tối đa là 5MB');
      return;
    }

    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const baseScale = Math.max(cropPreviewSize / image.naturalWidth, cropPreviewSize / image.naturalHeight);
      setCropImage({ image, baseScale });
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
      setCropSource(source);
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      toast.error('Không đọc được ảnh đã chọn. Vui lòng thử ảnh JPG, PNG hoặc WEBP khác.');
    };
    image.src = source;
  };

  useEffect(() => () => {
    if (cropSource) URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  const cropImageStyle = useMemo(() => {
    if (!cropImage) return {};
    const width = cropImage.image.naturalWidth * cropImage.baseScale * cropZoom;
    const height = cropImage.image.naturalHeight * cropImage.baseScale * cropZoom;
    return {
      width,
      height,
      left: `calc(50% - ${width / 2}px + ${cropOffset.x}px)`,
      top: `calc(50% - ${height / 2}px + ${cropOffset.y}px)`,
    };
  }, [cropImage, cropZoom, cropOffset]);

  const finishCrop = async () => {
    if (!cropImage || loading) return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const outputScale = 512 / cropPreviewSize;
    const scale = cropImage.baseScale * cropZoom;
    const drawWidth = cropImage.image.naturalWidth * scale;
    const drawHeight = cropImage.image.naturalHeight * scale;
    const drawX = (cropPreviewSize - drawWidth) / 2 + cropOffset.x;
    const drawY = (cropPreviewSize - drawHeight) / 2 + cropOffset.y;
    ctx.drawImage(cropImage.image, drawX * outputScale, drawY * outputScale, drawWidth * outputScale, drawHeight * outputScale);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error('Không tạo được ảnh đại diện đã căn chỉnh.');
        return;
      }
      const file = new File([blob], 'avatar-cropped.jpg', { type: 'image/jpeg' });
      setLoading(true);
      try {
        const res = await authAPI.updateAvatar(file);
        if (res.success && res.avatar) {
          setLocalAvatar(res.avatar);
          dataCtx?.updateUserAvatar?.(res.avatar);
          if (onSuccess) onSuccess(res.avatar);
          toast.success('Đã thay đổi ảnh đại diện thành công!');
          setCropSource(null);
        }
      } catch (err) {
        const isNet = !!err?.isNetworkError || err?.name === 'NetworkOfflineError';
        toast.error(
          isNet
            ? 'Không tải được ảnh đại diện — mất kết nối máy chủ. Thử lại hoặc chọn ảnh nhỏ hơn (tối đa 5MB).'
            : (err.message || 'Thay đổi ảnh đại diện thất bại'),
        );
      } finally {
        setLoading(false);
      }
    }, 'image/jpeg', 0.92);
  };

  const startCropDrag = (event) => {
    if (loading) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset: cropOffset,
    };
  };

  const moveCropDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCropOffset({
      x: drag.offset.x + event.clientX - drag.x,
      y: drag.offset.y + event.clientY - drag.y,
    });
  };

  const stopCropDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative ${editable ? 'cursor-pointer' : ''} overflow-hidden select-none ${className}`}
      title={editable ? 'Rê vào và bấm để đổi ảnh đại diện' : name || 'Avatar'}
    >
      {editable && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}
      {cropSource && cropImage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => !loading && setCropSource(null)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-900">Căn chỉnh ảnh đại diện</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Kéo ảnh để đưa khuôn mặt vào giữa khung tròn</p>
              </div>
              <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setCropSource(null)} disabled={loading} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>
            <div
              className="relative mx-auto h-[240px] w-[240px] cursor-move overflow-hidden rounded-full bg-slate-100 ring-4 ring-slate-200 touch-none"
              onPointerDown={startCropDrag}
              onPointerMove={moveCropDrag}
              onPointerUp={stopCropDrag}
              onPointerCancel={stopCropDrag}
              onPointerLeave={stopCropDrag}
            >
              <img src={cropSource} alt="Xem trước ảnh đại diện" className="pointer-events-none absolute max-w-none select-none" style={cropImageStyle} draggable="false" />
              <span className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" />
            </div>
            <div className="mt-4">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                <Move size={14} />
                Phóng to / thu nhỏ
              </label>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={cropZoom}
                onChange={(event) => setCropZoom(Number(event.target.value))}
                className="mt-2 w-full accent-red-600"
                aria-label="Mức phóng ảnh"
              />
            </div>
            <div className="mt-4 flex justify-between gap-2">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100" onClick={() => { setCropZoom(1); setCropOffset({ x: 0, y: 0 }); }} disabled={loading}>
                <RotateCcw size={14} /> Đặt lại
              </button>
              <div className="flex gap-2">
                <button type="button" className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100" onClick={() => setCropSource(null)} disabled={loading}>Hủy</button>
                <button type="button" className="rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50" onClick={finishCrop} disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : 'Lưu ảnh'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <img
        key={displayAvatar}
        src={displayAvatar}
        alt={name || 'Avatar'}
        className={`w-full h-full object-cover transition-transform duration-300 ${editable ? 'group-hover:scale-105' : ''} ${imgClassName}`}
      />
      {editable && (
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center text-center text-white z-10 p-0.5 pointer-events-none">
          {loading ? (
            <Loader2 size={16} className="animate-spin text-white shrink-0" />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full text-center leading-none gap-0.5">
              <Camera size={15} className="drop-shadow text-white shrink-0" />
              <span className="text-[9px] font-extrabold tracking-tight text-white drop-shadow text-center block w-full whitespace-nowrap leading-none">Đổi ảnh</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
