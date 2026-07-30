import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Check, X, Crop, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onCropComplete: (croppedDataUrl: string) => void;
  outputSize?: number; // Tamanho ideal da imagem final em pixels (default: 300px)
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
  outputSize = 300
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Carrega a imagem e reseta transformações quando a foto muda
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgElement(img);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  if (!isOpen || !imageSrc) return null;

  // Handlers para arrastar (Drag / Pan)
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setOffset({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleConfirmCrop = () => {
    if (!imgElement) return;

    // Criar canvas na resolução exata essencial para o sistema (ex: 300x300)
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Preencher fundo com branco caso seja transparente
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, outputSize, outputSize);

    // Salvar contexto antes das transformações
    ctx.save();

    // Mover para o centro do canvas para rotação e escalonamento
    ctx.translate(outputSize / 2, outputSize / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    // Calcular proporção de renderização
    const containerWidth = 280; // tamanho do container visual de crop
    const scaleFactor = outputSize / containerWidth;

    const drawX = offset.x * scaleFactor;
    const drawY = offset.y * scaleFactor;

    // Ajustar para caber a imagem mantendo aspect ratio
    const aspect = imgElement.width / imgElement.height;
    let renderW = outputSize;
    let renderH = outputSize;

    if (aspect > 1) {
      renderW = outputSize * aspect;
    } else {
      renderH = outputSize / aspect;
    }

    ctx.drawImage(
      imgElement,
      -renderW / 2 + drawX,
      -renderH / 2 + drawY,
      renderW,
      renderH
    );

    ctx.restore();

    // Exportar obrigatoriamente como JPEG de alta qualidade e peso leve (~0.88)
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onCropComplete(jpegDataUrl);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <Crop size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg leading-tight">Ajustar Logo da Barbearia</h3>
                <p className="text-xs text-slate-500 font-medium">Formato JPEG otimizado ({outputSize}x{outputSize}px)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Canvas Frame de Crop / Redimensionamento */}
          <div className="my-6 flex flex-col items-center">
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleMouseDown}
              onTouchMove={handleMouseMove}
              onTouchEnd={handleMouseUp}
              className="w-[280px] h-[280px] bg-slate-900 rounded-3xl overflow-hidden relative cursor-move select-none border-4 border-amber-500/30 shadow-inner flex items-center justify-center group"
            >
              {/* Overlay com grid de enquadramento */}
              <div className="absolute inset-0 pointer-events-none z-10 grid grid-cols-3 grid-rows-3 border border-white/20">
                <div className="border-r border-b border-white/10" />
                <div className="border-r border-b border-white/10" />
                <div className="border-b border-white/10" />
                <div className="border-r border-b border-white/10" />
                <div className="border-r border-b border-white/10" />
                <div className="border-b border-white/10" />
                <div className="border-r border-white/10" />
                <div className="border-r border-white/10" />
                <div />
              </div>

              {/* Dica de arraste */}
              <div className="absolute top-3 left-3 z-20 bg-slate-950/70 text-white text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm pointer-events-none opacity-80 group-hover:opacity-100 transition">
                Arraste para enquadrar
              </div>

              {/* Renderização da foto sob transformações */}
              {imgElement && (
                <div
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                  }}
                  className="w-full h-full flex items-center justify-center pointer-events-none"
                >
                  <img
                    src={imageSrc}
                    alt="Preview"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              )}
            </div>

            {/* Controles de Zoom e Rotação */}
            <div className="w-full space-y-4 mt-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              {/* Zoom Slider */}
              <div className="flex items-center gap-3">
                <ZoomOut size={16} className="text-slate-400 shrink-0" />
                <input
                  type="range"
                  min="0.8"
                  max="3.0"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <ZoomIn size={16} className="text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-700 w-12 text-right">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              {/* Botões auxiliares */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-100 transition shadow-sm active:scale-95"
                >
                  <RotateCw size={14} className="text-amber-500" />
                  Girar 90°
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setZoom(1);
                    setRotation(0);
                    setOffset({ x: 0, y: 0 });
                  }}
                  className="text-slate-500 hover:text-slate-800 font-medium underline text-[11px]"
                >
                  Redefinir Posição
                </button>
              </div>
            </div>
          </div>

          {/* Notice sobre compressão JPEG */}
          <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/60 p-3 rounded-xl mb-6">
            <Sparkles size={16} className="shrink-0 text-amber-500" />
            <span>
              A foto será processada e convertida em <strong>JPEG leve (300x300px)</strong> para carregamento ultra-rápido no painel e na landing page.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmCrop}
              className="px-6 py-2.5 rounded-xl font-black text-xs text-slate-950 bg-amber-500 hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 flex items-center gap-2 active:scale-95"
            >
              <Check size={16} />
              Confirmar e Salvar Logo
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
