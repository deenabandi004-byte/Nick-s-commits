import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const EXIT_KEY = 'exitIntentShown';
const BEEHIIV_KEY = 'beehiiv_popup_shown';

const ExitIntentPopup = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(EXIT_KEY)) return;

    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY > 0) return;
      if (sessionStorage.getItem(BEEHIIV_KEY)) return;
      if (sessionStorage.getItem(EXIT_KEY)) return;

      sessionStorage.setItem(EXIT_KEY, '1');
      setVisible(true);
    };

    document.addEventListener('mouseout', onMouseLeave);
    return () => document.removeEventListener('mouseout', onMouseLeave);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onClick={() => setVisible(false)}
    >
      <div
        className="relative w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setVisible(false)}
          className="absolute right-3 top-3 z-10 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="px-6 pt-6 pb-2 text-center">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            Wait - before you go
          </h2>
          <p className="mt-2 text-sm text-gray-500 sm:text-base">
            Grab the free Cold Email Playbook used by students who landed at McKinsey, Goldman &amp; Google.
          </p>
        </div>

        <iframe
          src="https://subscribe-forms.beehiiv.com/e92d2565-d9af-4a75-bc9f-fcf4d0c6e952"
          className="beehiiv-embed"
          frameBorder="0"
          scrolling="no"
          style={{
            width: '100%',
            minHeight: 320,
            maxWidth: '100%',
            backgroundColor: 'transparent',
          }}
        />
      </div>
    </div>
  );
};

export default ExitIntentPopup;
