// Модальное окно для ввода и сохранения электронной подписи пользователя.
import { useState } from 'react';
import { SignaturePad } from './SignaturePad';
import { api } from '../lib/api';
import { Loader2, PenTool } from 'lucide-react';

interface SignatureModalProps {
  lang: 'kz' | 'ru';
  onComplete: () => void;
}

export function SignatureModal({ lang, onComplete }: SignatureModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (signatureData: string) => {
    setSaving(true);
    setError('');
    try {
      await api.post('/api/signatures/me', { signature_data: signatureData });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Қате' : 'Ошибка'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <PenTool size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {lang === 'kz' ? 'Қолтаңбаңызды қойыңыз' : 'Поставьте вашу подпись'}
            </h2>
            <p className="text-sm text-gray-500">
              {lang === 'kz'
                ? 'Құжаттарда пайдалану үшін қолтаңбаңызды салыңыз'
                : 'Нарисуйте подпись для использования в документах'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {saving ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={32} className="animate-spin text-primary-600" />
          </div>
        ) : (
          <SignaturePad lang={lang} onSave={handleSave} />
        )}

        <p className="mt-4 text-xs text-gray-400 text-center">
          {lang === 'kz'
            ? 'Қолтаңбаны кейін баптауларда өзгерте аласыз'
            : 'Подпись можно изменить позже в настройках'}
        </p>
      </div>
    </div>
  );
}
